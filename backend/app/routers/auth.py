import os

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from ..auth import create_jwt, get_current_user, hash_password, verify_password
from ..database import get_db
from ..limiter import limiter
from ..models import User
from ..schemas import LoginRequest, UserCreate, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

_SECURE = os.getenv("SECURE_COOKIE", "false").lower() == "true"


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter_by(email=body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_jwt(str(user.id), user.email, body.remember_me)
    max_age = 2592000 if body.remember_me else 86400
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=max_age,
        path="/",
        secure=_SECURE,
    )
    return {"email": user.email}


@router.post("/logout")
def logout(response: Response):
    response.set_cookie(
        key="access_token",
        value="",
        httponly=True,
        samesite="lax",
        max_age=0,
        path="/",
        secure=_SECURE,
    )
    return {"message": "Logged out"}


@router.get("/me", response_model=UserOut)
def me(request: Request, db: Session = Depends(get_db)):
    return get_current_user(request, db)
