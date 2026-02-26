import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { StatusBar } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { darkColors, lightColors } from '../theme/colors'

const STORAGE_KEY = '@sukikira:isDark'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [isDark, setIsDarkState] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val !== null) setIsDarkState(val !== 'false')
      setLoaded(true)
    })
  }, [])

  const setIsDark = (value) => {
    setIsDarkState(value)
    AsyncStorage.setItem(STORAGE_KEY, String(value))
  }

  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark])

  if (!loaded) return null

  return (
    <ThemeContext.Provider value={{ isDark, setIsDark, colors }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

export function useColors() {
  const ctx = useContext(ThemeContext)
  return ctx.colors
}
