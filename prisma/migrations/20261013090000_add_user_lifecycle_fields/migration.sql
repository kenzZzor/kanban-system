-- Enable case-insensitive text for user emails.
CREATE EXTENSION IF NOT EXISTS citext;

-- Add user lifecycle activity events.
ALTER TYPE "ActivityType" ADD VALUE 'USER_ACCOUNT_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'USER_ACCOUNT_DEACTIVATED';
ALTER TYPE "ActivityType" ADD VALUE 'USER_ACCOUNT_REACTIVATED';
ALTER TYPE "ActivityType" ADD VALUE 'USER_PASSWORD_RESET';

-- Add fields required for temporary password lifecycle.
ALTER TABLE "User"
  ADD COLUMN "passwordMustChange" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "temporaryPasswordExpiresAt" TIMESTAMP(3),
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- Preserve existing email values while making uniqueness case-insensitive.
ALTER TABLE "User"
  ALTER COLUMN "email" TYPE CITEXT USING "email"::citext;
