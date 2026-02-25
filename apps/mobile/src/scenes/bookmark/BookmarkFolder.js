import React, { useRef, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute, useScrollToTop } from '@react-navigation/native'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { colors } from '../../theme'
import { useSettings } from '../../contexts/SettingsContext'

const THUMB_SIZE = 52
const VOTE_EXPIRE_MS = 24 * 60 * 60 * 1000
const TWO_HOURS = 2 * 60 * 60 * 1000

function formatTimeAgo(ms) {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  return `${days}日前`
}

function getRemainingMs(getVotedAt, name) {
  const votedAt = getVotedAt(name)
  if (!votedAt) return undefined
  const remaining = votedAt + VOTE_EXPIRE_MS - Date.now()
  return remaining > 0 ? remaining : 0
}

function formatRemaining(ms) {
  if (ms <= 0 || ms >= TWO_HOURS) return null
  const totalMin = Math.ceil(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `あと${h}時間${m}分`
  return `あと${m}分`
}

export default function BookmarkFolder() {
  const navigation = useNavigation()
  const route = useRoute()
  const { folderId, folderName } = route.params
  const { bookmarkFolders, removeFromFolder, voted, commentHistory, getVotedAt, getLastViewed } = useSettings()
  const flatListRef = useRef(null)
  useScrollToTop(flatListRef)

  const commentedNames = useMemo(() => {
    const set = new Set()
    for (const entry of commentHistory) set.add(entry.name)
    return set
  }, [commentHistory])

  const isAll = folderId === '__all__'
  const items = React.useMemo(() => {
    if (!isAll) {
      const folder = bookmarkFolders.find((f) => f.id === folderId)
      return folder?.items ?? []
    }
    const seen = new Set()
    const result = []
    for (const f of bookmarkFolders) {
      for (const item of f.items) {
        if (!seen.has(item.name)) {
          seen.add(item.name)
          result.push(item)
        }
      }
    }
    return result
  }, [isAll, folderId, bookmarkFolders])

  const handleDelete = (item) => {
    Alert.alert(
      `「${item.name}」を削除`,
      'このフォルダから削除します。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => removeFromFolder(folderId, item.name) },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.navHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <FontIcon name="chevron-left" color={colors.text} size={18} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{folderName}</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => {
          const votedType = voted[item.name]
          const isCommented = commentedNames.has(item.name)
          const remaining = getRemainingMs(getVotedAt, item.name)
          const remainingText = remaining != null ? formatRemaining(remaining) : null
          const lastViewed = getLastViewed(item.name)
          const lastViewedText = lastViewed ? `最終閲覧: ${formatTimeAgo(Date.now() - lastViewed.viewedAt)}` : null
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('Details', { name: item.name, imageUrl: item.imageUrl })}
              activeOpacity={0.7}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <FontIcon name="user" color={colors.textMuted} size={22} />
                </View>
              )}
              <View style={styles.nameArea}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <View style={styles.badges}>
                  {votedType && (
                    <View style={[styles.badge, votedType === 'like' ? styles.votedLike : styles.votedDislike]}>
                      <Text style={styles.badgeText}>{votedType === 'like' ? '好き済' : '嫌い済'}</Text>
                    </View>
                  )}
                  {isCommented && (
                    <View style={[styles.badge, styles.commentedBadge]}>
                      <Text style={styles.badgeText}>コメ済</Text>
                    </View>
                  )}
                  {remaining === 0 && (
                    <View style={[styles.badge, styles.revoteBadge]}>
                      <Text style={styles.badgeText}>再投票可</Text>
                    </View>
                  )}
                  {remainingText && (
                    <Text style={styles.remainingText}>{remainingText}</Text>
                  )}
                  {lastViewedText && (
                    <Text style={styles.lastViewedText}>{lastViewedText}</Text>
                  )}
                </View>
              </View>
              {!isAll && (
                <TouchableOpacity
                  onPress={() => handleDelete(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <FontIcon name="trash-o" color={colors.textMuted} size={18} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>ブックマークがありません</Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 44, alignItems: 'center' },
  navTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameArea: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
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
  revoteBadge: {
    backgroundColor: '#a855f733',
    borderWidth: 1,
    borderColor: '#a855f766',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
  },
  remainingText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  lastViewedText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  empty: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: { color: colors.textMuted, fontSize: 14 },
})
