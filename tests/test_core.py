from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from bson import ObjectId
from bson.int64 import Int64
from pymongo.errors import DuplicateKeyError, WriteError

from app import create_app
from app.errors import APIError
from app.services.payments import FAILURE_POINTS, canonical_reversal, canonical_transfer, create_account, execute
from app.services.reconciliation import Reconciler
from app.services.stats import day_bounds
from app.validation import fingerprint, handle, money, now
from scripts.common import resolve


def transfer(amount=2500, request_key=None):
    return canonical_transfer({"from": "asha@upi", "to": "rahul@upi", "amount": amount, "idempotency_key": request_key or str(uuid4())})


def balances(db):
    return {a["handle"]: (int(a["balance_paise"]), int(a["version"])) for a in db.accounts.find()}


@pytest.mark.parametrize("value", [True, False, 1.0, "1", 0, -1, 100000001, None, []])
def test_money_rejects_invalid_types_and_bounds(value):
    with pytest.raises(APIError):
        money(value)


def test_normalization_digest_and_day_boundary():
    assert handle(" Asha@UPI ") == "asha@upi"
    assert fingerprint({"a": 1, "b": 2}) == fingerprint({"b": 2, "a": 1})
    assert fingerprint({"a": 1}) != fingerprint({"a": 2})
    start, end = day_bounds(datetime(2026, 10, 27, 0, tzinfo=timezone.utc), "Asia/Kolkata")
    assert start.astimezone(timezone.utc).isoformat() == "2026-10-26T18:30:00+00:00"
    assert end - start == timedelta(days=1)


@pytest.mark.integration
def test_atomic_transfer_replay_failure_and_restart(funded, tmp_path):
    db = funded
    k, payload = transfer()
    body, status, replay = execute(db, k, payload)
    assert status == 201 and not replay
    assert balances(db)["asha@upi"] == (97500, 2)
    assert balances(db)["rahul@upi"] == (52500, 2)
    assert execute(db, k, payload) == (body, 201, True)
    changed = dict(payload, amount=Int64(2501))
    with pytest.raises(APIError, match="different request"):
        execute(db, k, changed)
    app = create_app({"TESTING": True, "REPORT_DIR": str(tmp_path)}, database=db)
    response = app.test_client().post("/api/transfers", json={"from": "asha@upi", "to": "rahul@upi", "amount": 2500, "idempotency_key": k})
    assert response.status_code == 201 and response.json == body and response.headers["Idempotency-Replayed"] == "true"
    assert Reconciler(db, tmp_path).run()["status"] == "BALANCED"


@pytest.mark.integration
@pytest.mark.parametrize("point", sorted(FAILURE_POINTS))
def test_every_midtransaction_failure_aborts_every_financial_write(funded, point):
    before = balances(funded)
    counts = (funded.transactions.count_documents({}), funded.ledger_entries.count_documents({}))
    k, payload = transfer()
    result = execute(funded, k, payload, point)
    assert result[1] == 500 and result[0]["error"]["code"] == "DEMO_FAILURE"
    assert balances(funded) == before
    assert (funded.transactions.count_documents({}), funded.ledger_entries.count_documents({})) == counts
    assert funded.transactions.count_documents({"idempotency_key": k}) == 0
    assert execute(funded, k, payload) == (result[0], 500, True)


@pytest.mark.integration
def test_failed_result_stays_failed_after_funding_changes(funded):
    k, payload = transfer(200000)
    original = execute(funded, k, payload)
    assert original[1] == 409
    # A separate real account opening and transfer funds the original source.
    create_account(funded, {"handle": "meera@upi", "display_name": "Meera", "opening_balance": 500000})
    fund = canonical_transfer({"from": "meera@upi", "to": "asha@upi", "amount": 300000, "idempotency_key": str(uuid4())})
    assert execute(funded, *fund)[1] == 201
    assert execute(funded, k, payload) == (original[0], 409, True)
    assert execute(funded, *transfer(200000))[1] == 201


@pytest.mark.integration
def test_openings_zero_duplicate_and_frozen(db, tmp_path):
    result = create_account(db, {"handle": "zero@upi", "display_name": "Zero", "opening_balance": 0})
    assert result["opening_transaction_id"] is None and result["account"]["version"] == 0
    create_account(db, {"handle": "cold@upi", "display_name": "Frozen", "opening_balance": 1000, "status": "FROZEN"})
    before = balances(db)
    with pytest.raises(APIError) as exc:
        create_account(db, {"handle": " COLD@UPI ", "display_name": "Again", "opening_balance": 1000})
    assert exc.value.code == "HANDLE_EXISTS" and balances(db) == before
    assert Reconciler(db, tmp_path).run()["status"] == "BALANCED"


@pytest.mark.integration
def test_reversal_is_new_entries_original_unchanged(funded, tmp_path):
    result = execute(funded, *transfer())[0]
    original = funded.transactions.find_one({"_id": ObjectId(result["transaction_id"])})
    k, payload = canonical_reversal(funded, result["transaction_id"], {"idempotency_key": str(uuid4())})
    reversed_result = execute(funded, k, payload)
    assert reversed_result[1] == 201
    assert balances(funded)["asha@upi"][0] == 100000
    assert funded.transactions.find_one({"_id": original["_id"]}) == original
    assert execute(funded, k, payload) == (reversed_result[0], 201, True)
    assert execute(funded, str(uuid4()), payload)[0]["error"]["code"] == "ALREADY_REVERSED"
    assert Reconciler(funded, tmp_path).run()["status"] == "BALANCED"


@pytest.mark.integration
def test_validators_and_unique_indexes(funded):
    with pytest.raises(WriteError):
        funded.accounts.insert_one({"handle": "invalid"})
    doc = funded.accounts.find_one({"handle": "asha@upi"})
    for change in ({"balance_paise": -1}, {"balance_paise": 1.5}, {"unexpected": "field"}, {"status": "BROKEN"}):
        changed = {**doc, **change, "_id": ObjectId(), "handle": "test@upi"}
        with pytest.raises(WriteError):
            funded.accounts.insert_one(changed)
    duplicate = dict(doc, _id=ObjectId())
    with pytest.raises(DuplicateKeyError):
        funded.accounts.insert_one(duplicate)
    entry = funded.ledger_entries.find_one()
    with pytest.raises(DuplicateKeyError):
        funded.ledger_entries.insert_one(dict(entry, _id=ObjectId()))


@pytest.mark.integration
def test_api_filters_states_errors_and_reports(client):
    assert client.get("/api/health").json["status"] == "READY"
    assert client.get("/api/reconciliation/latest").json == {"run": None}
    assert client.get("/api/accounts?limit=101").status_code == 400
    assert client.get("/api/transactions?type=BOGUS").status_code == 400
    assert client.post("/api/transfers", data="no").status_code == 415
    assert client.post("/api/transfers", json=[]).status_code == 400
    assert client.post("/api/transfers", json={"a": "x"}).status_code == 400
    result = client.post("/api/transfers", json={"from": "asha@upi", "to": "rahul@upi", "amount": 100, "idempotency_key": str(uuid4())})
    assert result.status_code == 201
    assert len(client.get(f"/api/transactions/{result.json['transaction_id']}/entries").json["entries"]) == 2
    run = client.post("/api/reconciliation/run", json={})
    assert run.status_code == 201 and run.json["run"]["status"] == "BALANCED"
    assert client.get(run.json["run"]["report_url"]).status_code == 200
    assert client.get("/api/stats").json["transfers_today"] == 1
    page = client.get("/api/accounts?limit=1").json
    assert len(page["items"]) == 1 and page["next_cursor"]
    following = client.get("/api/accounts?limit=1&cursor=" + page["next_cursor"]).json
    assert following["items"][0]["id"] != page["items"][0]["id"]


@pytest.mark.integration
def test_expired_reservation_recovery_fences_old_owner(funded, monkeypatch):
    import app.services.payments as payments
    k, payload = transfer()
    real_transact = payments.transact
    monkeypatch.setattr(payments, "transact", lambda *a, **kw: (_ for _ in ()).throw(payments.OutcomeUnknown()))
    assert execute(funded, k, payload)[1] == 202
    old = funded.transfer_requests.find_one({"idempotency_key": k})
    funded.transfer_requests.update_one({"_id": old["_id"]}, {"$set": {"lease_expires_at": now() - timedelta(seconds=1)}})
    monkeypatch.setattr(payments, "transact", real_transact)
    result = execute(funded, k, payload)
    assert result[1] == 201
    current = funded.transfer_requests.find_one({"_id": old["_id"]})
    assert current["owner_token"] != old["owner_token"]
    assert funded.transfer_requests.update_one({"_id": old["_id"], "owner_token": old["owner_token"], "state": "PROCESSING"}, {"$inc": {"fence_version": Int64(1)}}).matched_count == 0
    assert funded.transactions.count_documents({"idempotency_key": k}) == 1


@pytest.mark.integration
@pytest.mark.parametrize("mutation,expected", [("balance", "ACCOUNT_BALANCE_MISMATCH"), ("delete", "ENTRY_PAIR_INVALID"), ("historical", "BALANCE_AFTER_MISMATCH"), ("amount", "ENTRY_AMOUNT_MISMATCH"), ("orphan", "ORPHAN_ENTRY")])
def test_reconciliation_finds_specific_corruption(funded, tmp_path, mutation, expected):
    tid = ObjectId(execute(funded, *transfer())[0]["transaction_id"])
    entry = funded.ledger_entries.find_one({"transaction_id": tid, "direction": "CREDIT"})
    if mutation == "balance":
        funded.accounts.update_one({"handle": "asha@upi"}, {"$inc": {"balance_paise": Int64(1)}})
    elif mutation == "delete":
        funded.ledger_entries.delete_one({"_id": entry["_id"]})
    elif mutation == "historical":
        funded.ledger_entries.update_one({"_id": entry["_id"]}, {"$inc": {"balance_after_paise": Int64(1)}})
    elif mutation == "amount":
        funded.ledger_entries.update_many({"transaction_id": tid}, {"$inc": {"amount_paise": Int64(1)}})
    else:
        funded.ledger_entries.update_one({"_id": entry["_id"]}, {"$set": {"transaction_id": ObjectId()}})
    run = Reconciler(funded, tmp_path).run()
    assert run["status"] == "UNBALANCED" and expected in {f["code"] for f in run["findings_preview"]}


@pytest.mark.concurrency
def test_100_identical_requests_one_movement(funded, tmp_path):
    kp = transfer()
    with ThreadPoolExecutor(50) as pool:
        results = list(pool.map(lambda _: resolve(funded, *kp), range(100)))
    assert all(r[1] == 201 for r in results)
    assert len({r[0]["transaction_id"] for r in results}) == 1
    assert funded.transactions.count_documents({"idempotency_key": kp[0]}) == 1
    assert Reconciler(funded, tmp_path).run()["status"] == "BALANCED"


@pytest.mark.concurrency
def test_200_spends_only_100_affordable(db, tmp_path):
    for account, balance in (("asha@upi", 10000), ("rahul@upi", 0)):
        create_account(db, {"handle": account, "display_name": account, "opening_balance": balance})
    with ThreadPoolExecutor(50) as pool:
        results = list(pool.map(lambda _: resolve(db, *transfer(100)), range(200)))
    assert sum(r[1] == 201 for r in results) == 100
    assert sum(r[0].get("error", {}).get("code") == "INSUFFICIENT_FUNDS" for r in results) == 100
    assert balances(db)["asha@upi"][0] == 0
    assert Reconciler(db, tmp_path).run()["status"] == "BALANCED"


@pytest.mark.integration
def test_lost_commit_acknowledgment_never_double_charges(funded, monkeypatch):
    import app.services.payments as payments
    from pymongo.synchronous.client_session import ClientSession
    from pymongo.errors import ConnectionFailure
    real_commit, real_transact = ClientSession.commit_transaction, payments.transact

    def lost_ack(session):
        real_commit(session)
        raise ConnectionFailure("Simulated lost commit acknowledgment", error_labels=["UnknownTransactionCommitResult"])

    monkeypatch.setattr(ClientSession, "commit_transaction", lost_ack)
    monkeypatch.setattr(payments, "transact", lambda db, callback: real_transact(db, callback, budget=.05))
    k, payload = transfer()
    assert execute(funded, k, payload)[1] == 202
    monkeypatch.setattr(ClientSession, "commit_transaction", real_commit)
    monkeypatch.setattr(payments, "transact", real_transact)
    result = execute(funded, k, payload)
    assert result[1:] == (201, True)
    assert funded.transactions.count_documents({"idempotency_key": k}) == 1
    assert balances(funded)["asha@upi"][0] == 97500


@pytest.mark.integration
def test_database_permissions_enforce_append_only(funded):
    import os
    from pymongo import MongoClient
    from pymongo.errors import OperationFailure
    from app.db import install_runtime_role
    if not funded.client.admin.command("getCmdLineOpts").get("parsed", {}).get("security", {}).get("authorization") == "enabled":
        pytest.skip("MongoDB authorization is disabled; append-only permission guarantee has not been verified.")
    username, password = "runtime_" + uuid4().hex[:8], uuid4().hex
    install_runtime_role(funded, username, password)
    client = MongoClient(os.getenv("TEST_MONGODB_URI", "mongodb://localhost:27017/?replicaSet=rs0"), username=username, password=password,
                         authSource=funded.name, tz_aware=True, serverSelectionTimeoutMS=2000)
    runtime = client[funded.name]
    try:
        assert execute(runtime, *transfer())[1] == 201
        for collection in (runtime.transactions, runtime.ledger_entries):
            existing = collection.find_one()
            with pytest.raises(OperationFailure) as update:
                collection.update_one({"_id": existing["_id"]}, {"$set": {"created_at": now()}})
            assert update.value.code == 13
            with pytest.raises(OperationFailure) as delete:
                collection.delete_one({"_id": existing["_id"]})
            assert delete.value.code == 13
    finally:
        client.close()


@pytest.mark.integration
def test_reconciliation_report_complete_beyond_preview(db, tmp_path):
    for i in range(105):
        create_account(db, {"handle": f"user{i:04}@upi", "display_name": f"Account {i}", "opening_balance": 0})
    db.accounts.update_many({"kind": "USER"}, {"$inc": {"balance_paise": Int64(1)}})
    run = Reconciler(db, tmp_path).run()
    assert run["status"] == "UNBALANCED" and run["details_truncated"]
    assert len(run["findings_preview"]) == 100
    lines = (tmp_path / run["report_name"]).read_text(encoding="utf-8").splitlines()
    assert len(lines) == run["finding_count"] == 106


@pytest.mark.integration
def test_failed_scan_is_error_without_false_totals(funded, tmp_path):
    reconciler = Reconciler(funded, tmp_path)
    assert reconciler.run()["status"] == "BALANCED"
    failed = reconciler.run(budget=0)
    assert failed["status"] == "ERROR" and "total_debits_paise" not in failed and "report_name" not in failed


@pytest.mark.integration
def test_stats_exact_cohorts(funded, tmp_path):
    from app.services.stats import summary
    first = None
    for _ in range(10):
        kp = transfer(100)
        assert execute(funded, *kp)[1] == 201
        first = first or kp
    for _ in range(2):
        assert execute(funded, *transfer(200000))[1] == 409
    for _ in range(3):
        assert execute(funded, *first)[2]
    stats = summary(funded, "Asia/Kolkata")
    assert (stats["transfers_today"], stats["success_rate_percent"], stats["duplicates_blocked"], stats["rolled_back_count"]) == (10, 83.33, 3, 2)


@pytest.mark.integration
def test_demo_mode_cannot_be_enabled_by_header(funded, tmp_path):
    client = create_app({"TESTING": True, "DEMO_MODE": False, "REPORT_DIR": str(tmp_path)}, database=funded).test_client()
    response = client.post("/api/transfers", json={"from": "asha@upi", "to": "rahul@upi", "amount": 100, "idempotency_key": str(uuid4())}, headers={"X-Demo-Failure": "after_debit"})
    assert response.status_code == 422 and response.json["error"]["code"] == "DEMO_MODE_DISABLED"
    assert funded.transactions.count_documents({"type": "TRANSFER"}) == 0
