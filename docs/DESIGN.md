# Dashboard design record

Style: **Achromatic ledger**, seed **456643876**, from the installed design-taste-frontend skill. The screen answers: **Did the money move correctly, and do the books still balance?**

The signature is the selected payment's paired debit and credit, with historical balances and account posting versions. The product mark uses two matching ledger columns. The face is a blue-grey ledger-paper ground, Geist type bundled locally, quiet neutral chrome and a restrained blue difference figure. Every displayed balance and count comes from MongoDB.

The dealt icon rail was replaced with a top bar because the PRD specifies one working dashboard, not several destinations; adding nonfunctional navigation would obscure its actual jobs. The dealt chart pattern was omitted because the brief requests transaction evidence and reconciliation totals, not a historical chart. The four metric strip, account balances and transaction rows provide the requested evidence.

Inspection covers 1440, 768 and 390 px. Initial inspection found text below 11 px; those sizes were raised. The desktop layout was tightened to show the history and selected-ledger headings sooner. Independent history and detail panes intentionally have different heights because their contents and empty states differ; neither is padded with invented entries. A chart-hue warning is inapplicable to a dashboard with no chart. Monospace is confined to IDs/keys; em dashes represent missing values, as required by the PRD.

No decorative animation, images, external font requests, invented growth figures or mock account totals are used. Seed fixtures are explicitly simulated payments, not external product evidence. Optional browser QA saves rendered screenshots under `docs/evidence/generated/`.
