"""
フレッシュな投票ページの構造を確認する
- vote ページに「好き派:」が含まれるか
- auth-r などのトークン属性値を確認
- 実際の POST を行って結果を確認

実行: python scripts/analyze_vote_fresh.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_vote_fresh.txt"), "w", encoding="utf-8")

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
        final_url = r.geturl()
        html = r.read().decode("utf-8", errors="replace")
        return html, final_url

def parse_input_value(html, name):
    m = re.search(rf'name="{re.escape(name)}"[^>]*value="([^"]*)"', html)
    if m: return m.group(1)
    m = re.search(rf'value="([^"]*)"[^>]*name="{re.escape(name)}"', html)
    if m: return m.group(1)
    return None

# テスト対象: 比較的新しい投票ページを持つ人物（IPキャッシュなし想定）
NAMES = ["大谷翔平", "石丸伸二", "羽生結弦"]

for name in NAMES:
    print("=" * 60)
    print(f"テスト: {name}")
    print("=" * 60)
    opener = make_opener()
    encoded = urllib.parse.quote(name)

    try:
        vote_url = f"{BASE}/people/vote/{encoded}"
        print(f"GET {vote_url}")
        html, final_url = get(opener, vote_url)
        print(f"  → リダイレクト先: {final_url}")
        print(f"  → HTMLサイズ: {len(html)} bytes")

        # 「好き派:」の有無
        has_suki = "好き派:" in html
        has_suki_percent = bool(re.search(r"好き派:\s*[\d.]+%", html))
        print(f"  → 「好き派:」含む: {has_suki}")
        print(f"  → 「好き派: XX%」含む: {has_suki_percent}")

        # トークン取得
        id_val    = parse_input_value(html, "id")
        auth1_val = parse_input_value(html, "auth1")
        auth2_val = parse_input_value(html, "auth2")
        authr_val = parse_input_value(html, "auth-r")
        vote_val  = parse_input_value(html, "vote")

        print(f"  → id:     {repr(id_val)}")
        print(f"  → auth1:  {repr(auth1_val[:20] + '...' if auth1_val and len(auth1_val) > 20 else auth1_val)}")
        print(f"  → auth2:  {repr(auth2_val[:20] + '...' if auth2_val and len(auth2_val) > 20 else auth2_val)}")
        print(f"  → auth-r: {repr(authr_val[:20] + '...' if authr_val and len(authr_val) > 20 else authr_val)}")
        print(f"  → vote:   {repr(vote_val)}")

        # auth-r の前後のHTML（デバッグ用）
        authr_pos = html.find('auth-r')
        if authr_pos >= 0:
            snippet = html[max(0, authr_pos-50):authr_pos+100]
            print(f"  → auth-r周辺HTML: {repr(snippet)}")

        # トークンが揃っているか
        tokens_ok = all([id_val, auth1_val, auth2_val, authr_val])
        print(f"  → トークン取得: {'OK' if tokens_ok else 'NG - いずれかが None または空'}")

        if tokens_ok:
            print(f"  → 投票POSTテスト...")
            body = urllib.parse.urlencode({
                "vote": "1",  # 好き
                "ok": "ng",
                "id": id_val,
                "auth1": auth1_val,
                "auth2": auth2_val,
                "auth-r": authr_val,
            }).encode()
            req = urllib.request.Request(
                f"{BASE}/people/result/{encoded}",
                data=body,
                headers={**HEADERS,
                         "Content-Type": "application/x-www-form-urlencoded",
                         "Origin": BASE,
                         "Referer": vote_url}
            )
            with opener.open(req, timeout=15) as r:
                result_html = r.read().decode("utf-8", errors="replace")
                result_url = r.geturl()
            print(f"  → POST結果URL: {result_url}")
            print(f"  → 結果HTMLサイズ: {len(result_html)} bytes")
            has_result = "好き派:" in result_html
            print(f"  → 結果ページ判定: {has_result}")
            if has_result:
                m = re.search(r"好き派:\s*(?:<[^>]+>)*([\d.]+)", result_html)
                print(f"  → 好き派%: {m.group(1) if m else 'NOT FOUND'}")
        else:
            # トークンがない場合 → HTMLの前半を出力してデバッグ
            print(f"  → vote ページ先頭2000文字:")
            print(html[:2000])

    except Exception as e:
        import traceback
        print(f"  ERROR: {e}")
        traceback.print_exc()
    print()

_out_file.close()
print("=== 完了: scripts/out/analyze_vote_fresh.txt に保存 ===")
