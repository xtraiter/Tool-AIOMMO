"""Fetch a product page the way Chrome does (TLS/HTTP2 fingerprint via curl_cffi).

Shopee serves its full product page (embedded JSON) only to clients that look
like a real browser; Node's fetch gets an empty shell. Used by lib/browserFetch.ts.

Usage: fetch_page.py <url>
Prints JSON {"status", "url", "text"} to stdout. Redirects are followed only
within the allowed shop domains so this can't be pointed at internal hosts.
"""
import json
import sys
from urllib.parse import urljoin, urlsplit

from curl_cffi import requests

ALLOWED = ("shopee.vn", "shp.ee", "tiktok.com")
MAX_BYTES = 4_000_000


def allowed(url: str) -> bool:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    return parts.scheme in ("http", "https") and any(host == d or host.endswith("." + d) for d in ALLOWED)


def main():
    url = sys.argv[1]
    session = requests.Session(impersonate="chrome")
    headers = {"Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8"}
    for _ in range(6):
        if not allowed(url):
            print(f"blocked host: {url}", file=sys.stderr)
            sys.exit(3)
        res = session.get(url, headers=headers, timeout=25, allow_redirects=False)
        location = res.headers.get("location")
        if 300 <= res.status_code < 400 and location:
            url = urljoin(url, location)
            continue
        json.dump({"status": res.status_code, "url": url, "text": res.text[:MAX_BYTES]}, sys.stdout, ensure_ascii=False)
        return
    print("too many redirects", file=sys.stderr)
    sys.exit(4)


if __name__ == "__main__":
    main()
