import test from 'node:test'
import assert from 'node:assert/strict'
import { isFullBudgetUser } from '../src/app/context/AuthContext'
import {
  decimalToEditableString,
  formatCurrencyInput,
  parseCurrencyValue,
  sanitizeCurrencyInput,
  derivePeriodeFromDate,
} from '../src/utils/currency'
import { extractDownloadFilename } from '../src/services/operations'

test('Subbagian Keuangan (BAG-06) has full budget access matching backend RBAC', () => {
  const keuanganStaff = {
    id_pegawai: 10,
    name: 'Staf Keuangan',
    nip: '19900101',
    role: 'Pegawai' as const,
    jabatan: 'Analis Keuangan',
    subbagian: 'Subbagian Keuangan',
    id_bagian: 6,
  }
  assert.equal(isFullBudgetUser(keuanganStaff), true)
})

test('Non-finance Kabag SDM/Humas does NOT get full budget admin access', () => {
  const kabagSdm = {
    id_pegawai: 11,
    name: 'Kabag SDM',
    nip: '19850101',
    role: 'Pegawai' as const,
    jabatan: 'Kepala Bagian SDM dan Partisipasi Masyarakat',
    subbagian: 'Subbagian SDM dan Partisipasi Masyarakat',
    id_bagian: 1,
  }
  assert.equal(isFullBudgetUser(kabagSdm), false)
})

test('Subbagian RENDATIN (BAG-02) has full budget access', () => {
  const rendatinStaff = {
    id_pegawai: 12,
    name: 'Staf RENDATIN',
    nip: '19920101',
    role: 'Pegawai' as const,
    jabatan: 'Staf RENDATIN',
    subbagian: 'Subbagian RENDATIN (Perencanaan, Data dan Informasi)',
    id_bagian: 2,
  }
  assert.equal(isFullBudgetUser(rendatinStaff), true)
})

test('Currency helpers never multiply backend decimal strings by 100x', () => {
  assert.equal(decimalToEditableString('50000000.00'), '50000000')
  assert.equal(formatCurrencyInput('50000000.00'), '50.000.000')
  assert.equal(parseCurrencyValue('50000000.00'), 50000000)
  assert.equal(decimalToEditableString('125.25'), '125,25')
  assert.equal(formatCurrencyInput('125.25'), '125,25')
  assert.equal(parseCurrencyValue('125,25'), 125.25)
  assert.equal(parseCurrencyValue(sanitizeCurrencyInput('50.000.000,75')), 50000000.75)
  assert.match(derivePeriodeFromDate('2026-03-15'), /2026/)
})

test('extractDownloadFilename preserves extension from Content-Disposition', () => {
  assert.equal(
    extractDownloadFilename('attachment; filename="Laporan_KPU.pdf"', 'Laporan KPU'),
    'Laporan_KPU.pdf',
  )
  assert.equal(
    extractDownloadFilename("attachment; filename*=UTF-8''Surat%20Resmi.docx", 'fallback'),
    'Surat Resmi.docx',
  )
  assert.equal(extractDownloadFilename(null, 'fallback.xlsx'), 'fallback.xlsx')
})
