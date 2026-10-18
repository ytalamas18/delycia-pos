-- AlterTable
ALTER TABLE "KitchenTicket" ADD COLUMN     "voidAlertAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelAuthorizedById" TEXT,
ADD COLUMN     "cancelledById" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "voidAuthorizedById" TEXT;
