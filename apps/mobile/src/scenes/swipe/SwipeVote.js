import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { colors } from '../../theme'
import { getRanking, vote } from '../../utils/sukikira'
import { useSettings } from '../../contexts/SettingsContext'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28
const CARD_WIDTH = SCREEN_WIDTH - 48

export default function SwipeVote() {
  const navigation = useNavigation()
  const { voted, recordVote } = useSettings()

  // ローカルキュー — voted の変化に影響されない
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)

  const currentItem = queue[0]
  const nextItem = queue[1]

  // アニメーション値
  const position = useRef(new Animated.ValueXY()).current

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-15deg', '0deg', '15deg'],
    extrapolate: 'clamp',
  })

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  const dislikeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })

  const nextCardScale = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: [1, 0.94, 1],
    extrapolate: 'clamp',
  })

  // キューを1つ進める。position リセットは React 再描画後に行い、フラッシュを防ぐ
  const advanceQueue = useCallback(() => {
    setQueue(prev => prev.slice(1))
    // requestAnimationFrame で React の再描画が終わってからリセット
    requestAnimationFrame(() => {
      position.setValue({ x: 0, y: 0 })
    })
  }, [position])

  const resetPosition = useCallback(() => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      friction: 5,
    }).start()
  }, [position])

  const swipeOut = useCallback((direction) => {
    if (voting || !currentItem) return
    setVoting(true)
    const x = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 280,
      useNativeDriver: false,
    }).start(async () => {
      const type = direction === 'right' ? 'like' : 'dislike'
      try {
        await vote(currentItem.name, type)
        recordVote(currentItem.name, type, currentItem.imageUrl)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } catch (e) {
        // スワイプモードではエラーを無視して次へ進む
      } finally {
        setVoting(false)
        advanceQueue()
      }
    })
  }, [voting, currentItem, position, recordVote, advanceQueue])

  // PanResponder は一度だけ作成。最新の swipeOut/resetPosition/voting は ref 経由で参照
  const swipeOutRef = useRef(swipeOut)
  swipeOutRef.current = swipeOut
  const resetPositionRef = useRef(resetPosition)
  resetPositionRef.current = resetPosition
  const votingRef = useRef(voting)
  votingRef.current = voting

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !votingRef.current,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5,
    onPanResponderMove: (_, gs) => {
      position.setValue({ x: gs.dx, y: gs.dy * 0.2 })
    },
    onPanResponderRelease: (_, gs) => {
      if (gs.dx > SWIPE_THRESHOLD) swipeOutRef.current('right')
      else if (gs.dx < -SWIPE_THRESHOLD) swipeOutRef.current('left')
      else resetPositionRef.current()
    },
  }), []) // 依存なし — ref 経由で最新値を参照

  useEffect(() => {
    const load = async () => {
      try {
        // like×3ページ + dislike×2ページ + trend×1ページ を並列取得（最大108件）
        const fetches = [
          getRanking('like', 1),
          getRanking('like', 2),
          getRanking('like', 3),
          getRanking('dislike', 1),
          getRanking('dislike', 2),
          getRanking('trend', 1),
        ]
        const results = await Promise.allSettled(fetches)

        // 重複除去しながらまとめる
        const seen = new Set()
        const all = []
        for (const r of results) {
          if (r.status !== 'fulfilled') continue
          for (const item of r.value.items) {
            if (!seen.has(item.name)) {
              seen.add(item.name)
              all.push(item)
            }
          }
        }

        // 未投票のみ残してシャッフル
        const unvoted = all.filter(item => !voted[item.name])
        for (let i = unvoted.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[unvoted[i], unvoted[j]] = [unvoted[j], unvoted[i]]
        }
        setQueue(unvoted)
      } catch (e) {
        console.warn('[SwipeVote] load error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, []) // マウント時1回のみ

  const skip = useCallback(() => {
    if (voting) return
    advanceQueue()
  }, [voting, advanceQueue])

  const cardStyle = {
    transform: [
      { translateX: position.x },
      { translateY: position.y },
      { rotate },
    ],
  }

  const done = !loading && queue.length === 0

  return (
    <SafeAreaView style={styles.root}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <FontIcon name="chevron-left" color={colors.text} size={18} />
        </TouchableOpacity>
        <Text style={styles.title}>スワイプ投票</Text>
        <Text style={styles.counter}>
          {loading ? '' : done ? '完了' : `残り ${queue.length} 人`}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : done ? (
        <View style={styles.center}>
          <FontIcon name="check-circle" color={colors.primary} size={56} />
          <Text style={styles.doneText}>未投票の人物がありません</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.doneBtnText}>戻る</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cardArea}>
          {/* 次のカード（背面） */}
          {nextItem && (
            <Animated.View style={[styles.card, { transform: [{ scale: nextCardScale }] }]}>
              <CardContent item={nextItem} />
            </Animated.View>
          )}

          {/* 現在のカード（前面・スワイプ可能） */}
          {currentItem && (
            <Animated.View style={[styles.card, cardStyle]} {...panResponder.panHandlers}>
              {/* 好きオーバーレイ */}
              <Animated.View style={[styles.overlay, styles.likeOverlay, { opacity: likeOpacity }]}>
                <Text style={styles.overlayLikeText}>好き！</Text>
              </Animated.View>
              {/* 嫌いオーバーレイ */}
              <Animated.View style={[styles.overlay, styles.dislikeOverlay, { opacity: dislikeOpacity }]}>
                <Text style={styles.overlayDislikeText}>嫌い！</Text>
              </Animated.View>
              <CardContent item={currentItem} />
            </Animated.View>
          )}
        </View>
      )}

      {/* ボタン行 */}
      {!loading && !done && (
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.dislikeBtn, voting && styles.btnDisabled]}
            onPress={() => swipeOut('left')}
            disabled={voting}
          >
            <FontIcon name="times" color={colors.white} size={28} />
            <Text style={styles.actionBtnLabel}>嫌い</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={skip}
            disabled={voting}
          >
            <FontIcon name="forward" color={colors.textMuted} size={18} />
            <Text style={styles.skipBtnLabel}>スキップ</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.likeBtn, voting && styles.btnDisabled]}
            onPress={() => swipeOut('right')}
            disabled={voting}
          >
            <FontIcon name="heart" color={colors.white} size={28} />
            <Text style={styles.actionBtnLabel}>好き</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !done && (
        <Text style={styles.hint}>← 嫌い　　好き →　でスワイプ</Text>
      )}
    </SafeAreaView>
  )
}

function CardContent({ item }) {
  return (
    <View style={styles.cardInner}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <FontIcon name="user" color={colors.textMuted} size={48} />
        </View>
      )}
      <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
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
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  counter: {
    width: 72,
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'right',
    paddingRight: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  doneText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  doneBtn: {
    backgroundColor: colors.card,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  doneBtnText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  cardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    backgroundColor: colors.card,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 20,
    alignItems: 'center',
  },
  cardImage: {
    width: CARD_WIDTH - 80,
    height: CARD_WIDTH - 80,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: colors.background,
  },
  cardImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderRadius: 16,
  },
  likeOverlay: {
    backgroundColor: colors.like + 'cc',
  },
  dislikeOverlay: {
    backgroundColor: colors.dislike + 'cc',
  },
  overlayLikeText: {
    color: colors.white,
    fontSize: 40,
    fontWeight: '900',
    transform: [{ rotate: '-15deg' }],
  },
  overlayDislikeText: {
    color: colors.white,
    fontSize: 40,
    fontWeight: '900',
    transform: [{ rotate: '15deg' }],
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 20,
  },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  likeBtn: {
    backgroundColor: colors.like,
  },
  dislikeBtn: {
    backgroundColor: colors.dislike,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  actionBtnLabel: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
  },
  skipBtn: {
    alignItems: 'center',
    padding: 12,
    gap: 2,
  },
  skipBtnLabel: {
    color: colors.textMuted,
    fontSize: 10,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 16,
  },
})
