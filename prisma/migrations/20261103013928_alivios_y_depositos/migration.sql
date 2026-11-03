-- CreateEnum
CREATE TYPE "WithdrawalKind" AS ENUM ('OWNER', 'RELIEF');

-- AlterEnum
ALTER TYPE "MoneyAccount" ADD VALUE 'PENDING_DEPOSIT';

-- AlterTable
ALTER TABLE "CashWithdrawal" ADD COLUMN     "carriedById" TEXT,
ADD COLUMN     "depositId" TEXT,
ADD COLUMN     "kind" "WithdrawalKind" NOT NULL DEFAULT 'OWNER';

-- CreateTable
CREATE TABLE "BankDeposit" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reliefsCents" INTEGER NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "differenceReason" TEXT,
    "withdrawalIds" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,

    CONSTRAINT "BankDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankDeposit_date_idx" ON "BankDeposit"("date");

-- CreateIndex
CREATE INDEX "CashWithdrawal_depositId_idx" ON "CashWithdrawal"("depositId");

-- AddForeignKey
ALTER TABLE "CashWithdrawal" ADD CONSTRAINT "CashWithdrawal_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "BankDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
