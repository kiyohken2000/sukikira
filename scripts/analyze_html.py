"""
suki-kira.com の HTML 構造解析スクリプト
実行: python scripts/analyze_html.py
出力: scripts/out/analyze_html.txt にも保存される
"""

import urllib.request
import re
import sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_html.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, *args, **kwargs):
        sys.__stdout__.write(*args, **kwargs)
        _out_file.write(*args, **kwargs)
    def flush(self):
        sys.__stdout__.flush()
        _out_file.flush()

sys.stdout = _Tee()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as res:
        return res.read().decode("utf-8", errors="replace")

def section(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

def analyze_top():
    section("トップページ解析: https://suki-kira.com/")
    html = fetch("https://suki-kira.com/")
    print(f"HTML 全体の長さ: {len(html)} 文字\n")

    # --- /people/ リンクの総数 ---
    people_links = re.findall(r'href="(/people/[^"]+)"', html)
    print(f"[1] /people/ リンク総数: {len(people_links)}")
    print("    最初の10件:")
    for lnk in people_links[:10]:
        print(f"      {lnk}")

    # --- 見出し要素 ---
    headings = re.findall(r'<(h[1-4])[^>]*>(.*?)</h[1-4]>', html, re.S)
    print(f"\n[2] 見出し要素 (h1〜h4) 総数: {len(headings)}")
    for tag, text in headings[:15]:
        clean = re.sub(r'<[^>]+>', '', text).strip()
        if clean:
            print(f"      <{tag}>: {clean[:80]}")

    # --- ol / ul の数と各 li 数 ---
    ols = re.findall(r'<ol[^>]*>(.*?)</ol>', html, re.S)
    uls = re.findall(r'<ul[^>]*>(.*?)</ul>', html, re.S)
    print(f"\n[3] <ol> 数: {len(ols)}")
    for i, ol in enumerate(ols):
        li_count = len(re.findall(r'<li', ol))
        print(f"      ol[{i}]: <li> 数 = {li_count}")
    print(f"    <ul> 数: {len(uls)}")
    for i, ul in enumerate(uls):
        li_count = len(re.findall(r'<li', ul))
        print(f"      ul[{i}]: <li> 数 = {li_count}")

    # --- div/section の class 一覧（ランキング関係を探す）---
    tags_with_class = re.findall(r'<(?:div|section|article)[^>]*class="([^"]*)"', html)
    keywords = ["rank", "people", "list", "item", "card", "celebrity", "person", "good", "bad", "like", "dislike", "trend", "popular"]
    print(f"\n[4] div/section/article の class (関連キーワードを含むもの):")
    seen = set()
    for cls in tags_with_class:
        lower = cls.lower()
        if any(kw in lower for kw in keywords) and cls not in seen:
            print(f"      class=\"{cls}\"")
            seen.add(cls)

    # --- 最初の /people/ リンク周辺 HTML を表示 ---
    first_people = re.search(r'href="/people/', html)
    if first_people:
        start = max(0, first_people.start() - 600)
        end = min(len(html), first_people.start() + 600)
        print(f"\n[5] 最初の /people/ リンク周辺の HTML ({start}〜{end}):")
        print(html[start:end])

    # --- id 属性の一覧（セクション区切りを探す）---
    ids = re.findall(r'<(?:div|section)[^>]*id="([^"]+)"', html)
    if ids:
        print(f"\n[6] div/section の id 属性:")
        for id_val in ids[:20]:
            print(f"      id=\"{id_val}\"")

    return html

def analyze_search(html_top):
    section("検索ページ解析: https://suki-kira.com/search?q=木村拓哉")
    html = fetch("https://suki-kira.com/search?q=%E6%9C%A8%E6%9D%91%E6%8B%93%E5%93%89")
    print(f"HTML 全体の長さ: {len(html)} 文字\n")

    people_links = re.findall(r'href="(/people/[^"]+)"', html)
    print(f"[1] /people/ リンク総数: {len(people_links)}")
    for lnk in people_links[:5]:
        print(f"      {lnk}")

    # 最初の /people/ リンク周辺
    first_people = re.search(r'href="/people/', html)
    if first_people:
        start = max(0, first_people.start() - 400)
        end = min(len(html), first_people.start() + 600)
        print(f"\n[2] 最初の /people/ リンク周辺の HTML:")
        print(html[start:end])

def analyze_person_result():
    section("人物詳細ページ: /people/result/木村拓哉")
    html = fetch("https://suki-kira.com/people/result/%E6%9C%A8%E6%9D%91%E6%8B%93%E5%93%89")
    print(f"HTML 全体の長さ: {len(html)} 文字\n")

    # 好き・嫌い割合
    percents = re.findall(r'([\d.]+)%', html)
    print(f"[1] % を含む数値: {percents[:10]}")

    # 「票」を含む箇所
    votes = re.findall(r'([\d,]+)票', html)
    print(f"[2] 票数: {votes[:5]}")

    # itemprop="reviewBody" の有無
    reviews = re.findall(r'itemprop="reviewBody"[^>]*>(.*?)</', html, re.S)
    print(f"[3] itemprop=reviewBody のコメント数: {len(reviews)}")
    for r in reviews[:3]:
        print(f"      {re.sub(r'<[^>]+>', '', r).strip()[:80]}")

    # bobj[] パターン
    bobj = re.findall(r'bobj\[(\d+)\]', html)
    print(f"[4] bobj[] コメントID数: {len(bobj)}, 最初の5件: {bobj[:5]}")

    # h1 タグ
    h1s = re.findall(r'<h1[^>]*>(.*?)</h1>', html, re.S)
    for h in h1s:
        print(f"[5] <h1>: {re.sub(r'<[^>]+>', '', h).strip()}")

    # コメント周辺 HTML（最初の reviewBody の前後）
    rv = re.search(r'itemprop="reviewBody"', html)
    if rv:
        start = max(0, rv.start() - 300)
        end = min(len(html), rv.start() + 500)
        print(f"\n[6] reviewBody 周辺の HTML:")
        print(html[start:end])
    else:
        print("[6] itemprop=reviewBody が見つかりませんでした")
        # コメントらしき箇所を探す
        comment_hints = re.findall(r'<(?:div|p|span)[^>]*class="[^"]*(?:comment|review|body|text)[^"]*"[^>]*>(.*?)</(?:div|p|span)>', html[:5000], re.S)
        print(f"  comment/review/body クラスの要素: {len(comment_hints)} 件")
        for c in comment_hints[:3]:
            print(f"    {re.sub(r'<[^>]+>', '', c).strip()[:80]}")

def analyze_vote_page():
    section("投票ページ（フォームトークン確認）: /people/vote/木村拓哉")
    html = fetch("https://suki-kira.com/people/vote/%E6%9C%A8%E6%9D%91%E6%8B%93%E5%93%89")
    print(f"HTML 全体の長さ: {len(html)} 文字\n")

    # hidden input を全部出す
    inputs = re.findall(r'<input[^>]*type="hidden"[^>]*/?>',  html)
    print(f"[1] hidden input 一覧 ({len(inputs)} 件):")
    for inp in inputs:
        print(f"      {inp}")

    # form の action
    actions = re.findall(r'<form[^>]*action="([^"]*)"', html)
    print(f"[2] form action: {actions}")

if __name__ == "__main__":
    html_top = analyze_top()
    analyze_search(html_top)
    analyze_person_result()
    analyze_vote_page()
    print("\n\n解析完了。")
