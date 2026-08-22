WITH candidates AS (
  SELECT id, status, report_code FROM reports ORDER BY random() LIMIT 20
),
hist AS (
  SELECT h.report_id, h.status, h.changed_by,
         lag(h.status) OVER (PARTITION BY h.report_id ORDER BY h.created_at) AS prev_status
  FROM report_status_history h
  JOIN candidates c ON c.id = h.report_id
)
SELECT c.report_code, c.status AS final_status,
       count(h.*) AS total_history,
       count(*) FILTER (WHERE h.changed_by IS NULL) AS null_changed_by,
       count(*) FILTER (WHERE h.prev_status = h.status) AS same_status_dupes,
       count(*) FILTER (WHERE h.prev_status IS NOT NULL AND NOT (
         (h.prev_status='pending_verification' AND h.status IN ('verified','rejected')) OR
         (h.prev_status='verified' AND h.status='assigned') OR
         (h.prev_status='assigned' AND h.status='in_progress') OR
         (h.prev_status='in_progress' AND h.status='completed') OR
         (h.prev_status='completed' AND h.status IN ('resolved','disputed')) OR
         (h.prev_status='disputed' AND h.status='in_progress') OR
         (h.prev_status='completed' AND h.status='in_progress') OR
         (h.prev_status='verified' AND h.status='rejected'))) AS illegal_transitions
FROM candidates c
JOIN hist h ON h.report_id = c.id
GROUP BY c.report_code, c.status
ORDER BY c.report_code;
