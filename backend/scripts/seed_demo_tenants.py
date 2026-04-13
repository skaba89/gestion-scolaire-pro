
import sys
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import uuid
import json
import traceback

# Configuration
DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable is required.", file=sys.stderr)
    sys.exit(1)

_IS_SQLITE = DATABASE_URL.startswith("sqlite:")

if not _IS_SQLITE:
    # Normalize to psycopg v3 synchronous driver
    for prefix in ("postgresql+asyncpg://", "postgresql+psycopg2://"):
        if DATABASE_URL.startswith(prefix):
            DATABASE_URL = DATABASE_URL.replace(prefix, "postgresql://", 1)
            break
    if not DATABASE_URL.startswith("postgresql+psycopg://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

connect_args = {"check_same_thread": False} if _IS_SQLITE else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

DEMO_TENANTS = [
    {
        "name": "Université La Source",
        "slug": "lasource",
        "type": "university",
        "logo": "https://images.unsplash.com/photo-1592280771190-3e2e4d571952",
        "tagline": "L'excellence académique pour un avenir brillant.",
        "levels": ["Licence 1", "Licence 2", "Licence 3", "Master 1", "Master 2"],
        "departments": [
            {
                "name": "Droit et Sciences Politiques",
                "description": "Faculté dédiée aux sciences juridiques et politiques.",
                "subjects": ["Droit Civil", "Droit Constitutionnel", "Relations Internationales"]
            },
            {
                "name": "Sciences Économiques",
                "description": "Département de formation aux métiers de la finance et de l'économie.",
                "subjects": ["Macroéconomie", "Microéconomie", "Analyse Financière"]
            }
        ]
    },
    {
        "name": "Lycée Montesquieu",
        "slug": "lycee-montesquieu",
        "type": "high_school",
        "logo": "https://images.unsplash.com/photo-1523050854058-8df90110c9f1",
        "tagline": "L'excellence académique au cœur de Bordeaux.",
        "levels": ["Seconde", "Première S", "Première ES", "Terminale S", "Terminale ES"]
    },
    {
        "name": "Centre AFPA Rennes",
        "slug": "afpa-rennes",
        "type": "training_center",
        "logo": "https://images.unsplash.com/photo-1513258496099-48168024adb0",
        "tagline": "Formez-vous aux métiers de demain.",
        "levels": ["Développeur Web", "Concepteur Développeur", "Technicien Réseaux"]
    },
    {
        "name": "École Primaire Les Oliviers",
        "slug": "ecole-les-oliviers",
        "type": "primary_school",
        "logo": "https://images.unsplash.com/photo-1503676260728-1c00da094a0b",
        "tagline": "Grandir et apprendre ensemble dans un cadre bienveillant.",
        "levels": ["CP", "CE1", "CE2", "CM1", "CM2"]
    },
    {
        "name": "Institut Supérieur du Commerce",
        "slug": "isc-paris",
        "type": "university",
        "logo": "https://images.unsplash.com/photo-1525921429624-479b6a26d84d",
        "tagline": "Prepare for the world of tomorrow.",
        "levels": ["Bachelor Marketing", "Master Finance", "MBA International"],
        "departments": [
            {
                "name": "Marketing & Communication",
                "description": "Pôle d'expertise en stratégie de marque et communication digitale.",
                "subjects": ["Digital Marketing", "Brand Management", "Public Relations"]
            },
            {
                "name": "Finance & Audit",
                "description": "Formation aux métiers de la finance d'entreprise et de marché.",
                "subjects": ["Corporate Finance", "Market Analysis", "Accounting"]
            }
        ]
    },
    {
        "name": "Lycée Technique Jules Verne",
        "slug": "lycee-jules-verne",
        "type": "high_school",
        "logo": "https://images.unsplash.com/photo-1581092921461-39b9d08a9b21",
        "tagline": "Innovation et technologie pour votre avenir.",
        "levels": ["STI2D", "BTS Systèmes Numériques", "Bac Pro MELEC"]
    }
]

def seed():
    db = SessionLocal()
    with open("seed_debug.log", "w") as log:
        log.write("Starting fix-3 seed...\n")
        try:
            for t in DEMO_TENANTS:
                log.write(f"Processing tenant: {t['slug']}\n")
                # Check if exists
                res = db.execute(text("SELECT id, settings FROM tenants WHERE slug = :slug"), {"slug": t["slug"]}).fetchone()
                
                tenant_id = None
                if res:
                    tenant_id = str(res[0])
                    settings = res[1] or {}
                    # Update settings with logo and tagline
                    if "landing" not in settings:
                        settings["landing"] = {}
                    settings["landing"]["logo_url"] = t["logo"]
                    settings["landing"]["tagline"] = t["tagline"]
                    settings["landing"]["show_programs"] = True
                    settings["landing"]["show_stats"] = True
                    
                    db.execute(
                        text("UPDATE tenants SET settings = :settings, name = :name WHERE id = :id"),
                        {"settings": json.dumps(settings), "name": t["name"], "id": tenant_id}
                    )
                else:
                    tenant_id = str(uuid.uuid4())
                    settings = {
                        "landing": {
                            "tagline": t["tagline"],
                            "logo_url": t["logo"],
                            "primary_color": "#1e3a5f",
                            "secondary_color": "#0ea5e9",
                            "announcements": [],
                            "show_programs": True,
                            "show_stats": True,
                            "show_gallery": True
                        },
                        "onboarding_completed": True,
                        "onboarding_step": 4
                    }
                    
                    db.execute(
                        text("""
                        INSERT INTO tenants (id, name, slug, type, is_active, settings, created_at, updated_at, country)
                        VALUES (:id, :name, :slug, :type, true, :settings, NOW(), NOW(), 'FR')
                        """),
                        {
                            "id": tenant_id,
                            "name": t["name"],
                            "slug": t["slug"],
                            "type": t["type"],
                            "settings": json.dumps(settings)
                        }
                    )
                
                # Seed levels
                for i, level_name in enumerate(t.get("levels", [])):
                    l_res = db.execute(
                        text("SELECT id FROM levels WHERE tenant_id = :tid AND name = :name"),
                        {"tid": tenant_id, "name": level_name}
                    ).fetchone()
                    
                    if not l_res:
                        db.execute(
                            text("INSERT INTO levels (id, tenant_id, name, order_index, created_at, updated_at, code) VALUES (:id, :tid, :name, :idx, NOW(), NOW(), :code)"),
                            {"id": str(uuid.uuid4()), "tid": tenant_id, "name": level_name, "idx": i, "code": level_name[:10].upper()}
                        )

                # Ensure academic year exists
                ay_res = db.execute(
                    text("SELECT id FROM academic_years WHERE tenant_id = :tid AND is_current = true"),
                    {"tid": tenant_id}
                ).fetchone()
                
                if not ay_res:
                    db.execute(
                        text("""
                        INSERT INTO academic_years (id, tenant_id, name, code, start_date, end_date, is_current, created_at, updated_at)
                        VALUES (:id, :tid, '2025-2026', '25-26', '2025-09-01', '2026-06-30', true, NOW(), NOW())
                        """),
                        {"id": str(uuid.uuid4()), "tid": tenant_id}
                    )

                # Seed departments and subjects
                for dept_data in t.get("departments", []):
                    d_res = db.execute(
                        text("SELECT id FROM departments WHERE tenant_id = :tid AND name = :name"),
                        {"tid": tenant_id, "name": dept_data["name"]}
                    ).fetchone()
                    
                    dept_id = None
                    if not d_res:
                        dept_id = str(uuid.uuid4())
                        db.execute(
                            text("INSERT INTO departments (id, tenant_id, name, description, created_at, updated_at, code) VALUES (:id, :tid, :name, :desc, NOW(), NOW(), :code)"),
                            {"id": dept_id, "tid": tenant_id, "name": dept_data["name"], "desc": dept_data["description"], "code": dept_data["name"][:10].upper()}
                        )
                    else:
                        dept_id = str(d_res[0])
                    
                    for subject_name in dept_data.get("subjects", []):
                        s_res = db.execute(
                            text("SELECT id FROM subjects WHERE tenant_id = :tid AND name = :name"),
                            {"tid": tenant_id, "name": subject_name}
                        ).fetchone()
                        
                        subject_id = None
                        if not s_res:
                            subject_id = str(uuid.uuid4())
                            db.execute(
                                text("INSERT INTO subjects (id, tenant_id, name, created_at, updated_at, coefficient, code) VALUES (:id, :tid, :name, NOW(), NOW(), 1.0, :code)"),
                                {"id": subject_id, "tid": tenant_id, "name": subject_name, "code": subject_name[:10].upper()}
                            )
                        else:
                            subject_id = str(s_res[0])
                        
                        link_res = db.execute(
                            text("SELECT 1 FROM subject_departments WHERE subject_id = :sid AND department_id = :did AND tenant_id = :tid"),
                            {"sid": subject_id, "did": dept_id, "tid": tenant_id}
                        ).fetchone()
                        
                        if not link_res:
                            db.execute(
                                text("INSERT INTO subject_departments (subject_id, department_id, tenant_id) VALUES (:sid, :did, :tid)"),
                                {"sid": subject_id, "did": dept_id, "tid": tenant_id}
                            )
            
            db.commit()
            print("Seeding completed successfully.")
        except Exception as e:
            log.write(f"CRITICAL ERROR: {e}\n")
            log.write(traceback.format_exc())
            db.rollback()
            print(f"Error during seeding: {e}")
        finally:
            db.close()

if __name__ == "__main__":
    seed()
