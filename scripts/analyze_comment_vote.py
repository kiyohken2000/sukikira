"""
コメントのいいね/わるいボタン構造を詳細確認
実行: python scripts/analyze_comment_vote.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_comment_vote.txt"), "w", encoding="utf-8")

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
pid_match = re.search(r'name="id"[^>]*value="([^"]+)"', vh)
if not pid_match:
    # already voted, get result directly
    print("Already voted, GET result page directly...")
    html = get(f"{BASE}/people/result/{ENCODED}")
else:
    pid   = pid_match.group(1)
    auth1 = re.search(r'name="auth1"[^>]*value="([^"]+)"', vh).group(1)
    auth2 = re.search(r'name="auth2"[^>]*value="([^"]+)"', vh).group(1)
    authr = re.search(r'name="auth-r"[^>]*value="([^"]+)"', vh).group(1)
    print("POST vote...")
    html = post(f"{BASE}/people/result/{ENCODED}",
                {"vote":"1","ok":"ng","id":pid,"auth1":auth1,"auth2":auth2,"auth-r":authr})

print(f"result HTML: {len(html)} chars\n")

# commentVote を含む要素を検索
print("=" * 60)
print("commentVote 関連の HTML (各500文字):")
print("=" * 60)
for m in re.finditer(r'commentVote', html):
    start = max(0, m.start() - 100)
    end   = min(len(html), m.start() + 500)
    print(f"\npos={m.start()}:")
    print(html[start:end])
    print("---")
    break  # 最初の1件だけ

# 最初のcomment-containerを5000文字表示
print("\n" + "=" * 60)
print("最初の comment-container 5000文字:")
print("=" * 60)
m = re.search(r'<div class="comment-container c\d+"', html)
if m:
    print(html[m.start(): m.start() + 5000])

# commentVote の全出現箇所 (前後各100文字)
print("\n" + "=" * 60)
print("commentVote 全出現箇所 (前後100文字):")
print("=" * 60)
for i, m in enumerate(re.finditer(r'commentVote', html)):
    start = max(0, m.start() - 80)
    end   = min(len(html), m.start() + 200)
    print(f"\n[{i+1}] pos={m.start()}:")
    print(html[start:end])
    if i >= 5:
        print("... (以降省略)")
        break

# /comment_vote/ のような Ajax エンドポイントを探す
print("\n" + "=" * 60)
print("Ajax/fetch/XMLHttpRequest 関連の script タグ:")
print("=" * 60)
scripts = re.findall(r'<script[^>]*>([\s\S]*?)<\/script>', html)
for i, sc in enumerate(scripts):
    if 'commentVote' in sc or 'comment_vote' in sc or 'cv_' in sc or '/cv/' in sc:
        print(f"\n--- script #{i+1} ({len(sc)}文字) ---")
        print(sc[:3000])
