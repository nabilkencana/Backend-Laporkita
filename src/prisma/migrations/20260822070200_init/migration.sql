-- ══════════════════════════════════════════════════════════════════════════
-- POSTGIS EXTENSION SETUP
--
-- JUSTIFIKASI RAW SQL (Exception dari aturan "no raw query" Rules.md §4.1):
-- 1. Prisma tidak mendukung native PostGIS extension management & GIST index.
-- 2. PostGIS WAJIB untuk tipe geometry tabel `zones` (Urban Emotion Map - ERD §2.11)
--    dan spatial index pencarian radius laporan (Citizen Validation - Rules.md §1.5).
-- ══════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('citizen', 'operator', 'policy_maker', 'admin');

-- CreateEnum
CREATE TYPE "AgencyType" AS ENUM ('dpupr', 'dishub', 'diskominfo', 'lainnya');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending_verification', 'verified', 'rejected', 'assigned', 'in_progress', 'completed', 'resolved', 'disputed');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('initial_photo', 'progress_photo', 'completion_photo');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('route_alert', 'status_update', 'support_received', 'system');

-- CreateEnum
CREATE TYPE "StressLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ContributionReason" AS ENUM ('report_submitted', 'report_verified', 'validation_given', 'support_given');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone_number" VARCHAR(20),
    "password_hash" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'citizen',
    "agency_id" UUID,
    "contribution_points" INTEGER NOT NULL DEFAULT 0,
    "avatar_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "AgencyType" NOT NULL,
    "contact_email" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon_url" VARCHAR(500),
    "default_agency_id" UUID,
    "urgency_weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "report_code" VARCHAR(20) NOT NULL,
    "reporter_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "assigned_agency_id" UUID,
    "assigned_officer_id" UUID,
    "description" TEXT,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "address_text" VARCHAR(500),
    "status" "ReportStatus" NOT NULL DEFAULT 'pending_verification',
    "ai_confidence_score" DOUBLE PRECISION,
    "urgency_score" DOUBLE PRECISION,
    "support_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "estimated_completion_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_media" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "type" "MediaType" NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_status_history" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "status" "ReportStatus" NOT NULL,
    "note" TEXT,
    "changed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_supports" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_supports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_comments" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citizen_validations" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_valid" BOOLEAN NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citizen_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribution_points_log" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" "ContributionReason" NOT NULL,
    "reference_report_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contribution_points_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "geo_boundary" geometry,
    "stress_level" "StressLevel" NOT NULL DEFAULT 'low',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_metrics" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "report_density" INTEGER NOT NULL DEFAULT 0,
    "weather_context" JSONB,
    "traffic_density" DOUBLE PRECISION,
    "flood_risk_probability" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_simulations" (
    "id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "zone_id" UUID,
    "result_narrative" TEXT,
    "result_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_alert_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_token" VARCHAR(500) NOT NULL,
    "last_lat" DECIMAL(10,8),
    "last_long" DECIMAL(11,8),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_alert_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "reference_report_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "reports_report_code_key" ON "reports"("report_code");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_category_id_idx" ON "reports"("category_id");

-- CreateIndex
CREATE INDEX "report_status_history_report_id_created_at_idx" ON "report_status_history"("report_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_supports_report_id_user_id_key" ON "report_supports"("report_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_alert_subscriptions_user_id_key" ON "route_alert_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_default_agency_id_fkey" FOREIGN KEY ("default_agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assigned_agency_id_fkey" FOREIGN KEY ("assigned_agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assigned_officer_id_fkey" FOREIGN KEY ("assigned_officer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_media" ADD CONSTRAINT "report_media_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_media" ADD CONSTRAINT "report_media_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_supports" ADD CONSTRAINT "report_supports_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_supports" ADD CONSTRAINT "report_supports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizen_validations" ADD CONSTRAINT "citizen_validations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizen_validations" ADD CONSTRAINT "citizen_validations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_points_log" ADD CONSTRAINT "contribution_points_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_points_log" ADD CONSTRAINT "contribution_points_log_reference_report_id_fkey" FOREIGN KEY ("reference_report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_metrics" ADD CONSTRAINT "zone_metrics_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_simulations" ADD CONSTRAINT "policy_simulations_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_simulations" ADD CONSTRAINT "policy_simulations_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_alert_subscriptions" ADD CONSTRAINT "route_alert_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reference_report_id_fkey" FOREIGN KEY ("reference_report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════════
-- SPATIAL GIST INDEXES (ERD.md §4)
--
-- JUSTIFIKASI RAW SQL (Exception dari aturan "no raw query" Rules.md §4.1):
-- 1. Prisma schema tidak mendukung syntax index GIST secara native.
-- 2. Index GIST spasial ini WAJIB untuk performa tinggi pencarian pin laporan di peta,
--    filter bounding box Kota Malang (PRD §4.1, Rules.md §2.1), dan pengecekan
--    radius Citizen Validation 100m (Rules.md §1.5).
-- ══════════════════════════════════════════════════════════════════════════

-- Spatial GIST Index untuk koordinat laporan (latitude & longitude)
CREATE INDEX IF NOT EXISTS "reports_spatial_location_gist_idx"
ON "reports" USING GIST (
  ST_SetSRID(ST_MakePoint(CAST("longitude" AS DOUBLE PRECISION), CAST("latitude" AS DOUBLE PRECISION)), 4326)
);

-- Spatial GIST Index untuk boundary polygon zona (Urban Emotion Map)
CREATE INDEX IF NOT EXISTS "zones_geo_boundary_gist_idx"
ON "zones" USING GIST ("geo_boundary");
