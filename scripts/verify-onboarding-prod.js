const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const r = await p.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name='onboarding_submissions' AND column_name='isContractStaff')::int AS contract_col,
      (SELECT COUNT(*) FROM pg_enum
        WHERE enumlabel IN ('PLUMBING_SUPERVISOR','WATER_SUPPLY_SUPERVISOR','EMERGENCY_LAB_SCIENTIST')
          AND enumtypid=(SELECT oid FROM pg_type WHERE typname='UserRole'))::int AS new_roles,
      (SELECT COUNT(*) FROM onboarding_submissions)::int AS row_count
  `);
  console.log(r);
  await p.$disconnect();
})();
