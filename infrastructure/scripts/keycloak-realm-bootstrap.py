import json
import os
import urllib.error
import urllib.parse
import urllib.request


base_url = os.environ["KEYCLOAK_BASE_URL"].rstrip("/")
admin_username = os.environ["KEYCLOAK_ADMIN_USERNAME"]
admin_password = os.environ["KEYCLOAK_ADMIN_PASSWORD"]
realm_name = os.environ["KEYCLOAK_REALM"]
client_id = os.environ["KEYCLOAK_CLIENT_ID"]
client_secret = os.environ["KEYCLOAK_CLIENT_SECRET"]
public_app_url = os.environ["KEYCLOAK_PUBLIC_APP_URL"].rstrip("/")

redirect_uri = f"{public_app_url}/auth/callback"
web_origin = public_app_url
public_client = client_secret == ""


def request(method: str, url: str, *, data=None, headers=None, expected=(200, 201, 204)):
    payload = None
    request_headers = headers.copy() if headers else {}
    if data is not None:
        payload = json.dumps(data).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=payload, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            body = response.read().decode("utf-8")
            if response.status not in expected:
                raise RuntimeError(f"Unexpected status {response.status} for {method} {url}: {body}")
            return body, response.status, dict(response.headers)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code in expected:
            return body, exc.code, dict(exc.headers)
        raise RuntimeError(f"HTTP {exc.code} for {method} {url}: {body}") from exc


token_body = urllib.parse.urlencode(
    {
        "grant_type": "password",
        "client_id": "admin-cli",
        "username": admin_username,
        "password": admin_password,
    }
).encode("utf-8")
token_req = urllib.request.Request(
    f"{base_url}/realms/master/protocol/openid-connect/token",
    data=token_body,
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    method="POST",
)
with urllib.request.urlopen(token_req, timeout=20) as response:
    token_payload = json.loads(response.read().decode("utf-8"))
access_token = token_payload["access_token"]
auth_headers = {"Authorization": f"Bearer {access_token}"}

realm_url = f"{base_url}/admin/realms/{realm_name}"
try:
    realm_body, _, _ = request("GET", realm_url, headers=auth_headers, expected=(200,))
    realm = json.loads(realm_body)
except RuntimeError as exc:
    if "HTTP 404" not in str(exc):
        raise
    realm = None

realm_payload = {
    "realm": realm_name,
    "enabled": True,
    "displayName": "Isolens",
    "loginWithEmailAllowed": True,
    "registrationAllowed": False,
    "resetPasswordAllowed": True,
    "rememberMe": True,
}

if realm is None:
    request("POST", f"{base_url}/admin/realms", data=realm_payload, headers=auth_headers, expected=(201,))
else:
    merged_realm = realm.copy()
    merged_realm.update(realm_payload)
    request("PUT", realm_url, data=merged_realm, headers=auth_headers, expected=(204,))

clients_body, _, _ = request(
    "GET",
    f"{realm_url}/clients?clientId={urllib.parse.quote(client_id, safe='')}",
    headers=auth_headers,
    expected=(200,),
)
clients = json.loads(clients_body)

client_payload = {
    "clientId": client_id,
    "name": "Isolens Web",
    "enabled": True,
    "protocol": "openid-connect",
    "publicClient": public_client,
    "standardFlowEnabled": True,
    "directAccessGrantsEnabled": False,
    "serviceAccountsEnabled": False,
    "rootUrl": public_app_url,
    "baseUrl": public_app_url,
    "redirectUris": [redirect_uri],
    "webOrigins": [web_origin],
    "attributes": {
        "pkce.code.challenge.method": "S256",
    },
}
if not public_client:
    client_payload["secret"] = client_secret

if clients:
    client_uuid = clients[0]["id"]
    request("PUT", f"{realm_url}/clients/{client_uuid}", data=client_payload, headers=auth_headers, expected=(204,))
else:
    request("POST", f"{realm_url}/clients", data=client_payload, headers=auth_headers, expected=(201,))

print("Keycloak realm bootstrap completed.")
