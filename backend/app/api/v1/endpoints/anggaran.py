from app.api.v1.endpoints import (
    tahun_anggaran,
    akun_anggaran,
    pagu_anggaran,
    revisi_anggaran,
    realisasi_anggaran,
    dashboard_anggaran,
)

tahun_router = tahun_anggaran.router
akun_router = akun_anggaran.router
pagu_router = pagu_anggaran.router
revisi_router = revisi_anggaran.router
realisasi_router = realisasi_anggaran.router
dashboard_router = dashboard_anggaran.router
