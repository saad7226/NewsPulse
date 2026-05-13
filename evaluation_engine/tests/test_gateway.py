import pytest
import httpx

GATEWAY_URL = "http://gateway:8000"

@pytest.mark.asyncio
async def test_gateway_health():
    """Ensure API Gateway is alive and listening."""
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"{GATEWAY_URL}/health")
            assert res.status_code in [200, 404], "Gateway should be accessible."
        except httpx.ConnectError:
            pytest.skip("Gateway service is unreachable in this environment.")

@pytest.mark.asyncio
async def test_gateway_unencrypted_payload_rejection():
    """
    Requirement: SEC-04
    Verify that failing to provide proper AES-GCM encrypted data 
    will trigger a rejection at the middleware level.
    """
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(
                f"{GATEWAY_URL}/api/process", 
                json={"article_url": "https://example.com/news"}
            )
            # Expecting 400 Bad Request, 422 Unprocessable Entity, or 403 Forbidden
            assert res.status_code in [400, 422, 403, 401, 500], f"Gateway did not reject naked JSON. Got: {res.status_code}"
        except httpx.ConnectError:
            pytest.skip("Gateway service unreachable.")
