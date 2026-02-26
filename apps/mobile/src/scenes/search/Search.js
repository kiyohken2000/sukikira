import React, { useState, useCallback, useMemo, useRef } from 'react'
import {
  View,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Keyboard,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useFocusEffect, useScrollToTop } from '@react-navigation/native'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { useColors } from '../../contexts/ThemeContext'
import { search } from '../../utils/sukikira'
import PersonCard from '../../components/PersonCard/PersonCard'
import { useSettings } from '../../contexts/SettingsContext'

const VOTE_EXPIRE_MS = 24 * 60 * 60 * 1000 // 24時間

function getRemainingMs(getVotedAt, name) {
  const votedAt = getVotedAt(name)
  if (!votedAt) return undefined
  const remaining = votedAt + VOTE_EXPIRE_MS - Date.now()
  return remaining > 0 ? remaining : 0
}

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

function getLastViewedText(getLastViewed, name) {
  const lv = getLastViewed(name)
  if (!lv) return undefined
  return `最終閲覧: ${formatTimeAgo(Date.now() - lv.viewedAt)}`
}

export default function Search() {
  const navigation = useNavigation()
  const colors = useColors()
  const { voted, commentHistory, getVotedAt, getLastViewed } = useSettings()
  const commentedNames = useMemo(
    () => new Set(commentHistory.map(h => h.name)),
    [commentHistory],
  )
  const flatListRef = useRef(null)
  useScrollToTop(flatListRef)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const [, setTick] = useState(0)

  const styles = useMemo(() => createStyles(colors), [colors])

  useFocusEffect(
    useCallback(() => {
      setTick(t => t + 1) // 残り時間・最終閲覧を再計算
    }, []),
  )

  const onClear = () => {
    setQuery('')
    setResults([])
    setError(null)
    setSearched(false)
    Keyboard.dismiss()
  }

  const onSearch = async () => {
    if (!query.trim()) return
    Keyboard.dismiss()
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const items = await search(query.trim())
      setResults(items)
    } catch (e) {
      setError('検索に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.searchBar}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, (query.length > 0 || searched) && styles.inputWithClear]}
            value={query}
            onChangeText={setQuery}
            placeholder="人物名を検索..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={onSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {(query.length > 0 || searched) && (
            <TouchableOpacity style={styles.clearBtn} onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <FontIcon name="times-circle" color={colors.textMuted} size={16} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={onSearch}>
          <Text style={styles.searchBtnText}>検索</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={results}
          keyExtractor={(item, i) => item.name + i}
          renderItem={({ item }) => (
            <PersonCard
              item={item}
              votedType={voted[item.name]}
              commented={commentedNames.has(item.name)}
              remainingMs={getRemainingMs(getVotedAt, item.name)}
              lastViewedText={getLastViewedText(getLastViewed, item.name)}
              onPress={() => navigation.navigate('Details', { name: item.name, imageUrl: item.imageUrl })}
            />
          )}
          ListEmptyComponent={
            searched ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>「{query}」の結果が見つかりませんでした</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <Text style={styles.hintText}>人物名で検索できます</Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    margin: 12,
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputWithClear: {
    paddingRight: 36,
  },
  clearBtn: {
    position: 'absolute',
    right: 10,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  searchBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  errorText: {
    color: colors.textSecondary,
  },
  emptyText: {
    color: colors.textSecondary,
  },
  hintText: {
    color: colors.textMuted,
  },
})
