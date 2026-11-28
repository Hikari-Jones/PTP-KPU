"""Archive utilities: JRA retention calculation, lightweight text extraction, and Berita Acara PDF."""
from __future__ import annotations

import io
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger("ptp_kpu.arsip_utils")

# Permanent archival classification prefixes per PKPU 17/2023 & ANRI guidelines
PERMANENT_KLASIFIKASI_PREFIXES = ("HK.01", "PL.02.4", "KU.03")


def add_years(d: date, years: int) -> date:
    """Safely add years to a date (handling leap day Feb 29 -> Feb 28)."""
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(year=d.year + years, day=28)


def default_nasib_akhir(kode_klasifikasi: Optional[str]) -> str:
    if not kode_klasifikasi:
        return "musnah"
    upper = kode_klasifikasi.strip().upper()
    if any(upper.startswith(p) for p in PERMANENT_KLASIFIKASI_PREFIXES):
        return "permanen"
    return "musnah"


def compute_jra(
    tanggal_dokumen: date,
    retensi_aktif_tahun: Optional[int],
    retensi_inaktif_tahun: Optional[int],
    kode_klasifikasi: Optional[str] = None,
    existing_nasib_akhir: Optional[str] = None,
    today: Optional[date] = None,
) -> Tuple[Optional[date], Optional[date], str, Optional[str]]:
    """Return (tanggal_retensi_aktif, tanggal_retensi_inaktif, status_retensi, nasib_akhir)."""
    if retensi_aktif_tahun is None and retensi_inaktif_tahun is None:
        return None, None, "aktif", existing_nasib_akhir

    ref_today = today or date.today()
    aktif_yrs = max(0, int(retensi_aktif_tahun or 0))
    inaktif_yrs = max(0, int(retensi_inaktif_tahun or 0))

    tgl_aktif = add_years(tanggal_dokumen, aktif_yrs)
    tgl_inaktif = add_years(tgl_aktif, inaktif_yrs)

    if ref_today <= tgl_aktif:
        status_ret = "aktif"
    elif ref_today <= tgl_inaktif:
        status_ret = "inaktif"
    else:
        status_ret = "siap_susut"

    nasib = existing_nasib_akhir or default_nasib_akhir(kode_klasifikasi)
    return tgl_aktif, tgl_inaktif, status_ret, nasib


def extract_text_from_file(path: Path, max_chars: int = 50000) -> Optional[str]:
    """Lightweight text extraction for PDF, DOCX, and CSV/TXT capped for 8 GB AIO safety."""
    if not path or not path.is_file():
        return None
    ext = path.suffix.lower()
    chunks: list[str] = []
    total = 0

    try:
        if ext == ".pdf":
            import pdfplumber
            with pdfplumber.open(str(path)) as pdf:
                for page in pdf.pages[:15]:
                    txt = (page.extract_text() or "").strip()
                    if txt:
                        chunks.append(txt)
                        total += len(txt)
                        if total >= max_chars:
                            break
        elif ext == ".docx":
            import docx
            document = docx.Document(str(path))
            for para in document.paragraphs:
                txt = (para.text or "").strip()
                if txt:
                    chunks.append(txt)
                    total += len(txt)
                    if total >= max_chars:
                        break
            if total < max_chars:
                for table in document.tables:
                    for row in table.rows:
                        row_text = " ".join((c.text or "").strip() for c in row.cells if (c.text or "").strip())
                        if row_text:
                            chunks.append(row_text)
                            total += len(row_text)
                            if total >= max_chars:
                                break
                    if total >= max_chars:
                        break
        elif ext in (".csv", ".txt"):
            with path.open("r", encoding="utf-8", errors="ignore") as f:
                data = f.read(max_chars)
                if data.strip():
                    chunks.append(data.strip())
        else:
            return None
    except Exception as exc:  # noqa: BLE001 - extraction must never break archive creation
        logger.debug("Ekstraksi teks dilewati untuk %s: %s", path.name, exc)
        return None

    combined = "\n".join(chunks).strip()
    if not combined:
        return None
    return combined[:max_chars]


def build_berita_acara_penyusutan_pdf(
    *,
    nomor_ba: str,
    jenis_penyusutan: str,
    status: str,
    alasan: str,
    dokumen_snapshot: list,
    pengaju_nama: str,
    penyetuju_nama: Optional[str],
    tanggal_eksekusi: Optional[datetime],
    catatan_persetujuan: Optional[str] = None,
) -> bytes:
    """Generate an institutional Berita Acara Pemusnahan / Penyerahan / Pemindahan Arsip PDF."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("BATitle", parent=styles["Heading2"], alignment=1, fontSize=12, spaceAfter=4)
    sub_style = ParagraphStyle("BASub", parent=styles["Normal"], alignment=1, fontSize=9.5, spaceAfter=10)
    body_style = ParagraphStyle("BABody", parent=styles["Normal"], fontSize=9.5, leading=14, spaceAfter=8)
    cell_style = ParagraphStyle("BACell", parent=styles["Normal"], fontSize=8, leading=10)

    jenis_label = {
        "musnah": "PEMUSNAHAN ARSIP",
        "serah": "PENYERAHAN ARSIP STATIS",
        "pindah": "PEMINDAHAN ARSIP INAKTIF",
    }.get(jenis_penyusutan, "PENYUSUTAN ARSIP")

    tgl_str = (tanggal_eksekusi or datetime.now()).strftime("%d-%m-%Y %H:%M")

    story = [
        Paragraph("<b>KOMISI PEMILIHAN UMUM PROVINSI SULAWESI UTARA</b>", title_style),
        Paragraph("Jl. Diponegoro No. 25 Manado · Berita Acara Penyusutan Arsip (PKPU 17/2023)", sub_style),
        Spacer(1, 4),
        Paragraph(f"<b>BERITA ACARA {jenis_label}</b>", title_style),
        Paragraph(f"Nomor: <b>{nomor_ba}</b>", sub_style),
        Paragraph(
            f"Pada tanggal <b>{tgl_str}</b>, berdasarkan Jadwal Retensi Arsip (JRA) KPU sesuai "
            f"PKPU Nomor 17 Tahun 2023 dan Keputusan KPU Nomor 1257 Tahun 2024, telah dilaksanakan "
            f"proses <b>{jenis_label.lower()}</b> dengan status <b>{status.upper()}</b>.",
            body_style,
        ),
        Paragraph(f"<b>Dasar / Alasan Penyusutan:</b> {alasan}", body_style),
    ]
    if catatan_persetujuan:
        story.append(Paragraph(f"<b>Catatan Persetujuan:</b> {catatan_persetujuan}", body_style))

    story.append(Spacer(1, 6))
    rows = [[
        Paragraph("<b>No</b>", cell_style),
        Paragraph("<b>Nomor Dokumen</b>", cell_style),
        Paragraph("<b>Nama Dokumen</b>", cell_style),
        Paragraph("<b>Klasifikasi</b>", cell_style),
        Paragraph("<b>Tanggal</b>", cell_style),
        Paragraph("<b>SHA-256 (Ringkas)</b>", cell_style),
    ]]
    for idx, item in enumerate(dokumen_snapshot or [], start=1):
        sha = str(item.get("sha256_hash") or "-")
        rows.append([
            Paragraph(str(idx), cell_style),
            Paragraph(str(item.get("nomor_dokumen") or "-"), cell_style),
            Paragraph(str(item.get("nama_dokumen") or "-"), cell_style),
            Paragraph(str(item.get("kode_klasifikasi") or "-"), cell_style),
            Paragraph(str(item.get("tanggal_dokumen") or "-"), cell_style),
            Paragraph(sha[:16] + ("..." if len(sha) > 16 else ""), cell_style),
        ])

    tbl = Table(rows, colWidths=[1.0 * cm, 3.2 * cm, 5.2 * cm, 2.2 * cm, 2.2 * cm, 3.0 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#991b1b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 18))

    sig_table = Table(
        [
            [Paragraph("<b>Pengaju Usulan Penyusutan</b>", cell_style), Paragraph("<b>Pejabat Penyetuju / Pimpinan</b>", cell_style)],
            [Spacer(1, 28), Spacer(1, 28)],
            [Paragraph(f"<b>{pengaju_nama}</b>", cell_style), Paragraph(f"<b>{penyetuju_nama or '(Menunggu Persetujuan)'}</b>", cell_style)],
        ],
        colWidths=[8.4 * cm, 8.4 * cm],
    )
    sig_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    story.append(sig_table)

    doc.build(story)
    return buf.getvalue()
