# Ten-minute LedgerLite demonstration

Use simulated INR throughout. Start MongoDB and Flask before the presentation; confirm `/api/health` reports READY. The prepared app is `http://127.0.0.1:5000`. Use a disposable `ledgerlite_demo_*` database for failure/corruption scripts and separate maintenance credentials.

1. **Introduce the database model (1 minute).** Show `accounts`, `transactions`, `ledger_entries`, request reservations and attempts. Explain that debit decreases a wallet and credit increases it. Show the transaction key index and entry-side unique index.
2. **Show opening funds (1 minute).** Create two accounts with ₹1,000 and ₹500. Open a funding transaction from committed history. Explain the restricted system counterparty and why the sum including that counterparty is zero.
3. **Make a transfer (1 minute).** Send ₹25. Show the new transaction ID, debit, credit, historical balances and account versions.
4. **Repeat the same key (1 minute).** Check “Reuse the same key and transfer.” Repeat. Show the same transaction ID and the retry-blocked row. A retry is an HTTP invocation, not another financial movement.
5. **Show a rollback (1 minute).** Run the rollback CLI from README. Show unchanged balances, versions and financial document counts after failure following debit insertion. Explain why failed-request metadata is stored outside the aborted financial transaction.
6. **Show concurrency (1–2 minutes).** Run the 500-request proof or present its saved output. Explain conditional `$inc`, write conflicts, bounded retries and the ownership fence. Show the constrained-funds test: 200 requests, only 100 affordable commits, zero final balance.
7. **Post a reversal (1 minute).** Reverse the selected transfer. Show a new opposite pair; original entries remain unchanged. The original receiver must still have the funds.
8. **Prove reconciliation detects more than equal totals (1 minute).** Run the corruption script on a disposable clean fixture with no other writers. It changes a balance by 1 paise, reports the exact discrepancy and restores the fixture. Show complete JSONL findings.
9. **Explain limits (remaining time).** Show 35 passing tests and the permission-denial check. A single-node replica set demonstrates transactions but not redundant failover. The 100k benchmark remains an explicitly unverified performance gate until measured.

If a response is uncertain, preserve its key and use “Check unresolved result.” Never demonstrate recovery by inventing a new key for the same payment.
