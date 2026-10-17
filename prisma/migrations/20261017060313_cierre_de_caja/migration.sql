-- CreateTable
CREATE TABLE "CashClosing" (
    "id" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "openingCashCents" INTEGER NOT NULL DEFAULT 0,
    "expectedCashCents" INTEGER NOT NULL,
    "countedCashCents" INTEGER NOT NULL,
    "differenceCents" INTEGER NOT NULL,
    "notes" TEXT,
    "summary" JSONB NOT NULL,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashClosing_businessDate_key" ON "CashClosing"("businessDate");
