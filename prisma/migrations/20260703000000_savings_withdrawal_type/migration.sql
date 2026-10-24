-- Adds a movement type to the savings ledger so withdrawals can be recorded
-- alongside auto-save deposits. Amounts stay positive; the type carries the sign.
-- Existing rows are all deposits, hence the DEPOSIT default.

-- CreateEnum
CREATE TYPE "savings_transaction_type" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- AlterTable
ALTER TABLE "savings_deposits"
    ADD COLUMN "type" "savings_transaction_type" NOT NULL DEFAULT 'DEPOSIT';
