import React, { useState, useRef, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { useColors, useTheme } from '../../contexts/ThemeContext'
import { useSettings } from '../../contexts/SettingsContext'
import { version } from '../../config'
import * as Linking from 'expo-linking'
import { useNavigation } from '@react-navigation/native'

export default function Settings() {
  const navigation = useNavigation()
  const colors = useColors()
  const { isDark, setIsDark } = useTheme()
  const { ngWords, addNgWord, removeNgWord } = useSettings()
  const [input, setInput] = useState('')
  const tapCountRef = useRef(0)
  const tapTimerRef = useRef(null)
  const styles = useMemo(() => createStyles(colors), [colors])

  const handleAdd = () => {
    const word = input.trim()
    if (!word) return
    addNgWord(word)
    setInput('')
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>設定</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        {/* 外観セクション */}
        <Text style={styles.sectionTitle}>外観</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>ダークモード</Text>
          <Switch
            value={isDark}
            onValueChange={setIsDark}
            trackColor={{ false: '#ccc', true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.sectionDivider} />

        <Text style={styles.sectionTitle}>NGワード</Text>
        <Text style={styles.sectionDesc}>
          このワードを含むコメントは非表示になります
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="NGワードを入力"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
          <TouchableOpacity
            style={[styles.addBtn, !input.trim() && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={!input.trim()}
          >
            <Text style={styles.addBtnText}>追加</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={ngWords}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <View style={styles.wordRow}>
              <Text style={styles.wordText}>{item}</Text>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeNgWord(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <FontIcon name="times" color={colors.textSecondary} size={16} />
              </TouchableOpacity>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>NGワードは登録されていません</Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.about}>
              <View style={styles.aboutDivider} />
              <Text style={styles.aboutSectionTitle}>このアプリについて</Text>
              <Image
                source={require('../../../assets/images/logo-lg.png')}
                style={styles.aboutLogo}
                resizeMode="contain"
              />
              <Text style={styles.aboutAppName}>スキキラ</Text>
              <Text style={styles.aboutSubtitle}>for 好き嫌い.com</Text>
              <Text
                style={styles.aboutVersion}
                onPress={() => {
                  tapCountRef.current++
                  clearTimeout(tapTimerRef.current)
                  if (tapCountRef.current >= 5) {
                    tapCountRef.current = 0
                    navigation.navigate('WebViewTest')
                  } else {
                    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0 }, 2000)
                  }
                }}
              >バージョン {version}</Text>
              <View style={styles.aboutLinks}>
                <TouchableOpacity onPress={() => Linking.openURL('https://sukikira.pages.dev/terms.html')}>
                  <Text style={styles.aboutLink}>利用規約</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL('https://sukikira.pages.dev/privacy.html')}>
                  <Text style={styles.aboutLink}>プライバシーポリシー</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL('https://sukikira.pages.dev/support.html')}>
                  <Text style={styles.aboutLink}>サポート</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const createStyles = (colors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: 15,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  wordText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  removeBtn: {
    padding: 4,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  empty: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  about: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  aboutDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 24,
  },
  aboutSectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  aboutLogo: {
    width: 80,
    height: 80,
    borderRadius: 18,
    marginBottom: 8,
  },
  aboutAppName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  aboutSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  aboutVersion: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  aboutLinks: {
    marginTop: 20,
    gap: 12,
    alignItems: 'center',
  },
  aboutLink: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
})
