-- CreateTable
CREATE TABLE "CashOpening" (
    "id" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "openingCashCents" INTEGER NOT NULL,
    "notes" TEXT,
    "openedById" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashOpening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashOpening_businessDate_key" ON "CashOpening"("businessDate");
