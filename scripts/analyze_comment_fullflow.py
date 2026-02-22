"""
投票から始める完全フロー: 投票 → 結果ページ → コメント投稿
実行: python scripts/analyze_comment_fullflow.py
出力: scripts/out/analyze_comment_fullflow.txt
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_f = open(os.path.join(_out_dir, "analyze_comment_fullflow.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, *args, **kwargs):
        sys.__stdout__.write(*args, **kwargs)
        _f.write(*args, **kwargs)
    def flush(self):
        sys.__stdout__.flush()
        _f.flush()
sys.stdout = _Tee()

# あまり有名でない人物を選ぶ（IPにまだ投票記録がない可能性）
# いくつか試してみる
CANDIDATES = ["里見浩太朗", "加藤茶", "財前直見", "桂文枝"]

BASE = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    resp = opener.open(req, timeout=15)
    return resp.read().decode("utf-8", errors="replace"), resp.geturl()

def parse_input(html, name):
    m = (re.search(rf'name="{name}"[^>]*value="([^"]*)"', html) or
         re.search(rf'value="([^"]*)"[^>]*name="{name}"', html))
    return m.group(1) if m else None

def do_post(url, data, referer):
    body_enc = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body_enc, headers={
        **HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE, "Referer": referer,
    })
    resp = opener.open(req, timeout=15)
    return resp.read().decode("utf-8", errors="replace"), resp.geturl()

# 投票できる人物を探す
TARGET = None
for name in CANDIDATES:
    encoded = urllib.parse.quote(name)
    vote_html, vote_url = get(f"{BASE}/people/vote/{encoded}")
    print(f"[{name}] vote URL → {vote_url}")
    if "/people/vote/" in vote_url or "/people/result/" not in vote_url:
        # 投票ページが返ってきた（まだ投票していない）
        if re.search(r'name="auth1"', vote_html):
            TARGET = name
            print(f"  → 投票ページ取得成功！TARGET = {name}")
            break
    # リダイレクト先が result の場合はすでに投票済み
    if "/people/result/" in vote_url:
        print(f"  → 既に投票済みのためスキップ")

if not TARGET:
    print("投票可能な候補が見つかりませんでした。さかなクン（既投票済み）を使って続行します。")
    TARGET = "さかなクン"

print(f"\n==== TARGET: {TARGET} ====\n")
encoded = urllib.parse.quote(TARGET)

# 投票ページ取得 (fresh session)
print("STEP 1: 投票ページ取得")
vote_html, vote_url = get(f"{BASE}/people/vote/{encoded}")
print(f"  URL: {vote_url}")
print(f"  len: {len(vote_html)}")

# Cookieを確認
print(f"  Cookies: {[(c.name, c.value[:20]) for c in jar]}")

# 投票フォームトークン抽出
auth1 = parse_input(vote_html, "auth1")
auth2 = parse_input(vote_html, "auth2")
authr = parse_input(vote_html, "auth-r")
pid   = parse_input(vote_html, "id")
print(f"  tokens: id={pid}, auth1={auth1[:10] if auth1 else 'N/A'}...")

if not auth1:
    print("  投票フォームなし（既投票済みかresultにリダイレクト）")
    result_html, result_url = vote_html, vote_url
else:
    # STEP 2: 投票POST
    print("\nSTEP 2: 投票POST")
    result_html, result_url = do_post(
        f"{BASE}/people/result/{encoded}",
        {"vote": "1", "ok": "ng", "id": pid, "auth1": auth1, "auth2": auth2, "auth-r": authr},
        f"{BASE}/people/vote/{encoded}",
    )
    print(f"  URL: {result_url}, len: {len(result_html)}")
    print(f"  Cookies after vote: {[(c.name, c.value[:30]) for c in jar]}")
    is_result = bool(re.search(r'好き派:', result_html))
    print(f"  is result page: {is_result}")

# STEP 3: result ページの確認とコメントフォーム
print("\nSTEP 3: result ページのコメントフォーム確認")
if "/people/result/" not in result_url:
    print("  result ページに到達していない。cookieなしで取得を試みる")
    result_html, result_url = get(f"{BASE}/people/result/{encoded}")
    print(f"  URL: {result_url}")

action_m = re.search(r'action="(/people/comment/[^"]+)"', result_html)
action = action_m.group(1) if action_m else None
id_ = parse_input(result_html, "id")
sum_ = parse_input(result_html, "sum")
tag_id = parse_input(result_html, "tag_id")
auth1_c = parse_input(result_html, "auth1")
auth2_c = parse_input(result_html, "auth2")
authr_c = parse_input(result_html, "auth-r")
print(f"  action={action}, id={id_}, sum={sum_}, auth-r={authr_c!r}")
print(f"  Cookies: {[(c.name, c.value[:30]) for c in jar]}")

if not action:
    print("  ERROR: コメントフォームが見つかりません")
    _f.close()
    sys.exit(1)

# 最初のコメントIDを記録
base_id_m = re.search(r'class="comment-container c(\d+)"', result_html)
base_id = base_id_m.group(1) if base_id_m else "N/A"
print(f"  base first_id: {base_id}")

# STEP 4: 通常コメント投稿
print("\nSTEP 4: 通常コメント投稿（type=''）")
# 新しいトークンで再取得
result_html2, _ = get(f"{BASE}/people/result/{encoded}")
tokens = {
    "id": parse_input(result_html2, "id"),
    "sum": parse_input(result_html2, "sum"),
    "tag_id": parse_input(result_html2, "tag_id"),
    "auth1": parse_input(result_html2, "auth1"),
    "auth2": parse_input(result_html2, "auth2"),
    "authr": parse_input(result_html2, "auth-r"),
}
action_m2 = re.search(r'action="(/people/comment/[^"]+)"', result_html2)
action2 = action_m2.group(1) if action_m2 else action

try:
    resp_html, resp_url = do_post(
        f"{BASE}{action2}",
        {"id": tokens["id"], "name_id": "", "type": "", "url": TARGET,
         "body": "通常コメントテスト", "sum": tokens["sum"],
         "auth1": tokens["auth1"], "auth2": tokens["auth2"],
         "auth-r": tokens["authr"], "ok": "ok", "tag_id": tokens["tag_id"]},
        f"{BASE}/people/result/{encoded}",
    )
    new_id_m = re.search(r'class="comment-container c(\d+)"', resp_html)
    new_id = new_id_m.group(1) if new_id_m else "N/A"
    count = len(re.findall(r'class="comment-container', resp_html))
    print(f"  status=200, URL: {resp_url}, first_id={new_id}, count={count}")
    print(f"  → コメント保存: {'YES！' if new_id != base_id else 'NO（first_idが変わらず）'}")
except Exception as e:
    print(f"  ERROR: {e}")

# STEP 5: >>NNN 返信コメント投稿
print(f"\nSTEP 5: >>NNN 返信コメント投稿 (ref={base_id})")
result_html3, _ = get(f"{BASE}/people/result/{encoded}")
tokens2 = {
    "id": parse_input(result_html3, "id"),
    "sum": parse_input(result_html3, "sum"),
    "tag_id": parse_input(result_html3, "tag_id"),
    "auth1": parse_input(result_html3, "auth1"),
    "auth2": parse_input(result_html3, "auth2"),
    "authr": parse_input(result_html3, "auth-r"),
}
action_m3 = re.search(r'action="(/people/comment/[^"]+)"', result_html3)
action3 = action_m3.group(1) if action_m3 else action

try:
    resp_html2, resp_url2 = do_post(
        f"{BASE}{action3}",
        {"id": tokens2["id"], "name_id": "", "type": "", "url": TARGET,
         "body": f">>{base_id}\n返信テスト", "sum": tokens2["sum"],
         "auth1": tokens2["auth1"], "auth2": tokens2["auth2"],
         "auth-r": tokens2["authr"], "ok": "ok", "tag_id": tokens2["tag_id"]},
        f"{BASE}/people/result/{encoded}",
    )
    new_id2_m = re.search(r'class="comment-container c(\d+)"', resp_html2)
    new_id2 = new_id2_m.group(1) if new_id2_m else "N/A"
    count2 = len(re.findall(r'class="comment-container', resp_html2))
    print(f"  status=200, URL: {resp_url2}, first_id={new_id2}, count={count2}")
    print(f"  → コメント保存: {'YES！' if new_id2 != base_id else 'NO（first_idが変わらず）'}")
except Exception as e:
    print(f"  ERROR: {e}")

# STEP 6: >>NNN のみ（テキストなし）
print(f"\nSTEP 6: >>NNN のみ（body_text が短すぎる）")
result_html4, _ = get(f"{BASE}/people/result/{encoded}")
tokens3 = {
    "id": parse_input(result_html4, "id"),
    "sum": parse_input(result_html4, "sum"),
    "tag_id": parse_input(result_html4, "tag_id"),
    "auth1": parse_input(result_html4, "auth1"),
    "auth2": parse_input(result_html4, "auth2"),
    "authr": parse_input(result_html4, "auth-r"),
}
action_m4 = re.search(r'action="(/people/comment/[^"]+)"', result_html4)
action4 = action_m4.group(1) if action_m4 else action

try:
    resp_html3, resp_url3 = do_post(
        f"{BASE}{action4}",
        {"id": tokens3["id"], "name_id": "", "type": "", "url": TARGET,
         "body": f">>{base_id}", "sum": tokens3["sum"],  # テキストなし（アンカーのみ）
         "auth1": tokens3["auth1"], "auth2": tokens3["auth2"],
         "auth-r": tokens3["authr"], "ok": "ok", "tag_id": tokens3["tag_id"]},
        f"{BASE}/people/result/{encoded}",
    )
    new_id3_m = re.search(r'class="comment-container c(\d+)"', resp_html3)
    new_id3 = new_id3_m.group(1) if new_id3_m else "N/A"
    count3 = len(re.findall(r'class="comment-container', resp_html3))
    print(f"  status=200, URL: {resp_url3}, first_id={new_id3}, count={count3}")
    print(f"  → コメント保存: {'YES！' if new_id3 != base_id else 'NO'}")
except Exception as e:
    print(f"  ERROR: {e}")

_f.close()
