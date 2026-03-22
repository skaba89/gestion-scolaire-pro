"""
SchoolFlow Pro — Keycloak test users setup
Creates all E2E test users in the 'schoolflow' realm with fixed UUIDs.
Run AFTER the SQL seed (users table must exist).

Usage:
    python tests/setup-keycloak.py
"""
import time
import sys
import requests

KEYCLOAK_URL   = "http://localhost:8080"
REALM          = "schoolflow"
ADMIN_USER     = "admin"
ADMIN_PASSWORD = "admin"

# ─── Test users ───────────────────────────────────────────────────────────────
# id must match keycloak_id in seed.sql

USERS = [
    {
        "id":        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "email":     "admin@test.local",
        "username":  "admin_test",
        "firstName": "Admin",
        "lastName":  "Test",
        "password":  "Password123!",
        "tenant_id": "11111111-1111-1111-1111-111111111111",
        "roles":     ["TENANT_ADMIN"],
    },
    {
        "id":        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "email":     "teacher@test.local",
        "username":  "teacher_test",
        "firstName": "Jean",
        "lastName":  "Dupont",
        "password":  "Password123!",
        "tenant_id": "11111111-1111-1111-1111-111111111111",
        "roles":     ["TEACHER"],
    },
    {
        "id":        "cccccccc-cccc-cccc-cccc-cccccccccccc",
        "email":     "parent@test.local",
        "username":  "parent_test",
        "firstName": "Marie",
        "lastName":  "Dupont",
        "password":  "Password123!",
        "tenant_id": "11111111-1111-1111-1111-111111111111",
        "roles":     ["PARENT"],
    },
    {
        "id":        "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "email":     "student@test.local",
        "username":  "student_test",
        "firstName": "Pierre",
        "lastName":  "Dupont",
        "password":  "Password123!",
        "tenant_id": "11111111-1111-1111-1111-111111111111",
        "roles":     ["STUDENT"],
    },
    {
        "id":        "ee000000-0000-0000-0000-000000000001",
        "email":     "admin@sorbonne.fr",
        "username":  "admin_sorbonne",
        "firstName": "Admin",
        "lastName":  "Sorbonne",
        "password":  "Password123!",
        "tenant_id": "22222222-2222-2222-2222-222222222222",
        "roles":     ["TENANT_ADMIN"],
    },
    {
        "id":        "ee000000-0000-0000-0000-000000000002",
        "email":     "prof.martin@sorbonne.fr",
        "username":  "prof_martin",
        "firstName": "Martin",
        "lastName":  "Prof",
        "password":  "Password123!",
        "tenant_id": "22222222-2222-2222-2222-222222222222",
        "roles":     ["TEACHER"],
    },
]


def wait_for_keycloak(max_wait: int = 120):
    """Poll Keycloak until it's ready."""
    url = f"{KEYCLOAK_URL}/realms/master"
    print(f"⏳ Waiting for Keycloak at {url}...")
    for i in range(max_wait):
        try:
            r = requests.get(url, timeout=3)
            if r.status_code == 200:
                print("✅ Keycloak is ready!")
                return
        except requests.exceptions.ConnectionError:
            pass
        time.sleep(1)
        if i % 10 == 9:
            print(f"   Still waiting... ({i+1}s)")
    raise TimeoutError(f"Keycloak not ready after {max_wait}s. Is it running?")


def get_admin_token() -> str:
    """Obtain an admin access token from the master realm."""
    r = requests.post(
        f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
        data={
            "grant_type":    "password",
            "client_id":     "admin-cli",
            "username":      ADMIN_USER,
            "password":      ADMIN_PASSWORD,
        },
        timeout=10,
    )
    r.raise_for_status()
    token = r.json()["access_token"]
    print("✅ Admin token obtained.")
    return token


def ensure_realm_roles(token: str, roles: list[str]):
    """Create realm roles if they don't exist."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    for role in roles:
        r = requests.get(
            f"{KEYCLOAK_URL}/admin/realms/{REALM}/roles/{role}",
            headers=headers, timeout=5,
        )
        if r.status_code == 404:
            requests.post(
                f"{KEYCLOAK_URL}/admin/realms/{REALM}/roles",
                headers=headers,
                json={"name": role},
                timeout=5,
            ).raise_for_status()
            print(f"   ✓ Role '{role}' created.")
        else:
            print(f"   ✓ Role '{role}' already exists.")


def create_or_update_user(token: str, user: dict):
    """Create user in Keycloak with fixed UUID and assign realm role."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    payload = {
        "id":            user["id"],
        "username":      user["username"],
        "email":         user["email"],
        "firstName":     user["firstName"],
        "lastName":      user["lastName"],
        "enabled":       True,
        "emailVerified": True,
        "credentials": [{"type": "password", "value": user["password"], "temporary": False}],
        "attributes": {
            "tenant_id": [user["tenant_id"]],
        },
    }

    # Try to create
    r = requests.post(
        f"{KEYCLOAK_URL}/admin/realms/{REALM}/users",
        headers=headers,
        json=payload,
        timeout=10,
    )

    if r.status_code == 409:
        # User exists — update password
        existing = requests.get(
            f"{KEYCLOAK_URL}/admin/realms/{REALM}/users/{user['id']}",
            headers=headers, timeout=5,
        )
        if existing.status_code == 200:
            requests.put(
                f"{KEYCLOAK_URL}/admin/realms/{REALM}/users/{user['id']}/reset-password",
                headers=headers,
                json={"type": "password", "value": user["password"], "temporary": False},
                timeout=5,
            )
            print(f"   ↻ User '{user['email']}' already exists — password reset.")
        else:
            print(f"   ⚠️  User '{user['email']}' conflict but not found by ID.")
    elif r.status_code in (200, 201):
        print(f"   ✓ User '{user['email']}' created.")
    else:
        print(f"   ❌ Failed to create '{user['email']}': {r.status_code} {r.text}")
        return

    # Assign realm roles
    for role_name in user.get("roles", []):
        role_r = requests.get(
            f"{KEYCLOAK_URL}/admin/realms/{REALM}/roles/{role_name}",
            headers=headers, timeout=5,
        )
        if role_r.status_code == 200:
            requests.post(
                f"{KEYCLOAK_URL}/admin/realms/{REALM}/users/{user['id']}/role-mappings/realm",
                headers=headers,
                json=[role_r.json()],
                timeout=5,
            )


def main():
    wait_for_keycloak()
    token = get_admin_token()

    print(f"\n📋 Ensuring realm roles exist in '{REALM}'...")
    all_roles = list({r for u in USERS for r in u.get("roles", [])})
    ensure_realm_roles(token, all_roles)

    print(f"\n👥 Creating {len(USERS)} test users...")
    for user in USERS:
        create_or_update_user(token, user)

    print("\n✅ Keycloak setup complete!")
    print("\nTest credentials:")
    print("  admin@test.local    / Password123!  (TENANT_ADMIN)")
    print("  teacher@test.local  / Password123!  (TEACHER)")
    print("  parent@test.local   / Password123!  (PARENT)")
    print("  student@test.local  / Password123!  (STUDENT)")


if __name__ == "__main__":
    main()
