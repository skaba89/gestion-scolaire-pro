import hmac
import hashlib
import base64
import json
import time
import sys
import os

# SECURITY: JWT_SECRET is required — no insecure fallback
secret = os.environ.get('JWT_SECRET')
if not secret or secret.startswith('your-') or len(secret) < 32:
    print("ERROR: JWT_SECRET environment variable is required (min 32 chars).", file=sys.stderr)
    sys.exit(1)

def generate_token(role, expiry_years=1):
    """Generate a JWT token for the given role.

    SECURITY: Default expiry reduced from 10 years to 1 year.
    Tokens should be rotated annually at minimum.
    """
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "role": role,
        "iss": "supabase",
        "iat": int(time.time()),
        "exp": int(time.time()) + (expiry_years * 365 * 24 * 60 * 60)
    }

    encoded_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    encoded_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")

    signature = hmac.new(
        secret.encode(),
        f"{encoded_header}.{encoded_payload}".encode(),
        hashlib.sha256
    ).digest()

    encoded_signature = base64.urlsafe_b64encode(signature).decode().rstrip("=")

    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"

# Use 1-year expiry (down from 10 years)
print(f"ANON_KEY={generate_token('anon', expiry_years=1)}")
print(f"SERVICE_ROLE_KEY={generate_token('service_role', expiry_years=1)}")
