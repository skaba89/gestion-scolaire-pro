from sqlalchemy import Column, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base, GUID, TimestampMixin, UUIDMixin, TenantMixin


class SubjectPreferredRoom(Base, UUIDMixin, TimestampMixin, TenantMixin):
    """Link table: preferred rooms for a subject (used to bias scheduling)."""
    __tablename__ = "subject_preferred_rooms"
    __table_args__ = (
        UniqueConstraint("subject_id", "room_id", name="uq_subject_preferred_room"),
    )

    subject_id = Column(GUID(), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    room_id = Column(GUID(), ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)

    # Relationships
    subject = relationship("Subject")
    room = relationship("Room")
