import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActionSheetIOS,
  Alert,
  Linking,
  Platform,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { colors } from '../../theme'

// URL 検出正規表現
const URL_REGEX = /https?:\/\/[^\s\u3000-\u9FFF\uFF00-\uFFEF]+/g
// アンカー検出正規表現: >>NNN
const ANCHOR_REGEX = />>\d+/g

/**
 * 本文テキストを segments に分解する
 * segment: { type: 'text' | 'anchor' | 'url', text: string, refId?: string }
 */
const parseBodySegments = (body) => {
  if (!body) return [{ type: 'text', text: '' }]

  const segments = []
  // アンカー・URLのパターンをまとめて処理
  const combined = /(?:>>\d+)|(?:https?:\/\/[^\s\u3000-\u9FFF\uFF00-\uFFEF]+)/g
  let last = 0
  let m

  while ((m = combined.exec(body)) !== null) {
    if (m.index > last) {
      segments.push({ type: 'text', text: body.slice(last, m.index) })
    }
    const matched = m[0]
    if (matched.startsWith('>>')) {
      segments.push({ type: 'anchor', text: matched, refId: matched.slice(2) })
    } else {
      segments.push({ type: 'url', text: matched })
    }
    last = m.index + matched.length
  }
  if (last < body.length) {
    segments.push({ type: 'text', text: body.slice(last) })
  }
  return segments
}

/**
 * コメント1件
 *
 * @param {{ id, body, type, upvoteCount, downvoteCount, token, author, dateText }} comment
 * @param {(commentId, voteType, token) => void} onVote
 * @param {'like'|'dislike'|null} votedType
 * @param {(refId: string) => void} onAnchorTap
 * @param {() => void} onHide
 * @param {() => void} onReply
 */
export default function CommentItem({
  comment,
  onVote,
  votedType = null,
  onAnchorTap,
  onHide,
  onReply,
}) {
  const [voted, setVoted] = useState(votedType)
  const [likes, setLikes] = useState(comment.upvoteCount ?? 0)
  const [dislikes, setDislikes] = useState(comment.downvoteCount ?? 0)

  const borderColor =
    comment.type === 'like'
      ? colors.like
      : comment.type === 'dislike'
      ? colors.dislike
      : colors.border

  const handleVote = (type) => {
    if (voted) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setVoted(type)
    if (type === 'like') setLikes((n) => n + 1)
    else setDislikes((n) => n + 1)
    onVote?.(comment.id, type, comment.token)
  }

  const handleMenu = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['キャンセル', '返信', '非表示', '通報'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 3,
        },
        (idx) => {
          if (idx === 1) onReply?.()
          else if (idx === 2) onHide?.()
          else if (idx === 3) {
            Alert.alert('通報', `コメント #${comment.id} を通報しますか？`, [
              { text: 'キャンセル', style: 'cancel' },
              { text: '通報する', style: 'destructive', onPress: () => {} },
            ])
          }
        },
      )
    } else {
      Alert.alert('メニュー', undefined, [
        { text: '返信', onPress: () => onReply?.() },
        { text: '非表示', onPress: () => onHide?.() },
        {
          text: '通報',
          style: 'destructive',
          onPress: () =>
            Alert.alert('通報', `コメント #${comment.id} を通報しますか？`, [
              { text: 'キャンセル', style: 'cancel' },
              { text: '通報する', style: 'destructive', onPress: () => {} },
            ]),
        },
        { text: 'キャンセル', style: 'cancel' },
      ])
    }
  }, [comment.id, onReply, onHide])

  const segments = parseBodySegments(comment.body)
  const hasVoteData = !!comment.token
  const total = likes + dislikes
  const likePct = total > 0 ? (likes / total) * 100 : 50

  return (
    <View style={[styles.container, { borderLeftColor: borderColor }]}>
      {/* ヘッダー行 */}
      <View style={styles.header}>
        <Text style={styles.meta} numberOfLines={1}>
          <Text style={styles.commentId}>{comment.id}. </Text>
          <Text style={styles.author}>{comment.author ?? '匿名'}</Text>
          {comment.dateText ? (
            <Text style={styles.date}>{'  '}{comment.dateText}</Text>
          ) : null}
        </Text>
        <TouchableOpacity
          onPress={handleMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.menuBtn}
        >
          <Text style={styles.menuIcon}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* 本文 (アンカー・URLは色付きで表示) */}
      <Text style={styles.body}>
        {segments.map((seg, i) => {
          if (seg.type === 'anchor') {
            return (
              <Text
                key={i}
                style={styles.anchor}
                onPress={() => onAnchorTap?.(seg.refId)}
              >
                {seg.text}
              </Text>
            )
          }
          if (seg.type === 'url') {
            return (
              <Text
                key={i}
                style={styles.link}
                onPress={() => Linking.openURL(seg.text).catch(() => {})}
              >
                {seg.text}
              </Text>
            )
          }
          return <Text key={i}>{seg.text}</Text>
        })}
      </Text>

      {/* upvote/downvote バー */}
      {hasVoteData && (
        <View style={styles.voteArea}>
          <TouchableOpacity
            style={[styles.voteSide, styles.voteLike, voted === 'like' && styles.votedLike]}
            onPress={() => handleVote('like')}
            disabled={!!voted}
          >
            <Text style={[styles.voteCount, { color: voted === 'like' ? '#fff' : colors.like }]}>
              ▲ {likes}
            </Text>
          </TouchableOpacity>
          {/* 比率バー */}
          <View style={styles.barTrack}>
            <View style={[styles.barLike, { flex: likePct }]} />
            <View style={[styles.barDislike, { flex: 100 - likePct }]} />
          </View>
          <TouchableOpacity
            style={[styles.voteSide, styles.voteDislike, voted === 'dislike' && styles.votedDislike]}
            onPress={() => handleVote('dislike')}
            disabled={!!voted}
          >
            <Text style={[styles.voteCount, { color: voted === 'dislike' ? '#fff' : colors.dislike }]}>
              ▼ {dislikes}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    marginHorizontal: 12,
    marginVertical: 3,
    borderRadius: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  meta: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
  },
  commentId: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  author: {
    color: colors.textSecondary,
  },
  date: {
    color: colors.textMuted,
  },
  menuBtn: {
    paddingLeft: 8,
  },
  menuIcon: {
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 18,
  },
  body: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 7,
  },
  anchor: {
    color: colors.primary,
    fontWeight: '600',
  },
  link: {
    color: '#60a5fa',
    textDecorationLine: 'underline',
  },
  // vote bar
  voteArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 22,
  },
  voteSide: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    minWidth: 44,
    alignItems: 'center',
  },
  voteLike: {
    borderWidth: 1,
    borderColor: colors.like,
  },
  voteDislike: {
    borderWidth: 1,
    borderColor: colors.dislike,
  },
  votedLike: {
    backgroundColor: colors.like,
  },
  votedDislike: {
    backgroundColor: colors.dislike,
  },
  voteCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    height: 4,
    flexDirection: 'row',
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  barLike: {
    backgroundColor: colors.like,
  },
  barDislike: {
    backgroundColor: colors.dislike,
  },
})
