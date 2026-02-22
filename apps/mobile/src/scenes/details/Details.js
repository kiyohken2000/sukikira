import React, { useState, useCallback, useMemo, useRef } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  Alert,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native'
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { colors } from '../../theme'
import { getComments, getMoreComments, vote, voteComment } from '../../utils/sukikira'
import { useSettings } from '../../contexts/SettingsContext'
import CommentItem from '../../components/CommentItem/CommentItem'
import VoteBar from '../../components/VoteBar/VoteBar'

const IMG_SIZE = 100

const FILTER_TABS = [
  { key: 'all', label: 'すべて' },
  { key: 'like', label: '好き派' },
  { key: 'dislike', label: '嫌い派' },
]

export default function Details() {
  const navigation = useNavigation()
  const route = useRoute()
  const { name, imageUrl: paramImageUrl } = route.params

  const { voted, recordVote, isNgComment, cacheResult, getCachedResult, recordCommentVote, getCommentVoted } = useSettings()
  const voteStatus = voted[name]

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

  // 表示する画像一覧
  const displayImages = useMemo(() => {
    if (resultInfo?.images?.length) return resultInfo.images
    const fallback = resultInfo?.imageUrl || paramImageUrl
    return fallback ? [fallback] : []
  }, [resultInfo, paramImageUrl])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { resultInfo: info, comments: cmts, nextCursor: cursor, notFound } = await getComments(name)
      if (notFound) {
        setError('この人物のページはsuki-kira.comに存在しません')
      } else if (info !== null) {
        setResultInfo(info)
        setComments(cmts)
        allCommentsRef.current = cmts
        setNextCursor(cursor)
        cacheResult(name, info, cmts)
      } else {
        const cached = getCachedResult(name)
        if (cached) {
          setResultInfo(cached.resultInfo)
          setComments(cached.comments)
          allCommentsRef.current = cached.comments
          setNextCursor(null)
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
      setNextCursor(cursor)
      recordVote(name, type)
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
      const { comments: more, nextCursor: next } = await getMoreComments(name, nextCursor)
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
  }, [name, nextCursor, loadingMore])

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
    navigation.navigate('Post', { name, replyTo: comment.id })
  }, [name, navigation])

  const filteredComments = useMemo(() => {
    return comments.filter((c) => {
      if (filter !== 'all' && c.type !== filter) return false
      if (isNgComment(c.body)) return false
      if (hiddenIds.has(c.id)) return false
      return true
    })
  }, [comments, filter, isNgComment, hiddenIds])

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
      </View>

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
        <TouchableOpacity
          style={styles.postBtn}
          onPress={() => navigation.navigate('Post', { name })}
        >
          <FontIcon name="pencil" color={colors.primary} size={16} />
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
        <View style={styles.backBtn} />
      </View>

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
          renderItem={({ item }) => (
            <CommentItem
              comment={item}
              onVote={onCommentVote}
              votedType={getCommentVoted(item.id)}
              onAnchorTap={onAnchorTap}
              onHide={() => onHide(item.id)}
              onReply={() => onReply(item)}
            />
          )}
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
                {filter === 'all' ? 'コメントがありません' : `${filter === 'like' ? '好き派' : '嫌い派'}のコメントはありません`}
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
  postBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
})
