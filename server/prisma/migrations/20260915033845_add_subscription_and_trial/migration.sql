-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trial', 'active', 'expired');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + interval '3 days');
