"""Real MySQL dumps plus immutable uploaded files, with per-file integrity checks."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy.engine import make_url
from app.core.config import settings

ROOT = Path(__file__).resolve().parents[2]
BACKUPS = (ROOT / 'backups').resolve()
UPLOADS = (ROOT / settings.UPLOAD_DIR).resolve()


def digest(path):
    with open(path, 'rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def mysql_command(tool, url):
    executable = shutil.which(tool)
    if not executable:
        raise RuntimeError(f'{tool} executable is not installed')
    return [executable, '--host', url.host or 'localhost', '--port', str(url.port or 3306),
            '--user', url.username or '', '--protocol=TCP']


def create_backup():
    BACKUPS.mkdir(parents=True, exist_ok=True, mode=0o700)
    url = make_url(settings.DATABASE_URL)
    if not url.drivername.startswith('mysql') or not url.database:
        raise RuntimeError('Backup supports MySQL only')
    name = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid4().hex[:12] + '.zip'
    target = BACKUPS / name
    try:
        with tempfile.TemporaryDirectory(dir=BACKUPS) as tmp:
            sql = Path(tmp) / 'database.sql'
            env = {**os.environ, 'MYSQL_PWD': url.password or ''}
            with sql.open('wb') as output:
                result = subprocess.run(mysql_command('mysqldump', url) + ['--single-transaction', '--quick',
                    '--skip-lock-tables', '--no-tablespaces', '--hex-blob', url.database],
                    stdout=output, stderr=subprocess.PIPE, env=env, timeout=600)
            if result.returncode:
                raise RuntimeError('Database dump failed; check database permissions and client/server compatibility')
            entries = {'database.sql': sql}
            if UPLOADS.exists():
                for path in UPLOADS.rglob('*'):
                    if path.is_file() and not path.is_symlink():
                        entries['uploads/' + path.relative_to(UPLOADS).as_posix()] = path
            manifest = {'format': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
                        'database': url.database, 'sha256': {n: digest(p) for n, p in entries.items()}}
            partial = Path(tmp) / name
            with zipfile.ZipFile(partial, 'w', zipfile.ZIP_DEFLATED) as archive:
                for n, path in entries.items(): archive.write(path, n)
                archive.writestr('manifest.json', json.dumps(manifest))
            partial.chmod(0o600)
            partial.replace(target)
        return {'name': name, 'size': target.stat().st_size}
    except Exception:
        target.unlink(missing_ok=True)
        raise


def restore_backup(archive_path, target_url, uploads_target):
    """Restore only to an empty, separately provisioned database and new directory."""
    import pymysql
    source = make_url(settings.DATABASE_URL)
    dest = make_url(target_url)
    if not dest.drivername.startswith('mysql'):
        raise RuntimeError('Restore requires a MySQL target')
    if not dest.database or (dest.host, dest.port, dest.database) == (source.host, source.port, source.database):
        raise RuntimeError('Restore requires a separate empty database')
    destination = Path(uploads_target).resolve()
    if destination.exists():
        raise RuntimeError('Restore uploads destination must not exist')
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(archive_path) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        hashes = manifest['sha256']
        names = archive.namelist()
        if len(names) != len(set(names)) or set(names) != set(hashes) | {'manifest.json'} or 'database.sql' not in hashes:
            raise RuntimeError('Invalid backup inventory')
        for name, expected in hashes.items():
            path = Path(name)
            if path.is_absolute() or '..' in path.parts or (name != 'database.sql' and not name.startswith('uploads/')):
                raise RuntimeError('Invalid backup path')
            target = Path(tmp) / path
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(name) as src, target.open('wb') as out: shutil.copyfileobj(src, out)
            if digest(target) != expected: raise RuntimeError('Backup checksum mismatch')
        conn = pymysql.connect(host=dest.host or 'localhost', port=dest.port or 3306,
            user=dest.username, password=dest.password or '', database=dest.database)
        try:
            with conn.cursor() as cursor:
                cursor.execute('SHOW TABLES')
                if cursor.fetchone(): raise RuntimeError('Restore target database must be empty')
        finally: conn.close()
        with (Path(tmp) / 'database.sql').open('rb') as data:
            result = subprocess.run(mysql_command('mysql', dest) + [dest.database], stdin=data,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                env={**os.environ, 'MYSQL_PWD': dest.password or ''}, timeout=600)
        if result.returncode: raise RuntimeError('Restore failed; discard the partial target database before retrying')
        shutil.copytree(Path(tmp) / 'uploads', destination) if (Path(tmp) / 'uploads').exists() else destination.mkdir(parents=True)
