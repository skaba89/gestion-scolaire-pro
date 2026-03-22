from sqlalchemy import Column, String, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func

Base = declarative_base()

class L1Version(Base):
    __tablename__ = 'l1_versions'
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    l1_clusters = relationship("L1Cluster", back_populates="l1_version")

class L1Cluster(Base):
    __tablename__ = 'l1_clusters'
    id = Column(String, primary_key=True)
    l1_version_id = Column(String, ForeignKey('l1_versions.id'), nullable=False)
    name = Column(String, nullable=False)
    summary = Column(String)
    l1_version = relationship("L1Version", back_populates="l1_clusters")
    l1_shades = relationship("L1Shade", back_populates="l1_cluster")

class L1Shade(Base):
    __tablename__ = 'l1_shades'
    id = Column(String, primary_key=True)
    l1_cluster_id = Column(String, ForeignKey('l1_clusters.id'), nullable=False)
    shade_name = Column(String, nullable=False)
    shade_details = Column(JSON)
    l1_cluster = relationship("L1Cluster", back_populates="l1_shades")
