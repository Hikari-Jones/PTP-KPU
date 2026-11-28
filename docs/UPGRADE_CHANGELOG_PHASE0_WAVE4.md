# PTP-KPU Stabilization & Regulatory Upgrade Report (Phase 0 – Wave 4)

**Project:** PTP-KPU (Aplikasi Operasional Internal KPU Provinsi Sulawesi Utara)  
**Target Environment:** Local Office Server (Acer AIO, 8 GB RAM, MySQL + FastAPI + React/Vite, offline-capable)  
**Regulatory Alignment:** PKPU 2/2021 jo. PKPU 8/2021 (Tata Naskah Dinas), Kep KPU 1257/2024 (Klasifikasi Arsip), Kep KPU 43/2022 & Kep KPU 89/2026 (Penomoran/Kewenangan), PMK 62/2023 & Kep KPU 1027/2025 (Perbendaharaan & IKPA), PKPU 7/2021 (SKKAAD), PKPU 17/2023 (Jadwal Retensi Arsip / JRA).

---

## 1. What Was Found (Audit Findings)

A file-by-file audit across **Surat Menyurat**, **Realisasi Anggaran**, **Arsip Data**, **KIRANA AI**, and database migrations uncovered critical security, data-integrity, and regulatory gaps:

### 1.1 Surat Menyurat
- **Organization-wide data leak:** `GET /api/v1/operations/letters` had no row-level `owner_id`/`assignee_id` scoping, exposing private correspondence to all logged-in users.
- **Broken RBAC & department spoofing:** `_is_letter_manager()` unconditionally returned `True`, and `POST /api/v1/surat-keluar/draft` accepted arbitrary `id_bagian` from the client.
- **Numbering race condition & HTTP 500 crash:** `finalisasi_surat_atomic` queried `PenomoranSequence` without filtering `id_bagian` (raising `MultipleResultsFound` when multiple sections shared a sequence), ignored `JenisSurat.format_nomor` (hardcoding one format for all letter types), and never updated `SuratTugas.nomor_tugas` from `DRAFT/ST/...`.
- **Disconnected modules & invisible drafts:** `Surat Masuk` (`WorkflowLetter`) and `Surat Keluar`/`Surat Tugas` (`SuratKeluar`) were split; dashboard totals ignored `SuratKeluar`/`SuratTugas`, and reassigned `WorkflowLetter` handlers lost read access after passing a letter forward.
- **Broken exports & attachments:** Document export hardcoded `"SURAT DINAS"` for all document types and wrote to a shared temp path (concurrent overwrite hazard); frontend downloads omitted file extensions from `Content-Disposition`.
- **Missing regulatory capabilities:** No multi-stage review (`draft → menunggu_persetujuan → revisi → disetujui → terbit → diarsipkan`), no SHA-256 verification digest, no `nomor_agenda`/SLA on incoming mail, no Lembar Disposisi PDF, no Surat Tugas date-overlap check or laporan upload, and incomplete classification/letter-type reference tables.

### 1.2 Realisasi Anggaran
- **100× monetary inflation bug:** Backend serialized `Decimal(18, 2)` as `"50000000.00"`; frontend `.replace(/\D/g, "")` stripped the decimal point, inflating edited amounts 100×.
- **Maker-checker bypassed & unreachable screens:** `POST /api/v1/realisasi-anggaran/` inserted entries directly as `verified` (`id_verifier=None`), leaving `draft → submitted → verified/rejected` unused; `App.tsx` and `Sidebar.tsx` never exposed `transaksi` or `verifikasi` sub-tabs.
- **RBAC & isolation defects:** Missing `await` on `require_rendatin_or_keuangan(current_user)` in `revisi_anggaran.py`; unscoped `GET /realisasi-anggaran/{id}/history` and `GET /anggaran/versions`; `id_bagian=None` (e.g., Kabag) bypassed section isolation; `AuthContext.tsx` omitted `Subbagian Keuangan (BAG-06)`, locking Finance staff out of forms; non-finance dashboard load crashed on a 403 inside `Promise.all`.
- **Runtime crashes & closed-year leaks:** `POST /anggaran/publish` crashed serializing `Decimal` to JSON; `DELETE /realisasi-anggaran/{id}` raised `MissingGreenlet`, allowed deleting closed-year records, and left orphan `DokumenArsip` mirrors; monthly `sisa_anggaran` subtracted only monthly verified totals instead of annual verified totals; `AkunAnggaran.kode_akun` global uniqueness prevented two Subbagian from sharing the same MAK code (e.g., `521211`).
- **Missing APBN/PMK 62/2023 capabilities:** No `pagu_blokir` (self-blocking), no quarterly RPD Halaman III DIPA targets/deviation tracking, no zero-sum Revisi POK transfers, no formal SSPB/refund adjustment (`koreksi`) for verified transactions, no payment mechanism/document chain (`UP`/`TUP`/`GUP`/`LS`, `SPBy`/`SPP`/`SPM`/`SP2D`, tax withholding), and no immutable audit log viewer.

### 1.3 Arsip Data
- **Cross-department metadata & attachment leaks:** `GET /api/v1/arsip/filter-options` returned unscoped events/categories from restricted documents; `arsip_sync.py` mirrored private `WorkflowLetter` rows as `terbatas`, allowing same-section colleagues to download private letter attachments via `GET /api/v1/files/{id}`.
- **Silent misclassification & HTTP 500 schema crash:** Manual/bulk uploads without `id_klasifikasi` were silently stamped `PL.01.1`; any document with `hak_akses="rahasia"` crashed Pydantic response serialization with HTTP 500.
- **Broken cleanup & missing governance:** Deleting a `RealisasiAnggaran` left un-deletable ghost archive mirrors; `DELETE /api/v1/arsip/{id}/permanent` bypassed retention checks and left orphan `FileRecord` rows and physical files downloadable forever; `ArsipAdminView.tsx` was a 16-line backup stub with no archive governance tools.
- **Missing PKPU 7/2021 & PKPU 17/2023 capabilities:** No 4-tier SKKAAD enforcement (`biasa`/`terbatas`/`rahasia`/`sangat_rahasia`), no explicit per-document access grants, no access/download audit trail, no JRA retention calculation (`aktif → inaktif → siap_susut → disusutkan`), no Arsip Vital / Legal Hold protection, no formal Daftar Usul Musnah/Serah/Pindah + Berita Acara PDF, no SHA-256 fixity/duplicate detection, no versioning, and no full-text search.

### 1.4 KIRANA AI & Live Database Upgrades
- **KIRANA SQL scoping gaps:** Budget tables (`akun_anggaran`, `pagu_anggaran`, `realisasi_anggaran`, `revisi_anggaran`) were not scoped by `id_bagian` for non-finance users; new columns/tables needed explicit allow-list/block-list hygiene so governance/audit tables and extracted text are never exposed to the LLM.
- **Live migration script:** `backend/upgrade_operations.py` needed idempotent schema upgrade routines covering every new table, column, index, and composite unique constraint without reseeding demo data.

---

## 2. What Was Changed & How It Was Changed

### Phase 0 — Cross-Cutting Stabilization (Verified Baseline)
- **How:** Fixed all immediate security, crash, and arithmetic defects before adding new features, locked in by `backend/tests/test_phase0_stabilization.py` (10 integration tests) and `frontend/tests/all.test.ts` (17 unit tests).
- **Key fixes:**
  - Enforced row-level scoping on `/operations/letters`, `/arsip/filter-options`, `/realisasi-anggaran/{id}/history`, `/anggaran/versions`, and KIRANA budget tables.
  - Hardened `get_effective_subbagian_id` so users with `id_bagian=None` cannot bypass department isolation.
  - Mirrored `WorkflowLetter` archives strictly as `rahasia` and prevented `files.py` from granting colleague access via `workflow_letter` archive mirrors.
  - Fixed `Decimal` parsing in `frontend/src/utils/currency.ts` (eliminating 100× inflation), added `BAG-06` (Keuangan) to `AuthContext.tsx`, fixed `Content-Disposition` filename extraction in `frontend/src/services/operations.ts`, fixed `POST /anggaran/publish` JSON serialization, fixed `DELETE /realisasi-anggaran/{id}` closed-year checks + archive mirror cleanup, fixed `finalisasi_surat_atomic` numbering template & `SuratTugas.nomor_tugas` sync, removed silent `PL.01.1` stamping, fixed `hak_akses="rahasia"` schema validation, and cleaned up physical files + `FileRecord` on permanent archive delete.

---

### Wave 1 — Surat Menyurat & DB-Backed Authority Matrix
- **Schema & Authority (`backend/app/models/operations.py`, `backend/app/models/schema.py`, `backend/app/core/authority.py`, `backend/app/api/v1/endpoints/authority.py`):**
  - Added `AuthorityGrant` (`authority_grant`) table storing SK penugasan (`pegawai_id`, `action`, `jabatan_penugasan`, `document_reference`, `valid_from`, `valid_until`, `is_active`, `granted_by`, `revoked_at`).
  - Added `has_authority_async(db, env_grants, user_id, action)` checking static `.env` grants **or** active DB `AuthorityGrant` rows, while preserving synchronous `has_authority(...)` for unit tests.
  - Added `GET/POST /api/v1/authority-grants` and `DELETE /api/v1/authority-grants/{id}` for Admin SK management.
  - Expanded `WorkflowLetter` (`nomor_agenda`, `sifat_surat`, `batas_waktu`, `id_klasifikasi`, `participant_ids` JSON, and portable comma-delimited `participant_tokens` for exact SQLite/MySQL `.like("%,<id>,%")` filtering).
  - Expanded `SuratKeluar` (`tembusan`, `penandatangan_nama`, `penandatangan_jabatan`, `atas_nama`, `file_id`, `content_sha256`) and `SuratTugas` (`dasar_tugas`, `id_pagu`, `laporan_file_id`).
  - Expanded `KLASIFIKASI_ARSIP` (19 Kep KPU 1257/2024 codes) and `JENIS_SURAT` (10 PKPU 2/2021 types) in `backend/app/core/reference_data.py`.
- **Correspondence APIs (`backend/app/api/v1/endpoints/surat.py`, `operations.py`, `files.py`, `dashboard.py`):**
  - Replaced broken `_is_letter_manager()` with real `is_letter_manager(user)` in `app/core/auth.py` (Admin or Umum/Logistik `BAG-05`).
  - Added full `SuratKeluar` lifecycle endpoints (`PUT`, `DELETE`, `ajukan`, `revisi`, `setujui`, `finalisasi`, `arsipkan`, `riwayat`), SHA-256 integrity digest computed at issuance, public-authenticated `GET /verifikasi/{kode}`, race-free in-memory PDF & DOCX generation (with dedicated `SURAT TUGAS` pelaksana table + signatory block + verification footer), `GET /surat-tugas/cek-konflik`, `PATCH /surat-tugas/{id}/laporan`, and Admin `PUT/DELETE /klasifikasi/{id}`.
  - Added auto `nomor_agenda` (`AGM/{year}/{seq:04d}`), SLA/sifat fields, cumulative `participant_ids`/`participant_tokens`, `instruksi_disposisi`, and `GET /operations/letters/{id}/lembar-disposisi` PDF.
  - Updated `files.py` to honor prior `WorkflowLetter` participants, `SuratKeluar.file_id`, and `SuratTugas.laporan_file_id`; unified `/dashboard/overview` to count `SuratKeluar` and `SuratTugas`.
- **Frontend (`SuratView.tsx`, `SuratMenyuratModule.tsx`, `types/index.ts`):**
  - Wired full approval workflow, riwayat timeline, draft edit/delete, tembusan/penandatangan inputs, PDF/DOCX exports, Surat Tugas `dasar_tugas` + per-person role selector + live conflict check + laporan upload, klasifikasi CRUD, and Surat Masuk agenda/SLA/disposisi presets + Lembar Disposisi PDF download.

---

### Wave 2 — Realisasi Anggaran (PMK 62/2023 & IKPA)
- **Schema & Services (`backend/app/models/schema.py`, `backend/app/schemas/anggaran.py`, `backend/app/services/anggaran.py`):**
  - Replaced global unique constraint on `AkunAnggaran.kode_akun` with composite `UniqueConstraint("id_bagian", "kode_akun", name="uq_akun_bagian_kode")`.
  - Added `pagu_blokir` and `rpd_triwulan_1..4` to `PaguAnggaran`; enforced effective ceiling (`pagu_efektif = pagu_aktif - pagu_blokir`) across create, submit, verify, update, revision, and summary computations.
  - Added `jenis_revisi` (`DIPA`/`POK`) and `batch_kode` to `RevisiAnggaran`, plus balanced zero-sum POK transfer (`POST /api/v1/revisi-anggaran/pok`) ensuring total source reductions equal total target additions atomically.
  - Added expenditure metadata (`mekanisme_bayar`, `jenis_dokumen_bayar`, `nomor_sp2d`, `penerima_pembayaran`, `potongan_pajak`, `is_koreksi`, `koreksi_dari_id`) to `RealisasiAnggaran`, and formal SSPB/refund adjustment (`POST /api/v1/realisasi-anggaran/{id}/koreksi`) for verified transactions so verified records are adjusted transparently instead of destructively deleted.
  - Upgraded `require_budget_reviewer` and `/capabilities` to use DB-backed `has_authority_async(..., "verify_budget")`.
  - Added `GET /api/v1/anggaran/audit-logs` (immutable `FinancialAuditLog`) and `GET /api/v1/anggaran/triwulan-rpd` (quarterly RPD target vs. verified realization & deviation %).
- **Frontend (`types.ts`, `api.ts`, `App.tsx`, `Sidebar.tsx`, `PaguAnggaranView.tsx`, `InputRealisasiView.tsx`, `TambahRealisasiModal.tsx`, `RealisasiAnggaranView.tsx`):**
  - Mounted previously hidden `transaksi` and `verifikasi` sub-tabs in navigation; added `pagu_blokir` & `rpd_triwulan_1..4` editing + POK transfer modal in `PaguAnggaranView.tsx`; added PMK 62/2023 expenditure fields to both `InputRealisasiView.tsx` and `TambahRealisasiModal.tsx`; added SSPB Koreksi modal, quarterly RPD IKPA card, and immutable Audit Log tab in `RealisasiAnggaranView.tsx`.

---

### Wave 3 — Arsip Data (PKPU 7/2021 SKKAAD & PKPU 17/2023 JRA)
- **Schema & Utilities (`backend/app/models/schema.py`, `backend/app/models/operations.py`, `backend/app/services/arsip_utils.py`, `backend/app/schemas/arsip.py`):**
  - Added `sha256_hash` to `FileRecord` and JRA/governance fields to `DokumenArsip` (`status_retensi`, `nasib_akhir`, `tanggal_retensi_aktif`, `tanggal_retensi_inaktif`, `arsip_vital`, `legal_hold`, `legal_hold_alasan`, `lokasi_fisik`, `nomor_berkas`, `sha256_hash`, `extracted_text`, `versi_dokumen`, `parent_dokumen_id`).
  - Added 3 governance tables: `ArsipAccessGrant` (per-document SKKAAD grants with optional expiry), `ArsipAuditLog` (immutable access/change/disposal trail with `ON DELETE SET NULL` + document snapshot so audit logs survive permanent deletion), and `ArsipPenyusutan` (formal Daftar Usul Musnah/Serah/Pindah with frozen `dokumen_snapshot`).
  - Created `backend/app/services/arsip_utils.py` implementing JRA date/status computation, lightweight PDF (`pdfplumber`, first 15 pages) / DOCX (`python-docx`) / CSV text extraction capped at 50 KB for 8 GB AIO safety, and ReportLab **Berita Acara Penyusutan PDF** generation.
- **Backend Endpoints & Services (`files.py`, `arsip.py` service & endpoint, `arsip_sync.py`):**
  - Computed streaming SHA-256 hashes in `files.py` upload; enforced `ArsipAccessGrant` and DB-backed `access_secret_archive` authority in `files.py` download and `CRUDArsip`; automatically logged `download` and `view` events into `ArsipAuditLog`.
  - Enabled full-text + physical-location search across `nama_dokumen`, `nomor_dokumen`, `lokasi_fisik`, `nomor_berkas`, and `extracted_text`.
  - Added `GET /arsip/cek-duplikat`, `POST /arsip/rehitung-retensi`, `GET /arsip/audit-logs`, `GET /arsip/{id}/audit-log`, `GET/POST/DELETE /arsip/{id}/access-grants`, `GET/POST /arsip/{id}/versi`, and `GET/POST /arsip/penyusutan`, `POST /arsip/penyusutan/{id}/eksekusi` (maker-checker enforced), and `GET /arsip/penyusutan/{id}/berita-acara` (PDF).
  - Enforced JRA deletion guards on `DELETE /arsip/{id}/permanent` blocking `arsip_vital`, `legal_hold`, `nasib_akhir == "permanen"`, and classified docs still inside active/inactive retention (while preserving backward compatibility for trashed unclassified manual docs).
- **Frontend (`ArsipView.tsx`, `ArsipBulkImport.tsx`, `ArsipAdminView.tsx`):**
  - Added Kep KPU 1257/2024 classification dropdown, 4-tier SKKAAD selector, physical location/folder fields, Arsip Vital / Legal Hold toggles, duplicate SHA-256 notice, SKKAAD/JRA filters & badges, and modals for **Edit Metadata**, **Riwayat Versi**, **Izin Akses Khusus SKKAAD**, and **Jejak Audit**.
  - Replaced the 16-line `ArsipAdminView.tsx` stub with a 4-tab Governance Console: **Penyusutan JRA** (recalculate JRA, propose disposal, execute, download Berita Acara PDF), **SK Penugasan (Otoritas)** (`AuthorityGrant` CRUD), **Log Audit Arsip**, and **Cadangan Sistem** (preserving backup creation & download).

---

### Wave 4 — Live Migrations & KIRANA AI Security
- **Idempotent Live Schema Upgrader (`backend/upgrade_operations.py`):**
  - Refactored into `apply_schema_upgrades(connection)` so all new tables (`Base.metadata.create_all`), every Wave 1–3 additive column & index across 8 tables, composite `uq_akun_bagian_kode` replacement on MySQL, legacy fiscal-year status normalization, and `ensure_reference_data` run idempotently without reseeding demo data.
- **KIRANA Read-Only SQL Hardening (`backend/app/services/kirana_db.py`):**
  - Documented safe Wave 1–3 columns in `SCHEMA_DOC` so KIRANA can answer queries on `pagu_blokir`, `rpd_triwulan_*`, `mekanisme_bayar`, `nomor_agenda`, `status_retensi`, `lokasi_fisik`, etc.
  - Kept all governance/audit tables (`authority_grant`, `arsip_access_grant`, `arsip_audit_log`, `arsip_penyusutan`, `financial_audit_log`) outside `ALLOWED_TABLES`.
  - Added `extracted_text`, `participant_tokens`, and `legal_hold_alasan` to `BLOCKED_COLUMNS`.
  - Updated `workflow_letter` scoping to include reassigned participants (`participant_tokens LIKE '%,<uid>,%'`) and kept `dokumen_arsip` strictly isolating `rahasia`/`sangat_rahasia` documents owned by others from LLM context.

---

## 3. Inventory of Added & Modified Files

### Backend (New Files)
- `backend/app/api/v1/endpoints/authority.py`
- `backend/app/services/arsip_utils.py`
- `backend/tests/test_phase0_stabilization.py`
- `backend/tests/test_wave1_surat.py`
- `backend/tests/test_wave2_anggaran.py`
- `backend/tests/test_wave3_arsip.py`
- `backend/tests/test_wave4_migrations_kirana.py`

### Backend (Modified Files)
- `backend/app/core/auth.py`
- `backend/app/core/authority.py`
- `backend/app/core/reference_data.py`
- `backend/app/models/__init__.py`
- `backend/app/models/operations.py`
- `backend/app/models/schema.py`
- `backend/app/schemas/anggaran.py`
- `backend/app/schemas/arsip.py`
- `backend/app/services/anggaran.py`
- `backend/app/services/arsip.py`
- `backend/app/services/arsip_sync.py`
- `backend/app/services/kirana_db.py`
- `backend/app/api/v1/router.py`
- `backend/app/api/v1/endpoints/arsip.py`
- `backend/app/api/v1/endpoints/dashboard.py`
- `backend/app/api/v1/endpoints/dashboard_anggaran.py`
- `backend/app/api/v1/endpoints/files.py`
- `backend/app/api/v1/endpoints/operations.py`
- `backend/app/api/v1/endpoints/realisasi_anggaran.py`
- `backend/app/api/v1/endpoints/revisi_anggaran.py`
- `backend/app/api/v1/endpoints/surat.py`
- `backend/upgrade_operations.py`

### Frontend (Modified Files)
- `frontend/src/App.tsx`
- `frontend/src/types/index.ts`
- `frontend/src/services/api.ts`
- `frontend/src/services/operations.ts`
- `frontend/src/utils/currency.ts`
- `frontend/src/app/context/AuthContext.tsx`
- `frontend/src/app/components/layout/Sidebar.tsx`
- `frontend/src/app/components/SuratMenyurat/SuratMenyuratModule.tsx`
- `frontend/src/app/components/views/SuratView.tsx`
- `frontend/src/app/components/RealisasiAnggaran/types.ts`
- `frontend/src/app/components/RealisasiAnggaran/PaguAnggaranView.tsx`
- `frontend/src/app/components/RealisasiAnggaran/InputRealisasiView.tsx`
- `frontend/src/app/components/RealisasiAnggaran/TambahRealisasiModal.tsx`
- `frontend/src/app/components/RealisasiAnggaran/EditRealisasiModal.tsx`
- `frontend/src/app/components/RealisasiAnggaran/RealisasiAnggaranView.tsx`
- `frontend/src/app/components/views/ArsipBulkImport.tsx`
- `frontend/src/app/components/views/ArsipView.tsx`
- `frontend/src/app/components/views/ArsipAdminView.tsx`

### Documentation
- `docs/UPGRADE_CHANGELOG_PHASE0_WAVE4.md` (this report)

---

## 4. Verification Summary

| Suite | Result |
|---|---|
| `backend/tests/test_phase0_stabilization.py` | **10 / 10 passed** |
| `backend/tests/test_wave1_surat.py` | **5 / 5 passed** |
| `backend/tests/test_wave2_anggaran.py` | **3 / 3 passed** |
| `backend/tests/test_wave3_arsip.py` | **3 / 3 passed** |
| `backend/tests/test_wave4_migrations_kirana.py` | **2 / 2 passed** |
| `backend/tests/test_budget_unit.py` | **5 / 5 passed** |
| `backend/tests/test_release_unit.py` | **5 / 5 passed** |
| `backend/tests/test_ai_unit.py` | **16 / 16 passed** |
| `backend/tests/test_backup_unit.py` | **4 / 4 passed** |
| `frontend` unit tests (`npm test`) | **17 / 17 passed** |
| `frontend` production build (`tsc -b && vite build`) | **Exit 0 (5.15s)** |

**Total Automated Checks:** 53 backend tests + 17 frontend tests + clean production TypeScript/Vite build.

---

## 5. Local Server Deployment Steps

To apply all schema updates safely to an existing MySQL database on the office server without wiping or reseeding operational data:

```bash
python backend/upgrade_operations.py
```

---

## 6. Suggested Git Commit Message

```text
feat(ptp-kpu): stabilize core security and upgrade Surat, Anggaran, Arsip & KIRANA (Phase 0–Wave 4)

Stabilize critical security, RBAC, numbering, and monetary defects across
PTP-KPU and deliver regulatory-aligned upgrades for KPU Provinsi Sulawesi Utara
(PKPU 2/2021 jo. 8/2021, Kep KPU 1257/2024, PMK 62/2023, PKPU 7/2021, PKPU 17/2023):

Phase 0 (Stabilization):
- Enforce row-level scoping on operations letters, arsip filter-options, budget
  history/versions, and KIRANA budget tables; fix id_bagian=None isolation bypass.
- Fix 100x Decimal inflation on frontend currency inputs, Finance (BAG-06) RBAC,
  Decimal JSON serialization on report publish, closed-year delete guards, and
  atomic numbering/SuratTugas sync.

Wave 1 (Surat Menyurat & Authority Matrix):
- Add DB-backed SK Penugasan (authority_grant) + async authority checks and
  admin CRUD endpoints; expand Kep KPU 1257/2024 & PKPU 2/2021 reference data.
- Implement full SuratKeluar lifecycle, SHA-256 verification digest, race-free
  PDF/DOCX exports, Surat Tugas conflict detection & laporan upload, incoming
  nomor_agenda/SLA, participant retention, and Lembar Disposisi PDF.

Wave 2 (Realisasi Anggaran):
- Switch akun_anggaran to composite unique (id_bagian, kode_akun); add
  pagu_blokir, quarterly RPD Halaman III DIPA targets/deviation (IKPA), balanced
  zero-sum Revisi POK transfers, PMK 62/2023 expenditure fields, formal SSPB
  koreksi adjustments, and immutable financial audit log viewer.
- Expose Transaksi & Verifikasi maker-checker sub-tabs across sidebar/views.

Wave 3 (Arsip Data & Governance):
- Implement 4-tier SKKAAD enforcement with per-document access grants and
  immutable ArsipAuditLog on view/download/edit/delete/disposal.
- Add PKPU 17/2023 JRA retention engine, Arsip Vital / Legal Hold / Permanen
  deletion guards, SHA-256 fixity + duplicate check, document versioning,
  50 KB-capped PDF/DOCX/CSV full-text search, and formal Penyusutan workflow
  with Berita Acara PDF generation.
- Upgrade ArsipView, ArsipBulkImport, and replace ArsipAdminView stub with a
  4-tab Governance Console (Penyusutan JRA, SK Penugasan, Audit Log, Backups).

Wave 4 (Live Migrations & KIRANA):
- Update backend/upgrade_operations.py for idempotent zero-reseed MySQL upgrades
  covering all Wave 1–3 tables, columns, indexes, and composite constraints.
- Update kirana_db.py SCHEMA_DOC, block governance/audit tables & sensitive
  columns, retain reassigned workflow_letter participants, and isolate secret
  archives.

Verification: 53/53 backend tests, 17/17 frontend tests, and tsc/vite build pass.
```
