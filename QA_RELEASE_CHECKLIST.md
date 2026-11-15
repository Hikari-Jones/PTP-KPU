# PTP-KPU audit, fixes and release checklist

Audit date: 16 November 2026 (Asia/Makassar). Scope: current local checkout, concentrating on surat menyurat, realisasi anggaran, file permissions, performance hotspots and production configuration.

**Decision: not yet approved for production government-office use.** Code fixes and test assets are present, but a production build, real MySQL integration, browser UAT, load measurements and a real recovery drill remain unverified. Use synthetic data in staging first. This is a code review and partial verification, not a penetration test, regulatory certification, or proof that every workflow works.

## Fixes made in this audit

| Problem found | Change and how it works | Main files |
|---|---|---|
| Creating budget input silently produced a verified transaction with no verifier | Creation now writes `draft`, with no verification timestamp/identity. Only submitted transactions can be reviewed. Draft/submitted/rejected amounts remain outside verified totals. | backend/app/services/anggaran.py; endpoints/realisasi_anggaran.py |
| Other users could edit, submit or delete someone else's draft | Server checks the authenticated operator against the stored owner. Mutations lock the pagu before the transaction and re-check state. | services/anggaran.py |
| UI-only finance permissions; app administrator treated as financial authority | Input requires admin or the configured finance/planning department. Review separately requires a documented, date-valid `verify_budget` grant, and reviewer must differ from operator. This is an internal review, not payment approval. | endpoints/realisasi_anggaran.py; core/authority.py |
| Invalid fiscal dates, empty document references, arbitrary attachments and imprecise amounts | Validate active fiscal year, calendar year and period bounds, strip/validate required text, constrain Decimal to database precision, reject same-pagu duplicate document references under the pagu lock. Evidence must belong to the operator and be a real file record; stored metadata comes from that record. | schemas/anggaran.py; services/anggaran.py |
| Missing supporting evidence and weak review concurrency | Submit/verify require evidence. Verification recalculates verified spending with a locking read while holding the common pagu lock. Consistent lock ordering reduces competing-operation deadlock risk. Must still validate against MySQL under load. | services/anggaran.py |
| No durable sequence of financial review changes | New `budget_event` table captures actor, action, UTC timestamp and row snapshot in the same database transaction as create/edit/submit/review/delete. API provides read-only history; UI displays it. No history is fabricated for old transactions. | models/operations.py; services/anggaran.py; BudgetActions.tsx |
| Financial UI could not complete a manual review workflow | Added owner edit/evidence upload/submit and separately authorized verify/reject actions, server error display, evidence download and history. Rejected records can be corrected and resubmitted. | BudgetActions.tsx; RealisasiAnggaranView.tsx |
| Random invented SPD numbers, fixed August 2026 period, misleading success text | Source document number is now user-entered; initial date/period use the local current date; both entry forms say “Simpan Draft” and report actual draft status. Removed invented fallback attachment paths. | InputRealisasiView.tsx; TambahRealisasiModal.tsx; services/api.ts |
| First 100 transactions mistaken for the complete dataset | Added 50-row server pagination and total count to transaction/review views. | RealisasiAnggaranView.tsx |
| Search triggered dashboard, transactions and report together on every keystroke | Added 350ms search debounce and tab-specific fetching. Summary/report requests are no longer fetched with every transaction search. | RealisasiAnggaranView.tsx |
| One extra SUM query for every pagu row | Replaced per-row totals with one grouped query for all pagu IDs on the page. A 50-row page now needs one totals query instead of 50. No measured latency claim yet. | services/anggaran.py |
| Export used a truncated transaction page and unsafe CSV quoting | Main budget export now uses the complete server monthly aggregate for the selected year/department/account, all twelve months and a totals row. Shared CSV encoder escapes quotes/newlines and neutralizes formula-like text. Export is an annual monthly matrix; month/search filters on the transaction page do not narrow it. | RealisasiAnggaranView.tsx; services/csv.ts |
| Letter workflow fetched every record | Added bounded backend pagination and kind filtering; UI uses 50 rows with next/previous controls. | endpoints/operations.py; SuratMenyuratModule.tsx |
| Legacy surat API accepted invalid dates silently and defaulted to October 2026 | Typed date validation, year/month consistency, Roman month derived from date, reference validation, and department ownership checks. | endpoints/surat.py |
| Legacy surat list/export/verification-code/disposition paths lacked object-level access checks | Limit access to owner, assigned recipient or administrator. Validate active disposition recipients and ownership of parent disposition. Legacy surat-tugas list is now admin-only and bounded. | endpoints/surat.py |
| Unknown archive access labels became broadly readable | Whitelist recognized internal/public values, restrict same-department access to `terbatas`, reject unknown labels on update, and align file-download checks. This is still not a full KPU secrecy-classification implementation. | services/arsip.py; endpoints/arsip.py; schemas/arsip.py; endpoints/files.py |
| File could remain after failed DB registration; assigned budget reviewers could not download evidence | Delete newly written file on registration failure; allow authorized budget reviewers to access linked evidence. | endpoints/files.py |
| Container startup did not check database readiness | Added `/health/ready` (503 on failed DB probe), backend container health check, frontend healthy-backend dependency, and production authority-grant environment wiring. Official issuance and API docs remain disabled. | app/main.py; docker-compose.production.yml |

Earlier safeguards remain in the checkout: password hashing and legacy upgrade, database-backed sessions and revocation, persistent letter history/version checks, restricted backups, restore validation, and official-letter issuance/permanent archive destruction gates. Their earlier implementation does not substitute for full release testing.

## Reference systems and regulatory scope

- KPU SINDE guidance: [Kep KPU 43/2022](https://jdih.kpu.go.id/keputusan-kpu/download/948). Use as the closer correspondence reference; keep registration, disposition, review, authorized numbering/signature and delivery distinct.
- ANRI [SRIKANDI service](https://anri.go.id/layanan-publik/layanan-srikandi): reference for electronic records management. This application does not claim SRIKANDI integration or equivalent functionality.
- Kemenkeu [SAKTI administration roles](https://djpb.kemenkeu.go.id/kppn/jakarta1/id/data-publikasi/sakti/modul-modul-sakti/2810-modul-administrasi.html): distinguishes administrator, operator, validator and approver. Used as a separation-of-duties reference, not as proof that this simpler internal review implements the full SAKTI chain.
- [Kep KPU 1027/2025](https://jdih.kpu.go.id/data/data_kepkpu/2025kpt1027.pdf): financial-management reference. The 228-page document has not been fully mapped clause by clause to this application.
- See KPU_REGULATORY_REVIEW.md for earlier numbering, signing, classification, retention and certificate gaps. Actual KPU Sulut appointments/SOPs and applicable current amendments must be reviewed by office owners before release.

## Checks actually executed

| Check | Result |
|---|---|
| Backend unit suite | 14 passed: password, letter transition, authority, backup/restore validation and budget input contracts |
| CSV regression tests | 2 passed: quoting/newlines and formula-like text handling |
| Python AST parse | 71 files parsed successfully |
| Frontend esbuild syntax/local-import bundle | Passed, dependencies external; NOT TypeScript checking or production Vite compilation |
| Compose YAML parse | Both files parsed; NOT a Docker build, health check or deployment test |
| `npm run build` | Blocked: `tsc: command not found`; dependency installation previously failed with registry DNS ENOTFOUND |
| SQLAlchemy async/runtime | Blocked: local Python 3.14 environment lacks `greenlet` |
| Docker runtime | Blocked: permission denied accessing local Docker socket |
| MySQL integration, browser UAT, load test, real restore | Not run |

## Test sequence and acceptance checklist

Run all destructive/failure/concurrency tests against an isolated staging database and files directory. Test data must be synthetic. Assign each item a tester, date, evidence link and pass/fail result; failed or unexecuted release-critical tests remain blockers.

### 1. Environment, build and integration

- [ ] Use Python 3.11 as in the Docker image, install backend requirements, and verify imports including `greenlet`/aiomysql. Install frontend with `npm ci`; run `npm run build` and `npm run lint`. Resolve all failures, including pre-existing ones.
- [ ] Run unit tests from backend: `../venv/bin/python -m unittest discover -s tests -p 'test_*unit.py' -v`.
- [ ] Run CSV tests after installing dependencies: from frontend, `npx --no-install esbuild tests/csv.test.ts --bundle --platform=node --outfile=/tmp/ptp-csv-tests.cjs`, then `node --test /tmp/ptp-csv-tests.cjs`.
- [ ] Provision a new empty MySQL database ending `_test`, set explicit `DATABASE_URL`, test-only `SECRET_KEY` and disposable absolute `UPLOAD_DIR`, then from backend run `../venv/bin/python tests/integration_release.py`. It refuses a nonempty database. Inspect retained synthetic records afterwards.
- [ ] Integration script now covers draft status, ownership, fiscal-year mismatch, foreign evidence, duplicate document, null amount, absent grant, self-review, rejection/resubmission and competing approvals. It is supplied, not yet proven passing.
- [ ] Test both `/api/v1` and legacy `/api` aliases; neither may bypass authentication or authorization.

### 2. Feature tests: surat menyurat

- [ ] Incoming: register actual source number, upload/download evidence, assign active employee, accept/complete disposition, archive workflow. Refresh/restart and confirm persistence.
- [ ] Outgoing: draft → submit → revision → edit → resubmit → internal approval → archive. Check actor, timestamps, notes and version increments.
- [ ] Two browser tabs update the same version: one succeeds, the stale action returns 409 without overwriting history.
- [ ] Unrelated user cannot list/read/export another user's legacy letter, retrieve its verification token, or create/read its disposition.
- [ ] Invalid dates, year/month mismatch, unknown references, inactive recipients and a parent from another letter are rejected.
- [ ] Load more than 100 letters; traverse every page and switch incoming/outgoing filters without omissions/duplicates.
- [ ] Verify official issuance remains disabled and ALUR numbers/internal review are never presented as an authorized signature or official issuance. Validate official templates, signer delegation and certified TTE separately before enabling those functions.

### 3. Feature tests: realisasi anggaran

- [ ] Create a Rp100 pagu and Rp60 draft: draft must not increase verified realization. Supply evidence, submit, have a different authorized reviewer approve; verified=60 and remaining=40.
- [ ] Submit two Rp60 transactions against Rp100 and approve concurrently: exactly one may succeed; totals must never exceed pagu. Test repeated approval requests and simultaneous budget revision/closure too.
- [ ] Reject with a reason, inspect history, edit as original operator, resubmit, approve. Old review events must remain after the new decision and after service restart.
- [ ] Reject zero/negative/NaN/overprecision amounts, blank number/description/rejection reason, mismatched year, date outside period, inactive/closed year and excessive spending.
- [ ] Double-click/retry the same source reference for one pagu: second create gets 409. If a real document legitimately has multiple lines in one pagu, agree a unique line-reference convention with finance; current deduplication assumes one reference per pagu.
- [ ] Reject another operator's edit/submit/delete, forged evidence ID/path, missing evidence at submission, absent/expired authority, and self-review even by an administrator.
- [ ] Test user with real review grant but no Admin role, including evidence download. Review permissions come from server capability response.
- [ ] Enter >100 transactions across years, accounts and departments; test every page, search and filters. Check that pagu/account dropdown limits do not hide valid choices at office scale (remaining scalability item).
- [ ] Reconcile monthly CSV and dashboard totals with independent SQL/source records, including December/January boundaries, rejected/draft exclusions and decimals. CSV includes complete annual monthly aggregates, not just a displayed page.
- [ ] Open a CSV with commas, quotes, newlines, Indonesian names and `=...` text in Excel/LibreOffice: preserve text without evaluating formulas.
- [ ] Reconcile existing historically auto-verified rows. This update intentionally does not rewrite or invent approvals for old records.

### 4. Other features, security and usability

- [ ] Correct/incorrect login, expired token, logout, password/role/department change and deactivation. Old tokens must fail after revocation; last active administrator protection must hold.
- [ ] Confirm archive upload, bounded list/search, access isolation, trash/restore, denied permanent deletion, bug-report persistence and restricted admin changes.
- [ ] Test allowed/unsupported extensions, oversized/empty/corrupt uploads, interrupted uploads and failed DB registration. Add content/malware scanning appropriate to the office before accepting untrusted documents; extension checking alone is not content validation.
- [ ] Directly call forbidden endpoints with copied IDs; hiding UI buttons is insufficient. Review all department and authority grants against actual office assignments.
- [ ] Check HTML/script strings in form fields, SQL-like search values, malicious filenames and invalid tokens; no executable content or unexpected privilege/data exposure.
- [ ] Keyboard navigation, labels, readable errors, loading/empty states, dark/light mode, narrow screens; browsers actually used by staff. Check duplicate clicks, expired session during submission and network outage/retry.
- [ ] Exercise local AI/Ollama separately, including model absent, service unavailable, timeout and long response. AI text must not independently authorize documents or financial records.

### 5. Performance and resilience

- [ ] Seed representative synthetic data: suggested starting sizes 10,000 letters and 100,000 budget rows spread across years/accounts. These are proposed test sizes, not measured capacity.
- [ ] Establish a single-user baseline for list, pagu, summary, report, upload/download and login. Capture median/p95/p99, throughput, failed requests, CPU/RAM, DB pool usage and slow queries.
- [ ] Install k6 and run `tests/performance/read-workflows.js` with `PTP_BASE_URL`, `PTP_TOKEN` and `PTP_STAGING=yes` in the environment. It is read-only and ramps 5→10→20 users. Keep credentials out of shell history/logs.
- [ ] Initial suggested goals: ordinary API p95 <1.5s, failures <1%, no incorrect totals/lost writes. Agree final targets with office users; these are not regulatory thresholds. Report heavy export/upload timings separately.
- [ ] Check the 350ms debounce and Network panel: transaction search must not fetch summary/report. Confirm pagu page SQL query count stays roughly constant from 1 to 50 rows.
- [ ] Repeat at agreed peak and twice peak; run a 1–2 hour soak. Measure memory growth, file descriptors, DB connections and disk growth. Test competing writes with separate users.
- [ ] Distinguish gateway throttling (429) from application/DB latency. Current IP-based limits can group staff behind the same NAT/reverse proxy; configure trusted proxy handling and calibrate before release, never blindly trust client-supplied forwarded headers.
- [ ] Stop MySQL: readiness must become 503 and UI must show errors; restart and verify recovery. Test Ollama outage independently. No fake success or loss of committed data.

### 6. Deployment, backup and operational acceptance

- [ ] Back up the existing database and uploads independently; restore to a separate target before migration. Do not reseed operational data.
- [ ] Identify actual schema (current integer-ID vs old UUID Alembic history). For the current schema run `python upgrade_operations.py` to create missing operations tables, including new `budget_event`; test on a restored clone first. Existing Alembic history is not a proven upgrade route.
- [ ] Fresh install: follow RUNBOOK.md. Replace seeded credentials immediately; remove synthetic data; verify least-privilege DB access and backup privileges.
- [ ] Supply strong unique secrets and real, documented `AUTHORITY_GRANTS`; keep `OFFICIAL_ISSUANCE_ENABLED=false`. Verify grant dates and server clock/timezone. Do not copy test grants to production.
- [ ] Run `docker compose -f docker-compose.production.yml config --quiet`, build images, start dependencies, initialize/upgrade schema, then start application. Verify all health checks. Readiness probes DB connectivity, not schema correctness.
- [ ] Configure domain/DNS, valid TLS certificate and renewal, HTTP→HTTPS redirect and a trusted reverse proxy to 127.0.0.1:8080. Check request limits/timeouts and forwarded-client-IP behavior. Do not expose MySQL, Ollama or backend ports publicly.
- [ ] Persist DB/uploads/backups volumes. Restart/recreate containers and verify records, attachments and review events survive. Pin tested dependency/image versions and retain previous release images.
- [ ] Schedule encrypted off-host backups, retention and failure alerts. Perform real mysqldump + file backup and restoration to an EMPTY isolated database/new upload directory; reconcile checksums, document counts and financial totals.
- [ ] Suggested initial recovery goals for discussion: backup data-loss window ≤24h and restoration ≤4h. Measure and get office approval; current code alone does not establish these goals.
- [ ] Monitor uptime, DB readiness, 5xx/429, slow requests, backup failures, storage/certificate expiry and authority expiry. Assign an owner and escalation path.
- [ ] Rehearse rollback with matching code/schema/data/files. Obtain signed UAT from correspondence, finance and IT owners; resolve regulatory/authority gaps before real official use.

## Remaining release blockers and limitations

1. Full build, lint, real integration/concurrency tests, browser checks, load measurement and restore drill are pending.
2. KPU-specific official numbering/signature/TTE, retention/disposal and full secrecy classification remain incomplete; gates must stay closed.
3. Historical auto-verified finance data needs reconciliation. New audit events are append-only through the API, not cryptographically tamper-proof or protected from database administrators.
4. Finance input department matching remains name-based; master budget changes still use existing administrative permissions. Replace/approve this mapping with explicit office-authorized role definitions before production.
5. Master dropdown caps, shared-IP rate limits, dependency pinning, content scanning and off-host backup scheduling require deployment-scale validation/configuration.
6. No SAKTI/SINDE/SRIKANDI integration, external delivery receipt, or official accounting reconciliation is implemented by these changes.

Promote only after all applicable release-critical checkboxes have evidence and the office owners accept the remaining scope explicitly.
