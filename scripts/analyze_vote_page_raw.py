"""
vote ページの生HTMLを確認する（新しい Cookie jar で）
実行: python scripts/analyze_vote_page_raw.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out = open(os.path.join(_out_dir, "analyze_vote_page_raw.txt"), "w", encoding="utf-8")

def w(s=""):
    _out.write(str(s) + "\n")
    try: sys.__stdout__.write(str(s) + "\n")
    except Exception: pass

BASE = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

def get_fresh(name):
    """新しい Cookie jar で GET（ログイン状態なし）"""
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    encoded = urllib.parse.quote(name)
    url = f"{BASE}/people/vote/{encoded}"
    req = urllib.request.Request(url, headers=HEADERS)
    with opener.open(req, timeout=15) as r:
        final_url = r.geturl()
        html = r.read().decode("utf-8", errors="replace")
    return html, final_url

NAMES = ["田中圭", "浜辺美波", "橋本環奈"]  # 前回テストと別の人物

for name in NAMES:
    w("=" * 60)
    w(f"人物: {name}")
    w("=" * 60)
    try:
        html, final_url = get_fresh(name)
        w(f"最終URL: {final_url}")
        w(f"HTMLサイズ: {len(html)} bytes")

        # input タグを全部リストアップ
        inputs = re.findall(r'<input[^>]+>', html)
        w(f"inputタグ数: {len(inputs)}")
        w("--- input タグ一覧 ---")
        for inp in inputs:
            # name と value だけ抜く
            n = re.search(r'name=["\']([^"\']+)["\']', inp)
            v = re.search(r'value=["\']([^"\']*)["\']', inp)
            nm = n.group(1) if n else "(no name)"
            vl = v.group(1)[:30] if v else "(no value)"
            w(f"  name={nm!r:20s} value={vl!r}")

        # 「好き派:」の有無
        w(f"「好き派:」含む: {'好き派:' in html}")

        # hidden フィールドのみ
        w("--- hidden input ---")
        for inp in inputs:
            if 'hidden' in inp:
                w(f"  {inp[:120]}")

        # auth-r 周辺 HTML (50文字前後)
        pos = html.find('auth-r')
        if pos >= 0:
            w(f"auth-r 周辺: {html[max(0,pos-30):pos+80]!r}")
        else:
            w("auth-r: 見つからない")

    except Exception as e:
        import traceback
        w(f"ERROR: {e}")
        traceback.print_exc(file=_out)
    w()

_out.close()
