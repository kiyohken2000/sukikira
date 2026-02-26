"""
Selenium で cf_clearance cookie を取得し、
requests で ?nxc= にアクセスできるか検証するスクリプト。

使い方:
  pip install selenium requests
  python scripts/test_cf_clearance.py

前提:
  - Chrome がインストール済み
  - chromedriver が PATH にある、または selenium-manager が自動取得
"""

import time
import sys
import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import re
import json

NAME = "木村拓哉"
BASE = "https://suki-kira.com"
RESULT_URL = f"{BASE}/people/result/{NAME}"

def main():
    print("=" * 60)
    print("cf_clearance 取得テスト")
    print("=" * 60)

    # --- Step 1: Selenium でブラウザを開く ---
    print("\n[Step 1] Chrome を起動中...")
    opts = Options()
    # ヘッドレスだと cf_clearance が発行されない可能性があるので GUI で
    # opts.add_argument("--headless=new")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)

    driver = webdriver.Chrome(options=opts)
    # navigator.webdriver を隠す
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    })

    try:
        # --- Step 2: result ページを開く ---
        print(f"\n[Step 2] result ページを開く: {RESULT_URL}")
        driver.get(RESULT_URL)

        # Cloudflare チャレンジがある場合は待つ
        print("  Cloudflare チャレンジ確認中（最大30秒待機）...")
        for i in range(30):
            time.sleep(1)
            title = driver.title
            # チャレンジ中は "Just a moment..." 等のタイトル
            if "Just a moment" in title or "Checking" in title:
                print(f"  [{i+1}s] チャレンジ中: {title}")
                continue
            # ページが読み込まれたか確認
            try:
                body = driver.find_element(By.TAG_NAME, "body").text
                if "好き派:" in body:
                    print(f"  [{i+1}s] result ページ読み込み完了")
                    break
            except:
                pass

        # --- Step 3: Cookie を確認 ---
        print(f"\n[Step 3] Cookie 確認")
        cookies = driver.get_cookies()
        cf_clearance = None
        for c in cookies:
            print(f"  {c['name']} = {c['value'][:40]}...")
            if c['name'] == 'cf_clearance':
                cf_clearance = c['value']

        if cf_clearance:
            print(f"\n  >>> cf_clearance 取得成功: {cf_clearance[:40]}...")
        else:
            print(f"\n  >>> cf_clearance なし")
            print("  ブラウザで手動操作が必要かもしれません。")
            print("  30秒待ちます。チャレンジが表示された場合は手動で解決してください...")
            time.sleep(30)

            # 再確認
            cookies = driver.get_cookies()
            for c in cookies:
                if c['name'] == 'cf_clearance':
                    cf_clearance = c['value']
                    print(f"  >>> cf_clearance 取得成功: {cf_clearance[:40]}...")
                    break

        # --- Step 4: nextCursor を取得 ---
        print(f"\n[Step 4] nextCursor (nxc) を取得")
        try:
            next_links = driver.find_elements(By.CSS_SELECTOR, 'a[href*="nxc="]')
            nxc = None
            for link in next_links:
                href = link.get_attribute("href")
                m = re.search(r'nxc=(\d+)', href)
                if m:
                    nxc = m.group(1)
                    print(f"  nxc={nxc} (href: {href})")
                    break
            if not nxc:
                print("  ERROR: nxc リンクが見つからない")
                return
        except Exception as e:
            print(f"  ERROR: {e}")
            return

        # --- Step 5: Selenium で ?nxc= ページに遷移 ---
        print(f"\n[Step 5] Selenium で ?nxc={nxc} に遷移")
        nxc_url = f"{RESULT_URL}/?nxc={nxc}"
        driver.get(nxc_url)
        time.sleep(3)

        final_url = driver.current_url
        print(f"  最終URL: {final_url}")

        if "nxc=" in final_url:
            print("  >>> Selenium: ?nxc= 遷移成功！リダイレクトなし")
        elif "cm" in final_url:
            print("  >>> Selenium: ?cm にリダイレクトされた (NG)")
        else:
            print(f"  >>> Selenium: 不明なURL")

        # コメントIDを確認
        try:
            containers = driver.find_elements(By.CSS_SELECTOR, 'div[class*="comment-container"]')
            ids = []
            for el in containers:
                cls = el.get_attribute("class")
                m = re.search(r'c(\d+)', cls)
                if m:
                    ids.append(m.group(1))
            if ids:
                print(f"  コメント数: {len(ids)}, ID範囲: {ids[0]}~{ids[-1]}")
            else:
                print("  コメントが見つからない")
        except Exception as e:
            print(f"  ERROR: {e}")

        # --- Step 6: requests で ?nxc= にアクセス（cf_clearance 付き） ---
        if cf_clearance:
            print(f"\n[Step 6] requests で ?nxc={nxc} にアクセス（cf_clearance 付き）")

            # Selenium から全 cookie を取得
            session = requests.Session()
            for c in driver.get_cookies():
                session.cookies.set(c['name'], c['value'], domain=c.get('domain', ''))

            ua = driver.execute_script("return navigator.userAgent")
            headers = {"User-Agent": ua}

            resp = session.get(nxc_url, headers=headers, allow_redirects=True)
            print(f"  status: {resp.status_code}")
            print(f"  最終URL: {resp.url}")
            print(f"  HTML長: {len(resp.text)} chars")

            # コメントID確認
            comment_ids = re.findall(r'comment-container c(\d+)', resp.text)
            if comment_ids:
                print(f"  コメント数: {len(comment_ids)}, ID範囲: {comment_ids[0]}~{comment_ids[-1]}")
                if comment_ids[0] != ids[0] if ids else True:
                    print("  >>> requests: 2ページ目の取得成功！")
                else:
                    print("  >>> requests: 1ページ目と同じコメント (NG)")
            else:
                print("  コメントが見つからない")

            # upvote/downvote token 確認
            vote_btns = re.findall(r'commentVote-like-(\d+)-(\d+)-(\d+)-([^\s"]+)', resp.text)
            if vote_btns:
                print(f"  commentVote ボタン: {len(vote_btns)}個")
                for cid, up, dn, token in vote_btns[:3]:
                    print(f"    #{cid} up={up} dn={dn} token={token[:12]}...")
            else:
                print("  commentVote ボタンなし")
        else:
            print(f"\n[Step 6] スキップ（cf_clearance なし）")

        # --- Step 7: 結果サマリ ---
        print("\n" + "=" * 60)
        print("結果サマリ")
        print("=" * 60)
        print(f"cf_clearance: {'あり' if cf_clearance else 'なし'}")
        print(f"Selenium ?nxc= 遷移: {'成功' if 'nxc=' in final_url else 'リダイレクト'}")
        if cf_clearance:
            print(f"requests ?nxc= アクセス: テスト済み（上記参照）")
        print("=" * 60)

    finally:
        print("\n[完了] ブラウザを閉じます...")
        driver.quit()


if __name__ == "__main__":
    main()
