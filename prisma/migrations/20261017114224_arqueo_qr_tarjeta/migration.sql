-- AlterTable
ALTER TABLE "CashClosing" ADD COLUMN     "countedCardCents" INTEGER,
ADD COLUMN     "countedQrCents" INTEGER,
ADD COLUMN     "expectedCardCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expectedQrCents" INTEGER NOT NULL DEFAULT 0;
