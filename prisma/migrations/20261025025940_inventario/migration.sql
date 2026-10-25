-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('INITIAL', 'PURCHASE', 'PURCHASE_REVERSAL', 'PRODUCTION', 'SALE', 'SALE_REVERSAL', 'ADJUSTMENT', 'CONSUMPTION');

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCostCents" DECIMAL(14,4),
    "businessDate" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "refLineId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionEntry" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCostCents" DECIMAL(14,4),
    "date" TEXT NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "expected" DECIMAL(12,3) NOT NULL,
    "counted" DECIMAL(12,3) NOT NULL,
    "difference" DECIMAL(12,3) NOT NULL,
    "unitCostCents" DECIMAL(14,4),
    "reason" TEXT,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_productId_at_idx" ON "StockMovement"("productId", "at");

-- CreateIndex
CREATE INDEX "StockMovement_refType_refId_idx" ON "StockMovement"("refType", "refId");

-- CreateIndex
CREATE INDEX "StockMovement_refLineId_idx" ON "StockMovement"("refLineId");

-- CreateIndex
CREATE INDEX "StockMovement_businessDate_idx" ON "StockMovement"("businessDate");

-- CreateIndex
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");

-- CreateIndex
CREATE INDEX "ProductionEntry_date_idx" ON "ProductionEntry"("date");

-- CreateIndex
CREATE INDEX "StockCount_date_idx" ON "StockCount"("date");

-- CreateIndex
CREATE INDEX "StockCountLine_countId_idx" ON "StockCountLine"("countId");

-- CreateIndex
CREATE INDEX "StockCountLine_productId_idx" ON "StockCountLine"("productId");

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
