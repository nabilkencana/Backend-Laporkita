/**
 * Geo Utility — Bounding Box Kota Malang & Haversine Distance
 * Sesuai Rules.md §2.1 & §1.5
 */

// Bounding box koordinat geografis Kota Malang (pilot project)
export const MALANG_BOUNDS = {
  LAT_MIN: -8.25,
  LAT_MAX: -7.85,
  LNG_MIN: 112.5,
  LNG_MAX: 112.8,
};

/**
 * Validasi apakah koordinat berada di dalam wilayah pilot Kota Malang
 */
export function isWithinMalangBounds(
  latitude: number,
  longitude: number,
  bounds = MALANG_BOUNDS,
): boolean {
  return (
    latitude >= bounds.LAT_MIN &&
    latitude <= bounds.LAT_MAX &&
    longitude >= bounds.LNG_MIN &&
    longitude <= bounds.LNG_MAX
  );
}

/**
 * Menghitung jarak antara dua titik koordinat dalam meter menggunakan rumus Haversine
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Radius bumi dalam meter
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
