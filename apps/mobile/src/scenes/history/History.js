import React, { useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  Image,
  SectionList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useFocusEffect, useScrollToTop } from '@react-navigation/native'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { colors } from '../../theme'
import { useSettings } from '../../contexts/SettingsContext'
import RevoteTab from './RevoteTab'

const VOTE_EXPIRE_MS = 24 * 60 * 60 * 1000

const THUMB_SIZE = 48

function formatTime(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'たった今'
  if (mins < 60) return `${mins}分前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}時間前`
  const d = new Date(isoStr)
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

function VoteRow({ item, onPress, lastViewedText, revoteReady }) {
  const isLike = item.voteType === 'like'
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Thumb uri={item.imageUrl} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.rowMeta}>
          <View style={[styles.badge, isLike ? styles.badgeLike : styles.badgeDislike]}>
            <Text style={styles.badgeText}>{isLike ? '好き' : '嫌い'}</Text>
          </View>
          {revoteReady && (
            <View style={[styles.badge, styles.revoteBadge]}>
              <Text style={styles.badgeText}>再投票可</Text>
            </View>
          )}
          {lastViewedText && (
            <Text style={styles.lastViewedText}>{lastViewedText}</Text>
          )}
        </View>
      </View>
      <Text style={styles.timeText}>{formatTime(item.time)}</Text>
    </TouchableOpacity>
  )
}

function BrowseRow({ item, onPress, lastViewedText }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Thumb uri={item.imageUrl} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        {lastViewedText && (
          <Text style={styles.lastViewedText}>{lastViewedText}</Text>
        )}
      </View>
      <Text style={styles.timeText}>{formatTime(item.time)}</Text>
    </TouchableOpacity>
  )
}

function CommentRow({ item, onPress, lastViewedText }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.thumb, styles.thumbComment]}>
        <FontIcon name="comment" color={colors.textMuted} size={20} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowPreview} numberOfLines={2}>{item.body}</Text>
        {lastViewedText && (
          <Text style={styles.lastViewedText}>{lastViewedText}</Text>
        )}
      </View>
      <Text style={styles.timeText}>{formatTime(item.time)}</Text>
    </TouchableOpacity>
  )
}

const SUB_TABS = [
  { key: 'history', label: '履歴' },
  { key: 'revote', label: '再投票' },
]

export default function History() {
  const navigation = useNavigation()
  const { voteHistory, browseHistory, commentHistory, getLastViewed, getVotedAt } = useSettings()
  const sectionListRef = useRef(null)
  useScrollToTop(sectionListRef)
  const [activeTab, setActiveTab] = useState('history')
  const [, setTick] = useState(0)

  useFocusEffect(
    useCallback(() => {
      setTick(t => t + 1) // 残り時間・最終閲覧を再計算
    }, []),
  )

  const goToDetails = (name, imageUrl) => {
    navigation.navigate('Details', { name, imageUrl: imageUrl || undefined })
  }

  const sections = [
    {
      key: 'vote',
      title: '投票履歴',
      icon: 'thumbs-up',
      data: voteHistory,
    },
    {
      key: 'browse',
      title: '閲覧履歴',
      icon: 'clock-o',
      data: browseHistory,
    },
    {
      key: 'comment',
      title: 'コメント履歴',
      icon: 'comment',
      data: commentHistory,
    },
  ]

  const renderSectionHeader = ({ section }) => (
    <View style={styles.sectionHeader}>
      <FontIcon name={section.icon} color={colors.primary} size={13} />
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  )

  const renderItem = ({ item, section }) => {
    const lv = getLastViewed(item.name)
    const lvText = lv ? `最終閲覧: ${formatTime(new Date(lv.viewedAt).toISOString())}` : null
    if (section.key === 'vote') {
      const votedAt = getVotedAt(item.name)
      const revoteReady = votedAt != null && (Date.now() - votedAt) >= VOTE_EXPIRE_MS
      return (
        <VoteRow
          item={item}
          lastViewedText={lvText}
          revoteReady={revoteReady}
          onPress={() => goToDetails(item.name, item.imageUrl)}
        />
      )
    }
    if (section.key === 'browse') {
      return (
        <BrowseRow
          item={item}
          lastViewedText={lvText}
          onPress={() => goToDetails(item.name, item.imageUrl)}
        />
      )
    }
    return (
      <CommentRow
        item={item}
        lastViewedText={lvText}
        onPress={() => goToDetails(item.name, item.imageUrl)}
      />
    )
  }

  const renderEmpty = ({ section }) => {
    if (section.data.length > 0) return null
    return (
      <View style={styles.emptySection}>
        <Text style={styles.emptyText}>まだ{section.title}がありません</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>履歴</Text>
      </View>
      <View style={styles.tabBar}>
        {SUB_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {activeTab === 'history' ? (
        <SectionList
          ref={sectionListRef}
          sections={sections}
          keyExtractor={(item, index) => `${item.name}-${item.time}-${index}`}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          renderSectionFooter={renderEmpty}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <RevoteTab />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
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
  thumbComment: {
    backgroundColor: colors.card,
    borderRadius: THUMB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowPreview: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
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
  revoteBadge: {
    backgroundColor: '#a855f733',
    borderWidth: 1,
    borderColor: '#a855f766',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  timeText: {
    color: colors.textMuted,
    fontSize: 12,
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
