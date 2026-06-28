-- DropIndex
DROP INDEX "roster_normalized_name_trgm";

-- AlterTable
ALTER TABLE "Enrollee" ADD COLUMN     "groupName" TEXT;
