-- AlterTable
ALTER TABLE "User" ADD COLUMN     "systemRoleId" TEXT;

-- CreateIndex
CREATE INDEX "User_systemRoleId_idx" ON "User"("systemRoleId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_systemRoleId_fkey" FOREIGN KEY ("systemRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
