-- ============================================================================
-- Migration: Meal Menu & Ordering — cafeteria manager publishes free/paid
--            menus; staff/users can place orders, upload payment evidence,
--            and specify delivery location.
-- Author    : Theatre Manager team
-- Date      : 2026-06-04
-- ============================================================================

-- 1) Enums -----------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "MealItemCategory" AS ENUM (
    'BREAKFAST','LUNCH','DINNER','SNACK','BEVERAGE','COMBO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MealAvailability" AS ENUM (
    'FREE_FOR_ON_DUTY','PAID'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MealOrderType" AS ENUM ('FREE','PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MealPaymentStatus" AS ENUM (
    'NOT_REQUIRED','PENDING_VERIFICATION','VERIFIED','REJECTED','REFUNDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MealOrderStatus" AS ENUM (
    'PLACED','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) meal_menu_items --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "meal_menu_items" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "description"   TEXT,
  "category"      "MealItemCategory" NOT NULL,
  "availability"  "MealAvailability" NOT NULL,
  "price"         DECIMAL(10,2) NOT NULL DEFAULT 0,
  "currency"      TEXT NOT NULL DEFAULT 'NGN',
  "imageUrl"      TEXT,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "dailyCapacity" INTEGER,
  "prepTimeMin"   INTEGER,
  "createdById"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "meal_menu_items"
    ADD CONSTRAINT "meal_menu_items_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "meal_menu_items_availability_isActive_idx"
  ON "meal_menu_items" ("availability","isActive");
CREATE INDEX IF NOT EXISTS "meal_menu_items_category_idx"
  ON "meal_menu_items" ("category");

-- 3) meal_orders ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "meal_orders" (
  "id"                       TEXT PRIMARY KEY,
  "requesterId"              TEXT NOT NULL,
  "requesterName"            TEXT NOT NULL,
  "requesterRole"            TEXT NOT NULL,
  "orderType"                "MealOrderType" NOT NULL,
  "orderStatus"              "MealOrderStatus" NOT NULL DEFAULT 'PLACED',
  "totalAmount"              DECIMAL(10,2) NOT NULL DEFAULT 0,
  "currency"                 TEXT NOT NULL DEFAULT 'NGN',
  "deliveryLocation"         TEXT NOT NULL,
  "deliveryNotes"            TEXT,
  "preferredTime"            TIMESTAMP(3),
  "paymentStatus"            "MealPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "paymentReference"         TEXT,
  "paymentMethod"            TEXT,
  "paymentEvidenceFileName"  TEXT,
  "paymentEvidenceMimeType"  TEXT,
  "paymentEvidenceData"      BYTEA,
  "paymentUploadedAt"        TIMESTAMP(3),
  "paymentVerifiedAt"        TIMESTAMP(3),
  "paymentVerifiedById"      TEXT,
  "paymentRejectionReason"   TEXT,
  "confirmedAt"              TIMESTAMP(3),
  "preparedAt"               TIMESTAMP(3),
  "readyAt"                  TIMESTAMP(3),
  "deliveredAt"              TIMESTAMP(3),
  "deliveredById"            TEXT,
  "eligibilitySource"        TEXT,
  "eligibilityNotes"         TEXT,
  "cancelledAt"              TIMESTAMP(3),
  "cancellationReason"       TEXT,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "meal_orders"
    ADD CONSTRAINT "meal_orders_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "meal_orders"
    ADD CONSTRAINT "meal_orders_paymentVerifiedById_fkey"
    FOREIGN KEY ("paymentVerifiedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "meal_orders"
    ADD CONSTRAINT "meal_orders_deliveredById_fkey"
    FOREIGN KEY ("deliveredById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "meal_orders_requesterId_createdAt_idx"
  ON "meal_orders" ("requesterId","createdAt");
CREATE INDEX IF NOT EXISTS "meal_orders_orderStatus_createdAt_idx"
  ON "meal_orders" ("orderStatus","createdAt");
CREATE INDEX IF NOT EXISTS "meal_orders_paymentStatus_idx"
  ON "meal_orders" ("paymentStatus");

-- 4) meal_order_items -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "meal_order_items" (
  "id"                   TEXT PRIMARY KEY,
  "orderId"              TEXT NOT NULL,
  "menuItemId"           TEXT NOT NULL,
  "nameSnapshot"         TEXT NOT NULL,
  "categorySnapshot"     "MealItemCategory" NOT NULL,
  "availabilitySnapshot" "MealAvailability" NOT NULL,
  "unitPrice"            DECIMAL(10,2) NOT NULL DEFAULT 0,
  "quantity"             INTEGER NOT NULL DEFAULT 1,
  "lineTotal"            DECIMAL(10,2) NOT NULL DEFAULT 0,
  "notes"                TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  ALTER TABLE "meal_order_items"
    ADD CONSTRAINT "meal_order_items_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "meal_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "meal_order_items"
    ADD CONSTRAINT "meal_order_items_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "meal_menu_items"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "meal_order_items_orderId_idx"
  ON "meal_order_items" ("orderId");
CREATE INDEX IF NOT EXISTS "meal_order_items_menuItemId_idx"
  ON "meal_order_items" ("menuItemId");
