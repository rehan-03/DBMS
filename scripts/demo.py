import json
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from app.services.payments import canonical_transfer, create_account, execute
from app.services.reconciliation import Reconciler
from app.validation import public
from .common import database, parser, resolve


def main(scenario):
    cli = parser(f"Run the {scenario} proof against real MongoDB transactions.")
    cli.add_argument("--requests", type=int, default=100 if scenario == "duplicates" else 500)
    cli.add_argument("--workers", type=int, default=50)
    args = cli.parse_args()
    if not 1 <= args.requests <= 10000 or not 1 <= args.workers <= 100:
        cli.error("Use 1–10,000 requests and 1–100 workers.")
    db, prefix = database(args, initialize=True), uuid4().hex[:10]
    source, dest = f"src{prefix}@upi", f"dst{prefix}@upi"
    for name in (source, dest):
        create_account(db, {"handle": name, "display_name": name.split("@")[0], "opening_balance": 1_000_000})
    before = {a["handle"]: (a["balance_paise"], a["version"]) for a in db.accounts.find({"handle": {"$in": [source, dest]}})}
    payloads = [canonical_transfer({"from": source if i % 2 == 0 or scenario != "concurrency" else dest,
                                    "to": dest if i % 2 == 0 or scenario != "concurrency" else source,
                                    "amount": 100, "idempotency_key": f"{prefix}-{'same' if scenario == 'duplicates' else i}"}) for i in range(args.requests)]
    if scenario == "rollback":
        k, payload = payloads[0]
        result = execute(db, k, payload, failure_point="after_debit")
        assert result[1] == 500 and result[0]["error"]["code"] == "DEMO_FAILURE"
        assert db.transactions.count_documents({"idempotency_key": k}) == 0
        after = {a["handle"]: (a["balance_paise"], a["version"]) for a in db.accounts.find({"handle": {"$in": [source, dest]}})}
        assert before == after
        results = [result]
    else:
        with ThreadPoolExecutor(args.workers) as pool:
            results = list(pool.map(lambda kp: resolve(db, *kp), payloads))
        assert all(r[1] == 201 for r in results), "A well-funded demo request did not commit"
        ids = {r[0]["transaction_id"] for r in results}
        assert len(ids) == (1 if scenario == "duplicates" else args.requests)
        assert db.transactions.count_documents({"idempotency_key": {"$regex": f"^{prefix}-"}}) == len(ids)
    run = Reconciler(db, f"instance/reconciliation/{db.name}").run()
    assert run["status"] == "BALANCED", public(run)
    print(json.dumps(public({"scenario": scenario, "submitted": len(results), "resolved": len(results), "before": before,
                             "after": {a["handle"]: [a["balance_paise"], a["version"]] for a in db.accounts.find({"handle": {"$in": [source, dest]}})},
                             "sample_result": results[0], "reconciliation": run["status"]}), indent=2))
