import React from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { colors } from '../../theme'
import VoteBar from '../VoteBar/VoteBar'

/**
 * 人物カード（ランキング・検索結果共通）
 */
export default function PersonCard({ item, onPress, rank }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {rank !== undefined && (
        <Text style={styles.rank}>#{rank}</Text>
      )}
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {item.likePercent ? (
          <VoteBar likePercent={item.likePercent} dislikePercent={item.dislikePercent} />
        ) : null}
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
  image: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 10,
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
})
