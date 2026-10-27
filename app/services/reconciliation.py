import hashlib
import json
import os
import threading
import time
from collections import Counter, defaultdict
from pathlib import Path

from bson import ObjectId
from bson.int64 import Int64
from pymongo.errors import PyMongoError

from ..config import MAX_BALANCE, SYSTEM_FLOOR, SYSTEM_HANDLE
from ..db import TRANSACTION_OPTIONS
from ..errors import APIError
from ..validation import fingerprint, now, public


def run_public(run):
    if run is None:
        return None
    result = dict(run)
    result["id"] = result.pop("_id")
    for field in ("total_debits", "total_credits", "difference", "total_account_balances"):
        if field + "_paise" in result:
            result[field] = result.pop(field + "_paise")
    result.pop("report_name", None)
    if "report_sha256" in run:
        result["report_url"] = f"/api/reconciliation/{run['_id']}/report"
    return public(result)


class Reconciler:
    def __init__(self, db, report_dir):
        self.db, self.report_dir = db, Path(report_dir)
        self.lock = threading.Lock()

    def run(self, budget=30):
        if not self.lock.acquire(blocking=False):
            raise APIError("RECONCILIATION_BUSY", "A reconciliation is already running.", 409)
        started, start_clock, run_id = now(), time.monotonic(), ObjectId()
        temporary = self.report_dir / f"{run_id}.tmp"
        final = self.report_dir / f"{run_id}.jsonl"
        try:
            self.report_dir.mkdir(parents=True, exist_ok=True)
            with temporary.open("w", encoding="utf-8", newline="\n") as report, self.db.client.start_session() as session:
                session.start_transaction(**TRANSACTION_OPTIONS)
                result = self._scan(session, report, start_clock + budget - 1)
                session.commit_transaction()
            os.replace(temporary, final)
            with final.open("rb") as complete_report:
                report_digest = hashlib.file_digest(complete_report, "sha256").hexdigest()
            run = {"_id": run_id, "started_at": started, "read_completed_at": now(), "completed_at": now(),
                   "duration_ms": Int64((time.monotonic() - start_clock) * 1000), "consistency": "SNAPSHOT",
                   "report_name": final.name, "report_sha256": report_digest, **result}
            self.db.reconciliation_runs.insert_one(run)
            return run
        except (PyMongoError, OSError, TimeoutError, ValueError, KeyError) as exc:
            temporary.unlink(missing_ok=True)
            run = {"_id": run_id, "status": "ERROR", "started_at": started, "completed_at": now(),
                   "duration_ms": Int64((time.monotonic() - start_clock) * 1000), "consistency": "SNAPSHOT",
                   "error_code": "RECONCILIATION_FAILED", "error_message": str(exc)[:256]}
            try:
                self.db.reconciliation_runs.insert_one(run)
            except PyMongoError:
                raise APIError("DATABASE_UNAVAILABLE", "Reconciliation failed and its result could not be saved.", 503) from exc
            return run
        finally:
            self.lock.release()

    def _scan(self, session, report, deadline):
        db, findings, preview = self.db, 0, []

        def tick():
            if time.monotonic() > deadline:
                raise TimeoutError("Reconciliation exceeded its snapshot deadline.")

        def finding(code, expected, actual, message, **ids):
            nonlocal findings
            tick()
            item = public({"code": code, "expected": expected, "actual": actual, "message": message, **ids})
            findings += 1
            if len(preview) < 100:
                preview.append(item)
            report.write(json.dumps(item, ensure_ascii=False, separators=(",", ":")) + "\n")

        accounts = {a["_id"]: a for a in db.accounts.find({}, session=session)}
        sums, versions, opening_counts = defaultdict(int), defaultdict(int), Counter()
        debits, credits, entry_count, txn_count = 0, 0, 0, 0
        # Version index gives a deterministic per-account chain, including identical timestamps.
        for entry in db.ledger_entries.find({}, session=session).sort([("account_id", 1), ("account_version_after", 1)]).batch_size(500):
            tick()
            entry_count += 1
            aid, amount = entry["account_id"], entry["amount_paise"]
            if aid not in accounts:
                finding("ORPHAN_ENTRY", {"account_exists": True}, {"account_exists": False}, "Entry references a missing account.", account_id=aid, entry_id=entry["_id"])
            if entry["direction"] == "DEBIT":
                debits += amount
                signed = -amount
            else:
                credits += amount
                signed = amount
            versions[aid] += 1
            if entry["account_version_after"] != versions[aid]:
                finding("VERSION_GAP", {"version": versions[aid]}, {"version": entry["account_version_after"]}, "Account posting versions are not contiguous.", account_id=aid, entry_id=entry["_id"])
            sums[aid] += signed
            if entry["balance_after_paise"] != sums[aid]:
                finding("BALANCE_AFTER_MISMATCH", {"balance_paise": sums[aid]}, {"balance_paise": entry["balance_after_paise"]}, "Historical balance does not match the running postings.", account_id=aid, entry_id=entry["_id"])
        if debits != credits:
            finding("GLOBAL_IMBALANCE", {"difference_paise": 0}, {"debits_paise": debits, "credits_paise": credits, "difference_paise": debits - credits}, "Global debit and credit totals differ.")

        # Indexed joins avoid one network round-trip per transaction and preserve the session snapshot.
        pipeline = [
            {"$lookup": {"from": "ledger_entries", "localField": "_id", "foreignField": "transaction_id", "as": "_entries"}},
            {"$lookup": {"from": "transfer_requests", "localField": "idempotency_key", "foreignField": "idempotency_key", "as": "_requests"}},
            {"$lookup": {"from": "transactions", "localField": "reversal_of", "foreignField": "_id", "as": "_original"}},
        ]
        for txn in db.transactions.aggregate(pipeline, session=session, maxTimeMS=25000, batchSize=500):
            tick()
            txn_count += 1
            tid, entries = txn["_id"], txn["_entries"]
            directions = Counter(e["direction"] for e in entries)
            if len(entries) != 2 or directions != {"DEBIT": 1, "CREDIT": 1}:
                finding("ENTRY_PAIR_INVALID", {"entries": 2, "debits": 1, "credits": 1}, {"entries": len(entries), "debits": directions["DEBIT"], "credits": directions["CREDIT"]}, "Transaction must have one posting of each side.", transaction_id=tid)
            if txn["from_account_id"] == txn["to_account_id"]:
                finding("SELF_TRANSFER", {"distinct_parties": True}, {"distinct_parties": False}, "Transaction references the same account twice.", transaction_id=tid)
            for party in ("from_account_id", "to_account_id"):
                if txn[party] not in accounts:
                    finding("MISSING_ACCOUNT", {"account_exists": True}, {"account_exists": False}, "Transaction party does not exist.", transaction_id=tid, account_id=txn[party])
            for entry in entries:
                expected = txn["from_account_id"] if entry["direction"] == "DEBIT" else txn["to_account_id"]
                if entry["amount_paise"] != txn["amount_paise"]:
                    finding("ENTRY_AMOUNT_MISMATCH", {"amount_paise": txn["amount_paise"]}, {"amount_paise": entry["amount_paise"]}, "Entry amount differs from its transaction.", transaction_id=tid, entry_id=entry["_id"])
                if entry["account_id"] != expected:
                    finding("ENTRY_PARTY_MISMATCH", {"account_id": expected}, {"account_id": entry["account_id"]}, "Entry is posted to the wrong account.", transaction_id=tid, entry_id=entry["_id"])
            if txn["type"] == "OPENING":
                opening_counts[txn["to_account_id"]] += 1
                dest, source = accounts.get(txn["to_account_id"]), accounts.get(txn["from_account_id"])
                if not dest or not source or source["handle"] != SYSTEM_HANDLE or dest["kind"] != "USER" or txn["amount_paise"] != dest["opening_balance_paise"]:
                    finding("OPENING_INVALID", {"balanced_funding_matches_metadata": True}, {"matches": False}, "Opening movement does not match its account metadata.", transaction_id=tid)
            else:
                requests = txn["_requests"]
                req = requests[0] if len(requests) == 1 else None
                expected_body = {"transaction_id": str(tid), "type": txn["type"], "status": "COMMITTED", "from": txn["from_handle"], "to": txn["to_handle"], "amount": int(txn["amount_paise"]), "currency": "INR", "idempotency_key": txn["idempotency_key"], "created_at": public(txn["created_at"])}
                if "reversal_of" in txn:
                    expected_body["reversal_of"] = str(txn["reversal_of"])
                for entry in entries:
                    expected_body["from_balance_after" if entry["direction"] == "DEBIT" else "to_balance_after"] = int(entry["balance_after_paise"])
                valid = req and req["state"] == "SUCCEEDED" and req.get("transaction_id") == tid and req["fingerprint"] == txn["request_fingerprint"] and fingerprint(req["canonical_payload"]) == req["fingerprint"] and req.get("response") == {"http_status": 201, "body": expected_body}
                canonical_expected = {"operation": txn["type"], "from": txn["from_handle"], "to": txn["to_handle"], "amount": txn["amount_paise"]}
                if "reversal_of" in txn:
                    canonical_expected["original_transaction_id"] = str(txn["reversal_of"])
                valid = valid and req["canonical_payload"] == canonical_expected
                if not valid:
                    finding("REQUEST_LINK_INVALID", {"matching_succeeded_request": True}, {"matches": False}, "Financial movement and durable response do not agree.", transaction_id=tid)
                if any(accounts.get(txn[p], {}).get("kind") != "USER" for p in ("from_account_id", "to_account_id")):
                    finding("ENTRY_PARTY_MISMATCH", {"user_parties": True}, {"user_parties": False}, "Public movement involves a non-user account.", transaction_id=tid)
            if txn["type"] == "REVERSAL":
                original = txn["_original"][0] if len(txn["_original"]) == 1 else None
                if not original or original["type"] != "TRANSFER" or original["amount_paise"] != txn["amount_paise"] or original["from_account_id"] != txn["to_account_id"] or original["to_account_id"] != txn["from_account_id"]:
                    finding("REVERSAL_INVALID", {"opposite_original_transfer": True}, {"matches": False}, "Reversal is not the exact opposite of an original transfer.", transaction_id=tid)
            for prefix in ("from", "to"):
                account = accounts.get(txn[prefix + "_account_id"])
                if account and account["handle"] != txn[prefix + "_handle"]:
                    finding("ENTRY_PARTY_MISMATCH", {"handle": account["handle"]}, {"handle": txn[prefix + "_handle"]}, "Transaction handle snapshot does not match immutable account identity.", transaction_id=tid)

        orphan_pipeline = [{"$lookup": {"from": "transactions", "localField": "transaction_id", "foreignField": "_id", "as": "parent"}}, {"$match": {"parent": {"$size": 0}}}]
        for entry in db.ledger_entries.aggregate(orphan_pipeline, session=session, maxTimeMS=25000):
            finding("ORPHAN_ENTRY", {"transaction_exists": True}, {"transaction_exists": False}, "Entry has no parent transaction.", entry_id=entry["_id"], transaction_id=entry["transaction_id"])
        request_pipeline = [{"$lookup": {"from": "transactions", "localField": "idempotency_key", "foreignField": "idempotency_key", "as": "financial"}}]
        for req in db.transfer_requests.aggregate(request_pipeline, session=session, maxTimeMS=25000):
            tick()
            if (req["state"] == "SUCCEEDED" and len(req["financial"]) != 1) or (req["state"] != "SUCCEEDED" and req["financial"]):
                finding("REQUEST_LINK_INVALID", {"movements": 1 if req["state"] == "SUCCEEDED" else 0}, {"movements": len(req["financial"])}, "Request state and financial movement existence differ.")
        for dup in db.transactions.aggregate([{"$match": {"type": "REVERSAL"}}, {"$group": {"_id": "$reversal_of", "count": {"$sum": 1}}}, {"$match": {"count": {"$gt": 1}}}], session=session):
            finding("REVERSAL_INVALID", {"reversals": 1}, {"reversals": dup["count"]}, "Original has multiple full reversals.", transaction_id=dup["_id"])
        for aid, account in accounts.items():
            if account["balance_paise"] != sums[aid]:
                finding("ACCOUNT_BALANCE_MISMATCH", {"balance_paise": sums[aid]}, {"balance_paise": account["balance_paise"]}, f"Stored minus ledger balance is {account['balance_paise'] - sums[aid]} paise.", account_id=aid)
            if account["version"] != versions[aid]:
                finding("VERSION_MISMATCH", {"version": versions[aid]}, {"version": account["version"]}, "Account version differs from its number of entries.", account_id=aid)
            lower, upper = (SYSTEM_FLOOR, 0) if account["kind"] == "SYSTEM" and account["handle"] == SYSTEM_HANDLE else (0, MAX_BALANCE)
            if not lower <= account["balance_paise"] <= upper:
                finding("BALANCE_POLICY_VIOLATION", {"minimum": lower, "maximum": upper}, {"balance_paise": account["balance_paise"]}, "Account is outside its permitted range.", account_id=aid)
            if account["kind"] == "USER" and opening_counts[aid] != int(account["opening_balance_paise"] > 0):
                finding("OPENING_INVALID", {"count": int(account["opening_balance_paise"] > 0)}, {"count": opening_counts[aid]}, "Account opening evidence is missing or duplicated.", account_id=aid)
        total = sum(a["balance_paise"] for a in accounts.values())
        if total:
            finding("ACCOUNT_TOTAL_IMBALANCE", {"total_paise": 0}, {"total_paise": total}, "All account balances do not sum to zero.")
        tick()
        return {"status": "UNBALANCED" if findings else "BALANCED", "total_debits_paise": Int64(debits), "total_credits_paise": Int64(credits),
                "difference_paise": Int64(debits - credits), "total_account_balances_paise": Int64(total),
                "accounts_checked": Int64(len(accounts)), "transactions_checked": Int64(txn_count), "entries_checked": Int64(entry_count),
                "finding_count": Int64(findings), "findings_preview": preview, "details_truncated": findings > len(preview)}
