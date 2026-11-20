# PTP-KPU deployment and verification

## What is now persistent

The archive page uses the existing MySQL archive API and physical file uploads.
User management creates and edits actual accounts; deactivation invalidates API
access immediately, including previously issued tokens. Bug reports belong to the
authenticated reporter, and only administrators may change their status.

Alur Persuratan uses the new `workflow_letter` table, server-generated audit
history, row locks, and version checks. It supports incoming registration and
internal disposition, outgoing draft/revision/approval, and workflow archiving.
`ALUR/year/id` identifies an INTERNAL workflow record. It does not replace the
official surat-keluar numbering system. Administrative approval is NOT certified
TTE. External email delivery and a certified signing provider are not configured.
The older simulated TTE panels are no longer mounted by this workflow screen.

Browser-only demo records are not automatically imported: they lack trustworthy
ownership and may contain expired blob URLs. Re-upload genuine documents and
register genuine records using the connected screens

```bash
cd backend
../venv/bin/python -m pip install -r requirements.txt
../venv/bin/python upgrade_operations.py
```

The upgrade checks duplicate NIPs before adding the unique constraint, adds
`is_active`, and creates missing tables without reseeding. MySQL DDL is not
transactionally reversible; retain the independent backup. This command targets
the current integer-ID schema. The old UUID Alembic baseline is incompatible with
that schema, so do not blindly replay the entire historical migration chain.
The new Alembic revision is provided for installations already at f1a2b3c4d5e6.

4. Install/build the frontend:

```bash
cd ../frontend
npm ci
npm run build
npm run lint
```

Existing documented seed passwords remain valid only for their actual accounts.
New/reset passwords require eight characters. Change shared seed passwords before
real office use. Password resets do not create new default accounts.

## Fresh production container installation

Set `SECRET_KEY`, `MYSQL_ROOT_PASSWORD`, and `MYSQL_PASSWORD` in the root `.env`.
Use a generated URL-safe MYSQL_PASSWORD (it is embedded in DATABASE_URL).
These commands initialize a new database with demonstration seed accounts;
do not run the seeder as an upgrade against production records.

```bash
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d mysql-db
docker compose -f docker-compose.production.yml run --rm backend python setup_local_database.py
docker compose -f docker-compose.production.yml run --rm backend python -m kirana_llm --download
docker compose -f docker-compose.production.yml up -d
```

Nginx serves the built frontend at http://localhost:8080 and proxies /api to the
backend. MySQL and the API have no host port exposure in this configuration.
The backend runs without reload and without root. Files and backups use persistent
volumes. The service is bound to loopback by default; place it behind the office's
HTTPS reverse proxy before allowing LAN access. Docker dependencies and KIRANA
model weights must be downloaded before air-gapped deployment. Fonts now use local
fallbacks instead of requesting Google Fonts.

For an existing installation, mount/copy its existing upload data deliberately
and use its existing MySQL volume/database; a fresh volume is not a migration.

## Backup and restore

Admins can create/download a ZIP through Cadangan Sistem. The server needs
`mysqldump` (included by the production image) and appropriate database permissions.
The ZIP contains `database.sql`, uploaded files, and per-file SHA-256 checksums.
A failed dump never appears as a successful backup. Backups contain sensitive
plaintext data; keep downloaded copies in access-controlled storage.

The MySQL dump is a single transaction for InnoDB. Avoid schema changes while a
backup is running. Uploaded files use immutable names. Only restore trusted
server-produced archives; checksums detect damage, not a malicious archive author.

Provision a NEW EMPTY MySQL database and set RESTORE_DATABASE_URL to that target.
Keep DATABASE_URL pointed to the original database so the restore guard can reject
that source. Choose a new, nonexistent upload directory:

```bash
cd backend
../venv/bin/python restore_backup.py /absolute/path/backup.zip --uploads-target /absolute/path/new-uploads
```

The restore verifies all checksums before importing, refuses a populated database,
and never overwrites an existing uploads directory. Failed imports may leave the
separate target partially restored: discard that target before retrying. After
successful restore, launch an isolated instance against the restored database and
uploads; verify login, archive downloads, workflow history, and budget reports.
Only then schedule a configuration switch. This workflow does not overwrite the
live database through a browser button.

## Verification

No tests below should use the operational database.

```bash
cd backend
../venv/bin/python -m unittest discover -s tests -p 'test_*unit.py' -v
```

For integration, provision an empty MySQL database whose name ends in `_test`.
Set DATABASE_URL explicitly to that database, SECRET_KEY to a test-only secret,
and UPLOAD_DIR to a disposable absolute directory, then run:

```bash
../venv/bin/python tests/integration_release.py
```

The test refuses a nonempty database, creates test users, and checks login,
permissions, stale workflow versions, persisted history, report access, archive
upload/download/delete/restore, last-admin protection, and account deactivation.
It retains test records for inspection and never deletes operational records.

Every-route smoke test: provision a SECOND empty `_test` database and run

```bash
../venv/bin/python tests/smoke_all_routes.py
```

It drives every API route the web UI uses (128 steps) as admin, operator and an
unrelated user, including user mistakes: wrong passwords, missing fields, wrong
role, duplicates, stale versions, over-budget amounts, deleting data still in use,
oversized/forbidden files. Any 5xx, unexpected status, or error without a readable
`detail` message fails the run. `python scripts/check.py --integration --smoke`
runs everything (set DATABASE_URL to the empty database before each).

Validation completed on 2026-11-20 against MySQL 8.0 in Docker: 30 backend unit
tests, integration test, 128/128 smoke steps, 12 frontend unit tests, Vite
production build, and a production `docker compose` stack exercised through nginx
(login rate limit, upload/download, 25 MB limit, upload rollback, backup ZIP,
AI chat with no model present). `npm run lint` runs but reports 74 pre-existing
style findings (`any` types, unused imports, hook dependency warnings).
Browser UAT and a full backup/restore drill are still manual steps.

### Upgrading an existing installation to this release

Archive documents no longer require a classification code (the upload screen never
sent one, so every archive upload failed). Apply the schema change once:

```bash
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml run --rm backend python upgrade_operations.py
docker compose -f docker-compose.production.yml up -d
```

`upgrade_operations.py` is idempotent; Alembic installations can instead apply
revision `c4d5e6f7a8b9`.

## Additional security and regulatory gates

Run upgrade_operations.py again for the new session_version column. Existing JWTs
are invalidated by this release. Logout revokes all sessions for that user; password,
role, department, and activation changes also advance the stored session version.
The default token lifetime is now 60 minutes (check existing environment overrides).
API documentation is disabled unless ENABLE_API_DOCS=true.

Nginx rate-limits both login URL aliases (5 requests/minute with burst 5 per source
IP) and general API traffic. Keep the backend private. If an HTTPS proxy fronts
Nginx, configure trusted real-IP handling explicitly, otherwise all office traffic
may share the proxy IP limit. Never trust arbitrary client X-Forwarded-For headers.

Official issuance is disabled by default. OFFICIAL_ISSUANCE_ENABLED is a deployment
gate, NOT a compliance certificate. Do not enable it until the unresolved items in
KPU_REGULATORY_REVIEW.md are implemented and verified. AUTHORITY_GRANTS provides
an additional documented, expiring numbering-assignment check, not the complete
signing-authority model. Permanent archive deletion is blocked; soft deletion is
reversible and must never be treated as lawful archive destruction.

Docker execution was blocked by socket permissions in this environment. Full build
and integration tests remain pending; do not interpret unit-test success as release
approval.

## Budget review update — 16 November 2026

See QA_RELEASE_CHECKLIST.md for the current audit, fixes, test matrix and blockers.
Creation now saves a draft; draft/rejected/submitted records do not count as verified
realization. A separate reviewer with an active `verify_budget` authority grant must
review submitted transactions. This is internal monitoring, not SAKTI payment approval.
The `budget_event` table stores actor/time/action/snapshot in the same transaction.
Run `python upgrade_operations.py` against a backed-up existing current-model database
before deploying this change; it creates that missing table without reseeding.
The table has no edit/delete API, but is not tamper-proof against database administrators.

AUTHORITY_GRANTS is a JSON array supplied to the production Compose environment.
Each entry has `pegawai_id`, `action` (`verify_budget`), `document_reference`,
`valid_from` and `valid_until` (ISO dates). Populate only from actual approved office
assignments; use a different reviewer from the input operator. Empty/default grants
deny financial review, including for application administrators. Official issuance
remains disabled. Existing auto-verified rows are NOT rewritten: reconcile them with
source documents and actual authorized review before relying on totals.

The full monthly CSV export aggregates verified transactions from the server and
includes all matching accounts, independent of transaction-list pagination. Text
cells are escaped and protected against spreadsheet formulas.

Readiness: `/health/ready` returns 503 when the database cannot be queried. Container
readiness is a dependency check, not evidence of correct schema or completed UAT.
