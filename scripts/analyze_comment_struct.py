"""
コメント div の正確なHTML構造を確認するスクリプト
実行: python scripts/analyze_comment_struct.py
出力: scripts/out/analyze_comment_struct.txt にも保存される
"""
import urllib.request, urllib.parse, urllib.error, re, http.cookiejar, sys, os

# 出力先ファイル設定
_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_comment_struct.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, *args, **kwargs):
        sys.__stdout__.write(*args, **kwargs)
        _out_file.write(*args, **kwargs)
    def flush(self):
        sys.__stdout__.flush()
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

# bobj[] からコメントIDを抽出
ids = list(dict.fromkeys(re.findall(r'bobj\[(\d+)\]', html)))
print(f"コメントID数: {len(ids)}, 最初の5件: {ids[:5]}\n")

# 最初のIDの <div id="..."> から 600文字を表示
for target_id in ids[:3]:
    print("=" * 60)
    print(f"div id={target_id} の HTML構造:")
    print("=" * 60)
    m = re.search(rf'<div[^>]*\bid="{target_id}"[^>]*>', html)
    if m:
        snippet = html[m.start(): m.start()+2000]
        print(snippet)
    else:
        print(f"  !! <div id={target_id}> が見つかりません")
    print()

# comment-container クラスの要素を確認
print("=" * 60)
print("class='comment-container' の最初の1件 (1000文字):")
print("=" * 60)
cc = re.search(r'class="[^"]*comment-container[^"]*"', html)
if cc:
    print(html[cc.start(): cc.start()+1000])
else:
    print("  見つかりません")
