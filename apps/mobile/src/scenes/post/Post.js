import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { colors } from '../../theme'
import { postComment } from '../../utils/sukikira'
import { useSettings } from '../../contexts/SettingsContext'

const MAX_LENGTH = 200

export default function Post() {
  const navigation = useNavigation()
  const route = useRoute()
  const { name, replyTo } = route.params
  const { cacheResult, voted, recordComment } = useSettings()

  // 投票済みの種別から初期タイプを決定 ('like'→好き派='1', 'dislike'→嫌い派='0')
  const voteStatus = voted[name]
  const defaultType = voteStatus === 'dislike' ? '0' : '1'

  const [body, setBody] = useState(replyTo ? `>>${replyTo}\n` : '')
  const [loading, setLoading] = useState(false)

  const onSubmit = async () => {
    if (!body.trim()) return
    setLoading(true)
    try {
      const result = await postComment(name, body.trim(), defaultType)
      // 投稿結果をキャッシュに保存してから戻る（新しいDetailsをpushしない）
      cacheResult(name, result.resultInfo, result.comments)
      // 自分のコメントIDを特定して記録
      const trimmedBody = body.trim()
      const coreBody = trimmedBody.replace(/^>>\d+\n?/, '').slice(0, 30)
      const matched = result.comments.find(c => c.body === trimmedBody || (coreBody && c.body.includes(coreBody)))
      recordComment(name, trimmedBody, matched?.id ?? null, matched?.upvoteCount ?? 0, matched?.downvoteCount ?? 0)
      Alert.alert('投稿完了', 'コメントを投稿しました', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ])
    } catch (e) {
      Alert.alert('エラー', '投稿に失敗しました。しばらくしてから再試行してください。')
    } finally {
      setLoading(false)
    }
  }

  const remaining = MAX_LENGTH - body.length

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ヘッダー */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <FontIcon name="times" color={colors.text} size={20} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{name} にコメント</Text>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!body.trim() || loading) && styles.submitBtnDisabled,
            ]}
            onPress={onSubmit}
            disabled={!body.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.submitBtnText}>投稿</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 派閥バッジ */}
        <View style={[styles.typeBadgeRow, voteStatus === 'dislike' ? styles.typeBadgeDislike : styles.typeBadgeLike]}>
          <Text style={styles.typeBadgeText}>
            {voteStatus === 'dislike' ? '嫌い派' : '好き派'} としてコメント
          </Text>
        </View>

        {/* 入力エリア */}
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          placeholder="コメントを入力..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={MAX_LENGTH}
          autoFocus
          textAlignVertical="top"
        />

        {/* 文字数カウンター */}
        <View style={styles.footer}>
          <Text style={[styles.counter, remaining < 20 && styles.counterWarn]}>
            {remaining}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeBtn: {
    padding: 4,
    width: 36,
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 52,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  typeBadgeRow: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  typeBadgeLike: {
    borderLeftWidth: 3,
    borderLeftColor: colors.like,
  },
  typeBadgeDislike: {
    borderLeftWidth: 3,
    borderLeftColor: colors.dislike,
  },
  typeBadgeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    padding: 16,
  },
  footer: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  counter: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  counterWarn: {
    color: colors.like,
  },
})
