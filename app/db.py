import random
import time

from bson.int64 import Int64
from pymongo import MongoClient, ReadPreference
from pymongo.errors import PyMongoError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

from .config import SYSTEM_HANDLE
from .errors import APIError, OutcomeUnknown
from .schema import INDEXES, validators
from .validation import now

TRANSACTION_OPTIONS = dict(read_concern=ReadConcern("snapshot"), write_concern=WriteConcern(w="majority", j=True, wtimeout=5000),
                           read_preference=ReadPreference.PRIMARY, max_commit_time_ms=3000)


def connect(config):
    client = MongoClient(config["MONGODB_URI"], tz_aware=True, serverSelectionTimeoutMS=2000,
                         connectTimeoutMS=2000, socketTimeoutMS=5000, maxPoolSize=100,
                         appname="LedgerLite", w="majority", journal=True)
    return client[config["MONGODB_DB"]]


def bootstrap(db):
    hello = db.client.admin.command("hello")
    if not hello.get("setName"):
        raise APIError("REPLICA_SET_REQUIRED", "MongoDB must run as a replica set.", 503)
    existing = db.list_collection_names()
    for name, validator in validators().items():
        if name not in existing:
            db.create_collection(name, validator=validator, validationLevel="strict", validationAction="error")
        else:
            db.command("collMod", name, validator=validator, validationLevel="strict", validationAction="error")
    for collection, name, keys, options in INDEXES:
        db[collection].create_index(keys, name=name, **options)
    stamp = now()
    db.accounts.update_one({"handle": SYSTEM_HANDLE}, {"$setOnInsert": {
        "handle": SYSTEM_HANDLE, "display_name": "Opening equity", "kind": "SYSTEM", "status": "ACTIVE",
        "opening_balance_paise": Int64(0), "balance_paise": Int64(0), "version": Int64(0), "created_at": stamp, "updated_at": stamp,
    }}, upsert=True)


def readiness(db):
    hello = db.client.admin.command("hello")
    if not hello.get("setName") or not hello.get("isWritablePrimary"):
        raise APIError("REPLICA_SET_REQUIRED", "A writable MongoDB replica-set primary is required.", 503)
    specs = {d["name"]: d.get("options", {}) for d in db.list_collections()}
    for name, expected in validators().items():
        options = specs.get(name, {})
        if options.get("validator") != expected or options.get("validationLevel") != "strict" or options.get("validationAction") != "error":
            raise APIError("SCHEMA_NOT_READY", "Run database bootstrap to install the expected validators.", 503)
    for coll, name, keys, options in INDEXES:
        actual = db[coll].index_information().get(name, {})
        if list(actual.get("key", [])) != keys or any(actual.get(k) != v for k, v in options.items()):
            raise APIError("SCHEMA_NOT_READY", f"Required index {name} is missing or different.", 503)
    if not db.accounts.find_one({"handle": SYSTEM_HANDLE, "kind": "SYSTEM"}):
        raise APIError("SCHEMA_NOT_READY", "The opening equity account is missing.", 503)
    return hello["setName"]


def transact(db, callback, budget=10, attempts=5):
    """Retry conflicts; retry an uncertain commit only on its original session."""
    deadline = time.monotonic() + budget
    with db.client.start_session() as session:
        for attempt in range(attempts):
            try:
                session.start_transaction(**TRANSACTION_OPTIONS)
                result = callback(session)
                while True:
                    try:
                        session.commit_transaction()
                        return result
                    except PyMongoError as exc:
                        if exc.has_error_label("UnknownTransactionCommitResult"):
                            if time.monotonic() >= deadline:
                                raise OutcomeUnknown() from exc
                            time.sleep(0.025)
                            continue
                        raise
            except OutcomeUnknown:
                raise
            except Exception as exc:
                if session.in_transaction:
                    try:
                        session.abort_transaction()
                    except PyMongoError:
                        pass  # An uncommitted transaction cannot commit itself.
                if isinstance(exc, PyMongoError) and exc.has_error_label("TransientTransactionError"):
                    if attempt + 1 < attempts and time.monotonic() < deadline:
                        time.sleep(random.uniform(0, min(0.025 * 2**attempt, 0.4)))
                        continue
                    raise APIError("RETRY_EXHAUSTED", "Conflicting writes exhausted the retry budget.", 503) from exc
                raise


def install_runtime_role(db, username, password):
    role = "ledgerlite_runtime"
    privileges = []
    for collection in validators():
        actions = ["find", "insert", "listIndexes"]
        if collection in {"accounts", "transfer_requests", "transfer_attempts"}:
            actions.append("update")
        privileges.append({"resource": {"db": db.name, "collection": collection}, "actions": actions})
    privileges.append({"resource": {"db": db.name, "collection": ""}, "actions": ["listCollections"]})
    exists = db.command("rolesInfo", role)["roles"]
    db.command("updateRole" if exists else "createRole", role, privileges=privileges, roles=[])
    exists = db.command("usersInfo", username)["users"]
    db.command("updateUser" if exists else "createUser", username, pwd=password, roles=[{"role": role, "db": db.name}])
