/**
 * The RADIUS wire format used by the Wi-Fi captive portal.
 *
 * This sits on a UDP socket that anything on the hospital network can send to,
 * so the parser is as much a security boundary as a decoder. Two properties
 * matter more than the happy path:
 *
 *   Malformed input must never crash the service or loop forever. A zero-length
 *   attribute would not advance the read offset, and an attacker sending one
 *   would hang the process — so that case is tested explicitly.
 *
 *   The password decryption must be verified against an INDEPENDENT
 *   implementation of RFC 2865 §5.2, not merely against our own encryptor run
 *   backwards, which would pass even if both halves were wrong in the same way.
 */
import { describe, expect, it } from 'vitest';
import crypto from 'crypto';

import {
  ACCESS_ACCEPT,
  ACCESS_REJECT,
  ACCESS_REQUEST,
  ATTR_MESSAGE_AUTHENTICATOR,
  ATTR_REPLY_MESSAGE,
  ATTR_USER_NAME,
  ATTR_USER_PASSWORD,
  attribute,
  decodePacket,
  decryptUserPassword,
  encodeResponse,
  encryptUserPassword,
  getAttribute,
  getString,
  verifyMessageAuthenticator,
} from '../../src/lib/radius/packet';

const SECRET = 'theatre-shared-secret';
const AUTH = Buffer.from('0123456789abcdef', 'utf8'); // 16 octets

/** Build an Access-Request the way a NAS would. */
function buildRequest(attrs: { type: number; value: Buffer }[], authenticator = AUTH): Buffer {
  const body = Buffer.concat(
    attrs.map((a) => Buffer.concat([Buffer.from([a.type, a.value.length + 2]), a.value]))
  );
  const buf = Buffer.alloc(20 + body.length);
  buf[0] = ACCESS_REQUEST;
  buf[1] = 42;
  buf.writeUInt16BE(buf.length, 2);
  authenticator.copy(buf, 4);
  body.copy(buf, 20);
  return buf;
}

describe('decoding', () => {
  it('reads the header and every attribute', () => {
    const buf = buildRequest([
      { type: ATTR_USER_NAME, value: Buffer.from('jdoe') },
      { type: ATTR_USER_PASSWORD, value: Buffer.alloc(16) },
    ]);
    const p = decodePacket(buf);
    expect(p?.code).toBe(ACCESS_REQUEST);
    expect(p?.identifier).toBe(42);
    expect(p?.authenticator.length).toBe(16);
    expect(getString(p!, ATTR_USER_NAME)).toBe('jdoe');
    expect(p?.attributes.length).toBe(2);
  });

  it('returns null rather than throwing on rubbish', () => {
    expect(decodePacket(Buffer.alloc(0))).toBeNull();
    expect(decodePacket(Buffer.alloc(19))).toBeNull();          // short header
    expect(decodePacket(Buffer.alloc(5000))).toBeNull();        // over 4096
    expect(decodePacket('not a buffer' as never)).toBeNull();
  });

  it('rejects a packet claiming to be longer than it is', () => {
    const buf = buildRequest([{ type: ATTR_USER_NAME, value: Buffer.from('x') }]);
    buf.writeUInt16BE(9999, 2);
    expect(decodePacket(buf)).toBeNull();
  });

  it('rejects an attribute whose length would not advance the parser', () => {
    // A declared length of 0 or 1 is the classic infinite-loop input: the
    // offset never moves and the service spins on one datagram forever.
    for (const badLength of [0, 1]) {
      const buf = Buffer.alloc(24);
      buf[0] = ACCESS_REQUEST;
      buf.writeUInt16BE(24, 2);
      buf[20] = ATTR_USER_NAME;
      buf[21] = badLength;
      expect(decodePacket(buf)).toBeNull();
    }
  });

  it('rejects an attribute that runs past the end of the packet', () => {
    const buf = Buffer.alloc(24);
    buf[0] = ACCESS_REQUEST;
    buf.writeUInt16BE(24, 2);
    buf[20] = ATTR_USER_NAME;
    buf[21] = 200;
    expect(decodePacket(buf)).toBeNull();
  });

  it('gives null for an attribute that is not present', () => {
    const p = decodePacket(buildRequest([{ type: ATTR_USER_NAME, value: Buffer.from('x') }]))!;
    expect(getAttribute(p, ATTR_USER_PASSWORD)).toBeNull();
    expect(getString(p, ATTR_USER_PASSWORD)).toBeNull();
  });
});

describe('the PAP password (RFC 2865 section 5.2)', () => {
  /**
   * An independent implementation, written straight from the RFC text, so the
   * decoder is checked against the specification rather than against itself:
   *   b1 = MD5(S + RA), c1 = p1 XOR b1;  b2 = MD5(S + c1), c2 = p2 XOR b2; ...
   */
  function rfcEncrypt(password: string, secret: string, ra: Buffer): Buffer {
    const p = Buffer.from(password, 'utf8');
    const blocks = Math.max(1, Math.ceil(p.length / 16));
    const padded = Buffer.alloc(blocks * 16);
    p.copy(padded);
    const out = Buffer.alloc(padded.length);
    let prev = ra;
    for (let i = 0; i < blocks; i++) {
      const b = crypto.createHash('md5').update(Buffer.from(secret)).update(prev).digest();
      for (let j = 0; j < 16; j++) out[i * 16 + j] = padded[i * 16 + j] ^ b[j];
      prev = out.subarray(i * 16, i * 16 + 16);
    }
    return out;
  }

  it('decrypts what an independent RFC implementation produced', () => {
    for (const password of ['x', 'correct horse', 'a'.repeat(16), 'a'.repeat(17), 'Ndu2026!']) {
      const cipher = rfcEncrypt(password, SECRET, AUTH);
      expect(decryptUserPassword(cipher, SECRET, AUTH)).toBe(password);
    }
  });

  it('our own encryptor agrees with the RFC one, block chaining included', () => {
    // Chaining is the easy thing to get wrong: block 2 keys off the CIPHERTEXT
    // of block 1, not the plaintext. A password over 16 characters is the only
    // input that can catch it.
    const long = 'this password is longer than one block';
    expect(encryptUserPassword(long, SECRET, AUTH).equals(rfcEncrypt(long, SECRET, AUTH))).toBe(true);
    expect(decryptUserPassword(encryptUserPassword(long, SECRET, AUTH), SECRET, AUTH)).toBe(long);
  });

  it('refuses lengths that no conforming client would send', () => {
    expect(decryptUserPassword(Buffer.alloc(0), SECRET, AUTH)).toBeNull();
    expect(decryptUserPassword(Buffer.alloc(17), SECRET, AUTH)).toBeNull();
    expect(decryptUserPassword(Buffer.alloc(144), SECRET, AUTH)).toBeNull();
  });

  it('yields a different password under a different secret', () => {
    const cipher = rfcEncrypt('letmein', SECRET, AUTH);
    expect(decryptUserPassword(cipher, 'a-different-secret', AUTH)).not.toBe('letmein');
  });
});

describe('replies', () => {
  it('stamps a Response Authenticator the client can verify', () => {
    const reply = encodeResponse({
      code: ACCESS_ACCEPT, identifier: 42, requestAuthenticator: AUTH, secret: SECRET,
    });
    expect(reply[0]).toBe(ACCESS_ACCEPT);
    expect(reply[1]).toBe(42);

    // Recompute the way a NAS does: MD5 over the packet with the REQUEST
    // authenticator in place, plus the secret.
    const check = Buffer.from(reply);
    AUTH.copy(check, 4);
    const expected = crypto.createHash('md5').update(check).update(Buffer.from(SECRET)).digest();
    expect(reply.subarray(4, 20).equals(expected)).toBe(true);
  });

  it('carries reply attributes', () => {
    const reply = encodeResponse({
      code: ACCESS_REJECT, identifier: 7, requestAuthenticator: AUTH, secret: SECRET,
      attributes: [attribute(ATTR_REPLY_MESSAGE, 'Incorrect password.')],
    });
    const parsed = decodePacket(reply)!;
    expect(parsed.code).toBe(ACCESS_REJECT);
    expect(getString(parsed, ATTR_REPLY_MESSAGE)).toBe('Incorrect password.');
  });

  it('includes a Message-Authenticator only when asked', () => {
    const without = decodePacket(encodeResponse({
      code: ACCESS_ACCEPT, identifier: 1, requestAuthenticator: AUTH, secret: SECRET,
    }))!;
    expect(getAttribute(without, ATTR_MESSAGE_AUTHENTICATOR)).toBeNull();

    const withIt = decodePacket(encodeResponse({
      code: ACCESS_ACCEPT, identifier: 1, requestAuthenticator: AUTH, secret: SECRET,
      includeMessageAuthenticator: true,
    }))!;
    expect(getAttribute(withIt, ATTR_MESSAGE_AUTHENTICATOR)?.length).toBe(16);
  });

  it('computes Message-Authenticator before the Response Authenticator', () => {
    // If the order were reversed the packet would be silently discarded by the
    // NAS, which is indistinguishable from the server never replying at all.
    // Verified by recomputing the HMAC the way a NAS does.
    const reply = encodeResponse({
      code: ACCESS_ACCEPT, identifier: 9, requestAuthenticator: AUTH, secret: SECRET,
      includeMessageAuthenticator: true,
    });
    const macOffset = reply.length - 16;
    const provided = Buffer.from(reply.subarray(macOffset));

    const zeroed = Buffer.from(reply);
    AUTH.copy(zeroed, 4);            // NAS substitutes the request authenticator
    zeroed.fill(0, macOffset, macOffset + 16);
    const expected = crypto.createHmac('md5', SECRET).update(zeroed).digest();
    expect(provided.equals(expected)).toBe(true);
  });

  it('truncates an over-long attribute rather than producing a corrupt packet', () => {
    const reply = encodeResponse({
      code: ACCESS_REJECT, identifier: 1, requestAuthenticator: AUTH, secret: SECRET,
      attributes: [attribute(ATTR_REPLY_MESSAGE, 'x'.repeat(400))],
    });
    expect(decodePacket(reply)).not.toBeNull();
    expect(getString(decodePacket(reply)!, ATTR_REPLY_MESSAGE)?.length).toBe(253);
  });
});

describe('verifying a request Message-Authenticator', () => {
  it('accepts a request that has none', () => {
    const buf = buildRequest([{ type: ATTR_USER_NAME, value: Buffer.from('jdoe') }]);
    expect(verifyMessageAuthenticator(buf, decodePacket(buf)!, SECRET)).toBe(true);
  });

  it('accepts a correct one and rejects a forged one', () => {
    // Build the request, then fill in the HMAC over itself with the field zeroed.
    const buf = buildRequest([
      { type: ATTR_USER_NAME, value: Buffer.from('jdoe') },
      { type: ATTR_MESSAGE_AUTHENTICATOR, value: Buffer.alloc(16) },
    ]);
    const macAt = buf.length - 16;
    const mac = crypto.createHmac('md5', SECRET).update(buf).digest();
    mac.copy(buf, macAt);
    expect(verifyMessageAuthenticator(buf, decodePacket(buf)!, SECRET)).toBe(true);

    buf[macAt] ^= 0xff;
    expect(verifyMessageAuthenticator(buf, decodePacket(buf)!, SECRET)).toBe(false);
  });
});
