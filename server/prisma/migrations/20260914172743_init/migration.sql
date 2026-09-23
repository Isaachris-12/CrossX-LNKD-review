-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'LINKEDIN', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "ConnectedAccountStatus" AS ENUM ('connected', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "PostDispatchStatus" AS ENUM ('pending', 'partial', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "PostTargetStatus" AS ENUM ('queued', 'posting', 'success', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "status" "ConnectedAccountStatus" NOT NULL DEFAULT 'connected',
    "dailyPostLimit" INTEGER NOT NULL DEFAULT 0,
    "dailyPostCount" INTEGER NOT NULL DEFAULT 0,
    "dailyCountResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostDispatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PostDispatchStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTarget" (
    "id" TEXT NOT NULL,
    "postDispatchId" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "PostTargetStatus" NOT NULL DEFAULT 'queued',
    "platformPostId" TEXT,
    "errorMessage" TEXT,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "PostTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "connectedAccountId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_userId_platform_platformUserId_key" ON "ConnectedAccount"("userId", "platform", "platformUserId");

-- CreateIndex
CREATE INDEX "PostDispatch_userId_idx" ON "PostDispatch"("userId");

-- CreateIndex
CREATE INDEX "PostTarget_postDispatchId_idx" ON "PostTarget"("postDispatchId");

-- CreateIndex
CREATE INDEX "PostTarget_connectedAccountId_idx" ON "PostTarget"("connectedAccountId");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_connectedAccountId_capturedAt_idx" ON "AnalyticsSnapshot"("connectedAccountId", "capturedAt");

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostDispatch" ADD CONSTRAINT "PostDispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTarget" ADD CONSTRAINT "PostTarget_postDispatchId_fkey" FOREIGN KEY ("postDispatchId") REFERENCES "PostDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTarget" ADD CONSTRAINT "PostTarget_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
