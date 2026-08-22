-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_flagged_for_review" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "reports_idempotency_key_key" ON "reports"("idempotency_key");
