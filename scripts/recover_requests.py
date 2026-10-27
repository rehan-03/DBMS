from app.services.payments import execute, finish_attempt
from app.validation import now
from .common import database, parser


def main():
    args = parser("Safely reclaim expired requests using the same fenced payment service.").parse_args()
    db = database(args)
    count = 0
    for req in db.transfer_requests.find({"state": "PROCESSING", "lease_expires_at": {"$lte": now()}}):
        result = execute(db, req["idempotency_key"], req["canonical_payload"])
        print(req["idempotency_key"], result[1])
        count += 1
    # A terminal request resolves old uncertain invocation records without inventing a second payment.
    for attempt in db.transfer_attempts.find({"outcome": {"$in": ["PENDING", "UNKNOWN"]}}):
        req = db.transfer_requests.find_one({"idempotency_key": attempt.get("idempotency_key")})
        if req and req["state"] != "PROCESSING":
            values = {"replayed": True}
            if req.get("transaction_id"):
                values["transaction_id"] = req["transaction_id"]
            else:
                values["error_code"] = req["response"]["body"]["error"]["code"]
            finish_attempt(db, attempt["_id"], "RETRY_BLOCKED", **values)
    print(f"Inspected {count} expired logical requests. Resolved old invocations are shown as replay evidence.")


if __name__ == "__main__":
    main()
