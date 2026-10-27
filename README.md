# LedgerLite

A simulated UPI-style payment ledger built with **Flask, PyMongo and MongoDB**, with a plain HTML/CSS/JavaScript dashboard. Every movement has one debit and one credit. Financial writes commit together or not at all.

**This is a local college DBMS project. All balances are simulated INR.**

## What's implemented

- Balanced account opening using a restricted system funding account.
- Multi-document transfers, conditional balance guards and account-local posting versions.
- Durable idempotency keys, exact success/failure replay, conflicting-payload rejection and fenced recovery of abandoned requests.
- Immutable transaction/ledger collections, with a collection-restricted database role.
- One-time full reversals through new postings.
- Snapshot reconciliation, precise corruption findings and complete JSONL reports.
- REST endpoints, daily metrics, request-attempt history and cursor pagination.
- Responsive dashboard: account creation, transfer, replay, selected ledger, reversal and manual reconciliation; 5-second polling.
- Real-replica-set tests and duplicate, rollback, parallel-transfer and corruption demonstrations.

The full requirements and design are in [docs/PRD.md](docs/PRD.md). Implementation details and the current verification record are in [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

## Quick start

Requires Python 3.11+ and a MongoDB replica set. Node and a frontend build are **not required** to run the application.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Set `MONGODB_URI` and `MONGODB_DB` in `.env`. Use the runtime user for the app, and a separate maintenance credential for bootstrap/seeding/tests. Database authorization must be enabled to enforce append-only permissions. A broad MongoDB `readWrite` user can still edit ledger documents; schema validation alone does not prevent that.

### Local MongoDB

Start your installed MongoDB as a loopback-only single-node replica set:

```powershell
mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --dbpath C:\path\to\ledgerlite-data
```

In `mongosh` on a fresh server:

```javascript
rs.initiate({_id: "rs0", members: [{_id: 0, host: "localhost:27017"}]})
```

Wait for a writable primary. Standalone MongoDB is not supported. Container users must advertise a replica-set hostname reachable from Python.

Bootstrap using an administrative connection:

```powershell
$env:LEDGERLITE_RUNTIME_PASSWORD = 'choose-a-local-password'
python -m scripts.bootstrap_db --database ledgerlite_demo_local --uri 'mongodb://localhost:27017/?replicaSet=rs0' --runtime-user ledgerlite_runtime
```

For a **fresh project-owned local server only**, `python -m scripts.configure_local_auth --database ledgerlite_demo_local` creates random local credentials, ignored `.env` / `.env.admin` files and `.tools/rs-keyfile`, then shuts down MongoDB. It refuses to overwrite existing environment files or administrative users. Use it before copying `.env.example`, or configure authentication manually instead. Restart with `--auth --keyFile .tools/rs-keyfile`; `scripts/start_local_mongo.ps1 -Mongod C:\path\to\mongod.exe` supplies these options when the generated key exists. The script runs in the foreground: keep its terminal open.

### Seed and run

Load administrative environment settings for maintenance commands without displaying passwords:

```powershell
# Alternatively set MONGODB_ADMIN_URI in this terminal yourself.
python -c "from dotenv import load_dotenv; load_dotenv('.env.admin'); import runpy; runpy.run_module('scripts.seed', run_name='__main__')" --database ledgerlite_demo_local --accounts 8 --transfers 24
.\.venv\Scripts\python run.py
```

Open **http://127.0.0.1:5000**. The dashboard serves real database values. It does not silently substitute fake numbers when MongoDB is unavailable. On a seed command without `.env.admin`, supply `--uri` with an administrative connection if the runtime user cannot bootstrap.

The prepared local workspace uses `ledgerlite_demo_local`, 8 initial simulated accounts and 24 initial transfers; browser proof accounts may also be present. Fonts are bundled with their license, so the dashboard needs no internet.

## Tests and demonstrations

Run tests with an administrative **test** connection. Each database integration test creates and drops its own random `ledgerlite_test_*` database; an unavailable replica set causes explicit skips. Permission tests also require server authorization enabled. Skips are not proof of those guarantees.

```powershell
python -c "from dotenv import load_dotenv; load_dotenv('.env.admin'); import pytest; raise SystemExit(pytest.main(['-q']))"
```

Examples below use the administrative URI from `.env.admin`:

```powershell
python -c "from dotenv import load_dotenv; load_dotenv('.env.admin'); import runpy; runpy.run_module('scripts.demo_duplicates', run_name='__main__')" --database ledgerlite_demo_proofs --requests 100 --workers 50
python -c "from dotenv import load_dotenv; load_dotenv('.env.admin'); import runpy; runpy.run_module('scripts.demo_rollback', run_name='__main__')" --database ledgerlite_demo_proofs
python -c "from dotenv import load_dotenv; load_dotenv('.env.admin'); import runpy; runpy.run_module('scripts.demo_concurrency', run_name='__main__')" --database ledgerlite_demo_proofs --requests 500 --workers 50
python -c "from dotenv import load_dotenv; load_dotenv('.env.admin'); import runpy; runpy.run_module('scripts.demo_corruption', run_name='__main__')" --database ledgerlite_demo_local --confirm-corruption
```

The corruption tool starts from balanced books, changes one balance by 1 paise, proves detection and restores it in a `finally` block. Run it only while other tools are not writing that disposable dataset. Reset/corruption commands reject non-disposable database names.

`python -m scripts.recover_requests` checks expired reservations through the same fenced service, then resolves old uncertain invocation records from durable results. Load the administrative environment or supply `--uri` if needed. Diagnostic UNKNOWN attempts may remain after live contention until recovery; they do not change posted balances.

For HTTP failure injection, deliberately set `DEMO_MODE=true` in a loopback-bound local instance, then send `X-Demo-Failure: after_debit` with a fresh valid transfer. Other supported values: `after_first_account`, `after_both_accounts`, `after_transaction`, `before_commit`. Hooks are rejected in normal mode. CLI proof scripts call the domain service directly and do not expose an administrative HTTP endpoint.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST/GET /api/accounts` | Create/list user accounts |
| `POST /api/transfers` | Atomic, idempotent transfer |
| `GET /api/transfers/requests/<key>` | Resolve a pending or uncertain request |
| `GET /api/transactions` | Committed financial history |
| `GET /api/transactions/<id>/entries` | Debit/credit and historical balances |
| `POST /api/transactions/<id>/reverse` | Full reversal with a fresh key |
| `GET /api/transfer-attempts` | Committed/replayed/aborted request history |
| `POST /api/reconciliation/run` | Check all invariants |
| `GET /api/reconciliation/latest` | Last check result |
| `GET /api/reconciliation/<id>/report` | Complete JSONL findings |
| `GET /api/stats` | Today in Asia/Kolkata |
| `GET /api/health` | Connectivity, replica set and schema readiness |

Transfer body:

```json
{"from":"asha@upi","to":"rahul@upi","amount":2500,"idempotency_key":"my-transfer-0001"}
```

`amount` is **paise**: 2500 means ₹25.00. Reusing the same payload and key returns the original body and HTTP status, with `Idempotency-Replayed: true`. Changed payload returns 409. A 202 response means pending/uncertain: retain the key and resolve it; do not create a new payment to find out what happened. Opening account requests use `opening_balance` in paise. Lists accept `limit` (1–100) and opaque `cursor`.

## Large-data performance

```powershell
python -m scripts.seed --database ledgerlite_bench_100k --accounts 1000 --transfers 100000 --seed 42
python -m scripts.benchmark --database ledgerlite_bench_100k --samples 200
```

Use the maintenance URI/environment for these commands. Large seeding goes through real transactions and takes substantially longer than the small demo. Benchmark records the actual dataset, three warmed runs, timings, database query plan and reconciliation duration. The 100k latency targets are **unverified until that dataset is measured**.

## Operational limits

- One local Flask process; no end-user authentication or bank integration. Bind to loopback.
- The replica set has one member: ACID/restart behavior is demonstrable; redundant failover is not.
- Ledger and transaction documents are insert-only for the restricted credential. Requests, balances and attempt telemetry are mutable projections/operational state.
- Reconciliation reads one snapshot, writes complete JSONL reports under `instance/reconciliation/`, and never repairs corrupted books. Back up reports alongside the database.
- A known-aborted contention retry exhaustion returns 202 with an immediately reclaimable reservation; it is not permanently cached as a business failure. Uncertain commits remain fenced until safe recovery.
- Application errors after a network interruption may be ambiguous. The UI preserves the original key; inspect request status before starting a new transfer.

## Layout

`app/` contains configuration, validators, transaction helpers, domain services and the Flask app factory/routes. `static/` contains the offline-capable frontend. `scripts/` contains setup/seed/proof/benchmark tools. `tests/` exercises real MongoDB guarantees. `docs/` contains the PRD and verification notes. Secrets, local MongoDB binaries/data, generated reports and environments are ignored.
