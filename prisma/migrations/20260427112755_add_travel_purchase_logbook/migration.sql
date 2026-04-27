-- CreateTable
CREATE TABLE "TravelPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseDate" TEXT NOT NULL,
    "tripLabel" TEXT,
    "country" TEXT,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "totalCost" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'API_LOG',
    "sourceLogKey" TEXT,
    "notes" TEXT,

    CONSTRAINT "TravelPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelPurchase_userId_purchaseDate_idx" ON "TravelPurchase"("userId", "purchaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "TravelPurchase_userId_sourceLogKey_key" ON "TravelPurchase"("userId", "sourceLogKey");

-- AddForeignKey
ALTER TABLE "TravelPurchase" ADD CONSTRAINT "TravelPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
