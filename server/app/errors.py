from __future__ import annotations

from enum import Enum


class FormatMismatch(Enum):
    """Why a write was refused for being in a different data format."""

    STINTS_FORMAT = "stints_format"
    DOWNGRADE = "downgrade"


class FormatMismatchError(Exception):
    """A write would mix two data formats in one stored household."""

    def __init__(self, reason: FormatMismatch, stored: int, sent: int | None) -> None:
        self.reason = reason
        self.stored = stored
        self.sent = sent
        super().__init__("This page is out of date with the saved household. Reload the page.")


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
