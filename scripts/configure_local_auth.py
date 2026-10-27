"""One-time localhost-only setup for a fresh, project-owned replica set.

Run against the initially unauthenticated loopback server, then restart mongod
with --auth and --keyFile .tools/rs-keyfile. Existing credentials are never reset.
"""
import base64
import os
import secrets
from pathlib import Path

from pymongo.errors import AutoReconnect

from app.config import ROOT
from app.db import install_runtime_role
from .common import database, parser


def main():
    cli = parser("Configure authentication on a fresh localhost-only project MongoDB.")
    args = cli.parse_args()
    if args.uri != "mongodb://localhost:27017/?replicaSet=rs0":
        cli.error("This one-time tool only supports the default project-owned localhost replica set.")
    if (ROOT / ".env").exists() or (ROOT / ".env.admin").exists():
        cli.error("Local configuration already exists. Existing credentials will not be overwritten.")
    db = database(args)
    if db.client.admin.command("usersInfo")["users"]:
        cli.error("Administrative users already exist; configure credentials manually.")
    admin_password, runtime_password = secrets.token_urlsafe(30), secrets.token_urlsafe(30)
    db.client.admin.command("createUser", "ledgerlite_admin", pwd=admin_password, roles=[{"role": "root", "db": "admin"}])
    install_runtime_role(db, "ledgerlite_runtime", runtime_password)
    (ROOT / ".tools").mkdir(exist_ok=True)
    (ROOT / ".tools" / "rs-keyfile").write_text(base64.b64encode(os.urandom(512)).decode(), encoding="ascii")
    runtime_uri = f"mongodb://ledgerlite_runtime:{runtime_password}@localhost:27017/?replicaSet=rs0&authSource={db.name}"
    admin_uri = f"mongodb://ledgerlite_admin:{admin_password}@localhost:27017/?replicaSet=rs0&authSource=admin"
    (ROOT / ".env").write_text(f"MONGODB_URI={runtime_uri}\nMONGODB_DB={db.name}\nDEMO_MODE=false\nHOST=127.0.0.1\nPORT=5000\n", encoding="utf-8")
    (ROOT / ".env.admin").write_text(f"MONGODB_ADMIN_URI={admin_uri}\nTEST_MONGODB_URI={admin_uri}\n", encoding="utf-8")
    print("Created separate local runtime and maintenance credentials in ignored environment files.")
    print("Restart MongoDB with --keyFile .tools/rs-keyfile --auth before running the application.")
    try:
        db.client.admin.command("shutdown", force=True)
    except AutoReconnect:
        pass


if __name__ == "__main__":
    main()
