from datetime import timedelta
from uuid import uuid4

from bson import ObjectId
from bson.int64 import Int64
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from ..config import MAX_BALANCE, SYSTEM_FLOOR, SYSTEM_HANDLE
from ..db import transact
from ..errors import APIError, OutcomeUnknown, OwnershipLost
from ..validation import fields, fingerprint, handle, key, money, now, oid, public

FAILURE_POINTS = {"after_first_account", "after_both_accounts", "after_transaction", "after_debit", "before_commit"}


def account_public(doc):
    return public({"id": doc["_id"], "handle": doc["handle"], "display_name": doc["display_name"],
                   "status": doc["status"], "currency": "INR", "opening_balance": doc["opening_balance_paise"],
                   "balance": doc["balance_paise"], "version": doc["version"], "created_at": doc["created_at"]})


def transaction_public(doc):
    result = {"id": doc["_id"], "type": doc["type"], "status": doc["status"], "from": doc["from_handle"],
              "to": doc["to_handle"], "amount": doc["amount_paise"], "currency": "INR",
              "idempotency_key": doc["idempotency_key"], "created_at": doc["created_at"]}
    if "reversal_of" in doc:
        result["reversal_of"] = doc["reversal_of"]
    return public(result)


def post_movement(db, session, source, destination, amount, transaction, failure_point=None, opening=False):
    """Exactly two conditional balance/version writes and two immutable postings."""
    def fail(point):
        if failure_point == point:
            raise APIError("DEMO_FAILURE", f"Injected failure at {point}; all financial writes aborted.", 500)

    updated = {}
    for index, account in enumerate(sorted([source, destination], key=lambda d: d["_id"])):
        debit = account["_id"] == source["_id"]
        condition = {"_id": account["_id"]}
        if opening and debit:
            condition.update(kind="SYSTEM", balance_paise={"$gte": SYSTEM_FLOOR + amount})
        else:
            condition["kind"] = "USER"
            if not opening:
                condition["status"] = "ACTIVE"
            condition["balance_paise"] = {"$gte": amount} if debit else {"$lte": MAX_BALANCE - amount}
        result = db.accounts.find_one_and_update(condition, {"$inc": {"balance_paise": Int64(-amount if debit else amount), "version": Int64(1)},
                                                            "$set": {"updated_at": transaction["created_at"]}},
                                                 session=session, return_document=ReturnDocument.AFTER)
        if result is None:
            raise APIError("INSUFFICIENT_FUNDS" if debit else "BALANCE_LIMIT_EXCEEDED", "Account balance guard prevented the movement.", 409 if debit else 422)
        updated[account["_id"]] = result
        if index == 0:
            fail("after_first_account")
    fail("after_both_accounts")
    db.transactions.insert_one(transaction, session=session)
    fail("after_transaction")
    for direction, account in (("DEBIT", source), ("CREDIT", destination)):
        after = updated[account["_id"]]
        db.ledger_entries.insert_one({"_id": ObjectId(), "transaction_id": transaction["_id"], "account_id": account["_id"],
                                     "direction": direction, "amount_paise": Int64(amount), "balance_after_paise": after["balance_paise"],
                                     "account_version_after": after["version"], "created_at": transaction["created_at"]}, session=session)
        if direction == "DEBIT":
            fail("after_debit")
    fail("before_commit")
    return updated[source["_id"]], updated[destination["_id"]]


def create_account(db, data):
    fields(data, ("handle", "display_name", "opening_balance"), ("status",))
    normalized, amount = handle(data["handle"]), money(data["opening_balance"], opening=True)
    name, status = data["display_name"], data.get("status", "ACTIVE")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80 or not isinstance(status, str) or status not in {"ACTIVE", "FROZEN"}:
        raise APIError("VALIDATION_ERROR", "A display name (1–80 characters) and ACTIVE/FROZEN status are required.")
    account_id, txn_id, stamp = ObjectId(), ObjectId(), now()
    account = {"_id": account_id, "handle": normalized, "display_name": name.strip(), "kind": "USER", "status": status,
               "opening_balance_paise": amount, "balance_paise": Int64(0), "version": Int64(0), "created_at": stamp, "updated_at": stamp}

    def apply(session):
        if db.accounts.count_documents({"kind": "USER"}, session=session) >= 10_000:
            raise APIError("BALANCE_LIMIT_EXCEEDED", "The demonstration supports at most 10,000 user accounts.", 422)
        db.accounts.insert_one(dict(account), session=session)
        result = account
        if amount:
            source = db.accounts.find_one({"handle": SYSTEM_HANDLE}, session=session)
            if source is None:
                raise APIError("SCHEMA_NOT_READY", "Bootstrap the opening-equity account first.", 503)
            transaction = {"_id": txn_id, "type": "OPENING", "status": "COMMITTED", "idempotency_key": f"opening:{account_id}",
                           "request_fingerprint": fingerprint({"operation": "OPENING", "to": normalized, "amount": amount}),
                           "from_account_id": source["_id"], "to_account_id": account_id, "from_handle": SYSTEM_HANDLE,
                           "to_handle": normalized, "amount_paise": amount, "created_at": stamp}
            _, result = post_movement(db, session, source, account, amount, transaction, opening=True)
        return {"account": account_public(result), "opening_transaction_id": str(txn_id) if amount else None}

    try:
        return transact(db, apply)
    except DuplicateKeyError:
        raise APIError("HANDLE_EXISTS", "That handle already exists; opening funds were not added again.", 409) from None
    except OutcomeUnknown:
        raise APIError("OUTCOME_UNKNOWN", "Account creation result is unknown. Check the account list before retrying this handle.", 503) from None


def canonical_transfer(data):
    fields(data, ("from", "to", "amount", "idempotency_key"))
    return key(data["idempotency_key"]), {"operation": "TRANSFER", "from": handle(data["from"]), "to": handle(data["to"]), "amount": money(data["amount"])}


def canonical_reversal(db, transaction_id, data):
    fields(data, ("idempotency_key",))
    request_key = key(data["idempotency_key"])
    original = db.transactions.find_one({"_id": oid(transaction_id)})
    if original is None:
        raise APIError("TRANSACTION_NOT_FOUND", "The original transaction does not exist.", 404)
    if original["type"] != "TRANSFER":
        raise APIError("REVERSAL_NOT_ALLOWED", "Only a transfer can be reversed, once and in full.", 422)
    return request_key, {"operation": "REVERSAL", "from": original["to_handle"], "to": original["from_handle"],
                         "amount": original["amount_paise"], "original_transaction_id": transaction_id}


def pending(request_key, unknown=False):
    return ({"status": "UNKNOWN" if unknown else "PROCESSING", "code": "OUTCOME_UNKNOWN" if unknown else "REQUEST_IN_PROGRESS",
             "idempotency_key": request_key, "status_url": f"/api/transfers/requests/{request_key}"}, 202, False)


def finish_attempt(db, attempt_id, outcome, **extra):
    stamp = now()
    values = {"outcome": outcome, "updated_at": stamp, **extra}
    if outcome not in {"PENDING", "UNKNOWN"}:
        values["completed_at"] = stamp
    db.transfer_attempts.update_one({"_id": attempt_id}, {"$set": values})


def execute(db, request_key, payload, failure_point=None, request_id=None):
    """The durable reservation is separate from aborted financial writes."""
    stamp, attempt_id, owner = now(), ObjectId(), str(uuid4())
    digest = fingerprint(payload)
    attempt = {"_id": attempt_id, "request_id": request_id or str(uuid4()), "idempotency_key": request_key,
               "operation": payload["operation"], "from_handle": payload["from"], "to_handle": payload["to"], "amount_paise": payload["amount"],
               "outcome": "PENDING", "replayed": False, "received_at": stamp, "updated_at": stamp}
    db.transfer_attempts.insert_one(attempt)
    reservation = {"_id": ObjectId(), "idempotency_key": request_key, "fingerprint": digest, "canonical_payload": payload,
                   "state": "PROCESSING", "owner_token": owner, "fence_version": Int64(0),
                   "lease_expires_at": stamp + timedelta(seconds=30), "created_at": stamp, "updated_at": stamp}
    owned = False
    try:
        db.transfer_requests.insert_one(reservation)
        owned = True
    except DuplicateKeyError:
        reservation = db.transfer_requests.find_one({"idempotency_key": request_key})
    if reservation is None:
        return pending(request_key, True)
    db.transfer_attempts.update_one({"_id": attempt_id}, {"$set": {"transfer_request_id": reservation["_id"]}})

    def resolve(existing):
        if existing["fingerprint"] != digest or existing["canonical_payload"] != payload:
            finish_attempt(db, attempt_id, "REJECTED", error_code="IDEMPOTENCY_CONFLICT")
            raise APIError("IDEMPOTENCY_CONFLICT", "This key belongs to a different request payload.", 409)
        if existing["state"] != "PROCESSING":
            values = {"replayed": True}
            if existing.get("transaction_id"):
                values["transaction_id"] = existing["transaction_id"]
            else:
                values["error_code"] = existing["response"]["body"]["error"]["code"]
            try:
                finish_attempt(db, attempt_id, "RETRY_BLOCKED", **values)
            except PyMongoError:
                pass  # Payment replay correctness does not depend on telemetry.
            return public(existing["response"]["body"]), existing["response"]["http_status"], True
        return None

    result = resolve(reservation)
    if result:
        return result
    if not owned:
        if reservation["lease_expires_at"] <= now():
            claimed = db.transfer_requests.find_one_and_update(
                {"_id": reservation["_id"], "state": "PROCESSING", "owner_token": reservation["owner_token"], "lease_expires_at": {"$lte": now()}},
                {"$set": {"owner_token": owner, "lease_expires_at": now() + timedelta(seconds=30), "updated_at": now()}},
                return_document=ReturnDocument.AFTER)
            if claimed:
                reservation, owned = claimed, True
        if not owned:
            current = db.transfer_requests.find_one({"_id": reservation["_id"]})
            result = resolve(current)
            if result:
                return result
            finish_attempt(db, attempt_id, "UNKNOWN")
            return pending(request_key)
    txn_id = ObjectId()
    fence = {"_id": reservation["_id"], "state": "PROCESSING", "owner_token": owner}

    def apply(session):
        # A real write fences an expired owner, including during commit uncertainty.
        check = db.transfer_requests.update_one(fence, {"$inc": {"fence_version": Int64(1)}, "$set": {"updated_at": now()}}, session=session)
        if check.matched_count != 1:
            raise OwnershipLost()
        if db.transactions.find_one({"idempotency_key": request_key}, session=session):
            raise APIError("INTEGRITY_ERROR", "A processing request already has a financial transaction; reconcile before proceeding.", 500)
        if payload["from"] == payload["to"]:
            raise APIError("SELF_TRANSFER", "Choose two different accounts.", 422)
        accounts = {d["handle"]: d for d in db.accounts.find({"handle": {"$in": [payload["from"], payload["to"]]}}, session=session)}
        if len(accounts) != 2:
            raise APIError("ACCOUNT_NOT_FOUND", "A source or destination account does not exist.", 404)
        source, destination = accounts[payload["from"]], accounts[payload["to"]]
        if any(d["kind"] != "USER" for d in (source, destination)):
            raise APIError("SYSTEM_ACCOUNT_FORBIDDEN", "System accounts cannot participate in public transfers.", 422)
        if any(d["status"] != "ACTIVE" for d in (source, destination)):
            raise APIError("ACCOUNT_INACTIVE", "Both accounts must be active.", 409)
        if source["balance_paise"] < payload["amount"]:
            raise APIError("INSUFFICIENT_FUNDS", "Source account has insufficient balance.", 409,
                           {"available_paise": int(source["balance_paise"]), "required_paise": int(payload["amount"])})
        if destination["balance_paise"] + payload["amount"] > MAX_BALANCE:
            raise APIError("BALANCE_LIMIT_EXCEEDED", "Destination balance would exceed the allowed limit.", 422)
        transaction = {"_id": txn_id, "type": payload["operation"], "status": "COMMITTED", "idempotency_key": request_key,
                       "request_fingerprint": digest, "from_account_id": source["_id"], "to_account_id": destination["_id"],
                       "from_handle": source["handle"], "to_handle": destination["handle"], "amount_paise": payload["amount"], "created_at": now()}
        if payload["operation"] == "REVERSAL":
            original_id = oid(payload["original_transaction_id"])
            original = db.transactions.find_one({"_id": original_id}, session=session)
            if original is None or original["type"] != "TRANSFER" or original["from_account_id"] != destination["_id"] or original["to_account_id"] != source["_id"] or original["amount_paise"] != payload["amount"]:
                raise APIError("REVERSAL_NOT_ALLOWED", "The original transfer does not match this reversal.", 422)
            if db.transactions.find_one({"reversal_of": original_id}, session=session):
                raise APIError("ALREADY_REVERSED", "This transfer has already been reversed.", 409)
            transaction["reversal_of"] = original_id
        after_source, after_destination = post_movement(db, session, source, destination, payload["amount"], transaction, failure_point)
        body = transaction_public(transaction)
        body["transaction_id"] = body.pop("id")
        body.update(from_balance_after=int(after_source["balance_paise"]), to_balance_after=int(after_destination["balance_paise"]))
        updated = db.transfer_requests.update_one(fence, {"$set": {"state": "SUCCEEDED", "transaction_id": txn_id,
                                                                  "response": {"http_status": 201, "body": body}, "updated_at": now()}}, session=session)
        if updated.matched_count != 1:
            raise OwnershipLost()
        db.transfer_attempts.update_one({"_id": attempt_id}, {"$set": {"outcome": "COMMITTED", "transaction_id": txn_id, "completed_at": now(), "updated_at": now()}}, session=session)
        return body, 201, False

    try:
        return transact(db, apply)
    except (OutcomeUnknown, OwnershipLost):
        finish_attempt(db, attempt_id, "UNKNOWN")
        return pending(request_key, True)
    except (APIError, DuplicateKeyError) as exc:
        error = exc if isinstance(exc, APIError) else APIError("ALREADY_REVERSED", "Another reversal already committed.", 409)
        if error.code == "RETRY_EXHAUSTED":
            # Contention is not a permanent business rejection. The prior transaction
            # is known aborted, so a same-key retry may immediately claim a new owner.
            db.transfer_requests.update_one(fence, {"$set": {"lease_expires_at": now(), "updated_at": now()}})
            finish_attempt(db, attempt_id, "UNKNOWN", error_code=error.code)
            return pending(request_key)
        # A request-link corruption must stay unresolved for manual investigation.
        if error.code == "INTEGRITY_ERROR":
            finish_attempt(db, attempt_id, "UNKNOWN", error_code=error.code)
            raise error
        try:
            saved = db.transfer_requests.update_one(fence, {"$set": {"state": "FAILED", "response": {"http_status": error.status, "body": error.body()}, "updated_at": now()}})
            if saved.matched_count:
                finish_attempt(db, attempt_id, "ROLLED_BACK", error_code=error.code)
                return error.body(), error.status, False
            result = resolve(db.transfer_requests.find_one({"_id": reservation["_id"]}))
            return result or pending(request_key, True)
        except PyMongoError:
            return pending(request_key, True)
    except PyMongoError:
        # Infrastructure errors before an acknowledged terminal result retain the key.
        try:
            finish_attempt(db, attempt_id, "UNKNOWN")
        except PyMongoError:
            pass
        return pending(request_key, True)
