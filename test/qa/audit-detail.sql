WITH flagged AS (
  SELECT id, report_code, status FROM reports
  WHERE report_code IN ('#LP-2026-000013','#LP-2026-000015','#LP-2026-000020','#LP-2026-000022','#LP-2026-000023','#LP-2026-000024')
)
SELECT h.report_id, r.report_code, h.status, h.changed_by, h.note, h.created_at
FROM report_status_history h
JOIN flagged r ON r.id = h.report_id
ORDER BY h.report_id, h.created_at;
