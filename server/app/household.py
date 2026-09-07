from __future__ import annotations

import json
import threading
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import HOUSEHOLD_ID, MAX_BACKUPS, Settings, get_settings
from app.errors import ConflictError, NoHouseholdError
from app.models import (
    Bill,
    BillPayer,
    Household,
    LedgerEntry,
    Month,
    MonthCharge,
    MonthLine,
    OneOff,
    OneOffPayer,
    Person,
    Preset,
    Room,
    Stint,
    utc_now_iso,
)
from app.schemas import (
    DataEnvelope,
    HouseholdData,
    LedgerEntryModel,
    StoredDocument,
)

_write_lock = threading.Lock()


def json_num(value: float | int | None) -> float | int | None:
    if value is None:
        return None
    number = float(value)
    if number.is_integer():
        return int(number)
    return number


def _payers_out(restricted: bool, rows: list[Any]) -> list[str] | None:
    if not restricted:
        return None
    ordered = sorted(rows, key=lambda row: row.sort_index)
    return [row.person_id for row in ordered]


def _payers_in(person_ids: list[str] | None) -> tuple[bool, list[str]]:
    if person_ids is None:
        return False, []
    return True, list(person_ids)


def load_household(session: Session) -> Household | None:
    return session.scalar(
        select(Household)
        .where(Household.id == HOUSEHOLD_ID)
        .options(
            selectinload(Household.people),
            selectinload(Household.rooms),
            selectinload(Household.bills).selectinload(Bill.payers),
            selectinload(Household.months).selectinload(Month.lines),
            selectinload(Household.months).selectinload(Month.charges),
            selectinload(Household.months).selectinload(Month.one_offs).selectinload(OneOff.payers),
            selectinload(Household.months).selectinload(Month.stints),
            selectinload(Household.ledger),
            selectinload(Household.presets),
        )
    )


def assemble_data(household: Household) -> dict[str, Any]:
    people = [
        {
            "id": p.id,
            "name": p.name,
            "isPayer": p.is_payer,
            "archived": p.archived,
        }
        for p in sorted(household.people, key=lambda x: x.sort_index)
    ]
    rooms = [
        {
            "id": r.id,
            "name": r.name,
            "w": json_num(r.width),
            "l": json_num(r.length),
            "weight": json_num(r.weight),
            "communal": r.communal,
        }
        for r in sorted(household.rooms, key=lambda x: x.sort_index)
    ]
    bills = [
        {
            "id": b.id,
            "name": b.name,
            "est": json_num(b.est),
            "payers": _payers_out(b.payers_restricted, list(b.payers)),
        }
        for b in sorted(household.bills, key=lambda x: x.sort_index)
    ]
    months: dict[str, Any] = {}
    for month in household.months:
        lines = {
            line.bill_id: {"est": json_num(line.est), "act": json_num(line.act)} for line in month.lines
        }
        one_offs = [
            {
                "id": item.id,
                "name": item.name,
                "est": json_num(item.est),
                "act": json_num(item.act),
                "payers": _payers_out(item.payers_restricted, list(item.payers)),
            }
            for item in sorted(month.one_offs, key=lambda x: x.sort_index)
        ]
        stints = [
            {
                "id": stint.id,
                "personId": stint.person_id,
                "roomId": stint.room_id,
                "from": stint.from_day,
                "to": stint.to_day,
            }
            for stint in sorted(month.stints, key=lambda x: x.sort_index)
        ]
        charged: dict[str, float | int] | None
        if month.charged_is_null:
            charged = None
        else:
            charged = {c.person_id: json_num(c.amount) or 0 for c in month.charges}
        months[month.key] = {
            "key": month.key,
            "rent": json_num(month.rent),
            "lines": lines,
            "oneOffs": one_offs,
            "stints": stints,
            "collected": month.collected,
            "charged": charged,
            "chargedAt": month.charged_at,
            "note": month.note,
            "config": month.config,
        }
    ledger = [
        {
            "id": entry.id,
            "personId": entry.person_id,
            "monthKey": entry.month_key,
            "type": entry.type,
            "amount": int(entry.amount),
            "date": entry.date,
            "note": entry.note,
        }
        for entry in sorted(household.ledger, key=lambda x: x.sort_index)
    ]
    presets = [
        {"name": preset.name, "snapshot": preset.snapshot}
        for preset in sorted(household.presets, key=lambda x: x.sort_index)
    ]
    return {
        "currency": household.currency,
        "rent": json_num(household.rent),
        "catchall": json_num(household.catchall),
        "catchallWeight": json_num(household.catchall_weight),
        "rooms": rooms,
        "people": people,
        "bills": bills,
        "months": months,
        "ledger": ledger,
        "presets": presets,
        "activePresetName": household.active_preset_name,
        "currentMonth": household.current_month,
        "sectionsOpen": dict(household.sections_open or {}),
    }


def assemble_payload(household: Household) -> dict[str, Any]:
    return {
        "app": "rent-split",
        "schema": household.schema_version,
        "savedAt": household.saved_at,
        "data": assemble_data(household),
    }


def assemble_document(household: Household | None) -> StoredDocument:
    if household is None:
        return StoredDocument(rev=0, savedAt=None, payload=None)
    return StoredDocument(
        rev=household.rev,
        savedAt=household.saved_at,
        payload=assemble_payload(household),
    )


def tenant_document(doc: StoredDocument, person_id: str) -> StoredDocument:
    payload = doc.payload
    if payload is None:
        return doc
    data = payload.get("data")
    if not isinstance(data, dict):
        return doc
    ledger = data.get("ledger")
    filtered = (
        [entry for entry in ledger if isinstance(entry, dict) and entry.get("personId") == person_id]
        if isinstance(ledger, list)
        else []
    )
    return StoredDocument(
        rev=doc.rev,
        savedAt=doc.savedAt,
        payload={
            **payload,
            "data": {
                **data,
                "ledger": filtered,
                "presets": [],
            },
        },
    )


def person_name(household: Household | None, person_id: str | None) -> str | None:
    if household is None or not person_id:
        return None
    for person in household.people:
        if person.id == person_id:
            return person.name
    return None


def _clear_live_rows(session: Session, household: Household) -> None:
    household.people.clear()
    household.rooms.clear()
    household.bills.clear()
    household.months.clear()
    household.ledger.clear()
    household.presets.clear()
    session.flush()


def apply_envelope(session: Session, household: Household, envelope: DataEnvelope) -> None:
    data = envelope.data
    household.schema_version = envelope.schema_version
    household.currency = data.currency
    household.rent = float(data.rent)
    household.catchall = float(data.catchall)
    household.catchall_weight = float(data.catchallWeight)
    household.current_month = data.currentMonth
    household.active_preset_name = data.activePresetName
    household.sections_open = dict(data.sectionsOpen)
    _clear_live_rows(session, household)

    for index, person in enumerate(data.people):
        session.add(
            Person(
                id=person.id,
                household_id=household.id,
                name=person.name,
                is_payer=person.isPayer,
                archived=person.archived,
                sort_index=index,
            )
        )
    for index, room in enumerate(data.rooms):
        session.add(
            Room(
                id=room.id,
                household_id=household.id,
                name=room.name,
                width=float(room.w),
                length=float(room.l),
                weight=float(room.weight),
                communal=room.communal,
                sort_index=index,
            )
        )
    for index, bill in enumerate(data.bills):
        restricted, payer_ids = _payers_in(bill.payers)
        row = Bill(
            id=bill.id,
            household_id=household.id,
            name=bill.name,
            est=float(bill.est),
            payers_restricted=restricted,
            sort_index=index,
        )
        session.add(row)
        session.flush()
        for payer_index, person_id in enumerate(payer_ids):
            session.add(BillPayer(bill_id=bill.id, person_id=person_id, sort_index=payer_index))

    for month_key, month in data.months.items():
        key = month.key or month_key
        month_row = Month(
            key=key,
            household_id=household.id,
            rent=None if month.rent is None else float(month.rent),
            collected=month.collected,
            charged_is_null=month.charged is None,
            charged_at=month.chargedAt,
            note=month.note,
            config=month.config,
        )
        session.add(month_row)
        session.flush()
        for bill_id, line in month.lines.items():
            session.add(
                MonthLine(
                    month_key=key,
                    bill_id=bill_id,
                    est=float(line.est),
                    act=None if line.act is None else float(line.act),
                )
            )
        if month.charged is not None:
            for person_id, amount in month.charged.items():
                session.add(MonthCharge(month_key=key, person_id=person_id, amount=float(amount)))
        for index, item in enumerate(month.oneOffs):
            restricted, payer_ids = _payers_in(item.payers)
            session.add(
                OneOff(
                    id=item.id,
                    month_key=key,
                    name=item.name,
                    est=float(item.est),
                    act=None if item.act is None else float(item.act),
                    payers_restricted=restricted,
                    sort_index=index,
                )
            )
            session.flush()
            for payer_index, person_id in enumerate(payer_ids):
                session.add(
                    OneOffPayer(one_off_id=item.id, person_id=person_id, sort_index=payer_index)
                )
        for index, stint in enumerate(month.stints):
            session.add(
                Stint(
                    id=stint.id,
                    month_key=key,
                    person_id=stint.personId,
                    room_id=stint.roomId,
                    from_day=int(stint.from_day),
                    to_day=int(stint.to),
                    sort_index=index,
                )
            )

    for index, entry in enumerate(data.ledger):
        session.add(
            LedgerEntry(
                id=entry.id,
                household_id=household.id,
                person_id=entry.personId,
                month_key=entry.monthKey,
                type=entry.type,
                amount=int(round(entry.amount)),
                date=entry.date,
                note=entry.note,
                sort_index=index,
            )
        )
    for index, preset in enumerate(data.presets):
        session.add(
            Preset(
                household_id=household.id,
                name=preset.name,
                snapshot=preset.snapshot,
                sort_index=index,
            )
        )
    session.flush()


def parse_envelope(payload: dict[str, Any]) -> DataEnvelope:
    return DataEnvelope.model_validate(payload)


def write_backup(settings: Settings, document: StoredDocument) -> None:
    if document.payload is None:
        return
    settings.backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = utc_now_iso().replace(":", "-").replace(".", "-")
    path = settings.backup_dir / f"rent-split-{stamp}-rev{document.rev}.json"
    path.write_text(
        json.dumps({"rev": document.rev, "savedAt": document.savedAt, "payload": document.payload}),
        encoding="utf-8",
    )
    files = sorted(p for p in settings.backup_dir.glob("*.json") if p.is_file())
    extra = len(files) - MAX_BACKUPS
    for stale in files[: max(0, extra)]:
        try:
            stale.unlink()
        except OSError:
            pass


def put_household(
    session: Session,
    payload: dict[str, Any],
    expected_rev: int | None,
    force: bool,
    settings: Settings | None = None,
) -> StoredDocument:
    settings = settings or get_settings()
    envelope = parse_envelope(payload)
    household = load_household(session)
    current_rev = 0 if household is None else household.rev
    if not force and current_rev != 0 and expected_rev is not None and int(expected_rev) != current_rev:
        raise ConflictError(current_rev)
    previous = assemble_document(household)
    if household is None:
        household = Household(
            id=HOUSEHOLD_ID,
            rev=0,
            saved_at=None,
            schema_version=envelope.schema_version,
        )
        session.add(household)
        session.flush()
    else:
        write_backup(settings, previous)
    apply_envelope(session, household, envelope)
    household.rev = current_rev + 1
    household.saved_at = utc_now_iso()
    session.flush()
    return assemble_document(household)


def mutate_household(
    session: Session,
    fn: Any,
    expected_rev: int | None,
    force: bool,
    settings: Settings | None = None,
) -> StoredDocument:
    settings = settings or get_settings()
    household = load_household(session)
    if household is None:
        raise NoHouseholdError()
    if not force and expected_rev is not None and int(expected_rev) != household.rev:
        raise ConflictError(household.rev)
    write_backup(settings, assemble_document(household))
    fn(household)
    household.rev += 1
    household.saved_at = utc_now_iso()
    session.flush()
    return assemble_document(household)


def append_ledger(household: Household, entry: LedgerEntryModel) -> LedgerEntry:
    next_index = max((row.sort_index for row in household.ledger), default=-1) + 1
    row = LedgerEntry(
        id=entry.id,
        household_id=household.id,
        person_id=entry.personId,
        month_key=entry.monthKey,
        type=entry.type,
        amount=int(round(entry.amount)),
        date=entry.date,
        note=entry.note,
        sort_index=next_index,
    )
    household.ledger.append(row)
    return row


def remove_ledger(household: Household, entry_id: str) -> LedgerEntry:
    for entry in list(household.ledger):
        if entry.id == entry_id:
            household.ledger.remove(entry)
            return entry
    raise KeyError(entry_id)


def locked_write() -> threading.Lock:
    return _write_lock
