"""
検索APIの構造解析
実行: python scripts/analyze_search.py
出力: scripts/out/analyze_search.txt
"""
import urllib.request, re, urllib.parse, json, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_search.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, s):
        try:
            sys.__stdout__.write(s)
        except UnicodeEncodeError:
            pass
        _out_file.write(s)
    def flush(self):
        try:
            sys.__stdout__.flush()
        except Exception:
            pass
        _out_file.flush()

sys.stdout = _Tee()

BASE = "https://suki-kira.com"
QUERY = "さかなクン"

html_headers = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}
ajax_headers = {
    **html_headers,
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": BASE + "/search?q=" + urllib.parse.quote(QUERY),
}

# HTMLページから sk_token 取得
q = urllib.parse.quote(QUERY)
req = urllib.request.Request(BASE + "/search?q=" + q, headers=html_headers)
with urllib.request.urlopen(req, timeout=15) as r:
    html = r.read().decode("utf-8", errors="replace")

token_m = re.search(r"sk_token\s*=\s*[\"']([\w\-]+)[\"']", html)
token = token_m.group(1) if token_m else ""
print(f"sk_token: {token}")

# AJAX エンドポイント
ajax_url = BASE + "/search/search?q=" + q
print(f"AJAX URL: {ajax_url}")

data = urllib.parse.urlencode({"sk_token": token}).encode() if token else None
req2 = urllib.request.Request(ajax_url, data=data, headers=ajax_headers)
if data:
    req2 = urllib.request.Request(ajax_url, headers=ajax_headers)
    # GETパラメータとして送る
    ajax_url_with_token = ajax_url + ("&sk_token=" + token if token else "")
    req2 = urllib.request.Request(ajax_url_with_token, headers=ajax_headers)

with urllib.request.urlopen(req2, timeout=15) as r2:
    body = r2.read().decode("utf-8", errors="replace")

print(f"レスポンス長: {len(body)} chars")
print()
print("レスポンス全文:")
print(body[:3000])

# JSONパース試行
try:
    data = json.loads(body)
    print()
    print("JSON keys:", list(data.keys()) if isinstance(data, dict) else type(data))
    print(json.dumps(data, ensure_ascii=False, indent=2)[:2000])
except Exception as e:
    print(f"JSON parse error: {e}")

print("\n解析完了。")
