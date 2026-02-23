"""
24時間以内の再投票（上書き投票）の動作を調査する。

調査内容:
  STEP 1: 人物A に「好き」で投票（Cookie取得）
  STEP 2: Cookie保持のまま vote ページへアクセス
          → トークンが取れるか？それとも result へリダイレクトされるか？
  STEP 3: トークンが取れた場合、「嫌い」で上書き投票
          → 受け付けるか？Cookieはどう更新されるか？
  STEP 4: Cookie保持のまま再度 vote ページへアクセス（STEP3後）
          → 何度でもトークンを取り直せるか確認

実行: python scripts/analyze_revote.py
出力: scripts/out/analyze_revote.txt にも保存
"""

import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar
import re
import sys
import os
import datetime

# ---- 出力設定 ----
_out_dir = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(_out_dir, exist_ok=True)
_out_file = open(os.path.join(_out_dir, "analyze_revote.txt"), "w", encoding="utf-8")

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
NAME = "指原莉乃"   # 直前の analyze_vote_cookie.py で投票済みの人物
                    # → IPトラッキングが残っている状態からスタート

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
    with opener.open(req, timeout=15) as res:
        final_url = res.geturl()
        set_cookies = res.info().get_all("Set-Cookie") or []
        html = res.read().decode("utf-8", errors="replace")
        return html, final_url, set_cookies

def fetch_post(opener, url, data, referer):
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={
        **HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE,
        "Referer": referer,
    })
    with opener.open(req, timeout=15) as res:
        final_url = res.geturl()
        set_cookies = res.info().get_all("Set-Cookie") or []
        html = res.read().decode("utf-8", errors="replace")
        return html, final_url, set_cookies

def parse_input(html, name):
    m = re.search(rf'name="{re.escape(name)}"[^>]*value="([^"]*)"', html)
    if m: return m.group(1)
    m = re.search(rf'value="([^"]*)"[^>]*name="{re.escape(name)}"', html)
    if m: return m.group(1)
    return None

def print_cookies(jar, label):
    cookies = list(jar)
    print(f"\n  [{label}] Cookie数: {len(cookies)}")
    for c in cookies:
        exp = _fmt_expires(c.expires)
        print(f"    {c.name}={c.value[:20]}...  path={c.path}  expires={exp}")

def _fmt_expires(ts):
    if ts is None: return "session"
    try:
        dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
        now = datetime.datetime.now(datetime.timezone.utc)
        hours = (dt - now).total_seconds() / 3600
        return f"{dt.strftime('%H:%M:%S')} UTC ({hours:.1f}h後)"
    except Exception:
        return str(ts)

def extract_like_percent(html):
    m = re.search(r"好き派:\s*(?:<[^>]+>)*([\d.]+)", html)
    return m.group(1) if m else None

def print_set_cookies(sc_list):
    if not sc_list:
        print("  Set-Cookie: なし")
        return
    for sc in sc_list:
        print(f"  Set-Cookie: {sc}")

enc = urllib.parse.quote(NAME)
vote_url = f"{BASE}/people/vote/{enc}"
result_url = f"{BASE}/people/result/{enc}"

# ================================================================
# STEP 1: 1回目の投票（好き）
# ================================================================
section(f"STEP 1: {NAME} に「好き」で投票（1回目）")

opener, jar = make_opener()

print(f"\n[1-1] GET {vote_url}")
try:
    vote_html, final, sc = fetch_get(opener, vote_url)
    print(f"  最終URL: {final}")
    print(f"  → vote ページ: {'/people/vote/' in final}")
    print(f"  → result ページ: {'好き派:' in vote_html}")
    print_set_cookies(sc)

    pid    = parse_input(vote_html, "id")
    auth1  = parse_input(vote_html, "auth1")
    auth2  = parse_input(vote_html, "auth2")
    auth_r = parse_input(vote_html, "auth-r")
    tokens_ok = all([pid, auth1, auth2, auth_r])
    print(f"\n  トークン取得: {'OK' if tokens_ok else 'NG'} (id={pid})")

    if not tokens_ok:
        print("  !! STEP1でトークン取得失敗。IPトラッキングでresultへ行った可能性あり。")
        print(f"  最終URL: {final}")
        # result ページの場合のパーセント確認
        pct = extract_like_percent(vote_html)
        print(f"  好き派%: {pct}")
    else:
        print(f"\n[1-2] POST 投票（好き, vote=1）")
        post_data = {"vote": "1", "ok": "ng", "id": pid, "auth1": auth1, "auth2": auth2, "auth-r": auth_r}
        r_html, r_final, r_sc = fetch_post(opener, result_url, post_data, referer=vote_url)
        print(f"  最終URL: {r_final}")
        print(f"  結果ページ判定: {'好き派:' in r_html}")
        pct = extract_like_percent(r_html)
        print(f"  好き派%: {pct}")
        print_set_cookies(r_sc)
        print_cookies(jar, "1回目投票後")

except Exception as e:
    import traceback
    print(f"  ERROR: {e}")
    traceback.print_exc()
    sys.exit(1)

# ================================================================
# STEP 2: Cookie保持のまま vote ページへアクセス（再投票試行）
# ================================================================
section(f"STEP 2: Cookie保持のまま vote ページへアクセス（再投票できるか？）")
print("  → result にリダイレクトされる場合はトークンが取れず再投票不可")
print("  → vote ページが表示される場合はトークンを取って再投票可能\n")

try:
    v2_html, v2_final, v2_sc = fetch_get(opener, vote_url)
    print(f"  最終URL: {v2_final}")
    is_vote = "/people/vote/" in v2_final and "好き派:" not in v2_html
    is_result = "好き派:" in v2_html
    print(f"  → vote ページ表示: {is_vote}")
    print(f"  → result ページ表示（リダイレクト）: {is_result}")
    print_set_cookies(v2_sc)

    pid2    = parse_input(v2_html, "id")
    auth1_2 = parse_input(v2_html, "auth1")
    auth2_2 = parse_input(v2_html, "auth2")
    auth_r2 = parse_input(v2_html, "auth-r")
    tokens2_ok = all([pid2, auth1_2, auth2_2, auth_r2])
    print(f"\n  再投票用トークン取得: {'OK' if tokens2_ok else 'NG'}")

    if is_result:
        print("\n  ★ 判定: 投票済みCookieがあると vote → result にリダイレクト")
        print("           → 24時間以内は同じ人物への再投票トークンを取れない")
    elif tokens2_ok:
        print("\n  ★ 判定: vote ページが表示された → 再投票のトークンが取れる")
    else:
        print("\n  ★ 判定: vote ページが表示されたがトークンが取れない（フォーム構造が変化？）")
        print(f"  vote ページ先頭1000文字:")
        print(v2_html[:1000])

except Exception as e:
    import traceback
    print(f"  ERROR: {e}")
    traceback.print_exc()
    tokens2_ok = False

# ================================================================
# STEP 3: トークンが取れた場合に「嫌い」で上書き投票
# ================================================================
section(f"STEP 3: 「嫌い」で上書き投票（vote=0）")

if not tokens2_ok:
    print("  STEP 2 でトークンが取れなかったためスキップ。")
    print("  → 24時間以内は再投票不可（サーバーが vote → result にリダイレクト）")
else:
    try:
        print(f"  POST 投票（嫌い, vote=0）")
        post_data2 = {"vote": "0", "ok": "ng", "id": pid2, "auth1": auth1_2, "auth2": auth2_2, "auth-r": auth_r2}
        r2_html, r2_final, r2_sc = fetch_post(opener, result_url, post_data2, referer=vote_url)
        print(f"  最終URL: {r2_final}")
        print(f"  結果ページ判定: {'好き派:' in r2_html}")
        pct2 = extract_like_percent(r2_html)
        print(f"  好き派%: {pct2}")
        print_set_cookies(r2_sc)
        print_cookies(jar, "2回目投票後")

        # 好き派%が変化しているか
        print(f"\n  1回目後 好き派%: {pct}")
        print(f"  2回目後 好き派%: {pct2}")
        if pct and pct2 and pct != pct2:
            print("  ★ 判定: %が変化した → 上書き投票が反映された")
        elif pct == pct2:
            print("  ★ 判定: %が変化しない → 上書き投票は無視された（または誤差範囲）")
        else:
            print("  ★ 判定: 比較不可")

    except Exception as e:
        import traceback
        print(f"  ERROR: {e}")
        traceback.print_exc()

# ================================================================
# STEP 4: 全体まとめ
# ================================================================
section("STEP 4: まとめ")
print_cookies(jar, "最終的なCookie jar")

print("""
【調査結果まとめ】
- STEP2 で「result にリダイレクト」→ 24h以内は再投票のトークンを取れない
- STEP2 で「vote ページが表示」 → 再投票可能（STEP3の結果を参照）
""")

_out_file.close()
print("解析完了。詳細: scripts/out/analyze_revote.txt")
