from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import USERNAME_RE, hash_password, new_account_id, normalise_username, password_matches
from app.config import Settings
from app.errors import AccountError, AccountErrorCode
from app.models import Account, utc_now_iso
from app.schemas import PublicAccount


def public_of(account: Account) -> PublicAccount:
    role = account.role if account.role in ("admin", "tenant") else "tenant"
    return PublicAccount(
        id=account.id,
        username=account.username,
        personId=account.person_id,
        role=role,  # type: ignore[arg-type]
        enabled=account.enabled,
        passwordSetAt=account.password_set_at,
    )


def assert_username(username: str) -> None:
    if not USERNAME_RE.match(username):
        raise AccountError(
            AccountErrorCode.BAD_USERNAME,
            "Username must be 2–32 letters, numbers or underscores.",
        )


def list_accounts(session: Session) -> list[Account]:
    return list(session.scalars(select(Account).order_by(Account.username)).all())


def get_by_id(session: Session, account_id: str) -> Account | None:
    return session.get(Account, account_id)


def get_by_username(session: Session, username: str) -> Account | None:
    normalised = normalise_username(username)
    return session.scalar(select(Account).where(Account.username == normalised))


def authenticate(session: Session, username: str, password: str) -> Account | None:
    account = get_by_username(session, username)
    if account is None or not account.enabled:
        return None
    if not password_matches(password, account):
        return None
    return account


def enabled_admins(session: Session, exclude_id: str | None = None) -> list[Account]:
    rows = list(
        session.scalars(select(Account).where(Account.role == "admin", Account.enabled.is_(True))).all()
    )
    if exclude_id:
        rows = [a for a in rows if a.id != exclude_id]
    return rows


def demote_other_admins(session: Session, keep_id: str) -> None:
    for account in list_accounts(session):
        if account.id == keep_id or account.role != "admin":
            continue
        if not account.person_id:
            raise AccountError(
                AccountErrorCode.NEED_PERSON,
                "Link the current admin to a person before handing admin to someone else.",
            )
        account.role = "tenant"


def create_account(
    session: Session,
    *,
    username: str,
    password: str,
    person_id: str | None,
    role: str,
) -> Account:
    username = normalise_username(username)
    assert_username(username)
    if not password or len(str(password)) < 4:
        raise AccountError(AccountErrorCode.BAD_PASSWORD, "Password must be at least 4 characters.")
    if role not in ("admin", "tenant"):
        raise AccountError(AccountErrorCode.BAD_ROLE, "Role must be admin or tenant.")
    if role == "tenant" and not person_id:
        raise AccountError(AccountErrorCode.NEED_PERSON, "A tenant login has to be linked to a person.")
    if get_by_username(session, username) is not None:
        raise AccountError(AccountErrorCode.USERNAME_TAKEN, "That username is already taken.")
    if role == "admin":
        unlinked = next(
            (a for a in list_accounts(session) if a.role == "admin" and a.enabled and not a.person_id),
            None,
        )
        if unlinked is not None:
            raise AccountError(
                AccountErrorCode.NEED_PERSON,
                "Link the current admin to a person before handing admin to someone else.",
            )
        for account in list_accounts(session):
            if account.role == "admin":
                account.role = "tenant"
    salt, hashed = hash_password(password)
    account = Account(
        id=new_account_id(),
        username=username,
        person_id=person_id or None,
        password_hash=hashed,
        salt=salt,
        role=role,
        enabled=True,
        token_version=1,
        password_set_at=utc_now_iso(),
    )
    session.add(account)
    session.flush()
    return account


def update_account(session: Session, account_id: str, patch: dict[str, object]) -> Account:
    account = get_by_id(session, account_id)
    if account is None:
        raise AccountError(AccountErrorCode.MISSING, "No such account.")
    if "username" in patch and patch["username"] is not None:
        username = normalise_username(str(patch["username"]))
        assert_username(username)
        other = get_by_username(session, username)
        if other is not None and other.id != account_id:
            raise AccountError(AccountErrorCode.USERNAME_TAKEN, "That username is already taken.")
        account.username = username
    if "personId" in patch:
        person_id = patch["personId"]
        account.person_id = str(person_id) if person_id else None
    if patch.get("password"):
        password = str(patch["password"])
        if len(password) < 4:
            raise AccountError(AccountErrorCode.BAD_PASSWORD, "Password must be at least 4 characters.")
        salt, hashed = hash_password(password)
        account.salt = salt
        account.password_hash = hashed
        account.password_set_at = utc_now_iso()
        account.token_version = (account.token_version or 1) + 1
    if isinstance(patch.get("enabled"), bool):
        enabled = bool(patch["enabled"])
        if enabled is False and account.role == "admin" and not enabled_admins(session, account_id):
            raise AccountError(AccountErrorCode.LAST_ADMIN, "Cannot disable the only admin.")
        account.enabled = enabled
        if enabled is False:
            account.token_version = (account.token_version or 1) + 1
    if patch.get("role") in ("admin", "tenant"):
        role = str(patch["role"])
        if role == "tenant" and account.role == "admin" and not enabled_admins(session, account_id):
            raise AccountError(AccountErrorCode.LAST_ADMIN, "Promote someone else to admin first.")
        account.role = role
    if account.role == "tenant" and not account.person_id:
        raise AccountError(AccountErrorCode.NEED_PERSON, "A tenant login has to be linked to a person.")
    if account.role == "admin" and account.enabled:
        demote_other_admins(session, account.id)
    session.flush()
    return account


def remove_account(session: Session, account_id: str) -> None:
    account = get_by_id(session, account_id)
    if account is None:
        raise AccountError(AccountErrorCode.MISSING, "No such account.")
    if account.role == "admin" and account.enabled and not enabled_admins(session, account_id):
        raise AccountError(AccountErrorCode.LAST_ADMIN, "Cannot remove the only admin.")
    session.delete(account)
    session.flush()


def disable_for_person(session: Session, person_id: str) -> None:
    if not person_id:
        return
    for account in list_accounts(session):
        if account.person_id != person_id or not account.enabled:
            continue
        if account.role == "admin":
            continue
        account.enabled = False
        account.token_version = (account.token_version or 1) + 1
    session.flush()


def ensure_seeded(session: Session, settings: Settings) -> Account | None:
    if list_accounts(session):
        return None
    username = normalise_username(settings.admin_user)
    assert_username(username)
    if not settings.admin_password or len(str(settings.admin_password)) < 4:
        raise AccountError(AccountErrorCode.BAD_PASSWORD, "Seed admin password is too short.")
    salt, hashed = hash_password(settings.admin_password)
    admin = Account(
        id=new_account_id(),
        username=username,
        person_id=None,
        password_hash=hashed,
        salt=salt,
        role="admin",
        enabled=True,
        token_version=1,
        password_set_at=utc_now_iso(),
    )
    session.add(admin)
    session.flush()
    return admin
