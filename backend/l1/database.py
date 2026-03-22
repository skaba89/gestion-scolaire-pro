from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.models import Base

def setup_database_session(db_url: str):
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()