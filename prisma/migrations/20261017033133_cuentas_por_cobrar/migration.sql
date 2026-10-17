-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "debtorName" TEXT,
ADD COLUMN     "settledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CreditCollection" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditCollection_paymentId_idx" ON "CreditCollection"("paymentId");

-- CreateIndex
CREATE INDEX "CreditCollection_createdAt_idx" ON "CreditCollection"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_settledAt_idx" ON "Payment"("settledAt");

-- AddForeignKey
ALTER TABLE "CreditCollection" ADD CONSTRAINT "CreditCollection_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
