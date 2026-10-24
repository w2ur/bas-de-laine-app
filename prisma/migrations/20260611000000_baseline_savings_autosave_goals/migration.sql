-- Catch-up migration: baseline drift between committed migrations and schema.prisma.
-- Covers: envelope_type enum, TRANSFER_IN/TRANSFER_OUT, goal envelope columns,
--         linked_transaction_id, savings_accounts, savings_deposits, auto_save_logs,
--         notifications, and missing FK indexes (finding 38).
-- Safe to run against a fresh DB (after the two prior migrations) or to mark
-- resolved on production with: npx prisma migrate resolve --applied 20260611000000_baseline_savings_autosave_goals

-- CreateEnum
CREATE TYPE "envelope_type" AS ENUM ('BUDGET', 'GOAL');

-- AlterEnum
ALTER TYPE "envelope_transaction_type" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "envelope_transaction_type" ADD VALUE 'TRANSFER_OUT';

-- AlterTable: add goal columns to envelopes
ALTER TABLE "envelopes"
    ADD COLUMN "type" "envelope_type" NOT NULL DEFAULT 'BUDGET',
    ADD COLUMN "target_amount" DECIMAL(12,2),
    ADD COLUMN "target_date" DATE;

-- AlterTable: make monthly_budget nullable (schema declares Decimal? with default 0)
ALTER TABLE "envelopes"
    ALTER COLUMN "monthly_budget" DROP NOT NULL;

-- AlterTable: add linked_transaction_id to envelope_transactions
ALTER TABLE "envelope_transactions"
    ADD COLUMN "linked_transaction_id" TEXT;

-- CreateIndex: unique constraint on linked_transaction_id
CREATE UNIQUE INDEX "envelope_transactions_linked_transaction_id_key"
    ON "envelope_transactions"("linked_transaction_id");

-- AddForeignKey: self-referencing FK for transfer links
ALTER TABLE "envelope_transactions"
    ADD CONSTRAINT "envelope_transactions_linked_transaction_id_fkey"
    FOREIGN KEY ("linked_transaction_id")
    REFERENCES "envelope_transactions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: savings_accounts
CREATE TABLE "savings_accounts" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: savings_deposits
CREATE TABLE "savings_deposits" (
    "id" TEXT NOT NULL,
    "savings_account_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "label" TEXT,
    "month_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable: auto_save_logs
CREATE TABLE "auto_save_logs" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "month_key" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_save_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: notifications
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "month_key" TEXT NOT NULL,
    "payload" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique on savings_accounts.household_id
CREATE UNIQUE INDEX "savings_accounts_household_id_key"
    ON "savings_accounts"("household_id");

-- CreateIndex: unique on auto_save_logs (household_id, month_key) — idempotency constraint
CREATE UNIQUE INDEX "auto_save_logs_household_id_month_key_key"
    ON "auto_save_logs"("household_id", "month_key");

-- CreateIndex: unique on notifications (user_id, type, month_key)
CREATE UNIQUE INDEX "notifications_user_id_type_month_key_key"
    ON "notifications"("user_id", "type", "month_key");

-- AddForeignKey: savings_accounts -> households
ALTER TABLE "savings_accounts"
    ADD CONSTRAINT "savings_accounts_household_id_fkey"
    FOREIGN KEY ("household_id")
    REFERENCES "households"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: savings_deposits -> savings_accounts
ALTER TABLE "savings_deposits"
    ADD CONSTRAINT "savings_deposits_savings_account_id_fkey"
    FOREIGN KEY ("savings_account_id")
    REFERENCES "savings_accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: auto_save_logs -> households
ALTER TABLE "auto_save_logs"
    ADD CONSTRAINT "auto_save_logs_household_id_fkey"
    FOREIGN KEY ("household_id")
    REFERENCES "households"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: notifications -> users
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (finding 38): FK indexes for hot household-scoped queries
CREATE INDEX "users_household_id_idx" ON "users"("household_id");
CREATE INDEX "recurring_charges_household_id_idx" ON "recurring_charges"("household_id");
CREATE INDEX "treasury_adjustments_treasury_id_idx" ON "treasury_adjustments"("treasury_id");
CREATE INDEX "treasury_pools_treasury_id_idx" ON "treasury_pools"("treasury_id");
CREATE INDEX "savings_deposits_savings_account_id_idx" ON "savings_deposits"("savings_account_id");
