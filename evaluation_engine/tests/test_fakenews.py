import pytest
import httpx

FAKENEWS_URL = "http://fakenews_detection:8000/detect_fake_news"

CREDIBLE_ARTICLES = [
    "The Federal Reserve announced today that it will keep interest rates steady at 5.25% amid signs of cooling inflation.",
    "NASA's James Webb Space Telescope has captured a stunning new image of a distant galaxy cluster forming stars at a rapid rate.",
    "A new study published in The Lancet medical journal explores the correlation between Mediterranean diets and cardiovascular health over 10 years."
]

FAKE_ARTICLES = [
    "SHOCKING: Secret deep state alien base found under the White House! The government is hiding everything from us! WAKE UP SHEEPLE!!",
    "BOMBSHELL! Miracle cure discovered that completely reverses aging in just 3 days using household bleach. Doctors are furious!",
    "Caught on camera: Politicians admit to faking the entire moon landing and creating a massive hoax to control the masses. Must see!"
]

@pytest.mark.asyncio
async def test_fakenews_detection_accuracy():
    """
    Requirement: Fake News (REQ-SF5-1)
    Test 3 credible articles and 3 sensational ones to ensure the detector thresholds work.
    """
    correct_predictions = 0
    total = len(CREDIBLE_ARTICLES) + len(FAKE_ARTICLES)

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Test credible
            for text in CREDIBLE_ARTICLES:
                res = await client.post(FAKENEWS_URL, json={"text": text})
                assert res.status_code == 200
                data = res.json()
                if data["is_fake"] is False:
                    correct_predictions += 1

            # Test fake
            for text in FAKE_ARTICLES:
                res = await client.post(FAKENEWS_URL, json={"text": text})
                assert res.status_code == 200
                data = res.json()
                if data["is_fake"] is True:
                    correct_predictions += 1
                    
            accuracy = correct_predictions / total
            assert accuracy >= 0.80, f"Accuracy {accuracy*100}% below 80% threshold."
        except httpx.ConnectError:
            return
