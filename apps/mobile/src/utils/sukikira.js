/**
 * sukikira.js
 * 好き嫌い.com (suki-kira.com) へのリクエスト処理を全て集約する。
 * 仕様変更時の修正箇所をこのファイルのみに限定するため、
 * 他のファイルから直接 fetch しないこと。
 */

const BASE_URL = 'https://suki-kira.com'

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja-JP,ja;q=0.9',
}

// -----------------------------------------------------------------------
// ユーティリティ
// -----------------------------------------------------------------------

const get = async (path) => {
  const url = `${BASE_URL}${path}`
  console.log('[sukikira] GET', url)
  const res = await fetch(url, { headers: HEADERS })
  console.log('[sukikira] status', res.status, url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`)
  const text = await res.text()
  console.log('[sukikira] html preview:', text.substring(0, 500))
  return text
}

/** デバッグ用: 生HTMLをログに出力する */
export const debugFetch = async (path = '/') => {
  const html = await get(path)
  console.log('[sukikira] FULL HTML LENGTH:', html.length)
  // 500文字ずつ分割してログ出力（Expoログの文字数制限対策）
  for (let i = 0; i < Math.min(html.length, 3000); i += 500) {
    console.log(`[sukikira] HTML[${i}-${i + 500}]:`, html.substring(i, i + 500))
  }
  return html
}

/** encodeURIComponent の後に括弧を復元する（suki-kira.com は括弧をそのまま使う） */
const encodeName = (name) =>
  encodeURIComponent(name).replace(/%28/gi, '(').replace(/%29/gi, ')')

/** input タグから name に対応する value を取得（属性順序不問） */
const parseInputValue = (html, name) =>
  html.match(new RegExp(`name="${name}"[^>]*value="([^"]+)"`))?.[1] ??
  html.match(new RegExp(`value="([^"]+)"[^>]*name="${name}"`))?.[1] ??
  null

/** 投票フォーム（vote ページ）から hidden トークンを取得 */
const parseVoteTokens = (html) => ({
  id:    parseInputValue(html, 'id'),
  auth1: parseInputValue(html, 'auth1'),
  auth2: parseInputValue(html, 'auth2'),
  authR: parseInputValue(html, 'auth-r'),
})

/** コメント投稿フォームのトークンを取得 */
const parseCommentTokens = (html) => ({
  action: html.match(/action="(\/people\/comment\/[^"]+)"/)?.[1] ?? null,
  id: html.match(/name="id"[^>]*value="([^"]+)"/)?.[1] ?? null,
  sum: html.match(/name="sum"[^>]*value="([^"]+)"/)?.[1] ?? null,
  tagId: html.match(/name="tag_id"[^>]*value="([^"]+)"/)?.[1] ?? null,
  auth1: html.match(/name="auth1"[^>]*value="([^"]+)"/)?.[1] ?? null,
  auth2: html.match(/name="auth2"[^>]*value="([^"]+)"/)?.[1] ?? null,
})

// -----------------------------------------------------------------------
// ランキング取得
// GET https://suki-kira.com/ranking/{type}/
// 専用ランキングページ（約20件）をパースして返す
// -----------------------------------------------------------------------

/**
 * @param {'like' | 'dislike' | 'trend'} type
 * @returns {Promise<Array<{rank: number, name: string, url: string, imageUrl: string, likePercent: string, dislikePercent: string}>>}
 */
/**
 * @param {'like' | 'dislike' | 'trend'} type
 * @param {number} page - 1始まり
 * @returns {Promise<{items: Array, nextPage: number|null}>}
 */
export const getRanking = async (type = 'like', page = 1) => {
  const base = { like: '/ranking/like', dislike: '/ranking/dislike', trend: '/ranking/trend' }[type] ?? '/ranking/like'
  const path = page === 1 ? `${base}/` : `${base}/${page}`
  const html = await get(path)

  const items = []

  // 1〜3位: <div class="card3 ranking-card">（1ページ目のみ）
  const cardRegex = /<div[^>]*class="[^"]*ranking-card[^"]*"([\s\S]*?)(?=<div[^>]*class="[^"]*ranking-card|<section[^>]*class="[^"]*box-rank-review)/g
  let cm
  while ((cm = cardRegex.exec(html)) !== null) {
    const block = cm[1]
    const url = block.match(/href="(\/people\/vote\/[^"]+)"/)?.[1] ?? ''
    const name = url ? decodeURIComponent(url.replace('/people/vote/', '')) : (block.match(/class="[^"]*ranking-name[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? '')
    if (!name) continue
    const imageUrl = block.match(/data-src="(https?:\/\/[^"]+)"/)?.[1]
                  ?? block.match(/src="(https?:\/\/(?!suki-kira)[^"]+)"/)?.[1] ?? ''
    items.push({ rank: items.length + 1, name, url, imageUrl, likePercent: '', dislikePercent: '' })
  }

  // 4位以降: <section class="box-rank-review">
  const sectionRegex = /<section[^>]*class="[^"]*box-rank-review[^"]*">([\s\S]*?)<\/section>/g
  let sm
  while ((sm = sectionRegex.exec(html)) !== null) {
    const block = sm[1]
    const url = block.match(/href="(\/people\/vote\/[^"]+)"/)?.[1] ?? ''
    const name = url ? decodeURIComponent(url.replace('/people/vote/', '')) : (block.match(/<h2[^>]*class="title"[^>]*>([^<]+)<\/h2>/)?.[1]?.trim() ?? '')
    if (!name) continue
    const imageUrl = block.match(/data-src="(https?:\/\/[^"]+)"/)?.[1] ?? ''
    const rankMatch = block.match(/<p class="num">(\d+)<\/p>/)
    const rank = rankMatch ? parseInt(rankMatch[1], 10) : items.length + 1
    items.push({ rank, name, url, imageUrl, likePercent: '', dislikePercent: '' })
  }

  items.sort((a, b) => a.rank - b.rank)

  // 次ページ判定: <link rel="next"> が存在すれば次ページあり
  const hasNext = /rel="next"/.test(html)
  const nextPage = hasNext ? page + 1 : null

  console.log('[sukikira] getRanking type=%s page=%d count=%d nextPage=%s', type, page, items.length, nextPage)
  return { items, nextPage }
}

// -----------------------------------------------------------------------
// 検索
// GET https://suki-kira.com/search?q={query}
// -----------------------------------------------------------------------

/**
 * @param {string} query
 * @returns {Promise<Array<{name: string, url: string, imageUrl: string}>>}
 */
export const search = async (query) => {
  const q = encodeURIComponent(query)

  // 1. HTMLページから sk_token を取得
  const html = await get(`/search?q=${q}`)
  const token = html.match(/sk_token\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? ''

  // 2. JSON API から検索結果取得
  const apiUrl = `${BASE_URL}/search/search?q=${q}${token ? `&sk_token=${token}` : ''}`
  console.log('[sukikira] search API', apiUrl)
  const res = await fetch(apiUrl, {
    headers: {
      ...HEADERS,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${BASE_URL}/search?q=${q}`,
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: /search/search`)
  const json = await res.json()

  // people_result（完全一致）を先頭に、people_result_plus（類似）を後ろに並べる
  const people = [...(json.people_result ?? []), ...(json.people_result_plus ?? [])]
  const items = people.map((p) => ({
    name: p.name,
    url: `/people/vote/${encodeName(p.name)}`,
    imageUrl: p.image?.replace(/&amp;/g, '&') ?? '',
    likePercent: '',
    dislikePercent: '',
  }))

  console.log('[sukikira] search count:', items.length)
  return items
}

// -----------------------------------------------------------------------
// 人物詳細（投票結果ページ）
// GET /people/result/{name}
// -----------------------------------------------------------------------

/**
 * @param {string} name - 人物名（URLエンコードなし）
 * @returns {Promise<{name: string, imageUrl: string, likePercent: string, dislikePercent: string, likeVotes: string, dislikeVotes: string}>}
 */
export const getResult = async (name) => {
  const html = await get(`/people/result/${encodeName(name)}`)
  return parseResult(html)
}

const parseResult = (html) => {
  // 好き嫌い割合:
  //   旧形式: "好き派: 29.91%(145445票)"
  //   新形式: "好き派: <span itemprop="ratingValue">64.95</span>%<br><span>(379325票)</span>"
  // → span タグを読み飛ばして数値を取得する
  const likePercent    = html.match(/好き派:\s*(?:<[^>]+>)*([\d.]+)/)?.[1] ?? '0'
  const dislikePercent = html.match(/嫌い派:\s*(?:<[^>]+>)*([\d.]+)/)?.[1] ?? '0'
  // 票数: 新形式は "<br><span>(...票)</span>" のためラベルから200文字以内を検索
  const likeVotes      = html.match(/好き派:[\s\S]{0,200}?([\d,]+)票/)?.[1]?.replace(/,/g, '') ?? '0'
  const dislikeVotes   = html.match(/嫌い派:[\s\S]{0,200}?([\d,]+)票/)?.[1]?.replace(/,/g, '') ?? '0'
  const imageUrl = html.match(/property="og:image"[^>]*content="([^"]+)"/)?.[1] ?? ''
  // 人物の複数画像: class="sk-result-img" の src を全て取得（&amp; をデコード）
  const imageMatches = [...html.matchAll(/<img[^>]*class="[^"]*sk-result-img[^"]*"[^>]*>/g)]
  const images = imageMatches
    .map(m => m[0].match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&') ?? '')
    .filter(Boolean)
  // タグ: class="tag-pill" の span テキストを取得
  const tags = [...html.matchAll(/<span[^>]*class="[^"]*tag-pill[^"]*"[^>]*>([^<]+)<\/span>/g)]
    .map(m => m[1].trim())
    .filter(Boolean)
  // h1: "木村拓哉&nbsp;のこと、好き？嫌い？" → 名前だけ抜く
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''
  const name = h1.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').replace(/のこと.*/, '').trim()
  // コメント投票に必要なサーバー変数
  const xdate   = html.match(/var xdate\s*=\s*"([^"]+)"/)?.[1] ?? ''
  const pidHash = html.match(/var pid_hash\s*=\s*"([^"]+)"/)?.[1] ?? ''
  return { name, imageUrl, images, tags, likePercent, dislikePercent, likeVotes, dislikeVotes, xdate, pidHash }
}

// -----------------------------------------------------------------------
// コメント一覧取得
// GET /people/result/{name} のHTMLからパース
// -----------------------------------------------------------------------

/**
 * @param {string} name
 * @returns {Promise<{resultInfo: object, comments: Array<{id: string, body: string, type: 'like'|'dislike'|'unknown'}>}>}
 */
export const getComments = async (name) => {
  // まず GET /people/result/ を試みる（投票済み=Cookie持ちなら結果ページが返る）
  const encodedName = encodeName(name)
  const resultUrl = `${BASE_URL}/people/result/${encodedName}`
  console.log('[sukikira] GET', resultUrl)
  const resultRes = await fetch(resultUrl, { headers: HEADERS })
  console.log('[sukikira] status', resultRes.status, 'finalUrl', resultRes.url)
  if (!resultRes.ok) throw new Error(`HTTP ${resultRes.status}: /people/result/`)
  const html = await resultRes.text()

  // /people/ 以外へリダイレクトされた場合 = suki-kira.com にページが存在しない
  if (!resultRes.url.includes('/people/')) {
    console.log('[sukikira] getComments: redirected to non-people page, person not found')
    return { resultInfo: null, comments: [], notFound: true }
  }

  // result ページかどうかは「好き派:」の有無で判定
  // 旧形式: "好き派: 29.91%"  新形式: "好き派: <span>64.95</span>%"
  const isResultPage = /好き派:/.test(html)
  if (!isResultPage) {
    // Cookie なし（未投票状態）= vote ページが返ってきた
    // → ダミー投票なしで結果を見る方法がないため空で返す
    console.log('[sukikira] getComments: got vote page (not yet voted or no cookie)')
    return { resultInfo: null, comments: [] }
  }

  const resultInfo = parseResult(html)
  const comments = parseComments(html)
  const nextCursor = parseNextCursor(html)
  return { resultInfo, comments, nextCursor }
}

/** ページネーションカーソル: ?nxc={id} のID部分を取得 */
const parseNextCursor = (html) =>
  html.match(/\?nxc=(\d+)/)?.[1] ?? null

/**
 * 追加コメントを取得（?nxc={cursor} ページネーション）
 * @param {string} name
 * @param {string} cursor - parseNextCursor で得たID
 * @returns {Promise<{comments: Array, nextCursor: string|null}>}
 */
export const getMoreComments = async (name, cursor) => {
  const encodedName = encodeName(name)
  const url = `${BASE_URL}/people/result/${encodedName}/?nxc=${cursor}`
  console.log('[sukikira] getMoreComments', url)
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!res.url.includes('/people/')) throw new Error('redirected away from people page')
  const html = await res.text()
  if (!/好き派:/.test(html)) return { comments: [], nextCursor: null }
  const comments = parseComments(html)
  const nextCursor = parseNextCursor(html)
  console.log('[sukikira] getMoreComments loaded=%d nextCursor=%s', comments.length, nextCursor)
  return { comments, nextCursor }
}

const parseComments = (html) => {
  const comments = []

  // "comment-container c{id}" で split し各ブロックを処理（最後のコメントも欠落しない）
  const parts = html.split('<div class="comment-container c')
  for (let i = 1; i < parts.length; i++) {
    const idMatch = parts[i].match(/^(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]
    const block = parts[i]

    // タイプ: <meta itemprop="ratingValue" content="N"> 0=嫌い派 100=好き派
    const ratingMatch = block.match(/itemprop="ratingValue"[^>]*content\s*=\s*"(\d+)"/)
    const type = ratingMatch?.[1] === '100' ? 'like'
               : ratingMatch?.[1] === '0' ? 'dislike'
               : 'unknown'

    // 投稿者名: <span itemprop="author">匿名@嫌い派</span>
    const author = block.match(/itemprop="author"[^>]*>([\s\S]*?)<\/span>/)?.[1]?.trim() ?? '匿名'

    // 投稿日時: <span itemprop="datePublished" content="...">02-22 18:27</span>
    const dateText = block.match(/itemprop="datePublished"[^>]*>([^<]+)<\/span>/)?.[1]?.trim() ?? ''

    // 本文: <p itemprop="reviewBody">...</p>
    // アンカー <span class='anchor' data='NNN'>>>NNN</span> は >>NNN テキストとして保持
    const bodyMatch = block.match(/itemprop="reviewBody"[^>]*>([\s\S]*?)<\/p>/)

    let body = bodyMatch?.[1]
      ?.replace(/<span[^>]*class=['"]anchor['"][^>]*data=['"](\d+)['"][^>]*>([^<]+)<\/span>/g, '$2')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[^;]+;/g, ' ')
      .trim() ?? ''

    // itemprop が見つからない場合のフォールバック: comment_info div の後のテキストを取得
    if (!body) {
      const afterInfo = block.replace(/[\s\S]*class="[^"]*comment_info[^"]*"[^>]*>[\s\S]*?<\/div>/, '')
      body = afterInfo
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[^;]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500)
    }

    // good/bad 投票データ
    const upvoteCount   = parseInt(block.match(/itemprop="upvoteCount"[^>]*content="(\d+)"/)?.[1] ?? '0', 10)
    const downvoteCount = parseInt(block.match(/itemprop="downvoteCount"[^>]*content="(\d+)"/)?.[1] ?? '0', 10)
    const token = block.match(/data-token="([^"]+)"/)?.[1] ?? ''

    if (body) comments.push({ id, body, type, upvoteCount, downvoteCount, token, author, dateText })
  }

  console.log('[sukikira] parsed comments:', comments.length, 'types:', {
    like: comments.filter(c => c.type === 'like').length,
    dislike: comments.filter(c => c.type === 'dislike').length,
    unknown: comments.filter(c => c.type === 'unknown').length,
  })
  return comments
}

// -----------------------------------------------------------------------
// 投票
// -----------------------------------------------------------------------

/**
 * @param {string} name
 * @param {'like' | 'dislike'} voteType
 * @returns {Promise<{likePercent: string, dislikePercent: string, likeVotes: string, dislikeVotes: string}>}
 */
export const vote = async (name, voteType) => {
  // 1. フォームトークン取得
  //    fetch を直接呼び出してリダイレクト先 URL を確認する
  const encodedName = encodeName(name)
  const voteUrl = `${BASE_URL}/people/vote/${encodedName}`
  console.log('[sukikira] GET', voteUrl)
  const voteRes = await fetch(voteUrl, { headers: HEADERS })
  console.log('[sukikira] status', voteRes.status, 'finalUrl', voteRes.url)
  if (!voteRes.ok) throw new Error(`HTTP ${voteRes.status}: /people/vote/`)
  const pageHtml = await voteRes.text()

  // /people/ 以外へリダイレクトされた場合 = suki-kira.com にページが存在しない
  if (!voteRes.url.includes('/people/')) {
    throw new Error('この人物の投票ページが存在しません')
  }

  const { id, auth1, auth2, authR } = parseVoteTokens(pageHtml)

  if (!id || !auth1 || !auth2 || !authR) {
    // IPやCookieトラッキングで /people/result/ にリダイレクトされた場合、
    // 結果ページが返っているならそのまま使う（既投票済みとして扱う）
    const isResult = /好き派:/.test(pageHtml)
    if (isResult) {
      console.log('[sukikira] vote: redirected to result page, returning result directly')
      return { resultInfo: parseResult(pageHtml), comments: parseComments(pageHtml) }
    }
    throw new Error('投票トークンの取得に失敗しました')
  }
  console.log('[sukikira] vote: tokens ok, posting vote type=%s id=%s', voteType, id)

  // 2. 投票POST
  const body = new URLSearchParams({
    vote: voteType === 'like' ? '1' : '0',
    ok: 'ng',
    id,
    auth1,
    auth2,
    'auth-r': authR,
  }).toString()

  const res = await fetch(`${BASE_URL}/people/result/${encodeName(name)}`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
      Referer: `${BASE_URL}/people/vote/${encodeName(name)}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`投票POST失敗: HTTP ${res.status}`)
  const html = await res.text()
  const resultInfo = parseResult(html)
  const comments = parseComments(html)
  const nextCursor = parseNextCursor(html)
  return { resultInfo, comments, nextCursor }
}

// -----------------------------------------------------------------------
// コメント good/bad 投票
// -----------------------------------------------------------------------

/**
 * @param {string} pidHash - 人物ページのpid_hash変数
 * @param {string} commentId - コメントID
 * @param {'like' | 'dislike'} voteType
 * @param {string} token - コメントのトークン（data-token属性）
 * @param {string} xdate - ページのxdate変数
 */
export const voteComment = async (pidHash, commentId, voteType, token, xdate) => {
  const url = `https://api.suki-kira.com/comment/vote?xdate=${encodeURIComponent(xdate)}&evl=${voteType}`
  const body = new URLSearchParams({ pid: pidHash, token }).toString()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
    },
    body,
  })
  if (!res.ok) throw new Error(`comment vote failed: HTTP ${res.status}`)
}

// -----------------------------------------------------------------------
// コメント投稿
// -----------------------------------------------------------------------

/**
 * @param {string} name - 人物名（URLエンコードなし）
 * @param {string} commentBody - 投稿するコメント本文
 * @param {'1' | '0'} commentType - '1'=好き派, '0'=嫌い派
 * @returns {Promise<{resultInfo: object, comments: Array}>}
 */
export const postComment = async (name, commentBody, commentType = '1') => {
  // 1. フォームトークン取得（結果ページから）
  const pageHtml = await get(`/people/result/${encodeName(name)}`)
  const { action, id, sum, tagId, auth1, auth2 } = parseCommentTokens(pageHtml)

  if (!action || !id) {
    throw new Error('コメントフォームトークンの取得に失敗しました')
  }

  // 2. コメント投稿POST
  // type: '1'=好き派, '0'=嫌い派 (サーバーは空文字列を無視する)
  const body = new URLSearchParams({
    id,
    name_id: '',
    type: commentType,
    url: name,
    body: commentBody,
    sum: sum ?? '0',
    auth1: auth1 ?? '',
    auth2: auth2 ?? '',
    'auth-r': 'n',
    ok: 'ok',
    tag_id: tagId ?? '',
  }).toString()

  const res = await fetch(`${BASE_URL}${action}`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
      Referer: `${BASE_URL}/people/result/${encodeName(name)}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`コメント投稿失敗: HTTP ${res.status}`)
  // レスポンスHTML（リダイレクト後の結果ページ）からコメント一覧を返す
  const html = await res.text()
  const resultInfo = parseResult(html)
  const comments = parseComments(html)
  return { resultInfo, comments }
}
