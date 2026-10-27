import json
import math
import platform
import statistics
import time
from importlib.metadata import version
from pathlib import Path

from app.services.reconciliation import Reconciler
from app.services.stats import summary
from app.validation import public
from .common import database, parser


def main():
    cli = parser("Measure indexed queries on an existing dataset; never invent a 100k result.")
    cli.add_argument("--samples", type=int, default=200)
    cli.add_argument("--output", default="docs/evidence/generated/benchmark.json")
    args = cli.parse_args()
    if args.samples < 20:
        cli.error("Use at least 20 samples.")
    db = database(args)
    account = db.accounts.find_one({"kind": "USER"})
    txn = db.transactions.find_one({"type": "TRANSFER"})
    if not account or not txn:
        cli.error("Seed accounts and transfers first.")
    scenarios = {
        "recent_25": lambda: list(db.transactions.find({"type": "TRANSFER"}).sort([("created_at", -1), ("_id", -1)]).limit(25)),
        "account_history": lambda: list(db.transactions.find({"from_account_id": account["_id"]}).sort([("created_at", -1), ("_id", -1)]).limit(25)),
        "entry_pair": lambda: list(db.ledger_entries.find({"transaction_id": txn["_id"]})),
        "recent_attempts": lambda: list(db.transfer_attempts.find().sort([("received_at", -1), ("_id", -1)]).limit(25)),
        "stats": lambda: summary(db, "Asia/Kolkata"),
    }
    measurements = {}
    for name, operation in scenarios.items():
        runs = []
        for _ in range(3):
            for _ in range(20):
                operation()
            timings = []
            for _ in range(args.samples):
                start = time.perf_counter()
                operation()
                timings.append((time.perf_counter() - start) * 1000)
            timings.sort()
            runs.append({"p50_ms": statistics.median(timings), "p95_ms": timings[math.ceil(.95 * len(timings)) - 1], "max_ms": max(timings)})
        measurements[name] = runs
    plan = db.command("explain", {"find": "transactions", "filter": {"type": "TRANSFER"}, "sort": {"created_at": -1, "_id": -1}, "limit": 25}, verbosity="executionStats")
    run = Reconciler(db, f"instance/reconciliation/{db.name}").run()
    report = {"database": db.name, "platform": platform.platform(), "python": platform.python_version(), "mongo": db.client.server_info()["version"],
              "pymongo": version("pymongo"), "accounts": db.accounts.count_documents({"kind": "USER"}), "transfers": db.transactions.count_documents({"type": "TRANSFER"}),
              "samples_per_run": args.samples, "measurements": measurements, "recent_query_plan": plan,
              "reconciliation_status": run["status"], "reconciliation_ms": run["duration_ms"]}
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(public(report), indent=2, default=str), encoding="utf-8")
    print(f"Saved {path}. Measured dataset: {report['accounts']:,} accounts, {report['transfers']:,} transfers.")
    if report["transfers"] < 100000:
        print("This is a small-data measurement, not evidence of the PRD's 100k performance target.")


if __name__ == "__main__":
    main()
