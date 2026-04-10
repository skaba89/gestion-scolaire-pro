import hmac
import hashlib
import base64
import json
import time

import os
secret = os.environ.get('JWT_SECRET', 'your-super-secret-jwt-token-with-at-least-32-characters-long')

def generate_token(role):
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "role": role,
        "iss": "supabase",
        "iat": int(time.time()),
        "exp": int(time.time()) + (10 * 365 * 24 * 60 * 60) # 10 years
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

print(f"ANON_KEY={generate_token('anon')}")
print(f"SERVICE_ROLE_KEY={generate_token('service_role')}")
