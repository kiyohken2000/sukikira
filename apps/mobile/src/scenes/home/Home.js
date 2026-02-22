import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { colors } from '../../theme'
import { getRanking } from '../../utils/sukikira'
import PersonCard from '../../components/PersonCard/PersonCard'

const TABS = [
  { key: 'like', label: '好感度' },
  { key: 'dislike', label: '不人気' },
  { key: 'trend', label: 'トレンド' },
]

export default function Home() {
  const navigation = useNavigation()
  const [activeTab, setActiveTab] = useState('like')
  // { [type]: item[] }
  const [data, setData] = useState({})
  // { [type]: number | null }  次ページ番号、null = 末尾
  const [nextPages, setNextPages] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async (type) => {
    setLoading(true)
    setError(null)
    try {
      const { items, nextPage } = await getRanking(type, 1)
      setData(prev => ({ ...prev, [type]: items }))
      setNextPages(prev => ({ ...prev, [type]: nextPage }))
    } catch (e) {
      console.error('[Home] getRanking error:', e)
      setError(`取得に失敗しました: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    const next = nextPages[activeTab]
    if (!next || loadingMore) return
    setLoadingMore(true)
    try {
      const { items, nextPage } = await getRanking(activeTab, next)
      setData(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] ?? []), ...items],
      }))
      setNextPages(prev => ({ ...prev, [activeTab]: nextPage }))
    } catch (e) {
      console.warn('[Home] loadMore error:', e)
    } finally {
      setLoadingMore(false)
    }
  }, [activeTab, nextPages, loadingMore])

  useFocusEffect(
    useCallback(() => {
      if (!data[activeTab]) {
        load(activeTab)
      }
    }, [activeTab, data, load]),
  )

  const onTabPress = (key) => {
    setActiveTab(key)
    if (!data[key]) load(key)
  }

  const items = data[activeTab] ?? []

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => onTabPress(tab.key)}
          >
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load(activeTab)}>
            <Text style={styles.retryText}>再読み込み</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.rank) + item.name}
          renderItem={({ item }) => (
            <PersonCard
              item={item}
              rank={item.rank}
              onPress={() => navigation.navigate('Details', { name: item.name, imageUrl: item.imageUrl })}
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => load(activeTab)}
              tintColor={colors.primary}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>データがありません</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: colors.textSecondary,
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderRadius: 6,
  },
  retryText: {
    color: colors.primary,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.textSecondary,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
})
