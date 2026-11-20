import ExcelJS from 'exceljs'
import type {
  RealisasiAnggaranResponse,
  MonthlyReportResponse,
  DashboardSummaryResponse
} from '../app/components/RealisasiAnggaran/types'

export interface ExportExcelOptions {
  tahun: number
  bulan?: number | null // 1 - 12 or null for full year
  namaBulan?: string | null
  namaBagian?: string | null
  kodeAkun?: string | null
  summary?: DashboardSummaryResponse | null
  monthlyReport?: MonthlyReportResponse | null
  transactions: RealisasiAnggaranResponse[]
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const RUPIAH_FORMAT = '"Rp "#,##0'
const PERCENT_FORMAT = '0.00%'

export async function exportRealisasiAnggaranToExcel(options: ExportExcelOptions): Promise<void> {
  const {
    tahun,
    bulan,
    namaBulan,
    namaBagian,
    kodeAkun,
    summary,
    monthlyReport,
    transactions
  } = options

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PTP-KPU Sulawesi Utara'
  workbook.lastModifiedBy = 'PTP-KPU System'
  workbook.created = new Date()
  workbook.modified = new Date()

  // Primary Theme Colors (KPU Dark Red & Slate)
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF991B1B' } // Red 800
  }
  const subHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' } // Slate 100
  }
  const totalFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEE2E2' } // Red 100
  }
  const headerFont: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' }
  }
  const boldFont: Partial<ExcelJS.Font> = {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FF0F172A' }
  }
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  }

  // =========================================================================
  // WORKSHEET 1: DATA REALISASI
  // =========================================================================
  const wsRealisasi = workbook.addWorksheet('Data Realisasi', {
    views: [{ state: 'frozen', ySplit: 6 }]
  })

  // Title Block
  wsRealisasi.mergeCells('A1:J1')
  wsRealisasi.getCell('A1').value = 'KOMISI PEMILIHAN UMUM PROVINSI SULAWESI UTARA'
  wsRealisasi.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF991B1B' } }

  wsRealisasi.mergeCells('A2:J2')
  wsRealisasi.getCell('A2').value = 'DAFTAR REALISASI BELANJA ANGGARAN'
  wsRealisasi.getCell('A2').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1E293B' } }

  const periodeLabel = bulan && bulan >= 1 && bulan <= 12
    ? `Tahun Anggaran ${tahun} — Periode: ${MONTH_NAMES[bulan - 1]}`
    : `Tahun Anggaran ${tahun} — Seluruh Bulan (Januari - Desember)`
  const filterLabel = [
    namaBagian ? `Bagian: ${namaBagian}` : null,
    kodeAkun ? `Akun: ${kodeAkun}` : null
  ].filter(Boolean).join(' | ')

  wsRealisasi.mergeCells('A3:J3')
  wsRealisasi.getCell('A3').value = `${periodeLabel}${filterLabel ? ` (${filterLabel})` : ''}`
  wsRealisasi.getCell('A3').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }

  // Table Headers
  const txHeaders = [
    'No',
    'Tanggal',
    'Nomor Dokumen',
    'Kode Akun',
    'Nama Akun MAK',
    'Bagian / Subbagian',
    'Uraian Kegiatan',
    'Pagu Akun MAK (Rp)',
    'Jumlah Realisasi (Rp)',
    'Sisa Anggaran (Rp)'
  ]
  const txHeaderRow = wsRealisasi.getRow(5)
  txHeaderRow.values = txHeaders
  txHeaderRow.height = 28
  txHeaderRow.eachCell((cell) => {
    cell.fill = headerFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder
  })

  // Columns Configuration
  wsRealisasi.columns = [
    { key: 'no', width: 6 },
    { key: 'tanggal', width: 14 },
    { key: 'nomor_dokumen', width: 24 },
    { key: 'kode_akun', width: 16 },
    { key: 'nama_akun', width: 32 },
    { key: 'nama_bagian', width: 24 },
    { key: 'uraian', width: 44 },
    { key: 'pagu_aktif', width: 22 },
    { key: 'jumlah', width: 22 },
    { key: 'sisa', width: 22 }
  ]

  let currentRowIdx = 6
  if (transactions.length === 0) {
    const emptyRow = wsRealisasi.getRow(currentRowIdx)
    emptyRow.values = ['-', '-', 'Tidak ada data transaksi yang sesuai filter', '', '', '', '', 0, 0, 0]
    wsRealisasi.mergeCells(`C${currentRowIdx}:G${currentRowIdx}`)
    emptyRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' }
    emptyRow.getCell(3).font = { name: 'Calibri', italic: true, color: { argb: 'FF94A3B8' } }
    currentRowIdx++
  } else {
    transactions.forEach((tx: any, idx) => {
      const row = wsRealisasi.getRow(currentRowIdx)
      const tglFormatted = tx.tanggal_transaksi ? String(tx.tanggal_transaksi).split('-').reverse().join('/') : '-'
      const paguNum = Number(tx.pagu_anggaran?.pagu_aktif ?? tx.pagu_aktif ?? 0)
      const jumlahNum = Number(tx.jumlah_realisasi ?? 0)
      const sisaNum = Number(tx.sisa_anggaran ?? (paguNum - jumlahNum))

      row.values = [
        idx + 1,
        tglFormatted,
        tx.nomor_dokumen || '-',
        String(tx.kode_akun || tx.akun_anggaran?.kode_akun || ''), // explicit text
        tx.nama_akun || tx.akun_anggaran?.nama_akun || '-',
        tx.nama_bagian || tx.akun_anggaran?.bagian?.nama_bagian || '-',
        tx.uraian_kegiatan || '-',
        paguNum,
        jumlahNum,
        sisaNum
      ]

      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' }
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(4).numFmt = '@' // Text format for MAK code
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'left' }
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'left' }
      row.getCell(7).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }

      // Currency Formats
      row.getCell(8).numFmt = RUPIAH_FORMAT
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' }
      row.getCell(9).numFmt = RUPIAH_FORMAT
      row.getCell(9).alignment = { vertical: 'middle', horizontal: 'right' }
      row.getCell(10).numFmt = RUPIAH_FORMAT
      row.getCell(10).alignment = { vertical: 'middle', horizontal: 'right' }

      row.eachCell((cell) => { cell.border = thinBorder })
      currentRowIdx++
    })
  }

  // Summary Row (Total Realisasi)
  const totalRow = wsRealisasi.getRow(currentRowIdx)
  totalRow.height = 24
  wsRealisasi.mergeCells(`A${currentRowIdx}:H${currentRowIdx}`)
  totalRow.getCell(1).value = 'TOTAL REALISASI'
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' }
  totalRow.getCell(1).font = boldFont

  if (transactions.length > 0) {
    totalRow.getCell(9).value = { formula: `=SUM(I6:I${currentRowIdx - 1})` }
  } else {
    totalRow.getCell(9).value = 0
  }
  totalRow.getCell(9).numFmt = RUPIAH_FORMAT
  totalRow.getCell(9).font = boldFont
  totalRow.getCell(9).alignment = { vertical: 'middle', horizontal: 'right' }
  totalRow.getCell(10).value = '-'
  totalRow.getCell(10).alignment = { vertical: 'middle', horizontal: 'center' }

  totalRow.eachCell((cell) => {
    cell.fill = totalFill
    cell.border = thinBorder
  })

  // Auto-filter on data table
  wsRealisasi.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: currentRowIdx, column: 10 }
  }

  // =========================================================================
  // WORKSHEET 2: REKAPITULASI AKUN (MATRIKS 12 BULAN)
  // =========================================================================
  const wsRekap = workbook.addWorksheet('Rekapitulasi Akun', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 6 }]
  })

  // Title Block
  wsRekap.mergeCells('A1:T1')
  wsRekap.getCell('A1').value = 'KOMISI PEMILIHAN UMUM PROVINSI SULAWESI UTARA'
  wsRekap.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF991B1B' } }

  wsRekap.mergeCells('A2:T2')
  wsRekap.getCell('A2').value = `REKAPITULASI REALISASI ANGGARAN MENURUT AKUN (MAK) — TA ${tahun}`
  wsRekap.getCell('A2').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1E293B' } }

  wsRekap.mergeCells('A3:T3')
  wsRekap.getCell('A3').value = `Sumber Data: Laporan Agregasi 12 Bulan Resmi PTP-KPU (Status: Verified Sah)`
  wsRekap.getCell('A3').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }

  // Headers
  const rekapHeaders = [
    'No',
    'Kode MAK',
    'Nama Akun Anggaran',
    'Bagian / Divisi',
    'Pagu Aktif (Rp)',
    ...MONTH_NAMES.map((m) => `${m} (Rp)`),
    'Total Realisasi (Rp)',
    'Sisa Anggaran (Rp)',
    'Persentase (%)'
  ]
  const rekapHeaderRow = wsRekap.getRow(5)
  rekapHeaderRow.values = rekapHeaders
  rekapHeaderRow.height = 28
  rekapHeaderRow.eachCell((cell) => {
    cell.fill = headerFill
    cell.font = headerFont
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder
  })

  wsRekap.columns = [
    { key: 'no', width: 6 },
    { key: 'kode', width: 15 },
    { key: 'nama', width: 34 },
    { key: 'bagian', width: 22 },
    { key: 'pagu', width: 22 },
    ...MONTH_NAMES.map(() => ({ width: 18 })),
    { key: 'total_realisasi', width: 22 },
    { key: 'sisa_anggaran', width: 22 },
    { key: 'persentase', width: 15 }
  ]

  let rekapRowIdx = 6
  const reportRows = monthlyReport?.rows || []

  if (reportRows.length === 0) {
    const emptyRow = wsRekap.getRow(rekapRowIdx)
    emptyRow.values = ['-', '-', 'Tidak ada data akun atau pagu anggaran untuk tahun ini', '', '', ...Array(12).fill(0), 0, 0, 0]
    wsRekap.mergeCells(`C${rekapRowIdx}:E${rekapRowIdx}`)
    emptyRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' }
    emptyRow.getCell(3).font = { name: 'Calibri', italic: true, color: { argb: 'FF94A3B8' } }
    rekapRowIdx++
  } else {
    reportRows.forEach((r, idx) => {
      const row = wsRekap.getRow(rekapRowIdx)
      const paguVal = Number(r.pagu || 0)
      const mVals = [
        Number(r.januari || 0),
        Number(r.februari || 0),
        Number(r.maret || 0),
        Number(r.april || 0),
        Number(r.mei || 0),
        Number(r.juni || 0),
        Number(r.juli || 0),
        Number(r.agustus || 0),
        Number(r.september || 0),
        Number(r.oktober || 0),
        Number(r.november || 0),
        Number(r.desember || 0)
      ]
      const totalReal = Number(r.total_realisasi ?? mVals.reduce((a, b) => a + b, 0))
      const sisaVal = Number(r.sisa_anggaran ?? (paguVal - totalReal))
      const pctVal = paguVal > 0 ? totalReal / paguVal : 0

      row.values = [
        idx + 1,
        String(r.kode_akun || ''),
        r.nama_akun || '-',
        r.nama_bagian || '-',
        paguVal,
        ...mVals,
        totalReal,
        sisaVal,
        pctVal
      ]

      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(2).numFmt = '@'
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' }
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'left' }

      // Pagu
      row.getCell(5).numFmt = RUPIAH_FORMAT
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' }

      // 12 Months
      for (let m = 0; m < 12; m++) {
        const c = row.getCell(6 + m)
        c.numFmt = RUPIAH_FORMAT
        c.alignment = { vertical: 'middle', horizontal: 'right' }
      }

      // Total, Sisa, %
      row.getCell(18).numFmt = RUPIAH_FORMAT
      row.getCell(18).alignment = { vertical: 'middle', horizontal: 'right' }
      row.getCell(19).numFmt = RUPIAH_FORMAT
      row.getCell(19).alignment = { vertical: 'middle', horizontal: 'right' }
      row.getCell(20).numFmt = PERCENT_FORMAT
      row.getCell(20).alignment = { vertical: 'middle', horizontal: 'right' }

      row.eachCell((cell) => { cell.border = thinBorder })
      rekapRowIdx++
    })
  }

  // Rekap Total Row
  const rekapTotalRow = wsRekap.getRow(rekapRowIdx)
  rekapTotalRow.height = 24
  wsRekap.mergeCells(`A${rekapRowIdx}:D${rekapRowIdx}`)
  rekapTotalRow.getCell(1).value = 'TOTAL KESELURUHAN'
  rekapTotalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'right' }
  rekapTotalRow.getCell(1).font = boldFont

  const totPagu = Number(monthlyReport?.total?.pagu ?? summary?.total_pagu_aktif ?? 0)
  rekapTotalRow.getCell(5).value = totPagu
  rekapTotalRow.getCell(5).numFmt = RUPIAH_FORMAT
  rekapTotalRow.getCell(5).font = boldFont
  rekapTotalRow.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' }

  for (let m = 0; m < 12; m++) {
    const colLetter = String.fromCharCode(70 + m) // F, G, H, ...
    const cell = rekapTotalRow.getCell(6 + m)
    if (reportRows.length > 0) {
      cell.value = { formula: `=SUM(${colLetter}6:${colLetter}${rekapRowIdx - 1})` }
    } else {
      cell.value = 0
    }
    cell.numFmt = RUPIAH_FORMAT
    cell.font = boldFont
    cell.alignment = { vertical: 'middle', horizontal: 'right' }
  }

  const totReal = Number(monthlyReport?.total?.total_realisasi ?? summary?.total_realisasi_verified ?? 0)
  rekapTotalRow.getCell(18).value = totReal
  rekapTotalRow.getCell(18).numFmt = RUPIAH_FORMAT
  rekapTotalRow.getCell(18).font = boldFont
  rekapTotalRow.getCell(18).alignment = { vertical: 'middle', horizontal: 'right' }

  const totSisa = Number(monthlyReport?.total?.sisa_anggaran ?? summary?.total_sisa_anggaran ?? 0)
  rekapTotalRow.getCell(19).value = totSisa
  rekapTotalRow.getCell(19).numFmt = RUPIAH_FORMAT
  rekapTotalRow.getCell(19).font = boldFont
  rekapTotalRow.getCell(19).alignment = { vertical: 'middle', horizontal: 'right' }

  const totPct = totPagu > 0 ? totReal / totPagu : 0
  rekapTotalRow.getCell(20).value = totPct
  rekapTotalRow.getCell(20).numFmt = PERCENT_FORMAT
  rekapTotalRow.getCell(20).font = boldFont
  rekapTotalRow.getCell(20).alignment = { vertical: 'middle', horizontal: 'right' }

  rekapTotalRow.eachCell((cell) => {
    cell.fill = totalFill
    cell.border = thinBorder
  })

  // Auto filter on rekap
  wsRekap.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: rekapRowIdx, column: 20 }
  }

  // =========================================================================
  // WORKSHEET 3: RINGKASAN EKSEKUTIF
  // =========================================================================
  const wsEksekutif = workbook.addWorksheet('Ringkasan Eksekutif')

  wsEksekutif.mergeCells('A1:F1')
  wsEksekutif.getCell('A1').value = 'KOMISI PEMILIHAN UMUM PROVINSI SULAWESI UTARA'
  wsEksekutif.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF991B1B' } }

  wsEksekutif.mergeCells('A2:F2')
  wsEksekutif.getCell('A2').value = `RINGKASAN EKSEKUTIF PENYERAPAN ANGGARAN — TAHUN ANGGARAN ${tahun}`
  wsEksekutif.getCell('A2').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1E293B' } }

  wsEksekutif.mergeCells('A3:F3')
  wsEksekutif.getCell('A3').value = `Diekspor pada: ${new Date().toLocaleString('id-ID')} | Status: Konsisten dengan Database Aktif`
  wsEksekutif.getCell('A3').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }

  // KPI Macro Table
  wsEksekutif.mergeCells('B5:E5')
  wsEksekutif.getCell('B5').value = 'INDIKATOR KINERJA KEUANGAN (KPI MAKRO)'
  wsEksekutif.getCell('B5').font = boldFont
  wsEksekutif.getCell('B5').alignment = { horizontal: 'center' }
  wsEksekutif.getCell('B5').fill = subHeaderFill

  const kpiData = [
    ['Tahun Anggaran', `${tahun}`],
    ['Total Pagu Aktif DIPA', totPagu, RUPIAH_FORMAT],
    ['Total Realisasi Terverifikasi Sah', totReal, RUPIAH_FORMAT],
    ['Sisa Anggaran Kas', totSisa, RUPIAH_FORMAT],
    ['Persentase Penyerapan Anggaran', totPct, PERCENT_FORMAT],
    ['Jumlah Transaksi Tercatat', transactions.length, '#,##0']
  ]

  let kpiRowIdx = 6
  kpiData.forEach(([label, val, fmt]) => {
    const row = wsEksekutif.getRow(kpiRowIdx)
    wsEksekutif.mergeCells(`B${kpiRowIdx}:C${kpiRowIdx}`)
    row.getCell(2).value = label
    row.getCell(2).font = { name: 'Calibri', bold: true }
    row.getCell(2).border = thinBorder

    wsEksekutif.mergeCells(`D${kpiRowIdx}:E${kpiRowIdx}`)
    row.getCell(4).value = val
    if (fmt) row.getCell(4).numFmt = String(fmt)
    row.getCell(4).alignment = { horizontal: fmt ? 'right' : 'center' }
    row.getCell(4).font = { name: 'Calibri', bold: true, color: { argb: 'FF991B1B' } }
    row.getCell(4).border = thinBorder

    kpiRowIdx++
  })

  // Monthly Breakdown Summary Table
  kpiRowIdx += 2
  wsEksekutif.mergeCells(`B${kpiRowIdx}:E${kpiRowIdx}`)
  wsEksekutif.getCell(`B${kpiRowIdx}`).value = 'REALISASI BELANJA MENURUT BULAN'
  wsEksekutif.getCell(`B${kpiRowIdx}`).font = boldFont
  wsEksekutif.getCell(`B${kpiRowIdx}`).alignment = { horizontal: 'center' }
  wsEksekutif.getCell(`B${kpiRowIdx}`).fill = subHeaderFill

  kpiRowIdx++
  const mHeadRow = wsEksekutif.getRow(kpiRowIdx)
  mHeadRow.values = ['', 'Bulan', 'Nama Periode', 'Realisasi (Rp)', 'Kontribusi (%)']
  mHeadRow.getCell(2).fill = headerFill
  mHeadRow.getCell(2).font = headerFont
  mHeadRow.getCell(2).border = thinBorder
  mHeadRow.getCell(3).fill = headerFill
  mHeadRow.getCell(3).font = headerFont
  mHeadRow.getCell(3).border = thinBorder
  mHeadRow.getCell(4).fill = headerFill
  mHeadRow.getCell(4).font = headerFont
  mHeadRow.getCell(4).border = thinBorder
  mHeadRow.getCell(5).fill = headerFill
  mHeadRow.getCell(5).font = headerFont
  mHeadRow.getCell(5).border = thinBorder

  kpiRowIdx++
  const monthlyTotals = MONTH_NAMES.map((mName, mIdx) => {
    let sumMonth = 0
    if (reportRows.length > 0) {
      const key = mName.toLowerCase() as keyof typeof reportRows[0]
      sumMonth = reportRows.reduce((acc, curr) => acc + Number(curr[key] || 0), 0)
    }
    return { idx: mIdx + 1, name: mName, total: sumMonth }
  })

  monthlyTotals.forEach((mItem) => {
    const row = wsEksekutif.getRow(kpiRowIdx)
    const mContrib = totReal > 0 ? mItem.total / totReal : 0
    row.values = ['', mItem.idx, mItem.name, mItem.total, mContrib]

    row.getCell(2).alignment = { horizontal: 'center' }
    row.getCell(2).border = thinBorder
    row.getCell(3).alignment = { horizontal: 'left' }
    row.getCell(3).border = thinBorder
    row.getCell(4).numFmt = RUPIAH_FORMAT
    row.getCell(4).alignment = { horizontal: 'right' }
    row.getCell(4).border = thinBorder
    row.getCell(5).numFmt = PERCENT_FORMAT
    row.getCell(5).alignment = { horizontal: 'right' }
    row.getCell(5).border = thinBorder

    kpiRowIdx++
  })

  wsEksekutif.columns = [
    { width: 4 },
    { width: 12 },
    { width: 25 },
    { width: 25 },
    { width: 20 },
    { width: 10 }
  ]

  // =========================================================================
  // FILE DOWNLOAD TRIGGER (BINARY EXCEL BLOB)
  // =========================================================================
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })

  const sanitizeName = (str: string) => str.replace(/[^a-zA-Z0-9_-]/g, '_')
  const periodeFileName = bulan && bulan >= 1 && bulan <= 12
    ? `Bulan_${MONTH_NAMES[bulan - 1]}`
    : 'Semua_Bulan'
  const bagianFileName = namaBagian ? `_${sanitizeName(namaBagian)}` : ''
  const fileName = `Laporan_Realisasi_Anggaran_TA${tahun}_${periodeFileName}${bagianFileName}.xlsx`

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
