// ============================================================
// Which session cookie to use, and when it may be marked Secure
// ------------------------------------------------------------
// This existed as two `process.env.NODE_ENV === "production"` checks inline in
// authOptions, and it made sign-in IMPOSSIBLE on the hospital's local server.
//
// The local server runs `next start` behind PM2, so NODE_ENV is "production",
// but it is served over plain http on a LAN address. Under the old rule that
// produced a cookie named `__Secure-next-auth.session-token` with secure: true.
// Both halves of that are fatal over http:
//
//   * The `__Secure-` prefix is defined by the cookie-prefixes spec to be
//     REJECTED by the browser unless the cookie was set over a secure channel.
//   * `secure: true` independently stops the browser storing or sending it.
//
// The failure is silent and reads as a password problem: the credentials POST
// succeeds, the server sets a cookie the browser throws away, and every
// subsequent request arrives with no session and is answered 401. On Vercel it
// worked perfectly, because Vercel is https — so the bug only ever appeared on
// the deployment nobody was testing.
//
// NODE_ENV describes HOW THE APP WAS BUILT. Whether a cookie can be Secure
// depends on HOW IT IS SERVED. Those are different questions, and production
// over http on a hospital LAN is a legitimate answer to the second.
//
// So this follows NextAuth's own rule — it derives `useSecureCookies` from the
// NEXTAUTH_URL scheme — which also keeps the session cookie consistent with the
// CSRF cookie NextAuth manages itself. Divergence there was exactly the "subtle
// mismatch between sign-in and getServerSession" the original comment worried
// about, and pinning to NODE_ENV caused it rather than preventing it.
// ============================================================

export interface SessionCookieConfig {
  name: string;
  secure: boolean;
}

/**
 * Decide the session cookie name and Secure flag from the origin the app is
 * actually served on.
 *
 * @param nextAuthUrl the configured NEXTAUTH_URL. Anything that is not
 *   explicitly `https://` is treated as insecure — including an unset value,
 *   because guessing "secure" wrongly makes sign-in impossible, while guessing
 *   "insecure" wrongly only forgoes a hardening measure on a URL that was
 *   never configured.
 */
export function sessionCookieConfig(nextAuthUrl: string | undefined | null): SessionCookieConfig {
  const secure = (nextAuthUrl ?? '').trim().toLowerCase().startsWith('https://');
  return {
    // The prefix and the flag must agree: a `__Secure-` name without secure:true
    // is rejected by the browser just the same.
    name: secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
    secure,
  };
}
