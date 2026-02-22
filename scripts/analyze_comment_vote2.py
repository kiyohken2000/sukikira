"""
コメント投票のAjaxエンドポイントを探す (JS ファイルの解析)
実行: python scripts/analyze_comment_vote2.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_comment_vote2.txt"), "w", encoding="utf-8")

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

# result HTML 取得
print("GET vote page...")
vh = get(f"{BASE}/people/vote/{ENCODED}")
pid_match = re.search(r'name="id"[^>]*value="([^"]+)"', vh)
if not pid_match:
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

# 外部JS ファイル参照を探す
print("=" * 60)
print("外部JS ファイル一覧:")
print("=" * 60)
for m in re.finditer(r'src="([^"]+\.js[^"]*)"', html):
    print(m.group(1))

# btnripple3 のイベントハンドラを探す
print("\n" + "=" * 60)
print("btnripple3 の全 script タグ検索:")
print("=" * 60)
scripts = re.findall(r'<script[^>]*>([\s\S]*?)<\/script>', html)
for i, sc in enumerate(scripts):
    if 'btnripple3' in sc or 'commentVote' in sc.lower() and 'click' in sc:
        print(f"\n--- script #{i+1} ({len(sc)}文字) ---")
        print(sc[:5000])

# main.js や app.js を取得してコメント投票エンドポイント確認
print("\n" + "=" * 60)
print("外部JSの中で 'commentVote' を含むものを取得:")
print("=" * 60)
js_srcs = re.findall(r'src="((?:https?://suki-kira\.com)?/[^"]+\.js[^"]*)"', html)
for src in js_srcs:
    url = src if src.startswith('http') else BASE + src
    print(f"\nFetching: {url}")
    try:
        js = get(url)
        if 'commentVote' in js or 'btnripple3' in js or 'comment_vote' in js:
            print(f"  => FOUND! ({len(js)} chars)")
            # commentVote関連部分を表示
            for m in re.finditer(r'(commentVote|btnripple3|comment_vote)', js):
                start = max(0, m.start()-100)
                end = min(len(js), m.start()+500)
                print(f"  pos={m.start()}:")
                print(js[start:end])
                print("  ---")
                break
        else:
            print(f"  => not found ({len(js)} chars)")
    except Exception as e:
        print(f"  => ERROR: {e}")
