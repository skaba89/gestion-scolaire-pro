"""SchoolFlow Analytics Pipeline.

This DAG orchestrates the OLAP side only. It must never run heavy analytics
queries against the operational application database.

Flow:
1. Validate analytics warehouse availability.
2. Run dbt bronze/silver/gold models.
3. Run dbt tests.
4. Log pipeline status for monitoring.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.empty import EmptyOperator

DEFAULT_ARGS = {
    "owner": "schoolflow-data-platform",
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}

DBT_DIR = "/opt/airflow/dbt"
DBT_PROFILES_DIR = "/opt/airflow/dbt"

with DAG(
    dag_id="schoolflow_analytics_pipeline",
    default_args=DEFAULT_ARGS,
    description="Build SchoolFlow bronze/silver/gold analytics models",
    start_date=datetime(2026, 5, 1),
    schedule_interval="0 * * * *",
    catchup=False,
    max_active_runs=1,
    tags=["schoolflow", "analytics", "dbt", "olap"],
) as dag:
    start = EmptyOperator(task_id="start")

    validate_warehouse = BashOperator(
        task_id="validate_analytics_warehouse",
        bash_command=(
            "python - <<'PY'\n"
            "import os, psycopg2\n"
            "url=os.environ.get('ANALYTICS_DATABASE_URL')\n"
            "assert url, 'ANALYTICS_DATABASE_URL is required'\n"
            "conn=psycopg2.connect(url)\n"
            "cur=conn.cursor()\n"
            "cur.execute('select 1')\n"
            "print('analytics warehouse OK')\n"
            "conn.close()\n"
            "PY"
        ),
    )

    dbt_debug = BashOperator(
        task_id="dbt_debug",
        bash_command=f"cd {DBT_DIR} && dbt debug --profiles-dir {DBT_PROFILES_DIR}",
    )

    dbt_run_silver = BashOperator(
        task_id="dbt_run_silver",
        bash_command=f"cd {DBT_DIR} && dbt run --select silver --profiles-dir {DBT_PROFILES_DIR}",
    )

    dbt_run_gold = BashOperator(
        task_id="dbt_run_gold",
        bash_command=f"cd {DBT_DIR} && dbt run --select gold --profiles-dir {DBT_PROFILES_DIR}",
    )

    dbt_test = BashOperator(
        task_id="dbt_test",
        bash_command=f"cd {DBT_DIR} && dbt test --profiles-dir {DBT_PROFILES_DIR}",
    )

    end = EmptyOperator(task_id="end")

    start >> validate_warehouse >> dbt_debug >> dbt_run_silver >> dbt_run_gold >> dbt_test >> end
