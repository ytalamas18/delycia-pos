-- CreateTable
CREATE TABLE "KitchenMessage" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "acknowledgedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KitchenMessage_acknowledgedAt_idx" ON "KitchenMessage"("acknowledgedAt");

-- CreateIndex
CREATE INDEX "KitchenMessage_createdAt_idx" ON "KitchenMessage"("createdAt");
