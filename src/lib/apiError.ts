import { NextResponse } from 'next/server';

/**
 * Turn a thrown error into a 500 that still says what went wrong.
 *
 * Written because three separate faults in this system were prolonged by
 * handlers that caught a real error and returned "Internal server error".
 * A generic 500 in a browser console is indistinguishable from a database
 * outage, a missing column, a null dereference and a pool timeout — so the
 * only way to tell them apart was to guess, and guessing cost days.
 *
 * What is safe to send back:
 *   - the Prisma error code (P2021, P2024, …), which names the fault exactly
 *   - the first line of the message
 *   - nothing else: no stack, no query, no connection string
 *
 * Prisma puts table and column names in messages, which is a schema detail
 * rather than patient data, and this API is behind authentication in every
 * caller. The full error, stack included, still goes to the server log.
 */

/** Message fragments that must never reach a browser. */
const SECRET_HINTS = [/postgres(ql)?:\/\//i, /password/i, /secret/i, /token=/i];

export function errorDetail(err: unknown): { code?: string; detail: string } {
  const anyErr = err as { code?: unknown; message?: unknown } | null;
  const code = typeof anyErr?.code === 'string' ? anyErr.code : undefined;

  const raw = typeof anyErr?.message === 'string' ? anyErr.message : String(err ?? '');
  // Prisma messages are several lines of formatted output; the first
  // non-empty line carries the cause and the rest is decoration.
  const firstLine = raw.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';

  const detail = SECRET_HINTS.some((re) => re.test(firstLine))
    ? 'Database connection error.'
    : firstLine.slice(0, 300);

  return { code, detail };
}

/**
 * Log in full, respond with enough to diagnose.
 *
 * @param where  a tag identifying the route, so the server log can be searched
 */
export function apiError(where: string, err: unknown) {
  console.error(`[${where}]`, err);
  const { code, detail } = errorDetail(err);
  return NextResponse.json(
    {
      error: 'Internal server error',
      // The two fields that make a 500 actionable rather than mysterious.
      code,
      detail,
      where,
    },
    { status: 500 },
  );
}

/**
 * Wrap a route handler so an unexpected throw is reported rather than turned
 * into an opaque framework 500.
 */
export function withApiError<A extends unknown[]>(
  where: string,
  handler: (...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      return apiError(where, err);
    }
  };
}
