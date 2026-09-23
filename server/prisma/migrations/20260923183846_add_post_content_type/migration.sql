-- CreateEnum
CREATE TYPE "PostContentType" AS ENUM ('FEED', 'STORY');

-- AlterTable
ALTER TABLE "PostDispatch" ADD COLUMN     "contentType" "PostContentType" NOT NULL DEFAULT 'FEED';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "trialEndsAt" SET DEFAULT (now() + interval '3 days');
