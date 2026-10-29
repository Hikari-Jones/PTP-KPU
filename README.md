# PTP-KPU Sulut (Digitalisasi proses kinerja kantor KPU-SULUT)
### Sistem Informasi Terintegrasi Komisi Pemilihan Umum Provinsi Sulawesi Utara
**Struktur Monorepo (Frontend + Backend FastAPI + Local Database + Local AI Model)**

---

## 📌 Gambaran Umum Arsitektur Sistem

Proyek ini dirancang secara khusus untuk lingkungan kantor pemerintahan (**KPU - Komisi Pemilihan Umum**) yang memerlukan **kedaulatan data penuh (*data sovereignty*)** dan dapat dioperasikan secara **100% lokal (*on-premises / air-gapped*)** di PC kantor tanpa ketergantungan pada layanan cloud eksternal.

```
PTP-KPU/
├── backend/                  # REST API FastAPI (Python 3.11+)
│   ├── app/
│   │   ├── api/v1/          # Endpoints: Persuratan, Anggaran, Arsip, AI, Auth, Satker
│   │   ├── core/            # Database async engine, Config pydantic
│   │   ├── models/          # Skema model SQLAlchemy (InnoDB)
│   │   └── services/        # Business logic tata persuratan & DIPA
│   ├── database_schema.sql  # DDL SQL resmi kpu_db
│   ├── setup_local_database.py # Otomasi inisialisasi & seeder basis data lokal
│   ├── requirements.txt     # Dependensi Python
│   └── .env                 # Konfigurasi lokal PC kantor
│
├── frontend/                 # Web App Modern (React 19, TypeScript, Vite, Tailwind CSS v4)
│   ├── src/
│   │   ├── app/components/  # Modul Persuratan, Realisasi Anggaran, Chatbot KIRANA, Views
│   │   ├── services/api.ts  # Client API terpusat dengan proxy /api
│   │   └── context/         # AuthContext
│   ├── package.json
│   ├── vite.config.ts       # Reverse proxy ke localhost:8000
│   └── tsconfig.app.json
│
├── docker-compose.yml        # Orchestration 1-klik (MySQL, Ollama, Backend, Frontend)
├── .env.example              # Template konfigurasi environment kantor
└── README.md
```

---

## 🏛️ 1. Persiapan Basis Data Lokal PC Kantor (MySQL `kpu_db`)

Sistem menggunakan basis data relasional **MySQL 8.0** yang berjalan di PC kantor lokal (port `3306`):

1. **Jalankan Layanan MySQL di PC Kantor**:
   - Jika menggunakan **XAMPP / Laragon**: Cukup klik tombol **Start** pada modul MySQL.
   - Jika menggunakan **Native MySQL Server**: Pastikan service `MySQL80` berjalan.
   - Jika menggunakan **Docker**: Jalankan `docker-compose up -d mysql-db`.

2. **Inisialisasi & Seeder Data Master Otomatis**:
   Buka terminal di folder `backend/`:
   ```bash
   cd backend
   pip install -r requirements.txt
   python setup_local_database.py
   ```
   *Skrip ini secara otomatis membuat basis data `kpu_db`, mengompilasi seluruh tabel (InnoDB dengan Foreign Key relasional), dan mengisi data master resmi KPU Sulut (Subbagian, Pegawai, Kode Klasifikasi Arsip, Format Penomoran Surat, DIPA 2025/2026, dan 16 Satker wilayah).*

---

## 🤖 2. Persiapan Model AI Lokal Kantor (Ollama)

Untuk menjaga kerahasiaan dokumen kedinasan negara, sistem **tidak mengirimkan teks persuratan ke API pihak ketiga di internet**. Inferensi AI dijalankan secara lokal di PC kantor:

1. Unduh dan pasang **Ollama** untuk Windows dari [https://ollama.ai](https://ollama.ai).
2. Unduh model lokal pilihan (disarankan Qwen 2.5 atau Llama 3):
   ```bash
   ollama run qwen2.5
   ```
3. Ollama akan aktif di `http://localhost:11434`. Backend FastAPI secara otomatis menghubungkan asisten **KIRANA Agent** ke model lokal ini.
   *(Jika Ollama belum aktif, KIRANA Agent secara cerdas tetap berfungsi dalam mode rule-based fallback tanpa error).*

---

## 🚀 3. Menjalankan Aplikasi

### Menjalankan Backend (FastAPI):
```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- Dokumentasi Interaktif Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- Status Health Check: [http://localhost:8000/health](http://localhost:8000/health)

### Menjalankan Frontend (Vite + React):
```bash
cd frontend
npm install
npm run dev
```
- Buka antarmuka aplikasi di browser: [http://localhost:5173](http://localhost:5173)

### Kredensial Login Bawaan Sistem:
* **Administrator Sistem**:
  * NIP: `198507182020031001`
  * Password: `admin123`
  * Hak Akses: Administrator (Akses penuh seluruh modul & kontrol user)
* **Operator Teknis**:
  * NIP: `199208052021011002`
  * Password: `123456`
  * Hak Akses: Operator (Persuratan & Input Realisasi Anggaran)

---

## 🛠️ Ringkasan Perbaikan yang Telah Dilakukan

1. **Konsolidasi Monorepo**:
   - Menggabungkan frontend dan backend yang sebelumnya terpisah menjadi satu repositori terpadu di folder `PTP-KPU`.
   - Mengganti folder `backend-backupfe` yang sebelumnya keliru berisi frontend cadangan dengan backend riil (`PTP-KPU-backend-filteringGabunganRev1-alsa`).

2. **Perbaikan Build & TypeScript Frontend**:
   - Menghapus konfigurasi usang `"ignoreDeprecations": "6.0"` di `tsconfig.app.json` yang memicu kegagalan build `tsc -b`.
   - Memperbaiki deklarasi versi TypeScript ke `^5.7.3` dan menambahkan dependensi `axios` di `package.json`.
   - Membersihkan karakter BOM UTF-8 yang memicu error PostCSS. Hasil build frontend kini **100% sukses**.

3. **Pembuatan Endpoint Persuratan di Backend**:
   - Membuat modul [`app/api/v1/endpoints/surat.py`](backend/app/api/v1/endpoints/surat.py) yang mengimplementasikan API Kode Klasifikasi, Jenis Surat, Surat Keluar, dan penomoran resmi atomik (`PenomoranSequence`).

4. **Integrasi AI Lokal (Ollama)**:
   - Membuat modul [`app/api/v1/endpoints/ai.py`](backend/app/api/v1/endpoints/ai.py) yang menghubungkan chatbot KIRANA langsung ke server Ollama lokal di PC kantor (`localhost:11434`) dengan fallback pintar.

5. **Penyempurnaan Modul Satker**:
   - Mengubah halaman [`SatkerView.tsx`](frontend/src/app/components/RealisasiAnggaran/SatkerView.tsx) dari yang sebelumnya berstatus *"Fitur dalam Pengembangan"* menjadi panel pemantauan lengkap untuk KPU Provinsi dan 15 KPU Kabupaten/Kota se-Sulawesi Utara lengkap dengan fitur filter dan ekspor CSV.

6. **Revival Modul Alur Disposisi & TTE**:
   - Mengintegrasikan kembali komponen persuratan canggih ([`SuratMenyuratModule.tsx`](frontend/src/app/components/SuratMenyurat/SuratMenyuratModule.tsx)) ke menu navigasi sidebar (`surat-alur`) agar staf dapat melakukan alur verifikasi draf, simulasi TTE, dan audit trail log.

7. **Fitur Pengelolaan User, Bug Report, & Backup**:
   - Menambahkan modal interaktif untuk pendaftaran operator baru di `KelolaUserView.tsx`.
   - Menambahkan form pengiriman kendala teknis di `BugReportView.tsx`.
   - Mengaktifkan aksi pembuatan cadangan database dan unduhan manifes di `ArsipAdminView.tsx`.
