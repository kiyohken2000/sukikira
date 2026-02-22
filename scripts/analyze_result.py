"""
suki-kira.com /people/result/ ページの詳細解析
- 好き嫌い割合・票数の位置
- コメントの構造
実行: python scripts/analyze_result.py
出力: scripts/out/analyze_result.txt にも保存される
"""

import urllib.request
import sys, os

_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_result.txt"), "w", encoding="utf-8")

class _Tee:
    def write(self, *args, **kwargs):
        sys.__stdout__.write(*args, **kwargs)
        _out_file.write(*args, **kwargs)
    def flush(self):
        sys.__stdout__.flush()
        _out_file.flush()

sys.stdout = _Tee()
import re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

NAME = "木村拓哉"
ENCODED = "%E6%9C%A8%E6%9D%91%E6%8B%93%E5%93%89"

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as res:
        return res.read().decode("utf-8", errors="replace")

def section(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

html = fetch(f"https://suki-kira.com/people/result/{ENCODED}")

section("1. % を含む行（前後50文字付き）")
for m in re.finditer(r'[\d.]+%', html):
    start = max(0, m.start() - 60)
    end = min(len(html), m.end() + 60)
    ctx = html[start:end].replace('\n', ' ').strip()
    print(f"  ...{ctx}...")

section("2. 「好き」「嫌い」を含む行")
for line in html.splitlines():
    if ('好き' in line or '嫌い' in line) and len(line.strip()) > 0:
        clean = re.sub(r'<[^>]+>', '', line).strip()
        if clean:
            print(f"  {clean[:120]}")

section("3. 数字が多い行（票数・割合の候補）")
for line in html.splitlines():
    nums = re.findall(r'\d+', line)
    if len(nums) >= 3:
        clean = re.sub(r'<[^>]+>', '', line).strip()
        if clean:
            print(f"  {clean[:120]}")

section("4. class に 'comment' / 'review' / 'body' / 'vote' を含む要素")
for m in re.finditer(r'<[^>]+class="[^"]*(?:comment|review|body|vote|result|percent|ratio)[^"]*"[^>]*>', html, re.I):
    print(f"  {m.group()[:120]}")

section("5. progress / meter / bar 要素（割合バーの候補）")
for m in re.finditer(r'<(?:progress|meter)[^>]*>|style="[^"]*width\s*:[^"]*%[^"]*"', html):
    start = max(0, m.start() - 100)
    end = min(len(html), m.end() + 100)
    print(f"  ...{html[start:end].replace(chr(10), ' ')}...")

section("6. script タグの中で割合・コメント関連の変数を探す")
scripts = re.findall(r'<script[^>]*>([\s\S]*?)</script>', html)
for i, sc in enumerate(scripts):
    if any(kw in sc for kw in ['good', 'bad', 'like', 'hate', 'percent', 'comment', 'vote', 'result']):
        print(f"\n  --- script[{i}] (先頭800文字) ---")
        print(sc[:800])

section("7. JSON らしき塊（APIレスポンスの埋め込みを探す）")
jsons = re.findall(r'\{[^{}]{30,}(?:good|bad|like|hate|percent|comment|vote)[^{}]{0,200}\}', html, re.I)
for j in jsons[:5]:
    print(f"  {j[:200]}")

section("8. og:タグ（画像URL確認）")
for m in re.finditer(r'<meta[^>]*(?:og:|twitter:)[^>]*>', html):
    print(f"  {m.group()}")

section(f"9. result ページの最初の2000文字（構造把握）")
print(html[:2000])

section(f"10. 「コメント」を含む前後の HTML（300文字）")
for m in re.finditer(r'コメント', html):
    start = max(0, m.start() - 100)
    end = min(len(html), m.end() + 200)
    ctx = html[start:end]
    print(f"\n  [{m.start()}]:\n{ctx}\n  ---")
    if len(list(re.finditer(r'コメント', html[:m.end()]))) >= 5:
        break
