import React, { useState } from 'react'
import {
  View,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Keyboard,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { colors } from '../../theme'
import { search } from '../../utils/sukikira'
import PersonCard from '../../components/PersonCard/PersonCard'

export default function Search() {
  const navigation = useNavigation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)

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
    <SafeAreaView style={styles.root}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="人物名を検索..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          onSubmitEditing={onSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
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
          data={results}
          keyExtractor={(item, i) => item.name + i}
          renderItem={({ item }) => (
            <PersonCard
              item={item}
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    margin: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
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
