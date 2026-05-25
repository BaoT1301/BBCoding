import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .models import User
from .schemas import TokenData

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _secret() -> str:
    secret = os.getenv("JWT_SECRET_KEY")
    if not secret:
        raise RuntimeError("JWT_SECRET_KEY environment variable is not set")
    return secret


def _algorithm() -> str:
    return os.getenv("JWT_ALGORITHM", "HS256")


def create_jwt(user_id: str, email: str, remember_me: bool) -> str:
    expiry = 2592000 if remember_me else 86400
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(seconds=expiry),
    }
    return jwt.encode(payload, _secret(), algorithm=_algorithm())


def decode_jwt(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, _secret(), algorithms=[_algorithm()])
        return TokenData(sub=payload["sub"], email=payload["email"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_user(request: Request, db: Session) -> User:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token_data = decode_jwt(token)
    user = db.query(User).filter_by(id=token_data.sub).first()
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
