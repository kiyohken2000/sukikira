import React, { useState, useRef, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

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

  const loadNextPage = () => {
    if (!lastResult?.nextCursor) { log('ERROR: nextCursor がない'); return }
    navigate(`${RESULT_URL}/?nxc=${lastResult.nextCursor}`)
  }

  const loadCommentPage = () => navigate(`${RESULT_URL}/?cm`)

  const onMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      console.log('[WVTest] RAW:', JSON.stringify(data, null, 2))

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
    log('WebView loaded, injecting extract JS...')
    // ページ読み込み完了後に抽出JSを注入（ナビゲーション後にも必要）
    webviewRef.current?.injectJavaScript(INJECT_JS)
  }, [log])

  const onNavigationStateChange = useCallback((state) => {
    log(`Nav: ${state.url} (loading=${state.loading})`)
  }, [log])

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
          <Text style={styles.btnText}>1. Result ページ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, !lastResult?.nextCursor && styles.btnDisabled]}
          onPress={loadNextPage}
          disabled={!lastResult?.nextCursor}
        >
          <Text style={styles.btnText}>2. ?nxc= 次ページ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={loadCommentPage}>
          <Text style={styles.btnText}>3. ?cm ページ</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="small" color="#007AFF" style={{ marginVertical: 4 }} />}

      {/* 隠し WebView */}
      {currentUrl ? (
        <WebView
          key={webviewKey}
          ref={webviewRef}
          source={{ uri: currentUrl }}
          userAgent={DESKTOP_UA}
          style={styles.webview}
          injectedJavaScript={INJECT_JS}
          onMessage={onMessage}
          onLoadEnd={onLoadEnd}
          onNavigationStateChange={onNavigationStateChange}
          onError={onError}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
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
  buttons: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  btn: { backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  webview: { height: 0, width: 0, opacity: 0 },
  logArea: { flex: 1, backgroundColor: '#1a1a2e', margin: 8, borderRadius: 8, padding: 8 },
  logText: { color: '#0f0', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16 },
})
