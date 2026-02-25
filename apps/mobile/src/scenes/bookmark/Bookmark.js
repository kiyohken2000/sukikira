import React, { useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useScrollToTop } from '@react-navigation/native'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { colors } from '../../theme'
import { useSettings } from '../../contexts/SettingsContext'

export default function Bookmark() {
  const navigation = useNavigation()
  const { bookmarkFolders, addBookmarkFolder, removeBookmarkFolder } = useSettings()
  const flatListRef = useRef(null)
  useScrollToTop(flatListRef)

  const totalCount = React.useMemo(() => {
    const seen = new Set()
    for (const f of bookmarkFolders) {
      for (const item of f.items) seen.add(item.name)
    }
    return seen.size
  }, [bookmarkFolders])

  const [modalVisible, setModalVisible] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  const handleCreate = () => {
    if (!newFolderName.trim()) return
    addBookmarkFolder(newFolderName.trim())
    setNewFolderName('')
    setModalVisible(false)
  }

  const handleDelete = (folder) => {
    Alert.alert(
      `「${folder.name}」を削除`,
      `フォルダと${folder.items.length}件のブックマークを削除します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => removeBookmarkFolder(folder.id) },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ブックマーク</Text>
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <FontIcon name="plus" color={colors.primary} size={20} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={bookmarkFolders}
        keyExtractor={(f) => f.id}
        ListHeaderComponent={totalCount > 0 ? (
          <TouchableOpacity
            style={styles.folderRow}
            onPress={() =>
              navigation.navigate('BookmarkFolder', { folderId: '__all__', folderName: 'すべてのブックマーク' })
            }
            activeOpacity={0.7}
          >
            <FontIcon name="bookmark" color={colors.primary} size={22} />
            <View style={styles.folderBody}>
              <Text style={styles.folderName}>すべて</Text>
              <Text style={styles.folderCount}>{totalCount}件</Text>
            </View>
            <FontIcon name="chevron-right" color={colors.textMuted} size={16} />
          </TouchableOpacity>
        ) : null}
        renderItem={({ item: folder }) => (
          <TouchableOpacity
            style={styles.folderRow}
            onPress={() =>
              navigation.navigate('BookmarkFolder', { folderId: folder.id, folderName: folder.name })
            }
            activeOpacity={0.7}
          >
            <FontIcon name="folder" color={colors.primary} size={22} />
            <View style={styles.folderBody}>
              <Text style={styles.folderName}>{folder.name}</Text>
              <Text style={styles.folderCount}>{folder.items.length}件</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleDelete(folder)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <FontIcon name="trash-o" color={colors.textMuted} size={18} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <FontIcon name="bookmark-o" color={colors.textMuted} size={52} />
            <Text style={styles.emptyText}>フォルダがありません</Text>
            <Text style={styles.emptyHint}>右上の ＋ でフォルダを作成できます</Text>
          </View>
        }
      />

      {/* 新規フォルダ作成モーダル */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modal}>
                <Text style={styles.modalTitle}>新規フォルダ</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder="フォルダ名（例：俳優）"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                />
                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => { setModalVisible(false); setNewFolderName('') }}
                  >
                    <Text style={styles.modalCancelText}>キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalOkBtn} onPress={handleCreate}>
                    <Text style={styles.modalOkText}>作成</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 14,
  },
  folderBody: { flex: 1 },
  folderName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  folderCount: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: { color: colors.textSecondary, fontSize: 16 },
  emptyHint: { color: colors.textMuted, fontSize: 13 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 32,
  },
  modal: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 20,
    gap: 16,
  },
  modalTitle: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  modalInput: {
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600' },
  modalOkBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  modalOkText: { color: colors.white, fontWeight: '700' },
})
