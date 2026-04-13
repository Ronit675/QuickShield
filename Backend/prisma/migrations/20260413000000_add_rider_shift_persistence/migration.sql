ALTER TABLE "RiderProfile"
ADD COLUMN "workingHours" INTEGER,
ADD COLUMN "workingShiftLabel" TEXT,
ADD COLUMN "workingTimeSlots" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
