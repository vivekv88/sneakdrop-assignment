-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED', 'CANCELLED');
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'PROMOTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "totalPurchased" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Sneaker" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "totalStock" INTEGER NOT NULL,
  "availableStock" INTEGER NOT NULL,
  "soldStock" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Sneaker_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Sneaker_name_key" ON "Sneaker"("name");

CREATE TABLE "Hold" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sneakerId" TEXT NOT NULL,
  "status" "HoldStatus" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Hold_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Hold_status_expiresAt_idx" ON "Hold"("status", "expiresAt");
CREATE INDEX "Hold_userId_sneakerId_status_idx" ON "Hold"("userId", "sneakerId", "status");
CREATE UNIQUE INDEX "Hold_active_user_sneaker_key" ON "Hold"("userId", "sneakerId") WHERE "status" = 'ACTIVE';

CREATE TABLE "QueueEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sneakerId" TEXT NOT NULL,
  "status" "QueueStatus" NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QueueEntry_sneakerId_sequenceNumber_key" ON "QueueEntry"("sneakerId", "sequenceNumber");
CREATE INDEX "QueueEntry_userId_sneakerId_status_idx" ON "QueueEntry"("userId", "sneakerId", "status");
CREATE UNIQUE INDEX "QueueEntry_waiting_user_sneaker_key" ON "QueueEntry"("userId", "sneakerId") WHERE "status" = 'WAITING';

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "holdId" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_paymentId_key" ON "Payment"("paymentId");
CREATE UNIQUE INDEX "Payment_eventId_key" ON "Payment"("eventId");
CREATE UNIQUE INDEX "Payment_holdId_key" ON "Payment"("holdId");

CREATE TABLE "Purchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sneakerId" TEXT NOT NULL,
  "holdId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Purchase_holdId_key" ON "Purchase"("holdId");
CREATE UNIQUE INDEX "Purchase_paymentId_key" ON "Purchase"("paymentId");
CREATE INDEX "Purchase_userId_createdAt_idx" ON "Purchase"("userId", "createdAt");

ALTER TABLE "Hold" ADD CONSTRAINT "Hold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_sneakerId_fkey" FOREIGN KEY ("sneakerId") REFERENCES "Sneaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_sneakerId_fkey" FOREIGN KEY ("sneakerId") REFERENCES "Sneaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "Hold"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_sneakerId_fkey" FOREIGN KEY ("sneakerId") REFERENCES "Sneaker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "Hold"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("paymentId") ON DELETE CASCADE ON UPDATE CASCADE;
