WITH raw AS (
    SELECT
        payload,
        tenant_id,
        ingested_at,
        ROW_NUMBER() OVER (
            PARTITION BY tenant_id, payload->>'id'
            ORDER BY ingested_at DESC
        ) AS rn
    FROM {{ source('bronze', 'students_raw') }}
)

SELECT
    payload->>'id' AS student_id,
    tenant_id,
    payload->>'first_name' AS first_name,
    payload->>'last_name' AS last_name,
    payload->>'gender' AS gender,
    payload->>'status' AS status,
    payload->>'email' AS email,
    payload->>'phone' AS phone,
    payload->>'campus_id' AS campus_id,
    payload->>'level_id' AS level_id,
    ingested_at
FROM raw
WHERE rn = 1
