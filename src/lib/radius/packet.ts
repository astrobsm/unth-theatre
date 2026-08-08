// ============================================================
// RADIUS, the small part of it that a hotspot needs (RFC 2865/2869)
// ------------------------------------------------------------
// The MikroTik hotspot asks a RADIUS server whether a person may join the
// network. This encodes and decodes those packets so the answer can come from
// the ORM database — the same check the application itself uses.
//
// Written by hand rather than pulled from a package, for two reasons: it is
// about two hundred lines of a well-specified format, and it has to run on a
// hospital server that may be offline when someone needs to reinstall it. A
// dependency that cannot be fetched during an outage is a liability in exactly
// the situation this whole system exists for.
//
// PAP, NOT CHAP. MikroTik would normally hash the password in the browser
// against a challenge, so it never crosses the wire. Verifying CHAP requires
// the server to hold the PLAINTEXT password, and we hold bcrypt hashes —
// storing plaintext to enable CHAP would be a far worse trade than the one we
// make here. So the hotspot is configured for PAP, the password arrives
// encrypted under the shared secret, and the air link is protected by WPA2
// instead. See scripts/local-server/README.md.
// ============================================================

import crypto from 'crypto';

export const ACCESS_REQUEST = 1;
export const ACCESS_ACCEPT = 2;
export const ACCESS_REJECT = 3;

export const ATTR_USER_NAME = 1;
export const ATTR_USER_PASSWORD = 2;
export const ATTR_NAS_IP_ADDRESS = 4;
export const ATTR_REPLY_MESSAGE = 18;
export const ATTR_CALLING_STATION_ID = 31; // the client's MAC, as MikroTik sends it
export const ATTR_SESSION_TIMEOUT = 27;
export const ATTR_MESSAGE_AUTHENTICATOR = 80;

const HEADER_LENGTH = 20;
const AUTHENTICATOR_LENGTH = 16;
/** RFC 2865: a packet may not exceed 4096 octets. */
const MAX_PACKET = 4096;

export interface RadiusAttribute {
  type: number;
  value: Buffer;
}

export interface RadiusPacket {
  code: number;
  identifier: number;
  authenticator: Buffer;
  attributes: RadiusAttribute[];
}

/**
 * Parse a datagram.
 *
 * Returns null for anything malformed rather than throwing: this reads from a
 * UDP socket that anything on the network can send to, so a bad packet is an
 * ordinary event and must never take the service down.
 */
export function decodePacket(buf: Buffer): RadiusPacket | null {
  if (!Buffer.isBuffer(buf) || buf.length < HEADER_LENGTH || buf.length > MAX_PACKET) return null;

  const declared = buf.readUInt16BE(2);
  // The declared length is authoritative; trailing bytes are ignored, but a
  // packet claiming to be longer than it is cannot be trusted at all.
  if (declared < HEADER_LENGTH || declared > buf.length) return null;

  const attributes: RadiusAttribute[] = [];
  let offset = HEADER_LENGTH;
  while (offset < declared) {
    // Every attribute is at least a type and a length.
    if (offset + 2 > declared) return null;
    const type = buf[offset];
    const length = buf[offset + 1];
    // Length counts the two header octets, so anything under 2 would not
    // advance and would spin here forever.
    if (length < 2 || offset + length > declared) return null;
    attributes.push({ type, value: buf.subarray(offset + 2, offset + length) });
    offset += length;
  }

  return {
    code: buf[0],
    identifier: buf[1],
    authenticator: buf.subarray(4, 20),
    attributes,
  };
}

/** First attribute of a type, or null. */
export function getAttribute(packet: RadiusPacket, type: number): Buffer | null {
  const found = packet.attributes.find((a) => a.type === type);
  return found ? found.value : null;
}

/** First attribute of a type as UTF-8 text. */
export function getString(packet: RadiusPacket, type: number): string | null {
  const raw = getAttribute(packet, type);
  return raw === null ? null : raw.toString('utf8');
}

/**
 * Recover the password from a User-Password attribute (RFC 2865 §5.2).
 *
 * The client XORs the password against a keystream of MD5 digests:
 *
 *     b1 = MD5(secret + request-authenticator)   c1 = p1 XOR b1
 *     b2 = MD5(secret + c1)                      c2 = p2 XOR b2   ...
 *
 * Returns null when the attribute is not a whole number of 16-octet blocks,
 * which means it was not produced by a conforming client.
 */
export function decryptUserPassword(
  encrypted: Buffer,
  secret: string,
  requestAuthenticator: Buffer
): string | null {
  if (encrypted.length === 0 || encrypted.length % 16 !== 0) return null;
  if (encrypted.length > 128) return null; // RFC 2865 caps the password at 128

  const secretBuf = Buffer.from(secret, 'utf8');
  const out = Buffer.alloc(encrypted.length);
  let previous = requestAuthenticator;

  for (let i = 0; i < encrypted.length; i += 16) {
    const block = encrypted.subarray(i, i + 16);
    const key = crypto.createHash('md5').update(secretBuf).update(previous).digest();
    for (let j = 0; j < 16; j++) out[i + j] = block[j] ^ key[j];
    previous = block;
  }

  // The password is null-padded to a block boundary. Trailing NULs are padding
  // and are stripped; a NUL cannot appear inside a password.
  let end = out.length;
  while (end > 0 && out[end - 1] === 0) end--;
  return out.subarray(0, end).toString('utf8');
}

/** Encrypt a password the way a client does — used by the tests, and by nothing else. */
export function encryptUserPassword(
  password: string,
  secret: string,
  requestAuthenticator: Buffer
): Buffer {
  const plain = Buffer.from(password, 'utf8');
  const padded = Buffer.alloc(Math.max(16, Math.ceil(plain.length / 16) * 16));
  plain.copy(padded);

  const secretBuf = Buffer.from(secret, 'utf8');
  const out = Buffer.alloc(padded.length);
  let previous = requestAuthenticator;

  for (let i = 0; i < padded.length; i += 16) {
    const key = crypto.createHash('md5').update(secretBuf).update(previous).digest();
    for (let j = 0; j < 16; j++) out[i + j] = padded[i + j] ^ key[j];
    previous = out.subarray(i, i + 16);
  }
  return out;
}

/** Build one attribute. Values are truncated to the 253-octet maximum. */
export function attribute(type: number, value: Buffer | string | number): RadiusAttribute {
  let buf: Buffer;
  if (typeof value === 'number') {
    buf = Buffer.alloc(4);
    buf.writeUInt32BE(value >>> 0);
  } else if (typeof value === 'string') {
    buf = Buffer.from(value, 'utf8');
  } else {
    buf = value;
  }
  return { type, value: buf.length > 253 ? buf.subarray(0, 253) : buf };
}

function serialiseAttributes(attributes: RadiusAttribute[]): Buffer {
  return Buffer.concat(
    attributes.map((a) => Buffer.concat([Buffer.from([a.type, a.value.length + 2]), a.value]))
  );
}

/**
 * Build a reply.
 *
 * Two authenticators, computed in a specific order, and the order matters:
 *
 *   1. Message-Authenticator (RFC 2869) — HMAC-MD5 over the whole packet with
 *      its own field zeroed and the REQUEST authenticator in the header. Only
 *      included when the request carried one, which is how MikroTik indicates
 *      it will check it.
 *   2. Response Authenticator — MD5 over the finished packet plus the secret.
 *
 * Computing them the other way round produces a packet the client silently
 * discards, which looks exactly like the server never answering.
 */
export function encodeResponse(options: {
  code: number;
  identifier: number;
  requestAuthenticator: Buffer;
  secret: string;
  attributes?: RadiusAttribute[];
  /** Include a Message-Authenticator: pass true when the request had one. */
  includeMessageAuthenticator?: boolean;
}): Buffer {
  const { code, identifier, requestAuthenticator, secret } = options;
  const attrs = [...(options.attributes ?? [])];

  if (options.includeMessageAuthenticator) {
    attrs.push(attribute(ATTR_MESSAGE_AUTHENTICATOR, Buffer.alloc(16)));
  }

  const body = serialiseAttributes(attrs);
  const total = HEADER_LENGTH + body.length;

  const packet = Buffer.alloc(total);
  packet[0] = code;
  packet[1] = identifier;
  packet.writeUInt16BE(total, 2);
  requestAuthenticator.copy(packet, 4, 0, AUTHENTICATOR_LENGTH);
  body.copy(packet, HEADER_LENGTH);

  if (options.includeMessageAuthenticator) {
    // Its own 16 zero octets are already in place, which is what the HMAC is
    // defined to be computed over.
    const zeroedAt = total - 16;
    const mac = crypto.createHmac('md5', secret).update(packet).digest();
    mac.copy(packet, zeroedAt);
  }

  const responseAuthenticator = crypto
    .createHash('md5')
    .update(packet)
    .update(Buffer.from(secret, 'utf8'))
    .digest();
  responseAuthenticator.copy(packet, 4);

  return packet;
}

/**
 * Is this Access-Request's Message-Authenticator valid?
 *
 * Returns true when the attribute is absent — its absence is permitted for
 * PAP, and rejecting on that basis would refuse every request from a hotspot
 * that does not send one.
 */
export function verifyMessageAuthenticator(buf: Buffer, packet: RadiusPacket, secret: string): boolean {
  const offset = findAttributeOffset(buf, packet, ATTR_MESSAGE_AUTHENTICATOR);
  if (offset === -1) return true;

  const provided = buf.subarray(offset, offset + 16);
  const zeroed = Buffer.from(buf.subarray(0, buf.readUInt16BE(2)));
  zeroed.fill(0, offset, offset + 16);
  const expected = crypto.createHmac('md5', secret).update(zeroed).digest();
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

/** Byte offset of an attribute's VALUE within the original datagram, or -1. */
function findAttributeOffset(buf: Buffer, packet: RadiusPacket, type: number): number {
  const declared = buf.readUInt16BE(2);
  let offset = HEADER_LENGTH;
  while (offset + 2 <= declared) {
    const t = buf[offset];
    const length = buf[offset + 1];
    if (length < 2) return -1;
    if (t === type) return offset + 2;
    offset += length;
  }
  return -1;
}
