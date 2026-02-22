"""
新垣結衣の結果ページHTML構造とパース確認
実行: python scripts/analyze_aragaki.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_aragaki.txt"), "w", encoding="utf-8")

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

NAME    = "新垣結衣"
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

print(f"GET vote page for {NAME}...")
vh = get(f"{BASE}/people/vote/{ENCODED}")
pid_match = re.search(r'name="id"[^>]*value="([^"]+)"', vh)
if not pid_match:
    print("Already voted, GET result directly...")
    html = get(f"{BASE}/people/result/{ENCODED}")
else:
    pid   = pid_match.group(1)
    auth1 = re.search(r'name="auth1"[^>]*value="([^"]+)"', vh).group(1)
    auth2 = re.search(r'name="auth2"[^>]*value="([^"]+)"', vh).group(1)
    authr = re.search(r'name="auth-r"[^>]*value="([^"]+)"', vh).group(1)
    print("POST vote (好き)...")
    html = post(f"{BASE}/people/result/{ENCODED}",
                {"vote":"1","ok":"ng","id":pid,"auth1":auth1,"auth2":auth2,"auth-r":authr})
print(f"HTML: {len(html)} chars\n")

# 現在の parseResult 正規表現を適用
print("=" * 60)
print("現在の parseResult 正規表現の結果:")
print("=" * 60)
like_pct   = re.search(r'好き派:\s*([\d.]+)%', html)
dislike_pct = re.search(r'嫌い派:\s*([\d.]+)%', html)
like_votes   = re.search(r'好き派:[\s\S]{0,30}?([\d,]+)票', html)
dislike_votes = re.search(r'嫌い派:[\s\S]{0,30}?([\d,]+)票', html)
xdate   = re.search(r'var xdate\s*=\s*"([^"]+)"', html)
pid_hash = re.search(r'var pid_hash\s*=\s*"([^"]+)"', html)

print(f"  likePercent:    {like_pct.group(1) if like_pct else 'NOT FOUND'}")
print(f"  dislikePercent: {dislike_pct.group(1) if dislike_pct else 'NOT FOUND'}")
print(f"  likeVotes:      {like_votes.group(1) if like_votes else 'NOT FOUND'}")
print(f"  dislikeVotes:   {dislike_votes.group(1) if dislike_votes else 'NOT FOUND'}")
print(f"  xdate:          {xdate.group(1) if xdate else 'NOT FOUND'}")
print(f"  pid_hash:       {pid_hash.group(1) if pid_hash else 'NOT FOUND'}")

# 好き派・嫌い派 の全出現箇所（前後80文字）
print("\n" + "=" * 60)
print("'好き派' の全出現箇所:")
print("=" * 60)
for i, m in enumerate(re.finditer(r'好き派', html)):
    start = max(0, m.start()-30)
    end   = min(len(html), m.start()+100)
    print(f"  [{i+1}] pos={m.start()}: {repr(html[start:end])}")
    if i >= 9:
        print("  ... (以降省略)")
        break

print("\n" + "=" * 60)
print("'嫌い派' の全出現箇所:")
print("=" * 60)
for i, m in enumerate(re.finditer(r'嫌い派', html)):
    start = max(0, m.start()-30)
    end   = min(len(html), m.start()+100)
    print(f"  [{i+1}] pos={m.start()}: {repr(html[start:end])}")
    if i >= 9:
        print("  ... (以降省略)")
        break

# コメント type 分布
print("\n" + "=" * 60)
print("コメント type 分布 (split ベース):")
print("=" * 60)
parts = html.split('<div class="comment-container c')
like_n = dislike_n = unknown_n = 0
for p in parts[1:]:
    m = re.search(r'itemprop="ratingValue"[^>]*content\s*=\s*"(\d+)"', p)
    val = m.group(1) if m else None
    if val == '100': like_n += 1
    elif val == '0': dislike_n += 1
    else: unknown_n += 1
print(f"  like={like_n}, dislike={dislike_n}, unknown={unknown_n}, total={like_n+dislike_n+unknown_n}")
