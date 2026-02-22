"""
result ページの外部JS・コメントフォーム送信方法を詳細確認
実行: python scripts/analyze_comment_extjs.py
出力: scripts/out/analyze_comment_extjs.txt
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_f = open(os.path.join(_out_dir, "analyze_comment_extjs.txt"), "w", encoding="utf-8")
class _Tee:
    def write(self, *a, **k): sys.__stdout__.write(*a, **k); _f.write(*a, **k)
    def flush(self): sys.__stdout__.flush(); _f.flush()
sys.stdout = _Tee()

NAME = "里見浩太朗"
ENCODED = urllib.parse.quote(NAME)
BASE = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def get(url, extra_headers=None):
    h = {**HEADERS, **(extra_headers or {})}
    req = urllib.request.Request(url, headers=h)
    resp = opener.open(req, timeout=15)
    return resp.read().decode("utf-8", errors="replace"), resp.geturl()

def parse_input(html, name):
    m = (re.search(rf'name="{name}"[^>]*value="([^"]*)"', html) or
         re.search(rf'value="([^"]*)"[^>]*name="{name}"', html))
    return m.group(1) if m else None

# 投票
vote_html, _ = get(f"{BASE}/people/vote/{ENCODED}")
auth1 = parse_input(vote_html, "auth1")
auth2 = parse_input(vote_html, "auth2")
authr = parse_input(vote_html, "auth-r")
pid = parse_input(vote_html, "id")
if auth1:
    body_enc = urllib.parse.urlencode({"vote":"1","ok":"ng","id":pid,"auth1":auth1,"auth2":auth2,"auth-r":authr}).encode()
    req = urllib.request.Request(f"{BASE}/people/result/{ENCODED}", data=body_enc, headers={**HEADERS,"Content-Type":"application/x-www-form-urlencoded","Origin":BASE,"Referer":f"{BASE}/people/vote/{ENCODED}"})
    resp = opener.open(req, timeout=15)
    result_html = resp.read().decode("utf-8", errors="replace")
else:
    result_html, _ = get(f"{BASE}/people/result/{ENCODED}")

print(f"result page len: {len(result_html)}")
print(f"Cookies: {[(c.name, c.value) for c in jar]}\n")

# 外部 JS ファイル一覧
print("=" * 60)
print("外部 JS ファイル (<script src=...>)")
print("=" * 60)
for m in re.finditer(r'<script[^>]+src="([^"]+)"', result_html):
    src = m.group(1)
    if not src.startswith('data:'):
        print(f"  {src}")

# コメントモーダルトリガーのHTML (コメントを書くボタン)
print("\n" + "=" * 60)
print("コメントを書く / comment ボタン周辺")
print("=" * 60)
for keyword in ["コメントを書く", "comment-body", "add-comment", "comment-modal", "commentModal"]:
    for m in re.finditer(keyword, result_html, re.IGNORECASE):
        start = max(0, m.start()-200)
        end = min(len(result_html), m.end()+300)
        print(f"[{keyword}] pos={m.start()}")
        print(result_html[start:end])
        print()

# "次へ" / "next" ボタン
print("=" * 60)
print('"次へ" / "次のステップ" ボタン')
print("=" * 60)
for keyword in ["次へ", "次のステップ", "next-step", "nextStep", "comment-next"]:
    for m in re.finditer(keyword, result_html, re.IGNORECASE):
        start = max(0, m.start()-100)
        end = min(len(result_html), m.end()+300)
        print(f"[{keyword}] pos={m.start()}: {result_html[start:end]}")
        print()

# コメントフォームのモーダル全体を表示
print("=" * 60)
print("コメント投稿モーダル (最初の出現から5000文字)")
print("=" * 60)
m = re.search(r'comment-body', result_html)
if m:
    start = max(0, m.start()-1000)
    print(result_html[start: m.start()+5000])

# コメントフォームページに存在する外部 JS を取得して内容確認
# (comment関連のJSを探す)
print("\n" + "=" * 60)
print("外部JS取得（peoplejs, commentjs など）")
print("=" * 60)
for m in re.finditer(r'<script[^>]+src="([^"]*(?:people|comment|sk)[^"]*)"', result_html, re.IGNORECASE):
    src = m.group(1)
    url = src if src.startswith('http') else f"{BASE}{src}"
    print(f"\nFetching: {url}")
    try:
        js_text, _ = get(url)
        print(f"  len: {len(js_text)}")
        # コメント投稿関連のコードを探す
        for kw in ["comment", "submit", "form", "ajax", "$.post", "$.ajax", "fetch("]:
            for km in re.finditer(kw, js_text, re.IGNORECASE):
                start = max(0, km.start()-50)
                end = min(len(js_text), km.end()+200)
                print(f"  [{kw}] {js_text[start:end]}")
                print()
    except Exception as e:
        print(f"  ERROR: {e}")

_f.close()
