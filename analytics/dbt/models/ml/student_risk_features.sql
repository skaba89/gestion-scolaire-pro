WITH perf AS (
    SELECT
        student_id,
        tenant_id,
        attendance_rate,
        average_grade,
        dropout_risk_level
    FROM {{ ref('student_performance') }}
)

SELECT
    student_id,
    tenant_id,
    attendance_rate,
    average_grade,
    CASE WHEN dropout_risk_level = 'high' THEN 1 ELSE 0 END AS label_high_risk,
    CASE WHEN attendance_rate < 60 THEN 1 ELSE 0 END AS low_attendance_flag,
    CASE WHEN average_grade < 10 THEN 1 ELSE 0 END AS low_grade_flag,
    CURRENT_TIMESTAMP AS feature_generated_at
FROM perf
