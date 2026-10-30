import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * How many database connections ONE instance of this app may hold.
 *
 * Left to Prisma, the answer is `cpus * 2 + 1` per client. That is right for a
 * long-lived server and wrong for a serverless one, where every warm lambda
 * holds a pool of its own and nothing coordinates them. Thirty warm instances
 * at seven connections each is two hundred and ten, and the database stops at
 * two hundred.
 *
 * That is not hypothetical here. On 29 October a deploy failed outright with
 *
 *   [db-bootstrap] fatal: error: (EMAXCONN) max client connections reached, limit: 200
 *
 * and in the same hour a surgeon booking a case was shown "The server could
 * not complete this" three times — /api/patients/[id]/open-surgeries and
 * /api/roster/on-duty failing together, which is what connection starvation
 * looks like from a phone.
 *
 * CAPPED ONLY ON SERVERLESS. The theatre server runs this same code under pm2
 * as one long-lived process serving everybody in the building; a cap of two
 * there would serialise the whole hospital behind two connections. `VERCEL` is
 * set only in Vercel's build and runtime environment, so it is the honest test
 * for "is this one instance among many".
 *
 * TWO, NOT ONE. A few routes issue a `Promise.all` of two queries, and at a
 * limit of one those serialise. Two keeps them parallel while still leaving
 * room for roughly a hundred concurrent instances inside the ceiling.
 *
 * An operator who sets connection_limit in DATABASE_URL themselves wins:
 * their value is left alone, so moving to a pooler needs no code change.
 */
function serverlessPooledUrl(): string | undefined {
  const raw = process.env.DATABASE_URL
  if (!raw) return undefined
  if (!process.env.VERCEL) return undefined
  if (/[?&]connection_limit=/.test(raw)) return undefined

  const sep = raw.includes('?') ? '&' : '?'
  // pool_timeout above the 10s default: under a burst it is better to wait for
  // a connection than to fail a booking outright. A route that waits still
  // answers; a route that throws loses the surgeon's work.
  return `${raw}${sep}connection_limit=2&pool_timeout=20`
}

const datasourceUrl = serverlessPooledUrl()

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
})

// Persist across hot reloads in dev AND across warm invocations in production
globalForPrisma.prisma = prisma

export default prisma
