"""
isResultPage 判定と parseResult/parseComments の統合確認
実行: python scripts/analyze_final_check.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_final_check.txt"), "w", encoding="utf-8")

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

def simulate_get_comments(html):
    # 旧チェック（バグあり）
    old_check = bool(re.search(r'好き派:\s*[\d.]+%', html))
    # 新チェック（修正後）
    new_check = bool(re.search(r'好き派:', html))

    like_pct     = (re.search(r'好き派:\s*(?:<[^>]+>)*([\d.]+)', html) or type('', (), {'group': lambda s,n: 'NOT FOUND'})).group(1)
    dislike_pct  = (re.search(r'嫌い派:\s*(?:<[^>]+>)*([\d.]+)', html) or type('', (), {'group': lambda s,n: 'NOT FOUND'})).group(1)
    m = re.search(r'好き派:[\s\S]{0,200}?([\d,]+)票', html)
    like_votes = m.group(1).replace(',', '') if m else 'NOT FOUND'
    m = re.search(r'嫌い派:[\s\S]{0,200}?([\d,]+)票', html)
    dislike_votes = m.group(1).replace(',', '') if m else 'NOT FOUND'

    parts = html.split('<div class="comment-container c')
    like_n = dislike_n = unknown_n = 0
    for p in parts[1:]:
        m2 = re.search(r'itemprop="ratingValue"[^>]*content\s*=\s*"(\d+)"', p)
        val = m2.group(1) if m2 else None
        if val == '100': like_n += 1
        elif val == '0': dislike_n += 1
        else: unknown_n += 1

    return {
        'old_isResultPage': old_check,
        'new_isResultPage': new_check,
        'likePercent': like_pct,
        'dislikePercent': dislike_pct,
        'likeVotes': like_votes,
        'dislikeVotes': dislike_votes,
        'comments': {'like': like_n, 'dislike': dislike_n, 'unknown': unknown_n},
    }

for name in ["新垣結衣", "木村拓哉", "さかなクン"]:
    print("=" * 60)
    print(f"{name}")
    print("=" * 60)
    opener = make_opener()
    try:
        html = post_vote(opener, name, "1")
        r = simulate_get_comments(html)
        print(f"  isResultPage (旧): {r['old_isResultPage']}  ← バグあり/なし")
        print(f"  isResultPage (新): {r['new_isResultPage']}")
        print(f"  likePercent:    {r['likePercent']}")
        print(f"  dislikePercent: {r['dislikePercent']}")
        print(f"  likeVotes:      {r['likeVotes']}")
        print(f"  dislikeVotes:   {r['dislikeVotes']}")
        print(f"  comments:       {r['comments']}")
    except Exception as e:
        import traceback
        print(f"  ERROR: {e}")
        traceback.print_exc()
    print()
