import random

from faker import Faker

from app.db import bootstrap
from app.services.payments import canonical_transfer, create_account
from app.services.reconciliation import Reconciler
from .common import database, parser, require_disposable, resolve


def main():
    cli = parser("Seed reproducible accounts and transfers through the real payment service.")
    cli.add_argument("--accounts", type=int, default=8)
    cli.add_argument("--transfers", type=int, default=24)
    cli.add_argument("--seed", type=int, default=42)
    cli.add_argument("--reset", action="store_true")
    args = cli.parse_args()
    if not 2 <= args.accounts <= 10000 or args.transfers < 0:
        cli.error("Use 2–10,000 accounts and a nonnegative transfer count.")
    db = database(args)
    if args.reset:
        require_disposable(db)
        db.client.drop_database(db.name)
    bootstrap(db)
    if db.accounts.count_documents({"kind": "USER"}):
        cli.error("Seed needs an empty user dataset. Choose a fresh database or explicit disposable --reset.")
    fake, rng = Faker("en_IN"), random.Random(args.seed)
    fake.seed_instance(args.seed)
    accounts = []
    for i in range(args.accounts):
        name = ["Asha Rao", "Rahul Shah", "Meera Patel", "Arjun Desai"][i] if i < 4 else fake.name()
        handle = ["asha@upi", "rahul@upi", "meera@upi", "arjun@upi"][i] if i < 4 else f"member{i:04}@upi"
        create_account(db, {"handle": handle, "display_name": name, "opening_balance": 5_000_000})
        accounts.append(handle)
    for i in range(args.transfers):
        source, dest = rng.sample(accounts, 2)
        k, payload = canonical_transfer({"from": source, "to": dest, "amount": rng.randint(100, 25000), "idempotency_key": f"seed-{args.seed}-{i:08}"})
        result = resolve(db, k, payload)
        if result[1] != 201:
            raise SystemExit(f"Seed failed at movement {i}: {result[0]}")
        if (i + 1) % 1000 == 0:
            print(f"Committed {i + 1:,} transfers", flush=True)
    run = Reconciler(db, f"instance/reconciliation/{db.name}").run()
    print(f"Seed: {args.accounts} accounts, {args.transfers} transfers, reconciliation={run['status']}")
    if run["status"] != "BALANCED":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
