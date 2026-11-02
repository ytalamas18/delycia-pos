-- CreateTable
CREATE TABLE "CashWithdrawal" (
    "id" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,

    CONSTRAINT "CashWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashWithdrawal_businessDate_idx" ON "CashWithdrawal"("businessDate");

-- Permiso nuevo "Retiro de efectivo" para el rol de sistema Caja (el Admin lo tiene por código).
UPDATE "AccessRole"
SET "permissions" = array_append("permissions", 'cash.withdraw'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "systemKey" = 'CASHIER' AND NOT ('cash.withdraw' = ANY("permissions"));
