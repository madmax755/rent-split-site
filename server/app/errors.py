from __future__ import annotations


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
