import os
from typing import List
from keycloak import KeycloakAdmin
from app.core.config import settings

def get_keycloak_admin():
    """
    Get a KeycloakAdmin instance using environment variables.
    Note: In production, use a dedicated service account instead of master admin.
    """
    return KeycloakAdmin(
        server_url=settings.KEYCLOAK_URL,
        username=os.getenv("KEYCLOAK_ADMIN", "admin"),
        password=os.getenv("KEYCLOAK_ADMIN_PASSWORD", "admin"),
        realm_name=settings.KEYCLOAK_REALM,
        user_realm_name="master",
        verify=True
    )

def create_keycloak_user(email: str, first_name: str, last_name: str, password: str, roles: List[str] = None):
    """
    Create a user in Keycloak, set their password, and assign roles.
    Returns the new Keycloak User ID.
    """
    admin = get_keycloak_admin()
    
    # 1. Create User
    new_user_payload = {
        "email": email,
        "username": email,
        "enabled": True,
        "firstName": first_name,
        "lastName": last_name,
        "credentials": [{"value": password, "type": "password", "temporary": True}]
    }
    
    try:
        user_id = admin.create_user(new_user_payload)
    except Exception as e:
        # Check if user already exists
        if "409" in str(e):
            users = admin.get_users({"email": email})
            if users:
                user_id = users[0]["id"]
            else:
                raise e
        else:
            raise e

    # 2. Assign Roles
    if roles:
        try:
            # Get role definitions from Keycloak
            realm_roles = admin.get_realm_roles()
            roles_to_assign = [r for r in realm_roles if r["name"] in roles]
            
            if roles_to_assign:
                admin.assign_realm_roles(user_id=user_id, roles=roles_to_assign)
        except Exception as e:
            print(f"Warning: Failed to assign roles in Keycloak - {e}")

    return user_id

def delete_keycloak_user(user_id: str):
    """
    Delete a user from Keycloak by their UUID.
    """
    admin = get_keycloak_admin()
    try:
        admin.delete_user(user_id=user_id)
    except Exception:
        pass
