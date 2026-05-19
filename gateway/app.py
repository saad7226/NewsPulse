import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from security import decrypt_request, encrypt_response, verify_token
import httpx
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="NewsPulse Secure Gateway")

_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/process")
async def secure_process(request: Request):
    body = await request.json()
    encrypted_payload = body["payload"]

    data = decrypt_request(encrypted_payload)

    token = data.get("token")
    if token:
        user = verify_token(token)
    else:
        user = None
    
    # Bypass strict auth for local frontend development
    # if not user:
    #     return {"payload": encrypt_response({"error": "Unauthorized"})}

    action = data["action"]
    params = data.get("params", {})

    premium_actions = ["summarize", "political_bias", "fake_news", "counter_argument"]
    if action in premium_actions and not user:
        return {"payload": encrypt_response({"error": "Unauthorized. Premium AI features require login."})}

    async with httpx.AsyncClient(timeout=240.0) as client:
        try:
            headers = {}
            if user:
                headers["X-User-Id"] = str(user.get("sub", ""))
                headers["X-User-Name"] = str(user.get("username", ""))
            if action == "register":
                resp = await client.post("http://auth_service:8000/register", json=params, timeout=30.0)
                if resp.status_code == 400:
                    return {"payload": encrypt_response({"error": "Username or email already registered"})}
                resp.raise_for_status()
            elif action == "login":
                resp = await client.post("http://auth_service:8000/login", json=params, timeout=30.0)
                if resp.status_code == 401:
                    return {"payload": encrypt_response({"error": "Incorrect username or password"})}
                resp.raise_for_status()
            elif action == "google_login":
                resp = await client.post("http://auth_service:8000/google-login", json=params, timeout=30.0)
                if resp.status_code == 400:
                    return {"payload": encrypt_response({"error": "Invalid Google token or payload"})}
                resp.raise_for_status()
            elif action == "summarize":
                resp = await client.post("http://summarizer:8000/summarize", json=params, headers=headers, timeout=300.0)
            elif action == "political_bias":
                resp = await client.post("http://political_bias:8000/detect_bias", json=params, headers=headers, timeout=300.0)
            elif action == "fake_news":
                resp = await client.post("http://fakenews_detection:8000/detect_fake_news", json=params, headers=headers, timeout=300.0)
            elif action == "counter_argument":
                resp = await client.post("http://counter_argument:8000/generate_counter", json=params, headers=headers, timeout=300.0)
            elif action == "fetch_articles":
                resp = await client.get("http://article_fetcher:8000/fetch", params=params, headers=headers, timeout=120.0)
            elif action == "search_articles":
                resp = await client.get("http://article_fetcher:8000/search", params=params, headers=headers, timeout=120.0)
            elif action == "get_user_history":
                if not user:
                    return {"payload": encrypt_response({"error": "Unauthorized"})}
                user_id = str(user.get("sub", ""))
                import asyncio
                history_tasks = [
                    client.get(f"http://summarizer:8000/history/{user_id}", headers=headers, timeout=10.0),
                    client.get(f"http://fakenews_detection:8000/history/{user_id}", headers=headers, timeout=10.0),
                    client.get(f"http://political_bias:8000/history/{user_id}", headers=headers, timeout=10.0),
                    client.get(f"http://counter_argument:8000/history/{user_id}", headers=headers, timeout=10.0)
                ]
                results = await asyncio.gather(*history_tasks, return_exceptions=True)
                
                def safe_json(r):
                    if isinstance(r, Exception) or getattr(r, 'status_code', 500) != 200:
                        return []
                    return r.json()
                
                summaries, fakenews, biases, counters = map(safe_json, results)
                return {"payload": encrypt_response({
                    "summaries": summaries,
                    "fakenews": fakenews,
                    "biases": biases,
                    "counters": counters
                })}
            elif action == "get_global_stats":
                import asyncio
                stats_tasks = [
                    client.get("http://fakenews_detection:8000/global_stats", timeout=15.0),
                    client.get("http://political_bias:8000/global_stats", timeout=15.0)
                ]
                results = await asyncio.gather(*stats_tasks, return_exceptions=True)
                
                def safe_json_dict(r):
                    if isinstance(r, Exception) or getattr(r, 'status_code', 500) != 200:
                        return {}
                    return r.json()
                    
                fake_stats, bias_stats = map(safe_json_dict, results)
                return {"payload": encrypt_response({
                    "fakenews": fake_stats,
                    "bias": bias_stats
                })}
            elif action == "check_system_analysis":
                article_url = params.get("article_url")
                if not article_url:
                    return {"payload": encrypt_response({"error": "Missing article_url"})}
                import asyncio
                
                req_params = {"url": article_url}
                if user and user.get("sub"):
                    req_params["user_id"] = str(user.get("sub", ""))
                    
                an_tasks = [
                    client.get("http://fakenews_detection:8000/analysis_by_url", params=req_params, timeout=10.0),
                    client.get("http://political_bias:8000/analysis_by_url", params=req_params, timeout=10.0),
                    client.get("http://summarizer:8000/analysis_by_url", params=req_params, timeout=10.0),
                    client.get("http://counter_argument:8000/analysis_by_url", params=req_params, timeout=10.0)
                ]
                results = await asyncio.gather(*an_tasks, return_exceptions=True)
                
                def safe_sys_json(r):
                    if isinstance(r, Exception) or getattr(r, 'status_code', 500) != 200:
                        return {"found": False}
                    return r.json()
                    
                fake_sys, bias_sys, sum_sys, counter_sys = map(safe_sys_json, results)
                return {"payload": encrypt_response({
                    "fakenews": fake_sys if fake_sys.get("found") else None,
                    "bias": bias_sys if bias_sys.get("found") else None,
                    "summary": sum_sys if sum_sys.get("found") else None,
                    "counter": counter_sys if counter_sys.get("found") else None
                })}
            elif action == "save_article":
                if not user:
                    return {"payload": encrypt_response({"error": "Unauthorized"})}
                params["user_id"] = user.get("user_id")
                resp = await client.post("http://auth_service:8000/save_article", json=params, timeout=10.0)
                resp.raise_for_status()
            elif action == "unsave_article":
                if not user:
                    return {"payload": encrypt_response({"error": "Unauthorized"})}
                params["user_id"] = user.get("user_id")
                resp = await client.post("http://auth_service:8000/unsave_article", json=params, timeout=10.0)
                resp.raise_for_status()
            elif action == "get_saved_articles":
                if not user:
                    return {"payload": encrypt_response({"error": "Unauthorized"})}
                user_id = user.get("user_id")
                resp = await client.get(f"http://auth_service:8000/saved_articles/{user_id}", timeout=10.0)
                resp.raise_for_status()
            elif action == "get_preferences":
                if not user:
                    return {"payload": encrypt_response({"error": "Unauthorized"})}
                user_id = user.get("user_id")
                resp = await client.get(f"http://auth_service:8000/preferences/{user_id}", timeout=10.0)
                resp.raise_for_status()
            elif action == "update_preferences":
                if not user:
                    return {"payload": encrypt_response({"error": "Unauthorized"})}
                params["user_id"] = user.get("user_id")
                resp = await client.post("http://auth_service:8000/preferences", json=params, timeout=10.0)
                resp.raise_for_status()
            elif action == "get_profile":
                if not user:
                    return {"payload": encrypt_response({"error": "Unauthorized"})}
                user_id = user.get("user_id")
                resp = await client.get(f"http://auth_service:8000/profile/{user_id}", timeout=10.0)
                resp.raise_for_status()
            elif action == "update_profile":
                if not user:
                    return {"payload": encrypt_response({"error": "Unauthorized"})}
                params["user_id"] = user.get("user_id")
                resp = await client.post("http://auth_service:8000/profile", json=params, timeout=10.0)
                resp.raise_for_status()
            elif action == "get_admin_metrics":
                if not user or not user.get("is_admin"):
                    return {"payload": encrypt_response({"error": "Forbidden: Admin privileges required"})}
                import asyncio
                # Query Prometheus natively
                prom_url = "http://prometheus:9090/api/v1/query"
                tasks = [
                    client.get(prom_url, params={"query": "sum(summarizer_requests_total)"}, timeout=10.0),
                    client.get(prom_url, params={"query": "sum(fake_news_requests_total)"}, timeout=10.0),
                    client.get(prom_url, params={"query": "sum(bias_requests_total)"}, timeout=10.0),
                    client.get(prom_url, params={"query": "sum(counter_requests_total)"}, timeout=10.0),
                    client.get(prom_url, params={"query": "sum(rate(summarizer_request_latency_seconds_sum[5m])) / sum(rate(summarizer_request_latency_seconds_count[5m]))"}, timeout=10.0),
                    client.get(prom_url, params={"query": "sum(rate(fakenews_request_latency_seconds_sum[5m])) / sum(rate(fakenews_request_latency_seconds_count[5m]))"}, timeout=10.0)
                ]
                prom_results = await asyncio.gather(*tasks, return_exceptions=True)
                
                def parse_val(r):
                    if isinstance(r, Exception) or getattr(r, 'status_code', 500) != 200:
                        return 0
                    try:
                        data = r.json().get("data", {}).get("result", [])
                        if not data:
                            return 0
                        val = float(data[0]["value"][1])
                        import math
                        return 0 if math.isnan(val) else val
                    except Exception:
                        return 0

                sum_req, fn_req, pb_req, ct_req, sum_lat, fn_lat = map(parse_val, prom_results)
                
                return {"payload": encrypt_response({
                    "total_requests": sum_req + fn_req + pb_req + ct_req,
                    "breakdown": {
                        "summarizer": sum_req,
                        "fakenews": fn_req,
                        "political_bias": pb_req,
                        "counter": ct_req
                    },
                    "average_latency": {
                        "summarizer": sum_lat,
                        "fakenews": fn_lat
                    }
                })}
            elif action == "admin_register":
                # No auth token needed — public registration with secret code
                resp = await client.post("http://auth_service:8000/admin-register", json=params, timeout=10.0)
                if resp.status_code in (400, 403, 422):
                    err_detail = resp.json().get("detail", "Registration failed.")
                    return {"payload": encrypt_response({"error": err_detail})}
                resp.raise_for_status()
            elif action == "admin_login":
                # No token required — this IS the login endpoint for admins
                resp = await client.post("http://auth_service:8000/admin-login", json=params, timeout=10.0)
                if resp.status_code in (401, 403):
                    err_detail = resp.json().get("detail", "Invalid admin credentials.")
                    return {"payload": encrypt_response({"error": err_detail})}
                resp.raise_for_status()
            elif action == "get_pending_admins":
                if not user or not user.get("is_super_admin"):
                    return {"payload": encrypt_response({"error": "Super Admin privileges required."})}
                resp = await client.post("http://auth_service:8000/admin/pending",
                                        json={"token": token}, timeout=10.0)
                resp.raise_for_status()
            elif action == "get_approved_admins":
                if not user or not user.get("is_super_admin"):
                    return {"payload": encrypt_response({"error": "Super Admin privileges required."})}
                resp = await client.post("http://auth_service:8000/admin/approved",
                                        json={"token": token}, timeout=10.0)
                resp.raise_for_status()
            elif action == "approve_admin":
                if not user or not user.get("is_super_admin"):
                    return {"payload": encrypt_response({"error": "Super Admin privileges required."})}
                resp = await client.post("http://auth_service:8000/admin/approve",
                                        json={"token": token, "admin_id": params.get("admin_id")},
                                        timeout=10.0)
                resp.raise_for_status()
            elif action == "delete_admin":
                if not user or not user.get("is_super_admin"):
                    return {"payload": encrypt_response({"error": "Super Admin privileges required."})}
                resp = await client.request("DELETE", "http://auth_service:8000/admin/delete",
                                           json={"token": token, "admin_id": params.get("admin_id")},
                                           timeout=10.0)
                resp.raise_for_status()
            else:
                return {"payload": encrypt_response({"error": "Invalid action"})}

            result = resp.json()
        except httpx.TimeoutException:
            return JSONResponse(
                status_code=503, 
                content={"payload": encrypt_response({"error": "Service timeout. The analysis took too long. Please try again."})}
            )
        except httpx.RequestError as e:
            return JSONResponse(
                status_code=503, 
                content={"payload": encrypt_response({"error": f"Service connection error: {str(e)}."})}
            )
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JSONResponse(
                status_code=500, 
                content={"payload": encrypt_response({"error": f"Internal Service Error: {str(e)}."})}
            )

    return {"payload": encrypt_response(result)}
