from __future__ import annotations

from enum import StrEnum


class AccountErrorCode(StrEnum):
    BAD_USERNAME = "bad_username"
    BAD_PASSWORD = "bad_password"
    BAD_ROLE = "bad_role"
    NEED_PERSON = "need_person"
    USERNAME_TAKEN = "username_taken"
    LAST_ADMIN = "last_admin"
    MISSING = "missing"


class AccountError(Exception):
    def __init__(self, code: AccountErrorCode, message: str) -> None:
        self.code = code
        super().__init__(message)


class ConflictError(Exception):
    def __init__(self, rev: int) -> None:
        self.rev = rev
        super().__init__("conflict")


class NoHouseholdError(Exception):
    def __init__(self, message: str = "No household data to change.") -> None:
        super().__init__(message)


class StintWriteError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)


class ApiError(Exception):
    def __init__(self, status: int, message: str, rev: int | None = None) -> None:
        self.status = status
        self.message = message
        self.rev = rev
        super().__init__(message)


ACCOUNT_ERROR_STATUS: dict[AccountErrorCode, int] = {
    AccountErrorCode.BAD_USERNAME: 400,
    AccountErrorCode.BAD_PASSWORD: 400,
    AccountErrorCode.BAD_ROLE: 400,
    AccountErrorCode.NEED_PERSON: 400,
    AccountErrorCode.USERNAME_TAKEN: 400,
    AccountErrorCode.LAST_ADMIN: 400,
    AccountErrorCode.MISSING: 404,
}
