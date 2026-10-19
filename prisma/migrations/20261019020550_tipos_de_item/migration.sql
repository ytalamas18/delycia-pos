-- Fase 1 (spec-compras-inventario): solo AGREGA columnas con valor por defecto y una tabla nueva.
-- No toca ventas ni historial. Todo producto existente queda NORMAL, en UNIT y sin stock: el POS sigue igual.

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('NORMAL', 'PREPARED', 'INGREDIENT', 'SUPPLY');

-- CreateEnum
CREATE TYPE "BaseUnit" AS ENUM ('UNIT', 'KG', 'G', 'L', 'ML');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "baseUnit" "BaseUnit" NOT NULL DEFAULT 'UNIT',
ADD COLUMN     "lastCostAt" TIMESTAMP(3),
ADD COLUMN     "lastCostCents" DECIMAL(14,4),
ADD COLUMN     "minStock" DECIMAL(12,3),
ADD COLUMN     "tracksStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "ItemType" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "ProductPresentation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factor" DECIMAL(12,3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductPresentation_productId_name_key" ON "ProductPresentation"("productId", "name");

-- CreateIndex
CREATE INDEX "Product_type_idx" ON "Product"("type");

-- AddForeignKey
ALTER TABLE "ProductPresentation" ADD CONSTRAINT "ProductPresentation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
