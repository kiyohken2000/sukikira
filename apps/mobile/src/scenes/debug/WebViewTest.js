import React, { useState, useRef, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

// iOS Safari の正確な UA（WKWebView デフォルトとの違い: "Version/X.X Safari/605.1.15" が付く）
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15'

const NAME = '木村拓哉'
const BASE = 'https://suki-kira.com'
const RESULT_URL = `${BASE}/people/result/${encodeURIComponent(NAME)}`

/**
 * WebView に注入する JS
 * 1) vote ページなら → フォームを自動送信（好き派で投票）
 * 2) result ページなら → DOM からコメントデータを抽出して postMessage
 */
const INJECT_JS = `
(function() {
  try {
    var html = document.body.innerHTML;
    var title = document.title || '';

    // Cloudflare チャレンジページ検出（本文が極端に短い + チャレンジ系タイトル）
    if (html.length < 5000 && (title.indexOf('Just a moment') !== -1 || title === '')) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        phase: 'cf_challenge',
        url: location.href,
        title: title,
        htmlLength: html.length
      }));
      return;
    }

    var isResult = html.indexOf('好き派:') !== -1;
    var isVote = !isResult && html.indexOf('name="auth1"') !== -1;

    if (isVote) {
      // --- vote ページ: 自動投票 ---
      window.ReactNativeWebView.postMessage(JSON.stringify({ phase: 'vote', url: location.href }));
      var form = document.querySelector('form[action*="/people/result/"]');
      if (form) {
        var voteInput = form.querySelector('input[name="vote"]');
        if (voteInput) voteInput.value = '1';
        var okInput = form.querySelector('input[name="ok"]');
        if (okInput) okInput.value = 'ng';
        form.submit();
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({ phase: 'vote', error: 'form not found' }));
      }
      return;
    }

    if (!isResult) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        phase: 'unknown', url: location.href, htmlLength: html.length,
        snippet: html.substring(0, 500)
      }));
      return;
    }

    // --- result ページ: データ抽出 ---
    var result = { phase: 'result', comments: [], nextCursor: null, url: location.href, error: null };
    result.htmlLength = html.length;

    // JS 変数を window スコープから直接取得
    result.pid = (typeof pid !== 'undefined') ? String(pid) : null;
    result.skToken = (typeof sk_token !== 'undefined') ? String(sk_token) : null;
    result.xdate = (typeof xdate !== 'undefined') ? String(xdate) : null;
    result.pidHash = (typeof pid_hash !== 'undefined') ? String(pid_hash) : null;

    // fallback: HTML 全体から正規表現で抽出
    if (!result.pid) {
      var pidM = html.match(/var\\s+pid\\s*=\\s*["']([^"']+)["']/);
      var skM  = html.match(/var\\s+sk_token\\s*=\\s*["']([^"']+)["']/);
      var xdM  = html.match(/var\\s+xdate\\s*=\\s*["']([^"']+)["']/);
      var phM  = html.match(/var\\s+pid_hash\\s*=\\s*["']([^"']+)["']/);
      result.pid = pidM ? pidM[1] : null;
      result.skToken = skM ? skM[1] : null;
      result.xdate = xdM ? xdM[1] : null;
      result.pidHash = phM ? phM[1] : null;
    }
    // fallback 2: pid を URL パスから取得
    if (!result.pid) {
      var urlPid = html.match(/\\/people\\/result\\/(\\d+)/);
      result.pid = urlPid ? urlPid[1] : null;
    }

    var containers = document.querySelectorAll('div[class*="comment-container"]');
    result.commentCount = containers.length;

    containers.forEach(function(el) {
      var classMatch = el.className.match(/comment-container c(\\d+)/);
      if (!classMatch) return;
      var id = classMatch[1];
      var bodyEl = el.querySelector('[itemprop="reviewBody"]');
      var body = bodyEl ? bodyEl.textContent.trim() : '';
      var ratingEl = el.querySelector('[itemprop="ratingValue"]');
      var ratingVal = ratingEl ? ratingEl.getAttribute('content') : null;
      var type = ratingVal === '100' ? 'like' : ratingVal === '0' ? 'dislike' : 'unknown';
      var authorEl = el.querySelector('[itemprop="author"]');
      var author = authorEl ? authorEl.textContent.trim() : '匿名';
      var dateEl = el.querySelector('[itemprop="datePublished"]');
      var dateText = dateEl ? dateEl.textContent.trim() : '';

      var upEl = el.querySelector('[itemprop="upvoteCount"]');
      var downEl = el.querySelector('[itemprop="downvoteCount"]');
      var upvoteCount = upEl ? parseInt(upEl.getAttribute('content') || '0', 10) : 0;
      var downvoteCount = downEl ? parseInt(downEl.getAttribute('content') || '0', 10) : 0;
      var tokenEl = el.querySelector('[data-token]');
      var token = tokenEl ? tokenEl.getAttribute('data-token') : '';

      // fallback: commentVote ボタン id から取得
      if ((!upvoteCount && !downvoteCount) || !token) {
        var voteBtn = el.querySelector('[id^="commentVote-like-"]');
        if (voteBtn) {
          var parts = voteBtn.id.split('-');
          if (parts.length >= 6) {
            upvoteCount = upvoteCount || parseInt(parts[3], 10) || 0;
            downvoteCount = downvoteCount || parseInt(parts[4], 10) || 0;
            token = token || parts[5];
          }
        }
      }

      result.comments.push({ id: id, body: body.substring(0, 100), type: type, upvoteCount: upvoteCount, downvoteCount: downvoteCount, token: token, author: author, dateText: dateText });
    });

    // nextCursor: 複数パターンで探索
    var nextLink = document.querySelector('a[rel="next"]');
    if (nextLink) {
      var href = nextLink.getAttribute('href');
      var nxcMatch = href && href.match(/[?&]nxc=(\\d+)/);
      result.nextCursor = nxcMatch ? nxcMatch[1] : null;
    }
    // fallback: ページネーション内の「次へ」リンク
    if (!result.nextCursor) {
      var allLinks = document.querySelectorAll('a[href*="nxc="]');
      if (allLinks.length > 0) {
        var lastNxc = allLinks[allLinks.length - 1].getAttribute('href');
        var m = lastNxc && lastNxc.match(/[?&]nxc=(\\d+)/);
        result.nextCursor = m ? m[1] : null;
      }
    }
    // fallback: HTML 内の nxc パターンを検索
    if (!result.nextCursor) {
      var nxcAll = html.match(/nxc=(\\d+)/g);
      if (nxcAll && nxcAll.length > 0) {
        var lastM = nxcAll[nxcAll.length - 1].match(/nxc=(\\d+)/);
        result.nextCursor = lastM ? lastM[1] : null;
      }
    }
    // debug: ページネーション周辺の HTML
    var pagEl = document.querySelector('.pagination, [class*="paginat"], nav');
    result.debugPagination = pagEl ? pagEl.outerHTML.substring(0, 500) : 'not found';
    result.debugNxcCount = (html.match(/nxc/g) || []).length;

    window.ReactNativeWebView.postMessage(JSON.stringify(result));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ phase: 'error', error: e.message, stack: e.stack }));
  }
})();
true;
`

export default function WebViewTest() {
  const webviewRef = useRef(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')
  const [webviewKey, setWebviewKey] = useState(0) // key を変えて WebView を強制再マウント
  const [lastResult, setLastResult] = useState(null)
  const [showWebView, setShowWebView] = useState(false) // 可視 WebView モード
  const [browseMode, setBrowseMode] = useState(false) // 手動ブラウジングモード

  const log = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString('ja-JP')
    const line = `[${ts}] ${msg}`
    console.log('[WVTest]', msg)
    setLogs(prev => [line, ...prev].slice(0, 100))
  }, [])

  // 初回: WebView を新規マウント / 2回目以降: 同じ WebView 内で JS ナビゲーション
  const navigate = (url, forceNew = false) => {
    log(`Loading: ${url}`)
    setLoading(true)
    if (!currentUrl || forceNew) {
      // 初回 or 強制: WebView をマウント
      setCurrentUrl(url)
      setWebviewKey(k => k + 1)
    } else {
      // 同じ WebView 内でナビゲーション（cookie 保持）
      webviewRef.current?.injectJavaScript(`window.location.href = "${url}"; true;`)
    }
  }

  const loadResultPage = () => navigate(RESULT_URL, true)

  // ブラウズモード: JS注入なし、フルサイズ WebView で手動操作
  const startBrowse = () => {
    setBrowseMode(true)
    setShowWebView(true)
    log('=== ブラウズモード開始 ===')
    log('手動で「次へ」リンクをタップしてください')
    setCurrentUrl(RESULT_URL)
    setWebviewKey(k => k + 1)
  }

  // ブラウズモード用: プログラム的にページネーションリンクをクリック/遷移テスト
  const browseAutoNav = () => {
    if (!browseMode) { log('ERROR: ブラウズモードで使用してください'); return }
    log('=== プログラム的ナビゲーションテスト ===')
    const js = `
    (function() {
      try {
        // ページネーションリンクを探す
        var allNxcLinks = document.querySelectorAll('a[href*="nxc="]');
        var relNextLinks = document.querySelectorAll('a[rel="next"]');
        var pageLinks = document.querySelectorAll('.page-link[href*="nxc="]');

        var info = {
          nxcLinkCount: allNxcLinks.length,
          relNextCount: relNextLinks.length,
          pageLinkCount: pageLinks.length,
          links: []
        };

        allNxcLinks.forEach(function(el) {
          info.links.push({
            href: el.getAttribute('href'),
            text: el.textContent.trim().substring(0, 30),
            rel: el.getAttribute('rel'),
            className: el.className
          });
        });

        // テスト対象のリンクを決定
        var target = allNxcLinks.length > 0 ? allNxcLinks[0] : relNextLinks.length > 0 ? relNextLinks[0] : null;

        if (!target) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            phase: 'auto_nav',
            step: 'no_link',
            info: info
          }));
          return;
        }

        var targetHref = target.getAttribute('href');
        info.targetHref = targetHref;

        // テスト1: .click()
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'auto_nav',
          step: 'clicking',
          method: 'click()',
          info: info
        }));
        target.click();
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'auto_nav', step: 'error', error: e.message
        }));
      }
    })();
    true;`
    webviewRef.current?.injectJavaScript(js)
  }

  // ブラウズモード用: window.location.href で遷移テスト
  const browseLocationNav = () => {
    if (!browseMode) { log('ERROR: ブラウズモードで使用してください'); return }
    log('=== location.href ナビゲーションテスト ===')
    const js = `
    (function() {
      try {
        var allNxcLinks = document.querySelectorAll('a[href*="nxc="]');
        if (allNxcLinks.length === 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            phase: 'auto_nav', step: 'no_link', method: 'location.href'
          }));
          return;
        }
        var href = allNxcLinks[0].getAttribute('href');
        // 相対URLを絶対URLに変換
        var fullUrl = new URL(href, location.origin).href;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'auto_nav',
          step: 'navigating',
          method: 'location.href',
          url: fullUrl
        }));
        window.location.href = fullUrl;
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'auto_nav', step: 'error', error: e.message
        }));
      }
    })();
    true;`
    webviewRef.current?.injectJavaScript(js)
  }

  const loadNextPage = () => {
    if (!lastResult?.nextCursor) { log('ERROR: nextCursor がない'); return }
    navigate(`${RESULT_URL}/?nxc=${lastResult.nextCursor}`)
  }

  const loadCommentPage = () => navigate(`${RESULT_URL}/?cm`)

  // テスト4: WebView 内で fetch("/?nxc=...") を実行
  const fetchNextPage = () => {
    if (!lastResult?.nextCursor) { log('ERROR: nextCursor がない'); return }
    const nxc = lastResult.nextCursor
    log(`fetch テスト開始: ?nxc=${nxc}`)
    const js = `
    (function() {
      try {
        fetch("${RESULT_URL}/?nxc=${nxc}", { credentials: 'include' })
          .then(function(r) {
            var status = r.status;
            var redirected = r.redirected;
            var finalUrl = r.url;
            return r.text().then(function(html) {
              // コメント数をカウント
              var commentMatches = html.match(/comment-container c\\d+/g);
              var commentCount = commentMatches ? commentMatches.length : 0;
              // nxc= の出現数
              var nxcMatches = html.match(/nxc=\\d+/g);
              var nxcCount = nxcMatches ? nxcMatches.length : 0;
              // 好き派: の存在確認
              var isResult = html.indexOf('好き派:') !== -1;
              // コメントIDを抽出
              var ids = [];
              if (commentMatches) {
                commentMatches.forEach(function(m) {
                  var idM = m.match(/c(\\d+)/);
                  if (idM) ids.push(idM[1]);
                });
              }
              window.ReactNativeWebView.postMessage(JSON.stringify({
                phase: 'fetch_test',
                nxc: "${nxc}",
                status: status,
                redirected: redirected,
                finalUrl: finalUrl,
                htmlLength: html.length,
                isResult: isResult,
                commentCount: commentCount,
                nxcCount: nxcCount,
                idRange: ids.length > 0 ? ids[0] + '~' + ids[ids.length-1] : 'none',
                snippet: html.substring(0, 300)
              }));
            });
          })
          .catch(function(e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              phase: 'fetch_test', error: e.message
            }));
          });
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'fetch_test', error: e.message
        }));
      }
    })();
    true;`
    webviewRef.current?.injectJavaScript(js)
  }

  // テスト5: DOM の <a rel="next"> を .click() で遷移
  const clickNextLink = () => {
    if (!lastResult?.nextCursor) { log('ERROR: nextCursor がない'); return }
    log('DOM .click() テスト開始')
    const nxc = lastResult.nextCursor
    const js = `
    (function() {
      try {
        // まず全ての a[rel="next"] と nxc リンクを調査
        var allRelNext = document.querySelectorAll('a[rel="next"]');
        var allNxcLinks = document.querySelectorAll('a[href*="nxc="]');
        var debugInfo = {
          relNextCount: allRelNext.length,
          nxcLinkCount: allNxcLinks.length,
          relNextDetails: [],
          nxcLinkDetails: []
        };
        allRelNext.forEach(function(el) {
          debugInfo.relNextDetails.push({
            tag: el.tagName,
            href: el.getAttribute('href'),
            text: el.textContent.trim().substring(0, 50),
            outerHTML: el.outerHTML.substring(0, 200),
            parentTag: el.parentElement ? el.parentElement.tagName : null,
            parentClass: el.parentElement ? el.parentElement.className : null
          });
        });
        allNxcLinks.forEach(function(el) {
          debugInfo.nxcLinkDetails.push({
            href: el.getAttribute('href'),
            text: el.textContent.trim().substring(0, 50),
            rel: el.getAttribute('rel'),
            outerHTML: el.outerHTML.substring(0, 200)
          });
        });

        // クリック対象を決定
        var target = null;
        if (allNxcLinks.length > 0) {
          // nxc= を含むリンクを優先（実際の href があるもの）
          target = allNxcLinks[allNxcLinks.length - 1];
        } else if (allRelNext.length > 0 && allRelNext[0].getAttribute('href')) {
          target = allRelNext[0];
        }

        if (target) {
          debugInfo.clickTarget = {
            href: target.getAttribute('href'),
            text: target.textContent.trim(),
            outerHTML: target.outerHTML.substring(0, 200)
          };
          window.ReactNativeWebView.postMessage(JSON.stringify({
            phase: 'click_test_start',
            debug: debugInfo
          }));
          target.click();
        } else {
          // fallback: nxc URL を href にセットした新しいリンクを作って click
          debugInfo.fallbackCreate = true;
          var a = document.createElement('a');
          a.href = location.pathname + '?nxc=${nxc}';
          a.rel = 'next';
          document.body.appendChild(a);
          debugInfo.clickTarget = { href: a.href, synthetic: true };
          window.ReactNativeWebView.postMessage(JSON.stringify({
            phase: 'click_test_start',
            debug: debugInfo
          }));
          a.click();
        }
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'click_test_start', error: e.message
        }));
      }
    })();
    true;`
    webviewRef.current?.injectJavaScript(js)
  }

  // テスト9: URL エンコードで WAF バイパス試行
  const fetchNxcBypass = () => {
    if (!lastResult?.nextCursor) { log('ERROR: nextCursor がない'); return }
    const nxc = lastResult.nextCursor
    log(`WAF バイパステスト開始: nxc=${nxc}`)
    const js = `
    (function() {
      try {
        var nxc = "${nxc}";
        var base = location.pathname;
        var variants = [
          { label: 'normal',        url: base + '?nxc=' + nxc },
          { label: '%6exc (n encoded)', url: base + '?%6exc=' + nxc },
          { label: '%6E%78%63 (all encoded)', url: base + '?%6E%78%63=' + nxc },
          { label: 'NXC (uppercase)', url: base + '?NXC=' + nxc },
          { label: 'Nxc (mixed)',    url: base + '?Nxc=' + nxc },
          { label: 'nxc%20= (space)', url: base + '?nxc%20=' + nxc },
          { label: '/nxc/ (path)',   url: base + '/' + nxc + '/' },
          { label: '#nxc (fragment)', url: base + '?cm#nxc=' + nxc },
        ];
        var results = [];
        var done = 0;
        variants.forEach(function(v) {
          fetch(v.url, { credentials: 'include', redirect: 'follow' })
            .then(function(r) {
              return r.text().then(function(html) {
                var ids = [];
                var m;
                var re = /comment-container c(\\d+)/g;
                while ((m = re.exec(html)) !== null) ids.push(m[1]);
                results.push({
                  label: v.label,
                  url: v.url,
                  status: r.status,
                  redirected: r.redirected,
                  finalUrl: r.url,
                  isResult: html.indexOf('好き派:') !== -1,
                  commentCount: ids.length,
                  idRange: ids.length > 0 ? ids[0] + '~' + ids[ids.length-1] : 'none',
                  htmlLen: html.length,
                  isChallenge: html.indexOf('Just a moment') !== -1
                });
                done++;
                if (done === variants.length) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    phase: 'nxc_bypass',
                    nxc: nxc,
                    results: results
                  }));
                }
              });
            })
            .catch(function(e) {
              results.push({ label: v.label, url: v.url, error: e.message });
              done++;
              if (done === variants.length) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  phase: 'nxc_bypass',
                  nxc: nxc,
                  results: results
                }));
              }
            });
        });
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'nxc_bypass', error: e.message
        }));
      }
    })();
    true;`
    webviewRef.current?.injectJavaScript(js)
  }

  // テスト7: WebView 内から同一オリジン fetch で個別コメントAPI
  const fetchCommentApi = () => {
    if (!lastResult?.pid || !lastResult?.skToken || !lastResult?.comments?.length) {
      log('ERROR: result ページを先に読み込んでください')
      return
    }
    const { pid, skToken, comments, nextCursor } = lastResult
    // 1ページ目最後のコメントID - 1 = 2ページ目の最初
    const lastCid = comments[comments.length - 1]?.id
    const testCid = lastCid ? String(Number(lastCid) - 1) : '1'
    log(`個別API fetch: pid=${pid}, cid=${testCid}`)
    const js = `
    (function() {
      try {
        var testIds = [${testCid}, ${Number(testCid) - 1}, ${Number(testCid) - 5}];
        var results = [];
        var done = 0;
        testIds.forEach(function(cid) {
          fetch("/p/${pid}/c/" + cid + "/t/${skToken}", { credentials: 'include' })
            .then(function(r) {
              return r.text().then(function(text) {
                var parsed = null;
                try { parsed = JSON.parse(text); } catch(e) {}
                results.push({
                  cid: cid,
                  status: r.status,
                  redirected: r.redirected,
                  finalUrl: r.url,
                  isJson: parsed !== null,
                  isChallenge: text.indexOf('Just a moment') !== -1,
                  bodyLen: text.length,
                  data: parsed,
                  snippet: parsed ? undefined : text.substring(0, 200)
                });
                done++;
                if (done === testIds.length) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    phase: 'api_fetch_test',
                    results: results
                  }));
                }
              });
            })
            .catch(function(e) {
              results.push({ cid: cid, error: e.message });
              done++;
              if (done === testIds.length) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  phase: 'api_fetch_test',
                  results: results
                }));
              }
            });
        });
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'api_fetch_test', error: e.message
        }));
      }
    })();
    true;`
    webviewRef.current?.injectJavaScript(js)
  }

  // テスト8: WebView 内でバッチ取得（20件、getMoreComments 相当）
  const fetchBatchApi = () => {
    if (!lastResult?.pid || !lastResult?.skToken || !lastResult?.comments?.length) {
      log('ERROR: result ページを先に読み込んでください')
      return
    }
    const { pid, skToken, comments } = lastResult
    const lastCid = comments[comments.length - 1]?.id
    const startId = lastCid ? Number(lastCid) - 1 : 0
    if (startId < 1) { log('ERROR: startId < 1'); return }
    log(`バッチ fetch: pid=${pid}, from=${startId}, count=20`)
    const js = `
    (function() {
      try {
        var pid = "${pid}";
        var sk = "${skToken}";
        var startId = ${startId};
        var comments = [];
        var misses = 0;
        var id = startId;
        var lowestId = startId;

        function fetchNext() {
          if (id < 1 || comments.length >= 20 || misses >= 10) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              phase: 'batch_test',
              count: comments.length,
              misses: misses,
              lowestId: lowestId,
              idRange: comments.length > 0 ? comments[0].id + '~' + comments[comments.length-1].id : 'none',
              comments: comments.map(function(c) {
                return { id: c.id, type: c.type, bodyLen: c.body ? c.body.length : 0, body: (c.body || '').substring(0, 50) };
              })
            }));
            return;
          }
          fetch("/p/" + pid + "/c/" + id + "/t/" + sk, { credentials: 'include' })
            .then(function(r) { return r.text(); })
            .then(function(text) {
              if (!text || text.length < 10 || text.indexOf('Just a moment') !== -1) {
                misses++;
              } else {
                try {
                  var data = JSON.parse(text);
                  if (data && data.body) {
                    comments.push({
                      id: data.index || String(id),
                      body: data.body.replace(/<[^>]+>/g, '').substring(0, 100),
                      type: data.type === '1' ? 'like' : data.type === '0' ? 'dislike' : 'unknown',
                      author: data.name_hash || '匿名',
                      dateText: data.created_at || ''
                    });
                    lowestId = id;
                    misses = 0;
                  } else { misses++; }
                } catch(e) { misses++; }
              }
              id--;
              fetchNext();
            })
            .catch(function(e) {
              misses++;
              id--;
              fetchNext();
            });
        }
        fetchNext();
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'batch_test', error: e.message
        }));
      }
    })();
    true;`
    webviewRef.current?.injectJavaScript(js)
  }

  // 可視モード切替
  const toggleWebView = () => {
    setShowWebView(v => {
      const next = !v
      log(`WebView ${next ? '可視' : '非表示'} モード`)
      return next
    })
  }

  // CF チャレンジ誘発: 個別コメントAPI URL を可視 WebView で開く
  // ?nxc= は即リダイレクトされるが、/p/{pid}/c/{cid}/t/{token} は
  // Cloudflare managed challenge が表示される → 解決で cf_clearance 発行
  const loadCfChallenge = () => {
    if (!lastResult?.pid || !lastResult?.skToken) {
      log('CF Challenge: pid/skToken が必要。Result ページを読み込んでください')
      return
    }
    // 存在するコメントIDを使う（1ページ目の最後のコメント）
    const cid = lastResult.comments?.[lastResult.comments.length - 1]?.id || '1'
    const url = `${BASE}/p/${lastResult.pid}/c/${cid}/t/${lastResult.skToken}`
    log(`CF Challenge: 個別コメントAPIを可視 WebView で開く`)
    log(`URL: ${url}`)
    setShowWebView(true)
    navigate(url, true)
  }

  // テスト6: Cookie 確認（cf_clearance の有無）
  const checkCookies = () => {
    log('Cookie 確認中...')
    const js = `
    (function() {
      try {
        var cookies = document.cookie;
        var hasCfClearance = cookies.indexOf('cf_clearance') !== -1;
        var cookieList = cookies.split(';').map(function(c) { return c.trim(); });
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'cookie_check',
          hasCfClearance: hasCfClearance,
          cookieCount: cookieList.length,
          cookies: cookieList.filter(function(c) { return c.length > 0; }),
          raw: cookies.substring(0, 500)
        }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          phase: 'cookie_check', error: e.message
        }));
      }
    })();
    true;`
    webviewRef.current?.injectJavaScript(js)
  }

  const onMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      console.log('[WVTest] RAW:', JSON.stringify(data, null, 2))

      if (data.phase === 'auto_nav') {
        console.log('[WVTest] auto_nav:', JSON.stringify(data))
        if (data.step === 'no_link') {
          log(`リンクなし: nxc= リンクが見つからない (method=${data.method || 'click'})`)
        } else if (data.step === 'clicking') {
          log(`[${data.method}] nxc links: ${data.info?.nxcLinkCount}`)
          data.info?.links?.forEach(l => log(`  href=${l.href} text="${l.text}" class=${l.className}`))
          log(`クリック対象: ${data.info?.targetHref}`)
          log(`→ ナビゲーション待ち...`)
        } else if (data.step === 'navigating') {
          log(`[${data.method}] → ${data.url}`)
          log(`→ ナビゲーション待ち...`)
        } else if (data.step === 'error') {
          log(`ERROR: ${data.error}`)
        }
        return
      }

      if (data.phase === 'browse_info') {
        console.log('[WVTest] browse_info:', JSON.stringify(data))
        log(`=== ページ情報 ===`)
        log(`URL: ${data.url}`)
        log(`title: ${data.title}`)
        log(`nxc=あり: ${data.hasNxc}, ?cm: ${data.hasCm}`)
        log(`コメント数: ${data.commentCount}`)
        log(`ID範囲: ${data.idRange}`)
        log(`次へリンク: ${data.nextHref || 'なし'}`)
        if (data.hasNxc && data.commentCount > 0) {
          log(`★★★ ?nxc= ページネーション成功！ ★★★`)
        }
        if (data.hasCm && !data.hasNxc) {
          log(`→ ?cm にリダイレクトされた（WAF ブロック）`)
        }
        return
      }

      if (data.phase === 'vote') {
        log(`vote ページ検出 → 自動投票送信中...`)
        log(`URL: ${data.url}`)
        if (data.error) log(`ERROR: ${data.error}`)
        return
      }

      if (data.phase === 'unknown') {
        log(`不明ページ: ${data.url} (${data.htmlLength} chars)`)
        log(`snippet: ${data.snippet?.substring(0, 200)}`)
        return
      }

      if (data.phase === 'error') {
        log(`ERROR: ${data.error}`)
        return
      }

      if (data.phase === 'cf_challenge') {
        log(`=== CF チャレンジ検出 ===`)
        log(`URL: ${data.url}`)
        log(`title: ${data.title}`)
        log(`Turnstile 解決待ち... (自動で解決されるはず)`)
        return
      }

      if (data.phase === 'fetch_test') {
        log(`=== fetch テスト結果 ===`)
        if (data.error) { log(`ERROR: ${data.error}`); return }
        log(`nxc=${data.nxc}`)
        log(`status: ${data.status}, redirected: ${data.redirected}`)
        log(`finalUrl: ${data.finalUrl}`)
        log(`HTML: ${data.htmlLength} chars, isResult: ${data.isResult}`)
        log(`コメント数: ${data.commentCount}, nxc出現数: ${data.nxcCount}`)
        log(`ID範囲: ${data.idRange}`)
        if (data.htmlLength < 100) log(`snippet: ${data.snippet}`)
        return
      }

      if (data.phase === 'click_test_start') {
        log(`=== DOM .click() テスト ===`)
        if (data.error) { log(`ERROR: ${data.error}`); return }
        const d = data.debug || {}
        log(`a[rel="next"]: ${d.relNextCount}個, a[href*="nxc="]: ${d.nxcLinkCount}個`)
        if (d.relNextDetails?.length > 0) {
          d.relNextDetails.forEach((el, i) => {
            log(`  rel=next[${i}]: href=${el.href} text="${el.text}"`)
            log(`    HTML: ${el.outerHTML}`)
            log(`    parent: ${el.parentTag}.${el.parentClass}`)
          })
        }
        if (d.nxcLinkDetails?.length > 0) {
          d.nxcLinkDetails.forEach((el, i) => {
            log(`  nxc[${i}]: href=${el.href} rel=${el.rel} text="${el.text}"`)
            log(`    HTML: ${el.outerHTML}`)
          })
        }
        if (d.clickTarget) {
          log(`クリック対象: ${d.clickTarget.href}${d.clickTarget.synthetic ? ' (synthetic)' : ''}`)
        }
        if (d.fallbackCreate) log(`fallback: 合成リンク作成`)
        log(`クリック実行 → ナビゲーション待ち...`)
        return
      }

      if (data.phase === 'nxc_bypass') {
        log(`=== WAF バイパステスト (nxc=${data.nxc}) ===`)
        if (data.error) { log(`ERROR: ${data.error}`); return }
        // 1ページ目の ID 範囲（比較用）
        const p1Range = lastResult?.comments?.length
          ? `${lastResult.comments[0].id}~${lastResult.comments[lastResult.comments.length - 1].id}`
          : '?'
        log(`1ページ目 ID範囲: ${p1Range}`)
        data.results?.forEach(r => {
          if (r.error) {
            log(`  ${r.label}: ERROR ${r.error}`)
          } else {
            const isSamePage = r.idRange === p1Range
            const icon = r.isChallenge ? 'CF' : r.redirected ? 'REDIR' : isSamePage ? 'SAME' : 'NEW?'
            log(`  [${icon}] ${r.label}: ${r.commentCount}件 ${r.idRange} (${r.redirected ? 'redirected→' + r.finalUrl.split('/').pop() : 'no redirect'})`)
          }
        })
        return
      }

      if (data.phase === 'api_fetch_test') {
        log(`=== 個別API fetch テスト ===`)
        if (data.error) { log(`ERROR: ${data.error}`); return }
        data.results?.forEach(r => {
          if (r.error) {
            log(`  cid=${r.cid}: ERROR ${r.error}`)
          } else {
            log(`  cid=${r.cid}: status=${r.status} json=${r.isJson} challenge=${r.isChallenge} len=${r.bodyLen}`)
            if (r.data) log(`    body: "${(r.data.body || '').substring(0, 60)}"`)
            if (r.isChallenge) log(`    → Cloudflare チャレンジ`)
            if (r.snippet) log(`    snippet: ${r.snippet.substring(0, 100)}`)
          }
        })
        return
      }

      if (data.phase === 'batch_test') {
        log(`=== バッチ fetch テスト ===`)
        if (data.error) { log(`ERROR: ${data.error}`); return }
        log(`取得: ${data.count}件, misses: ${data.misses}, lowestId: ${data.lowestId}`)
        log(`ID範囲: ${data.idRange}`)
        data.comments?.slice(0, 5).forEach(c => {
          log(`  #${c.id} [${c.type}] "${c.body}"`)
        })
        if (data.count > 5) log(`  ... 他${data.count - 5}件`)
        if (data.count === 0) log(`→ 全て失敗（Cloudflare ブロック中の可能性）`)
        else log(`→ 成功！WebView 内 fetch で2ページ目取得可能`)
        return
      }

      if (data.phase === 'cookie_check') {
        log(`=== Cookie 確認 ===`)
        if (data.error) { log(`ERROR: ${data.error}`); return }
        log(`cf_clearance: ${data.hasCfClearance ? 'あり ✓' : 'なし ✗'}`)
        log(`Cookie数: ${data.cookieCount}`)
        data.cookies?.forEach(c => log(`  ${c}`))
        return
      }

      // result ページ
      setLastResult(data)
      log(`=== result ページ ===`)
      log(`URL: ${data.url}`)
      log(`HTML: ${data.htmlLength} chars`)
      log(`pid: ${data.pid}, skToken: ${data.skToken ? data.skToken.substring(0, 8) + '...' : 'null'}`)
      log(`xdate: ${data.xdate}, pidHash: ${data.pidHash}`)
      log(`コメント数: ${data.commentCount}`)
      log(`nextCursor (nxc): ${data.nextCursor}`)
      log(`nxc出現数: ${data.debugNxcCount}`)
      if (data.debugPagination) log(`pagination: ${data.debugPagination?.substring(0, 200)}`)

      if (data.comments?.length > 0) {
        const first = data.comments[0]
        const last = data.comments[data.comments.length - 1]
        log(`ID範囲: ${first.id} ~ ${last.id}`)

        const hasVotes = data.comments.some(c => c.upvoteCount > 0 || c.downvoteCount > 0)
        const hasTokens = data.comments.some(c => c.token)
        log(`upvote/downvote あり: ${hasVotes}`)
        log(`token あり: ${hasTokens}`)

        data.comments.slice(0, 3).forEach(c => {
          log(`  #${c.id} [${c.type}] up=${c.upvoteCount} dn=${c.downvoteCount} tk=${c.token ? 'Y' : 'N'} "${c.body.slice(0, 30)}..."`)
        })
      }
    } catch (e) {
      log(`Parse error: ${e.message}`)
    }
  }, [log])

  const onLoadEnd = useCallback(() => {
    setLoading(false)
    if (browseMode) {
      log('WebView loaded (ブラウズモード - JS注入スキップ)')
      // ブラウズモードでも現在のURLとページ情報だけ取得
      webviewRef.current?.injectJavaScript(`
        (function() {
          var url = location.href;
          var hasNxc = url.indexOf('nxc=') !== -1;
          var hasCm = url.indexOf('?cm') !== -1;
          var commentCount = document.querySelectorAll('div[class*="comment-container"]').length;
          var ids = [];
          document.querySelectorAll('div[class*="comment-container"]').forEach(function(el) {
            var m = el.className.match(/comment-container c(\\d+)/);
            if (m) ids.push(m[1]);
          });
          var nextLink = document.querySelector('a[rel="next"]');
          var nextHref = nextLink ? nextLink.getAttribute('href') : null;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            phase: 'browse_info',
            url: url,
            hasNxc: hasNxc,
            hasCm: hasCm,
            commentCount: commentCount,
            idRange: ids.length > 0 ? ids[0] + '~' + ids[ids.length-1] : 'none',
            nextHref: nextHref,
            title: document.title
          }));
        })();
        true;
      `)
      return
    }
    log('WebView loaded, injecting extract JS...')
    // ページ読み込み完了後に抽出JSを注入（ナビゲーション後にも必要）
    webviewRef.current?.injectJavaScript(INJECT_JS)
  }, [log, browseMode])

  const onNavigationStateChange = useCallback((state) => {
    const url = state.url || ''
    const hasNxc = url.includes('nxc=')
    const hasCm = url.includes('?cm')
    console.log(`[WVTest] Nav: url=${url} loading=${state.loading} canGoBack=${state.canGoBack} title=${state.title}`)
    if (hasNxc) console.log('[WVTest] ★ nxc= パラメータ検出! リダイレクトされていない')
    if (hasCm && browseMode) console.log('[WVTest] ✗ ?cm にリダイレクトされた')
    log(`Nav: ${url} (loading=${state.loading})`)
  }, [log, browseMode])

  const onError = useCallback((syntheticEvent) => {
    const { nativeEvent } = syntheticEvent
    log(`WebView error: ${nativeEvent.description}`)
    setLoading(false)
  }, [log])

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>WebView テスト</Text>
      <Text style={styles.subtitle}>{NAME} のコメント取得検証</Text>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.btn} onPress={loadResultPage}>
          <Text style={styles.btnText}>1. Result</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, !lastResult?.nextCursor && styles.btnDisabled]}
          onPress={loadNextPage}
          disabled={!lastResult?.nextCursor}
        >
          <Text style={styles.btnText}>2. ?nxc=</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={loadCommentPage}>
          <Text style={styles.btnText}>3. ?cm</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.btn, styles.btnNew, !lastResult?.nextCursor && styles.btnDisabled]}
          onPress={fetchNextPage}
          disabled={!lastResult?.nextCursor}
        >
          <Text style={styles.btnText}>4. fetch</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnNew, !lastResult?.nextCursor && styles.btnDisabled]}
          onPress={clickNextLink}
          disabled={!lastResult?.nextCursor}
        >
          <Text style={styles.btnText}>5. click</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnGreen, !currentUrl && styles.btnDisabled]}
          onPress={checkCookies}
          disabled={!currentUrl}
        >
          <Text style={styles.btnText}>6. Cookie</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.btn, styles.btnRed, !lastResult?.pid && styles.btnDisabled]}
          onPress={fetchCommentApi}
          disabled={!lastResult?.pid}
        >
          <Text style={styles.btnText}>7. API</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnRed, !lastResult?.pid && styles.btnDisabled]}
          onPress={fetchBatchApi}
          disabled={!lastResult?.pid}
        >
          <Text style={styles.btnText}>8. Batch</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, showWebView ? styles.btnActive : styles.btnPurple]}
          onPress={toggleWebView}
        >
          <Text style={styles.btnText}>{showWebView ? 'WV: ON' : 'WV: OFF'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnPurple, !lastResult?.nextCursor && styles.btnDisabled]}
          onPress={loadCfChallenge}
          disabled={!lastResult?.nextCursor}
        >
          <Text style={styles.btnText}>CF Chal</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.btn, styles.btnNew, !lastResult?.nextCursor && styles.btnDisabled]}
          onPress={fetchNxcBypass}
          disabled={!lastResult?.nextCursor}
        >
          <Text style={styles.btnText}>9. Bypass</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, browseMode ? styles.btnActive : { backgroundColor: '#00897B' }]}
          onPress={() => {
            if (browseMode) { setBrowseMode(false); setShowWebView(false); log('ブラウズモード終了') }
            else startBrowse()
          }}
        >
          <Text style={styles.btnText}>{browseMode ? 'Browse: ON' : 'Browse'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#00897B' }, !browseMode && styles.btnDisabled]}
          onPress={browseAutoNav}
          disabled={!browseMode}
        >
          <Text style={styles.btnText}>JS click</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#00897B' }, !browseMode && styles.btnDisabled]}
          onPress={browseLocationNav}
          disabled={!browseMode}
        >
          <Text style={styles.btnText}>JS href</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 4 }} />}

      {/* WebView（可視/非表示切替） */}
      {currentUrl ? (
        <WebView
          key={webviewKey}
          ref={webviewRef}
          source={{ uri: currentUrl }}
          userAgent={IOS_SAFARI_UA}
          style={browseMode ? styles.webviewBrowse : showWebView ? styles.webviewVisible : styles.webview}
          {...(!browseMode && { injectedJavaScript: INJECT_JS })}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
          onNavigationStateChange={onNavigationStateChange}
          onError={onError}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
        />
      ) : null}

      {/* ログ表示 */}
      <ScrollView style={styles.logArea}>
        {logs.map((l, i) => (
          <Text key={i} style={styles.logText}>{l}</Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  title: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginTop: 8 },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 8 },
  buttons: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingHorizontal: 8, marginBottom: 4 },
  btn: { backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  btnNew: { backgroundColor: '#FF6B00' },
  btnGreen: { backgroundColor: '#34A853' },
  btnPurple: { backgroundColor: '#7B2FBE' },
  btnRed: { backgroundColor: '#D32F2F' },
  btnActive: { backgroundColor: '#E91E63' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  webview: { height: 0, width: 0, opacity: 0 },
  webviewVisible: { height: 250, marginHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#7B2FBE' },
  webviewBrowse: { flex: 2, marginHorizontal: 8, borderRadius: 8, borderWidth: 2, borderColor: '#00897B' },
  logArea: { flex: 1, backgroundColor: '#1a1a2e', margin: 8, borderRadius: 8, padding: 8 },
  logText: { color: '#0f0', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16 },
})
