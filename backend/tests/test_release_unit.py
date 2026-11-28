import unittest
import hashlib
from app.core.passwords import hash_password, verify_password
from app.core.workflow import transition

class PasswordTests(unittest.TestCase):
    def test_defaults_are_not_universal(self):
        stored = hash_password('private-password')
        for candidate in ['admin123', '123456', 'password', 'wrong']:
            self.assertFalse(verify_password(candidate, stored))
        self.assertTrue(verify_password('private-password', stored))

    def test_legacy_credentials_and_salts(self):
        for value in ['admin123', '123456']:
            for stored in [value, 'hash_' + value, hashlib.sha256(value.encode()).hexdigest()]:
                self.assertTrue(verify_password(value, stored))
                self.assertFalse(verify_password('incorrect', stored))
        self.assertNotEqual(hash_password('same'), hash_password('same'))
        self.assertFalse(verify_password('x', 'pbkdf2_sha256$bad$salt$digest'))

class WorkflowTests(unittest.TestCase):
    def test_outgoing_revision_lifecycle(self):
        state = 'draft'
        for action, admin, expected in [('submit',False,'submitted'),('revise',True,'revision'),
                ('edit',False,'revision'),('submit',False,'submitted'),('approve',True,'approved'),('archive',False,'archived')]:
            state = transition(state, action, admin, False)
            self.assertEqual(state, expected)
        with self.assertRaises(ValueError): transition(state, 'edit', True, False)

    def test_permissions_and_incoming_lifecycle(self):
        for action, state in [('approve','submitted'),('assign','registered'),('revise','submitted')]:
            with self.assertRaises(PermissionError): transition(state, action, False, False)
        with self.assertRaises(PermissionError): transition('assigned', 'complete', False, False)
        self.assertEqual(transition('assigned','complete',False,True), 'completed')
        with self.assertRaises(ValueError): transition('draft','archive',True,False)

if __name__ == '__main__': unittest.main()

class AuthorityTests(unittest.TestCase):
    def test_explicit_documented_time_limited_grant(self):
        from app.core.authority import has_authority
        from datetime import date
        grant={'pegawai_id':1,'action':'number_official_letter','document_reference':'TEST assignment', 'valid_from':'2026-01-01','valid_until':'2026-12-31'}
        self.assertTrue(has_authority([grant],1,'number_official_letter',date(2026,6,1)))
        self.assertFalse(has_authority([grant],2,'number_official_letter',date(2026,6,1)))
        self.assertFalse(has_authority([grant],1,'sign',date(2026,6,1)))
        self.assertFalse(has_authority([grant],1,'number_official_letter',date(2027,1,1)))
        self.assertFalse(has_authority([],1,'number_official_letter'))
        self.assertFalse(has_authority([{}],1,'number_official_letter'))
