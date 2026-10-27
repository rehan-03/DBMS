import argparse
import os
import time

from dotenv import load_dotenv

from app.config import ROOT, settings
from app.db import bootstrap, connect
from app.services.payments import execute


def parser(description):
    load_dotenv(ROOT / ".env")
    result = argparse.ArgumentParser(description=description)
    result.add_argument("--database", default=os.getenv("MONGODB_DB", "ledgerlite"))
    result.add_argument("--uri", default=os.getenv("MONGODB_ADMIN_URI", os.getenv("MONGODB_URI", "mongodb://localhost:27017/?replicaSet=rs0")))
    return result


def database(args, initialize=False):
    db = connect(settings({"MONGODB_URI": args.uri, "MONGODB_DB": args.database}))
    if initialize:
        bootstrap(db)
    return db


def require_disposable(db):
    if not db.name.startswith(("ledgerlite_test_", "ledgerlite_demo_", "ledgerlite_bench_")):
        raise SystemExit("This destructive tool requires an explicitly named ledgerlite_test_*, ledgerlite_demo_* or ledgerlite_bench_* database.")


def resolve(db, request_key, payload, **kwargs):
    deadline = time.monotonic() + 65
    while True:
        result = execute(db, request_key, payload, **kwargs)
        if result[1] != 202:
            return result
        if time.monotonic() > deadline:
            raise AssertionError(f"Request {request_key} remained unresolved")
        time.sleep(.1)
