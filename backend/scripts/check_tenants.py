
from sqlalchemy import create_engine, text
import os
import json
import sys

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("[ERROR] DATABASE_URL environment variable is required.")
    sys.exit(1)

engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    rows = conn.execute(text("SELECT t.name, t.slug, COUNT(l.id) as level_count FROM tenants t LEFT JOIN levels l ON l.tenant_id = t.id GROUP BY t.name, t.slug")).fetchall()
    for r in rows:
        print(f"Name: {r[0]}, Slug: {r[1]}, Levels: {r[2]}")
