-- F2-1: Pulihkan GIST Spatial Index yang terhapus oleh migration OTP (20260822105814).
-- Migration 20260822105814 meng-DROP zones_geo_boundary_gist_idx tanpa recreation.
-- Buat migration BARU (tidak edit yang lama yang sudah ter-apply).

-- Spatial GIST Index untuk boundary polygon zona (Urban Emotion Map)
CREATE INDEX IF NOT EXISTS "zones_geo_boundary_gist_idx"
ON "zones" USING GIST ("geo_boundary");

-- Spatial GIST Index untuk koordinat laporan (latitude/longitude via ST_MakePoint PostGIS)
CREATE INDEX IF NOT EXISTS "reports_spatial_location_gist_idx"
ON "reports" USING GIST (
  ST_SetSRID(ST_MakePoint("longitude"::float8, "latitude"::float8), 4326)
);
