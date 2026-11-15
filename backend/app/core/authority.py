"""Deployment-supplied authority evidence; administrator status alone is insufficient.
This gate is not a complete implementation of the KPU signing matrix.
"""
from datetime import date

def has_authority(grants, user_id, action, today=None):
    today = today or date.today()
    for grant in grants:
        try:
            if (grant['pegawai_id'] == user_id and grant['action'] == action
                and grant['document_reference'].strip()
                and date.fromisoformat(grant['valid_from']) <= today <= date.fromisoformat(grant['valid_until'])):
                return True
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
    return False
