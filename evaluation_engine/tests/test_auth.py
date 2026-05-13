import pytest
import httpx
import uuid

AUTH_URL = "http://auth_service:8000"

@pytest.mark.asyncio
async def test_admin_registration_bypass_denied():
    """
    Requirement: SEC-01
    Ensure that no arbitrary user can create an administrative dataset
    without supplying the correct secret environment variable.
    """
    async with httpx.AsyncClient() as client:
        payload = {
            "email": f"hacker_{uuid.uuid4().hex[:6]}@anarchy.com",
            "password": "strongpassword123",
            "secret_code": "INVALID_GUESS_CODE"
        }
        try:
            res = await client.post(f"{AUTH_URL}/admin-register", json=payload)
            # Should fail verification
            assert res.status_code in [400, 401, 403, 422], "Admin registration bypass was not appropriately blocked."
        except httpx.ConnectError:
            pytest.skip("Auth service offline.")

@pytest.mark.asyncio
async def test_login_missing_credentials():
    """Ensure blank credential injections fail smoothly."""
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(f"{AUTH_URL}/login", data={"username": "", "password": ""})
            assert res.status_code in [400, 422]
        except httpx.ConnectError:
            pytest.skip("Auth service offline.")
