from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time
from dataclasses import dataclass

from app.config import SESSION_DAYS, Settings, resolve_secret
from app.models import Account

USERNAME_RE = re.compile(r"^[a-z0-9_]{2,32}$")
SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
KEYLEN = 32


@dataclass(frozen=True)
class TokenPayload:
    account_id: str
    token_version: int


def hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    """Match Node's crypto.scryptSync: salt is the UTF-8 bytes of the hex string."""
    salt = salt_hex or secrets.token_hex(16)
    derived = hashlib.scrypt(
        str(password).encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=KEYLEN,
    )
    return salt, derived.hex()


def password_matches(password: str, account: Account) -> bool:
    _, hashed = hash_password(password, account.salt)
    return timing_safe_equal(hashed, account.password_hash)


def timing_safe_equal(a: str, b: str) -> bool:
    left = str(a).encode("utf-8")
    right = str(b).encode("utf-8")
    if len(left) != len(right):
        hmac.compare_digest(left, left)
        return False
    return hmac.compare_digest(left, right)


def signing_key(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def sign(secret: str, payload: str) -> str:
    digest = hmac.new(signing_key(secret), payload.encode("utf-8"), hashlib.sha256).digest()
    return _b64url(digest)


def _b64url(raw: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def make_token(account: Account, secret: str) -> str:
    exp = int(time.time() * 1000) + SESSION_DAYS * 86400000
    payload = f"v2.{account.id}.{account.token_version}.{exp}"
    return f"{payload}.{sign(secret, payload)}"


def parse_token(token: str | None, secret: str) -> TokenPayload | None:
    if not token:
        return None
    parts = str(token).split(".")
    if len(parts) != 5 or parts[0] != "v2":
        return None
    payload = f"{parts[0]}.{parts[1]}.{parts[2]}.{parts[3]}"
    if not timing_safe_equal(sign(secret, payload), parts[4]):
        return None
    try:
        exp = int(parts[3])
    except ValueError:
        return None
    if int(time.time() * 1000) >= exp:
        return None
    try:
        version = int(parts[2])
    except ValueError:
        return None
    return TokenPayload(account_id=parts[1], token_version=version)


def parse_cookies(header: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if not header:
        return out
    for part in header.split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        try:
            from urllib.parse import unquote

            out[key] = unquote(value)
        except Exception:
            out[key] = value
    return out


def session_cookie_header(token: str, settings: Settings) -> str:
    parts = [
        f"rs_session={token}",
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        f"Max-Age={SESSION_DAYS * 86400}",
    ]
    if settings.secure_cookie:
        parts.append("Secure")
    return "; ".join(parts)


def clear_session_cookie_header() -> str:
    return "rs_session=; Path=/; HttpOnly; Max-Age=0"


def new_account_id() -> str:
    return "acct_" + secrets.token_hex(8)


def normalise_username(raw: str) -> str:
    return str(raw or "").strip().lower()


def get_secret(settings: Settings) -> str:
    return resolve_secret(settings)


def client_ip(forwarded: str | None, fallback: str | None) -> str:
    if forwarded:
        return forwarded.split(",")[0].strip() or (fallback or "?")
    return fallback or "?"


def read_env_secret(settings: Settings) -> str:
    env = os.environ.get("RENT_SPLIT_SECRET", "").strip()
    if env:
        return env
    return get_secret(settings)
