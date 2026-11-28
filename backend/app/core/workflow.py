"""Workflow transitions, independent of storage and HTTP."""
TRANSITIONS = {
    'submit': ({'draft', 'revision'}, 'submitted'),
    'revise': ({'submitted'}, 'revision'),
    'approve': ({'submitted'}, 'approved'),
    'assign': ({'registered', 'assigned'}, 'assigned'),
    'complete': ({'assigned'}, 'completed'),
    'archive': ({'approved', 'completed'}, 'archived'),
    'edit': ({'draft', 'revision'}, None),
}

def transition(status, action, admin, is_assignee):
    if action not in TRANSITIONS:
        raise ValueError('Unknown action')
    if action in {'approve', 'revise', 'assign'} and not admin:
        raise PermissionError('Administrator required')
    if action == 'complete' and not (admin or is_assignee):
        raise PermissionError('Assignee required')
    allowed, target = TRANSITIONS[action]
    if status not in allowed:
        raise ValueError('Invalid state transition')
    return target or status
