-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'MANAGER_CHANGED';
ALTER TYPE "ActivityType" ADD VALUE 'MEMBER_REMOVED';
ALTER TYPE "ActivityType" ADD VALUE 'USER_LOGGED_IN';

-- DropForeignKey
ALTER TABLE "ActivityLog" DROP CONSTRAINT "ActivityLog_taskId_fkey";

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "DepartmentMember" ADD COLUMN     "leftAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ActivityLog_departmentId_createdAt_idx" ON "ActivityLog"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "DepartmentMember_departmentId_leftAt_idx" ON "DepartmentMember"("departmentId", "leftAt");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
