"""
result ページに vote フォームのトークンが含まれているかを調査する。

analyze_revote.py の STEP2 で result ページからでも tokens2_ok=True になった。
result ページの HTML に id/auth1/auth2/auth-r が存在するのか確認する。

調査内容:
  STEP 1: 投票してresult ページを取得
  STEP 2: result ページの全 <input type="hidden"> を列挙
  STEP 3: vote ページと result ページのトークン値を比較
  STEP 4: result ページのフォームタグ構造を確認

実行: python scripts/analyze_result_tokens.py
出力: scripts/out/analyze_result_tokens.txt
"""

import urllib.request, urllib.parse, http.cookiejar, re, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_result_tokens.txt"), "w", encoding="utf-8")

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

NAME = "大谷翔平"
BASE = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

def section(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def fetch_get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with opener.open(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace"), r.geturl()

def fetch_post(url, data, referer):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers={
        **HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE, "Referer": referer,
    })
    with opener.open(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace"), r.geturl()

def parse_input(html, name):
    m = re.search(rf'name="{re.escape(name)}"[^>]*value="([^"]*)"', html)
    if m: return m.group(1)
    m = re.search(rf'value="([^"]*)"[^>]*name="{re.escape(name)}"', html)
    if m: return m.group(1)
    return None

def find_all_hidden_inputs(html):
    return re.findall(r'<input[^>]*type=["\']?hidden["\']?[^>]*>', html, re.IGNORECASE)

def find_all_forms(html):
    return re.findall(r'<form[^>]*>[\s\S]*?</form>', html, re.IGNORECASE)

enc = urllib.parse.quote(NAME)
vote_url = f"{BASE}/people/vote/{enc}"
result_url = f"{BASE}/people/result/{enc}"

# ================================================================
# STEP 1: 投票して result ページを取得
# ================================================================
section(f"STEP 1: {NAME} に投票して result ページ取得")

vote_html, vote_final = fetch_get(vote_url)
print(f"  GET vote  → {vote_final}")
print(f"  isResult: {'好き派:' in vote_html}")

pid    = parse_input(vote_html, "id")
auth1  = parse_input(vote_html, "auth1")
auth2  = parse_input(vote_html, "auth2")
auth_r = parse_input(vote_html, "auth-r")
print(f"  vote ページのトークン: id={pid}, auth1={'OK' if auth1 else 'NG'}, auth2={'OK' if auth2 else 'NG'}, auth-r={'OK' if auth_r else 'NG'}")

if all([pid, auth1, auth2, auth_r]):
    result_html, result_final = fetch_post(result_url, {
        "vote": "1", "ok": "ng", "id": pid,
        "auth1": auth1, "auth2": auth2, "auth-r": auth_r,
    }, referer=vote_url)
else:
    # IPトラッキング or Cookie で result にリダイレクト済み → GET で取得
    print("  !! vote ページトークン取得失敗。GET で result ページを取得。")
    result_html = vote_html
    result_final = vote_final

print(f"  result ページ: {result_final}")
print(f"  isResult: {'好き派:' in result_html}")

# ================================================================
# STEP 2: result ページの全 <input type="hidden"> を列挙
# ================================================================
section("STEP 2: result ページの全 <input type='hidden'> を列挙")

hidden_inputs = find_all_hidden_inputs(result_html)
print(f"  hidden input 数: {len(hidden_inputs)}")
for inp in hidden_inputs:
    name_m = re.search(r'name=["\']([^"\']+)["\']', inp)
    val_m  = re.search(r'value=["\']([^"\']*)["\']', inp)
    name_v = name_m.group(1) if name_m else '(no name)'
    val_v  = val_m.group(1)[:40] if val_m else '(no value)'
    print(f"    name={name_v!r:20s} value={val_v!r}")

# ================================================================
# STEP 3: result ページのトークン値を確認・vote ページと比較
# ================================================================
section("STEP 3: result ページの id/auth1/auth2/auth-r を確認")

r_id    = parse_input(result_html, "id")
r_auth1 = parse_input(result_html, "auth1")
r_auth2 = parse_input(result_html, "auth2")
r_auth_r = parse_input(result_html, "auth-r")

print(f"  result ページ id    : {r_id}")
print(f"  vote   ページ id    : {pid}")
print(f"  → 一致: {r_id == pid and r_id is not None}")

print(f"\n  result ページ auth1 : {'OK (' + r_auth1[:20] + '...)' if r_auth1 else 'None'}")
print(f"  vote   ページ auth1 : {'OK (' + auth1[:20] + '...)' if auth1 else 'None'}")
print(f"  → 一致: {r_auth1 == auth1 and r_auth1 is not None}")

print(f"\n  result ページ auth2 : {'OK' if r_auth2 else 'None'}")
print(f"  result ページ auth-r: {'OK' if r_auth_r else 'None'}")

if r_id:
    print("\n  ★ result ページにも vote トークンが含まれている")
    print("    （再投票ボタンや隠しフォームが存在する可能性）")
else:
    print("\n  ★ result ページには vote トークンが存在しない")
    print("    （analyze_revote の tokens2_ok=True は別フィールドの誤検出だった可能性）")

# ================================================================
# STEP 4: result ページの全 <form> タグを確認
# ================================================================
section("STEP 4: result ページの <form> タグ構造")

forms = find_all_forms(result_html)
print(f"  form タグ数: {len(forms)}")
for i, form in enumerate(forms):
    action_m = re.search(r'action=["\']([^"\']*)["\']', form)
    method_m = re.search(r'method=["\']([^"\']*)["\']', form)
    action = action_m.group(1) if action_m else '(no action)'
    method = method_m.group(1) if method_m else '(no method)'
    inner_inputs = re.findall(r'<input[^>]*name=["\']([^"\']+)["\']', form)
    print(f"\n  form[{i+1}]: action={action!r} method={method!r}")
    print(f"    input names: {inner_inputs}")

_out_file.close()
print("\n解析完了。詳細: scripts/out/analyze_result_tokens.txt")
