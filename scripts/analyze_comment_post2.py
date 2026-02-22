"""
コメント投稿の type フィールドと >>NNN ボディの影響を調査
実行: python scripts/analyze_comment_post2.py
出力: scripts/out/analyze_comment_post2.txt
"""
import urllib.request, urllib.parse, urllib.error, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_f = open(os.path.join(_out_dir, "analyze_comment_post2.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, *args, **kwargs):
        sys.__stdout__.write(*args, **kwargs)
        _f.write(*args, **kwargs)
    def flush(self):
        sys.__stdout__.flush()
        _f.flush()

sys.stdout = _Tee()

# ---- 設定 ----
# まだ投票してない/最近投票してない人物を使う
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

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    resp = opener.open(req, timeout=15)
    return resp.read().decode("utf-8", errors="replace"), resp.geturl()

def parse_input(html, name):
    m = (re.search(rf'name="{name}"[^>]*value="([^"]*)"', html) or
         re.search(rf'value="([^"]*)"[^>]*name="{name}"', html))
    return m.group(1) if m else None

# ---- select 要素の値を抽出 ----
def find_select_options(html):
    """type 選択 select の option 値を全て取得"""
    # comment-type select を探す
    # "select-like-type" or "comment-type" など
    selects = re.findall(r'<select[^>]+id="[^"]*(?:type|like)[^"]*"[^>]*>([\s\S]*?)</select>', html)
    if not selects:
        # id なしで探す
        selects = re.findall(r'<select[^>]*>([\s\S]*?)</select>', html)

    result = []
    for s in selects[:5]:
        options = re.findall(r'<option([^>]*)>([^<]*)</option>', s)
        result.append(options)
    return result

# ---- コメント投稿 ----
def do_post(action, id_, name_id, type_, url, body_text, sum_, auth1, auth2, authr, tag_id, extra_label=""):
    data = {
        "id": id_,
        "name_id": name_id,
        "type": type_,
        "url": url,
        "body": body_text,
        "sum": sum_,
        "auth1": auth1,
        "auth2": auth2,
        "auth-r": authr,
        "ok": "ok",
        "tag_id": tag_id,
    }
    body_enc = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(
        f"{BASE}{action}",
        data=body_enc,
        headers={
            **HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": BASE,
            "Referer": f"{BASE}/people/result/{ENCODED}",
        }
    )
    try:
        resp = opener.open(req, timeout=15)
        html = resp.read().decode("utf-8", errors="replace")
        status = resp.status
        final_url = resp.geturl()
        # エラー/成功メッセージ
        alert = re.search(r'class="alert[^"]*"[^>]*>([\s\S]{0,300}?)</div>', html)
        comment_count = len(re.findall(r'class="comment-container', html))
        # 最初のコメントIDを確認
        first_id_m = re.search(r'class="comment-container c(\d+)"', html)
        print(f"[{extra_label}] status={status} url={final_url}")
        print(f"  type={type_!r} body={body_text!r}")
        print(f"  comments={comment_count}, first_id={first_id_m.group(1) if first_id_m else 'N/A'}")
        if alert:
            print(f"  alert: {alert.group(1)[:200]}")
        # 投稿後の最初のコメント本文を確認
        body_m = re.search(r'itemprop="reviewBody"[^>]*>([\s\S]{0,200}?)</p>', html)
        if body_m:
            print(f"  latest comment: {body_m.group(1)[:100]}")
        return html, status
    except urllib.error.HTTPError as e:
        print(f"[{extra_label}] HTTPError {e.code}: {e.reason}")
        print(f"  type={type_!r} body={body_text!r}")
        try:
            err_html = e.read().decode("utf-8", errors="replace")
            print(f"  error body (first 500): {err_html[:500]}")
        except:
            pass
        return None, e.code

# ======================================================================
print("=" * 60)
print("STEP 1: result ページを取得してフォームを解析")
print("=" * 60)

result_html, result_url = get(f"{BASE}/people/result/{ENCODED}")
print(f"URL: {result_url}, HTML: {len(result_html)} chars")

action_m = re.search(r'action="(/people/comment/[^"]+)"', result_html)
action = action_m.group(1) if action_m else None
id_ = parse_input(result_html, "id")
sum_ = parse_input(result_html, "sum")
tag_id = parse_input(result_html, "tag_id")
auth1 = parse_input(result_html, "auth1")
auth2 = parse_input(result_html, "auth2")
authr = parse_input(result_html, "auth-r")

print(f"action={action}, id={id_}, sum={sum_}, tag_id={tag_id}")
print(f"auth1={auth1}, auth-r={authr!r}")

# ---- select の option を全て表示 ----
print("\n[select options in page]")
selects = find_select_options(result_html)
for i, opts in enumerate(selects):
    print(f"  select#{i}: {opts}")

# ---- コメント type に関係する JS を確認 ----
print("\n[type/comment JS snippets]")
js_snippets = re.findall(r'(?:select-like-type|comment.type|type.*confirm)[\s\S]{0,200}', result_html)
for s in js_snippets[:5]:
    print(f"  {s[:300]}")

# ---- type select の value を丁寧に調べる ----
print("\n[全 select 要素 (最初の5つ)]")
all_selects = re.findall(r'<select[^>]*>([\s\S]*?)</select>', result_html)
for i, s in enumerate(all_selects[:5]):
    opts = re.findall(r'<option([^>]*)>([^<]*)<', s)
    print(f"  select#{i}: opts={opts}")

if not action:
    print("ERROR: comment form not found (maybe not logged in / no cookie)")
    _f.close()
    sys.exit(1)

print("\n" + "=" * 60)
print("STEP 2: type='' (現状) でテスト投稿")
print("=" * 60)
html1, status1 = do_post(action, id_, "", "", NAME, "type空テスト投稿（テスト）", sum_, auth1, auth2, authr, tag_id, "type=empty")

if status1 != 200:
    # トークンが使えないので一旦再取得してから次のテストへ
    print("  → 再取得して次のテストへ")
    result_html, _ = get(f"{BASE}/people/result/{ENCODED}")
    id_ = parse_input(result_html, "id")
    sum_ = parse_input(result_html, "sum")
    tag_id = parse_input(result_html, "tag_id")
    auth1 = parse_input(result_html, "auth1")
    auth2 = parse_input(result_html, "auth2")
    authr = parse_input(result_html, "auth-r")

print("\n" + "=" * 60)
print("STEP 3: >>NNN 入りボディでテスト")
print("=" * 60)
# 先に再取得
result_html2, _ = get(f"{BASE}/people/result/{ENCODED}")
id2 = parse_input(result_html2, "id")
sum2 = parse_input(result_html2, "sum")
tag2 = parse_input(result_html2, "tag_id")
auth1_2 = parse_input(result_html2, "auth1")
auth2_2 = parse_input(result_html2, "auth2")
authr2 = parse_input(result_html2, "auth-r")

# 最初のコメントIDを取得（アンカー用）
first_comment = re.search(r'class="comment-container c(\d+)"', result_html2)
ref_id = first_comment.group(1) if first_comment else "99999"
print(f"アンカー参照先ID: {ref_id}")

html2, status2 = do_post(action, id2, "", "", NAME, f">>{ref_id}\nこれは返信テストです", sum2, auth1_2, auth2_2, authr2, tag2, f">>anchor body")

_f.close()
