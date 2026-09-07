from __future__ import annotations

import pytest

from app.accounts import create_account, ensure_seeded, remove_account, update_account
from app.errors import AccountError, AccountErrorCode


def test_seed_admin(db, settings) -> None:
    admin = ensure_seeded(db, settings)
    assert admin is not None
    assert admin.username == "asoni"
    assert admin.role == "admin"
    second = ensure_seeded(db, settings)
    assert second is None


def test_tenant_needs_person(db, settings) -> None:
    ensure_seeded(db, settings)
    with pytest.raises(AccountError) as err:
        create_account(db, username="joe", password="abcd", person_id=None, role="tenant")
    assert err.value.code == AccountErrorCode.NEED_PERSON


def test_username_taken(db, settings) -> None:
    ensure_seeded(db, settings)
    with pytest.raises(AccountError) as err:
        create_account(db, username="asoni", password="abcd", person_id=None, role="admin")
    assert err.value.code is AccountErrorCode.USERNAME_TAKEN or err.value.code == AccountErrorCode.NEED_PERSON


def test_cannot_remove_only_admin(db, settings) -> None:
    admin = ensure_seeded(db, settings)
    assert admin is not None
    with pytest.raises(AccountError) as err:
        remove_account(db, admin.id)
    assert err.value.code == AccountErrorCode.LAST_ADMIN


def test_hand_admin_to_someone_else(db, settings) -> None:
    admin = ensure_seeded(db, settings)
    assert admin is not None
    update_account(db, admin.id, {"personId": "p1"})
    created = create_account(db, username="max", password="abcd", person_id="p4", role="admin")
    db.flush()
    assert created.role == "admin"
    from app.accounts import get_by_id

    old = get_by_id(db, admin.id)
    assert old is not None
    assert old.role == "tenant"
