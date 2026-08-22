-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('register', 'login', 'reset_password');

-- DropIndex
DROP INDEX IF EXISTS "zones_geo_boundary_gist_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "otp_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "otp_code_hash" VARCHAR(255) NOT NULL,
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'register',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_verifications_phone_number_purpose_is_used_idx" ON "otp_verifications"("phone_number", "purpose", "is_used");

-- CreateIndex
CREATE INDEX "otp_verifications_user_id_idx" ON "otp_verifications"("user_id");

-- AddForeignKey
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
