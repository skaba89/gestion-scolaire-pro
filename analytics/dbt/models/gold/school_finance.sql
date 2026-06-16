WITH payments AS (
    SELECT
        tenant_id,
        payload->>'id' AS payment_id,
        payload->>'student_id' AS student_id,
        COALESCE((payload->>'amount')::numeric, 0) AS amount,
        COALESCE(payload->>'currency', 'GNF') AS currency,
        COALESCE(payload->>'status', 'unknown') AS status,
        COALESCE((payload->>'payment_date')::date, ingested_at::date) AS payment_date
    FROM {{ source('bronze', 'payments_raw') }}
),

aggregated AS (
    SELECT
        tenant_id,
        currency,
        payment_date,
        COUNT(*) AS payment_count,
        SUM(amount) AS total_amount,
        SUM(CASE WHEN status IN ('PAID', 'paid', 'COMPLETED', 'completed') THEN amount ELSE 0 END) AS paid_amount,
        SUM(CASE WHEN status IN ('PENDING', 'pending') THEN amount ELSE 0 END) AS pending_amount,
        SUM(CASE WHEN status IN ('FAILED', 'failed', 'CANCELED', 'canceled') THEN amount ELSE 0 END) AS failed_amount
    FROM payments
    GROUP BY tenant_id, currency, payment_date
)

SELECT
    tenant_id,
    currency,
    payment_date,
    payment_count,
    total_amount,
    paid_amount,
    pending_amount,
    failed_amount,
    CASE
        WHEN total_amount = 0 THEN 0
        ELSE ROUND((paid_amount / total_amount) * 100, 2)
    END AS collection_rate
FROM aggregated
