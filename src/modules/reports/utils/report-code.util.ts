/**
 * Utility untuk membuat kode laporan berformat: #LP-YYYY-NNNNNN
 * Sesuai ERD.md §2.4 (mis. #LP-2026-002487)
 */
export function generateReportCode(
  sequenceNumber: number,
  year = new Date().getFullYear(),
): string {
  const padded = sequenceNumber.toString().padStart(6, '0');
  return `#LP-${year}-${padded}`;
}
