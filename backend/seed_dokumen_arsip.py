"""
Seed Script — Bulk Insert Dokumen Arsip
======================================
Gunakan script ini untuk penerapan awal (initial deployment) arsip dokumen KPU Sulut.

Cara Menjalankan:
    cd /d d:\PTP-KPU\backend
    python seed_dokumen_arsip.py

Catatan:
- Script ini IDEMPOTENT: dokumen dengan nomor_dokumen yang sama tidak akan diduplikasi.
- Sesuaikan data di DOKUMEN_LIST di bawah sesuai kebutuhan.
- Pastikan id_klasifikasi dan id_pegawai sesuai dengan data di database.

ID Referensi (dari database saat ini):
  KLASIFIKASI:
    7  = PL.01.1 — Perencanaan Pemilu & Pilkada
    8  = PL.02.1 — Pemutakhiran Data Pemilih
    9  = HR.01.2 — Surat Tugas & Kepegawaian
    10 = HK.01.1 — Peraturan & Keputusan KPU
    11 = KU.01.3 — DIPA & Pertanggungjawaban Keuangan
    12 = IT.01.1 — Data & Infrastruktur IT

  PEGAWAI (pengunggah):
    5  = Admin KPU Sulut (admin)
    6  = Ahmad Kurniawan (operator)
    7  = Siti Rahmawati (operator)
    8  = Budi Santoso (operator)
    9  = Drs. Jerry Mandey, M.Si (admin)
    10 = Meyke Tumengkol, S.Sos (operator)
    12 = Farly Pontoh, S.Kom (operator)
    13 = Priscilia Rompas, S.Pd (operator)
    14 = Ir. Ronny Lumempow, MT (admin)
    15 = Christian Runtu, ST (operator)

  HAK_AKSES (pilihan valid):
    'publik'   — Dapat diakses semua pegawai dan publik
    'internal' — Hanya pegawai internal KPU
    'terbatas' — Hanya bagian/seksi tertentu
    'rahasia'  — Hanya admin
"""

import pymysql
from datetime import date

# ============================================================
# KONFIGURASI DATABASE (sesuaikan jika berbeda)
# ============================================================
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "kpu_db",
    "charset": "utf8mb4",
}

# ============================================================
# DAFTAR DOKUMEN ARSIP — Tambahkan / ubah sesuai kebutuhan
# ============================================================
DOKUMEN_LIST = [
    # ----- PERENCANAAN PEMILU & PILKADA (id_klasifikasi=7) -----
    {
        "id_klasifikasi": 7,
        "id_pegawai": 5,
        "nama_dokumen": "DPT Final Pilgub Sulawesi Utara 2024",
        "nomor_dokumen": "001/PD/KPU-SU/I/2024",
        "kategori": "Laporan",
        "event": "Pilgub Sulut 2024",
        "tanggal_dokumen": date(2024, 1, 15),
        "hak_akses": "internal",
    },
    {
        "id_klasifikasi": 7,
        "id_pegawai": 5,
        "nama_dokumen": "Jadwal Tahapan Pemilu Legislatif 2024",
        "nomor_dokumen": "002/PL/KPU-SU/I/2024",
        "kategori": "Jadwal",
        "event": "Pileg 2024",
        "tanggal_dokumen": date(2024, 1, 20),
        "hak_akses": "publik",
    },
    {
        "id_klasifikasi": 7,
        "id_pegawai": 9,
        "nama_dokumen": "Rencana Anggaran Pilgub 2024",
        "nomor_dokumen": "003/PL/KPU-SU/II/2024",
        "kategori": "Keuangan",
        "event": "Pilgub Sulut 2024",
        "tanggal_dokumen": date(2024, 2, 1),
        "hak_akses": "terbatas",
    },
    {
        "id_klasifikasi": 7,
        "id_pegawai": 5,
        "nama_dokumen": "Laporan Akhir Pelaksanaan Pilgub Sulut 2024",
        "nomor_dokumen": "004/LPK/KPU-SU/XII/2024",
        "kategori": "Laporan",
        "event": "Pilgub Sulut 2024",
        "tanggal_dokumen": date(2024, 12, 20),
        "hak_akses": "internal",
    },

    # ----- PEMUTAKHIRAN DATA PEMILIH (id_klasifikasi=8) -----
    {
        "id_klasifikasi": 8,
        "id_pegawai": 6,
        "nama_dokumen": "Rekapitulasi DPT Kabupaten Minahasa 2024",
        "nomor_dokumen": "005/DPT/KPU-SU/III/2024",
        "kategori": "Data Pemilih",
        "event": "Pileg 2024",
        "tanggal_dokumen": date(2024, 3, 10),
        "hak_akses": "terbatas",
    },
    {
        "id_klasifikasi": 8,
        "id_pegawai": 6,
        "nama_dokumen": "DPTb Pilgub Sulut Putaran 2",
        "nomor_dokumen": "006/DPTb/KPU-SU/X/2024",
        "kategori": "Data Pemilih",
        "event": "Pilgub Sulut 2024",
        "tanggal_dokumen": date(2024, 10, 5),
        "hak_akses": "terbatas",
    },
    {
        "id_klasifikasi": 8,
        "id_pegawai": 7,
        "nama_dokumen": "Berita Acara Pleno DPS Kota Manado 2024",
        "nomor_dokumen": "007/BA/KPU-SU/IV/2024",
        "kategori": "Berita Acara",
        "event": "Pileg 2024",
        "tanggal_dokumen": date(2024, 4, 18),
        "hak_akses": "internal",
    },

    # ----- SURAT TUGAS & KEPEGAWAIAN (id_klasifikasi=9) -----
    {
        "id_klasifikasi": 9,
        "id_pegawai": 10,
        "nama_dokumen": "Surat Tugas Bimtek KPPS Kabupaten Bolaang Mongondow",
        "nomor_dokumen": "008/ST/KPU-SU/V/2024",
        "kategori": "Surat Tugas",
        "event": "Bimtek Pilgub 2024",
        "tanggal_dokumen": date(2024, 5, 7),
        "hak_akses": "internal",
    },
    {
        "id_klasifikasi": 9,
        "id_pegawai": 10,
        "nama_dokumen": "SK Pembentukan Panitia Pemilihan Kecamatan 2024",
        "nomor_dokumen": "009/SK/KPU-SU/II/2024",
        "kategori": "SK",
        "event": "Pilgub Sulut 2024",
        "tanggal_dokumen": date(2024, 2, 14),
        "hak_akses": "publik",
    },
    {
        "id_klasifikasi": 9,
        "id_pegawai": 13,
        "nama_dokumen": "Daftar Hadir Rapat Pleno Rekapitulasi Suara",
        "nomor_dokumen": "010/DH/KPU-SU/XI/2024",
        "kategori": "Administrasi",
        "event": "Pilgub Sulut 2024",
        "tanggal_dokumen": date(2024, 11, 30),
        "hak_akses": "internal",
    },

    # ----- PERATURAN & KEPUTUSAN KPU (id_klasifikasi=10) -----
    {
        "id_klasifikasi": 10,
        "id_pegawai": 14,
        "nama_dokumen": "Keputusan KPU Sulut Nomor 10 Tahun 2024 tentang Penetapan DPT",
        "nomor_dokumen": "011/HK/KPU-SU/VI/2024",
        "kategori": "Keputusan",
        "event": "Pilgub Sulut 2024",
        "tanggal_dokumen": date(2024, 6, 1),
        "hak_akses": "publik",
    },
    {
        "id_klasifikasi": 10,
        "id_pegawai": 14,
        "nama_dokumen": "Peraturan KPU RI Nomor 8 Tahun 2024 (Salinan)",
        "nomor_dokumen": "012/HK/KPU-SU/VII/2024",
        "kategori": "Peraturan",
        "event": None,
        "tanggal_dokumen": date(2024, 7, 10),
        "hak_akses": "publik",
    },

    # ----- DIPA & PERTANGGUNGJAWABAN KEUANGAN (id_klasifikasi=11) -----
    {
        "id_klasifikasi": 11,
        "id_pegawai": 9,
        "nama_dokumen": "DIPA KPU Provinsi Sulawesi Utara TA 2025",
        "nomor_dokumen": "013/KU/KPU-SU/I/2025",
        "kategori": "Keuangan",
        "event": "Operasional 2025",
        "tanggal_dokumen": date(2025, 1, 5),
        "hak_akses": "rahasia",
    },
    {
        "id_klasifikasi": 11,
        "id_pegawai": 9,
        "nama_dokumen": "DIPA KPU Provinsi Sulawesi Utara TA 2026",
        "nomor_dokumen": "014/KU/KPU-SU/I/2026",
        "kategori": "Keuangan",
        "event": "Operasional 2026",
        "tanggal_dokumen": date(2026, 1, 3),
        "hak_akses": "rahasia",
    },
    {
        "id_klasifikasi": 11,
        "id_pegawai": 8,
        "nama_dokumen": "LPJ Kegiatan Sosialisasi Pilgub Sulut 2024",
        "nomor_dokumen": "015/LPJ/KPU-SU/XII/2024",
        "kategori": "Laporan",
        "event": "Pilgub Sulut 2024",
        "tanggal_dokumen": date(2024, 12, 28),
        "hak_akses": "terbatas",
    },
    {
        "id_klasifikasi": 11,
        "id_pegawai": 8,
        "nama_dokumen": "Laporan Realisasi Anggaran Semester I TA 2026",
        "nomor_dokumen": "016/KU/KPU-SU/VI/2026",
        "kategori": "Laporan",
        "event": "Operasional 2026",
        "tanggal_dokumen": date(2026, 6, 30),
        "hak_akses": "terbatas",
    },

    # ----- DATA & INFRASTRUKTUR IT (id_klasifikasi=12) -----
    {
        "id_klasifikasi": 12,
        "id_pegawai": 12,
        "nama_dokumen": "Dokumentasi Sistem SIREKAP KPU Sulut 2024",
        "nomor_dokumen": "017/IT/KPU-SU/VIII/2024",
        "kategori": "Teknis",
        "event": "Pilgub Sulut 2024",
        "tanggal_dokumen": date(2024, 8, 20),
        "hak_akses": "terbatas",
    },
    {
        "id_klasifikasi": 12,
        "id_pegawai": 12,
        "nama_dokumen": "Laporan Keamanan Jaringan dan Infrastruktur IT 2025",
        "nomor_dokumen": "018/IT/KPU-SU/XII/2025",
        "kategori": "Laporan",
        "event": "Operasional 2025",
        "tanggal_dokumen": date(2025, 12, 15),
        "hak_akses": "rahasia",
    },
    {
        "id_klasifikasi": 12,
        "id_pegawai": 15,
        "nama_dokumen": "Manual Penggunaan Sistem PTP-KPU v1.0",
        "nomor_dokumen": "019/IT/KPU-SU/XI/2026",
        "kategori": "Panduan",
        "event": None,
        "tanggal_dokumen": date(2026, 11, 1),
        "hak_akses": "internal",
    },
]


# ============================================================
# FUNGSI SEED
# ============================================================
def seed():
    conn = pymysql.connect(**DB_CONFIG)
    cur = conn.cursor()

    inserted = 0
    skipped = 0

    for doc in DOKUMEN_LIST:
        # Cek duplikat berdasarkan nomor_dokumen
        cur.execute(
            "SELECT id_dokumen FROM dokumen_arsip WHERE nomor_dokumen = %s",
            (doc["nomor_dokumen"],)
        )
        existing = cur.fetchone()

        if existing:
            print(f"  [SKIP]   {doc['nomor_dokumen']} — sudah ada (id={existing[0]})")
            skipped += 1
            continue

        cur.execute(
            """
            INSERT INTO dokumen_arsip
                (id_klasifikasi, id_pegawai, nama_dokumen, nomor_dokumen,
                 kategori, event, tanggal_dokumen, hak_akses, file_path, ukuran_file)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, 0)
            """,
            (
                doc["id_klasifikasi"],
                doc["id_pegawai"],
                doc["nama_dokumen"],
                doc["nomor_dokumen"],
                doc["kategori"],
                doc.get("event"),
                doc["tanggal_dokumen"].isoformat(),
                doc["hak_akses"],
            )
        )
        print(f"  [INSERT] {doc['nomor_dokumen']} — {doc['nama_dokumen']}")
        inserted += 1

    conn.commit()
    conn.close()

    print(f"\n✅ Selesai! {inserted} dokumen ditambahkan, {skipped} dilewati (duplikat).")


if __name__ == "__main__":
    print("🗂️  Seed Dokumen Arsip KPU Sulut")
    print("=" * 50)
    seed()