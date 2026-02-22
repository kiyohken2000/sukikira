"""
result ページのコメント投稿モーダルの JS ハンドラを詳細確認
実行: python scripts/analyze_comment_js.py
出力: scripts/out/analyze_comment_js.txt
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_f = open(os.path.join(_out_dir, "analyze_comment_js.txt"), "w", encoding="utf-8")

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

html, url = get(f"{BASE}/people/result/{ENCODED}")
print(f"URL: {url}, len={len(html)}\n")

# ---- inline JS 全文を出力 ----
scripts = re.findall(r'<script(?:\s[^>]*)?>([^<]*(?:comment|submit|modal|form)[^<]*)</script>', html, re.IGNORECASE)
print(f"comment/submit/form/modal に言及する <script> タグ: {len(scripts)} 件\n")

for i, s in enumerate(scripts):
    print(f"=== script #{i} ===")
    print(s[:3000])
    print()

# ---- #comment-submit 周辺の全 JS ----
print("=" * 60)
print("#comment-submit に言及する JS")
print("=" * 60)
for m in re.finditer(r'comment.submit|comment-submit|submitComment|postComment', html):
    start = max(0, m.start() - 200)
    end = min(len(html), m.end() + 500)
    print(f"[pos={m.start()}] {html[start:end]}")
    print()

# ---- コメント投稿モーダル周辺のHTML ----
print("=" * 60)
print("comment-submit-modal の HTML (2000文字)")
print("=" * 60)
m = re.search(r'comment-submit-modal', html)
if m:
    start = max(0, m.start() - 500)
    print(html[start: m.start() + 2000])

# ---- コメント追加に関するフォームのaction POST先を確認 ----
print("=" * 60)
print("全 form の action")
print("=" * 60)
for m in re.finditer(r'<form[^>]+action="([^"]+)"', html):
    print(f"  action={m.group(1)}")

# ---- 全 hidden input を出力（名前とvalue）----
print("=" * 60)
print("全 hidden input (name=, value=)")
print("=" * 60)
for m in re.finditer(r'<input[^>]*type="hidden"[^>]*>', html):
    inp = m.group(0)
    name_m = re.search(r'name="([^"]*)"', inp)
    val_m = re.search(r'value="([^"]*)"', inp)
    id_m = re.search(r'id="([^"]*)"', inp)
    name_ = name_m.group(1) if name_m else "-"
    val_ = val_m.group(1) if val_m else "-"
    id_ = id_m.group(1) if id_m else ""
    if name_ not in ("csrf_token", ""):
        print(f"  name={name_!r:30} value={val_!r:40} id={id_!r}")

_f.close()
