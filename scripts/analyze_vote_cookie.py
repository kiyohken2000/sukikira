"""
投票後のCookieの仕様を調査する。

調査内容:
  STEP 1: 人物A に投票 → Set-Cookie ヘッダーの中身・有効期限を確認
  STEP 2: Cookie を持ったまま人物B（未投票）の結果ページへアクセス
          → Cookieがグローバルか人物ごとかを判定
  STEP 3: Cookie なし で人物A の結果ページへアクセス
          → Cookie が必須かどうかを確認
  STEP 4: Cookie なし で人物A の投票ページへアクセス（同IPからの再アクセス）
          → IPトラッキングの有無を確認

実行: python scripts/analyze_vote_cookie.py
出力: scripts/out/analyze_vote_cookie.txt にも保存
"""

import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar
import re
import sys
import os

# ---- 出力設定 ----
_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_vote_cookie.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, *args, **kwargs):
        try: sys.__stdout__.write(*args, **kwargs)
        except Exception: pass
        _out_file.write(*args, **kwargs)
    def flush(self):
        try: sys.__stdout__.flush()
        except Exception: pass
        _out_file.flush()

sys.stdout = _Tee()

# ---- 設定 ----
NAME_A = "指原莉乃"   # STEP1で投票する人物（IPキャッシュが残りにくい人物を選ぶ）
NAME_B = "大谷翔平"   # STEP2でアクセスする人物（NAMEAとは別・未投票）
VOTE_TYPE = "1"        # "1"=好き, "0"=嫌い

BASE = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

def section(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

def make_opener():
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    return opener, jar

def fetch_get(opener, url):
    req = urllib.request.Request(url, headers=HEADERS)
    with opener.open(req, timeout=15) as res:
        final_url = res.geturl()
        raw_headers = res.info()
        html = res.read().decode("utf-8", errors="replace")
        set_cookies = raw_headers.get_all("Set-Cookie") or []
        return html, final_url, set_cookies

def fetch_post(opener, url, data, referer):
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={
        **HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE,
        "Referer": referer,
    })
    with opener.open(req, timeout=15) as res:
        final_url = res.geturl()
        raw_headers = res.info()
        html = res.read().decode("utf-8", errors="replace")
        set_cookies = raw_headers.get_all("Set-Cookie") or []
        return html, final_url, set_cookies

def parse_input(html, name):
    m = re.search(rf'name="{re.escape(name)}"[^>]*value="([^"]*)"', html)
    if m: return m.group(1)
    m = re.search(rf'value="([^"]*)"[^>]*name="{re.escape(name)}"', html)
    if m: return m.group(1)
    return None

def print_cookies(jar, label="Cookie jar"):
    cookies = list(jar)
    print(f"\n  [{label}] Cookie数: {len(cookies)}")
    for c in cookies:
        print(f"    name    : {c.name}")
        print(f"    value   : {c.value[:40]}..." if len(c.value or '') > 40 else f"    value   : {c.value}")
        print(f"    domain  : {c.domain}")
        print(f"    path    : {c.path}")
        print(f"    expires : {c.expires} ({_fmt_expires(c.expires)})")
        print(f"    secure  : {c.secure}")
        print(f"    has_nonstandard_attr: {c.has_nonstandard_attr('HttpOnly')}")
        print()

def _fmt_expires(ts):
    if ts is None: return "セッションCookie（期限なし）"
    import datetime
    try:
        dt = datetime.datetime.utcfromtimestamp(ts)
        now = datetime.datetime.utcnow()
        delta = dt - now
        hours = delta.total_seconds() / 3600
        return f"{dt.strftime('%Y-%m-%d %H:%M:%S')} UTC ({hours:.1f}時間後)"
    except Exception:
        return str(ts)

def print_set_cookie_headers(headers):
    if not headers:
        print("  Set-Cookie ヘッダー: なし")
        return
    for h in headers:
        print(f"  Set-Cookie: {h}")

def is_result_page(html):
    return "好き派:" in html

# ================================================================
# STEP 1: 人物A に投票 → Cookie を取得
# ================================================================
section(f"STEP 1: {NAME_A} に投票 → Cookieを取得")

opener_a, jar_a = make_opener()
enc_a = urllib.parse.quote(NAME_A)

print(f"\n[1-1] GET /people/vote/{NAME_A}")
try:
    vote_html, vote_url, vote_sc = fetch_get(opener_a, f"{BASE}/people/vote/{enc_a}")
    print(f"  最終URL: {vote_url}")
    print(f"  HTMLサイズ: {len(vote_html)} bytes")
    print_set_cookie_headers(vote_sc)

    pid    = parse_input(vote_html, "id")
    auth1  = parse_input(vote_html, "auth1")
    auth2  = parse_input(vote_html, "auth2")
    auth_r = parse_input(vote_html, "auth-r")
    print(f"\n  トークン取得: id={pid}, auth1={'OK' if auth1 else 'NG'}, auth2={'OK' if auth2 else 'NG'}, auth-r={'OK' if auth_r else 'NG'}")

    if not all([pid, auth1, auth2, auth_r]):
        print("  !! トークン取得失敗。スクリプトを終了。")
        sys.exit(1)

    print(f"\n[1-2] POST /people/result/{NAME_A} (投票)")
    post_data = {"vote": VOTE_TYPE, "ok": "ng", "id": pid, "auth1": auth1, "auth2": auth2, "auth-r": auth_r}
    result_html, result_url, result_sc = fetch_post(
        opener_a,
        f"{BASE}/people/result/{enc_a}",
        post_data,
        referer=f"{BASE}/people/vote/{enc_a}"
    )
    print(f"  最終URL: {result_url}")
    print(f"  HTMLサイズ: {len(result_html)} bytes")
    print(f"  結果ページ判定: {is_result_page(result_html)}")
    print(f"\n  POSTレスポンスの Set-Cookie:")
    print_set_cookie_headers(result_sc)

    print_cookies(jar_a, "投票後のCookie jar (opener_a)")

except Exception as e:
    import traceback
    print(f"  ERROR: {e}")
    traceback.print_exc()
    sys.exit(1)

# ================================================================
# STEP 2: Cookie を持ったまま人物B（未投票）の結果ページへ
# ================================================================
section(f"STEP 2: Cookie保持のまま {NAME_B}（未投票）の結果ページへアクセス")
print("  → CookieがグローバルならB の結果が見える。人物ごとなら vote ページへリダイレクト。\n")

enc_b = urllib.parse.quote(NAME_B)
try:
    b_html, b_url, b_sc = fetch_get(opener_a, f"{BASE}/people/result/{enc_b}")
    print(f"  最終URL: {b_url}")
    print(f"  HTMLサイズ: {len(b_html)} bytes")
    is_result_b = is_result_page(b_html)
    is_redirected_to_vote = "/people/vote/" in b_url or b_url.rstrip("/") == BASE
    print(f"  結果ページ判定: {is_result_b}")
    print(f"  voteページへリダイレクト: {is_redirected_to_vote}")
    if is_result_b:
        print("\n  ★ 判定: Cookie はグローバル（一度投票すれば全員の結果を閲覧可能）")
    else:
        print("\n  ★ 判定: Cookie は人物ごと（B は未投票のため結果が見えない）")
    print_set_cookie_headers(b_sc)
except Exception as e:
    import traceback
    print(f"  ERROR: {e}")
    traceback.print_exc()

# ================================================================
# STEP 3: Cookie なし で人物A の結果ページへアクセス
# ================================================================
section(f"STEP 3: Cookie なし で {NAME_A} の結果ページへアクセス")
print("  → Cookieが必須かどうかを確認。\n")

opener_nocookie, jar_nocookie = make_opener()
try:
    nc_html, nc_url, nc_sc = fetch_get(opener_nocookie, f"{BASE}/people/result/{enc_a}")
    print(f"  最終URL: {nc_url}")
    print(f"  HTMLサイズ: {len(nc_html)} bytes")
    is_result_nc = is_result_page(nc_html)
    print(f"  結果ページ判定: {is_result_nc}")
    if is_result_nc:
        print("\n  ★ 判定: Cookie なしでも結果ページが見える（IPトラッキングで通過）")
    elif "/people/vote/" in nc_url or nc_url.rstrip("/") == BASE:
        print("\n  ★ 判定: Cookie なしは vote ページへリダイレクト（Cookie必須）")
    else:
        print(f"\n  ★ 判定: 不明なリダイレクト先 → {nc_url}")
    print_cookies(jar_nocookie, "Cookie jar (no cookie opener)")
except Exception as e:
    import traceback
    print(f"  ERROR: {e}")
    traceback.print_exc()

# ================================================================
# STEP 4: Cookie なし で人物A の投票ページへアクセス（IPトラッキング確認）
# ================================================================
section(f"STEP 4: Cookie なし で {NAME_A} の投票ページへアクセス（IPトラッキング確認）")
print("  → STEP1で同IPから投票済み。voteページが resultへリダイレクトされればIPトラッキングあり。\n")

opener_ip, jar_ip = make_opener()
try:
    ip_html, ip_url, ip_sc = fetch_get(opener_ip, f"{BASE}/people/vote/{enc_a}")
    print(f"  最終URL: {ip_url}")
    print(f"  HTMLサイズ: {len(ip_html)} bytes")
    is_result_ip = is_result_page(ip_html)
    is_vote_page = "/people/vote/" in ip_url
    print(f"  結果ページ判定: {is_result_ip}")
    if "/people/result/" in ip_url:
        print("\n  ★ 判定: IPトラッキングあり（Cookie なしでも result ページへ誘導された）")
    elif is_vote_page:
        print("\n  ★ 判定: IPトラッキングなし or 未記録（vote ページのまま）")
    else:
        print(f"\n  ★ 判定: 不明 → {ip_url}")
    print_cookies(jar_ip, "Cookie jar (IP test opener)")
except Exception as e:
    import traceback
    print(f"  ERROR: {e}")
    traceback.print_exc()

print("\n\n解析完了。詳細: scripts/out/analyze_vote_cookie.txt")
_out_file.close()
