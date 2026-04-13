import hmac
import hashlib
import base64
import sys

def verify_jwt(token, secret):
    try:
        header_b64, payload_b64, signature_b64 = token.split('.')

        def decode_base64(data):
            missing_padding = len(data) % 4
            if missing_padding:
                data += '=' * (4 - missing_padding)
            return base64.urlsafe_b64decode(data)

        expected_signature = hmac.new(
            secret.encode(),
            f"{header_b64}.{payload_b64}".encode(),
            hashlib.sha256
        ).digest()

        actual_signature = decode_base64(signature_b64)

        return hmac.compare_digest(expected_signature, actual_signature)
    except Exception as e:
        return f"Error: {str(e)}"

# Read from .env.docker
env_path = '.env.docker'
secret = None
anon_key = None
supabase_anon_key = None

with open(env_path, 'r') as f:
    for line in f:
        if line.startswith('JWT_SECRET='):
            secret = line.split('=')[1].strip()
        elif line.startswith('ANON_KEY='):
            anon_key = line.split('=')[1].strip()
        elif line.startswith('SUPABASE_ANON_KEY='):
            supabase_anon_key = line.split('=')[1].strip()

# SECURITY: Do not print full secrets — only first 20 chars for verification
print(f"JWT_SECRET: {'***set***' if secret else '***MISSING***'}")
print(f"ANON_KEY: {anon_key[:20] + '...' if anon_key else '***MISSING***'}")
print(f"SUPABASE_ANON_KEY: {supabase_anon_key[:20] + '...' if supabase_anon_key else '***MISSING***'}")

print("\n--- VERIFICATION ---")
if secret and anon_key:
    is_valid = verify_jwt(anon_key, secret)
    print(f"ANON_KEY valid for secret: {is_valid}")
else:
    print("Missing secret or anon_key")

if secret and supabase_anon_key:
    is_valid = verify_jwt(supabase_anon_key, secret)
    print(f"SUPABASE_ANON_KEY valid for secret: {is_valid}")
else:
    print("Missing secret or supabase_anon_key")
