"""
ランキング構造の詳細解析
- トップページの各セクションにh3が何件あるか
- 専用ランキングページが存在するか確認
実行: python scripts/analyze_ranking.py
出力: scripts/out/analyze_ranking.txt にも保存される
"""
import urllib.request, urllib.parse, re, sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_ranking.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, s):
        try:
            sys.__stdout__.write(s)
        except UnicodeEncodeError:
            sys.__stdout__.write(s.encode('utf-8', errors='replace').decode('ascii', errors='replace'))
        _out_file.write(s)
    def flush(self):
        sys.__stdout__.flush()
        _out_file.flush()

sys.stdout = _Tee()

BASE = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")

def section(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

# ----------------------------------------------------------------
# STEP 1: トップページのランキングセクション h3 数を確認
# ----------------------------------------------------------------
section("STEP 1: トップページ ランキング h3 カウント")
html = get(BASE)
print(f"HTML全体: {len(html)} 文字")

h2_positions = []
for m in re.finditer(r'<h2[^>]*>([\s\S]*?)<\/h2>', html):
    text = re.sub(r'<[^>]+>', '', m.group(1)).replace('&nbsp;', ' ').strip()
    if 'ランキング' in text:
        h2_positions.append({'text': text, 'index': m.start()})

print(f"\nランキングh2 検出数: {len(h2_positions)}")
for i, h2 in enumerate(h2_positions):
    start = h2['index']
    end = h2_positions[i+1]['index'] if i+1 < len(h2_positions) else len(html)
    section_html = html[start:end]
    h3s = re.findall(r'<h3[^>]*>([\s\S]*?)<\/h3>', section_html)
    names = [re.sub(r'<[^>]+>', '', h).strip() for h in h3s if re.sub(r'<[^>]+>', '', h).strip()]
    print(f"\n  [{i}] {h2['text']} (section: {end-start}文字)")
    print(f"       h3 数: {len(names)}")
    for j, name in enumerate(names):
        print(f"       {j+1}. {name}")

# ----------------------------------------------------------------
# STEP 2: 専用ランキングページを探す
# ----------------------------------------------------------------
section("STEP 2: 専用ランキングページ候補を確認")

candidate_urls = [
    "/ranking/",
    "/ranking/good/",
    "/ranking/bad/",
    "/ranking/trend/",
    "/ranking/like/",
    "/ranking/dislike/",
    "/people/ranking/",
    "/people/ranking/good/",
]

for path in candidate_urls:
    url = BASE + path
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            final_url = r.geturl()
            body = r.read().decode("utf-8", errors="replace")
            h3_count = len(re.findall(r'<h3[^>]*>', body))
            print(f"  [OK] {path} -> {final_url} ({len(body)}chars, h3:{h3_count})")
    except Exception as e:
        print(f"  [NG] {path} -> {e}")

# ----------------------------------------------------------------
# STEP 3: トップページ内のリンクからランキング関連URLを収集
# ----------------------------------------------------------------
section("STEP 3: トップページ内のランキング関連リンク")
links = set(re.findall(r'href="(/[^"]*ranking[^"]*)"', html, re.IGNORECASE))
links |= set(re.findall(r'href="(/[^"]*rank[^"]*)"', html, re.IGNORECASE))
for link in sorted(links):
    print(f"  {link}")

# ----------------------------------------------------------------
# STEP 4: /ranking/like/ の構造を詳細解析
# ----------------------------------------------------------------
section("STEP 4: /ranking/like/ の構造解析")
rank_html = get(BASE + "/ranking/like/")
print(f"HTML: {len(rank_html)} 文字")

# 各見出しタグのカウント
for tag in ['h1', 'h2', 'h3', 'h4']:
    count = len(re.findall(rf'<{tag}[^>]*>', rank_html))
    print(f"  <{tag}> 数: {count}")

# /people/ を含む href を抽出（人物へのリンク）
people_links = list(dict.fromkeys(re.findall(r'href="(/people/[^"]+)"', rank_html)))
print(f"\n  /people/ リンク数: {len(people_links)}")
for link in people_links[:20]:
    print(f"    {link}")

# 最初の /people/ リンクの前後 600 文字を表示
first_link_m = re.search(r'href="/people/[^"]+"', rank_html)
if first_link_m:
    start = max(0, first_link_m.start() - 300)
    end = min(len(rank_html), first_link_m.end() + 300)
    print("\n  最初の人物リンク前後 600 文字:")
    print(rank_html[start:end])

# class 属性に "card" "item" "rank" "person" を含む要素
print("\n  ランキングらしき class を持つ要素:")
class_matches = re.findall(r'class="([^"]*(?:card|item|rank|person|material)[^"]*)"', rank_html, re.IGNORECASE)
for c in list(dict.fromkeys(class_matches))[:15]:
    print(f"    class=\"{c}\"")

# HTML の先頭 3000 文字（構造把握）
section("STEP 5: /ranking/like/ の先頭 3000 文字")
print(rank_html[:3000])

print("\n解析完了。")
