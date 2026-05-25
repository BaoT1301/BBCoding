from pydantic import BaseModel, ConfigDict, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str


class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: bool = False


class TokenData(BaseModel):
    sub: str
    email: str
