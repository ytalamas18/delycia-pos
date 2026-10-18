-- CreateIndex
CREATE INDEX "Order_cancelledAt_idx" ON "Order"("cancelledAt");

-- CreateIndex
CREATE INDEX "OrderItem_voidedAt_idx" ON "OrderItem"("voidedAt");
