DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'AdminRole'
  ) THEN
    CREATE TYPE "AdminRole" AS ENUM (
      'ADMIN',
      'FRAUD_REVIEWER',
      'CLAIMS_OFFICER',
      'ANALYTICS_LEAD',
      'SUPERADMIN'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Admin" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT,
  "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
  "canViewClaims" BOOLEAN NOT NULL DEFAULT true,
  "canApproveClaims" BOOLEAN NOT NULL DEFAULT false,
  "canManageAdmins" BOOLEAN NOT NULL DEFAULT false,
  "canViewAnalytics" BOOLEAN NOT NULL DEFAULT true,
  "canManagePricing" BOOLEAN NOT NULL DEFAULT false,
  "lastLoginAt" TIMESTAMP(3),
  "loginAttempts" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Admin_email_key" ON "Admin"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Admin_phone_key" ON "Admin"("phone");
CREATE INDEX IF NOT EXISTS "Admin_role_idx" ON "Admin"("role");
CREATE INDEX IF NOT EXISTS "Admin_isActive_idx" ON "Admin"("isActive");

CREATE TABLE IF NOT EXISTS "AdminActivityLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "details" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminActivityLog_adminId_idx" ON "AdminActivityLog"("adminId");
CREATE INDEX IF NOT EXISTS "AdminActivityLog_action_idx" ON "AdminActivityLog"("action");
CREATE INDEX IF NOT EXISTS "AdminActivityLog_resourceType_idx" ON "AdminActivityLog"("resourceType");
CREATE INDEX IF NOT EXISTS "AdminActivityLog_createdAt_idx" ON "AdminActivityLog"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AdminActivityLog_adminId_fkey'
  ) THEN
    ALTER TABLE "AdminActivityLog"
      ADD CONSTRAINT "AdminActivityLog_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "Admin"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
