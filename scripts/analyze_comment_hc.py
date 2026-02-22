"""
healthcheck 呼び出し + auth_h1/auth_h2 + type=1 でコメント投稿テスト
実行: python scripts/analyze_comment_hc.py
出力: scripts/out/analyze_comment_hc.txt
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os, hashlib, uuid, json

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_f = open(os.path.join(_out_dir, "analyze_comment_hc.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, *args, **kwargs):
        sys.__stdout__.write(*args, **kwargs)
        _f.write(*args, **kwargs)
    def flush(self):
        sys.__stdout__.flush()
        _f.flush()
sys.stdout = _Tee()

NAME = "さかなクン"
ENCODED = urllib.parse.quote(NAME)
BASE = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def get(url, extra_headers=None):
    h = {**HEADERS, **(extra_headers or {})}
    req = urllib.request.Request(url, headers=h)
    resp = opener.open(req, timeout=15)
    return resp.read().decode("utf-8", errors="replace"), resp.geturl()

def parse_input(html, name):
    m = (re.search(rf'name="{name}"[^>]*value="([^"]*)"', html) or
         re.search(rf'value="([^"]*)"[^>]*name="{name}"', html))
    return m.group(1) if m else None

def parse_input_by_id(html, id_):
    m = (re.search(rf'id="{id_}"[^>]*value="([^"]*)"', html) or
         re.search(rf'value="([^"]*)"[^>]*id="{id_}"', html))
    return m.group(1) if m else None

# fake fingerprint
FP_VISITOR_ID = str(uuid.uuid4()).replace("-", "")
FP_HASH = hashlib.sha256(FP_VISITOR_ID.encode()).hexdigest()[:8]
print(f"Fake fingerprint: auth_h1={FP_VISITOR_ID}, auth_h2={FP_HASH}\n")

# STEP 1: result page取得
print("=" * 60)
print("STEP 1: result page取得")
result_html, result_url = get(f"{BASE}/people/result/{ENCODED}")
print(f"  URL: {result_url}, len: {len(result_html)}")
print(f"  Cookies: {[(c.name, c.value[:20]) for c in jar]}")

# フォームフィールド抽出
action_m = re.search(r'action="(/people/comment/[^"]+)"', result_html)
action = action_m.group(1) if action_m else None
pid_m = re.search(r'var pid = "(\d+)"', result_html)
pid = pid_m.group(1) if pid_m else None
id_ = parse_input(result_html, "id")
sum_ = parse_input(result_html, "sum")
tag_id = parse_input(result_html, "tag_id")
auth1 = parse_input(result_html, "auth1")
auth2 = parse_input(result_html, "auth2")
authr = parse_input(result_html, "auth-r")

print(f"  pid={pid}, action={action}")
print(f"  id={id_}, sum={sum_}, auth-r={authr!r}")
print(f"  auth1={auth1[:10] if auth1 else 'N/A'}...")

# 全 hidden input 出力
print("\n  [全 hidden inputs]")
for m in re.finditer(r'<input[^>]*type="hidden"[^>]*>', result_html):
    inp = m.group(0)
    name_m = re.search(r'name="([^"]*)"', inp)
    val_m = re.search(r'value="([^"]*)"', inp)
    id_m2 = re.search(r'id="([^"]*)"', inp)
    n = name_m.group(1) if name_m else "-"
    v = val_m.group(1) if val_m else "-"
    i2 = id_m2.group(1) if id_m2 else ""
    print(f"    name={n!r:30} value={v!r:30} id={i2!r}")

if not action or not pid:
    print("ERROR: action or pid not found")
    _f.close()
    sys.exit(1)

# STEP 2: healthcheck
print("\n" + "=" * 60)
print("STEP 2: healthcheck")
try:
    hc_html, hc_url = get(
        f"{BASE}/people/vote/healthcheck?pid={pid}",
        extra_headers={"Accept": "text/plain, */*", "Referer": f"{BASE}/people/result/{ENCODED}"}
    )
    print(f"  Response: {hc_html!r}")
    print(f"  Cookies after healthcheck: {[(c.name, c.value[:30]) for c in jar]}")
    # healthcheck response: "ok" → submit immediately, number → countdown seconds
    if hc_html.strip() == "ok":
        auth_r_val = authr or "n"
    elif hc_html.strip().isdigit():
        auth_r_val = hc_html.strip()
        print(f"  → countdown={auth_r_val}秒")
    else:
        auth_r_val = authr or "n"
        print(f"  → 不明なレスポンス")
except Exception as e:
    print(f"  healthcheck ERROR: {e}")
    auth_r_val = authr or "n"

# STEP 3: 新しいトークンで result page 再取得
print("\n" + "=" * 60)
print("STEP 3: 新しいトークンで result page 再取得")
result_html2, _ = get(f"{BASE}/people/result/{ENCODED}")
id2 = parse_input(result_html2, "id")
sum2 = parse_input(result_html2, "sum")
tag2 = parse_input(result_html2, "tag_id")
auth1_2 = parse_input(result_html2, "auth1")
auth2_2 = parse_input(result_html2, "auth2")
action_m2 = re.search(r'action="(/people/comment/[^"]+)"', result_html2)
action2 = action_m2.group(1) if action_m2 else action

# 現在のコメントID（比較用）
base_id_m = re.search(r'class="comment-container c(\d+)"', result_html2)
base_id = base_id_m.group(1) if base_id_m else "N/A"
print(f"  base_id={base_id}, id={id2}, sum={sum2}")

# STEP 4: type=1 (好き派) + auth_h1/auth_h2 でコメント投稿
print("\n" + "=" * 60)
print("STEP 4: type=1, auth_h1/auth_h2 付き投稿テスト")
data = {
    "id": id2,
    "name_id": "",
    "type": "1",  # 好き派=1, 嫌い派=0
    "url": NAME,
    "body": "テスト投稿（type=1, auth_h付き）",
    "sum": sum2,
    "auth1": auth1_2,
    "auth2": auth2_2,
    "auth-r": auth_r_val,
    "ok": "ok",
    "tag_id": tag2,
    "auth_h1": FP_VISITOR_ID,
    "auth_h2": FP_HASH,
}
body_enc = urllib.parse.urlencode(data).encode()
print(f"  POST fields: {list(data.keys())}")
print(f"  auth-r={auth_r_val!r}, type={data['type']!r}")

try:
    req = urllib.request.Request(
        f"{BASE}{action2}", data=body_enc,
        headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded",
                 "Origin": BASE, "Referer": f"{BASE}/people/result/{ENCODED}",
                 "check_cookie": "true"}
    )
    resp = opener.open(req, timeout=15)
    resp_html = resp.read().decode("utf-8", errors="replace")
    new_id_m = re.search(r'class="comment-container c(\d+)"', resp_html)
    new_id = new_id_m.group(1) if new_id_m else "N/A"
    count = len(re.findall(r'class="comment-container', resp_html))
    print(f"  status=200, URL: {resp.geturl()}")
    print(f"  first_id={new_id} (base={base_id}), count={count}")
    print(f"  → コメント保存: {'YES！' if new_id != base_id else 'NO（first_idが変わらず）'}")
except Exception as e:
    print(f"  ERROR: {e}")

# STEP 5: type=0 (嫌い派) でも試す
print("\n" + "=" * 60)
print("STEP 5: type=0 (嫌い派) テスト")
result_html3, _ = get(f"{BASE}/people/result/{ENCODED}")
id3 = parse_input(result_html3, "id")
sum3 = parse_input(result_html3, "sum")
tag3 = parse_input(result_html3, "tag_id")
auth1_3 = parse_input(result_html3, "auth1")
auth2_3 = parse_input(result_html3, "auth2")
action_m3 = re.search(r'action="(/people/comment/[^"]+)"', result_html3)
action3 = action_m3.group(1) if action_m3 else action
base_id3_m = re.search(r'class="comment-container c(\d+)"', result_html3)
base_id3 = base_id3_m.group(1) if base_id3_m else "N/A"

data3 = {
    "id": id3, "name_id": "", "type": "0", "url": NAME,
    "body": "テスト投稿（type=0, auth_h付き）",
    "sum": sum3, "auth1": auth1_3, "auth2": auth2_3,
    "auth-r": auth_r_val, "ok": "ok", "tag_id": tag3,
    "auth_h1": FP_VISITOR_ID, "auth_h2": FP_HASH,
}
body_enc3 = urllib.parse.urlencode(data3).encode()
try:
    req3 = urllib.request.Request(
        f"{BASE}{action3}", data=body_enc3,
        headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded",
                 "Origin": BASE, "Referer": f"{BASE}/people/result/{ENCODED}"}
    )
    resp3 = opener.open(req3, timeout=15)
    resp_html3 = resp3.read().decode("utf-8", errors="replace")
    new_id3_m = re.search(r'class="comment-container c(\d+)"', resp_html3)
    new_id3 = new_id3_m.group(1) if new_id3_m else "N/A"
    count3 = len(re.findall(r'class="comment-container', resp_html3))
    print(f"  status=200, first_id={new_id3} (base={base_id3}), count={count3}")
    print(f"  → コメント保存: {'YES！' if new_id3 != base_id3 else 'NO'}")
except Exception as e:
    print(f"  ERROR: {e}")

# STEP 6: auth_h1/auth_h2 なし・type=1
print("\n" + "=" * 60)
print("STEP 6: auth_h1/auth_h2 なし・type=1 (対照実験)")
result_html4, _ = get(f"{BASE}/people/result/{ENCODED}")
id4 = parse_input(result_html4, "id")
sum4 = parse_input(result_html4, "sum")
tag4 = parse_input(result_html4, "tag_id")
auth1_4 = parse_input(result_html4, "auth1")
auth2_4 = parse_input(result_html4, "auth2")
action_m4 = re.search(r'action="(/people/comment/[^"]+)"', result_html4)
action4 = action_m4.group(1) if action_m4 else action
base_id4_m = re.search(r'class="comment-container c(\d+)"', result_html4)
base_id4 = base_id4_m.group(1) if base_id4_m else "N/A"

data4 = {
    "id": id4, "name_id": "", "type": "1", "url": NAME,
    "body": "テスト投稿（type=1, auth_hなし）",
    "sum": sum4, "auth1": auth1_4, "auth2": auth2_4,
    "auth-r": auth_r_val, "ok": "ok", "tag_id": tag4,
    # auth_h1, auth_h2 なし
}
body_enc4 = urllib.parse.urlencode(data4).encode()
try:
    req4 = urllib.request.Request(
        f"{BASE}{action4}", data=body_enc4,
        headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded",
                 "Origin": BASE, "Referer": f"{BASE}/people/result/{ENCODED}"}
    )
    resp4 = opener.open(req4, timeout=15)
    resp_html4 = resp4.read().decode("utf-8", errors="replace")
    new_id4_m = re.search(r'class="comment-container c(\d+)"', resp_html4)
    new_id4 = new_id4_m.group(1) if new_id4_m else "N/A"
    count4 = len(re.findall(r'class="comment-container', resp_html4))
    print(f"  status=200, first_id={new_id4} (base={base_id4}), count={count4}")
    print(f"  → コメント保存: {'YES！' if new_id4 != base_id4 else 'NO'}")
except Exception as e:
    print(f"  ERROR: {e}")

_f.close()
