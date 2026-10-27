import os

from app.db import install_runtime_role, readiness
from .common import database, parser


def main():
    cli = parser("Install MongoDB validators, indexes and the opening-equity account.")
    cli.add_argument("--runtime-user", help="Create/update a collection-restricted user. Password comes from LEDGERLITE_RUNTIME_PASSWORD.")
    args = cli.parse_args()
    db = database(args, initialize=True)
    if args.runtime_user:
        password = os.getenv("LEDGERLITE_RUNTIME_PASSWORD")
        if not password:
            cli.error("Set LEDGERLITE_RUNTIME_PASSWORD before creating the runtime user.")
        install_runtime_role(db, args.runtime_user, password)
    print(f"Ready: database={db.name} replica_set={readiness(db)}")
    print("Append-only permissions require MongoDB authorization enabled and the restricted runtime user.")


if __name__ == "__main__":
    main()
