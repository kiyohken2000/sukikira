/**
 * sukikira.js
 * 好き嫌い.com (suki-kira.com) へのリクエスト処理を全て集約する。
 * 仕様変更時の修正箇所をこのファイルのみに限定するため、
 * 他のファイルから直接 fetch しないこと。
 *
 * 注意: suki-kira.com の Cloudflare 設定により、カスタムヘッダー（User-Agent 等）を
 * 付与した GET リクエストは空ボディを返す。GETリクエストにはヘッダーを付けないこと。
 */

const BASE_URL = 'https://suki-kira.com'

// -----------------------------------------------------------------------
// ユーティリティ
// -----------------------------------------------------------------------

// getComments が取得した投票フォーム HTML をキャッシュ（vote() で再利用）
// 同じ URL を短時間に2回 fetch すると空ボディになる問題の回避策
let _votePageCache = { name: null, html: null }

/** GETリクエスト（ヘッダーなし — Cloudflare 対策） */
const get = async (path) => {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`)
  return await res.text()
}

/** 人物名を URL パスに使える形式にエンコード */
const encodeName = (name) =>
  encodeURIComponent(name).replace(/\(/g, '%28').replace(/\)/g, '%29')

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
// -----------------------------------------------------------------------

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

  const hasNext = /rel="next"/.test(html)
  const nextPage = hasNext ? page + 1 : null

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
  // Cloudflare キャッシュバスト: タイムスタンプを付与して空レスポンスのキャッシュを回避
  const apiUrl = `${BASE_URL}/search/search?q=${q}${token ? `&sk_token=${token}` : ''}&_t=${Date.now()}`
  const apiRes = await fetch(apiUrl)
  if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status}: /search/search`)
  const apiText = await apiRes.text()
  if (!apiText || apiText === 'Invalid Token') throw new Error('検索サーバーが応答しません。しばらく時間をおいて再度お試しください')
  const json = JSON.parse(apiText)

  const people = [...(json.people_result ?? []), ...(json.people_result_plus ?? [])]
  const items = people.map((p) => ({
    name: p.name,
    url: `/people/vote/${encodeName(p.name)}`,
    imageUrl: p.image?.replace(/&amp;/g, '&') ?? '',
    likePercent: '',
    dislikePercent: '',
  }))

  return items
}

// -----------------------------------------------------------------------
// 人物詳細（投票結果ページ）
// GET /people/result/{name}
// -----------------------------------------------------------------------

/**
 * @param {string} name - 人物名（URLエンコードなし）
 */
export const getResult = async (name) => {
  const html = await get(`/people/result/${encodeName(name)}`)
  return parseResult(html)
}

const parseResult = (html) => {
  const likePercent    = html.match(/好き派:\s*(?:<[^>]+>)*([\d.]+)/)?.[1] ?? '0'
  const dislikePercent = html.match(/嫌い派:\s*(?:<[^>]+>)*([\d.]+)/)?.[1] ?? '0'
  const likeVotes      = html.match(/好き派:[\s\S]{0,200}?([\d,]+)票/)?.[1]?.replace(/,/g, '') ?? '0'
  const dislikeVotes   = html.match(/嫌い派:[\s\S]{0,200}?([\d,]+)票/)?.[1]?.replace(/,/g, '') ?? '0'
  const imageUrl = html.match(/property="og:image"[^>]*content="([^"]+)"/)?.[1] ?? ''
  const imageMatches = [...html.matchAll(/<img[^>]*class="[^"]*sk-result-img[^"]*"[^>]*>/g)]
  const images = imageMatches
    .map(m => m[0].match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&') ?? '')
    .filter(Boolean)
  const tags = [...html.matchAll(/<span[^>]*class="[^"]*tag-pill[^"]*"[^>]*>([^<]+)<\/span>/g)]
    .map(m => m[1].trim())
    .filter(Boolean)
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ''
  const name = h1.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').replace(/のこと.*/, '').trim()
  const xdate   = html.match(/var xdate\s*=\s*"([^"]+)"/)?.[1] ?? ''
  const pidHash = html.match(/var pid_hash\s*=\s*"([^"]+)"/)?.[1] ?? ''
  const pid     = html.match(/var pid\s*=\s*['"]([^'"]+)['"]/)?.[1]
                ?? html.match(/\/p\/([^/]+)\/c\//)?.[1] ?? ''
  const skToken = html.match(/var sk_token\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? ''
  return { name, imageUrl, images, tags, likePercent, dislikePercent, likeVotes, dislikeVotes, xdate, pidHash, pid, skToken }
}

// -----------------------------------------------------------------------
// コメント一覧取得
// GET /people/result/{name} のHTMLからパース
// -----------------------------------------------------------------------

/**
 * @param {string} name
 * @returns {Promise<{resultInfo: object, comments: Array, nextCursor: string|null, notFound?: boolean}>}
 */
export const getComments = async (name) => {
  const encodedName = encodeName(name)
  const html = await get(`/people/result/${encodedName}?_t=${Date.now()}`)

  // 存在しない人物: トップページにリダイレクトされた場合
  if (html && !html.includes('/people/') && !html.includes('好き派')) {
    return { resultInfo: null, comments: [], notFound: true }
  }

  const isResultPage = /好き派:/.test(html)
  if (!isResultPage) {
    // 未投票 = vote ページが返ってきた → キャッシュして vote() で再利用
    if (html && html.length > 100) {
      _votePageCache = { name, html }
    }
    return { resultInfo: null, comments: [] }
  }

  const resultInfo = parseResult(html)
  const comments = parseComments(html)
  const nextCursor = comments.length >= 20 ? parseNextCursor(html) : null
  return { resultInfo, comments, nextCursor }
}

/** コメントの最小IDからページネーションカーソルを算出 */
const parseNextCursor = (html) => {
  const ids = []
  const re = /<div class="comment-container c(\d+)"/g
  let m
  while ((m = re.exec(html)) !== null) ids.push(Number(m[1]))
  if (ids.length === 0) return null
  const minId = Math.min(...ids)
  return minId > 1 ? String(minId) : null
}

/**
 * 追加コメントを個別取得（/p/{pid}/c/{cid}/t/{token} API）
 * Cloudflare が ?nxc= ページネーションをリダイレクトするため、
 * 個別コメントAPIで取得する。
 * 注意: APIは upvote/downvote 数と token を返さない。
 * @param {string} name - 人物名
 * @param {string} cursor - 現在の最小コメントID
 * @param {string} pid - 人物ID（resultInfo.pid）
 * @param {string} skToken - セキュリティトークン（resultInfo.skToken）
 */
export const getMoreComments = async (name, cursor, pid, skToken) => {
  const startId = Number(cursor) - 1
  if (startId < 1 || !pid || !skToken) return { comments: [], nextCursor: null }

  const comments = []
  let lowestId = startId
  let misses = 0
  for (let id = startId; id > 0 && comments.length < 20 && misses < 10; id--) {
    try {
      const res = await fetch(`${BASE_URL}/p/${pid}/c/${id}/t/${skToken}`, { credentials: 'include' })
      const text = await res.text()
      if (!text || text.length < 10) { misses++; continue }
      const data = JSON.parse(text)
      if (data && data.body) {
        comments.push({
          id: data.index ?? String(id),
          body: data.body
            .replace(/<span[^>]*class=['"]anchor['"][^>]*data=['"](\d+)['"][^>]*>([^<]+)<\/span>/g, '$2')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&[^;]+;/g, ' ')
            .trim(),
          type: data.type === '1' ? 'like' : data.type === '0' ? 'dislike' : 'unknown',
          upvoteCount: 0,
          downvoteCount: 0,
          token: '',
          author: data.name_hash ?? '匿名',
          dateText: data.created_at ?? '',
        })
        lowestId = id
        misses = 0
      } else {
        misses++
      }
    } catch (e) {
      misses++
    }
  }

  const nextCursor = comments.length > 0 ? String(lowestId) : null
  return { comments, nextCursor }
}

const parseComments = (html) => {
  const comments = []
  const parts = html.split('<div class="comment-container c')
  for (let i = 1; i < parts.length; i++) {
    const idMatch = parts[i].match(/^(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]
    const block = parts[i]

    const ratingMatch = block.match(/itemprop="ratingValue"[^>]*content\s*=\s*"(\d+)"/)
    const type = ratingMatch?.[1] === '100' ? 'like'
               : ratingMatch?.[1] === '0' ? 'dislike'
               : 'unknown'

    const author = block.match(/itemprop="author"[^>]*>([\s\S]*?)<\/span>/)?.[1]?.trim() ?? '匿名'
    const dateText = block.match(/itemprop="datePublished"[^>]*>([^<]+)<\/span>/)?.[1]?.trim() ?? ''
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

    const upvoteCount   = parseInt(block.match(/itemprop="upvoteCount"[^>]*content="(\d+)"/)?.[1] ?? '0', 10)
    const downvoteCount = parseInt(block.match(/itemprop="downvoteCount"[^>]*content="(\d+)"/)?.[1] ?? '0', 10)
    const token = block.match(/data-token="([^"]+)"/)?.[1] ?? ''

    if (body) comments.push({ id, body, type, upvoteCount, downvoteCount, token, author, dateText })
  }

  return comments
}

// -----------------------------------------------------------------------
// 投票
// -----------------------------------------------------------------------

/**
 * @param {string} name
 * @param {'like' | 'dislike'} voteType
 * @returns {Promise<{resultInfo: object, comments: Array}>}
 */
export const vote = async (name, voteType) => {
  const encodedName = encodeName(name)
  let pageHtml = ''

  // getComments がキャッシュした vote ページ HTML を優先的に使う
  if (_votePageCache.name === name && _votePageCache.html && _votePageCache.html.length > 100) {
    pageHtml = _votePageCache.html
    _votePageCache = { name: null, html: null }
  } else {
    _votePageCache = { name: null, html: null }
    pageHtml = await get(`/people/vote/${encodedName}`)
  }

  // 結果ページが返った場合（既投票済み）
  if (/好き派:/.test(pageHtml)) {
    const cmts = parseComments(pageHtml)
    const nextCursor = cmts.length >= 20 ? parseNextCursor(pageHtml) : null
    return { resultInfo: parseResult(pageHtml), comments: cmts, nextCursor }
  }

  const { id, auth1, auth2, authR } = parseVoteTokens(pageHtml)

  if (!id || !auth1 || !auth2 || !authR) {
    throw new Error('投票トークンの取得に失敗しました')
  }

  // 投票POST
  const body = new URLSearchParams({
    vote: voteType === 'like' ? '1' : '0',
    ok: 'ng',
    id,
    auth1,
    auth2,
    'auth-r': authR,
  }).toString()

  const res = await fetch(`${BASE_URL}/people/result/${encodedName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
      Referer: `${BASE_URL}/people/vote/${encodedName}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`投票POST失敗: HTTP ${res.status}`)
  const html = await res.text()

  // POSTレスポンスに結果が含まれていればそのまま返す
  if (html && /好き派:/.test(html)) {
    const cmts = parseComments(html)
    const nextCursor = cmts.length >= 20 ? parseNextCursor(html) : null
    return { resultInfo: parseResult(html), comments: cmts, nextCursor }
  }

  // POSTレスポンスが空の場合、結果ページを再取得（投票済みなので result ページが返る）
  const fallbackHtml = await get(`/people/result/${encodedName}`)
  if (/好き派:/.test(fallbackHtml)) {
    const cmts = parseComments(fallbackHtml)
    const nextCursor = cmts.length >= 20 ? parseNextCursor(fallbackHtml) : null
    return { resultInfo: parseResult(fallbackHtml), comments: cmts, nextCursor }
  }

  return { resultInfo: null, comments: [], nextCursor: null }
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
  const pageHtml = await get(`/people/result/${encodeName(name)}`)
  const { action, id, sum, tagId, auth1, auth2 } = parseCommentTokens(pageHtml)

  if (!action || !id) {
    throw new Error('コメントフォームトークンの取得に失敗しました')
  }

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
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
      Referer: `${BASE_URL}/people/result/${encodeName(name)}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`コメント投稿失敗: HTTP ${res.status}`)
  const html = await res.text()
  const resultInfo = parseResult(html)
  const comments = parseComments(html)
  return { resultInfo, comments }
}
