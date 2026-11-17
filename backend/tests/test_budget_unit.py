"""Input-contract regressions; database workflow tests live in integration_release.py."""
import unittest
from decimal import Decimal
from pydantic import ValidationError
from app.schemas.anggaran import (RealisasiAnggaranCreate, RealisasiAnggaranUpdateDraft,
                                  RealisasiAnggaranReject)
from app.schemas.arsip import DokumenArsipUpdate

class BudgetInputTests(unittest.TestCase):
    def payload(self, **changes):
        payload = dict(id_pagu=1, tanggal_transaksi='2026-11-16', nomor_dokumen=' INV-001 ',
                       uraian_kegiatan=' Test supplies ', jumlah_realisasi='125.25')
        payload.update(changes)
        return payload

    def test_decimal_exact_and_trimmed(self):
        row = RealisasiAnggaranCreate(**self.payload())
        self.assertEqual(row.jumlah_realisasi, Decimal('125.25'))
        self.assertEqual(row.nomor_dokumen, 'INV-001')
        self.assertEqual(row.uraian_kegiatan, 'Test supplies')

    def test_invalid_amounts_never_silently_round(self):
        for value in ['0', '-1', '0.001', 'NaN', 'Infinity', '10000000000000000']:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                RealisasiAnggaranCreate(**self.payload(jumlah_realisasi=value))

    def test_blank_document_and_reason_are_invalid(self):
        for field in ['nomor_dokumen', 'uraian_kegiatan']:
            with self.assertRaises(ValidationError):
                RealisasiAnggaranCreate(**self.payload(**{field:'   '}))
        with self.assertRaises(ValidationError):
            RealisasiAnggaranReject(catatan_verifikasi='   ')

    def test_dates_and_update_precision(self):
        with self.assertRaises(ValidationError):
            RealisasiAnggaranCreate(**self.payload(tanggal_transaksi='2026-02-30'))
        with self.assertRaises(ValidationError):
            RealisasiAnggaranUpdateDraft(jumlah_realisasi='1.001')

    def test_archive_update_rejects_unknown_access_labels(self):
        with self.assertRaises(ValidationError):
            DokumenArsipUpdate(hak_akses='unrecognized-public-bypass')

if __name__ == '__main__': unittest.main()
