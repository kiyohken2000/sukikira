import React, { useState, useEffect } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import 'utils/ignore'
import { SettingsProvider } from './contexts/SettingsContext'

// assets
import { imageAssets } from 'theme/images'
import { fontAssets } from 'theme/fonts'
import Router from './routes'

export default function App() {
  const [didLoad, setDidLoad] = useState(false)

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
      <SettingsProvider>
        <Router />
      </SettingsProvider>
    </SafeAreaProvider>
  )
}
