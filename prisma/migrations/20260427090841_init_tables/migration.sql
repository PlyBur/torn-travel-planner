-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tornPlayerId" INTEGER,
    "playerName" TEXT,
    "apiKey" TEXT,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logType" TEXT NOT NULL,
    "message" TEXT,
    "amount" INTEGER,
    "timestamp" TIMESTAMP(3),

    CONSTRAINT "RawLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RawLog" ADD CONSTRAINT "RawLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
