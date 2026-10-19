-- Fase 2 (spec-compras-inventario): recetas. Solo agrega tablas y una columna opcional.

-- CreateEnum
CREATE TYPE "RecipeCondition" AS ENUM ('ALWAYS', 'TAKEAWAY', 'DINE_IN');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "recipeYield" DECIMAL(12,3);

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "condition" "RecipeCondition" NOT NULL DEFAULT 'ALWAYS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModifierRecipeLine" (
    "id" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModifierRecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeLine_componentId_idx" ON "RecipeLine"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLine_productId_componentId_condition_key" ON "RecipeLine"("productId", "componentId", "condition");

-- CreateIndex
CREATE INDEX "ModifierRecipeLine_componentId_idx" ON "ModifierRecipeLine"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "ModifierRecipeLine_modifierId_componentId_key" ON "ModifierRecipeLine"("modifierId", "componentId");

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModifierRecipeLine" ADD CONSTRAINT "ModifierRecipeLine_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "ProductModifier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModifierRecipeLine" ADD CONSTRAINT "ModifierRecipeLine_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
