-- Least-privilege role used by the browser bundle. Its password is public once
-- deployed, so it can only touch the tasks table. Password is set by scripts/migrate.mjs.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cleaning_app') THEN
    CREATE ROLE cleaning_app LOGIN;
  END IF;
END $$;
REVOKE ALL ON SCHEMA public FROM cleaning_app;
GRANT USAGE ON SCHEMA public TO cleaning_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO cleaning_app;
ALTER ROLE cleaning_app SET statement_timeout = '5s';
