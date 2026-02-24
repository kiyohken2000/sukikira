"""
括弧付き人物名のURLエンコーディング調査。

調査内容:
  STEP 1: 括弧なし人物（羽生結弦）で vote/result ページへアクセス → 正常動作のベースライン
  STEP 2: 括弧あり人物（HIKAKIN (ヒカキン)）で複数のエンコーディング方式を試す
  STEP 3: 括弧あり人物（田中瞳 (アナウンサー)）で同様に試す
  STEP 4: ランキングHTMLから実際の href を取得し、そのまま使ってアクセスする

実行: python scripts/analyze_parentheses.py
出力: scripts/out/analyze_parentheses.txt にも保存
"""

import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar
import re
import sys
import os

# ---- 出力設定 ----
_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_parentheses.txt"), "w", encoding="utf-8")

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

# ---- 設定 ----
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

def make_opener():
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    return opener, jar

def fetch_get(opener, url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with opener.open(req, timeout=15) as res:
            final_url = res.geturl()
            html = res.read().decode("utf-8", errors="replace")
            status = res.getcode()
            return status, final_url, html
    except urllib.error.HTTPError as e:
        return e.code, url, ""
    except Exception as e:
        return -1, url, str(e)

def analyze_response(label, status, final_url, html):
    is_people = "/people/" in final_url
    has_vote_form = "auth1" in html
    has_result = "好き派:" in html
    print(f"\n  [{label}]")
    print(f"    Status: {status}")
    print(f"    Final URL: {final_url}")
    print(f"    /people/ in URL: {is_people}")
    print(f"    Has vote form: {has_vote_form}")
    print(f"    Has result: {has_result}")
    if status == 200 and is_people:
        print(f"    → OK (ページ取得成功)")
    elif status == 403:
        print(f"    → 403 Forbidden")
    elif not is_people:
        print(f"    → リダイレクト (人物不存在)")
    return status == 200 and is_people

# encodeURIComponent 相当
def encode_standard(name):
    return urllib.parse.quote(name, safe='')

# 括弧のみ復元（現在のアプリ実装）
def encode_parens(name):
    return urllib.parse.quote(name, safe='()')

# パスセーフ（スペースのみエンコード）
def encode_path(name):
    return urllib.parse.quote(name, safe="()'!~*-._")

opener, jar = make_opener()

# ============================================================
section("STEP 1: 括弧なし人物のベースライン（羽生結弦）")
# ============================================================
name = "羽生結弦"
url = f"{BASE}/people/vote/{encode_standard(name)}"
print(f"  名前: {name}")
status, final_url, html = fetch_get(opener, url)
analyze_response("vote ページ", status, final_url, html)

url = f"{BASE}/people/result/{encode_standard(name)}"
status, final_url, html = fetch_get(opener, url)
analyze_response("result ページ", status, final_url, html)

# ============================================================
section("STEP 2: HIKAKIN (ヒカキン) — 各エンコーディング方式")
# ============================================================
name = "HIKAKIN (ヒカキン)"
print(f"  名前: {name}")
print()

for label, encoded in [
    ("A: 全エンコード (encodeURIComponent)", encode_standard(name)),
    ("B: 括弧復元 (現アプリ実装)", encode_parens(name)),
    ("C: パスセーフ", encode_path(name)),
]:
    url = f"{BASE}/people/vote/{encoded}"
    print(f"  URL: {url}")
    status, final_url, html = fetch_get(opener, url)
    analyze_response(label, status, final_url, html)

# ============================================================
section("STEP 3: 田中瞳 (アナウンサー) — 各エンコーディング方式")
# ============================================================
name = "田中瞳 (アナウンサー)"
print(f"  名前: {name}")
print()

for label, encoded in [
    ("A: 全エンコード (encodeURIComponent)", encode_standard(name)),
    ("B: 括弧復元 (現アプリ実装)", encode_parens(name)),
    ("C: パスセーフ", encode_path(name)),
]:
    url = f"{BASE}/people/vote/{encoded}"
    print(f"  URL: {url}")
    status, final_url, html = fetch_get(opener, url)
    analyze_response(label, status, final_url, html)

# ============================================================
section("STEP 4: ランキングHTMLから実際の href を取得して直接アクセス")
# ============================================================
print("  好感度ランキング1ページ目を取得...")
url = f"{BASE}/ranking/like"
status, final_url, html = fetch_get(opener, url)
print(f"  Status: {status}, Length: {len(html)}")

# 括弧を含む href を探す
href_pattern = re.compile(r'href="(/people/vote/[^"]*\([^"]*\))"')
matches = href_pattern.findall(html)
print(f"  括弧を含む href の数: {len(matches)}")

if matches:
    for href in matches[:5]:
        print(f"\n  実際の href: {href}")
        url = f"{BASE}{href}"
        status, final_url, html_page = fetch_get(opener, url)
        analyze_response(f"href そのまま: {href}", status, final_url, html_page)
else:
    print("  括弧を含む href が見つからない")
    # 括弧なしも含めて最初の5件のhrefを表示
    all_hrefs = re.findall(r'href="(/people/vote/[^"]+)"', html)
    print(f"  全 href 数: {len(all_hrefs)}")
    for h in all_hrefs[:5]:
        decoded = urllib.parse.unquote(h)
        print(f"    {h}")
        print(f"    → decoded: {decoded}")

# ============================================================
section("STEP 5: ランキングHTML内の人物名とhrefの対応を確認")
# ============================================================
# h2.title テキストと対応する href を抽出
name_pattern = re.compile(r'<h2[^>]*class="title"[^>]*>([^<]+)</h2>')
link_pattern = re.compile(r'href="(/people/vote/[^"]+)"')

# セクションごとに確認
section_pattern = re.compile(r'<section[^>]*class="[^"]*box-rank-review[^"]*">([\s\S]*?)</section>')
sections = section_pattern.findall(html)
print(f"  セクション数: {len(sections)}")

paren_count = 0
for i, block in enumerate(sections[:10]):
    nm = name_pattern.search(block)
    lk = link_pattern.search(block)
    if nm and lk:
        h2_name = nm.group(1).strip()
        href_val = lk.group(1)
        decoded_href = urllib.parse.unquote(href_val)
        name_from_href = decoded_href.replace('/people/vote/', '')
        has_paren = '(' in h2_name
        if has_paren:
            paren_count += 1
            print(f"\n  [{i+1}] h2 名: {h2_name}")
            print(f"       href名: {name_from_href}")
            print(f"       一致: {h2_name == name_from_href}")
            print(f"       href raw: {href_val}")

if paren_count == 0:
    print("  括弧を含む人物が上位10件にいなかった")
    # 全セクションで探す
    for i, block in enumerate(sections):
        nm = name_pattern.search(block)
        if nm and '(' in nm.group(1):
            lk = link_pattern.search(block)
            h2_name = nm.group(1).strip()
            href_val = lk.group(1) if lk else '(not found)'
            print(f"\n  [{i+1}] h2 名: {h2_name}")
            print(f"       href raw: {href_val}")
            paren_count += 1
            if paren_count >= 3:
                break

print("\n\n完了")
_out_file.close()
