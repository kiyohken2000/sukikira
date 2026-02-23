"""
コメント good/bad の重複投票・変更の動作を調査する。

調査内容:
  STEP 1: result ページを取得し、コメント・pidHash・xdate を取得
  STEP 2: 1件目のコメントに good 投票（1回目）→ レスポンス確認
  STEP 3: 同じコメントに good を再送（重複投票）→ 無視か加算か
  STEP 4: 同じコメントに bad 投票（good→bad 変更）→ 受け付けるか
  STEP 5: 別のコメントに bad 投票（正常ケース確認）
  STEP 6: result ページ再取得 → good/bad カウント変化を確認

実行: python scripts/analyze_comment_revote.py
出力: scripts/out/analyze_comment_revote.txt
"""

import urllib.request, urllib.parse, http.cookiejar, re, sys, os, json

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_comment_revote.txt"), "w", encoding="utf-8")

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

NAME = "大谷翔平"
BASE = "https://suki-kira.com"
API  = "https://api.suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

def section(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def fetch_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with opener.open(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace"), r.geturl()

def fetch_post_form(url, data, referer):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers={
        **HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE, "Referer": referer,
    })
    with opener.open(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace"), r.geturl()

def fetch_post_api(url, data):
    """api.suki-kira.com への POST"""
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers={
        **HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE,
        "Referer": f"{BASE}/people/result/{urllib.parse.quote(NAME)}",
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
    })
    try:
        with opener.open(req, timeout=15) as r:
            raw = r.read().decode("utf-8", errors="replace")
            return raw, r.status, r.geturl()
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        return raw, e.code, url

def parse_input(html, name):
    m = re.search(rf'name="{re.escape(name)}"[^>]*value="([^"]*)"', html)
    if m: return m.group(1)
    m = re.search(rf'value="([^"]*)"[^>]*name="{re.escape(name)}"', html)
    if m: return m.group(1)
    return None

def parse_comments(html):
    """コメントブロックを解析して {id, body_snip, upvotes, downvotes, token} のリストを返す"""
    # sukikira.js と同じ split 方式
    parts = html.split('<div class="comment-container c')
    comments = []
    for part in parts[1:]:
        id_m = re.match(r'^(\d+)"', part)
        if not id_m:
            continue
        cid   = id_m.group(1)
        token = re.search(r'data-token="([^"]+)"', part)
        up    = re.search(r'itemprop="upvoteCount"[^>]*content="(\d+)"', part)
        down  = re.search(r'itemprop="downvoteCount"[^>]*content="(\d+)"', part)
        body  = re.search(r'itemprop="reviewBody"[^>]*>([\s\S]*?)</p>', part)
        if token:
            body_text = re.sub(r'<[^>]+>', '', body.group(1) if body else '').strip()[:40]
            comments.append({
                "id":    cid,
                "body":  body_text,
                "up":    int(up.group(1)) if up else 0,
                "down":  int(down.group(1)) if down else 0,
                "token": token.group(1),
            })
        if len(comments) >= 10:
            break
    return comments

enc = urllib.parse.quote(NAME)
vote_url   = f"{BASE}/people/vote/{enc}"
result_url = f"{BASE}/people/result/{enc}"

import urllib.error

# ================================================================
# STEP 1: result ページ取得・pidHash / xdate / コメント確認
# ================================================================
section(f"STEP 1: {NAME} の result ページ取得")

vote_html, _ = fetch_get(vote_url)
pid    = parse_input(vote_html, "id")
auth1  = parse_input(vote_html, "auth1")
auth2  = parse_input(vote_html, "auth2")
auth_r = parse_input(vote_html, "auth-r")

if all([pid, auth1, auth2, auth_r]):
    print(f"  vote ページ取得成功 (id={pid}) → 投票して result 取得")
    result_html, _ = fetch_post_form(result_url, {
        "vote": "1", "ok": "ng", "id": pid,
        "auth1": auth1, "auth2": auth2, "auth-r": auth_r,
    }, referer=vote_url)
else:
    print("  IPトラッキングで result にリダイレクト済み → GET で result 取得")
    result_html = vote_html

xdate_m   = re.search(r'var xdate\s*=\s*"([^"]+)"', result_html)
pidhash_m = re.search(r'var pid_hash\s*=\s*"([^"]+)"', result_html)
xdate    = xdate_m.group(1) if xdate_m else None
pid_hash = pidhash_m.group(1) if pidhash_m else None

print(f"  xdate   : {xdate}")
print(f"  pid_hash: {pid_hash[:20] + '...' if pid_hash else None}")

comments = parse_comments(result_html)
print(f"  コメント取得数: {len(comments)}")
for i, c in enumerate(comments[:5]):
    print(f"  [{i}] id={c['id']:8s} up={c['up']:4d} down={c['down']:4d} token={c['token'][:20]}... | {c['body']!r}")

if not comments or not xdate or not pid_hash:
    print("  !! 必要なデータ取得失敗。終了。")
    _out_file.close()
    sys.exit(1)

# ================================================================
# STEP 2: コメント[0] に good 投票（1回目）
# ================================================================
section("STEP 2: コメント[0] に good 投票（1回目）")

c0 = comments[0]
url_good = f"{API}/comment/vote?xdate={urllib.parse.quote(xdate)}&evl=like"
print(f"  POST {url_good}")
print(f"  body: pid=..., token={c0['token'][:20]}...")

raw1, status1, _ = fetch_post_api(url_good, {"pid": pid_hash, "token": c0["token"]})
print(f"  HTTP: {status1}")
print(f"  response({len(raw1)}): {raw1[:300]}")
try:
    print(f"  JSON: {json.dumps(json.loads(raw1), ensure_ascii=False)}")
except Exception:
    pass

# ================================================================
# STEP 3: 同じコメントに good 再送（重複投票）
# ================================================================
section("STEP 3: コメント[0] に good 再送（重複投票テスト）")

raw2, status2, _ = fetch_post_api(url_good, {"pid": pid_hash, "token": c0["token"]})
print(f"  HTTP: {status2}")
print(f"  response({len(raw2)}): {raw2[:300]}")
try:
    print(f"  JSON: {json.dumps(json.loads(raw2), ensure_ascii=False)}")
except Exception:
    pass

if raw1 == raw2:
    print("  ★ 1回目と同じレスポンス → 重複は idempotent（加算されない可能性）")
else:
    print("  ★ レスポンスが異なる → 状態が変化（加算 or エラー）")

# ================================================================
# STEP 4: 同じコメントに bad 投票（good→bad 変更）
# ================================================================
section("STEP 4: コメント[0] に bad 投票（good→bad 変更テスト）")

url_bad = f"{API}/comment/vote?xdate={urllib.parse.quote(xdate)}&evl=dislike"
print(f"  POST {url_bad}")

raw3, status3, _ = fetch_post_api(url_bad, {"pid": pid_hash, "token": c0["token"]})
print(f"  HTTP: {status3}")
print(f"  response({len(raw3)}): {raw3[:300]}")
try:
    print(f"  JSON: {json.dumps(json.loads(raw3), ensure_ascii=False)}")
except Exception:
    pass

# ================================================================
# STEP 5: 別のコメントに bad 投票（正常ケース確認）
# ================================================================
section("STEP 5: コメント[1] に bad 投票（正常ケース）")

if len(comments) < 2:
    print("  コメントが1件しかないためスキップ。")
else:
    c1 = comments[1]
    print(f"  POST {url_bad}")
    print(f"  body: token={c1['token'][:20]}...")

    raw4, status4, _ = fetch_post_api(url_bad, {"pid": pid_hash, "token": c1["token"]})
    print(f"  HTTP: {status4}")
    print(f"  response({len(raw4)}): {raw4[:300]}")
    try:
        print(f"  JSON: {json.dumps(json.loads(raw4), ensure_ascii=False)}")
    except Exception:
        pass

# ================================================================
# STEP 6: result 再取得 → カウント変化確認
# ================================================================
section("STEP 6: result ページ再取得 → good/bad カウント変化確認")

result_html2, _ = fetch_get(result_url)
comments2 = parse_comments(result_html2)

print(f"  コメント取得数: {len(comments2)}")
print(f"\n  {'id':>8}  {'good前':>6} → {'good後':>6}  Δgood  {'bad前':>6} → {'bad後':>6}  Δbad")
print(f"  {'-'*60}")
for before, after in zip(comments[:min(3,len(comments2))], comments2[:min(3,len(comments2))]):
    dg = after['up']   - before['up']
    db = after['down'] - before['down']
    print(f"  {before['id']:>8}  {before['up']:>6} → {after['up']:>6}  ({dg:+3d})  {before['down']:>6} → {after['down']:>6}  ({db:+3d})")

print("\n  【判定】")
if comments and comments2:
    dg0 = comments2[0]['up']   - comments[0]['up']
    db0 = comments2[0]['down'] - comments[0]['down']
    if dg0 == 0 and db0 == 0:
        print("  ★ カウント変化なし → 重複・変更ともにサーバーが無視（IP/セッション単位で1回限り）")
    elif dg0 > 0 and db0 == 0:
        print(f"  ★ good が +{dg0} → 重複投票が加算されている（制限なし）")
    elif dg0 > 0 and db0 > 0:
        print(f"  ★ good +{dg0} / bad +{db0} → 重複・変更ともに加算されている")
    else:
        print(f"  ★ 不明（dg={dg0}, db={db0}）")

_out_file.close()
print("\n解析完了。詳細: scripts/out/analyze_comment_revote.txt")
