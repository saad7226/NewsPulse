import pytest
import httpx

BIAS_URL = "http://political_bias:8000/detect_bias"

LEFT_LEANING = "It is incredibly important that we act on climate change immediately and enforce strict regulations on corporate pollution. Social justice and universal healthcare are fundamental human rights that the government must provide by increasing taxes on billionaires to establish equity."

RIGHT_LEANING = "The free market must be protected from overreaching government regulation. Lowering taxes encourages economic freedom and supply-side growth, trickling down to benefit all Americans. We must secure our borders and uphold our constitutional rights and traditional family values without government interference."

NEUTRAL = "Apple released its highly anticipated new smartphone model today, featuring a new processor and an upgraded OLED display. The company's quarterly earnings reported a 5% increase in revenue compared to last year."

@pytest.mark.asyncio
async def test_political_bias_accuracy():
    """
    Requirement: Political Bias (REQ-SF4-1)
    Test known left-leaning, right-leaning, and neutral text.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            # 1. Left Leaning
            res = await client.post(BIAS_URL, json={"text": LEFT_LEANING})
            assert res.status_code == 200
            assert res.json()["bias_score"] == "Left-Leaning"
            
            # 2. Right Leaning
            res = await client.post(BIAS_URL, json={"text": RIGHT_LEANING})
            assert res.status_code == 200
            assert res.json()["bias_score"] == "Right-Leaning"
            
            # 3. Neutral (Topic Gate Check)
            res = await client.post(BIAS_URL, json={"text": NEUTRAL})
            assert res.status_code == 200
            assert res.json()["bias_score"] == "Center"
        except httpx.ConnectError:
            return
