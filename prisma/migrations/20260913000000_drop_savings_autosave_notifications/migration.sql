-- Removes the auto-save engine and the savings ledger (savings_deposits,
-- savings_accounts, auto_save_logs) as well as notifications.
--
-- Destructive: the dropped tables lose their rows. Back up before deploying.

-- DropForeignKey: savings_deposits -> savings_accounts
ALTER TABLE "savings_deposits" DROP CONSTRAINT "savings_deposits_savings_account_id_fkey";

-- DropForeignKey: savings_accounts -> households
ALTER TABLE "savings_accounts" DROP CONSTRAINT "savings_accounts_household_id_fkey";

-- DropForeignKey: auto_save_logs -> households
ALTER TABLE "auto_save_logs" DROP CONSTRAINT "auto_save_logs_household_id_fkey";

-- DropForeignKey: notifications -> users
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropTable: savings_deposits (child of savings_accounts)
DROP TABLE "savings_deposits";

-- DropTable: savings_accounts
DROP TABLE "savings_accounts";

-- DropTable: auto_save_logs
DROP TABLE "auto_save_logs";

-- DropTable: notifications
DROP TABLE "notifications";

-- DropEnum: savings_transaction_type (only used by savings_deposits.type)
DROP TYPE "savings_transaction_type";
