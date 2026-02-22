"""
投票タイプ別のコメントtype分布を確認するスクリプト
実行: python scripts/analyze_rating2.py
出力: scripts/out/analyze_rating2.txt
"""
import urllib.request, urllib.parse, re, http.cookiejar, os

out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "analyze_rating2.txt")

BASE    = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

def make_opener():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def get(opener, url):
    req = urllib.request.Request(url, headers=HEADERS)
    with opener.open(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")

def post_vote(opener, name, vote):
    encoded = urllib.parse.quote(name)
    vh = get(opener, f"{BASE}/people/vote/{encoded}")
    pid   = re.search(r'name="id"[^>]*value="([^"]+)"', vh).group(1)
    auth1 = re.search(r'name="auth1"[^>]*value="([^"]+)"', vh).group(1)
    auth2 = re.search(r'name="auth2"[^>]*value="([^"]+)"', vh).group(1)
    authr = re.search(r'name="auth-r"[^>]*value="([^"]+)"', vh).group(1)

    body = urllib.parse.urlencode({
        "vote": vote, "ok": "ng", "id": pid,
        "auth1": auth1, "auth2": auth2, "auth-r": authr,
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/people/result/{encoded}", data=body,
        headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded",
                 "Origin": BASE, "Referer": f"{BASE}/people/vote/{encoded}"},
    )
    with opener.open(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")

def count_types(html):
    container_pat = re.compile(
        r'<div class="comment-container c(\d+)"([\s\S]*?)(?=<div class="comment-container c\d+"|</section|<section\s)'
    )
    blocks = container_pat.findall(html)
    counts = {"like(1)": 0, "dislike(0)": 0, "unknown": 0}
    examples = {}
    for cid, block in blocks:
        m = re.search(r'itemprop="ratingValue"[^>]*content\s*=\s*"(\d+)"', block)
        v = m.group(1) if m else None
        if v == "1":
            counts["like(1)"] += 1
            if "like(1)" not in examples:
                examples["like(1)"] = re.search(r'<[^>]*ratingValue[^>]*>', block).group(0)[:100]
        elif v == "0":
            counts["dislike(0)"] += 1
            if "dislike(0)" not in examples:
                examples["dislike(0)"] = re.search(r'<[^>]*ratingValue[^>]*>', block).group(0)[:100]
        else:
            counts["unknown"] += 1
    return counts, examples, len(blocks)

# テスト対象: 木村拓哉(嫌い多め) + さかなクン(好き多め)
TESTS = [
    ("木村拓哉", "1"),   # 好き投票
    ("木村拓哉", "0"),   # 嫌い投票
    ("さかなクン", "1"), # 好き投票
]

with open(out_path, "w", encoding="utf-8") as f:
    def p(s=""):
        f.write(str(s) + "\n")

    for name, vote in TESTS:
        p("=" * 60)
        p(f"名前={name}, 投票タイプ=vote={vote}")
        p("=" * 60)
        opener = make_opener()
        try:
            html = post_vote(opener, name, vote)
            counts, examples, total = count_types(html)
            p(f"コメント総数: {total}")
            for k, cnt in counts.items():
                p(f"  {k}: {cnt}件  (例: {examples.get(k, 'なし')})")
        except Exception as e:
            p(f"ERROR: {e}")
        p()

print(f"Done. See {out_path}")
