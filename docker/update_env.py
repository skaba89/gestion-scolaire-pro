import hmac
import hashlib
import base64
import json
import time
import os

env_path = '.env.docker'
kong_path = 'docker/kong.yml'

def get_secret():
    with open(env_path, 'r') as f:
        for line in f:
            if line.startswith('JWT_SECRET='):
                return line.split('=')[1].strip()
    return None

secret = get_secret()
if not secret:
    print("JWT_SECRET non trouvé dans .env.docker")
    exit(1)

def generate_token(role):
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "role": role,
        "iss": "supabase",
        "iat": int(time.time()),
        "exp": int(time.time()) + (10 * 365 * 24 * 60 * 60) # 10 years
    }
    
    # Use compact separators to avoid spaces
    encoded_header = base64.urlsafe_b64encode(json.dumps(header, separators=(',', ':')).encode()).decode().rstrip("=")
    encoded_payload = base64.urlsafe_b64encode(json.dumps(payload, separators=(',', ':')).encode()).decode().rstrip("=")
    
    signature = hmac.new(
        secret.encode(),
        f"{encoded_header}.{encoded_payload}".encode(),
        hashlib.sha256
    ).digest()
    
    encoded_signature = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    
    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"

anon_key = generate_token('anon')
service_key = generate_token('service_role')

# Update both .env.docker and .env
for path in [env_path, '.env']:
    if not os.path.exists(path):
        continue
        
    with open(path, 'r') as f:
        lines = f.readlines()

    with open(path, 'w') as f:
        for line in lines:
            if line.startswith('ANON_KEY='):
                f.write(f'ANON_KEY={anon_key}\n')
            elif line.startswith('SERVICE_ROLE_KEY='):
                f.write(f'SERVICE_ROLE_KEY={service_key}\n')
            elif line.startswith('SUPABASE_ANON_KEY='):
                f.write(f'SUPABASE_ANON_KEY={anon_key}\n')
            elif line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
                f.write(f'SUPABASE_SERVICE_ROLE_KEY={service_key}\n')
            elif line.startswith('VITE_SUPABASE_ANON_KEY='):
                f.write(f'VITE_SUPABASE_ANON_KEY={anon_key}\n')
            elif line.startswith('VITE_SUPABASE_PUBLISHABLE_KEY='):
                f.write(f'VITE_SUPABASE_PUBLISHABLE_KEY="{anon_key}"\n')
            else:
                f.write(line)
    print(f"Fichier {path} mis à jour avec des clés compactes.")

if os.path.exists(kong_path):
    with open(kong_path, 'r') as f:
        content = f.read()
    
    # Simple replacement of ${VAR} style placeholders or old keys
    # To be safe, we look for the specific pattern in kong.yml
    import re
    content = re.sub(r'key: \$\{SUPABASE_ANON_KEY\}', f'key: {anon_key}', content)
    content = re.sub(r'key: \$\{SUPABASE_SERVICE_ROLE_KEY\}', f'key: {service_key}', content)
    
    # Also handle if they were already replaced by older keys
    # This is trickier, so maybe we use a marker if needed.
    # For now, let's assume we can find the previous pattern or hardcode a placeholder in kong.yml first.
    
    with open(kong_path, 'w') as f:
        f.write(content)
    print("Fichier docker/kong.yml mis à jour.")
else:
    print("Fichier docker/kong.yml non trouvé.")
