"""Structured JSON logging configuration for SchoolFlow Pro."""
import logging
import sys


class RequestContextFilter(logging.Filter):
    """Inject request context (request_id, tenant_id, user_id) into log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        if not hasattr(record, "tenant_id"):
            record.tenant_id = "-"
        if not hasattr(record, "user_id"):
            record.user_id = "-"
        return True


def setup_logging(level: str = "INFO") -> None:
    """Configure application-wide structured JSON logging."""
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove existing handlers
    root_logger.handlers.clear()

    try:
        from pythonjsonlogger import jsonlogger  # type: ignore[import-untyped]

        formatter = jsonlogger.JsonFormatter(
            fmt="%(asctime)s %(name)s %(levelname)s %(message)s %(request_id)s %(tenant_id)s %(user_id)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
            rename_fields={
                "asctime": "timestamp",
                "levelname": "level",
                "name": "logger",
            },
        )
    except ImportError:
        # Fallback to plain text if python-json-logger not installed
        formatter = logging.Formatter(  # type: ignore[assignment]
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.addFilter(RequestContextFilter())

    root_logger.addHandler(handler)

    # Silence noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a named logger with context filter attached."""
    logger = logging.getLogger(name)
    return logger
