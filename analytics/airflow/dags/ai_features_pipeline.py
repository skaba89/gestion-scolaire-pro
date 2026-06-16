"""AI Features Pipeline.

Builds ML-ready features from analytics marts and optionally launches the
baseline dropout prediction training script.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.empty import EmptyOperator

DEFAULT_ARGS = {
    "owner": "schoolflow-ai-platform",
    "depends_on_past": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
}

DBT_DIR = "/opt/airflow/dbt"
DBT_PROFILES_DIR = "/opt/airflow/dbt"
ML_DIR = "/opt/airflow/dbt/../ml"

with DAG(
    dag_id="schoolflow_ai_features_pipeline",
    default_args=DEFAULT_ARGS,
    description="Generate ML features and train dropout prediction model",
    start_date=datetime(2026, 5, 1),
    schedule_interval="30 2 * * *",
    catchup=False,
    max_active_runs=1,
    tags=["schoolflow", "ai", "ml", "education"],
) as dag:
    start = EmptyOperator(task_id="start")

    build_ml_features = BashOperator(
        task_id="build_ml_features",
        bash_command=f"cd {DBT_DIR} && dbt run --select ml --profiles-dir {DBT_PROFILES_DIR}",
    )

    train_dropout_model = BashOperator(
        task_id="train_dropout_model",
        bash_command=f"python {ML_DIR}/dropout_prediction/train.py",
    )

    end = EmptyOperator(task_id="end")

    start >> build_ml_features >> train_dropout_model >> end
