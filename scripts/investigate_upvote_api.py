"""
コメント upvote/downvote 数取得の可能性を調査
  1. people-result.js の完全ソースを解析（既に取得済み）
  2. result ページの HTML を保存して未発見の API パターンを探す
  3. good/bad POST のレスポンスに投票数が含まれるか確認

実行: python scripts/investigate_upvote_api.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, json, sys, os, time

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "investigate_upvote_api.txt"), "w", encoding="utf-8")

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

# あまり有名でない人物を使う（投票が新鮮に行える可能性が高い）
NAME    = "木村拓哉"
ENCODED = urllib.parse.quote(NAME)
BASE    = "https://suki-kira.com"

MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

jar    = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def get(url, ua=MOBILE_UA):
    """GET リクエスト"""
    headers = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja-JP,ja;q=0.9",
    }
    req = urllib.request.Request(url, headers=headers)
    with opener.open(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace"), r.url

def post(url, data, referer):
    """POST リクエスト"""
    body = urllib.parse.urlencode(data).encode()
    headers = {
        "User-Agent": MOBILE_UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE,
        "Referer": referer,
    }
    req = urllib.request.Request(url, data=body, headers=headers)
    with opener.open(req, timeout=15) as r:
        raw = r.read()
        return raw, r.url, dict(r.headers), r.status

# ============================================================
# 0. 投票フローで result ページを取得
# ============================================================
print("=" * 70)
print("0. 投票フローで result ページ HTML を取得")
print("=" * 70)

print("\n[0a] vote ページ取得...")
vote_html, _ = get(f"{BASE}/people/vote/{ENCODED}")
print(f"  vote HTML: {len(vote_html)} chars")

# トークン抽出
pid_m   = re.search(r'name="id"[^>]*value="([^"]+)"', vote_html)
auth1_m = re.search(r'name="auth1"[^>]*value="([^"]+)"', vote_html)
auth2_m = re.search(r'name="auth2"[^>]*value="([^"]+)"', vote_html)
authr_m = re.search(r'name="auth-r"[^>]*value="([^"]+)"', vote_html)

result_html = ""

if pid_m and auth1_m and auth2_m and authr_m:
    print("  トークン取得成功")
    print(f"\n[0b] 投票 POST...")
    try:
        raw_result, result_url, _, status = post(
            f"{BASE}/people/result/{ENCODED}",
            {
                "vote": "1", "ok": "ng",
                "id": pid_m.group(1),
                "auth1": auth1_m.group(1),
                "auth2": auth2_m.group(1),
                "auth-r": authr_m.group(1),
            },
            referer=f"{BASE}/people/vote/{ENCODED}"
        )
        result_html = raw_result.decode("utf-8", errors="replace")
        print(f"  Status: {status}")
        print(f"  Result URL: {result_url}")
        print(f"  HTML size: {len(result_html)} chars")
        is_result = bool(re.search(r'好き派:', result_html))
        print(f"  結果ページ?: {is_result}")
    except Exception as e:
        print(f"  投票 POST エラー: {e}")

# 投票 POST が空ボディだった場合、様々な方法で result ページ取得を試す
if len(result_html) < 100:
    print(f"\n[0c] 投票 POST が空ボディ。別の方法を試す...")

    # 方法1: デスクトップ UA で GET
    print("\n  方法1: デスクトップ UA で GET result ページ")
    try:
        html, url = get(f"{BASE}/people/result/{ENCODED}", ua=DESKTOP_UA)
        print(f"    HTML: {len(html)} chars, URL: {url}")
        if len(html) > len(result_html):
            result_html = html
    except Exception as e:
        print(f"    エラー: {e}")

    # 方法2: vote ページの HTML を使う（コメント情報はないが JS 参照は含む）
    if len(result_html) < 100:
        print("\n  方法2: vote ページ HTML を代替として使用")
        # vote ページにも JS 参照があるかもしれない
        vote_js_urls = re.findall(r'<script[^>]+src="([^"]*\.js[^"]*)"', vote_html)
        print(f"    vote ページの JS URLs: {vote_js_urls}")
        # vote ページのフォーム構造を保存
        result_html = vote_html  # fallback

# ============================================================
# 1. people-result.js 解析
# ============================================================
print("\n\n" + "=" * 70)
print("1. people-result.js 解析（既に取得済みファイルを使用）")
print("=" * 70)

# 前回取得済みの JS を読む
js_save_path = os.path.join(_out_dir, "people-result.js")
if os.path.exists(js_save_path):
    with open(js_save_path, "r", encoding="utf-8") as f:
        js_content = f.read()
    print(f"  読み込み: {js_save_path} ({len(js_content)} chars)")
else:
    print("  ファイルなし。新規取得...")
    req = urllib.request.Request(f"{BASE}/assets/js/people-result.js?v=20250822", headers={
        "User-Agent": MOBILE_UA, "Accept": "*/*",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        js_content = r.read().decode("utf-8", errors="replace")
    with open(js_save_path, "w", encoding="utf-8") as f:
        f.write(js_content)
    print(f"  取得・保存: {len(js_content)} chars")

# --- 重要: commentVote のクリックハンドラを詳細解析 ---
print("\n[1a] commentVote クリックハンドラ（good/bad ボタン）:")
# id^='commentVote' のハンドラ
cv_match = re.search(
    r'\$\("\[id\^=\'commentVote\'\]"\)\.click\(function\s*\(\)\s*\{([\s\S]*?)^\}\)',
    js_content, re.MULTILINE
)
if cv_match:
    cv_handler = cv_match.group(1)
    print(f"  ハンドラ長さ: {len(cv_handler)} chars")
    print(cv_handler)

# --- good/bad POST の AJAX 部分を詳細解析 ---
print("\n[1b] AJAX 呼び出し（全件）:")
# $.ajax パターンを手動で抽出
ajax_blocks = []
idx = 0
while True:
    pos = js_content.find("$.ajax(", idx)
    if pos == -1:
        pos = js_content.find("$.get(", idx)
        if pos == -1:
            break
    end = js_content.find("})", pos)
    if end == -1:
        break
    block = js_content[pos:end+2]
    ajax_blocks.append((pos, block))
    idx = end + 2

print(f"  AJAX ブロック数: {len(ajax_blocks)}")
for i, (pos, block) in enumerate(ajax_blocks):
    print(f"\n  --- AJAX #{i+1} (pos={pos}) ---")
    print(f"  {block}")

# --- api.suki-kira.com の発見 ---
print("\n[1c] api.suki-kira.com 関連:")
api_matches = re.findall(r'.{0,30}api\.suki-kira\.com.{0,100}', js_content)
for m in api_matches:
    print(f"  {m.strip()}")

# --- エンドポイントまとめ ---
print("\n[1d] 発見されたエンドポイント一覧:")
endpoints = re.findall(r'url:\s*["\']([^"\']+)["\']', js_content)
endpoints += re.findall(r'url:\s*"([^"]*?)"', js_content)
# 動的URL
dyn_endpoints = re.findall(r'url:\s*([^,\n]+)', js_content)
for e in sorted(set(endpoints)):
    print(f"  {e}")
print(f"\n  動的 URL:")
for e in sorted(set(dyn_endpoints)):
    print(f"  {e.strip()}")

# ============================================================
# 2. result ページ HTML 解析
# ============================================================
print("\n\n" + "=" * 70)
print("2. result ページ HTML 解析")
print("=" * 70)

html_save_path = os.path.join(_out_dir, "result_page.html")
with open(html_save_path, "w", encoding="utf-8") as f:
    f.write(result_html)
print(f"  保存先: {html_save_path}")
print(f"  HTML size: {len(result_html)} chars")

# pid, sk_token を抽出
pid_match = re.search(r'var\s+pid\s*=\s*["\']([^"\']+)["\']', result_html)
sk_token_match = re.search(r'var\s+sk_token\s*=\s*["\']([^"\']+)["\']', result_html)
xdate_match = re.search(r'var\s+xdate\s*=\s*["\']([^"\']+)["\']', result_html)
pid_hash_match = re.search(r'var\s+pid_hash\s*=\s*["\']([^"\']+)["\']', result_html)

pid = pid_match.group(1) if pid_match else None
sk_token = sk_token_match.group(1) if sk_token_match else None
xdate = xdate_match.group(1) if xdate_match else None
pid_hash = pid_hash_match.group(1) if pid_hash_match else None

print(f"\n  pid: {pid}")
print(f"  sk_token: {sk_token}")
print(f"  xdate: {xdate}")
print(f"  pid_hash: {pid_hash}")

# コメント ID を取得
comment_ids = re.findall(r'<div class="comment-container c(\d+)"', result_html)
print(f"  コメント数: {len(comment_ids)}")
if comment_ids:
    print(f"  ID範囲: {max(comment_ids, key=int)} ~ {min(comment_ids, key=int)}")
    print(f"  先頭5件: {comment_ids[:5]}")

# commentVote ボタンの id 属性を解析（id に like/dislike 数が含まれる）
print("\n[2a] commentVote ボタンの id 属性:")
cv_ids = re.findall(r'id=["\']commentVote[^"\']*["\']', result_html)
print(f"  commentVote ボタン数: {len(cv_ids)}")
for cv in cv_ids[:10]:
    print(f"    {cv}")

# commentVote ボタンの完全 HTML
print("\n[2b] commentVote ボタン（最初の数件の完全 HTML）:")
cv_elements = re.findall(r'<[^>]*id=["\']commentVote[^"\']*["\'][^>]*>[^<]*</[^>]+>', result_html)
for cv in cv_elements[:6]:
    print(f"    {cv.strip()}")

# good/bad バーの HTML
print("\n[2c] good/bad バー HTML:")
bar_pattern = re.findall(r'<div[^>]*id="[^"]*-(?:like|dislike)"[^>]*>[\s\S]{0,200}?</div>', result_html)
for b in bar_pattern[:6]:
    print(f"    {b.strip()[:200]}")

# コメント全体の HTML 構造（最初の1件）
print("\n[2d] 最初のコメントの完全 HTML:")
if comment_ids:
    first_id = comment_ids[0]
    pattern = f'<div class="comment-container c{first_id}[\\s\\S]*?(?=<div class="comment-container c|<nav|<div class="pagination|$)'
    first_match = re.search(pattern, result_html)
    if first_match:
        print(first_match.group(0)[:3000])

# JavaScript 変数の調査
print("\n[2e] JavaScript 変数:")
js_vars = re.findall(r'var\s+(\w+)\s*=\s*([^;\n]{1,200})', result_html)
for name, val in js_vars:
    print(f"    var {name} = {val.strip()}")

# ============================================================
# 3. good/bad POST のレスポンス詳細調査
# ============================================================
print("\n\n" + "=" * 70)
print("3. good/bad POST のレスポンス詳細調査")
print("=" * 70)

# people-result.js から判明した good/bad の AJAX エンドポイント:
#   url: "https://api.suki-kira.com/comment/vote?xdate=" + xdate + "&evl=" + obj[1]
#   POST data: { pid: pid_hash, token: obj[5] }
#   obj = id.split("-") → id = "commentVote-like-{cid}-{likeCount}-{dislikeCount}-{token}"

print("\n[3a] JS から判明した good/bad AJAX エンドポイント:")
print("  URL: https://api.suki-kira.com/comment/vote?xdate={xdate}&evl={like|dislike}")
print("  POST data: { pid: pid_hash, token: {token from button id} }")
print(f"  xdate: {xdate}")
print(f"  pid_hash: {pid_hash}")

if cv_ids:
    # commentVote ボタンの id からトークンを抽出
    # id format: commentVote-{like|dislike}-{cid}-{likeCount}-{dislikeCount}-{token}
    print("\n[3b] commentVote ボタンから情報抽出:")
    for cv in cv_ids[:4]:
        cv_id = re.search(r'["\']([^"\']+)["\']', cv).group(1)
        parts = cv_id.split("-")
        print(f"    id={cv_id}")
        print(f"    parts: {parts}")
        if len(parts) >= 6:
            print(f"      type={parts[1]}, cid={parts[2]}, likes={parts[3]}, dislikes={parts[4]}, token={parts[5]}")

if xdate and pid_hash and cv_ids:
    # 実際に API を叩いてレスポンスを確認
    # 最初の commentVote ボタンから token を取得
    first_cv_id = re.search(r'["\']([^"\']+)["\']', cv_ids[0]).group(1)
    parts = first_cv_id.split("-")

    if len(parts) >= 6:
        token = parts[5]
        cid = parts[2]
        evl_type = parts[1]  # "like" or "dislike"

        api_url = f"https://api.suki-kira.com/comment/vote?xdate={xdate}&evl={evl_type}"
        print(f"\n[3c] api.suki-kira.com に POST")
        print(f"  URL: {api_url}")
        print(f"  Data: pid={pid_hash}, token={token}")

        try:
            raw_resp, resp_url, resp_headers, status = post(
                api_url,
                {"pid": pid_hash, "token": token},
                referer=f"{BASE}/people/result/{ENCODED}"
            )
            resp_text = raw_resp.decode("utf-8", errors="replace")
            print(f"  Status: {status}")
            print(f"  Response URL: {resp_url}")
            print(f"  Response headers:")
            for k, v in resp_headers.items():
                print(f"    {k}: {v}")
            print(f"  Response body ({len(resp_text)} chars): {repr(resp_text[:500])}")
            try:
                parsed = json.loads(resp_text)
                print(f"  Parsed JSON: {json.dumps(parsed, ensure_ascii=False, indent=2)}")
            except:
                print(f"  (JSONではない)")
        except Exception as e:
            print(f"  エラー: {e}")

        # 2番目のボタン（違う type）も試す
        if len(cv_ids) > 1:
            second_cv_id = re.search(r'["\']([^"\']+)["\']', cv_ids[1]).group(1)
            parts2 = second_cv_id.split("-")
            if len(parts2) >= 6:
                api_url2 = f"https://api.suki-kira.com/comment/vote?xdate={xdate}&evl={parts2[1]}"
                print(f"\n[3d] 2つ目の good/bad POST")
                print(f"  URL: {api_url2}")
                print(f"  Data: pid={pid_hash}, token={parts2[5]}")
                try:
                    raw2, _, hdrs2, st2 = post(
                        api_url2,
                        {"pid": pid_hash, "token": parts2[5]},
                        referer=f"{BASE}/people/result/{ENCODED}"
                    )
                    text2 = raw2.decode("utf-8", errors="replace")
                    print(f"  Status: {st2}, body: {repr(text2[:500])}")
                    try:
                        print(f"  Parsed: {json.loads(text2)}")
                    except:
                        pass
                except Exception as e:
                    print(f"  エラー: {e}")

# 3e: 個別コメント API のレスポンスを再確認
if pid and sk_token and comment_ids:
    cid = comment_ids[0]
    url = f"{BASE}/p/{pid}/c/{cid}/t/{sk_token}"
    print(f"\n[3e] 個別コメント API GET: {url}")
    try:
        resp, final_url = get(url)
        print(f"  Response ({len(resp)} chars): {repr(resp[:500])}")
        try:
            parsed = json.loads(resp)
            print(f"  Parsed JSON: {json.dumps(parsed, ensure_ascii=False, indent=2)}")
            print(f"  Keys: {list(parsed.keys())}")
        except:
            pass
    except Exception as e:
        print(f"  エラー: {e}")

# ============================================================
# 4. api.suki-kira.com の他のエンドポイント探索
# ============================================================
print("\n\n" + "=" * 70)
print("4. api.suki-kira.com 探索")
print("=" * 70)

# healthcheck エンドポイント
if pid:
    hc_url = f"{BASE}/people/vote/healthcheck?pid={pid}"
    print(f"\n[4a] healthcheck: {hc_url}")
    try:
        resp, _ = get(hc_url)
        print(f"  Response: {repr(resp[:200])}")
    except Exception as e:
        print(f"  エラー: {e}")

# api.suki-kira.com のルート
print(f"\n[4b] api.suki-kira.com ルートアクセス:")
for path in ["", "/comment", "/comment/vote"]:
    url = f"https://api.suki-kira.com{path}"
    try:
        resp, final = get(url)
        print(f"  GET {url}: {len(resp)} chars, final={final}")
        print(f"    body: {repr(resp[:200])}")
    except Exception as e:
        print(f"  GET {url}: {e}")

# search/tag API
print(f"\n[4c] search/tag API:")
try:
    resp, _ = get(f"{BASE}/search/tag/{ENCODED}")
    print(f"  Response: {repr(resp[:300])}")
except Exception as e:
    print(f"  エラー: {e}")

print("\n\n" + "=" * 70)
print("調査完了")
print("=" * 70)

_out_file.close()
