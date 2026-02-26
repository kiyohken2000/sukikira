import React, { useState, useEffect } from 'react'
import { Platform, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Purchases from 'react-native-purchases'
import 'utils/ignore'
import { ThemeProvider } from './contexts/ThemeContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { RC_API_KEY_IOS, RC_API_KEY_ANDROID } from './config/revenuecat'

// assets
import { imageAssets } from 'theme/images'
import { fontAssets } from 'theme/fonts'
import Router from './routes'

let rcConfigured = false

export default function App() {
  const [didLoad, setDidLoad] = useState(false)

  useEffect(() => {
    if (!rcConfigured) {
      rcConfigured = true
      Purchases.configure({
        apiKey: Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID,
      })
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      await Promise.all([...imageAssets, ...fontAssets])
      setDidLoad(true)
    }
    load()
  }, [])

  if (!didLoad) return <View />

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SettingsProvider>
          <Router />
        </SettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
