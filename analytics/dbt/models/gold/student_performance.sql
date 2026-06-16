WITH attendance AS (
    SELECT
        tenant_id,
        payload->>'student_id' AS student_id,
        AVG(
            CASE
                WHEN payload->>'status' = 'present' THEN 1
                ELSE 0
            END
        ) * 100 AS attendance_rate
    FROM {{ source('bronze', 'attendance_raw') }}
    GROUP BY tenant_id, payload->>'student_id'
),

grades AS (
    SELECT
        tenant_id,
        payload->>'student_id' AS student_id,
        AVG((payload->>'score')::numeric) AS average_grade
    FROM {{ source('bronze', 'grades_raw') }}
    GROUP BY tenant_id, payload->>'student_id'
)

SELECT
    s.student_id,
    s.tenant_id,
    s.first_name,
    s.last_name,
    s.gender,
    s.status,
    COALESCE(a.attendance_rate, 0) AS attendance_rate,
    COALESCE(g.average_grade, 0) AS average_grade,
    CASE
        WHEN COALESCE(a.attendance_rate, 0) < 60
             OR COALESCE(g.average_grade, 0) < 10
        THEN 'high'
        WHEN COALESCE(a.attendance_rate, 0) < 75
             OR COALESCE(g.average_grade, 0) < 12
        THEN 'medium'
        ELSE 'low'
    END AS dropout_risk_level
FROM {{ ref('students_clean') }} s
LEFT JOIN attendance a
    ON s.student_id = a.student_id
   AND s.tenant_id = a.tenant_id
LEFT JOIN grades g
    ON s.student_id = g.student_id
   AND s.tenant_id = g.tenant_id
