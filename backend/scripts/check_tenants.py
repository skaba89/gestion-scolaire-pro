
from sqlalchemy import create_engine, text
import os
import json

DATABASE_URL = "postgresql://schoolflow:postgres@postgres:5432/schoolflow"
engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    rows = conn.execute(text("SELECT t.name, t.slug, COUNT(l.id) as level_count FROM tenants t LEFT JOIN levels l ON l.tenant_id = t.id GROUP BY t.name, t.slug")).fetchall()
    for r in rows:
        print(f"Name: {r[0]}, Slug: {r[1]}, Levels: {r[2]}")
