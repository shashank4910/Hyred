"""Upload ANSH resume to Enhancv checker and capture report artifacts."""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

RESUME = Path(sys.argv[1]) if len(sys.argv) > 1 else None
OUT = Path("tmp/enhancv-scrape")
OUT.mkdir(parents=True, exist_ok=True)


def main() -> None:
    if not RESUME or not RESUME.exists():
        raise SystemExit(f"Resume missing: {RESUME}")

    network: list[dict] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1400, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()

        def on_response(res):
            url = res.url
            if not re.search(r"enhancv|resume|check|score|upload|parse|/api/", url, re.I):
                return
            preview = ""
            try:
                ct = res.headers.get("content-type", "")
                if "json" in ct:
                    preview = res.text()[:4000]
            except Exception:
                pass
            network.append({"status": res.status, "url": url, "bodyPreview": preview})

        page.on("response", on_response)

        print("Opening Enhancv...")
        page.goto(
            "https://enhancv.com/resources/resume-checker/",
            wait_until="domcontentloaded",
            timeout=90000,
        )
        page.wait_for_timeout(2500)
        page.screenshot(path=str(OUT / "01-landing.png"), full_page=True)

        for label in ["Accept all", "Agree", "Got it", "Allow all"]:
            btn = page.get_by_role("button", name=re.compile(label, re.I))
            if btn.count():
                try:
                    btn.first.click(timeout=2000)
                except Exception:
                    pass

        inputs = page.locator('input[type="file"]')
        print("file inputs:", inputs.count())
        if inputs.count() == 0:
            page.screenshot(path=str(OUT / "02-no-file-input.png"), full_page=True)
            (OUT / "page.html").write_text(page.content(), encoding="utf-8")
            raise SystemExit("No file input")

        print("Uploading", RESUME)
        inputs.first.set_input_files(str(RESUME))
        page.wait_for_timeout(5000)

        for i in range(45):
            url = page.url
            text = page.locator("body").inner_text()
            ready = bool(
                re.search(r"score|ats|issues|improve|report|compatibility|checks?", text, re.I)
            ) and not re.search(r"drop your resume here", text[:600], re.I)
            print(f"tick {i}: url={url[:120]} ready={ready} len={len(text)}")
            if ready or re.search(r"report|result|score|analysis", url, re.I):
                break
            if page.locator('input[type="email"]').count():
                print("Email gate detected")
                break
            page.wait_for_timeout(2000)

        page.screenshot(path=str(OUT / "03-after-upload.png"), full_page=True)
        (OUT / "page-after-upload.html").write_text(page.content(), encoding="utf-8")
        (OUT / "body-after-upload.txt").write_text(page.locator("body").inner_text(), encoding="utf-8")
        (OUT / "network.json").write_text(json.dumps(network, indent=2), encoding="utf-8")

        if page.locator('input[type="email"]').count():
            print("Filling email gate...")
            page.locator('input[type="email"]').first.fill("hyred.research+enhancv@example.com")
            cont = page.get_by_role("button", name=re.compile(r"continue|get|see|show|submit|check", re.I))
            if cont.count():
                try:
                    cont.first.click()
                except Exception:
                    pass
            page.wait_for_timeout(10000)
            page.screenshot(path=str(OUT / "04-after-email.png"), full_page=True)
            (OUT / "body-after-email.txt").write_text(page.locator("body").inner_text(), encoding="utf-8")

        page.evaluate(
            """async () => {
              for (let y = 0; y < document.body.scrollHeight; y += 800) {
                window.scrollTo(0, y);
                await new Promise(r => setTimeout(r, 150));
              }
            }"""
        )
        page.screenshot(path=str(OUT / "05-full.png"), full_page=True)
        (OUT / "final-body.txt").write_text(page.locator("body").inner_text(), encoding="utf-8")
        (OUT / "final.html").write_text(page.content(), encoding="utf-8")
        (OUT / "final-url.txt").write_text(page.url, encoding="utf-8")
        (OUT / "network-final.json").write_text(json.dumps(network, indent=2), encoding="utf-8")
        print("Done ->", OUT)
        browser.close()


if __name__ == "__main__":
    main()
