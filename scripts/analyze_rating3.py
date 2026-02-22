"""
unknown コメントのHTML構造を確認するスクリプト
実行: python scripts/analyze_rating3.py
出力: scripts/out/analyze_rating3.txt
"""
import urllib.request, urllib.parse, re, http.cookiejar, os

out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "analyze_rating3.txt")

NAME    = "さかなクン"
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

def post_vote(name, vote):
    encoded = urllib.parse.quote(name)
    vh = get(f"{BASE}/people/vote/{encoded}")
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

with open(out_path, "w", encoding="utf-8") as f:
    def p(s=""):
        f.write(str(s) + "\n")

    p(f"GET result: {NAME} (vote=好き)")
    html = post_vote(NAME, "1")
    p(f"HTML length: {len(html)}")
    p()

    container_pat = re.compile(
        r'<div class="comment-container c(\d+)"([\s\S]*?)(?=<div class="comment-container c\d+"|</section|<section\s)'
    )
    blocks = container_pat.findall(html)
    p(f"comment-container 件数: {len(blocks)}")
    p()

    for i, (cid, block) in enumerate(blocks):
        m = re.search(r'itemprop="ratingValue"[^>]*content\s*=\s*"(\d+)"', block)
        v = m.group(1) if m else None
        tag = re.search(r'<[^>]*ratingValue[^>]*>', block)

        if v is None:
            p(f"=== UNKNOWN コメント ID={cid} ===")
            p(f"  ratingValue タグ: {tag.group(0)[:200] if tag else 'NOT FOUND'}")
            # ratingValue 前後の生HTML
            rv_pos = block.find("ratingValue")
            if rv_pos >= 0:
                p(f"  ratingValue 前後 (±100chars):")
                p("  " + repr(block[max(0,rv_pos-50):rv_pos+150]))
            else:
                p("  !! ratingValue が block内に存在しない")
                # comment_info の前後を見る
                ci_pos = block.find("comment_info")
                if ci_pos >= 0:
                    p(f"  comment_info 前後 200chars:")
                    p("  " + repr(block[max(0,ci_pos-200):ci_pos+200]))
                p(f"  block先頭300chars:")
                p("  " + repr(block[:300]))
            p()
        else:
            p(f"--- OK ID={cid}, ratingValue={v} ---")

print(f"Done. See {out_path}")
