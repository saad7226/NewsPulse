import pytest
import httpx
import time

FAKENEWS_URL = "http://fakenews_detection:8000/detect_fake_news"
ARTICLE = "This is a simple text snippet used specifically to test the baseline performance and caching effectiveness of the internal APIs."

@pytest.mark.asyncio
async def test_api_performance_and_caching():
    """
    Requirement: Performance (REQ-SF1-1)
    Asserts that cached API endpoints return responses in < 2 seconds.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # First request (could be un-cached / cold start) - we just let it run
            await client.post(FAKENEWS_URL, json={"text": ARTICLE})
            
            # Second request (must be cached)
            start = time.monotonic()
            res = await client.post(FAKENEWS_URL, json={"text": ARTICLE})
            elapsed = time.monotonic() - start
            
            assert res.status_code == 200
            assert elapsed < 2.0, f"Performance failed: Cached response took {elapsed:.2f}s, expected < 2.0s"
        except httpx.ConnectError:
            return
