"""Audit screenshots — auth via magic link, capture non-POS dashboard."""
from playwright.sync_api import sync_playwright
import os, json, urllib.request
from urllib.parse import urlparse, parse_qs

SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "..", "audit-screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

BASE = "http://localhost:3001"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://nagyprzjtheyeuuwxgpg.supabase.co")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # never hardcode secrets

def get_magic_link():
    req = urllib.request.Request(
        f"{SUPABASE_URL}/auth/v1/admin/generate_link",
        data=json.dumps({"type": "magiclink", "email": "thomasbauland1304@gmail.com"}).encode(),
        headers={"Content-Type": "application/json", "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read()).get("action_link", "")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    for viewport_name, vw, vh in [("mobile", 390, 844), ("desktop", 1280, 900)]:
        # Fresh magic link per viewport (single use)
        magic_link = get_magic_link()
        print(f"Got magic link for {viewport_name}")

        context = browser.new_context(viewport={"width": vw, "height": vh})
        page = context.new_page()

        # Visit magic link
        page.goto(magic_link, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(2000)
        url = page.url

        # Extract tokens from redirect hash
        if "#" in url:
            hash_part = url.split("#")[1]
            params = dict(kv.split("=", 1) for kv in hash_part.split("&") if "=" in kv)
            access_token = params.get("access_token", "")
            refresh_token = params.get("refresh_token", "")

            if access_token:
                # Set auth and navigate
                page.goto(BASE)
                page.wait_for_load_state("networkidle")
                page.evaluate(f"""() => {{
                    localStorage.setItem('sb-nagyprzjtheyeuuwxgpg-auth-token', JSON.stringify({{
                        access_token: '{access_token}',
                        refresh_token: '{refresh_token}',
                        expires_in: 3600,
                        token_type: 'bearer'
                    }}));
                }}""")

                pages_to_capture = [
                    ("1-accueil", f"{BASE}/dashboard"),
                    ("2-catalogue", f"{BASE}/dashboard/products"),
                    ("3-ventes", f"{BASE}/dashboard/recap"),
                    ("4-entrees", f"{BASE}/dashboard/invoices"),
                ]

                for name, url in pages_to_capture:
                    print(f"  Capturing {name} ({viewport_name})...")
                    page.goto(url)
                    page.wait_for_load_state("networkidle")
                    page.wait_for_timeout(3000)
                    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"{name}-{viewport_name}.png"), full_page=True)

                print(f"  Done {viewport_name}")
            else:
                print(f"  ERROR: no access_token in redirect")
        else:
            print(f"  ERROR: no hash in redirect URL: {url[:100]}")

        context.close()

    browser.close()
    print("\nAll done!")
