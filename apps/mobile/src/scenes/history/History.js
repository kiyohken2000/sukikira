import React, { useRef } from 'react'
import {
  View,
  Text,
  Image,
  SectionList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useScrollToTop } from '@react-navigation/native'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { colors } from '../../theme'
import { useSettings } from '../../contexts/SettingsContext'

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

function VoteRow({ item, onPress }) {
  const isLike = item.voteType === 'like'
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Thumb uri={item.imageUrl} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <View style={[styles.badge, isLike ? styles.badgeLike : styles.badgeDislike]}>
          <Text style={styles.badgeText}>{isLike ? '好き' : '嫌い'}</Text>
        </View>
      </View>
      <Text style={styles.timeText}>{formatTime(item.time)}</Text>
    </TouchableOpacity>
  )
}

function BrowseRow({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Thumb uri={item.imageUrl} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
      </View>
      <Text style={styles.timeText}>{formatTime(item.time)}</Text>
    </TouchableOpacity>
  )
}

function CommentRow({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.thumb, styles.thumbComment]}>
        <FontIcon name="comment" color={colors.textMuted} size={20} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowPreview} numberOfLines={2}>{item.body}</Text>
      </View>
      <Text style={styles.timeText}>{formatTime(item.time)}</Text>
    </TouchableOpacity>
  )
}

export default function History() {
  const navigation = useNavigation()
  const { voteHistory, browseHistory, commentHistory } = useSettings()
  const sectionListRef = useRef(null)
  useScrollToTop(sectionListRef)

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
    if (section.key === 'vote') {
      return (
        <VoteRow
          item={item}
          onPress={() => goToDetails(item.name, item.imageUrl)}
        />
      )
    }
    if (section.key === 'browse') {
      return (
        <BrowseRow
          item={item}
          onPress={() => goToDetails(item.name, item.imageUrl)}
        />
      )
    }
    return (
      <CommentRow
        item={item}
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
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>履歴</Text>
      </View>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
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
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  timeText: {
    color: colors.textMuted,
    fontSize: 12,
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
