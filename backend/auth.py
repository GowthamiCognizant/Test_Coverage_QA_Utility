import jwt
import bcrypt
from datetime import datetime, timedelta
from config import JWT_SECRET

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

# In-memory user store (replace with a database in production)
users_db = {}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def verify_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload.get("sub")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
