SELECT
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'onboarding_submissions') AS table_exists,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'onboarding_submissions'
       AND column_name = 'isContractStaff')      AS contract_col,
  (SELECT COUNT(*) FROM pg_enum
     WHERE enumlabel IN ('PLUMBING_SUPERVISOR','WATER_SUPPLY_SUPERVISOR','EMERGENCY_LAB_SCIENTIST')
       AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')) AS new_roles;
