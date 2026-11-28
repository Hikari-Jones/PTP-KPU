# PANDUAN PENGUJIAN INTEGRASI (INTEGRATION TESTING GUIDE)
## Safe Fiscal Year Switching & Historical Data Integrity

Dokumen ini menjelaskan prosedur menjalankan integration test suite untuk mekanisme **Automatic Fiscal Year Switching**, **Proteksi Data Historis Keuangan**, dan **Historical Report Versioning** pada sistem KPU.

---

### ATURAN KESELAMATAN (SAFETY GUARD)
> [!CAUTION]
> **DILARANG KERAS** menjalankan integration test pada database operasional atau database produksi.
> Script pengujian dilengkapi dengan **Database Isolation Guard**:
> 1. Memeriksa environment variable `TEST_DATABASE_URL`.
> 2. Memastikan nama database secara eksplisit diakhiri dengan `_test` (contoh: `kpu_disposable_test`).
> 3. Jika `TEST_DATABASE_URL` tidak diatur atau mengarah ke database operasional/production, test **otomatis diblokir dan berhenti seketika**.

---

### 1. Menyiapkan Database Khusus Testing (Disposable Test DB)

Jalankan perintah SQL berikut pada instance MySQL lokal atau instance terpisah (hanya dilakukan sekali):

```sql
CREATE DATABASE IF NOT EXISTS kpu_disposable_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Berikan izin akses penuh ke user pengujian
GRANT ALL PRIVILEGES ON kpu_disposable_test.* TO 'kpu_app'@'%';
FLUSH PRIVILEGES;
```

---

### 2. Mengatur Environment Variable

Atur variabel lingkungan `TEST_DATABASE_URL` pada terminal pengujian Anda:

#### **PowerShell (Windows)**
```powershell
$env:TEST_DATABASE_URL = "mysql+aiomysql://kpu_app:70376fd8b3f5ea4273fa2b60fcf9f5d5@localhost:3306/kpu_disposable_test"
```

#### **Bash / Linux / macOS**
```bash
export TEST_DATABASE_URL="mysql+aiomysql://kpu_app:70376fd8b3f5ea4273fa2b60fcf9f5d5@localhost:3306/kpu_disposable_test"
```

---

### 3. Menjalankan Integration Test

Jalankan pengujian dari direktori root proyek atau direktori backend:

```bash
python backend/verify_fiscal_switch.py
```

Atau jika dijalankan di dalam kontainer terpisah:
```bash
docker exec -e TEST_DATABASE_URL="mysql+aiomysql://kpu_app:70376fd8b3f5ea4273fa2b60fcf9f5d5@mysql-db:3306/kpu_disposable_test" ptp-kpu-update-v30-backend-1 python /app/verify_fiscal_switch.py
```

---

### 4. Struktur Skenario yang Diuji

Test suite mengeksekusi assertion ketat untuk seluruh skenario:

- **Section A: Fiscal Year Switching (Single Active Fiscal Year)**
  - `A1`: Mengaktifkan TA 2025 ketika TA 2027 Active (2027 otomatis Closed, 2025 menjadi Active).
  - `A2`: Mengaktifkan TA 2026 ketika TA 2025 Active (2025 otomatis Closed, 2026 menjadi Active).
  - `A3`: Mengaktifkan kembali TA 2027 dari status Closed (2026 otomatis Closed, 2027 menjadi Active).
  - `A4`: Memastikan tepat satu tahun anggaran berstatus Active di seluruh database.

- **Section B: Budget Data Integrity**
  - `B1`: Nilai pagu awal dan pagu aktif tidak termutasi / tidak berubah akibat perpindahan tahun.
  - `B2`: Foreign Key pagu tetap terhubung dengan fiscal_year_id masing-masing.
  - `B3`: Penanganan aman untuk tahun tanpa alokasi pagu manual (tidak terjadi AttributeError).

- **Section C: Closed Fiscal Year Protection**
  - `C1`: Membaca data historis tahun Closed tetap diizinkan (Read-Only).
  - `C2`: Pembuatan transaksi baru pada tahun Closed ditolak dengan `HTTP 400`.
  - `C3`: Pengubahan Pagu Anggaran pada tahun Closed ditolak dengan `HTTP 400`.
  - `C4`: Pembuatan Revisi DIPA pada tahun Closed ditolak dengan `HTTP 400`.

- **Section D: Reactivation & Privilege Separation**
  - `D1`: Data transaksi lama tetap utuh ketika tahun diaktifkan kembali.
  - `D2`: Pengguna biasa / non-RENDATIN ditolak melakukan koreksi keuangan (`HTTP 403`).
  - `D3`: Petugas berwenang (RENDATIN) dapat melakukan koreksi dengan pencatatan `BudgetEvent`.

- **Section E: Transaction Rollback**
  - `E1`: Rollback database atomik saat aktivasi gagal (ID invalid), tahun aktif asal tidak berubah.

- **Section F: Financial Audit Trail**
  - `F1`: Pencatatan lengkap log audit pergantian tahun aktif (`audit_aktivasi_tahun_anggaran`).

- **Section G: Historical Report Versioning**
  - `G1`: Snapshot versi 1 laporan historis tidak tertimpa ketika versi 2 diterbitkan.

---

### 5. Membaca Hasil Pengujian

- `[PASS]`: Assertion terpenuhi secara presisi sesuai aturan bisnis dan integritas data.
- `[FAIL]`: Kondisi tidak terpenuhi atau terjadi error yang tidak diharapkan. Test suite akan exit dengan kode status `1`.
- `[BLOCKED]`: Test mendeteksi `TEST_DATABASE_URL` belum diatur atau nama database tidak berakhiran `_test`.

---

### 6. Mekanisme Cleanup

Setiap kali test suite dijalankan:
1. Menjalankan `cleanup_test_data()` di awal untuk memastikan state bersih.
2. Menjalankan seluruh fixture dan pengujian.
3. Menjalankan `cleanup_test_data()` di akhir sesi untuk membersihkan seluruh data fixture di database pengujian.
4. Database operasional / production tidak pernah disentuh sama sekali.
