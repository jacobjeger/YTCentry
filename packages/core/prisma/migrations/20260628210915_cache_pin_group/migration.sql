-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "groupsJson" JSONB,
ADD COLUMN     "schedulesJson" JSONB;

-- AlterTable
ALTER TABLE "DeviceUserCache" ADD COLUMN     "groupName" TEXT,
ADD COLUMN     "pin" TEXT;
