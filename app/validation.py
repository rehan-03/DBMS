import base64
import hashlib
import json
import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.int64 import Int64

from .config import MAX_BALANCE, MAX_TRANSFER
from .errors import APIError

HANDLE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}@upi$")
KEY = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


def now():
    return datetime.now(timezone.utc)


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def public(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return iso(value)
    if isinstance(value, dict):
        return {k: public(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [public(v) for v in value]
    if isinstance(value, Int64):
        return int(value)
    return value


def fields(data, required, optional=()):
    if not isinstance(data, dict) or set(data) - set(required) - set(optional) or set(required) - set(data):
        raise APIError("VALIDATION_ERROR", "JSON fields are missing or unsupported.", details={"required": list(required), "optional": list(optional)})


def handle(value):
    if not isinstance(value, str) or not HANDLE.fullmatch(value.strip().lower()):
        raise APIError("VALIDATION_ERROR", "Use a handle such as asha@upi (3–32 characters before @upi).")
    return value.strip().lower()


def key(value):
    if not isinstance(value, str) or not KEY.fullmatch(value) or value.startswith("opening:"):
        raise APIError("VALIDATION_ERROR", "A valid 8–128 character idempotency key is required.")
    return value


def money(value, opening=False):
    if type(value) is not int or not (0 if opening else 1) <= value <= (MAX_BALANCE if opening else MAX_TRANSFER):
        raise APIError("VALIDATION_ERROR", "Money must be integer paise within the permitted range.")
    return Int64(value)


def oid(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{24}", value):
        raise APIError("VALIDATION_ERROR", "Expected a lowercase 24-character transaction/account ID.")
    return ObjectId(value)


def fingerprint(payload):
    canonical = json.dumps({"v": 1, **public(payload)}, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def date(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed.astimezone(timezone.utc)
    except (ValueError, AttributeError):
        raise APIError("INVALID_FILTER", "Use an ISO 8601 timestamp with a timezone.") from None


def page_args(args, allowed):
    if set(args) - set(allowed) - {"limit", "cursor"}:
        raise APIError("INVALID_FILTER", "Unsupported query parameter.")
    try:
        limit = int(args.get("limit", "25"))
        if not 1 <= limit <= 100:
            raise ValueError()
    except ValueError:
        raise APIError("INVALID_FILTER", "Limit must be between 1 and 100.") from None
    return limit


def time_filter(args, field):
    interval = {}
    if "from_time" in args:
        interval["$gte"] = date(args["from_time"])
    if "to_time" in args:
        interval["$lt"] = date(args["to_time"])
    if "$gte" in interval and "$lt" in interval and interval["$gte"] >= interval["$lt"]:
        raise APIError("INVALID_FILTER", "The end must be after the start.")
    return {field: interval} if interval else {}


def paginate(collection, query, args, field, serialize):
    limit = int(args.get("limit", 25))
    if args.get("cursor"):
        try:
            cursor = json.loads(base64.urlsafe_b64decode(args["cursor"]).decode())
            stamp, last = date(cursor["t"]), oid(cursor["id"])
        except Exception:
            raise APIError("INVALID_FILTER", "Invalid pagination cursor.") from None
        query = {"$and": [query, {"$or": [{field: {"$lt": stamp}}, {field: stamp, "_id": {"$lt": last}}]}]}
    docs = list(collection.find(query).sort([(field, -1), ("_id", -1)]).limit(limit + 1))
    more, docs = len(docs) > limit, docs[:limit]
    cursor = None
    if more:
        cursor = base64.urlsafe_b64encode(json.dumps({"t": iso(docs[-1][field]), "id": str(docs[-1]["_id"])}).encode()).decode()
    return {"items": [serialize(d) for d in docs], "next_cursor": cursor}
