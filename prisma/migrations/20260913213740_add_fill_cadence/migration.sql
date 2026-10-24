-- CreateEnum
CREATE TYPE "fill_cadence" AS ENUM ('WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "envelopes" ADD COLUMN     "fill_cadence" "fill_cadence" NOT NULL DEFAULT 'WEEKLY';
