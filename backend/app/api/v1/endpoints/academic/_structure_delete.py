"""HTTP mapping shared by the school-structure DELETE routes."""
import logging
from contextlib import contextmanager

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.crud.academic import StructureInUseError

logger = logging.getLogger(__name__)


@contextmanager
def structure_delete_guard(db: Session, in_use_message: str):
    """409 when the structure is still used, 503 when the check cannot run."""
    try:
        yield
    except StructureInUseError:
        raise HTTPException(status_code=409, detail=in_use_message)
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Could not verify structure deletion dependencies")
        raise HTTPException(
            status_code=503,
            detail="Vérification des dépendances indisponible ; aucune suppression effectuée.",
        )
