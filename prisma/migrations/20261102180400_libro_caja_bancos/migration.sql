-- CreateTable
CREATE TABLE "AccountTransfer" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "fromAccount" "MoneyAccount" NOT NULL,
    "toAccount" "MoneyAccount" NOT NULL,
    "amountOutCents" INTEGER NOT NULL,
    "amountInCents" INTEGER NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,

    CONSTRAINT "AccountTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountOpeningBalance" (
    "id" TEXT NOT NULL,
    "account" "MoneyAccount" NOT NULL,
    "date" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,

    CONSTRAINT "AccountOpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountTransfer_date_idx" ON "AccountTransfer"("date");

-- CreateIndex
CREATE INDEX "AccountOpeningBalance_account_idx" ON "AccountOpeningBalance"("account");

-- Un solo saldo inicial vigente por cuenta (los anulados quedan como historial).
CREATE UNIQUE INDEX "AccountOpeningBalance_one_active_per_account" ON "AccountOpeningBalance"("account") WHERE "voidedAt" IS NULL;
