"""Dropout prediction training pipeline.

This script trains a baseline model from the analytics warehouse. It is designed
as a production-ready starting point: deterministic, environment-driven and
MLflow-compatible.
"""
from __future__ import annotations

import os

import pandas as pd
from sqlalchemy import create_engine
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split

try:
    import mlflow
except Exception:  # pragma: no cover
    mlflow = None


FEATURE_COLUMNS = ["attendance_rate", "average_grade", "low_attendance_flag", "low_grade_flag"]
TARGET_COLUMN = "label_high_risk"


def load_features() -> pd.DataFrame:
    db_url = os.environ["ANALYTICS_DATABASE_URL"]
    engine = create_engine(db_url)
    return pd.read_sql("select * from ml.student_risk_features", engine)


def train() -> None:
    df = load_features().dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN])
    if df.empty:
        raise RuntimeError("No ML features available in ml.student_risk_features")

    x = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.25, random_state=42, stratify=y if y.nunique() > 1 else None)

    model = RandomForestClassifier(n_estimators=100, random_state=42, class_weight="balanced")

    if mlflow:
        mlflow.set_experiment("schoolflow_dropout_prediction")
        with mlflow.start_run():
            model.fit(x_train, y_train)
            pred = model.predict(x_test)
            proba = model.predict_proba(x_test)[:, 1] if hasattr(model, "predict_proba") and y.nunique() > 1 else pred
            auc = roc_auc_score(y_test, proba) if y.nunique() > 1 else 0.0
            mlflow.log_metric("roc_auc", float(auc))
            mlflow.log_text(classification_report(y_test, pred), "classification_report.txt")
            mlflow.sklearn.log_model(model, "model")
    else:
        model.fit(x_train, y_train)
        pred = model.predict(x_test)
        print(classification_report(y_test, pred))


if __name__ == "__main__":
    train()
