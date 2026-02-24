import * as Notifications from 'expo-notifications'

// フォアグラウンドでも通知を表示
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

const VOTE_EXPIRE_MS = 24 * 60 * 60 * 1000 // 24時間

/**
 * 再投票通知をスケジュールし、通知IDを返す。
 * 権限が未許可なら要求する。期限切れ or 権限拒否なら null を返す。
 */
export async function scheduleVoteNotification(name, votedAt) {
  const triggerDate = votedAt + VOTE_EXPIRE_MS
  const now = Date.now()
  if (triggerDate <= now) return null

  try {
    const { status } = await Notifications.requestPermissionsAsync()
    if (status !== 'granted') return null

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '再投票可能',
        body: `${name} に再投票できるようになりました`,
      },
      trigger: {
        type: 'date',
        date: new Date(triggerDate),
      },
    })
    return id
  } catch (e) {
    console.warn('[notification] schedule error', e)
    return null
  }
}

/**
 * スケジュール済み通知をキャンセルする
 */
export async function cancelVoteNotification(notificationId) {
  if (!notificationId) return
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId)
  } catch (e) {
    console.warn('[notification] cancel error', e)
  }
}
