"""
ok=ng POST の挙動テスト
- 票数が増えるか
- IP トラッキングが発生するか（以降 vote ページにアクセスできるか）
出力: scripts/out/analyze_oknq_test.txt
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_f = open(os.path.join(_out_dir, "analyze_oknq_test.txt"), "w", encoding="utf-8")
class _Tee:
    def write(self, *a, **k): sys.__stdout__.write(*a, **k); _f.write(*a, **k)
    def flush(self): sys.__stdout__.flush(); _f.flush()
sys.stdout = _Tee()

BASE = "https://suki-kira.com"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
HEADERS = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "ja-JP,ja;q=0.9"}

def new_session():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)), jar

def get(opener, url):
    req = urllib.request.Request(url, headers=HEADERS)
    resp = opener.open(req, timeout=15)
    return resp.read().decode("utf-8", errors="replace"), resp.geturl()

def parse_input(html, name):
    m = (re.search(rf'name="{name}"[^>]*value="([^"]*)"', html) or
         re.search(rf'value="([^"]*)"[^>]*name="{name}"', html))
    return m.group(1) if m else None

def extract_votes(html):
    like_pct  = re.search(r'好き派:\s*(?:<[^>]+>)*([\d.]+)', html)
    dislike_pct = re.search(r'嫌い派:\s*(?:<[^>]+>)*([\d.]+)', html)
    like_cnt  = re.search(r'好き派:[\s\S]{0,200}?([\d,]+)票', html)
    dislike_cnt = re.search(r'嫌い派:[\s\S]{0,200}?([\d,]+)票', html)
    return {
        "like_pct":    like_pct.group(1)    if like_pct    else "N/A",
        "dislike_pct": dislike_pct.group(1) if dislike_pct else "N/A",
        "like_cnt":    like_cnt.group(1).replace(",","")    if like_cnt    else "N/A",
        "dislike_cnt": dislike_cnt.group(1).replace(",","") if dislike_cnt else "N/A",
    }

# あまり有名でない人物（票数変化を検出しやすい）
NAME = "財前直見"
ENCODED = urllib.parse.quote(NAME)

# =========================================================
# STEP 1: ベースライン取得（既存セッションで result ページの現在の票数）
# =========================================================
print("=" * 60)
print("STEP 1: ベースライン票数取得（既存 sk_vote Cookie セッション）")
print("=" * 60)
op1, jar1 = new_session()
html_base, url_base = get(op1, f"{BASE}/people/result/{ENCODED}")
if "/people/result/" not in url_base:
    # result にたどり着けない → vote ページで投票が必要
    print(f"  → result 未到達: {url_base}")
    print("  既存 cookie なしでは result にアクセスできません。")
    print("  vote ページから ok=ng POST を直接テストします。")
    base_votes = None
else:
    base_votes = extract_votes(html_base)
    print(f"  URL: {url_base}")
    print(f"  like:    {base_votes['like_pct']}% ({base_votes['like_cnt']}票)")
    print(f"  dislike: {base_votes['dislike_pct']}% ({base_votes['dislike_cnt']}票)")

# =========================================================
# STEP 2: 別セッションで vote ページ取得 → ok=ng POST
# =========================================================
print("\n" + "=" * 60)
print("STEP 2: 別セッション（新規 Cookie）で vote ページ取得")
print("=" * 60)
op2, jar2 = new_session()
html_vote, url_vote = get(op2, f"{BASE}/people/vote/{ENCODED}")
print(f"  URL: {url_vote}")
print(f"  Cookies: {[(c.name, c.value) for c in jar2]}")

if "/people/result/" in url_vote:
    print("  → 既に IP トラッキング済み（result にリダイレクト）。別の人物が必要。")
    _f.close(); sys.exit(1)

# トークン抽出
auth1 = parse_input(html_vote, "auth1")
auth2 = parse_input(html_vote, "auth2")
authr = parse_input(html_vote, "auth-r")
pid   = parse_input(html_vote, "id")
print(f"  tokens: id={pid}, auth1={'OK' if auth1 else 'NG'}, auth-r={authr!r}")

# ok=ng POST（vote=1 / 好き選択 のまま ok だけ ng）
print("\n" + "=" * 60)
print("STEP 3: ok=ng で POST（投票しない閲覧の試み）")
print("=" * 60)
body_ng = urllib.parse.urlencode({
    "vote": "1", "ok": "ng", "id": pid,
    "auth1": auth1, "auth2": auth2, "auth-r": authr,
}).encode()
req_ng = urllib.request.Request(
    f"{BASE}/people/result/{ENCODED}", data=body_ng,
    headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded",
             "Origin": BASE, "Referer": f"{BASE}/people/vote/{ENCODED}"},
)
resp_ng = op2.open(req_ng, timeout=15)
html_ng = resp_ng.read().decode("utf-8", errors="replace")
url_ng  = resp_ng.geturl()

print(f"  → URL: {url_ng}")
print(f"  Cookies after POST: {[(c.name, c.value) for c in jar2]}")
is_result = bool(re.search(r'好き派:', html_ng))
print(f"  is result page: {is_result}")

ng_votes = None
if is_result:
    ng_votes = extract_votes(html_ng)
    print(f"  like:    {ng_votes['like_pct']}% ({ng_votes['like_cnt']}票)")
    print(f"  dislike: {ng_votes['dislike_pct']}% ({ng_votes['dislike_cnt']}票)")

# =========================================================
# STEP 4: ok=ng POST 後、同じ人物の vote ページへ再アクセス
#          → リダイレクトされたら IP トラッキング発動（投票扱い）
# =========================================================
print("\n" + "=" * 60)
print("STEP 4: ok=ng POST 後に vote ページへ再アクセス（IP トラッキング確認）")
print("=" * 60)
# 同じ session（jar2）で再アクセス
html_revote, url_revote = get(op2, f"{BASE}/people/vote/{ENCODED}")
print(f"  URL: {url_revote}")
if "/people/result/" in url_revote:
    print("  → result にリダイレクト ★ IP/Cookie トラッキング発動（投票扱い）")
else:
    print("  → vote ページのまま ★ トラッキングなし（投票扱いでない可能性）")

# 全く新しいセッションでも確認
print("\n  [完全新規セッションでも確認]")
op3, jar3 = new_session()
html_fresh, url_fresh = get(op3, f"{BASE}/people/vote/{ENCODED}")
print(f"  URL: {url_fresh}")
if "/people/result/" in url_fresh:
    print("  → result にリダイレクト ★ IP ベースでトラッキング（サーバー側に記録あり）")
else:
    print("  → vote ページのまま ★ IP トラッキングなし（サーバー側に記録されていない）")

# =========================================================
# STEP 5: 票数比較
# =========================================================
print("\n" + "=" * 60)
print("STEP 5: 票数比較まとめ")
print("=" * 60)
if base_votes and ng_votes:
    try:
        base_like = int(base_votes["like_cnt"])
        ng_like   = int(ng_votes["like_cnt"])
        diff = ng_like - base_like
        print(f"  ベースライン 好き票数: {base_like}")
        print(f"  ok=ng POST 後 好き票数: {ng_like}")
        print(f"  差分: {diff:+d}")
        if diff == 0:
            print("  → 票数変化なし ★ ok=ng は票数に影響しない可能性が高い")
        elif diff == 1:
            print("  → 好き票が +1 ★ ok=ng でも vote=1 が加算された（投票扱い）")
        else:
            print(f"  → 差分 {diff}（他ユーザーの同時投票の影響の可能性あり）")
    except ValueError:
        print("  票数の数値変換に失敗")
else:
    print("  ベースラインまたは ok=ng 後の票数が取得できなかった")
    if ng_votes:
        print(f"  ok=ng 後: like={ng_votes['like_pct']}%({ng_votes['like_cnt']}票) dislike={ng_votes['dislike_pct']}%({ng_votes['dislike_cnt']}票)")

_f.close()
