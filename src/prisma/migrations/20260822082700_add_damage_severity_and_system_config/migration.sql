-- AlterTable
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "damage_severity" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "system_configs" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("key")
);
