import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  Image,
  SectionList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { colors } from '../../theme'
import { useSettings } from '../../contexts/SettingsContext'

const THUMB_SIZE = 48
const VOTE_EXPIRE_MS = 24 * 60 * 60 * 1000

function formatRemaining(ms) {
  if (ms <= 0) return '再投票可能'
  const totalMins = Math.floor(ms / 60000)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours > 0) return `あと${hours}時間${mins}分`
  return `あと${mins}分`
}

function formatTime(timestamp) {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'たった今'
  if (mins < 60) return `${mins}分前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}時間前`
  const d = new Date(timestamp)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function Thumb({ uri }) {
  if (!uri) {
    return (
      <View style={[styles.thumb, styles.thumbPlaceholder]}>
        <FontIcon name="user" color={colors.textMuted} size={20} />
      </View>
    )
  }
  return <Image source={{ uri }} style={styles.thumb} />
}

export default function RevoteTab() {
  const navigation = useNavigation()
  const { getAllVotedRaw, getAllNotifyVote, getLastViewed, voteHistory } = useSettings()
  const [, setTick] = useState(0)

  useFocusEffect(
    useCallback(() => {
      setTick(t => t + 1)
      const id = setInterval(() => setTick(t => t + 1), 60000)
      return () => clearInterval(id)
    }, []),
  )

  const now = Date.now()
  const votedRaw = getAllVotedRaw()
  const notifyVote = getAllNotifyVote()

  // voteHistory から imageUrl を引く用のマップ
  const imageMap = {}
  for (const h of voteHistory) {
    if (!imageMap[h.name]) imageMap[h.name] = h.imageUrl
  }

  // 通知予定セクション
  const notifyNames = Object.keys(notifyVote)
  const notifyItems = notifyNames.map(name => {
    const entry = votedRaw[name]
    const votedAt = entry?.votedAt ?? 0
    const remaining = Math.max(0, VOTE_EXPIRE_MS - (now - votedAt))
    return {
      name,
      imageUrl: imageMap[name] || '',
      remaining,
      voteType: entry?.type,
    }
  }).sort((a, b) => a.remaining - b.remaining)

  // 再投票待ちセクション（24時間以内の投票のみ）
  const revoteItems = Object.entries(votedRaw)
    .filter(([, entry]) => {
      if (typeof entry === 'string') return false
      return now - entry.votedAt < VOTE_EXPIRE_MS
    })
    .map(([name, entry]) => {
      const remaining = Math.max(0, VOTE_EXPIRE_MS - (now - entry.votedAt))
      const lv = getLastViewed(name)
      return {
        name,
        imageUrl: imageMap[name] || '',
        voteType: entry.type,
        remaining,
        lastViewedAt: lv?.viewedAt ?? null,
      }
    })
    .sort((a, b) => a.remaining - b.remaining)

  const sections = [
    {
      key: 'notify',
      title: '通知予定',
      icon: 'bell',
      data: notifyItems,
      emptyText: '通知予定の人物はありません',
    },
    {
      key: 'revote',
      title: '再投票待ち',
      icon: 'clock-o',
      data: revoteItems,
      emptyText: '投票待ちの人物はありません',
    },
  ]

  const goToDetails = (name, imageUrl) => {
    navigation.navigate('Details', { name, imageUrl: imageUrl || undefined })
  }

  const renderSectionHeader = ({ section }) => (
    <View style={styles.sectionHeader}>
      <FontIcon name={section.icon} color={colors.primary} size={13} />
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  )

  const renderItem = ({ item, section }) => {
    const isLike = item.voteType === 'like'
    const remainingText = formatRemaining(item.remaining)
    const isReady = item.remaining <= 0

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => goToDetails(item.name, item.imageUrl)}
        activeOpacity={0.7}
      >
        <Thumb uri={item.imageUrl} />
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.rowMeta}>
            {item.voteType && (
              <View style={[styles.badge, isLike ? styles.badgeLike : styles.badgeDislike]}>
                <Text style={styles.badgeText}>{isLike ? '好き' : '嫌い'}</Text>
              </View>
            )}
            <Text style={[styles.remainingText, isReady && styles.remainingReady]}>
              {remainingText}
            </Text>
          </View>
          {section.key === 'notify' && (
            <View style={styles.notifyBadge}>
              <FontIcon name="bell" color={colors.primary} size={10} />
              <Text style={styles.notifyBadgeText}>通知ON</Text>
            </View>
          )}
          {section.key === 'revote' && item.lastViewedAt && (
            <Text style={styles.lastViewedText}>
              最終閲覧: {formatTime(item.lastViewedAt)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  const renderEmpty = ({ section }) => {
    if (section.data.length > 0) return null
    return (
      <View style={styles.emptySection}>
        <Text style={styles.emptyText}>{section.emptyText}</Text>
      </View>
    )
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item, index) => `${item.name}-${index}`}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      renderSectionFooter={renderEmpty}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.listContent}
    />
  )
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
  thumbPlaceholder: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeLike: {
    backgroundColor: colors.like + '33',
  },
  badgeDislike: {
    backgroundColor: colors.dislike + '33',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  remainingText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  remainingReady: {
    color: colors.like,
    fontWeight: '700',
  },
  notifyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notifyBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  lastViewedText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  emptySection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
})
