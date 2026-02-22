import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY_NG_WORDS = '@sukikira:ngWords'
const STORAGE_KEY_VOTED = '@sukikira:voted'
const STORAGE_KEY_RESULT_CACHE = '@sukikira:resultCache'

const SettingsContext = createContext(null)

export const SettingsProvider = ({ children }) => {
  const [ngWords, setNgWords] = useState([])
  const [voted, setVoted] = useState({}) // { [name]: 'like' | 'dislike' }
  const [resultCache, setResultCache] = useState({}) // { [name]: { resultInfo, comments } }
  const resultCacheRef = useRef({})
  // コメント good/bad 投票済み（セッション中のみ・AsyncStorage 不要）
  const commentVotedRef = useRef({}) // { [commentId]: 'like' | 'dislike' }

  // 初期ロード
  useEffect(() => {
    const load = async () => {
      try {
        const [ngRaw, votedRaw, cacheRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_NG_WORDS),
          AsyncStorage.getItem(STORAGE_KEY_VOTED),
          AsyncStorage.getItem(STORAGE_KEY_RESULT_CACHE),
        ])
        if (ngRaw) setNgWords(JSON.parse(ngRaw))
        if (votedRaw) setVoted(JSON.parse(votedRaw))
        if (cacheRaw) {
          const parsed = JSON.parse(cacheRaw)
          setResultCache(parsed)
          resultCacheRef.current = parsed
        }
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

  // 投票済み記録
  const recordVote = useCallback(async (name, type) => {
    setVoted((prev) => {
      const next = { ...prev, [name]: type }
      AsyncStorage.setItem(STORAGE_KEY_VOTED, JSON.stringify(next))
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
    commentVotedRef.current = { ...commentVotedRef.current, [commentId]: voteType }
  }, [])

  const getCommentVoted = useCallback(
    (commentId) => commentVotedRef.current[commentId] ?? null,
    [],
  )

  // NGワードフィルタ（コメント本文に含まれるか）
  const isNgComment = useCallback(
    (body) => ngWords.some((w) => body.includes(w)),
    [ngWords],
  )

  return (
    <SettingsContext.Provider
      value={{ ngWords, addNgWord, removeNgWord, voted, recordVote, isNgComment, cacheResult, getCachedResult, recordCommentVote, getCommentVoted }}
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
