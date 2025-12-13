-- AlterTable
ALTER TABLE "theatre_allocations" ADD COLUMN     "anaestheticTechnicianId" TEXT,
ADD COLUMN     "anaesthetistConsultantId" TEXT,
ADD COLUMN     "anaesthetistRegistrarId" TEXT,
ADD COLUMN     "anaesthetistSeniorRegistrarId" TEXT,
ADD COLUMN     "circulatingNurseId" TEXT,
ADD COLUMN     "cleanerId" TEXT,
ADD COLUMN     "porterId" TEXT,
ADD COLUMN     "scrubNurseId" TEXT;

-- AddForeignKey
ALTER TABLE "theatre_allocations" ADD CONSTRAINT "theatre_allocations_scrubNurseId_fkey" FOREIGN KEY ("scrubNurseId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_allocations" ADD CONSTRAINT "theatre_allocations_circulatingNurseId_fkey" FOREIGN KEY ("circulatingNurseId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_allocations" ADD CONSTRAINT "theatre_allocations_anaestheticTechnicianId_fkey" FOREIGN KEY ("anaestheticTechnicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_allocations" ADD CONSTRAINT "theatre_allocations_anaesthetistConsultantId_fkey" FOREIGN KEY ("anaesthetistConsultantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_allocations" ADD CONSTRAINT "theatre_allocations_anaesthetistSeniorRegistrarId_fkey" FOREIGN KEY ("anaesthetistSeniorRegistrarId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_allocations" ADD CONSTRAINT "theatre_allocations_anaesthetistRegistrarId_fkey" FOREIGN KEY ("anaesthetistRegistrarId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_allocations" ADD CONSTRAINT "theatre_allocations_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theatre_allocations" ADD CONSTRAINT "theatre_allocations_porterId_fkey" FOREIGN KEY ("porterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
