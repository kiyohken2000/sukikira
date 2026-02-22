"""
新しい parseResult 正規表現を検証
実行: python scripts/analyze_aragaki2.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_aragaki2.txt"), "w", encoding="utf-8")

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

BASE = "https://suki-kira.com"
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
    pid_m = re.search(r'name="id"[^>]*value="([^"]+)"', vh)
    if not pid_m:
        return get(opener, f"{BASE}/people/result/{encoded}")
    pid   = pid_m.group(1)
    auth1 = re.search(r'name="auth1"[^>]*value="([^"]+)"', vh).group(1)
    auth2 = re.search(r'name="auth2"[^>]*value="([^"]+)"', vh).group(1)
    authr = re.search(r'name="auth-r"[^>]*value="([^"]+)"', vh).group(1)
    body = urllib.parse.urlencode({"vote": vote, "ok": "ng", "id": pid,
                                   "auth1": auth1, "auth2": auth2, "auth-r": authr}).encode()
    req = urllib.request.Request(f"{BASE}/people/result/{encoded}", data=body,
        headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded",
                 "Origin": BASE, "Referer": f"{BASE}/people/vote/{encoded}"})
    with opener.open(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")

def parse_result(html):
    # 新しい正規表現
    like_pct     = re.search(r'好き派:\s*(?:<[^>]+>)*([\d.]+)', html)
    dislike_pct  = re.search(r'嫌い派:\s*(?:<[^>]+>)*([\d.]+)', html)
    like_votes   = re.search(r'好き派:[\s\S]{0,200}?([\d,]+)票', html)
    dislike_votes = re.search(r'嫌い派:[\s\S]{0,200}?([\d,]+)票', html)
    return {
        'likePercent':    like_pct.group(1) if like_pct else 'NOT FOUND',
        'dislikePercent': dislike_pct.group(1) if dislike_pct else 'NOT FOUND',
        'likeVotes':      like_votes.group(1).replace(',', '') if like_votes else 'NOT FOUND',
        'dislikeVotes':   dislike_votes.group(1).replace(',', '') if dislike_votes else 'NOT FOUND',
    }

TESTS = [
    ("新垣結衣", "1"),
    ("木村拓哉", "1"),
    ("さかなクン", "1"),
]

for name, vote in TESTS:
    print("=" * 60)
    print(f"{name}")
    print("=" * 60)
    opener = make_opener()
    try:
        html = post_vote(opener, name, vote)
        r = parse_result(html)
        print(f"  likePercent:    {r['likePercent']}")
        print(f"  dislikePercent: {r['dislikePercent']}")
        print(f"  likeVotes:      {r['likeVotes']}")
        print(f"  dislikeVotes:   {r['dislikeVotes']}")
    except Exception as e:
        print(f"  ERROR: {e}")
    print()
