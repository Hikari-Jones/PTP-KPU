# PTP-KPU two-day deployment acceptance checklist

Prepared 18 November 2026 (Asia/Makassar). Target discussed: two days from now; confirm the actual cutover window with office owners.

**Current decision: readiness has not yet been established.** This checklist is an acceptance plan, not a record of newly executed tests. The latest merge report is `docs/AI_MERGE.md`. Earlier audit references to Ollama are superseded by the in-process KIRANA model.

**Priority:** P0 = launch gate for included functionality; P1 = operational/quality requirement whose unmet result needs a documented scope decision. Security, data integrity, financial correctness and recoverability cannot be waived by calling the release a pilot. An optional feature may be deferred only if disabled at the API and UI and core workflows still pass.

**Evidence:** For each ID, record PASS / FAIL / BLOCKED / NOT RUN / N/A, tester, time, release version, expected/actual result and an evidence path. Unchecked does not mean passed. N/A requires a reason and owner.

## Known project-specific limits

- Clean target dependency installation, exact production build, real MySQL integration/concurrency, model inference, browser UAT and actual backup restore are not yet verified by the merge work.
- Local verification was blocked by registry access and missing greenlet/sqlglot; isolated tests used mocks/stubs and cannot establish production runtime correctness.
- Cross-satker endpoint explicitly returns 503. Certified TTE, external delivery and SAKTI/SINDE/SRIKANDI integration are not implemented by this merge.
- Official issuance remains disabled; internal financial review is not external payment authorization.
- Review current menu mappings, hardcoded profile fallbacks, department-name permissions, broad backend version ranges and actual target-hardware inference capacity.

## Scope and release control

- [ ] **SCOPE-01 · P0** — Define the intended launch: internal tracking/drafting or official issuance/payment operations; record explicitly what users may rely on.
- [ ] **SCOPE-02 · P0** — Name correspondence, finance and IT owners; approve the role/action/data visibility matrix with them.
- [ ] **SCOPE-03 · P0** — Freeze a release commit and configuration; test and deploy exactly that version, retaining previous images and settings securely.
- [ ] **SCOPE-04 · P0** — Keep OFFICIAL_ISSUANCE_ENABLED=false unless the separate official issuance requirements have actually been completed and accepted.
- [ ] **SCOPE-05 · P0** — Exclude unavailable cross-satker consolidation, certified TTE, external delivery and external-system integrations from promised functionality.
- [ ] **SCOPE-06 · P0** — Use an isolated staging database/files store and synthetic data for failure, attack and concurrency tests; never run the integration script against office data.
- [ ] **SCOPE-07 · P1** — Prepare realistic staging data: multiple departments, restricted records, different fiscal years, more than 100 records and representative attachments.

## Installation and production build

- [ ] **BUILD-01 · P0** — Install backend requirements in a fresh environment on the target OS/CPU. Verify Python/model-wheel compatibility; supplied Docker uses Python 3.11.
- [ ] **BUILD-02 · P0** — Verify imports for greenlet, sqlalchemy.ext.asyncio, aiomysql, sqlglot, kirana_llm and llama_cpp; no stubbed dependencies in release tests.
- [ ] **BUILD-03 · P0** — Run npm ci, npm run build, npm run lint and npm test using the lockfile and the selected production Node version. Resolve failures; record any consciously accepted noncritical findings.
- [ ] **BUILD-04 · P0** — Run the full backend unit suite with no skipped SQL-validation tests and run guarded MySQL integration tests in a fresh empty _test database.
- [ ] **BUILD-05 · P0** — Build and start actual production images, not just docker compose config. Check container logs, /health and /health/ready.
- [ ] **BUILD-06 · P0** — Rehearse schema setup/upgrade and restart from a clean install and a restored copy of the existing installation.
- [ ] **BUILD-07 · P1** — Pin/archive the tested dependency set and image digests; backend requirements currently use broad minimum versions.
- [ ] **BUILD-08 · P1** — Verify application/model operation without internet after dependencies and weights have been prepared.

## Chatbot installation and operation

- [ ] **AI-01 · P0** — Install from backend/requirements.txt; ensure the 2.1 GB model download completed and the actual llama_cpp runtime can load it on target hardware.
- [ ] **AI-02 · P0** — Send a real generation request. /ai/status reports file presence/loading state and alone does not prove inference works.
- [ ] **AI-03 · P0** — Verify the model persists after container recreation, uses the intended KIRANA_MODEL_DIR/PATH and does not redownload on every start.
- [ ] **AI-04 · P0** — Run representative live data questions for current workflow_letter correspondence, archives and verified budgets; compare every factual result with the module and independently calculated expected values.
- [ ] **AI-05 · P0** — Check sums, decimals, counts, filters, empty results, missing data and restricted subsets. No invented records or unsupported totals may be accepted in the release acceptance set.
- [ ] **AI-06 · P0** — Verify chatbot access with admin, owner, assignee and unrelated users. Test explicit columns, SELECT *, joins, CTEs, unions and nested queries against restricted records and credentials.
- [ ] **AI-07 · P0** — Try unauthorized reading/writes, multiple SQL statements, schema access, expensive SQL and instructions to ignore permissions. Database enforcement must reject violations regardless of model compliance.
- [ ] **AI-08 · P0** — Test prompt injection in user prompts and stored document/letter text. It must not expand database access or reveal secrets.
- [ ] **AI-09 · P0** — Check missing/corrupt model, unavailable DB and inference exceptions. Show an honest failure; preserve correspondence/budget functionality and never report a fake successful action.
- [ ] **AI-10 · P0** — Verify stop/disconnect/session expiry during a response and two concurrent requests plus excess load; slots/workers recover and core modules stay usable.
- [ ] **AI-11 · P1** — Verify streaming through the actual production HTTPS proxy, including first cold request, long answers, split text and interrupted connections.
- [ ] **AI-12 · P1** — Check conversation continuation, regeneration, new chat, Markdown/tables/code, copy/download and long input/history validation.
- [ ] **AI-13 · P0** — Switch accounts in one browser and use separate browsers; no shared chat history. Agree whether persistent local chat on shared office PCs is acceptable and how it is cleared.
- [ ] **AI-14 · P1** — Measure cold load, warm first-token time, answer time, queue wait, CPU and RAM. Account for one model copy per worker before increasing process count.
- [ ] **AI-15 · P0** — Label drafting/advice appropriately; unknown names/numbers remain placeholders; users review every generated official-looking document.

## Surat menyurat

- [ ] **SURAT-01 · P0** — Incoming: register genuine source number/date/sender/subject, upload attachment, assign an active recipient, complete disposition and archive; verify after refresh and restart.
- [ ] **SURAT-02 · P0** — Outgoing: draft, submit, request revision, edit/resubmit, internal approve and archive; valid transitions work and invalid/out-of-order transitions fail.
- [ ] **SURAT-03 · P0** — Verify owner/assignee/admin access via UI and direct API, including downloads, legacy exports, verification tokens and disposition endpoints.
- [ ] **SURAT-04 · P0** — A second browser tab using a stale version must receive conflict feedback and must not overwrite newer content/history.
- [ ] **SURAT-05 · P0** — Check duplicate clicks/retries and competing official numbering requests if numbering is enabled. No duplicate numbers or partially published records.
- [ ] **SURAT-06 · P0** — Test inactive recipients, invalid/mismatched dates, unknown classification/department and a parent disposition belonging to another letter.
- [ ] **SURAT-07 · P0** — Audit entries contain the actual actor, action, timestamp and note; history survives revision/restart and cannot be rewritten through normal APIs.
- [ ] **SURAT-08 · P0** — Keep internal ALUR identifiers and internal approval distinct from official numbers, signature/TTE, dispatch and delivery receipts.
- [ ] **SURAT-09 · P1** — Check source document templates and printed/downloaded output: kop, names/NIP, date, classification, numbering, margins, pagination and readable attachments.
- [ ] **SURAT-10 · P1** — Check every surat menu target; current App.tsx maps surat-masuk and surat-tugas to the same view, so validate intended navigation before release.
- [ ] **SURAT-11 · P1** — Test search, incoming/outgoing filters, pagination over 100 records, back navigation and complete totals rather than only first-page totals.
- [ ] **SURAT-12 · P0** — Verify how current workflow_letter records and legacy surat_keluar/penomoran records relate; no missing or double-counted records across screens/chatbot.

## Budget master data

- [ ] **MASTER-01 · P0** — Verify real fiscal years, opening/closing dates, account codes, department mappings, initial pagu and active pagu against approved source data.
- [ ] **MASTER-02 · P0** — Create/edit/activate/close fiscal years; closed/inactive/wrong-period years reject prohibited new operations.
- [ ] **MASTER-03 · P0** — Validate account uniqueness, required references, inactive accounts and deletion attempts involving already-referenced records.
- [ ] **MASTER-04 · P0** — Restrict account/pagu/year/revision mutations to office-approved users on the server, not only disabled UI buttons.
- [ ] **MASTER-05 · P0** — Budget revisions preserve before/after values, dates, reasons and actors; reductions must not create invalid spending availability.
- [ ] **MASTER-06 · P0** — Concurrent revision, verification and year closure preserve coherent totals and transaction state.
- [ ] **MASTER-07 · P1** — Load office-scale accounts/years/pagu; dropdown caps and pagination must not silently hide valid choices.
- [ ] **MASTER-08 · P0** — Cross-satker currently returns 503 because no verified data source is connected. Hide/clearly mark unavailable, or treat a required cross-satker launch as blocked.

## Realisasi anggaran transactions

- [ ] **BUDGET-01 · P0** — New records are drafts and excluded from verified totals; submit with valid evidence and approve using a distinct authorized reviewer.
- [ ] **BUDGET-02 · P0** — Test Rp1,000,000 pagu and Rp600,000 realization: draft/submitted/rejected leaves verified total zero; verification yields Rp600,000 spent and Rp400,000 remaining.
- [ ] **BUDGET-03 · P0** — Reject with reason, inspect history, correct as owner, resubmit and verify; old events persist and are attributed correctly.
- [ ] **BUDGET-04 · P0** — Verify actual AUTHORITY_GRANTS, action names, assigned IDs and validity dates. Missing/expired grants and self-review fail, including for administrators.
- [ ] **BUDGET-05 · P0** — Submit two Rp600,000 records against Rp1,000,000 and verify concurrently using distinct reviewer sessions: exactly one may verify; no overspend or double-counting.
- [ ] **BUDGET-06 · P0** — Test repeated approval, double-click creation, timeout/retry, duplicate references and simultaneous edits without duplicate committed operations.
- [ ] **BUDGET-07 · P0** — Reject negative/zero/NaN/overprecision amounts, blank descriptions/numbers, wrong fiscal year, invalid dates and dates outside allowed periods.
- [ ] **BUDGET-08 · P0** — Reject another operator's edit/submit/delete and arbitrary attachment IDs/paths. Missing evidence must prevent submission/review as specified.
- [ ] **BUDGET-09 · P0** — A non-admin with a valid review assignment can perform the intended review and download evidence; an unassigned administrator cannot bypass review authorization.
- [ ] **BUDGET-10 · P0** — Check budget-event persistence in the same transaction and ensure failed operations leave neither partial data nor false successful history.
- [ ] **BUDGET-11 · P0** — Reconcile historical auto-verified records against source evidence; this merge does not retroactively authenticate their approvals.
- [ ] **BUDGET-12 · P1** — Agree a reference convention for legitimate multi-line documents: current deduplication assumes one reference per pagu.

## Reports, dashboards and exports

- [ ] **REPORT-01 · P0** — Independently reconcile totals across transaction list, dashboard, monthly/yearly reports, CSV and chatbot using the same filters and status rules.
- [ ] **REPORT-02 · P0** — Confirm only verified transactions count; drafts/submitted/rejected and other fiscal years must not inflate realized spending.
- [ ] **REPORT-03 · P0** — Test Indonesian currency formatting, decimals, December/January boundaries, timezone display, empty data and changed budget revisions.
- [ ] **REPORT-04 · P0** — With over 100 transactions, exports include the entire documented scope rather than only the currently visible page.
- [ ] **REPORT-05 · P1** — Explain and test the main CSV scope: annual monthly aggregates, not necessarily the transaction list's month/search filters.
- [ ] **REPORT-06 · P1** — Open real output in office Excel/LibreOffice/PDF readers; check encoding, quotes, commas, newlines, long text and formula-like values.
- [ ] **REPORT-07 · P0** — Dashboard source failures show unavailable/error states rather than fabricated figures or unmarked stale/sample data.
- [ ] **REPORT-08 · P1** — Check refresh after mutations, filter consistency, chart labels and whether totals describe the full dataset or a visible subset.

## Arsip and document files

- [ ] **ARSIP-01 · P0** — Upload, register metadata, search/filter, preview, download, move to trash and restore; content/metadata survives refresh, logout and restart.
- [ ] **ARSIP-02 · P0** — Validate public/internal/restricted/private classifications with owner, same department, other department and administrator; direct file URL access must match metadata visibility.
- [ ] **ARSIP-03 · P0** — Reject unauthorized metadata/access-label changes and unknown access labels; moving a document must not accidentally broaden access.
- [ ] **ARSIP-04 · P0** — Permanent deletion remains blocked until separately authorized retention/disposal processes exist. Trash is reversible and not official destruction.
- [ ] **ARSIP-05 · P0** — Test file size/extension/content, malformed and empty files, disguised executable content, traversal filenames and duplicate names; define and enforce the accepted content/scanning policy.
- [ ] **ARSIP-06 · P0** — Verify download response MIME/headers and avoid executing untrusted content inline. Original names must never control server storage paths.
- [ ] **ARSIP-07 · P0** — Test disk full, interrupted upload and DB registration failure; no success toast for a failed write and no inaccessible/orphaned committed attachment.
- [ ] **ARSIP-08 · P0** — Production upload directory/volume ownership and proxy upload limits agree; files persist after container replacement.
- [ ] **ARSIP-09 · P1** — Test larger supported files and office formats on the actual clients; unsupported previews offer a working download without claiming a rendered preview.

## Login, accounts and permissions

- [ ] **AUTH-01 · P0** — Test correct/incorrect login, inactive users, expired/tampered tokens and missing tokens. Validate both /api and /api/v1 aliases.
- [ ] **AUTH-02 · P0** — Verify logout, password reset, role/department change and deactivation revoke existing sessions; test from a second already logged-in browser.
- [ ] **AUTH-03 · P0** — Use separate admin, surat operator, finance operator, assigned reviewer and unrelated staff accounts; directly call forbidden API operations and guess record IDs.
- [ ] **AUTH-04 · P0** — Confirm read-only users cannot write through forged requests and ordinary users cannot grant themselves administration or financial authority.
- [ ] **AUTH-05 · P0** — Replace seed/default credentials, use strong unique secrets and restrict secrets/config permissions; no passwords/tokens in logs or exported diagnostics.
- [ ] **AUTH-06 · P0** — Create/update/deactivate users, reject duplicate NIP, preserve the selected role when editing, and protect the last active administrator.
- [ ] **AUTH-07 · P0** — Approve the department-name-based edit mapping against the actual office structure; verify renamed departments do not accidentally gain or lose authority.
- [ ] **AUTH-08 · P1** — Test shared-IP login/API limits and trusted-proxy IP configuration; ordinary office traffic must not lock out everyone behind one address.
- [ ] **AUTH-09 · P0** — Review stored/reflected XSS and SQL injection across forms, search, Markdown, previews and filenames; browser-stored JWTs make XSS prevention especially important.

## Other application features

- [ ] **OTHER-01 · P1** — Profile/settings show the logged-in account accurately; inspect existing hardcoded fallback names/email/NIP so missing fields do not display another identity.
- [ ] **OTHER-02 · P1** — Theme, sidebar, responsive layout, keyboard navigation and dialogs work without hiding save/error controls; preferences persist as intended.
- [ ] **OTHER-03 · P1** — Bug reports persist, belong to the reporter and expose status changes only to administrators; unrelated staff cannot read/change another report.
- [ ] **OTHER-04 · P1** — Admin dashboard counters use real data, refresh after changes and show source failures clearly.
- [ ] **OTHER-05 · P1** — FAQ/help text accurately describes implemented workflows, current AI installation and unavailable features; no misleading signing/delivery claims.
- [ ] **OTHER-06 · P1** — Every visible action/button/menu has a real result or an explicit unavailable state. Verify notifications/email/password-recovery claims against actual implementation.
- [ ] **OTHER-07 · P0** — Cadangan Sistem permits only authorized administrators to create/list/download backups; ordinary users cannot retrieve backup names or archives directly.

## Local MySQL and schema migration

- [ ] **DB-01 · P0** — Verify the actual target MySQL version, SQL mode, collation/utf8mb4, InnoDB behavior and OS path differences on the deployment machine.
- [ ] **DB-02 · P0** — Use a dedicated restricted application DB account, not root; prove required runtime and separately assigned backup permissions work.
- [ ] **DB-03 · P0** — Identify current integer-ID schema versus historical UUID/Alembic lineage; do not blindly run incompatible migrations.
- [ ] **DB-04 · P0** — Test upgrade_operations.py on a restored clone; compare row counts, financial totals, primary/foreign keys, indexes and required new tables/columns before and after.
- [ ] **DB-05 · P0** — Separate fresh seeding from upgrading an existing DB; upgrades must preserve operational data and never replace it with demo records.
- [ ] **DB-06 · P0** — Verify uniqueness, foreign-key integrity, transactional rollback and MySQL row-lock behavior using real concurrent requests.
- [ ] **DB-07 · P0** — Stop/restart MySQL: readiness changes appropriately, API/UI report failure, connections recover, and committed data remains intact.
- [ ] **DB-08 · P0** — Persist database storage across app/container/host restarts; do not remove volumes as a troubleshooting shortcut.
- [ ] **DB-09 · P1** — Check indexes/query plans for lists/search/reports and connection-pool behavior at realistic record volume.
- [ ] **DB-10 · P0** — Agree stored/displayed timezone, synchronize clocks and test WITA/UTC midnight and fiscal boundary behavior.

## Backups, recovery and rollback

- [ ] **RECOVERY-01 · P0** — Create a real MySQL-plus-uploads backup and retain secrets/config recovery material separately and securely.
- [ ] **RECOVERY-02 · P0** — Restore to a new empty database and new upload directory on an isolated target; verify login, document hashes/downloads, workflow history and exact financial totals.
- [ ] **RECOVERY-03 · P0** — Measure recovery time and data-loss window. Office owners approve both; example discussion targets are <=4 hours restore and <=24 hours loss, not established capabilities.
- [ ] **RECOVERY-04 · P0** — Schedule encrypted/off-host backups with retention, access control, failure alerts and enough storage; a backup on the same disk is not sufficient for disk failure.
- [ ] **RECOVERY-05 · P0** — Verify backup/file consistency during normal activity and prevent schema changes/deletion operations from invalidating the recovery snapshot.
- [ ] **RECOVERY-06 · P0** — Test failed/tampered backup rejection, unavailable mysqldump, insufficient backup permissions and disk exhaustion; never publish a false successful backup.
- [ ] **RECOVERY-07 · P0** — Rehearse rollback of matching application/schema/files. Define how new writes after cutover are retained or reconciled before reverting data.
- [ ] **RECOVERY-08 · P1** — Verify host recovery has the model weights/dependencies and documented secret access, not only the application database.

## Deployment host and network

- [ ] **DEPLOY-01 · P0** — Run the production build with no reload/debug server; configure automatic startup/restart after host reboot and service failure.
- [ ] **DEPLOY-02 · P0** — Configure intended LAN DNS/address, HTTPS with trusted certificates, renewal and proxy headers; test from another actual office PC.
- [ ] **DEPLOY-03 · P0** — Current production mapping is 127.0.0.1:8080. Provide the intended trusted reverse proxy/LAN entry point; localhost-only success is not office accessibility.
- [ ] **DEPLOY-04 · P0** — Keep MySQL/backend private behind the proxy and restrict firewall access to intended networks; disable unused API docs and remove unneeded exposed ports.
- [ ] **DEPLOY-05 · P0** — Verify production reverse-proxy streaming/upload timeouts, request sizes, authentication headers and rate limits for real traffic.
- [ ] **DEPLOY-06 · P0** — Verify persistent mysql_data, uploads, backups and kirana_models volumes, filesystem ownership and capacity.
- [ ] **DEPLOY-07 · P0** — Test browser -> proxy -> backend -> MySQL/model end-to-end with the actual production image and config, not Vite development proxy.
- [ ] **DEPLOY-08 · P1** — Account for antivirus, OS updates, laptop sleep/hibernation, power loss and UPS/auto-restart policy; assign maintenance windows.
- [ ] **DEPLOY-09 · P0** — Scan and triage application/dependency/container vulnerabilities; no unresolved exploitable critical/high issue in exposed launch scope.

## Performance, concurrency and resilience

- [ ] **PERF-01 · P0** — Define expected simultaneous users and data volume; test that load and an agreed burst above it on the target hardware.
- [ ] **PERF-02 · P1** — Run supplied k6 read-workflows test; it currently ramps to 20 users and targets p95 <1500ms and request error rate <1%. These are proposed test thresholds, not observed results.
- [ ] **PERF-03 · P0** — Test writes independently of read load: competing approvals, edits, duplicate requests, uploads, report exports and backup activity.
- [ ] **PERF-04 · P0** — Run AI concurrently with budget/correspondence requests. No data loss, unauthorized success, overspending or OOM is acceptable even if AI queues.
- [ ] **PERF-05 · P1** — Choose office-approved AI cold/warm latency targets and measure queue/first-token/full-answer separately; do not apply a 1.5-second ordinary-API threshold to model generation.
- [ ] **PERF-06 · P1** — Run at least a representative work-period soak, preferably overnight; check growth in memory, DB connections, storage and error rates.
- [ ] **PERF-07 · P0** — Test staging-only DB outage, network interruption, service crash and restart; clear user feedback, safe retry and eventual recovery must be demonstrated.

## Monitoring and audit operations

- [ ] **OPS-01 · P0** — Monitor actual readiness and core workflow availability, not only HTTP server liveness. AI readiness requires a separate real inference probe/operational check.
- [ ] **OPS-02 · P0** — Record errors, slow requests, login failures, unauthorized operations and review actions with useful actor/request/time context without secrets or unnecessary document content.
- [ ] **OPS-03 · P0** — Set alerts/ownership for unavailable DB, repeated 5xx, storage exhaustion and failed backups; confirm someone receives and can act on an alert.
- [ ] **OPS-04 · P1** — Track CPU/RAM/disk, DB connections, slow reports, model queue/latency, 429s and certificate/authority-grant expiry; rotate logs.
- [ ] **OPS-05 · P0** — Document administrator access, start/stop/restart procedures, recovery steps, emergency disablement and escalation contacts.
- [ ] **OPS-06 · P1** — Retain release/test evidence and audit history according to agreed office policy; application history is not tamper-proof against database administrators.

## Office acceptance and cutover

- [ ] **UAT-01 · P0** — Real correspondence and finance users complete their daily tasks independently using a realistic staging scenario, including correction/rejection/error handling.
- [ ] **UAT-02 · P0** — Owners verify exact document fields, amounts, permissions and report meanings against source records; obtain explicit launch acceptance with known exclusions.
- [ ] **UAT-03 · P1** — Test the actual office browser, screen sizes, printers, PDF reader and spreadsheet application; check labels, keyboard focus and readable errors.
- [ ] **UAT-04 · P0** — Prepare short staff instructions explaining AI review, draft/submitted/verified meaning, internal vs official letters and unavailable functions.
- [ ] **UAT-05 · P0** — Set a cutover window, stop conflicting writes, take the final backup, apply tested upgrade, perform smoke tests and then admit the intended users.
- [ ] **UAT-06 · P0** — Define rollback triggers and an owner, and arrange active support after launch. Failed critical tests require postponement or a demonstrably disabled optional feature.

## Two-day execution order

| Window | Work | Required evidence |
|---|---|---|
| Day 1, first half | Freeze scope, clean target install/build, configure staging, rehearse fresh setup/existing upgrade | Reproducible build, healthy real services, preserved records |
| Day 1, second half | Real MySQL integration, financial concurrency, permissions, correspondence and file workflows, real AI inference | Correct amounts/states, rejected unauthorized operations, recorded failures |
| Overnight | Representative mixed load/soak and backup jobs | Resource/error measurements and successful backup output |
| Day 2, first half | Restore drill, outage/reboot/rollback checks, remaining fixes and targeted retests | Recoverable records/files and measured recovery time |
| Day 2, second half | Office UAT, production proxy/client tests, freeze final image, go/no-go review | Owner acceptance, all P0s passed or optional feature demonstrably excluded |

## Reproducible starting commands

Run against staging. Configure a test SECRET_KEY and DATABASE_URL. Use the chosen virtual environment, not an unrelated system Python. These commands do not replace manual UAT, mixed load or the restore drill.

```bash
# From backend/
python -m pip install -r requirements.txt
python -m kirana_llm --download
python -m unittest discover -s tests -p 'test_*unit.py' -v
# Only with a NEW EMPTY disposable database ending _test and disposable UPLOAD_DIR:
python tests/integration_release.py

# From frontend/
npm ci
npm run build
npm run lint
npm test

# From project root, with staging environment values supplied:
docker compose -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.production.yml build
```

The existing k6 script is `tests/performance/read-workflows.js`; supply PTP_BASE_URL, PTP_TOKEN and PTP_STAGING=yes through the environment. It tests reads only. Never place tokens in saved reports. Follow RUNBOOK.md for the separate fresh-install, existing-upgrade and restore procedures.

## Decision record

- Release commit/image digest:
- Intended users and allowed launch scope:
- Production host/OS/CPU/RAM:
- Expected peak simultaneous users:
- Data migration/reconciliation evidence:
- Critical test results and unresolved findings:
- Disabled/deferred features and enforcement evidence:
- Recovery point/time targets and measured restore result:
- Correspondence owner acceptance:
- Finance owner acceptance:
- IT/operations owner acceptance:
- Final decision / decision time / cutover owner:

**GO:** every applicable P0 is evidenced, no unexplained critical skip, no unauthorized data access or incorrect financial result, recovery was demonstrated, actual target deployment was tested and owners accept the supported scope.

**NO-GO:** any essential workflow cannot complete, financial reconciliation/concurrency fails, access isolation fails, persistence/restore is unproven, or the production build/runtime is still unverified. A date alone is not evidence of readiness.

## Technical references

- [FastAPI deployment concepts](https://fastapi.tiangolo.com/deployment/concepts/) — startup/restarts, HTTPS, process replication and model memory.
- [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) — server-side permission validation on every request.
- [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) — layered file validation, storage and access control.
- [MySQL 8.0 backup and recovery](https://dev.mysql.com/doc/refman/8.0/en/backup-and-recovery.html) — backup policy, recovery and upgrade protection.

These references guide engineering checks; they do not certify this application or replace office-specific procedures.
