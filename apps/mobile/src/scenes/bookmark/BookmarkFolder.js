import React, { useRef } from 'react'
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

export default function BookmarkFolder() {
  const navigation = useNavigation()
  const route = useRoute()
  const { folderId, folderName } = route.params
  const { bookmarkFolders, removeFromFolder } = useSettings()
  const flatListRef = useRef(null)
  useScrollToTop(flatListRef)

  const folder = bookmarkFolders.find((f) => f.id === folderId)
  const items = folder?.items ?? []

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
    <SafeAreaView style={styles.root}>
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
        renderItem={({ item }) => (
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
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <FontIcon name="trash-o" color={colors.textMuted} size={18} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
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
  name: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: { color: colors.textMuted, fontSize: 14 },
})
