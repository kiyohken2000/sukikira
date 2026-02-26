import React, { useState, useCallback, useMemo, useRef } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { colors } from '../../theme'
import { getComments, getMoreComments, vote, voteComment } from '../../utils/sukikira'
import { useSettings } from '../../contexts/SettingsContext'
import CommentItem from '../../components/CommentItem/CommentItem'
import VoteBar from '../../components/VoteBar/VoteBar'
import { scheduleVoteNotification, cancelVoteNotification } from '../../utils/notification'

const IMG_SIZE = 100
const VOTE_EXPIRE_MS = 24 * 60 * 60 * 1000 // 24時間

function CountdownText({ name }) {
  const { getVotedAt, isNotifyEnabled, setNotifyEnabled, getNotifyId, setNotifyId } = useSettings()
  const [remaining, setRemaining] = useState(() => {
    const votedAt = getVotedAt(name)
    if (!votedAt) return -1
    return Math.max(0, votedAt + VOTE_EXPIRE_MS - Date.now())
  })
  const [notifyOn, setNotifyOn] = useState(() => isNotifyEnabled(name))

  useFocusEffect(
    useCallback(() => {
      const update = () => {
        const votedAt = getVotedAt(name)
        if (!votedAt) { setRemaining(-1); return }
        setRemaining(Math.max(0, votedAt + VOTE_EXPIRE_MS - Date.now()))
      }
      update()
      const id = setInterval(update, 60000)
      return () => clearInterval(id)
    }, [name, getVotedAt]),
  )

  const toggleNotify = useCallback(async () => {
    if (notifyOn) {
      // OFF にする — スケジュール済み通知をキャンセル
      const existingId = getNotifyId(name)
      await cancelVoteNotification(existingId)
      setNotifyId(name, null)
      setNotifyEnabled(name, false)
      setNotifyOn(false)
    } else {
      // ON にする — 通知をスケジュール
      const votedAt = getVotedAt(name)
      if (!votedAt) return
      const id = await scheduleVoteNotification(name, votedAt)
      if (id) {
        setNotifyId(name, id)
        setNotifyEnabled(name, true)
        setNotifyOn(true)
      }
    }
  }, [notifyOn, name, getVotedAt, getNotifyId, setNotifyId, setNotifyEnabled])

  if (remaining < 0) return null
  if (remaining === 0) {
    return <Text style={countdownStyles.ready}>再投票できます</Text>
  }

  const totalMin = Math.ceil(remaining / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  const text = h > 0 ? `あと${h}時間${m}分` : `あと${m}分`

  return (
    <View style={countdownStyles.row}>
      <Text style={countdownStyles.text}>{text}で再投票できます</Text>
      <TouchableOpacity onPress={toggleNotify} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <FontIcon
          name={notifyOn ? 'bell' : 'bell-slash-o'}
          color={notifyOn ? colors.primary : colors.textMuted}
          size={16}
        />
      </TouchableOpacity>
    </View>
  )
}

const countdownStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  text: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  ready: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
})

const FILTER_TABS = [
  { key: 'all', label: 'すべて' },
  { key: 'like', label: '好き派' },
  { key: 'dislike', label: '嫌い派' },
]

export default function Details() {
  const navigation = useNavigation()
  const route = useRoute()
  const { name, imageUrl: paramImageUrl } = route.params

  const {
    voted, recordVote, getVotedAt, isNgComment,
    cacheResult, getCachedResult,
    recordCommentVote, getCommentVoted,
    recordBrowse,
    commentHistory,
    bookmarkFolders, addBookmarkFolder, addToFolder, removeFromFolder,
    getLastViewed, recordLastViewed,
  } = useSettings()
  // voted memo はタイマーで更新されないため、getVotedAt で24h経過を直接確認
  const votedAt = getVotedAt(name)
  const isExpired = votedAt && (Date.now() - votedAt >= VOTE_EXPIRE_MS)
  const voteStatus = isExpired ? null : voted[name]

  const [resultInfo, setResultInfo] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [voting, setVoting] = useState(false)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // 画像拡大表示
  const [zoomedIndex, setZoomedIndex] = useState(null)

  // 非表示コメントID セット
  const [hiddenIds, setHiddenIds] = useState(new Set())

  // アンカーポップアップ用
  const [anchorComment, setAnchorComment] = useState(null)

  // 全コメント（フィルタ前）への参照（アンカー解決用）
  const allCommentsRef = useRef([])

  // 前回閲覧時の最大コメントID（NEW バッジ判定用）
  const prevMaxCommentIdRef = useRef(undefined) // undefined=未初期化, null=初回閲覧

  // スレ内検索
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // ブックマーク
  const [bookmarkModalVisible, setBookmarkModalVisible] = useState(false)
  const [newFolderInput, setNewFolderInput] = useState('')
  const [addingNewFolder, setAddingNewFolder] = useState(false)
  const isBookmarked = useMemo(
    () => bookmarkFolders.some((f) => f.items.some((i) => i.name === name)),
    [bookmarkFolders, name],
  )
  const closeBookmarkModal = () => {
    setBookmarkModalVisible(false)
    setAddingNewFolder(false)
    setNewFolderInput('')
  }
  const handleAddNewFolder = () => {
    if (!newFolderInput.trim()) return
    addBookmarkFolder(newFolderInput.trim())
    setNewFolderInput('')
    setAddingNewFolder(false)
  }

  // 表示する画像一覧
  const displayImages = useMemo(() => {
    if (resultInfo?.images?.length) return resultInfo.images
    const fallback = resultInfo?.imageUrl || paramImageUrl
    return fallback ? [fallback] : []
  }, [resultInfo, paramImageUrl])

  // 自分が投稿したコメントID セット（この人物に限定）
  const myCommentEntries = useMemo(() => {
    return commentHistory.filter(h => h.name === name && h.commentId)
  }, [commentHistory, name])

  const myCommentIds = useMemo(() => {
    return new Set(myCommentEntries.map(h => h.commentId))
  }, [myCommentEntries])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { resultInfo: info, comments: cmts, nextCursor: cursor, notFound } = await getComments(name)
      if (notFound) {
        setError('この人物のページはsuki-kira.comに存在しません')
      } else if (info !== null) {
        // 前回の maxCommentId を保存（初回のみ）
        if (prevMaxCommentIdRef.current === undefined) {
          const last = getLastViewed(name)
          prevMaxCommentIdRef.current = last?.maxCommentId ?? null
        }
        setResultInfo(info)
        setComments(cmts)
        allCommentsRef.current = cmts
        setNextCursor(cursor)
        cacheResult(name, info, cmts)
        recordBrowse(name, info.imageUrl || paramImageUrl)
        // 最大コメントIDを記録
        if (cmts.length > 0) {
          const maxId = cmts.reduce((max, c) => (Number(c.id) > Number(max) ? c.id : max), cmts[0].id)
          recordLastViewed(name, maxId)
        }
      } else {
        const cached = getCachedResult(name)
        if (cached) {
          if (prevMaxCommentIdRef.current === undefined) {
            const last = getLastViewed(name)
            prevMaxCommentIdRef.current = last?.maxCommentId ?? null
          }
          setResultInfo(cached.resultInfo)
          setComments(cached.comments)
          allCommentsRef.current = cached.comments
          setNextCursor(null)
          recordBrowse(name, cached.resultInfo?.imageUrl || paramImageUrl)
        } else {
          recordBrowse(name, paramImageUrl)
        }
      }
    } catch (e) {
      setError('読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [name, cacheResult, getCachedResult])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const onVote = async (type) => {
    if (voteStatus) return
    setVoting(true)
    try {
      const { resultInfo: info, comments: cmts, nextCursor: cursor } = await vote(name, type)
      setResultInfo(info)
      setComments(cmts)
      allCommentsRef.current = cmts
      setNextCursor(cursor ?? null)
      recordVote(name, type, info.imageUrl || paramImageUrl)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      cacheResult(name, info, cmts)
    } catch (e) {
      console.error('[Details] vote error:', e?.message)
      const msg = e?.message?.includes('存在しません')
        ? 'この人物の投票ページはsuki-kira.comに存在しません'
        : '投票に失敗しました'
      Alert.alert('エラー', msg)
    } finally {
      setVoting(false)
    }
  }

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const { comments: more, nextCursor: next } = await getMoreComments(name, nextCursor, resultInfo?.pid, resultInfo?.skToken)
      setComments(prev => {
        const ids = new Set(prev.map(c => c.id))
        const merged = [...prev, ...more.filter(c => !ids.has(c.id))]
        allCommentsRef.current = merged
        return merged
      })
      setNextCursor(next)
    } catch (e) {
      console.warn('[Details] loadMore error', e)
    } finally {
      setLoadingMore(false)
    }
  }, [name, nextCursor, loadingMore, resultInfo])

  const onCommentVote = useCallback(async (commentId, voteType, token) => {
    if (!resultInfo?.pidHash || !resultInfo?.xdate) return
    try {
      await voteComment(resultInfo.pidHash, commentId, voteType, token, resultInfo.xdate)
      recordCommentVote(commentId, voteType)
    } catch (e) {
      console.warn('[Details] comment vote error', e)
    }
  }, [resultInfo, recordCommentVote])

  const onAnchorTap = useCallback((refId) => {
    const target = allCommentsRef.current.find(c => c.id === refId)
    if (target) {
      setAnchorComment(target)
    } else {
      Alert.alert('参照先なし', `コメント #${refId} はこのページに読み込まれていません`)
    }
  }, [])

  const onHide = useCallback((commentId) => {
    setHiddenIds(prev => new Set([...prev, commentId]))
  }, [])

  const onReply = useCallback((comment) => {
    if (!voteStatus) {
      Alert.alert('投票が必要です', '投票後にコメントを投稿できます')
      return
    }
    navigation.navigate('Post', { name, replyTo: comment.id })
  }, [name, navigation])

  const filteredComments = useMemo(() => {
    return comments.filter((c) => {
      if (filter !== 'all' && c.type !== filter) return false
      if (isNgComment(c.body)) return false
      if (hiddenIds.has(c.id)) return false
      if (searchQuery && !c.body.includes(searchQuery)) return false
      return true
    })
  }, [comments, filter, isNgComment, hiddenIds, searchQuery])

  const ListHeader = () => (
    <View>
      <View style={styles.personHeader}>
        {displayImages.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.imageScroll}
            contentContainerStyle={styles.imageScrollContent}
          >
            {displayImages.map((uri, i) => (
              <TouchableOpacity key={i} onPress={() => setZoomedIndex(i)} activeOpacity={0.85}>
                <Image source={{ uri }} style={styles.personImage} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.personImage, styles.imagePlaceholder]} />
        )}
        <Text style={styles.personName}>{name}</Text>
        {resultInfo?.tags?.length > 0 && (
          <View style={styles.tagRow}>
            {resultInfo.tags.map((tag, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
        {resultInfo && (
          <View style={styles.voteBarContainer}>
            <VoteBar
              likePercent={resultInfo.likePercent}
              dislikePercent={resultInfo.dislikePercent}
              large
            />
            <View style={styles.voteCount}>
              <Text style={[styles.voteCountText, { color: colors.like }]}>
                {resultInfo.likeVotes}票
              </Text>
              <Text style={[styles.voteCountText, { color: colors.dislike }]}>
                {resultInfo.dislikeVotes}票
              </Text>
            </View>
          </View>
        )}
        <View style={styles.voteButtons}>
          <TouchableOpacity
            style={[
              styles.voteBtn,
              styles.likeBtn,
              (!!voteStatus || voting) && styles.voteBtnDisabled,
            ]}
            onPress={() => onVote('like')}
            disabled={!!voteStatus || voting}
          >
            <Text style={styles.voteBtnText}>
              {voteStatus === 'like' ? '投票済み（好き）' : '好き！'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.voteBtn,
              styles.dislikeBtn,
              (!!voteStatus || voting) && styles.voteBtnDisabled,
            ]}
            onPress={() => onVote('dislike')}
            disabled={!!voteStatus || voting}
          >
            <Text style={styles.voteBtnText}>
              {voteStatus === 'dislike' ? '投票済み（嫌い）' : '嫌い！'}
            </Text>
          </TouchableOpacity>
        </View>
        {voteStatus && <CountdownText name={name} />}
      </View>

      {/* フィルタバー */}
      <View style={styles.filterBar}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
            onPress={() => setFilter(tab.key)}
          >
            <Text
              style={[
                styles.filterLabel,
                filter === tab.key && styles.filterLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
        {/* 検索ボタン */}
        <TouchableOpacity
          style={[styles.filterIconBtn, searchOpen && styles.filterIconBtnActive]}
          onPress={() => {
            setSearchOpen(v => !v)
            if (searchOpen) setSearchQuery('')
          }}
        >
          <FontIcon name="search" color={searchOpen ? colors.primary : colors.textMuted} size={14} />
        </TouchableOpacity>
        {/* コメント投稿ボタン */}
        <TouchableOpacity
          style={styles.postBtn}
          onPress={() => {
            if (!voteStatus) {
              Alert.alert('投票が必要です', '投票後にコメントを投稿できます')
              return
            }
            navigation.navigate('Post', { name })
          }}
        >
          <FontIcon name="pencil" color={voteStatus ? colors.primary : colors.textMuted} size={16} />
        </TouchableOpacity>
      </View>

    </View>
  )

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.navHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <FontIcon name="chevron-left" color={colors.text} size={18} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{name}</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setBookmarkModalVisible(true)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <FontIcon
            name={isBookmarked ? 'bookmark' : 'bookmark-o'}
            color={isBookmarked ? colors.primary : colors.text}
            size={18}
          />
        </TouchableOpacity>
      </View>

      {/* スレ内検索バー（FlatList の外に置くことでキーボードが閉じるバグを防ぐ） */}
      {searchOpen && (
        <View style={styles.searchBar}>
          <FontIcon name="search" color={colors.textMuted} size={13} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="コメントを検索..."
            placeholderTextColor={colors.textMuted}
            autoFocus
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <FontIcon name="times-circle" color={colors.textMuted} size={14} />
            </TouchableOpacity>
          )}
        </View>
      )}
      {searchOpen && searchQuery.length > 0 && (
        <Text style={styles.searchCount}>{filteredComments.length} 件ヒット</Text>
      )}

      {loading && comments.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>再読み込み</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredComments}
          keyExtractor={(item, i) => item.id + i}
          renderItem={({ item }) => {
            const isMine = myCommentIds.has(item.id)
            const isReplyToMe = !isMine && myCommentIds.size > 0 &&
              [...myCommentIds].some(id => item.body.includes(`>>${id}`))
            const histEntry = isMine
              ? myCommentEntries.find(h => h.commentId === item.id)
              : null
            const upvoteChange = histEntry
              ? Math.max(0, (item.upvoteCount ?? 0) - (histEntry.initialUpvotes ?? 0))
              : 0
            const isNew = prevMaxCommentIdRef.current != null &&
              Number(item.id) > Number(prevMaxCommentIdRef.current)
            return (
              <CommentItem
                comment={item}
                onVote={onCommentVote}
                votedType={getCommentVoted(item.id)}
                onAnchorTap={onAnchorTap}
                onHide={() => onHide(item.id)}
                onReply={() => onReply(item)}
                isMine={isMine}
                isReplyToMe={isReplyToMe}
                upvoteChange={upvoteChange}
                isNew={isNew}
              />
            )
          }}
          ListHeaderComponent={<ListHeader />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              tintColor={colors.primary}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : nextCursor ? (
              <View style={styles.loadingMore} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyComments}>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? `「${searchQuery}」に一致するコメントがありません`
                  : filter !== 'all'
                  ? `${filter === 'like' ? '好き派' : '嫌い派'}のコメントはありません`
                  : resultInfo === null
                  ? '投票後にコメントを閲覧できます'
                  : 'コメントがありません'}
              </Text>
            </View>
          }
        />
      )}

      {/* 画像拡大モーダル */}
      <Modal
        visible={zoomedIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomedIndex(null)}
      >
        <TouchableWithoutFeedback onPress={() => setZoomedIndex(null)}>
          <View style={styles.imageOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.imageModalContent}>
                {zoomedIndex !== null && (
                  <Image
                    source={{ uri: displayImages[zoomedIndex] }}
                    style={styles.zoomedImage}
                    resizeMode="contain"
                  />
                )}
                {displayImages.length > 1 && (
                  <View style={styles.imageNavRow}>
                    <TouchableOpacity
                      style={[styles.imageNavBtn, zoomedIndex === 0 && styles.imageNavBtnDisabled]}
                      onPress={() => setZoomedIndex(i => Math.max(0, i - 1))}
                      disabled={zoomedIndex === 0}
                    >
                      <FontIcon name="chevron-left" color={colors.white} size={20} />
                    </TouchableOpacity>
                    <Text style={styles.imageNavCount}>
                      {zoomedIndex + 1} / {displayImages.length}
                    </Text>
                    <TouchableOpacity
                      style={[styles.imageNavBtn, zoomedIndex === displayImages.length - 1 && styles.imageNavBtnDisabled]}
                      onPress={() => setZoomedIndex(i => Math.min(displayImages.length - 1, i + 1))}
                      disabled={zoomedIndex === displayImages.length - 1}
                    >
                      <FontIcon name="chevron-right" color={colors.white} size={20} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* アンカーポップアップ */}
      <Modal
        visible={anchorComment !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAnchorComment(null)}
      >
        <TouchableWithoutFeedback onPress={() => setAnchorComment(null)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.popupCard}>
                <View style={styles.popupHeader}>
                  <Text style={styles.popupTitle}>
                    #{anchorComment?.id}
                    {anchorComment?.author ? `  ${anchorComment.author}` : ''}
                    {anchorComment?.dateText ? `  ${anchorComment.dateText}` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => setAnchorComment(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.popupClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <View
                  style={[
                    styles.popupBorder,
                    {
                      borderLeftColor:
                        anchorComment?.type === 'like'
                          ? colors.like
                          : anchorComment?.type === 'dislike'
                          ? colors.dislike
                          : colors.border,
                    },
                  ]}
                >
                  <Text style={styles.popupBody}>{anchorComment?.body}</Text>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ブックマークフォルダ選択モーダル */}
      <Modal
        visible={bookmarkModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeBookmarkModal}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <TouchableWithoutFeedback onPress={closeBookmarkModal}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bookmarkModal}>
                <Text style={styles.bookmarkModalTitle}>ブックマーク</Text>

                {bookmarkFolders.length === 0 && !addingNewFolder && (
                  <Text style={styles.bookmarkEmpty}>フォルダがありません</Text>
                )}

                {bookmarkFolders.map((folder) => {
                  const inFolder = folder.items.some((i) => i.name === name)
                  return (
                    <TouchableOpacity
                      key={folder.id}
                      style={styles.bookmarkFolderRow}
                      onPress={() => {
                        if (inFolder) removeFromFolder(folder.id, name)
                        else addToFolder(folder.id, name, resultInfo?.imageUrl || paramImageUrl)
                      }}
                    >
                      <FontIcon
                        name={inFolder ? 'check-square' : 'square-o'}
                        color={inFolder ? colors.primary : colors.textMuted}
                        size={20}
                      />
                      <Text style={styles.bookmarkFolderName}>{folder.name}</Text>
                    </TouchableOpacity>
                  )
                })}

                {addingNewFolder ? (
                  <View style={styles.bookmarkNewFolderRow}>
                    <TextInput
                      style={styles.bookmarkNewFolderInput}
                      value={newFolderInput}
                      onChangeText={setNewFolderInput}
                      placeholder="フォルダ名..."
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleAddNewFolder}
                    />
                    <TouchableOpacity onPress={handleAddNewFolder}>
                      <Text style={styles.bookmarkNewFolderOk}>追加</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.bookmarkAddFolderBtn}
                    onPress={() => setAddingNewFolder(true)}
                  >
                    <FontIcon name="plus" color={colors.primary} size={13} />
                    <Text style={styles.bookmarkAddFolderText}>新規フォルダを作成</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.bookmarkCloseBtn} onPress={closeBookmarkModal}>
                  <Text style={styles.bookmarkCloseBtnText}>閉じる</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 44,
    alignItems: 'center',
  },
  navTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  personHeader: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  imageScroll: {
    marginBottom: 12,
  },
  imageScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  personImage: {
    width: IMG_SIZE,
    height: IMG_SIZE,
    borderRadius: 8,
  },
  imagePlaceholder: {
    backgroundColor: colors.card,
    marginBottom: 12,
  },
  personName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 14,
  },
  tag: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  voteBarContainer: {
    width: '100%',
    marginBottom: 16,
  },
  voteCount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  voteCountText: {
    fontSize: 12,
  },
  voteButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  voteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  likeBtn: {
    backgroundColor: colors.like,
  },
  dislikeBtn: {
    backgroundColor: colors.dislike,
  },
  voteBtnDisabled: {
    opacity: 0.4,
  },
  voteBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 4,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  filterLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  filterLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  filterIconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  filterIconBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  postBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  // スレ内検索バー
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
    backgroundColor: colors.card,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchCount: {
    color: colors.textMuted,
    fontSize: 11,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: colors.textSecondary,
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderRadius: 6,
  },
  retryText: {
    color: colors.primary,
    fontWeight: '600',
  },
  emptyComments: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  // 画像拡大モーダル
  imageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: {
    width: '100%',
    alignItems: 'center',
  },
  zoomedImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').width,
  },
  imageNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 24,
  },
  imageNavBtn: {
    padding: 12,
  },
  imageNavBtnDisabled: {
    opacity: 0.2,
  },
  imageNavCount: {
    color: colors.white,
    fontSize: 14,
  },
  // アンカーポップアップ
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  popupCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  popupTitle: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  popupClose: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  popupBorder: {
    borderLeftWidth: 3,
    paddingLeft: 10,
  },
  popupBody: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  keyboardAvoid: {
    flex: 1,
  },
  // ブックマークモーダル
  bookmarkModal: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 20,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  bookmarkModalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  bookmarkEmpty: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  bookmarkFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bookmarkFolderName: {
    color: colors.text,
    fontSize: 15,
  },
  bookmarkNewFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  bookmarkNewFolderInput: {
    flex: 1,
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  bookmarkNewFolderOk: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
    paddingHorizontal: 4,
  },
  bookmarkAddFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  bookmarkAddFolderText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  bookmarkCloseBtn: {
    marginTop: 8,
    paddingVertical: 10,
    backgroundColor: colors.background,
    borderRadius: 8,
    alignItems: 'center',
  },
  bookmarkCloseBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
})
