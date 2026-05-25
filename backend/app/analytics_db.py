import os
from functools import lru_cache
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session


@lru_cache(maxsize=1)
def _engine():
    url = os.getenv("ANALYTICS_DATABASE_URL", "")
    if not url:
        raise RuntimeError("ANALYTICS_DATABASE_URL is not set")
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=10)


def get_analytics_db() -> Generator[Session, None, None]:
    SessionLocal = sessionmaker(bind=_engine(), autocommit=False, autoflush=False)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
