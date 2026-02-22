"""
suki-kira.com に実際に投票POSTして、
レスポンス（結果ページ）のHTML構造を解析する。

※ 実際に投票が送信されます。テスト用の人物名を使うか、
   既に投票済みの場合は別の人物名に変えてください。

実行: python scripts/analyze_vote_post.py
出力: scripts/out/analyze_vote_post.txt にも保存される
"""

import urllib.request
import urllib.parse
import urllib.error
import re
import http.cookiejar
import sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_vote_post.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, *args, **kwargs):
        sys.__stdout__.write(*args, **kwargs)
        _out_file.write(*args, **kwargs)
    def flush(self):
        sys.__stdout__.flush()
        _out_file.flush()

sys.stdout = _Tee()

# ---- 設定 ----
# 投票する人物名（URLエンコードなし）
NAME = "木村拓哉"
ENCODED = urllib.parse.quote(NAME)

# 投票タイプ: "1" = 好き, "0" = 嫌い
VOTE_TYPE = "1"
# ---------------

BASE_URL = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

def section(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

# Cookie を保持するセッション
cookie_jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

def fetch_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with opener.open(req, timeout=15) as res:
        final_url = res.geturl()
        html = res.read().decode("utf-8", errors="replace")
        print(f"  → 最終URL: {final_url}")
        print(f"  → HTML長さ: {len(html)} 文字")
        return html

def fetch_post(url, data):
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={
        **HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Referer": f"{BASE_URL}/people/vote/{ENCODED}",
    })
    with opener.open(req, timeout=15) as res:
        final_url = res.geturl()
        html = res.read().decode("utf-8", errors="replace")
        print(f"  → 最終URL: {final_url}")
        print(f"  → HTML長さ: {len(html)} 文字")
        return html

# ----------------------------------------------------------------
# STEP 1: vote ページ GET → トークン取得
# ----------------------------------------------------------------
section(f"STEP 1: GET /people/vote/{NAME}")
vote_html = fetch_get(f"{BASE_URL}/people/vote/{ENCODED}")

def parse_token(html, name):
    # value が先のパターン
    m = re.search(rf'name="{name}"[^>]*value="([^"]+)"', html)
    if m: return m.group(1)
    # value が先のパターン
    m = re.search(rf'value="([^"]+)"[^>]*name="{name}"', html)
    if m: return m.group(1)
    return None

pid    = parse_token(vote_html, "id")
auth1  = parse_token(vote_html, "auth1")
auth2  = parse_token(vote_html, "auth2")
auth_r = parse_token(vote_html, "auth-r")

print(f"\n  id    = {pid}")
print(f"  auth1 = {auth1}")
print(f"  auth2 = {auth2}")
print(f"  auth-r= {auth_r}")

if not all([pid, auth1, auth2, auth_r]):
    print("\n  !! トークン取得失敗。スクリプトを終了します。")
    exit(1)

# ----------------------------------------------------------------
# STEP 2: POST 投票
# ----------------------------------------------------------------
section(f"STEP 2: POST /people/result/{NAME} (vote={VOTE_TYPE})")
post_data = {
    "vote":   VOTE_TYPE,
    "ok":     "ng",
    "id":     pid,
    "auth1":  auth1,
    "auth2":  auth2,
    "auth-r": auth_r,
}
print(f"  送信データ: {post_data}")

try:
    result_html = fetch_post(f"{BASE_URL}/people/result/{ENCODED}", post_data)
except urllib.error.HTTPError as e:
    print(f"  !! HTTP Error: {e.code}")
    result_html = e.read().decode("utf-8", errors="replace")
    print(f"  エラーHTML長さ: {len(result_html)}")

# ----------------------------------------------------------------
# STEP 3: レスポンス解析
# ----------------------------------------------------------------
section("STEP 3: POST レスポンスの構造解析")

print("\n[1] % を含む意味ある行:")
for m in re.finditer(r'(\d+\.?\d*)%', result_html):
    ctx_start = max(0, m.start() - 80)
    ctx_end   = min(len(result_html), m.end() + 80)
    ctx = result_html[ctx_start:ctx_end].replace('\n', ' ').strip()
    # CSS系は除外
    if any(kw in ctx for kw in ['font-size', 'width:', 'max-width', 'flex:', 'padding', 'margin', 'border-radius', 'og:url', 'E6%', 'E5%', 'E8%', 'E9%']):
        continue
    print(f"  {m.group()} → ...{ctx}...")

print("\n[2] 好き/嫌い に関連するテキスト行:")
for line in result_html.splitlines():
    clean = re.sub(r'<[^>]+>', '', line).strip()
    if ('好き' in clean or '嫌い' in clean) and clean and len(clean) < 200:
        print(f"  {clean}")

print("\n[3] コメントらしき要素（200文字以内のテキストブロック）:")
# <p> や <div> の中に長めのテキストがあるもの
for m in re.finditer(r'<(?:p|div|span)[^>]*>((?:[^<]|<(?!/))+)</(?:p|div|span)>', result_html):
    text = re.sub(r'<[^>]+>', '', m.group(1)).strip()
    if 10 < len(text) < 200 and not any(kw in text for kw in ['function', 'var ', 'document', 'http', '.css', '.js']):
        print(f"  [{len(text)}文字] {text}")

print("\n[4] script 内の result/percent/comment 関連:")
scripts = re.findall(r'<script[^>]*>([\s\S]*?)</script>', result_html)
for i, sc in enumerate(scripts):
    keywords = ['percent', 'comment', 'good_count', 'bad_count', 'like_count', 'vote_count', 'result']
    if any(kw in sc.lower() for kw in keywords):
        print(f"\n  --- script[{i}] ---")
        print(sc[:600])

print(f"\n[5] レスポンスHTML の最初の 3000 文字:")
print(result_html[:3000])

print(f"\n[6] レスポンスHTML の最後の 2000 文字:")
print(result_html[-2000:])

# ----------------------------------------------------------------
# STEP 4: Cookie 確認後に GET /people/result/ を再試行
# ----------------------------------------------------------------
section(f"STEP 4: Cookie 保持後に GET /people/result/{NAME}")
result_get_html = fetch_get(f"{BASE_URL}/people/result/{ENCODED}")

print("\n[GET result の og:url]:")
og_url = re.search(r'property="og:url"[^>]*content="([^"]+)"', result_get_html)
print(f"  {og_url.group(1) if og_url else 'なし'}")

print("\n[GET result の % 行]:")
for m in re.finditer(r'(\d+\.?\d*)%', result_get_html):
    ctx_start = max(0, m.start() - 80)
    ctx_end   = min(len(result_get_html), m.end() + 80)
    ctx = result_get_html[ctx_start:ctx_end].replace('\n', ' ').strip()
    if any(kw in ctx for kw in ['font-size', 'width:', 'max-width', 'flex:', 'padding', 'margin', 'border-radius', 'og:url', 'E6%', 'E5%', 'E8%', 'E9%']):
        continue
    print(f"  {m.group()} → ...{ctx}...")

print("\n解析完了。")
