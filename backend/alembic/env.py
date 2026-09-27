from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import settings
from app.db.base import Base
from app.models import *  # noqa: F401,F403

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# P0-1 (production readiness — Azure startup fix): the URL is passed
# directly to create_engine()/context.configure() below, NEVER through
# config.set_main_option()/get_main_option(). Those route through
# configparser's interpolation, which treats a bare "%" as the start of a
# "%(name)s" placeholder — and a URL-encoded password (e.g. "%40" for "@")
# always contains "%". config.set_main_option() would raise
# "invalid interpolation syntax" for any such password, which is exactly
# what a real Azure Flexible Server-generated password looks like — this
# broke `alembic upgrade head` for any reserved-character password, found
# while validating start.sh's own DATABASE_URL_SYNC parsing end-to-end.
db_url = settings.DATABASE_URL_SYNC

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(db_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

