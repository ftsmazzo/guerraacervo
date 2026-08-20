DO $$ BEGIN
  ALTER TYPE "product" ADD VALUE IF NOT EXISTS 'library';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
