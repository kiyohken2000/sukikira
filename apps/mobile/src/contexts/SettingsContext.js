import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY_NG_WORDS = '@sukikira:ngWords'
const STORAGE_KEY_VOTED = '@sukikira:voted'
const STORAGE_KEY_RESULT_CACHE = '@sukikira:resultCache'
const STORAGE_KEY_VOTE_HISTORY = '@sukikira:voteHistory'
const STORAGE_KEY_BROWSE_HISTORY = '@sukikira:browseHistory'
const STORAGE_KEY_COMMENT_HISTORY = '@sukikira:commentHistory'
const STORAGE_KEY_BOOKMARK_FOLDERS = '@sukikira:bookmarkFolders'
const STORAGE_KEY_COMMENT_VOTED = '@sukikira:commentVoted'
const STORAGE_KEY_EULA_ACCEPTED = '@sukikira:eulaAccepted'
const STORAGE_KEY_NOTIFY_VOTE = '@sukikira:notifyVote'
const STORAGE_KEY_NOTIFY_IDS = '@sukikira:notifyIds'

const VOTE_EXPIRE_MS = 24 * 60 * 60 * 1000 // 24時間

const SettingsContext = createContext(null)

export const SettingsProvider = ({ children }) => {
  const [ngWords, setNgWords] = useState([])
  // 内部: { [name]: { type: 'like'|'dislike', votedAt: number } }
  const [votedRaw, setVotedRaw] = useState({})
  // 外部公開: 24時間以内の投票のみ { [name]: 'like' | 'dislike' }
  const voted = useMemo(() => {
    const now = Date.now()
    const result = {}
    for (const [name, entry] of Object.entries(votedRaw)) {
      if (typeof entry === 'string') continue // 旧フォーマット → 期限切れ扱い
      if (now - entry.votedAt < VOTE_EXPIRE_MS) result[name] = entry.type
    }
    return result
  }, [votedRaw])
  const votedRawRef = useRef({})
  const [resultCache, setResultCache] = useState({}) // { [name]: { resultInfo, comments } }
  const resultCacheRef = useRef({})
  // コメント good/bad 投票済み（セッション中のみ・AsyncStorage 不要）
  const commentVotedRef = useRef({}) // { [commentId]: 'like' | 'dislike' }
  // 履歴
  const [voteHistory, setVoteHistory] = useState([])    // { name, imageUrl, voteType, time }[]
  const [browseHistory, setBrowseHistory] = useState([]) // { name, imageUrl, time }[]
  const [commentHistory, setCommentHistory] = useState([]) // { name, body, time }[]
  // ブックマーク: { id, name, items: { name, imageUrl }[] }[]
  const [bookmarkFolders, setBookmarkFolders] = useState([])
  // 通知: 人物ごとのオン/オフ { [name]: true }
  const notifyVoteRef = useRef({})
  // 通知: スケジュール済み通知ID { [name]: string }
  const notifyIdsRef = useRef({})
  // EULA同意状態
  const [eulaAccepted, setEulaAccepted] = useState(false)

  // 初期ロード
  useEffect(() => {
    const load = async () => {
      try {
        const [ngRaw, votedRaw, cacheRaw, voteHRaw, browseHRaw, commentHRaw, bmRaw, cvRaw, eulaRaw, nvRaw, niRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_NG_WORDS),
          AsyncStorage.getItem(STORAGE_KEY_VOTED),
          AsyncStorage.getItem(STORAGE_KEY_RESULT_CACHE),
          AsyncStorage.getItem(STORAGE_KEY_VOTE_HISTORY),
          AsyncStorage.getItem(STORAGE_KEY_BROWSE_HISTORY),
          AsyncStorage.getItem(STORAGE_KEY_COMMENT_HISTORY),
          AsyncStorage.getItem(STORAGE_KEY_BOOKMARK_FOLDERS),
          AsyncStorage.getItem(STORAGE_KEY_COMMENT_VOTED),
          AsyncStorage.getItem(STORAGE_KEY_EULA_ACCEPTED),
          AsyncStorage.getItem(STORAGE_KEY_NOTIFY_VOTE),
          AsyncStorage.getItem(STORAGE_KEY_NOTIFY_IDS),
        ])
        if (ngRaw) setNgWords(JSON.parse(ngRaw))
        if (votedRaw) {
          const parsed = JSON.parse(votedRaw)
          // 旧フォーマット（string値）を新フォーマットにマイグレーション
          const migrated = {}
          for (const [name, entry] of Object.entries(parsed)) {
            migrated[name] = typeof entry === 'string'
              ? { type: entry, votedAt: 0 } // 旧データは期限切れ扱い
              : entry
          }
          setVotedRaw(migrated)
          votedRawRef.current = migrated
        }
        if (cacheRaw) {
          const parsed = JSON.parse(cacheRaw)
          setResultCache(parsed)
          resultCacheRef.current = parsed
        }
        if (voteHRaw) setVoteHistory(JSON.parse(voteHRaw))
        if (browseHRaw) setBrowseHistory(JSON.parse(browseHRaw))
        if (commentHRaw) setCommentHistory(JSON.parse(commentHRaw))
        if (bmRaw) setBookmarkFolders(JSON.parse(bmRaw))
        if (cvRaw) { commentVotedRef.current = JSON.parse(cvRaw) }
        if (eulaRaw === 'true') setEulaAccepted(true)
        if (nvRaw) notifyVoteRef.current = JSON.parse(nvRaw)
        if (niRaw) notifyIdsRef.current = JSON.parse(niRaw)
      } catch (e) {
        console.warn('SettingsContext load error', e)
      }
    }
    load()
  }, [])

  // NGワード追加
  const addNgWord = useCallback(async (word) => {
    const trimmed = word.trim()
    if (!trimmed) return
    setNgWords((prev) => {
      if (prev.includes(trimmed)) return prev
      const next = [...prev, trimmed]
      AsyncStorage.setItem(STORAGE_KEY_NG_WORDS, JSON.stringify(next))
      return next
    })
  }, [])

  // NGワード削除
  const removeNgWord = useCallback(async (word) => {
    setNgWords((prev) => {
      const next = prev.filter((w) => w !== word)
      AsyncStorage.setItem(STORAGE_KEY_NG_WORDS, JSON.stringify(next))
      return next
    })
  }, [])

  // 投票時刻を取得（ref 経由で安定した参照）
  const getVotedAt = useCallback(
    (name) => votedRawRef.current[name]?.votedAt ?? null,
    [],
  )

  // 投票済み記録（voted マップ + voteHistory）
  const recordVote = useCallback((name, type, imageUrl) => {
    setVotedRaw((prev) => {
      const next = { ...prev, [name]: { type, votedAt: Date.now() } }
      votedRawRef.current = next
      AsyncStorage.setItem(STORAGE_KEY_VOTED, JSON.stringify(next))
      return next
    })
    setVoteHistory((prev) => {
      const entry = { name, imageUrl: imageUrl || '', voteType: type, time: new Date().toISOString() }
      const next = [entry, ...prev.filter((h) => h.name !== name)].slice(0, 50)
      AsyncStorage.setItem(STORAGE_KEY_VOTE_HISTORY, JSON.stringify(next))
      return next
    })
  }, [])

  // 閲覧履歴記録（dedup: 同名は削除して先頭へ）
  const recordBrowse = useCallback((name, imageUrl) => {
    setBrowseHistory((prev) => {
      const entry = { name, imageUrl: imageUrl || '', time: new Date().toISOString() }
      const next = [entry, ...prev.filter((h) => h.name !== name)].slice(0, 30)
      AsyncStorage.setItem(STORAGE_KEY_BROWSE_HISTORY, JSON.stringify(next))
      return next
    })
  }, [])

  // コメント履歴記録
  const recordComment = useCallback((name, body, commentId, initialUpvotes, initialDownvotes) => {
    setCommentHistory((prev) => {
      const entry = {
        name,
        body: body.slice(0, 100),
        time: new Date().toISOString(),
        commentId: commentId ?? null,
        initialUpvotes: initialUpvotes ?? 0,
        initialDownvotes: initialDownvotes ?? 0,
      }
      const next = [entry, ...prev].slice(0, 30)
      AsyncStorage.setItem(STORAGE_KEY_COMMENT_HISTORY, JSON.stringify(next))
      return next
    })
  }, [])

  // ブックマーク: フォルダ作成
  const addBookmarkFolder = useCallback((folderName) => {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    setBookmarkFolders((prev) => {
      const next = [...prev, { id, name: folderName, items: [] }]
      AsyncStorage.setItem(STORAGE_KEY_BOOKMARK_FOLDERS, JSON.stringify(next))
      return next
    })
  }, [])

  // ブックマーク: フォルダ削除
  const removeBookmarkFolder = useCallback((folderId) => {
    setBookmarkFolders((prev) => {
      const next = prev.filter((f) => f.id !== folderId)
      AsyncStorage.setItem(STORAGE_KEY_BOOKMARK_FOLDERS, JSON.stringify(next))
      return next
    })
  }, [])

  // ブックマーク: フォルダに人物追加
  const addToFolder = useCallback((folderId, personName, imageUrl) => {
    setBookmarkFolders((prev) => {
      const next = prev.map((f) => {
        if (f.id !== folderId) return f
        if (f.items.some((i) => i.name === personName)) return f
        return { ...f, items: [...f.items, { name: personName, imageUrl: imageUrl || '' }] }
      })
      AsyncStorage.setItem(STORAGE_KEY_BOOKMARK_FOLDERS, JSON.stringify(next))
      return next
    })
  }, [])

  // ブックマーク: フォルダから人物削除
  const removeFromFolder = useCallback((folderId, personName) => {
    setBookmarkFolders((prev) => {
      const next = prev.map((f) => {
        if (f.id !== folderId) return f
        return { ...f, items: f.items.filter((i) => i.name !== personName) }
      })
      AsyncStorage.setItem(STORAGE_KEY_BOOKMARK_FOLDERS, JSON.stringify(next))
      return next
    })
  }, [])

  // 投票・コメント取得結果をキャッシュ（Cookie切れ時のフォールバック用）
  const cacheResult = useCallback((name, resultInfo, comments) => {
    const next = { ...resultCacheRef.current, [name]: { resultInfo, comments } }
    resultCacheRef.current = next
    setResultCache(next)
    AsyncStorage.setItem(STORAGE_KEY_RESULT_CACHE, JSON.stringify(next)).catch(() => {})
  }, [])

  // ref経由で読むため依存配列が空 → 常に安定した参照を返す
  const getCachedResult = useCallback(
    (name) => resultCacheRef.current[name] ?? null,
    [],
  )

  // コメント投票済み記録・参照（ref 経由で常に安定した参照）
  const recordCommentVote = useCallback((commentId, voteType) => {
    const next = { ...commentVotedRef.current, [commentId]: voteType }
    commentVotedRef.current = next
    AsyncStorage.setItem(STORAGE_KEY_COMMENT_VOTED, JSON.stringify(next))
  }, [])

  const getCommentVoted = useCallback(
    (commentId) => commentVotedRef.current[commentId] ?? null,
    [],
  )

  // 通知: 人物ごとのオン/オフ取得・設定（ref 経由で安定した参照）
  const isNotifyEnabled = useCallback(
    (name) => !!notifyVoteRef.current[name],
    [],
  )

  const setNotifyEnabled = useCallback((name, enabled) => {
    const next = { ...notifyVoteRef.current }
    if (enabled) next[name] = true
    else delete next[name]
    notifyVoteRef.current = next
    AsyncStorage.setItem(STORAGE_KEY_NOTIFY_VOTE, JSON.stringify(next)).catch(() => {})
  }, [])

  const getNotifyId = useCallback(
    (name) => notifyIdsRef.current[name] ?? null,
    [],
  )

  const setNotifyId = useCallback((name, id) => {
    const next = { ...notifyIdsRef.current }
    if (id) next[name] = id
    else delete next[name]
    notifyIdsRef.current = next
    AsyncStorage.setItem(STORAGE_KEY_NOTIFY_IDS, JSON.stringify(next)).catch(() => {})
  }, [])

  // EULA同意
  const acceptEula = useCallback(() => {
    setEulaAccepted(true)
    AsyncStorage.setItem(STORAGE_KEY_EULA_ACCEPTED, 'true').catch(() => {})
  }, [])

  // NGワードフィルタ（コメント本文に含まれるか）
  const isNgComment = useCallback(
    (body) => ngWords.some((w) => body.includes(w)),
    [ngWords],
  )

  return (
    <SettingsContext.Provider
      value={{ ngWords, addNgWord, removeNgWord, voted, recordVote, getVotedAt, isNgComment, cacheResult, getCachedResult, recordCommentVote, getCommentVoted, voteHistory, browseHistory, commentHistory, recordBrowse, recordComment, bookmarkFolders, addBookmarkFolder, removeBookmarkFolder, addToFolder, removeFromFolder, eulaAccepted, acceptEula, isNotifyEnabled, setNotifyEnabled, getNotifyId, setNotifyId }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
