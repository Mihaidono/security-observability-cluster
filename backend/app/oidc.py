from __future__ import annotations

import time
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient

from .config import Settings
from .models import AuthenticatedUser


class OIDCError(RuntimeError):
    pass


class KeycloakOIDC:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._jwk_client = PyJWKClient(settings.oidc_jwks_endpoint)

    async def exchange_code(
        self,
        *,
        code: str,
        code_verifier: str,
        redirect_uri: str,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as client:
            form_data = {
                "grant_type": "authorization_code",
                "client_id": self.settings.oidc_client_id,
                "code": code,
                "code_verifier": code_verifier,
                "redirect_uri": redirect_uri,
            }
            if self.settings.oidc_client_secret:
                form_data["client_secret"] = self.settings.oidc_client_secret

            response = await client.post(
                self.settings.oidc_token_endpoint,
                data=form_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if response.status_code != 200:
            raise OIDCError("Unable to exchange the Keycloak authorization code.")

        payload = response.json()
        if not isinstance(payload, dict) or "id_token" not in payload:
            raise OIDCError("Keycloak token response is missing the id_token.")
        return payload

    def validate_id_token(self, token: str, *, expected_issuer: str, audience: str) -> AuthenticatedUser:
        signing_key = self._jwk_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"],
            audience=audience,
            issuer=expected_issuer,
        )

        subject = str(claims["sub"])
        username = str(claims.get("preferred_username") or claims.get("email") or subject)
        roles = [str(role) for role in claims.get("realm_access", {}).get("roles", []) if isinstance(role, str)]

        return AuthenticatedUser(
            id=subject,
            subject=subject,
            username=username,
            email=claims.get("email"),
            display_name=claims.get("name") or claims.get("given_name"),
            roles=roles,
        )

    @staticmethod
    def expires_at_from_payload(token_payload: dict[str, Any]) -> int:
        expires_in = int(token_payload.get("expires_in", 0))
        if expires_in <= 0:
            raise OIDCError("Keycloak token response is missing a valid expires_in.")
        return int(time.time()) + expires_in
