"""
投票フォームのtoken属性順を確認するスクリプト（投票はしない）
出力: scripts/out/analyze_vote_form.txt
"""
import urllib.request, urllib.parse, re, http.cookiejar, os

out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "analyze_vote_form.txt")

# 投票しにくい辺境の人物（アクセス少ないのでIPトラッキングされていない可能性）
NAMES = ["田中一郎", "山田花子", "テスト太郎", "大谷翔平"]

BASE    = "https://suki-kira.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9",
}

def get(url):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(url, headers=HEADERS)
    with opener.open(req, timeout=15) as r:
        final = r.geturl()
        html = r.read().decode("utf-8", errors="replace")
        return final, html

with open(out_path, "w", encoding="utf-8") as f:
    def p(s=""):
        f.write(str(s) + "\n")

    for name in NAMES:
        encoded = urllib.parse.quote(name)
        url = f"{BASE}/people/vote/{encoded}"
        p(f"=== {name} ===")
        try:
            final_url, html = get(url)
            p(f"最終URL: {final_url}")
            is_vote_page = "ratingValue" not in html and ("auth1" in html or "auth-r" in html)
            is_result_page = "好き派" in html and "嫌い派" in html and "%" in html
            p(f"ページ種別: {'vote' if is_vote_page else 'result' if is_result_page else 'unknown'}")

            # input タグを全部表示
            inputs = re.findall(r'<input[^>]+>', html)
            p(f"input タグ数: {len(inputs)}")
            for inp in inputs:
                if any(k in inp for k in ['auth', 'id', 'vote', 'ok']):
                    p(f"  {inp[:200]}")

            # hidden fields
            p("hidden fields:")
            for m in re.finditer(r'<input[^>]*type=["\']?hidden["\']?[^>]*>', html, re.I):
                p(f"  {m.group(0)[:200]}")

        except Exception as e:
            p(f"ERROR: {e}")
        p()

    # 既知の人物でvote pageが取得できるか確認（フレッシュcookiejar）
    p("=== 木村拓哉 (fresh jar) ===")
    try:
        final_url, html = get(f"{BASE}/people/vote/{urllib.parse.quote('木村拓哉')}")
        p(f"最終URL: {final_url}")
        is_redirected = "result" in final_url
        p(f"リダイレクト: {is_redirected}")
        if is_redirected:
            p("→ 投票ページに戻れない（IPトラッキング）")
        else:
            p("→ 投票ページ取得成功")
            for m in re.finditer(r'<input[^>]*(?:auth|id)[^>]*>', html, re.I):
                p(f"  {m.group(0)[:200]}")
    except Exception as e:
        p(f"ERROR: {e}")

print(f"Done. See {out_path}")
