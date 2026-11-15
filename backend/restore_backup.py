"""Restore a trusted server-created backup into a NEW, empty MySQL database."""
import argparse
import os
from app.services.backups import restore_backup

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive')
    parser.add_argument('--uploads-target', required=True)
    args = parser.parse_args()
    target = os.environ.get('RESTORE_DATABASE_URL')
    if not target: parser.error('Set RESTORE_DATABASE_URL to a separately provisioned empty database')
    restore_backup(args.archive, target, args.uploads_target)
    print('Restore completed. Validate the restored instance before switching production configuration.')
