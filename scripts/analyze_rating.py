"""
コメントの ratingValue HTML構造を確認するスクリプト
実行: python scripts/analyze_rating.py
出力: scripts/out/analyze_rating.txt
"""
import urllib.request, urllib.parse, re, http.cookiejar, os

out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "analyze_rating.txt")

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

with open(out_path, "w", encoding="utf-8") as f:
    def p(s=""):
        f.write(str(s) + "\n")

    p("GET vote page...")
    vh = get(f"{BASE}/people/vote/{ENCODED}")
    pid   = re.search(r'name="id"[^>]*value="([^"]+)"', vh).group(1)
    auth1 = re.search(r'name="auth1"[^>]*value="([^"]+)"', vh).group(1)
    auth2 = re.search(r'name="auth2"[^>]*value="([^"]+)"', vh).group(1)
    authr = re.search(r'name="auth-r"[^>]*value="([^"]+)"', vh).group(1)

    p("POST vote...")
    html = post(f"{BASE}/people/result/{ENCODED}",
                {"vote":"1","ok":"ng","id":pid,"auth1":auth1,"auth2":auth2,"auth-r":authr})
    p(f"result HTML: {len(html)} chars")
    p()

    # comment-container ブロックを抽出
    container_pat = re.compile(
        r'<div class="comment-container c(\d+)"([\s\S]*?)(?=<div class="comment-container c\d+"|</section|<section\s)',
    )
    blocks = container_pat.findall(html)
    p(f"comment-container 件数: {len(blocks)}")
    p()

    # 各ブロックから ratingValue と reviewBody を抽出
    p("=" * 60)
    p("各コメントの ratingValue と type判定:")
    p("=" * 60)
    for cid, block in blocks[:10]:
        rating_m = re.search(r'itemprop="ratingValue"[^>]*content\s*=\s*"(\d+)"', block)
        # 属性順が逆の場合も確認
        rating_m2 = re.search(r'content\s*=\s*"(\d+)"[^>]*itemprop="ratingValue"', block)
        rating_any = re.search(r'ratingValue[\s\S]{0,100}?content="(\d+)"', block)

        p(f"  ID={cid}")
        p(f"    [正順マッチ] ratingValue → content: {rating_m.group(1) if rating_m else 'NOT FOUND'}")
        p(f"    [逆順マッチ] content → ratingValue: {rating_m2.group(1) if rating_m2 else 'NOT FOUND'}")
        p(f"    [ゆるいマッチ]:                      {rating_any.group(1) if rating_any else 'NOT FOUND'}")

        # 実際のタグを表示
        tag_m = re.search(r'<[^>]*ratingValue[^>]*>', block)
        p(f"    タグ全体: {tag_m.group(0)[:200] if tag_m else 'NOT FOUND'}")
        p()

    p()
    p("=" * 60)
    p("最初の comment-container ブロック 先頭1500文字:")
    p("=" * 60)
    if blocks:
        p(blocks[0][1][:1500])

print(f"Done. See {out_path}")
