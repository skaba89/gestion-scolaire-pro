WITH students AS (
    SELECT
        tenant_id,
        gender,
        status,
        COUNT(*) AS student_count
    FROM {{ ref('students_clean') }}
    GROUP BY tenant_id, gender, status
),

performance AS (
    SELECT
        tenant_id,
        COUNT(*) AS assessed_students,
        AVG(average_grade) AS avg_grade,
        AVG(attendance_rate) AS avg_attendance_rate,
        SUM(CASE WHEN dropout_risk_level = 'high' THEN 1 ELSE 0 END) AS high_risk_students,
        SUM(CASE WHEN dropout_risk_level = 'medium' THEN 1 ELSE 0 END) AS medium_risk_students,
        SUM(CASE WHEN dropout_risk_level = 'low' THEN 1 ELSE 0 END) AS low_risk_students
    FROM {{ ref('student_performance') }}
    GROUP BY tenant_id
),

student_totals AS (
    SELECT
        tenant_id,
        SUM(student_count) AS total_students,
        SUM(CASE WHEN gender IN ('F', 'female', 'Female', 'FEMALE') THEN student_count ELSE 0 END) AS female_students,
        SUM(CASE WHEN gender IN ('M', 'male', 'Male', 'MALE') THEN student_count ELSE 0 END) AS male_students,
        SUM(CASE WHEN status IN ('ACTIVE', 'active') THEN student_count ELSE 0 END) AS active_students
    FROM students
    GROUP BY tenant_id
)

SELECT
    st.tenant_id,
    st.total_students,
    st.active_students,
    st.female_students,
    st.male_students,
    COALESCE(p.assessed_students, 0) AS assessed_students,
    COALESCE(p.avg_grade, 0) AS avg_grade,
    COALESCE(p.avg_attendance_rate, 0) AS avg_attendance_rate,
    COALESCE(p.high_risk_students, 0) AS high_risk_students,
    COALESCE(p.medium_risk_students, 0) AS medium_risk_students,
    COALESCE(p.low_risk_students, 0) AS low_risk_students,
    CASE
        WHEN st.total_students = 0 THEN 0
        ELSE ROUND((COALESCE(p.high_risk_students, 0)::numeric / st.total_students) * 100, 2)
    END AS high_risk_rate
FROM student_totals st
LEFT JOIN performance p ON st.tenant_id = p.tenant_id
