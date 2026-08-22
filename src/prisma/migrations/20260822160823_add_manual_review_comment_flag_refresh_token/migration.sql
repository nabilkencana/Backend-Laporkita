-- DropIndex
DROP INDEX "zones_geo_boundary_gist_idx";

-- AlterTable
ALTER TABLE "report_comments" ADD COLUMN     "is_flagged" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "needs_manual_review" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "refresh_token_hash" TEXT;

-- CreateIndex
CREATE INDEX "report_comments_is_flagged_idx" ON "report_comments"("is_flagged");

-- CreateIndex
CREATE INDEX "reports_needs_manual_review_idx" ON "reports"("needs_manual_review");
