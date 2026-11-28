"""Run reproducible release checks without installing packages or touching operational data."""
import argparse
import ast
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--quick', action='store_true', help='Only Python syntax and backend unit tests')
parser.add_argument('--integration', action='store_true', help='Also run guarded empty-MySQL integration test')
parser.add_argument('--smoke', action='store_true', help='Also run the every-route smoke test (needs its own EMPTY _test database)')
args = parser.parse_args()
_venv = next((ROOT / c for c in ('venv/bin/python', 'venv/Scripts/python.exe') if (ROOT / c).exists()), None)
python = os.environ.get('PTP_PYTHON', str(_venv) if _venv else sys.executable)
results = []

def check(name, command, cwd, timeout=300):
    try:
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        entry = dict(name=name, status='passed' if result.returncode == 0 else 'failed',
                     exit_code=result.returncode, output=(result.stdout + result.stderr)[-16000:])
    except (OSError, subprocess.TimeoutExpired) as exc:
        entry = dict(name=name, status='blocked', output=str(exc))
    results.append(entry)
    print(name + ': ' + entry['status'], flush=True)

try:
    files = list((ROOT/'backend').rglob('*.py')) + list((ROOT/'scripts').glob('*.py'))
    for path in files: ast.parse(path.read_text(encoding='utf-8-sig'), filename=str(path))
    results.append(dict(name='python_syntax', status='passed', files=len(files)))
except (SyntaxError, UnicodeError) as exc:
    results.append(dict(name='python_syntax', status='failed', output=str(exc)))
check('backend_units', [python, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*unit.py', '-v'], ROOT/'backend')
if not args.quick:
    check('frontend_build', ['npm', 'run', 'build'], ROOT/'frontend')
    check('frontend_lint', ['npm', 'run', 'lint'], ROOT/'frontend')
    check('frontend_tests', ['npm', 'test'], ROOT/'frontend')
    check('backend_runtime_import', [python, '-c', 'import sqlalchemy.ext.asyncio; from app.main import app'], ROOT/'backend')
if args.integration:
    check('mysql_integration', [python, 'tests/integration_release.py'], ROOT/'backend', 600)
if args.smoke:
    check('smoke_all_routes', [python, 'tests/smoke_all_routes.py'], ROOT/'backend', 600)
report = ROOT/'reports/automated-checks.json'
report.parent.mkdir(exist_ok=True)
report.write_text(json.dumps({'at_utc':datetime.now(timezone.utc).isoformat(), 'quick':args.quick, 'checks':results}, indent=2))
print('Report: ' + str(report))
sys.exit(0 if all(row['status'] == 'passed' for row in results) else 1)
