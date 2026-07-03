-- Migration: Add anaesthesia consent fields to pre-operative anaesthetic reviews.

ALTER TABLE "preoperative_anesthetic_reviews" ADD COLUMN IF NOT EXISTS "anaesthesiaConsentText" TEXT;
ALTER TABLE "preoperative_anesthetic_reviews" ADD COLUMN IF NOT EXISTS "anaesthesiaConsentSignature" TEXT;
ALTER TABLE "preoperative_anesthetic_reviews" ADD COLUMN IF NOT EXISTS "anaesthesiaConsentSignedBy" TEXT;
ALTER TABLE "preoperative_anesthetic_reviews" ADD COLUMN IF NOT EXISTS "anaesthesiaConsentRelation" TEXT;
ALTER TABLE "preoperative_anesthetic_reviews" ADD COLUMN IF NOT EXISTS "anaesthesiaConsentMethod" TEXT;
ALTER TABLE "preoperative_anesthetic_reviews" ADD COLUMN IF NOT EXISTS "anaesthesiaConsentSignedAt" TIMESTAMP(3);
