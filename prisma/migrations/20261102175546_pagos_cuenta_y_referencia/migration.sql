-- CreateEnum
CREATE TYPE "MoneyAccount" AS ENUM ('CASH', 'BANK', 'ATC_PEYA');

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "account" "MoneyAccount" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "reference" TEXT;

-- CreateIndex
CREATE INDEX "SupplierPayment_account_idx" ON "SupplierPayment"("account");

-- Pagos ya registrados: la cuenta de origen sale del método (efectivo → Efectivo, transferencia/QR → Banco,
-- tarjeta → ATC / PeYa), igual que el valor por defecto del formulario.
UPDATE "SupplierPayment" SET "account" = 'BANK' WHERE "method" = 'TRANSFER';
UPDATE "SupplierPayment" SET "account" = 'ATC_PEYA' WHERE "method" = 'CARD';
