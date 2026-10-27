# LedgerLite — submission report outline

## Abstract

LedgerLite models simulated wallet payments as balanced, append-only postings. A Flask/PyMongo backend commits both account projections, a financial transaction and two entries together on MongoDB. Durable idempotency reservations and conditional account updates protect against replay and conflicting transfers. Snapshot reconciliation independently checks balances and references. A plain static dashboard exposes this evidence.

## Chapters to complete for submission

1. Problem statement, college context, goals and non-goals.
2. Requirements and acceptance criteria: reference `PRD.md`.
3. Architecture: browser → Flask domain services → MongoDB `rs0`; locally retained findings reports.
4. Logical model, actual BSON schema validators and named indexes: reference `app/schema.py` and PRD diagrams.
5. Accounting convention, opening-equity counterparty, account-local posting versions and materialized balances.
6. Atomic transaction boundary, conditional updates, conflict retries and unknown commit handling.
7. Durable idempotency lifecycle and ownership fencing; distinction between payments and HTTP attempts.
8. Append-only permissions and equal-and-opposite full reversals.
9. Reconciliation algorithm, invariant matrix, snapshot consistency and corruption findings.
10. REST API and browser workflow; responsive layout screenshots.
11. Test methodology and measured results: use `IMPLEMENTATION.md` and reproducible pytest/proof scripts.
12. Performance chapter: attach actual 100k benchmark output when available. Until then explicitly state that scale targets are unverified.
13. Limitations, deployment assumptions, future work and references.

## Evidence to attach

- `pytest` summary and selected assertion output.
- Actual collection/index definitions and a rejected invalid insert.
- Screenshots of a transfer and its two entries, duplicate replay, reversal and reconciliation.
- Five-point rollback proof and 500-request concurrency output.
- Runtime database authorization denial for updating/deleting posted records.
- Corruption report showing expected/actual values and IDs.
- Benchmark JSON, query execution plan, exact hardware/software versions and seed sizes.

The existing sequence and data-model Mermaid diagrams are in the PRD. Add request-state, opposing-concurrency and reversal illustrations using the implemented fields. Do not claim foreign-key enforcement, universal serializability, high availability or 100k performance without corresponding evidence.
