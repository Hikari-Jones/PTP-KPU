"""Exercise archive IO and integrity checks with mocked MySQL client processes."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile

os.environ.setdefault('SECRET_KEY', 'unit-test-only-secret-not-for-production-12345')
spec = importlib.util.spec_from_file_location('backup_service', Path(__file__).resolve().parents[1] / 'app/services/backups.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

class Backups(unittest.TestCase):
    def test_real_zip_contents_and_checksums(self):
        with tempfile.TemporaryDirectory() as tmp:
            uploads=Path(tmp)/'uploads';uploads.mkdir();(uploads/'example.pdf').write_bytes(b'example content')
            def dump(cmd, **kwargs):
                kwargs['stdout'].write(b'CREATE TABLE sample(id INTEGER);')
                return types.SimpleNamespace(returncode=0)
            with patch.object(backup,'BACKUPS',Path(tmp)/'backups'),patch.object(backup,'UPLOADS',uploads),patch.object(backup,'mysql_command',return_value=['mysqldump']),patch.object(backup.subprocess,'run',side_effect=dump):
                result=backup.create_backup()
                with zipfile.ZipFile(Path(tmp)/'backups'/result['name']) as z:
                    manifest=json.loads(z.read('manifest.json'))
                    import hashlib
                    for name,digest in manifest['sha256'].items():
                        self.assertEqual(hashlib.sha256(z.read(name)).hexdigest(),digest)
                    self.assertEqual(z.read('uploads/example.pdf'),b'example content')

    def test_failed_dump_never_publishes_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(backup,'BACKUPS',Path(tmp)),patch.object(backup,'mysql_command',return_value=['mysqldump']),patch.object(backup.subprocess,'run',return_value=types.SimpleNamespace(returncode=1)):
                with self.assertRaises(RuntimeError): backup.create_backup()
                self.assertEqual(list(Path(tmp).glob('*.zip')),[])

    def test_restore_rejects_live_database(self):
        with self.assertRaises(RuntimeError):
            backup.restore_backup('unused.zip', backup.settings.DATABASE_URL, '/unused')

    def test_restore_rejects_tampered_archive_before_mysql(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'bad.zip'
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('database.sql','tampered')
                z.writestr('manifest.json',json.dumps({'sha256':{'database.sql':'bad'}}))
            with patch.object(backup.subprocess,'run') as client:
                with self.assertRaisesRegex(RuntimeError,'checksum'):
                    backup.restore_backup(path,'mysql+pymysql://test@localhost/isolated_restore',Path(tmp)/'new')
                client.assert_not_called()

if __name__ == '__main__': unittest.main()
