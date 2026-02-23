"""
コメント good/bad 投票の xdate 有効期限を調査する。

xdate は result ページ HTML の `var xdate = "2026-02-23T21:17:45"` として埋め込まれている。
ユーザーが詳細画面を長時間開いたまま放置してからコメントに投票した場合、
xdate が期限切れになっていないか確認する。

調査内容:
  STEP 1: result ページを取得し xdate・コメントを取得
  STEP 2: 現在の xdate で good 投票（ベースライン）
  STEP 3: xdate を少し過去に変更（-1分）して投票
  STEP 4: xdate を大幅に過去に変更（-1時間）して投票
  STEP 5: xdate を昨日に変更して投票
  STEP 6: xdate を空文字にして投票
  STEP 7: xdate を未来日時に変更して投票

各STEPで異なるコメントを使い、レスポンス値（0=成功, 5=拒否）を確認する。

実行: python scripts/analyze_xdate.py
出力: scripts/out/analyze_xdate.txt
"""

import urllib.request, urllib.parse, http.cookiejar, re, sys, os, json, datetime

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_xdate.txt"), "w", encoding="utf-8")

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

import urllib.error

def vote_comment(xdate, pid_hash, token, evl="like"):
    url = f"{API}/comment/vote?xdate={urllib.parse.quote(xdate)}&evl={evl}"
    body = urllib.parse.urlencode({"pid": pid_hash, "token": token}).encode()
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
            return raw, r.status
    except urllib.error.HTTPError as e:
        return e.read().decode("utf-8", errors="replace"), e.code

def parse_input(html, name):
    m = re.search(rf'name="{re.escape(name)}"[^>]*value="([^"]*)"', html)
    if m: return m.group(1)
    m = re.search(rf'value="([^"]*)"[^>]*name="{re.escape(name)}"', html)
    if m: return m.group(1)
    return None

def parse_comments(html):
    parts = html.split('<div class="comment-container c')
    comments = []
    for part in parts[1:]:
        id_m = re.match(r'^(\d+)"', part)
        if not id_m: continue
        token = re.search(r'data-token="([^"]+)"', part)
        up    = re.search(r'itemprop="upvoteCount"[^>]*content="(\d+)"', part)
        down  = re.search(r'itemprop="downvoteCount"[^>]*content="(\d+)"', part)
        if token:
            comments.append({
                "id":    id_m.group(1),
                "up":    int(up.group(1)) if up else 0,
                "down":  int(down.group(1)) if down else 0,
                "token": token.group(1),
            })
        if len(comments) >= 20:
            break
    return comments

def fmt_result(raw, status):
    verdict = {
        "0": "受け付け (0=OK)",
        "5": "拒否 (5=重複/無効)",
    }.get(raw.strip(), f"不明 ({raw.strip()[:30]})")
    return f"HTTP {status} → {verdict}"

enc = urllib.parse.quote(NAME)
vote_url   = f"{BASE}/people/vote/{enc}"
result_url = f"{BASE}/people/result/{enc}"

# ================================================================
# STEP 1: result ページ取得
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
xdate_orig = xdate_m.group(1) if xdate_m else None
pid_hash   = pidhash_m.group(1) if pidhash_m else None

print(f"  xdate（ページ埋め込み）: {xdate_orig}")
print(f"  pid_hash: {pid_hash}")

comments = parse_comments(result_html)
print(f"  コメント取得数: {len(comments)}")
for i, c in enumerate(comments[:8]):
    print(f"  [{i}] id={c['id']:8s} token={c['token'][:16]}...")

if not comments or not xdate_orig or not pid_hash:
    print("  !! 必要なデータ取得失敗。終了。")
    _out_file.close()
    sys.exit(1)

# xdate を datetime に変換
xdate_dt = datetime.datetime.fromisoformat(xdate_orig)
print(f"\n  xdate を datetime 変換: {xdate_dt}")
print(f"  現在時刻(UTC):          {datetime.datetime.utcnow().replace(microsecond=0)}")
diff = datetime.datetime.utcnow() - xdate_dt
print(f"  xdate からの経過時間:   {diff}")

# テスト用 xdate バリエーション
xdate_minus1m  = (xdate_dt - datetime.timedelta(minutes=1)).isoformat(timespec='seconds')
xdate_minus1h  = (xdate_dt - datetime.timedelta(hours=1)).isoformat(timespec='seconds')
xdate_yesterday = (xdate_dt - datetime.timedelta(days=1)).isoformat(timespec='seconds')
xdate_future   = (xdate_dt + datetime.timedelta(hours=1)).isoformat(timespec='seconds')

print(f"\n  テスト用 xdate 一覧:")
print(f"    本物      : {xdate_orig}")
print(f"    -1分      : {xdate_minus1m}")
print(f"    -1時間    : {xdate_minus1h}")
print(f"    昨日      : {xdate_yesterday}")
print(f"    空文字    : ''")
print(f"    +1時間(未来): {xdate_future}")

# ================================================================
# STEP 2: 本物の xdate で投票（ベースライン）
# ================================================================
section("STEP 2: 本物の xdate で good 投票（ベースライン）")
c = comments[0]
raw, st = vote_comment(xdate_orig, pid_hash, c["token"], "like")
print(f"  xdate = {xdate_orig}")
print(f"  コメント id = {c['id']}")
print(f"  → {fmt_result(raw, st)}")

# ================================================================
# STEP 3: xdate を -1分に変更
# ================================================================
section("STEP 3: xdate を -1分に変更して投票")
c = comments[1]
raw, st = vote_comment(xdate_minus1m, pid_hash, c["token"], "like")
print(f"  xdate = {xdate_minus1m}（本物より1分古い）")
print(f"  コメント id = {c['id']}")
print(f"  → {fmt_result(raw, st)}")

# ================================================================
# STEP 4: xdate を -1時間に変更
# ================================================================
section("STEP 4: xdate を -1時間に変更して投票")
c = comments[2]
raw, st = vote_comment(xdate_minus1h, pid_hash, c["token"], "like")
print(f"  xdate = {xdate_minus1h}（本物より1時間古い）")
print(f"  コメント id = {c['id']}")
print(f"  → {fmt_result(raw, st)}")

# ================================================================
# STEP 5: xdate を昨日に変更
# ================================================================
section("STEP 5: xdate を昨日に変更して投票")
c = comments[3]
raw, st = vote_comment(xdate_yesterday, pid_hash, c["token"], "like")
print(f"  xdate = {xdate_yesterday}（24時間前）")
print(f"  コメント id = {c['id']}")
print(f"  → {fmt_result(raw, st)}")

# ================================================================
# STEP 6: xdate を空文字にして投票
# ================================================================
section("STEP 6: xdate を空文字にして投票")
c = comments[4]
raw, st = vote_comment("", pid_hash, c["token"], "like")
print(f"  xdate = '' (空文字)")
print(f"  コメント id = {c['id']}")
print(f"  → {fmt_result(raw, st)}")

# ================================================================
# STEP 7: xdate を未来日時に変更
# ================================================================
section("STEP 7: xdate を +1時間（未来）に変更して投票")
c = comments[5]
raw, st = vote_comment(xdate_future, pid_hash, c["token"], "like")
print(f"  xdate = {xdate_future}（1時間後）")
print(f"  コメント id = {c['id']}")
print(f"  → {fmt_result(raw, st)}")

# ================================================================
# まとめ
# ================================================================
section("まとめ")
print("""
【調査ポイント】
- 全ての xdate で 0（受け付け）→ サーバーは xdate を検証していない（フォーマットチェックのみ？）
- 本物のみ 0・その他は 5 → xdate に厳密な有効期限あり
- 全て 5 → 既に IP で投票済み（今回の調査では同 IP から連続実行のため）

【アプリへの影響】
- xdate が検証されない → 長時間放置後でもコメント good/bad は動作する
- xdate に有効期限あり → 一定時間後に詳細画面を再ロードしないと投票失敗
""")

_out_file.close()
print("解析完了。詳細: scripts/out/analyze_xdate.txt")
