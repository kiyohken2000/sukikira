"""
コメントの good/bad ボタンのHTML構造・エンドポイントを確認するスクリプト
実行: python scripts/analyze_comment_goodbad.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_comment_goodbad.txt"), "w", encoding="utf-8")

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

NAME    = "木村拓哉"
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
    with opener.open(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")

def post(url, data):
    body = urllib.parse.urlencode(data).encode()
    req  = urllib.request.Request(url, data=body, headers={
        **HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE, "Referer": f"{BASE}/people/vote/{ENCODED}",
    })
    with opener.open(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")

# 投票してresult HTMLを取得
print("GET vote page...")
vh = get(f"{BASE}/people/vote/{ENCODED}")
pid   = re.search(r'name="id"[^>]*value="([^"]+)"', vh).group(1)
auth1 = re.search(r'name="auth1"[^>]*value="([^"]+)"', vh).group(1)
auth2 = re.search(r'name="auth2"[^>]*value="([^"]+)"', vh).group(1)
authr = re.search(r'name="auth-r"[^>]*value="([^"]+)"', vh).group(1)

print("POST vote...")
html = post(f"{BASE}/people/result/{ENCODED}",
            {"vote":"1","ok":"ng","id":pid,"auth1":auth1,"auth2":auth2,"auth-r":authr})
print(f"result HTML: {len(html)} chars\n")

# comment-container を探してそのfull HTML (2000文字) を表示
print("=" * 60)
print("comment-container の最初の3件 (各2000文字):")
print("=" * 60)
containers = list(re.finditer(r'<div[^>]*class="[^"]*comment-container[^"]*"', html))
print(f"total comment-container: {len(containers)}")

for i, m in enumerate(containers[:3]):
    print(f"\n--- container #{i+1} ---")
    snippet = html[m.start(): m.start()+2000]
    print(snippet)

# good/bad ボタン関連キーワードを探す
print("\n" + "=" * 60)
print("good/bad 関連キーワード検索:")
print("=" * 60)
keywords = ["good", "bad", "helpful", "役に立", "thumb", "like_comment",
            "bobj", "comment_good", "comment_bad", "/comment/", "review_helpful"]
for kw in keywords:
    matches = [(m.start(), html[max(0,m.start()-50):m.start()+100]) for m in re.finditer(kw, html, re.IGNORECASE)]
    if matches:
        print(f"\n['{kw}'] {len(matches)}件:")
        for pos, ctx in matches[:3]:
            print(f"  pos={pos}: ...{ctx}...")
    else:
        print(f"\n['{kw}'] 0件")

# JavaScript 内の AJAX エンドポイントを探す
print("\n" + "=" * 60)
print("JavaScript 内の URL/エンドポイント:")
print("=" * 60)
scripts = re.findall(r'<script[^>]*>([\s\S]*?)<\/script>', html)
for i, sc in enumerate(scripts):
    if 'comment' in sc.lower() or 'bobj' in sc or 'good' in sc.lower() or 'ajax' in sc.lower():
        print(f"\n--- script #{i+1} ({len(sc)}文字) ---")
        print(sc[:2000])
