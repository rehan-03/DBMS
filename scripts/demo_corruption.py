from bson.int64 import Int64

from app.services.reconciliation import Reconciler
from .common import database, parser, require_disposable


def main():
    cli = parser("Alter one disposable balance by 1 paise, prove detection, then restore it.")
    cli.add_argument("--confirm-corruption", action="store_true", required=True)
    args = cli.parse_args()
    db = database(args)
    require_disposable(db)
    account = db.accounts.find_one({"kind": "USER", "balance_paise": {"$lt": 1_000_000_000}})
    if account is None:
        cli.error("Seed a disposable database first.")
    reconciler = Reconciler(db, f"instance/reconciliation/{db.name}")
    assert reconciler.run()["status"] == "BALANCED", "Start from clean books"
    try:
        db.accounts.update_one({"_id": account["_id"]}, {"$inc": {"balance_paise": Int64(1)}})
        run = reconciler.run()
        codes = {f["code"] for f in run["findings_preview"]}
        assert run["status"] == "UNBALANCED" and "ACCOUNT_BALANCE_MISMATCH" in codes
        print("Detected:", run["findings_preview"], "Report:", run["report_name"])
    finally:
        db.accounts.update_one({"_id": account["_id"]}, {"$set": {"balance_paise": account["balance_paise"]}})
    assert reconciler.run()["status"] == "BALANCED"
    print("Disposable fixture restored; books balanced.")


if __name__ == "__main__":
    main()
