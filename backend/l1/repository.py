from typing import List
from backend.models import L1Version

class L1Repository:
    def __init__(self, session):
        self.session = session

    def save_l1_data(self, version: L1Version):
        self.session.add(version)
        self.session.commit()

    def get_versions_by_user(self, user_id: str) -> List[L1Version]:
        return self.session.query(L1Version).filter_by(user_id=user_id).order_by(L1Version.created_at.desc()).all()

    def get_version(self, version_id: str) -> L1Version:
        return self.session.query(L1Version).filter_by(id=version_id).first()
