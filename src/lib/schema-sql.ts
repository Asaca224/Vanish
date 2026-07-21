// AUTO-GENERATED from prisma/schema.prisma via `prisma migrate diff`.
// The full v3 schema DDL, embedded so /api/admin/migrate can apply it at runtime
// (the app can reach Neon even when local tooling cannot). Regenerate with:
//   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
export const V3_SCHEMA_SQL = `-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "ConfirmationSource" AS ENUM ('gmail', 'forwarding', 'none');

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('name', 'alias', 'email', 'phone', 'address_current', 'address_prior', 'dob', 'relative');

-- CreateEnum
CREATE TYPE "RemovalMethod" AS ENUM ('drop', 'email', 'web_form', 'postal', 'manual_only');

-- CreateEnum
CREATE TYPE "BrokerStatus" AS ENUM ('proposed', 'approved', 'live', 'retired', 'rejected');

-- CreateEnum
CREATE TYPE "BrokerSource" AS ENUM ('seed', 'ca_registry', 'discovery', 'manual');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('candidate', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('drop', 'email', 'web_form', 'postal');

-- CreateEnum
CREATE TYPE "RequestState" AS ENUM ('discovered', 'queued', 'in_progress', 'awaiting_user', 'awaiting_user_verification', 'submitted', 'awaiting_confirmation', 'confirmed', 'verifying', 'removed', 'exempt', 'failed', 'blocked', 'skipped_covered_by_drop');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('screenshot', 'email_ref', 'request_id', 'pdf');

-- CreateEnum
CREATE TYPE "DiscoveryTrigger" AS ENUM ('cron', 'admin');

-- CreateEnum
CREATE TYPE "CandidateDisposition" AS ENUM ('proposed', 'rejected', 'duplicate');

-- CreateEnum
CREATE TYPE "WorkerJobType" AS ENUM ('scan', 'web_form_removal', 'fetch_page');

-- CreateEnum
CREATE TYPE "WorkerJobState" AS ENUM ('queued', 'in_progress', 'done', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'user',
    "authorizationSignedAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "residencyState" TEXT,
    "confirmationSource" "ConfirmationSource" NOT NULL DEFAULT 'none',
    "forwardingToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "IdentityAttribute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AttributeType" NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "valueHash" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "profileUrl" TEXT,
    "matchedFields" JSONB,
    "matchConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ListingStatus" NOT NULL DEFAULT 'candidate',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemovalRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "listingId" TEXT,
    "channel" "Channel" NOT NULL,
    "state" "RequestState" NOT NULL DEFAULT 'discovered',
    "confirmationRequired" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "verifiedRemovedAt" TIMESTAMP(3),
    "nextRecheckAt" TIMESTAMP(3),
    "exemptReason" TEXT,
    "failureReason" TEXT,
    "channelSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL,
    "removalRequestId" TEXT NOT NULL,
    "fromState" "RequestState",
    "toState" "RequestState" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'drop',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestReference" TEXT,
    "coversBrokerIds" JSONB NOT NULL,
    "retrieveByAt" TIMESTAMP(3),
    "finalizeByAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "removalRequestId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "blobRef" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "optOutUrl" TEXT,
    "removalMethod" "RemovalMethod" NOT NULL,
    "requiresCaptcha" BOOLEAN NOT NULL DEFAULT false,
    "requiresId" BOOLEAN NOT NULL DEFAULT false,
    "confirmationEmailFrom" TEXT,
    "optOutEmail" TEXT,
    "recheckDays" INTEGER NOT NULL DEFAULT 30,
    "caRegistered" BOOLEAN NOT NULL DEFAULT false,
    "coveredByDrop" BOOLEAN NOT NULL DEFAULT false,
    "adapterKey" TEXT,
    "status" "BrokerStatus" NOT NULL DEFAULT 'proposed',
    "source" "BrokerSource" NOT NULL DEFAULT 'manual',
    "evidence" JSONB,
    "discoveryConfidence" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryCandidate" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "disposition" "CandidateDisposition" NOT NULL DEFAULT 'proposed',
    "runId" TEXT,

    CONSTRAINT "DiscoveryCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL,
    "trigger" "DiscoveryTrigger" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerJob" (
    "id" TEXT NOT NULL,
    "type" "WorkerJobType" NOT NULL,
    "payload" JSONB NOT NULL,
    "state" "WorkerJobState" NOT NULL DEFAULT 'queued',
    "result" JSONB,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_forwardingToken_key" ON "User"("forwardingToken");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "IdentityAttribute_userId_idx" ON "IdentityAttribute"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityAttribute_userId_type_valueHash_key" ON "IdentityAttribute"("userId", "type", "valueHash");

-- CreateIndex
CREATE INDEX "Listing_userId_idx" ON "Listing"("userId");

-- CreateIndex
CREATE INDEX "Listing_brokerId_idx" ON "Listing"("brokerId");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "RemovalRequest_userId_idx" ON "RemovalRequest"("userId");

-- CreateIndex
CREATE INDEX "RemovalRequest_state_idx" ON "RemovalRequest"("state");

-- CreateIndex
CREATE INDEX "RemovalRequest_nextRecheckAt_idx" ON "RemovalRequest"("nextRecheckAt");

-- CreateIndex
CREATE INDEX "RemovalRequest_channelSubmissionId_idx" ON "RemovalRequest"("channelSubmissionId");

-- CreateIndex
CREATE INDEX "RequestEvent_removalRequestId_idx" ON "RequestEvent"("removalRequestId");

-- CreateIndex
CREATE INDEX "ChannelSubmission_userId_idx" ON "ChannelSubmission"("userId");

-- CreateIndex
CREATE INDEX "Evidence_removalRequestId_idx" ON "Evidence"("removalRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Broker_domain_key" ON "Broker"("domain");

-- CreateIndex
CREATE INDEX "Broker_removalMethod_idx" ON "Broker"("removalMethod");

-- CreateIndex
CREATE INDEX "Broker_caRegistered_idx" ON "Broker"("caRegistered");

-- CreateIndex
CREATE INDEX "Broker_status_idx" ON "Broker"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryCandidate_domain_key" ON "DiscoveryCandidate"("domain");

-- CreateIndex
CREATE INDEX "DiscoveryCandidate_disposition_idx" ON "DiscoveryCandidate"("disposition");

-- CreateIndex
CREATE INDEX "DiscoveryRun_startedAt_idx" ON "DiscoveryRun"("startedAt");

-- CreateIndex
CREATE INDEX "WorkerJob_state_type_idx" ON "WorkerJob"("state", "type");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityAttribute" ADD CONSTRAINT "IdentityAttribute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemovalRequest" ADD CONSTRAINT "RemovalRequest_channelSubmissionId_fkey" FOREIGN KEY ("channelSubmissionId") REFERENCES "ChannelSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSubmission" ADD CONSTRAINT "ChannelSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryCandidate" ADD CONSTRAINT "DiscoveryCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiscoveryRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

`;
