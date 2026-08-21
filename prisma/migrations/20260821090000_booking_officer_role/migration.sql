-- Departmental clerical staff who enter bookings on a surgeon's behalf.
--
-- The system had no clerical role at all: no ward clerk, no departmental
-- secretary, no booking officer. Booking had always been departmental work,
-- and with no way into the system for the people who used to do it, it fell to
-- the surgical residents by default.
--
-- IF NOT EXISTS because this is applied by hand to the theatre server and by
-- `prisma migrate deploy` to the cloud, and either may get there first.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'BOOKING_OFFICER';
