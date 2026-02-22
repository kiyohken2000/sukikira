"""
コメント投稿フォームの構造と投稿POST全フローを確認するスクリプト
実行: python scripts/analyze_comment_post.py
出力: scripts/out/analyze_comment_post.txt
"""
import urllib.request, urllib.parse, urllib.error, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_comment_post.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, *args, **kwargs):
        sys.__stdout__.write(*args, **kwargs)
        _out_file.write(*args, **kwargs)
    def flush(self):
        sys.__stdout__.flush()
        _out_file.flush()

sys.stdout = _Tee()

NAME    = "さかなクン"
ENCODED = urllib.parse.quote(NAME)
BASE    = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

jar    = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    resp = opener.open(req, timeout=15)
    final_url = resp.geturl()
    html = resp.read().decode("utf-8", errors="replace")
    return html, final_url

def post_raw(url, data, referer):
    body = urllib.parse.urlencode(data).encode()
    post_headers = {
        **HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE,
        "Referer": referer,
    }
    req = urllib.request.Request(url, data=body, headers=post_headers)
    resp = opener.open(req, timeout=15)
    final_url = resp.geturl()
    html = resp.read().decode("utf-8", errors="replace")
    return html, final_url, resp.status

# -----------------------------------------------------------------------
# STEP 1: 投票してCookieを取得 (result ページへのアクセス権を得る)
# -----------------------------------------------------------------------
print("=" * 60)
print("STEP 1: 投票ページを取得してトークンを取得")
print("=" * 60)
vote_html, vote_url = get(f"{BASE}/people/vote/{ENCODED}")
print(f"vote page final URL: {vote_url}")

def parse_input(html, name):
    m = (re.search(rf'name="{name}"[^>]*value="([^"]*)"', html) or
         re.search(rf'value="([^"]*)"[^>]*name="{name}"', html))
    return m.group(1) if m else None

pid   = parse_input(vote_html, "id")
auth1 = parse_input(vote_html, "auth1")
auth2 = parse_input(vote_html, "auth2")
authr = parse_input(vote_html, "auth-r")
print(f"  id={pid}, auth1={auth1[:10] if auth1 else None}..., auth-r={authr[:10] if authr else None}...")

print("\nSTEP 2: 投票POST")
result_html, result_url, status = post_raw(
    f"{BASE}/people/result/{ENCODED}",
    {"vote": "1", "ok": "ng", "id": pid, "auth1": auth1, "auth2": auth2, "auth-r": authr},
    f"{BASE}/people/vote/{ENCODED}",
)
print(f"  status={status}, final URL: {result_url}")
print(f"  result HTML length: {len(result_html)}")

# -----------------------------------------------------------------------
# STEP 2: result ページからコメントフォームの全 input を表示
# -----------------------------------------------------------------------
print("\n" + "=" * 60)
print("STEP 3: result ページのコメントフォーム全 input タグ")
print("=" * 60)

# コメントフォームを抽出
form_m = re.search(r'action="(/people/comment/[^"]+)"([\s\S]{0,3000}?)</form>', result_html)
if form_m:
    form_block = form_m.group(2)
    print(f"form action: {form_m.group(1)}")
    inputs = re.findall(r'<input[^>]+>', form_block)
    for inp in inputs:
        print(f"  {inp}")
    # textarea も確認
    textareas = re.findall(r'<textarea[^>]+>[\s\S]*?</textarea>', form_block)
    for ta in textareas:
        print(f"  [textarea] {ta[:200]}")
    # select も確認
    selects = re.findall(r'<select[^>]+>[\s\S]*?</select>', form_block)
    for sel in selects:
        print(f"  [select] {sel[:300]}")
    print(f"\n  フォーム全文 (最初の2000文字):")
    print(form_block[:2000])
else:
    print("  コメントフォームが見つかりません")
    # action="/people/comment/" を検索
    idxs = [m.start() for m in re.finditer(r'/people/comment/', result_html)]
    print(f"  /people/comment/ の出現位置: {idxs}")
    for idx in idxs[:3]:
        print(f"  context: {result_html[max(0,idx-100):idx+200]}")

# -----------------------------------------------------------------------
# STEP 3: コメント投稿POST（現在の実装と同じパラメータ）
# -----------------------------------------------------------------------
print("\n" + "=" * 60)
print("STEP 4: コメント投稿POST（現在の実装パラメータ）")
print("=" * 60)

def parse_comment_tokens(html):
    return {
        "action": re.search(r'action="(/people/comment/[^"]+)"', html),
        "id": parse_input(html, "id"),
        "sum": parse_input(html, "sum"),
        "tag_id": parse_input(html, "tag_id"),
        "auth1": parse_input(html, "auth1"),
        "auth2": parse_input(html, "auth2"),
        "auth_r": parse_input(html, "auth-r"),
    }

tokens = parse_comment_tokens(result_html)
action = tokens["action"].group(1) if tokens["action"] else None
print(f"  action={action}")
print(f"  id={tokens['id']}")
print(f"  sum={tokens['sum']}")
print(f"  tag_id={tokens['tag_id']}")
print(f"  auth1={tokens['auth1']}")
print(f"  auth2={tokens['auth2']}")
print(f"  auth-r from form={tokens['auth_r']}")  # ← これがポイント

if action:
    post_data = {
        "id": tokens["id"] or "",
        "name_id": "",
        "type": "",
        "url": NAME,
        "body": "テスト投稿です（削除してください）",
        "sum": tokens["sum"] or "0",
        "auth1": tokens["auth1"] or "",
        "auth2": tokens["auth2"] or "",
        "auth-r": "n",   # ← 現在の実装はハードコード 'n'
        "ok": "ok",
        "tag_id": tokens["tag_id"] or "",
    }
    print("\n  送信するデータ:")
    for k, v in post_data.items():
        print(f"    {k}={v!r}")

    try:
        resp_html, resp_url, resp_status = post_raw(
            f"{BASE}{action}",
            post_data,
            f"{BASE}/people/result/{ENCODED}",
        )
        print(f"\n  POST結果: status={resp_status}, final URL: {resp_url}")
        print(f"  response HTML length: {len(resp_html)}")
        # エラーメッセージを探す
        err_m = re.search(r'<div[^>]*class="[^"]*alert[^"]*"[^>]*>([\s\S]{0,500}?)</div>', resp_html)
        if err_m:
            print(f"  alertメッセージ: {err_m.group(1)}")
        # コメント数確認
        comment_count = len(re.findall(r'class="comment-container', resp_html))
        print(f"  レスポンス内のコメント数: {comment_count}")
        # 好き派の確認
        has_result = bool(re.search(r'好き派:', resp_html))
        print(f"  result ページか: {has_result}")
    except Exception as e:
        print(f"  POST失敗: {e}")

# -----------------------------------------------------------------------
# STEP 4: auth-r を正しく使って投稿テスト
# -----------------------------------------------------------------------
if action and tokens["auth_r"]:
    print("\n" + "=" * 60)
    print("STEP 5: auth-r を正しいフォーム値で投稿テスト")
    print("=" * 60)
    post_data2 = {
        "id": tokens["id"] or "",
        "name_id": "",
        "type": "",
        "url": NAME,
        "body": "テスト投稿2（削除してください）",
        "sum": tokens["sum"] or "0",
        "auth1": tokens["auth1"] or "",
        "auth2": tokens["auth2"] or "",
        "auth-r": tokens["auth_r"],   # ← フォームから取得した値
        "ok": "ok",
        "tag_id": tokens["tag_id"] or "",
    }
    print(f"  auth-r={tokens['auth_r']!r}")
    try:
        resp_html2, resp_url2, resp_status2 = post_raw(
            f"{BASE}{action}",
            post_data2,
            f"{BASE}/people/result/{ENCODED}",
        )
        print(f"  POST結果: status={resp_status2}, final URL: {resp_url2}")
        print(f"  response HTML length: {len(resp_html2)}")
        err_m2 = re.search(r'<div[^>]*class="[^"]*alert[^"]*"[^>]*>([\s\S]{0,500}?)</div>', resp_html2)
        if err_m2:
            print(f"  alertメッセージ: {err_m2.group(1)}")
        comment_count2 = len(re.findall(r'class="comment-container', resp_html2))
        print(f"  レスポンス内のコメント数: {comment_count2}")
    except Exception as e:
        print(f"  POST失敗: {e}")
else:
    print(f"\nSTEP 5: auth-r がフォームに存在しないためスキップ (auth_r={tokens['auth_r']})")

_out_file.close()
