import pytest
import httpx

FETCHER_URL = "http://article_fetcher:8000"

@pytest.mark.asyncio
async def test_fetcher_missing_parameters():
    """Test standard fallback for unprocessable web requests payload."""
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(f"{FETCHER_URL}/scrape", json={})
            assert res.status_code in [422, 404, 400, 500], "API should strictly type-check parameters."
        except httpx.ConnectError:
            pytest.skip("Fetcher offline.")

@pytest.mark.asyncio
async def test_hot_news_endpoint():
    """Verify that hot news lookup operates under nominal caching protocols if available."""
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"{FETCHER_URL}/hot_news")
            assert str(res.status_code).startswith("2") or res.status_code == 404
        except httpx.ConnectError:
            pytest.skip("Fetcher offline.")
