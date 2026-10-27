import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_BALANCE = 1_000_000_000
MAX_TRANSFER = 100_000_000
SYSTEM_FLOOR = -10_000_000_000_000
SYSTEM_HANDLE = "opening-equity@system"


def settings(overrides=None):
    result = {
        "MONGODB_URI": os.getenv("MONGODB_URI", "mongodb://localhost:27017/?replicaSet=rs0"),
        "MONGODB_DB": os.getenv("MONGODB_DB", "ledgerlite"),
        "APP_TIMEZONE": os.getenv("APP_TIMEZONE", "Asia/Kolkata"),
        "DEMO_MODE": os.getenv("DEMO_MODE", "false").lower() == "true",
        "HOST": os.getenv("HOST", "127.0.0.1"),
        "PORT": int(os.getenv("PORT", "5000")),
        "MAX_CONTENT_LENGTH": 16 * 1024,
        "REPORT_DIR": os.getenv("RECONCILIATION_REPORT_DIR", str(ROOT / "instance" / "reconciliation")),
        "TESTING": False,
    }
    result.update(overrides or {})
    if result["DEMO_MODE"] and result["HOST"] not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("Demo mode requires a loopback host.")
    return result
