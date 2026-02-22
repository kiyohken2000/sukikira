"""
好き派コメントのパース確認
实行: python scripts/analyze_like_comments.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_like_comments.txt"), "w", encoding="utf-8")

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

# 投票して result HTML 取得
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

# JS の parseComments と同等のパース（sukikira.js と同じロジック）
container_pat = re.compile(
    r'(<div class="comment-container c(\d+)"[\s\S]*?)(?=<div class="comment-container c\d+"|<\/section|<section\s)'
)
matches = list(container_pat.finditer(html))
print(f"containerRegex matches: {len(matches)}")

results = []
for m in matches:
    id_ = m.group(2)
    block = m.group(1)

    rating_m = re.search(r'itemprop="ratingValue"[^>]*content\s*=\s*"(\d+)"', block)
    val = rating_m.group(1) if rating_m else None
    type_ = 'like' if val == '100' else 'dislike' if val == '0' else 'unknown'

    body_m = re.search(r'itemprop="reviewBody"[^>]*>([\s\S]*?)<\/p>', block)
    body = ''
    if body_m:
        body = re.sub(r'<br\s*/?>', '\n', body_m.group(1))
        body = re.sub(r'<[^>]+>', '', body)
        body = re.sub(r'&[^;]+;', ' ', body).strip()

    results.append((id_, type_, val, body[:40]))

print(f"\n全コメント type 分布:")
like_n    = sum(1 for _, t, _, _ in results if t == 'like')
dislike_n = sum(1 for _, t, _, _ in results if t == 'dislike')
unknown_n = sum(1 for _, t, _, _ in results if t == 'unknown')
print(f"  like: {like_n}, dislike: {dislike_n}, unknown: {unknown_n}")

print(f"\n全コメント一覧 (id, type, ratingValue, body):")
for id_, type_, val, body in results:
    print(f"  [{type_:8s}] ratingValue={val!s:4s}  id={id_}  {repr(body)}")

# containerRegex がマッチしなかったコメントを確認
# comment-container の全出現箇所
all_containers = list(re.finditer(r'<div class="comment-container c(\d+)"', html))
matched_ids = {m.group(2) for m in matches}
all_ids     = {m.group(1) for m in all_containers}
missed = all_ids - matched_ids
print(f"\ncontainerRegex にマッチしなかった comment-container: {len(missed)}件")
for mid in sorted(missed):
    m = re.search(rf'<div class="comment-container c{mid}"([\s\S]{{0,1500}})', html)
    if m:
        print(f"\n  missed id={mid}:")
        block = m.group(0)[:1500]
        rating = re.search(r'itemprop="ratingValue"[^>]*>', block)
        print(f"  ratingValue tag: {rating.group(0) if rating else 'NOT FOUND'}")
        print(f"  block[:200]: {block[:200]}")
