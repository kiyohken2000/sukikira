"""
括弧付き人物名: ランキングHTMLの生データを確認する。

実行: python scripts/analyze_parentheses3.py
出力: scripts/out/analyze_parentheses3.txt にも保存
"""

import urllib.request
import urllib.parse
import re
import sys
import os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_parentheses3.txt"), "w", encoding="utf-8")

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

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as res:
        return res.read().decode("utf-8", errors="replace")

print("=" * 60)
print("  ランキングHTMLから全 h2.title を抽出")
print("=" * 60)

html = fetch(f"{BASE}/ranking/like")

# 全 h2 テキストを抽出
h2s = re.findall(r'<h2[^>]*class="title"[^>]*>([^<]+)</h2>', html)
print(f"\nh2.title 数: {len(h2s)}")
for i, name in enumerate(h2s):
    name = name.strip()
    has_half = '(' in name or ')' in name
    has_full = '（' in name or '）' in name
    marker = ""
    if has_half: marker = " ← 半角括弧"
    if has_full: marker = " ← 全角括弧"
    print(f"  [{i+1:2d}] {name}{marker}")

# 全 href を抽出
print(f"\n{'='*60}")
print("  全 href=/people/vote/ を抽出")
print(f"{'='*60}")
hrefs = re.findall(r'href="(/people/vote/[^"]+)"', html)
print(f"\nhref 数: {len(hrefs)}")
for i, href in enumerate(hrefs):
    decoded = urllib.parse.unquote(href).replace('/people/vote/', '')
    has_half = '(' in decoded or ')' in decoded
    has_full = '（' in decoded or '）' in decoded
    marker = ""
    if has_half: marker = " ← 半角括弧"
    if has_full: marker = " ← 全角括弧"
    print(f"  [{i+1:2d}] {decoded}{marker}")

# 特定の名前を検索
print(f"\n{'='*60}")
print("  特定人物の検索")
print(f"{'='*60}")
for search in ["HIKAKIN", "田中瞳", "ヒカキン", "アナウンサー"]:
    idx = html.find(search)
    if idx >= 0:
        context = html[max(0,idx-80):idx+80]
        print(f"\n  '{search}' found at {idx}:")
        print(f"    ...{context}...")
        # 括弧の文字コードを確認
        for j in range(max(0,idx-5), min(len(html), idx+len(search)+5)):
            c = html[j]
            if c in '()（） \u3000':
                print(f"    [{j}] U+{ord(c):04X} '{c}'")
    else:
        print(f"\n  '{search}' not found in HTML")

print("\n\n完了")
_out_file.close()
