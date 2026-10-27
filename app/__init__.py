import logging
import time
from uuid import uuid4

from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_file
from pymongo.errors import PyMongoError
from werkzeug.exceptions import HTTPException

from .config import ROOT, settings
from .db import connect, readiness
from .errors import APIError, OutcomeUnknown
from .services.payments import (FAILURE_POINTS, account_public, canonical_reversal, canonical_transfer,
                                create_account, execute, transaction_public)
from .services.reconciliation import Reconciler, run_public
from .services.stats import summary
from .validation import fields, key, now, oid, page_args, paginate, public, time_filter


def create_app(overrides=None, database=None):
    load_dotenv(ROOT / ".env")
    app = Flask(__name__, static_folder=str(ROOT / "static"), static_url_path="/static")
    app.config.update(settings(overrides))
    db = database if database is not None else connect(app.config)
    app.extensions["db"] = db
    app.extensions["reconciler"] = Reconciler(db, app.config["REPORT_DIR"])
    ready_at = [0.0]

    def ready():
        if time.monotonic() - ready_at[0] > 5:
            readiness(db)
            ready_at[0] = time.monotonic()

    @app.before_request
    def begin_request():
        g.request_id, g.started = str(uuid4()), time.monotonic()
        if request.path.startswith("/api/") and request.path != "/api/health":
            ready()

    @app.after_request
    def response_headers(response):
        response.headers["X-Request-ID"] = g.get("request_id", str(uuid4()))
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Cache-Control"] = "no-store" if request.path.startswith("/api/") else "no-cache"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        app.logger.info("request id=%s method=%s path=%s status=%s duration_ms=%s", g.get("request_id"), request.method,
                        request.path, response.status_code, round((time.monotonic() - g.get("started", time.monotonic())) * 1000))
        return response

    @app.errorhandler(APIError)
    def api_error(error):
        return jsonify(error.body()), error.status

    @app.errorhandler(PyMongoError)
    def database_error(error):
        app.logger.warning("Database request failed: %s", type(error).__name__)
        return jsonify(APIError("DATABASE_UNAVAILABLE", "The database is unavailable or an operation could not be confirmed.", 503).body()), 503

    @app.errorhandler(HTTPException)
    def http_error(error):
        codes = {400: "INVALID_JSON", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 413: "REQUEST_TOO_LARGE", 415: "UNSUPPORTED_MEDIA_TYPE"}
        return jsonify(APIError(codes.get(error.code, "HTTP_ERROR"), error.description, error.code).body()), error.code

    @app.errorhandler(Exception)
    def internal_error(error):
        app.logger.exception("Unhandled request error")
        return jsonify(APIError("INTERNAL_ERROR", "An internal error occurred. Check this request's ID in server logs.", 500).body()), 500

    def body():
        if not request.is_json:
            raise APIError("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415)
        data = request.get_json()
        if not isinstance(data, dict):
            raise APIError("VALIDATION_ERROR", "The JSON body must be an object.")
        return data

    def failure_point():
        point = request.headers.get("X-Demo-Failure")
        if point:
            if not app.config["DEMO_MODE"] or request.remote_addr not in {"127.0.0.1", "::1"}:
                raise APIError("DEMO_MODE_DISABLED", "Failure injection requires loopback demo mode.", 422)
            if point not in FAILURE_POINTS:
                raise APIError("VALIDATION_ERROR", "Unsupported failure point.")
        return point

    def payment_response(result):
        data, status, replayed = result
        response = jsonify(data)
        response.status_code = status
        response.headers["Idempotency-Replayed"] = str(replayed).lower()
        if status == 202:
            response.headers["Retry-After"] = "1"
        return response

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    @app.get("/api/health")
    def health():
        try:
            replica = readiness(db)
            return jsonify(status="READY", database="UP", replica_set=replica, schema_ready=True, demo_mode=app.config["DEMO_MODE"], reason=None)
        except (APIError, PyMongoError) as exc:
            return jsonify(status="NOT_READY", database="DOWN" if isinstance(exc, PyMongoError) else "UP", replica_set=None,
                           schema_ready=False, demo_mode=app.config["DEMO_MODE"], reason=exc.code if isinstance(exc, APIError) else "DATABASE_UNAVAILABLE"), 503

    @app.route("/api/accounts", methods=["GET", "POST"])
    def accounts():
        if request.method == "POST":
            return jsonify(create_account(db, body())), 201
        args = request.args
        page_args(args, {"status"})
        query = {"kind": "USER"}
        if "status" in args:
            if args["status"] not in {"ACTIVE", "FROZEN"}:
                raise APIError("INVALID_FILTER", "Unsupported account status.")
            query["status"] = args["status"]
        return jsonify(paginate(db.accounts, query, args, "created_at", account_public))

    @app.post("/api/transfers")
    def transfers():
        point = failure_point()
        data = body()
        request_key, payload = canonical_transfer(data)
        return payment_response(execute(db, request_key, payload, point, g.request_id))

    @app.get("/api/transfers/requests/<request_key>")
    def request_status(request_key):
        key(request_key)
        doc = db.transfer_requests.find_one({"idempotency_key": request_key})
        if doc is None:
            raise APIError("REQUEST_NOT_FOUND", "No request has reserved this key.", 404)
        return jsonify(public({"idempotency_key": request_key, "state": doc["state"], "response": doc.get("response")}))

    @app.get("/api/transactions")
    def transactions():
        args = request.args
        page_args(args, {"account_id", "type", "idempotency_key", "from_time", "to_time"})
        query = time_filter(args, "created_at")
        kind = args.get("type", "TRANSFER")
        if kind not in {"TRANSFER", "OPENING", "REVERSAL", "ALL"}:
            raise APIError("INVALID_FILTER", "Unsupported transaction type.")
        if kind != "ALL":
            query["type"] = kind
        if "account_id" in args:
            account_id = oid(args["account_id"])
            query["$or"] = [{"from_account_id": account_id}, {"to_account_id": account_id}]
        if "idempotency_key" in args:
            query["idempotency_key"] = args["idempotency_key"]
        return jsonify(paginate(db.transactions, query, args, "created_at", transaction_public))

    @app.get("/api/transactions/<transaction_id>/entries")
    def entries(transaction_id):
        tid = oid(transaction_id)
        txn = db.transactions.find_one({"_id": tid})
        if txn is None:
            raise APIError("TRANSACTION_NOT_FOUND", "Transaction does not exist.", 404)
        result = []
        for entry in db.ledger_entries.find({"transaction_id": tid}).sort("direction", -1):
            # Explicit ordering below avoids depending on alphabetic direction order.
            account = db.accounts.find_one({"_id": entry["account_id"]}, {"handle": 1})
            result.append({"id": entry["_id"], "account_id": entry["account_id"], "handle": account["handle"] if account else "missing account",
                           "direction": entry["direction"], "amount": entry["amount_paise"], "balance_after": entry["balance_after_paise"],
                           "account_version_after": entry["account_version_after"]})
        result.sort(key=lambda e: 0 if e["direction"] == "DEBIT" else 1)
        response = {"transaction_id": tid, "type": txn["type"], "amount": txn["amount_paise"], "entries": result}
        if len(result) != 2 or {e["direction"] for e in result} != {"DEBIT", "CREDIT"}:
            response["integrity_warning"] = True
        return jsonify(public(response))

    @app.post("/api/transactions/<transaction_id>/reverse")
    def reverse(transaction_id):
        point = failure_point()
        request_key, payload = canonical_reversal(db, transaction_id, body())
        return payment_response(execute(db, request_key, payload, point, g.request_id))

    @app.get("/api/transfer-attempts")
    def attempts():
        args = request.args
        page_args(args, {"outcome", "idempotency_key", "from_time", "to_time"})
        query = time_filter(args, "received_at")
        if "outcome" in args:
            if args["outcome"] not in {"PENDING", "UNKNOWN", "COMMITTED", "RETRY_BLOCKED", "ROLLED_BACK", "REJECTED"}:
                raise APIError("INVALID_FILTER", "Unsupported attempt outcome.")
            query["outcome"] = args["outcome"]
        if "idempotency_key" in args:
            query["idempotency_key"] = key(args["idempotency_key"])

        def serialize(doc):
            result = {k: doc[k] for k in ("request_id", "transaction_id", "operation", "idempotency_key", "outcome", "replayed", "error_code", "received_at", "completed_at") if k in doc}
            result.update({new: doc[old] for old, new in (("from_handle", "from"), ("to_handle", "to"), ("amount_paise", "amount")) if old in doc})
            return public(result)
        return jsonify(paginate(db.transfer_attempts, query, args, "received_at", serialize))

    @app.post("/api/reconciliation/run")
    def reconcile():
        fields(body(), ())
        run = app.extensions["reconciler"].run()
        result = {"run": run_public(run)}
        if run["status"] == "ERROR":
            result.update(APIError("RECONCILIATION_FAILED", run["error_message"], 503).body())
        return jsonify(result), 503 if run["status"] == "ERROR" else 201

    @app.get("/api/reconciliation/latest")
    def latest():
        if request.args:
            raise APIError("INVALID_FILTER", "This endpoint takes no filters.")
        run = db.reconciliation_runs.find_one(sort=[("completed_at", -1), ("_id", -1)])
        return jsonify(run=run_public(run))

    @app.get("/api/reconciliation/<run_id>/report")
    def report(run_id):
        doc = db.reconciliation_runs.find_one({"_id": oid(run_id)})
        if doc is None or "report_name" not in doc:
            raise APIError("REPORT_NOT_FOUND", "This run has no completed report.", 404)
        folder = app.extensions["reconciler"].report_dir.resolve()
        path = (folder / doc["report_name"]).resolve()
        if path.parent != folder or not path.is_file():
            raise APIError("REPORT_NOT_FOUND", "The report artifact is missing.", 404)
        return send_file(path, mimetype="application/x-ndjson", as_attachment=True, download_name=path.name)

    @app.get("/api/stats")
    def stats():
        if request.args:
            raise APIError("INVALID_FILTER", "This endpoint takes no filters.")
        return jsonify(summary(db, app.config["APP_TIMEZONE"]))

    return app
