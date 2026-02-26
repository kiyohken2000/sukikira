import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useColors } from '../../contexts/ThemeContext'

/**
 * 好き/嫌い割合バー
 * @param {string} likePercent  - 好き割合（例: "62.5"）
 * @param {string} dislikePercent
 * @param {boolean} large - 大きく表示するか（人物詳細画面用）
 */
export default function VoteBar({ likePercent = '0', dislikePercent = '0', large = false }) {
  const colors = useColors()
  const styles = useMemo(() => createStyles(colors), [colors])
  const like = parseFloat(likePercent) || 0
  const dislike = parseFloat(dislikePercent) || 0

  return (
    <View>
      <View style={styles.bar}>
        <View style={[styles.likeBar, { flex: like }]} />
        <View style={[styles.dislikeBar, { flex: dislike }]} />
      </View>
      <View style={styles.labels}>
        <Text style={[styles.likeText, large && styles.largeText]}>
          好き {like.toFixed(1)}%
        </Text>
        <Text style={[styles.dislikeText, large && styles.largeText]}>
          嫌い {dislike.toFixed(1)}%
        </Text>
      </View>
    </View>
  )
}

const createStyles = (colors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  likeBar: {
    backgroundColor: colors.like,
  },
  dislikeBar: {
    backgroundColor: colors.dislike,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  likeText: {
    color: colors.like,
    fontSize: 11,
  },
  dislikeText: {
    color: colors.dislike,
    fontSize: 11,
  },
  largeText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
