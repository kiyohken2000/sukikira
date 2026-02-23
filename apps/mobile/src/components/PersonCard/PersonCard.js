import React from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { colors } from '../../theme'
import VoteBar from '../VoteBar/VoteBar'

/**
 * 人物カード（ランキング・検索結果共通）
 * @param {'like'|'dislike'|undefined} votedType — 投票済み種別
 * @param {boolean} commented — コメント投稿済み
 */
export default function PersonCard({ item, onPress, rank, votedType, commented }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {rank !== undefined && (
        <Text style={styles.rank}>#{rank}</Text>
      )}
      <View style={styles.imageWrap}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {item.likePercent ? (
          <VoteBar likePercent={item.likePercent} dislikePercent={item.dislikePercent} />
        ) : null}
      </View>
      <View style={styles.badges}>
        {votedType && (
          <View style={[styles.badge, votedType === 'like' ? styles.votedLike : styles.votedDislike]}>
            <Text style={styles.badgeText}>
              {votedType === 'like' ? '好き済' : '嫌い済'}
            </Text>
          </View>
        )}
        {commented && (
          <View style={[styles.badge, styles.commentedBadge]}>
            <Text style={styles.badgeText}>コメ済</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    marginHorizontal: 12,
    marginVertical: 5,
    padding: 10,
  },
  rank: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    width: 30,
    textAlign: 'center',
  },
  imageWrap: {
    marginRight: 10,
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  imagePlaceholder: {
    backgroundColor: colors.border,
  },
  info: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  badges: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    marginLeft: 8,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  votedLike: {
    backgroundColor: colors.like + '33',
    borderWidth: 1,
    borderColor: colors.like + '66',
  },
  votedDislike: {
    backgroundColor: colors.dislike + '33',
    borderWidth: 1,
    borderColor: colors.dislike + '66',
  },
  commentedBadge: {
    backgroundColor: '#22c55e33',
    borderWidth: 1,
    borderColor: '#22c55e66',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
})
