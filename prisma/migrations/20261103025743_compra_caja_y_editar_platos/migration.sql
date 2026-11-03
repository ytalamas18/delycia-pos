-- AlterTable
ALTER TABLE "KitchenTicket" ADD COLUMN     "changeAlertAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "KitchenTicketItem" ADD COLUMN     "changeNote" TEXT,
ADD COLUMN     "changedAt" TIMESTAMP(3);

-- Permiso nuevo "Compra en efectivo desde caja" para el rol de sistema Caja (el Admin lo tiene por código).
UPDATE "AccessRole"
SET "permissions" = array_append("permissions", 'purchases.cash'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "systemKey" = 'CASHIER' AND NOT ('purchases.cash' = ANY("permissions"));
