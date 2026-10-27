# Implementation and verification

Date: 27 October 2026.

## Delivered

The project now runs as a Flask application with a real MongoDB replica set and a plain, offline-capable HTML/CSS/JavaScript dashboard. The six PRD collections have strict BSON-aware validators and named indexes. The financial service owns balanced openings, conditional balance/version updates, two-entry transfers, durable key replay and full reversals. Reconciliation reads all financial checks from one snapshot and saves complete findings reports.

Runtime and maintenance database credentials are separate. On the prepared local server, authorization is enabled and the application's user has no update/delete permission on `transactions` or `ledger_entries`. Runtime credentials can update balances and request/attempt metadata. Financial writes do not depend on a Python mutex.

The prepared demonstration is at `http://127.0.0.1:5000`. Application and database processes must remain running. `README.md` documents restarting them. Generated credentials, local MongoDB binaries/data and reconciliation artifacts are ignored and must not be committed.

## Verification completed

Environment: Windows; Python 3.12.14; MongoDB 8.0.16, authenticated single-node `rs0`; PyMongo 4.15.3; Flask 3.1.2; installed Google Chrome for browser checks.

| Check | Observed result |
| --- | --- |
| Full pytest suite | **35 passed**, no skipped database/permission tests; 22.55 seconds in the recorded run |
| 100 simultaneous identical requests | One financial movement, original result replay, balanced reconciliation |
| 200 outgoing requests against 10,000 paise, 100 paise each | Exactly 100 committed and 100 insufficient-funds results; source balance zero |
| 500 distinct transfers at 50 workers | **500 resolved/committed**; both participating balances returned to 1,000,000 paise after opposing movements; both account versions reached 501; reconciliation BALANCED |
| Five financial failure points | Each left both balances/versions and financial document counts unchanged |
| Lost commit acknowledgment | Real commit followed by simulated lost acknowledgments returned unresolved; same-key retry resolved to the original payment with no duplicate |
| Database append-only permissions | Authenticated runtime user could transfer but could not update/delete transactions or ledger entries; MongoDB authorization code 13 |
| Corruption fixtures | Detected stored-balance, entry-pair, historical-balance, amount and orphan discrepancies |
| Report truncation | 106 findings produced a complete 106-line report and a bounded 100-finding preview |
| Error scan | Timeout produced ERROR without false complete totals or a report URL |
| Browser workflow | Created accounts, sent ₹12.34, replayed identical key, reversed the payment, checked restored balances and balanced books |
| Responsive browser checks | 1440, 768 and 390 px; no whole-page horizontal overflow; no uncaught browser-script errors |
| Visual inspector | Zero failures after raising small text sizes; contextual warnings and design decisions documented in DESIGN.md |

### Small-data query measurement

The benchmark was also run on **2 user accounts and 500 committed transfers**, with 20 warmups and 200 samples per operation over three runs. The worst run's p95 was 1.04 ms for recent 25 transfers, 0.73 ms for sender history, 0.46 ms for an entry pair, 0.71 ms for recent attempts and 20.91 ms for stats. Reconciliation took 93 ms. These are local driver/database timings, not browser or HTTP latency measurements.

The recent-transfer winning plan was `LIMIT → FETCH → IXSCAN` using `ix_transactions_type_created`; it had no collection scan or blocking sort. Raw generated evidence is under `docs/evidence/generated/benchmark.json`. This small-data result does not certify the 100k targets.

The initial constrained-funds test exposed a real defect: retry exhaustion was cached as a permanent rejection under heavy contention. The corrected service returns a nonterminal 202 after a known-aborted contention exhaustion and immediately releases its reservation lease. A same-key retry reclaims the reservation under a new ownership fence. Business failures such as insufficient funds remain terminal and replay their saved result.

## Design refinements from the PRD

- Routing stays in one app-factory module for this student-sized codebase; domain services and database/schema helpers are separate and shared by CLI tools and tests.
- The implementation creates two additional stats indexes immediately rather than postponing them until a later benchmark.
- The dashboard uses a top bar because there is one working screen. It has no decorative navigation or charts. All displayed data comes from MongoDB.
- Script-based failure injection calls the domain service directly using maintenance access; the HTTP failure header remains disabled in normal mode.
- Recovery conservatively labels resolved old uncertain invocations as replay evidence. Request-attempt telemetry is separate from the ledger; its unresolved warning does not imply a financial imbalance.

## Not yet certified

The 100,000-transfer benchmark has **not** been run. Large seed and benchmark tools are provided, but indexed-query latency and 20-second reconciliation at that scale must be measured before claiming those PRD performance gates. Small-data checks do not establish large-data performance.

The suite exercises expired ownership/replay and lost commit acknowledgment, but does not constitute exhaustive network-partition, operating-system process-kill or power-loss testing. The single-member set has no redundant failover. End-user authentication, bank integration and production deployment remain explicitly outside scope.

Secrets and MongoDB data are local artifacts. A repository copy alone does not recreate those; follow the setup instructions on another machine. Back up reconciliation reports along with the database if demonstration evidence must be retained.
