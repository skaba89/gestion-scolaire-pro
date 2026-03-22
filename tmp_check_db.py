from sqlalchemy import create_engine, text
import os

# Try to get DB URL from environment or common location
db_url = "postgresql://postgres:postgres@localhost:5432/schoolflow" # example

try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'assessments'"))
        columns = [row[0] for row in result]
        print(f"Columns in assessments: {columns}")
except Exception as e:
    print(f"Error checking columns: {e}")
