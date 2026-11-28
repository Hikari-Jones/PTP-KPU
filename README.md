# PTP-KPU Sulut

**Sistem informasi kantor KPU Provinsi Sulawesi Utara** untuk persuratan, realisasi anggaran,
arsip dokumen, dan asisten AI lokal. Seluruhnya berjalan di **satu PC server kantor (Acer AIO)**
tanpa layanan cloud, sehingga data tetap berada di kantor.

---

## Daftar isi

1. [Tentang aplikasi](#1-tentang-aplikasi)
2. [Cara kerja aplikasi](#2-cara-kerja-aplikasi)
3. [Kebutuhan server (Acer AIO)](#3-kebutuhan-server-acer-aio)
4. [Instalasi pertama](#4-instalasi-pertama)
5. [Menjalankan sehari-hari](#5-menjalankan-sehari-hari)
6. [Cara update](#6-cara-update)
7. [Mode pengembangan](#7-mode-pengembangan-untuk-developer)
8. [Pengujian](#8-pengujian)
9. [Masalah umum](#9-masalah-umum)

---

## 1. Tentang aplikasi

| Modul | Fungsi |
|---|---|
| **Surat Menyurat** | Registrasi Surat Masuk, draf Surat Keluar, Surat Tugas (dengan pegawai pelaksana), Kode Klasifikasi arsip, alur disposisi dan pemeriksaan internal. Setiap surat dapat diklik untuk melihat isinya. |
| **Realisasi Anggaran** | Tahun Anggaran (draft → aktif → ditutup), Satker, Akun (MAK), Pagu DIPA dan Revisi DIPA, input transaksi dengan bukti, laporan bulanan, ekspor Excel/CSV. |
| **Data Arsip** | Semua dokumen di satu tempat: unggahan manual, impor massal, serta salinan otomatis dokumen dari Surat Menyurat dan bukti Realisasi Anggaran. Filter bertingkat (modul → jenis/akun → tahun). |
| **KIRANA** | Asisten AI yang berjalan **di server kantor** (model Qwen 2.5 3B). Dapat membaca data sesuai hak akses pengguna; tidak dapat mengubah data. |
| **Administrasi** | Kelola pengguna, laporan bug, cadangan sistem (backup ZIP). |

**Hak akses.** Admin mengelola semua modul. Bagian Umum/Logistik mengelola persuratan;
Keuangan dan RENDATIN mengelola anggaran. Pegawai lain melihat data dalam mode baca saja
(misalnya hanya surat tugas yang menugaskan dirinya).

**Pengaman yang sengaja dikunci:**
- **Penomoran surat resmi** terkunci ("Mode Uji Coba") sampai format nomor dan kewenangan
  penandatangan divalidasi kantor (`OFFICIAL_ISSUANCE_ENABLED`, `AUTHORITY_GRANTS`).
- **Hapus permanen arsip** harus diajukan pengguna dan disetujui admin. Dokumen yang berasal
  dari Surat Menyurat/Realisasi tidak dapat dihapus permanen.
- **Hanya satu tahun anggaran aktif.** Mengaktifkan tahun baru menutup tahun sebelumnya
  setelah verifikasi dua langkah (penutupan bersifat permanen).

---

## 2. Cara kerja aplikasi

```
 PC pegawai (browser)                 Acer AIO (server kantor) — Docker
 ┌──────────────┐     HTTPS     ┌──────────────────────────────────────────────────┐
 │  Chrome/Edge │ ────────────▶ │ reverse proxy (Caddy) ──▶ frontend  (nginx)       │
 └──────────────┘               │                             │  /api               │
                                │                             ▼                     │
                                │                     backend (FastAPI + KIRANA AI) │
                                │                             │                     │
                                │                             ▼                     │
                                │                     mysql-db (MySQL 8.0)          │
                                │  Volume: mysql_data · uploads · backups · models  │
                                └──────────────────────────────────────────────────┘
```

| Komponen | Isi | Catatan |
|---|---|---|
| `frontend` | React 19 + Vite, disajikan nginx | Kompresi gzip, cache aset 1 tahun, setiap halaman dimuat saat dibuka |
| `backend` | FastAPI (Python 3.12) | API `/api/v1`, login JWT, unggah berkas, backup, KIRANA |
| `mysql-db` | MySQL 8.0 | Disetel hemat RAM untuk AIO 8 GB |
| KIRANA | `backend/kirana-llm` (llama.cpp) | Dimuat saat pertanyaan pertama, **dilepas otomatis setelah 15 menit tidak dipakai** |

**Data tersimpan di volume Docker** (`mysql_data`, `uploads`, `backups`, `kirana_models`), bukan
di dalam container. Restart, rebuild, maupun update aplikasi tidak menghapus data.
Data hanya hilang bila volume dihapus (`docker compose down -v` — **jangan lakukan**).

**Sinkronisasi arsip.** Saat surat atau transaksi bersama bukti disimpan, salinannya otomatis
dicatat di Data Arsip. Saat backend menyala, sinkronisasi penuh berjalan di latar belakang untuk
melengkapi data lama (admin juga dapat menekan **Sinkronkan** di Data Arsip).

**Umpan balik.** Setiap aksi simpan/hapus menampilkan notifikasi berhasil/gagal dengan alasan
dari server; ekspor berkas menampilkan konfirmasi atau "tidak ada data untuk diekspor".

---

## 3. Kebutuhan server (Acer AIO)

Target: Acer AIO kelas menengah (Intel Core i3/i5 generasi 10–12, **RAM 8 GB**, SSD),
Windows 10/11 64-bit dengan **Docker Desktop** (WSL 2).

### Penggunaan sumber daya (hasil pengukuran)

| Keadaan | RAM | Keterangan |
|---|---|---|
| Aplikasi menyala, KIRANA tidak dipakai | ~0,5 GB | MySQL ~330 MB, backend ~100 MB, nginx ~10 MB |
| KIRANA sedang/baru dipakai | +~1,7 GB kerja (+2 GB cache berkas model) | Dilepas otomatis setelah 15 menit menganggur |
| Batas memori per container | MySQL 768 MB · backend 2,5 GB · frontend 128 MB | Diatur di `docker-compose.production.yml` |

Kecepatan (diuji dengan 2–4 CPU): halaman API rata-rata **< 50 ms** dengan data beberapa tahun
(ribuan surat, arsip, dan transaksi), dan tetap cepat saat KIRANA sedang menjawab.
KIRANA menjawab pertanyaan data dalam **5–20 detik**. **Pertanyaan pertama setelah model dimuat
butuh sekitar 1 menit** (model membaca instruksinya sekali); hal ini terulang setelah model dilepas
karena menganggur. Bila terasa mengganggu, naikkan `KIRANA_IDLE_UNLOAD_MINUTES` (misalnya `120`).
KIRANA melayani 2 pertanyaan bergiliran; pertanyaan ketiga pada saat yang sama diminta mencoba lagi.

**Waktu server** diatur ke WITA (`TZ=Asia/Makassar`) agar tanggal "hari ini" sesuai jam kantor.
**Log container** dirotasi otomatis (maksimal 5 × 10 MB per layanan) agar tidak memenuhi disk.

### Pengaturan Docker Desktop untuk RAM 8 GB

Buat berkas `C:\Users\<nama-user>\.wslconfig`:

```ini
[wsl2]
memory=4GB
swap=2GB

[experimental]
autoMemoryReclaim=gradual
```

`autoMemoryReclaim` mengembalikan RAM ke Windows setelah KIRANA dilepas. Terapkan dengan
`wsl --shutdown`, lalu buka kembali Docker Desktop.

Agar aplikasi menyala sendiri setelah AIO dihidupkan: di Docker Desktop aktifkan
**Settings → General → Start Docker Desktop when you sign in** (container sudah diatur
`restart: unless-stopped`).

---

## 4. Instalasi pertama

Langkah ini untuk **database baru yang kosong**. Untuk server yang sudah berisi data, ikuti
[Cara update](#6-cara-update).

### 4.1 Siapkan berkas
Pasang **Git** dan **Docker Desktop**, lalu:

```powershell
git clone https://github.com/Hikari-Jones/PTP-KPU.git
cd PTP-KPU
copy .env.example .env
```

### 4.2 Isi `.env` (folder utama)

| Variabel | Isi |
|---|---|
| `SECRET_KEY` | Acak, minimal 32 karakter: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | Kata sandi database acak (gunakan huruf/angka saja) |
| `BOOTSTRAP_ADMIN_NIP`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` | Akun administrator pertama (sandi minimal 12 karakter) |
| `OFFICIAL_ISSUANCE_ENABLED` | Biarkan `false` sampai penomoran resmi disetujui kantor |
| `KIRANA_IDLE_UNLOAD_MINUTES` | Opsional, bawaan `15` (0 = model tidak pernah dilepas) |
| `KIRANA_N_THREADS` | Opsional, bawaan `0` (otomatis) |

Jangan pernah mengunggah `.env` ke Git.

### 4.3 Bangun dan jalankan

```powershell
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
```

Saat pertama menyala, backend membuat tabel, **satu akun admin** dari `.env`, serta data rujukan
resmi (kode klasifikasi, jenis surat). Tidak ada data contoh yang dibuat.

### 4.4 Unduh model KIRANA (sekali, ~2,1 GB, perlu internet)

```powershell
docker compose -f docker-compose.production.yml exec backend python -m kirana_llm --download
```

Setelah itu KIRANA berjalan tanpa internet.

### 4.5 Buka aplikasi
- Di AIO: <http://localhost:8080>, login dengan akun admin dari `.env`.
- Dari PC lain di jaringan kantor: aplikasi sengaja hanya mendengarkan di `127.0.0.1`.
  Pasang reverse proxy HTTPS (misalnya Caddy) di AIO yang meneruskan ke `localhost:8080`;
  lihat [RUNBOOK.md](RUNBOOK.md). Reverse proxy ini juga **wajib** agar batas permintaan
  (30 per detik per PC) dihitung per komputer; tanpa proxy, semua PC kantor terlihat sebagai satu
  alamat dan berbagi satu batas.

Tambahkan pegawai melalui menu **Kelola User**, lalu satker, tahun anggaran, akun, dan pagu
melalui menu Realisasi Anggaran.

---

## 5. Menjalankan sehari-hari

Jalankan dari folder `PTP-KPU`. **Selalu sertakan `-f docker-compose.production.yml`**
(berkas `docker-compose.yml` adalah untuk pengembangan).

| Tujuan | Perintah |
|---|---|
| Menyalakan | `docker compose -f docker-compose.production.yml up -d` |
| Mematikan (data aman) | `docker compose -f docker-compose.production.yml stop` |
| Restart backend | `docker compose -f docker-compose.production.yml restart backend` |
| Status | `docker compose -f docker-compose.production.yml ps` |
| Log backend | `docker compose -f docker-compose.production.yml logs -f backend` |
| Pemakaian RAM/CPU | `docker stats` |

**Backup:** menu **Cadangan Sistem** (admin) membuat ZIP berisi database, berkas unggahan, dan
checksum. Unduh dan simpan salinannya di media terpisah secara berkala. Pemulihan dijelaskan di
[RUNBOOK.md](RUNBOOK.md#backup-and-restore).

---

## 6. Cara update

Lakukan di luar jam kerja. Database dan berkas **tidak dihapus** oleh update.

1. **Backup dulu** melalui menu **Cadangan Sistem**, lalu unduh ZIP-nya.
2. **Ambil versi terbaru:**
   ```powershell
   cd PTP-KPU
   git pull
   ```
3. **Bangun ulang dan jalankan:**
   ```powershell
   docker compose -f docker-compose.production.yml up -d --build
   ```
4. **Perbarui struktur database** (aman dijalankan berulang kali; tidak mengisi data contoh):
   ```powershell
   docker compose -f docker-compose.production.yml exec backend python upgrade_operations.py
   ```
   Harus berakhir dengan `Operations schema upgrade completed without reseeding demo data`.
5. **Restart backend** agar perubahan struktur dan sinkronisasi arsip diterapkan:
   ```powershell
   docker compose -f docker-compose.production.yml restart backend
   ```
6. **Periksa:** buka aplikasi (tekan Ctrl+F5 sekali bila tampilan lama masih muncul), login, lalu
   buka Surat Menyurat, Realisasi Anggaran, dan Data Arsip. Bila ada galat, lihat log backend.

Bila `.env.example` memiliki variabel baru, salin variabel tersebut ke `.env` sebelum langkah 3.
Jangan menjalankan `setup_local_database.py` atau `bootstrap.py` pada server yang sudah berisi data.

---

## 7. Mode pengembangan (untuk developer)

```powershell
docker compose up -d          # MySQL, backend (auto-reload), frontend Vite di http://localhost:5173
```

Atau tanpa Docker (memerlukan MySQL lokal sesuai `DATABASE_URL` di `.env`):

```powershell
cd backend
python -m venv ..\venv; ..\venv\Scripts\activate
pip install -r requirements.txt
python setup_local_database.py        # database contoh berisi akun & data demo (khusus pengembangan)
python -m uvicorn app.main:app --reload --port 8000

cd ..\frontend
npm ci
npm run dev
```

`setup_local_database.py` membuat akun demo dengan sandi bawaan; **jangan dipakai di server kantor**.

Struktur folder:

```
backend/    API FastAPI (app/api, app/models, app/services), kirana-llm/, tests/, upgrade_operations.py
frontend/   React + TypeScript (src/app/components, src/services), nginx.conf
docker-compose.production.yml   Server kantor (AIO)
docker-compose.yml              Pengembangan
```

---

## 8. Pengujian

Semua uji integrasi memakai **database kosong khusus uji** (nama berakhiran `_test`) dan menolak
berjalan pada database operasional.

```powershell
cd backend
python -m unittest discover -s tests -p "test_*unit.py"   # uji unit
python tests/e2e_new_features.py      # alur fitur utama (arsip, surat tugas, tahun anggaran, satker, impor)
python tests/e2e_checklist.py         # daftar periksa rilis: hak akses, surat, anggaran, laporan, arsip, keamanan KIRANA
python tests/ai_live_check.py         # KIRANA dengan model asli (jalankan setelah e2e_checklist.py pada database yang sama)
python tests/smoke_all_routes.py      # seluruh rute API
python tests/perf_endpoints.py        # kecepatan dengan data beberapa tahun
cd ..\frontend
npm test
npm run build
```

Variabel yang dibutuhkan uji integrasi: `DATABASE_URL` (ke database `..._test` yang kosong),
`SECRET_KEY`, dan `UPLOAD_DIR` (folder sementara). Detail ada di [RUNBOOK.md](RUNBOOK.md#verification).

---

## 9. Masalah umum

| Gejala | Penyebab / solusi |
|---|---|
| Galat `Unknown column ...` di log, halaman 503 | Struktur database belum diperbarui: jalankan langkah 4 di [Cara update](#6-cara-update). |
| Data Arsip kosong padahal ada surat | Admin menekan **Sinkronkan** di Data Arsip; pastikan `upgrade_operations.py` sudah dijalankan. |
| KIRANA: "model belum terunduh" | Jalankan perintah unduh model di [4.4](#44-unduh-model-kirana-sekali-21-gb-perlu-internet). |
| AIO terasa lambat saat KIRANA dipakai | Wajar selama menjawab; turunkan `KIRANA_N_THREADS` (misalnya `2`) agar CPU tersisa untuk tugas lain. |
| KIRANA: status "error" | Berkas model rusak: hapus dari volume `kirana_models`, lalu unduh ulang (langkah 4.4). |
| "Terlalu banyak permintaan" | Batas 30 permintaan/detik per PC terlampaui; tunggu sebentar. Bila semua PC sering mengalaminya, pastikan akses melalui reverse proxy. |
| "Isi berkas tidak sesuai dengan format" saat unggah | Berkas rusak atau ekstensinya diganti (mis. berkas lain diberi nama `.pdf`). Simpan ulang dari aplikasi aslinya. |
| "Terbitkan Nomor" terkunci | Disengaja (Mode Uji Coba); lihat `OFFICIAL_ISSUANCE_ENABLED` dan [KPU_REGULATORY_REVIEW.md](KPU_REGULATORY_REVIEW.md). |
| Tampilan tidak berubah setelah update | Muat ulang paksa browser (Ctrl+F5). |
| `No 'script_location' key` saat menjalankan alembic | Image produksi tidak memuat alembic; gunakan `upgrade_operations.py`. |

Dokumen lain: [RUNBOOK.md](RUNBOOK.md) (deployment, backup/restore, keamanan),
[KPU_REGULATORY_REVIEW.md](KPU_REGULATORY_REVIEW.md).
