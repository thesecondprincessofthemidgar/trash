# test.py
import os
import httpx
import openai

# The SOCKS5 endpoint exposed by the ss-local container
PROXY_URL = "socks5://ss-local:1080"

# httpx ≥ 0.28 → keyword is *proxy*, not *proxies*
http_client = httpx.Client(proxy=PROXY_URL, timeout=10.0)

client = openai.OpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    http_client=http_client,
)

print("→ first three models returned by the API:")
for m in client.models.list().data[:3]:
    print("   •", m.id)
