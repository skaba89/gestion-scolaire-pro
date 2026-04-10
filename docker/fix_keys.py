import hmac
import hashlib
import base64
import json
import time
import os
import re

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

# Update .env.docker
with open(env_path, 'r') as f:
    lines = f.readlines()

with open(env_path, 'w') as f:
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
        else:
            f.write(line)

print(f"Fichier {env_path} mis à jour.")

# Update kong.yml
if os.path.exists(kong_path):
    with open(kong_path, 'r') as f:
        content = f.read()
    
    # Replace the keys for anon and service_role consumers
    # We look for the username and then the next key: value
    
    # 1. Update anon
    anon_pattern = r'(username: anon\s+keyauth_credentials:\s+- key: )[^\s\n]+'
    content = re.sub(anon_pattern, r'\1' + anon_key, content)
    
    # 2. Update service_role
    service_pattern = r'(username: service_role\s+keyauth_credentials:\s+- key: )[^\s\n]+'
    content = re.sub(service_pattern, r'\1' + service_key, content)
    
    with open(kong_path, 'w') as f:
        f.write(content)
    print(f"Fichier {kong_path} mis à jour.")
else:
    print(f"Fichier {kong_path} non trouvé.")

print("\n--- NOUVELLES CLÉS ---")
print(f"ANON_KEY: {anon_key}")
print(f"SERVICE_ROLE_KEY: {service_key}")
print("----------------------\n")
print("CONSEIL: Redémarrez vos containers (docker compose restart) et rafraîchissez le cache de PostgREST.")
