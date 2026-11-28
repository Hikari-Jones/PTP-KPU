"""Password hashing with legacy verification for existing seeded accounts."""
import hashlib
import hmac
import secrets

PREFIX = "pbkdf2_sha256"
ITERATIONS = 600_000

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), ITERATIONS).hex()
    return f"{PREFIX}${ITERATIONS}${salt}${digest}"

def verify_password(password: str, stored: str) -> bool:
    if not stored:
        return False
    if stored.startswith(PREFIX + "$"):
        try:
            _, rounds, salt, expected = stored.split("$")
            if not 100_000 <= int(rounds) <= 2_000_000:
                return False
            actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds)).hex()
            return hmac.compare_digest(actual, expected)
        except (ValueError, TypeError):
            return False
    if len(stored) == 64 and all(c in "0123456789abcdef" for c in stored):
        return hmac.compare_digest(hashlib.sha256(password.encode()).hexdigest(), stored)
    if stored.startswith("hash_"):
        return hmac.compare_digest(stored, "hash_" + password)
    if stored.startswith("$"):
        return False
    return hmac.compare_digest(stored.encode(), password.encode())
