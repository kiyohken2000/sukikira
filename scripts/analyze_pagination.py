"""
コメントページネーション仕様変更の調査
実行: python scripts/analyze_pagination.py
"""
import urllib.request, urllib.parse, re, http.cookiejar, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_pagination.txt"), "w", encoding="utf-8")

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

NAME    = "新垣結衣"
ENCODED = urllib.parse.quote(NAME)
BASE    = "https://suki-kira.com"

# Cookie管理（投票済み状態でresultページにアクセスするため）
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with opener.open(req, timeout=15) as res:
        return res.read().decode("utf-8", errors="replace"), res.url

def extract_comment_ids(html):
    return re.findall(r'<div class="comment-container c(\d+)"', html)

def extract_pagination(html):
    m = re.search(r'<ul[^>]*pagination[\s\S]{0,3000}?</ul>', html, re.IGNORECASE)
    return m.group(0) if m else None

print("=" * 60)
print("コメントページネーション調査")
print("=" * 60)

# 1. 結果ページ（ページ1）
print("\n--- 1. 結果ページ（デフォルト） ---")
url1 = f"{BASE}/people/result/{ENCODED}"
html1, final_url1 = fetch(url1)
print(f"URL: {url1}")
print(f"Final URL: {final_url1}")
ids1 = extract_comment_ids(html1)
print(f"コメント数: {len(ids1)}")
print(f"コメントID: {ids1}")
if ids1:
    print(f"最大ID: {max(ids1, key=int)}, 最小ID: {min(ids1, key=int)}")
pag1 = extract_pagination(html1)
print(f"ページネーション: {pag1}")

# nxc の出現箇所
nxc_contexts = re.findall(r'.{0,60}nxc.{0,60}', html1)
print(f"\nnxc出現箇所 ({len(nxc_contexts)}件):")
for ctx in nxc_contexts:
    print(f"  {ctx.strip()}")

# 2. ?nxc=最小ID でアクセス
if ids1:
    min_id = min(ids1, key=int)
    print(f"\n--- 2. ?nxc={min_id} でアクセス ---")
    url2 = f"{BASE}/people/result/{ENCODED}/?nxc={min_id}"
    html2, final_url2 = fetch(url2)
    print(f"URL: {url2}")
    print(f"Final URL: {final_url2}")
    ids2 = extract_comment_ids(html2)
    print(f"コメント数: {len(ids2)}")
    print(f"コメントID: {ids2}")
    if ids2:
        print(f"最大ID: {max(ids2, key=int)}, 最小ID: {min(ids2, key=int)}")
    print(f"ページ1と同じ?: {ids1 == ids2}")

# 3. 様々なURLパターンを試す
print("\n--- 3. 様々なURLパターンを試す ---")
test_patterns = [
    f"/people/result/{ENCODED}/?prc=2",
    f"/people/result/{ENCODED}/?prc=3",
    f"/people/result/{ENCODED}/2",
    f"/people/result/{ENCODED}/page/2",
    f"/people/result/{ENCODED}/?page=2",
    f"/people/result/{ENCODED}/?p=2",
    f"/people/result/{ENCODED}/?cm=2",
]

for pattern in test_patterns:
    try:
        url = f"{BASE}{pattern}"
        html, final_url = fetch(url)
        ids = extract_comment_ids(html)
        is_result = bool(re.search(r'好き派:', html))
        same_as_p1 = ids == ids1 if ids1 else None
        min_id = min(ids, key=int) if ids else None
        max_id = max(ids, key=int) if ids else None
        print(f"\n  {pattern}")
        print(f"    結果ページ: {is_result}, コメント数: {len(ids)}, 同じ: {same_as_p1}")
        if ids:
            print(f"    ID範囲: {max_id} ~ {min_id}")
            print(f"    先頭5件: {ids[:5]}")
    except Exception as e:
        print(f"\n  {pattern}")
        print(f"    エラー: {e}")

# 4. ページネーションの data-ci-pagination-page 属性を調査
print("\n--- 4. data-ci-pagination-page 調査 ---")
page_matches = re.findall(r'data-ci-pagination-page="(\d+)"', html1)
print(f"ページ1の data-ci-pagination-page: {page_matches}")

# data-ci-pagination-page の値を使ってアクセス
if page_matches:
    for page_num in page_matches[:3]:
        try:
            # ページ番号ベースの可能性
            url = f"{BASE}/people/result/{ENCODED}/?prc={page_num}"
            html, _ = fetch(url)
            ids = extract_comment_ids(html)
            same = ids == ids1 if ids1 else None
            min_id = min(ids, key=int) if ids else None
            print(f"  ?prc={page_num}: コメント数={len(ids)}, 同じ={same}, 最小ID={min_id}")
        except Exception as e:
            print(f"  ?prc={page_num}: エラー={e}")

# 5. HTML内のJavaScriptでAJAX読み込みパターンを探す
print("\n--- 5. AJAX/JavaScript パターン調査 ---")
# fetch/XMLHttpRequest/$.ajax等のパターン
ajax_patterns = re.findall(r'.{0,80}(fetch|XMLHttpRequest|ajax|loadMore|nextPage|pagination|prc|nxc).{0,80}', html1, re.IGNORECASE)
print(f"AJAX関連パターン ({len(ajax_patterns)}件):")
for p in ajax_patterns[:20]:
    print(f"  {p.strip()}")

# script タグの内容を調査
scripts = re.findall(r'<script[^>]*>([\s\S]*?)</script>', html1)
print(f"\nscriptタグ数: {len(scripts)}")
for i, script in enumerate(scripts):
    if any(kw in script.lower() for kw in ['comment', 'page', 'nxc', 'prc', 'load', 'next', 'pagination']):
        print(f"\n  script[{i}] (関連キーワードあり, {len(script)}文字):")
        # 長すぎる場合は先頭500文字
        print(f"  {script[:800]}")

print("\n" + "=" * 60)
print("調査完了")
print("=" * 60)

_out_file.close()
