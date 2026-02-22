"""
type="好き派"/"嫌い派" で投稿すると保存されるか確認
実行: python scripts/analyze_comment_post3.py
出力: scripts/out/analyze_comment_post3.txt
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_f = open(os.path.join(_out_dir, "analyze_comment_post3.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, *args, **kwargs):
        sys.__stdout__.write(*args, **kwargs)
        _f.write(*args, **kwargs)
    def flush(self):
        sys.__stdout__.flush()
        _f.flush()

sys.stdout = _Tee()

NAME = "さかなクン"
ENCODED = urllib.parse.quote(NAME)
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

def get_tokens(html):
    action_m = re.search(r'action="(/people/comment/[^"]+)"', html)
    return {
        "action": action_m.group(1) if action_m else None,
        "id": parse_input(html, "id"),
        "sum": parse_input(html, "sum"),
        "tag_id": parse_input(html, "tag_id"),
        "auth1": parse_input(html, "auth1"),
        "auth2": parse_input(html, "auth2"),
        "authr": parse_input(html, "auth-r"),
    }

def post_comment(action, id_, type_, body_text, sum_, auth1, auth2, authr, tag_id, label):
    data = {
        "id": id_, "name_id": "", "type": type_, "url": NAME,
        "body": body_text, "sum": sum_, "auth1": auth1, "auth2": auth2,
        "auth-r": authr, "ok": "ok", "tag_id": tag_id,
    }
    body_enc = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(
        f"{BASE}{action}", data=body_enc,
        headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded",
                 "Origin": BASE, "Referer": f"{BASE}/people/result/{ENCODED}"},
    )
    try:
        resp = opener.open(req, timeout=15)
        html = resp.read().decode("utf-8", errors="replace")
        # 最初のコメント情報
        first_id = re.search(r'class="comment-container c(\d+)"', html)
        first_id_val = first_id.group(1) if first_id else "N/A"
        count = len(re.findall(r'class="comment-container', html))
        # 最新コメントの本文
        body_m = re.search(r'itemprop="reviewBody"[^>]*>([\s\S]{0,200}?)</p>', html)
        latest = body_m.group(1)[:100] if body_m else "N/A"
        latest_clean = re.sub(r'<[^>]+>', '', latest).replace('\n', ' ').strip()
        print(f"[{label}] status=200 type={type_!r} body={body_text!r}")
        print(f"  first_id={first_id_val} comments={count}")
        print(f"  latest: {latest_clean}")
        return first_id_val
    except urllib.error.HTTPError as e:
        print(f"[{label}] HTTPError {e.code} type={type_!r} body={body_text!r}")
        return None

# STEP 1: result ページ取得
print("=" * 60)
print("STEP 1: result ページ取得")
html, url = get(f"{BASE}/people/result/{ENCODED}")
print(f"URL: {url}, len={len(html)}")
tokens = get_tokens(html)
print(f"tokens: action={tokens['action']}, id={tokens['id']}, sum={tokens['sum']}")

# 現在の最初のコメントIDを記録（比較用）
base_first_id = re.search(r'class="comment-container c(\d+)"', html)
base_id = base_first_id.group(1) if base_first_id else "N/A"
print(f"現在の最初のコメントID: {base_id}")

if not tokens["action"]:
    print("ERROR: フォームが見つかりません (Cookieなし？)")
    _f.close()
    sys.exit(1)

# STEP 2: type="" でテスト（現状）
print("\n" + "=" * 60)
print("STEP 2: type='' テスト")
html2, _ = get(f"{BASE}/people/result/{ENCODED}")
t2 = get_tokens(html2)
id2a = post_comment(t2["action"], t2["id"], "", "type空テスト2", t2["sum"], t2["auth1"], t2["auth2"], t2["authr"], t2["tag_id"], "type=''")

# STEP 3: type="好き派" でテスト
print("\n" + "=" * 60)
print("STEP 3: type='好き派' テスト")
html3, _ = get(f"{BASE}/people/result/{ENCODED}")
t3 = get_tokens(html3)
id3a = post_comment(t3["action"], t3["id"], "好き派", "好き派テスト", t3["sum"], t3["auth1"], t3["auth2"], t3["authr"], t3["tag_id"], "type='好き派'")

# STEP 4: type="嫌い派" でテスト
print("\n" + "=" * 60)
print("STEP 4: type='嫌い派' テスト")
html4, _ = get(f"{BASE}/people/result/{ENCODED}")
t4 = get_tokens(html4)
id4a = post_comment(t4["action"], t4["id"], "嫌い派", "嫌い派テスト", t4["sum"], t4["auth1"], t4["auth2"], t4["authr"], t4["tag_id"], "type='嫌い派'")

# STEP 5: >>NNN + type="好き派"
print("\n" + "=" * 60)
print(f"STEP 5: >>NNN + type='好き派' テスト (ref_id={base_id})")
html5, _ = get(f"{BASE}/people/result/{ENCODED}")
t5 = get_tokens(html5)
id5a = post_comment(t5["action"], t5["id"], "好き派", f">>{base_id}\n好き派返信テスト", t5["sum"], t5["auth1"], t5["auth2"], t5["authr"], t5["tag_id"], f">>anchor+好き派")

print("\n" + "=" * 60)
print(f"基準first_id: {base_id}")
print(f"STEP2 first_id: {id2a} → {'変わった' if id2a != base_id else '変わらず（コメント保存されず）'}")
print(f"STEP3 first_id: {id3a} → {'変わった' if id3a != base_id else '変わらず（コメント保存されず）'}")
print(f"STEP4 first_id: {id4a} → {'変わった' if id4a != base_id else '変わらず（コメント保存されず）'}")
print(f"STEP5 first_id: {id5a} → {'変わった' if id5a != base_id else '変わらず（コメント保存されず）'}")

_f.close()
