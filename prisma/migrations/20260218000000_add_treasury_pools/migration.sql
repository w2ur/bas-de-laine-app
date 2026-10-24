-- AlterEnum
ALTER TYPE "treasury_adjustment_type" ADD VALUE 'REFRESH';

-- CreateEnum
CREATE TYPE "treasury_availability" AS ENUM ('IMMEDIATE', 'SHORT', 'LONG');

-- CreateTable
CREATE TABLE "treasury_pools" (
    "id" TEXT NOT NULL,
    "treasury_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "availability" "treasury_availability" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasury_pools_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "treasury_pools" ADD CONSTRAINT "treasury_pools_treasury_id_fkey" FOREIGN KEY ("treasury_id") REFERENCES "treasuries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
