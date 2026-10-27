"""BSON-aware document validators and named indexes. No financial mutation logic."""
from .config import MAX_BALANCE, MAX_TRANSFER, SYSTEM_FLOOR

OID = {"bsonType": "objectId"}
DATE = {"bsonType": "date"}
TEXT = {"bsonType": "string", "maxLength": 256}
LONG = {"bsonType": "long", "minimum": 0}
KEY = {"bsonType": "string", "minLength": 8, "maxLength": 128}
DIGEST = {"bsonType": "string", "pattern": "^[a-f0-9]{64}$"}
USER_HANDLE = {"bsonType": "string", "pattern": "^[a-z0-9][a-z0-9._-]{2,31}@upi$"}
MONEY = {"bsonType": "long", "minimum": 0, "maximum": MAX_BALANCE}
AMOUNT = {"bsonType": "long", "minimum": 1, "maximum": MAX_BALANCE}
BALANCE = {"bsonType": "long", "minimum": SYSTEM_FLOOR, "maximum": MAX_BALANCE}


def enum(*values):
    return {"enum": list(values)}


def shape(properties, optional=(), **extra):
    return {"bsonType": "object", "required": [k for k in properties if k not in optional], "additionalProperties": False, "properties": properties, **extra}


def validators():
    accounts = shape({
        "_id": OID, "handle": TEXT, "display_name": {"bsonType": "string", "minLength": 1, "maxLength": 80},
        "kind": enum("USER", "SYSTEM"), "status": enum("ACTIVE", "FROZEN"),
        "opening_balance_paise": MONEY, "balance_paise": BALANCE, "version": LONG,
        "created_at": DATE, "updated_at": DATE,
    }, oneOf=[
        {"properties": {"kind": enum("USER"), "handle": USER_HANDLE, "balance_paise": MONEY}},
        {"properties": {"kind": enum("SYSTEM"), "handle": enum("opening-equity@system"), "opening_balance_paise": enum(0), "balance_paise": {"maximum": 0}}},
    ])
    transactions = shape({
        "_id": OID, "type": enum("TRANSFER", "OPENING", "REVERSAL"), "status": enum("COMMITTED"),
        "idempotency_key": KEY, "request_fingerprint": DIGEST,
        "from_account_id": OID, "to_account_id": OID, "from_handle": TEXT, "to_handle": TEXT,
        "amount_paise": AMOUNT, "reversal_of": OID, "created_at": DATE,
    }, optional=("reversal_of",), oneOf=[
        {"properties": {"type": enum("OPENING")}, "not": {"required": ["reversal_of"]}},
        {"properties": {"type": enum("TRANSFER"), "amount_paise": {"maximum": MAX_TRANSFER}}, "not": {"required": ["reversal_of"]}},
        {"properties": {"type": enum("REVERSAL"), "amount_paise": {"maximum": MAX_TRANSFER}}, "required": ["reversal_of"]},
    ])
    entries = shape({
        "_id": OID, "transaction_id": OID, "account_id": OID, "direction": enum("DEBIT", "CREDIT"),
        "amount_paise": AMOUNT, "balance_after_paise": BALANCE,
        "account_version_after": {"bsonType": "long", "minimum": 1}, "created_at": DATE,
    })
    canonical = shape({"operation": enum("TRANSFER", "REVERSAL"), "from": USER_HANDLE, "to": USER_HANDLE,
                       "amount": {"bsonType": "long", "minimum": 1, "maximum": MAX_TRANSFER}, "original_transaction_id": TEXT},
                      optional=("original_transaction_id",))
    response = shape({"http_status": {"bsonType": "int", "minimum": 200, "maximum": 599}, "body": {"bsonType": "object"}})
    requests = shape({
        "_id": OID, "idempotency_key": KEY, "fingerprint": DIGEST, "canonical_payload": canonical,
        "state": enum("PROCESSING", "SUCCEEDED", "FAILED"), "owner_token": TEXT, "fence_version": LONG,
        "lease_expires_at": DATE, "transaction_id": OID, "response": response, "created_at": DATE, "updated_at": DATE,
    }, optional=("transaction_id", "response"), oneOf=[
        {"properties": {"state": enum("PROCESSING")}, "not": {"anyOf": [{"required": ["response"]}, {"required": ["transaction_id"]}]}},
        {"properties": {"state": enum("SUCCEEDED"), "response": {"properties": {"http_status": enum(201)}}}, "required": ["response", "transaction_id"]},
        {"properties": {"state": enum("FAILED"), "response": {"properties": {"http_status": {"minimum": 400}}}}, "required": ["response"], "not": {"required": ["transaction_id"]}},
    ])
    attempts = shape({
        "_id": OID, "request_id": TEXT, "transfer_request_id": OID, "idempotency_key": KEY,
        "operation": enum("TRANSFER", "REVERSAL"), "from_handle": USER_HANDLE, "to_handle": USER_HANDLE,
        "amount_paise": AMOUNT, "outcome": enum("PENDING", "COMMITTED", "RETRY_BLOCKED", "ROLLED_BACK", "REJECTED", "UNKNOWN"),
        "transaction_id": OID, "error_code": TEXT, "replayed": {"bsonType": "bool"},
        "received_at": DATE, "updated_at": DATE, "completed_at": DATE,
    }, optional=("transfer_request_id", "idempotency_key", "from_handle", "to_handle", "amount_paise", "transaction_id", "error_code", "completed_at"),
       oneOf=[
           {"properties": {"outcome": enum("PENDING", "UNKNOWN")}},
           {"properties": {"outcome": enum("COMMITTED"), "replayed": enum(False)}, "required": ["transaction_id", "completed_at"]},
           {"properties": {"outcome": enum("RETRY_BLOCKED"), "replayed": enum(True)}, "required": ["completed_at"]},
           {"properties": {"outcome": enum("ROLLED_BACK", "REJECTED")}, "required": ["completed_at", "error_code"], "not": {"required": ["transaction_id"]}},
       ])
    finding = shape({"code": TEXT, "account_id": TEXT, "transaction_id": TEXT, "entry_id": TEXT,
                     "expected": {"bsonType": "object"}, "actual": {"bsonType": "object"}, "message": TEXT}, optional=("account_id", "transaction_id", "entry_id"))
    result_fields = {k: LONG for k in ("total_debits_paise", "total_credits_paise", "accounts_checked", "transactions_checked", "entries_checked", "finding_count")}
    result_fields.update({"difference_paise": {"bsonType": "long"}, "total_account_balances_paise": {"bsonType": "long"},
                          "read_completed_at": DATE, "findings_preview": {"bsonType": "array", "maxItems": 100, "items": finding},
                          "details_truncated": {"bsonType": "bool"}, "report_name": TEXT, "report_sha256": DIGEST})
    runs = shape({"_id": OID, "status": enum("BALANCED", "UNBALANCED", "ERROR"), "started_at": DATE, "completed_at": DATE,
                  "duration_ms": LONG, "consistency": enum("SNAPSHOT"), "error_code": TEXT, "error_message": TEXT, **result_fields},
                 optional=(*result_fields, "error_code", "error_message"), oneOf=[
                     {"properties": {"status": enum("BALANCED"), "finding_count": enum(0), "difference_paise": enum(0)}, "required": list(result_fields), "not": {"required": ["error_code"]}},
                     {"properties": {"status": enum("UNBALANCED"), "finding_count": {"minimum": 1}}, "required": list(result_fields), "not": {"required": ["error_code"]}},
                     {"properties": {"status": enum("ERROR")}, "required": ["error_code", "error_message"], "not": {"anyOf": [{"required": [k]} for k in result_fields]}},
                 ])
    return {name: {"$jsonSchema": schema} for name, schema in {
        "accounts": accounts, "transactions": transactions, "ledger_entries": entries,
        "transfer_requests": requests, "transfer_attempts": attempts, "reconciliation_runs": runs,
    }.items()}


# collection, index name, key order, optional creation flags
INDEXES = [
    ("accounts", "uq_accounts_handle", [("handle", 1)], {"unique": True}),
    ("accounts", "uq_accounts_system", [("kind", 1)], {"unique": True, "partialFilterExpression": {"kind": "SYSTEM"}}),
    ("accounts", "ix_accounts_kind_created", [("kind", 1), ("created_at", -1), ("_id", -1)], {}),
    ("transactions", "uq_transactions_key", [("idempotency_key", 1)], {"unique": True}),
    ("transactions", "ix_transactions_type_created", [("type", 1), ("created_at", -1), ("_id", -1)], {}),
    ("transactions", "ix_transactions_created", [("created_at", -1), ("_id", -1)], {}),
    ("transactions", "ix_transactions_from_created", [("from_account_id", 1), ("created_at", -1), ("_id", -1)], {}),
    ("transactions", "ix_transactions_to_created", [("to_account_id", 1), ("created_at", -1), ("_id", -1)], {}),
    ("transactions", "uq_transactions_reversal", [("reversal_of", 1)], {"unique": True, "partialFilterExpression": {"type": "REVERSAL"}}),
    ("ledger_entries", "uq_entries_transaction_direction", [("transaction_id", 1), ("direction", 1)], {"unique": True}),
    ("ledger_entries", "uq_entries_account_version", [("account_id", 1), ("account_version_after", 1)], {"unique": True}),
    ("transfer_requests", "uq_requests_key", [("idempotency_key", 1)], {"unique": True}),
    ("transfer_requests", "ix_requests_recovery", [("state", 1), ("lease_expires_at", 1)], {}),
    ("transfer_requests", "ix_requests_stats", [("canonical_payload.operation", 1), ("created_at", -1), ("state", 1)], {}),
    ("transfer_attempts", "uq_attempts_request_id", [("request_id", 1)], {"unique": True}),
    ("transfer_attempts", "ix_attempts_received", [("received_at", -1), ("_id", -1)], {}),
    ("transfer_attempts", "ix_attempts_outcome_received", [("outcome", 1), ("received_at", -1), ("_id", -1)], {}),
    ("transfer_attempts", "ix_attempts_key_received", [("idempotency_key", 1), ("received_at", -1), ("_id", -1)], {}),
    ("transfer_attempts", "ix_attempts_stats", [("operation", 1), ("outcome", 1), ("received_at", -1)], {}),
    ("reconciliation_runs", "ix_reconciliation_completed", [("completed_at", -1), ("_id", -1)], {}),
]
