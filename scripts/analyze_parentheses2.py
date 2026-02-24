"""
括弧付き人物名: h2テキスト vs href の名前を詳細比較。
半角/全角括弧の違いやスペースの違いを特定する。

実行: python scripts/analyze_parentheses2.py
出力: scripts/out/analyze_parentheses2.txt にも保存
"""

import urllib.request
import urllib.parse
import re
import sys
import os

# ---- 出力設定 ----
_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_parentheses2.txt"), "w", encoding="utf-8")

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

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as res:
        return res.read().decode("utf-8", errors="replace")

def char_dump(s, label):
    """各文字のUnicodeコードポイントを表示"""
    print(f"  {label}: '{s}'")
    for i, c in enumerate(s):
        print(f"    [{i}] U+{ord(c):04X} '{c}' ({repr(c)})")

print("ランキングHTMLから括弧付き人物を抽出して比較\n")

# 好感度ランキング全3ページ + 不人気1ページ
for rtype, pages in [("like", [1, 2, 3]), ("dislike", [1])]:
    for page in pages:
        url = f"{BASE}/ranking/{rtype}?page={page}"
        print(f"\n{'='*60}")
        print(f"  {rtype} page={page}")
        print(f"{'='*60}")
        html = fetch(url)

        # 各セクション（4位以降）を解析
        section_re = re.compile(r'<section[^>]*class="[^"]*box-rank-review[^"]*">([\s\S]*?)</section>')
        for block in section_re.findall(html):
            h2_match = re.search(r'<h2[^>]*class="title"[^>]*>([^<]+)</h2>', block)
            href_match = re.search(r'href="(/people/vote/[^"]+)"', block)

            if not h2_match or not href_match:
                continue

            h2_name = h2_match.group(1).strip()
            href_raw = href_match.group(1)
            href_decoded = urllib.parse.unquote(href_raw)
            name_from_href = href_decoded.replace('/people/vote/', '')

            # 括弧を含むもののみ表示
            if '(' not in h2_name and '（' not in h2_name:
                continue

            print(f"\n  --- 括弧付き人物 ---")
            print(f"  h2 テキスト: '{h2_name}'")
            print(f"  href (raw):  '{href_raw}'")
            print(f"  href (dec):  '{name_from_href}'")
            print(f"  一致: {h2_name == name_from_href}")

            if h2_name != name_from_href:
                print(f"\n  *** 不一致を検出! ***")
                # 括弧部分を詳しく比較
                for c_h2, c_href in zip(h2_name, name_from_href):
                    if c_h2 != c_href:
                        print(f"    差異: h2=U+{ord(c_h2):04X}('{c_h2}') vs href=U+{ord(c_href):04X}('{c_href}')")

            # 括弧の文字コードを確認
            for i, c in enumerate(h2_name):
                if c in '()（）':
                    print(f"    h2[{i}] = U+{ord(c):04X} '{c}'")
            for i, c in enumerate(name_from_href):
                if c in '()（）':
                    print(f"    href[{i}] = U+{ord(c):04X} '{c}'")

        # トップ3（box-rank-top）もチェック
        top_re = re.compile(r'<li[^>]*class="top[^"]*"[^>]*>([\s\S]*?)</li>')
        for block in top_re.findall(html):
            h2_match = re.search(r'<h2[^>]*>([^<]+)</h2>', block)
            href_match = re.search(r'href="(/people/vote/[^"]+)"', block)
            if not h2_match or not href_match:
                continue
            h2_name = h2_match.group(1).strip()
            if '(' not in h2_name and '（' not in h2_name:
                continue
            href_decoded = urllib.parse.unquote(href_match.group(1))
            name_from_href = href_decoded.replace('/people/vote/', '')
            print(f"\n  --- トップ3 括弧付き ---")
            print(f"  h2: '{h2_name}' / href: '{name_from_href}' / 一致: {h2_name == name_from_href}")

print("\n\n完了")
_out_file.close()
