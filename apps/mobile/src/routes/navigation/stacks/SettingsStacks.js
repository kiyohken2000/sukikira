import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import Settings from '../../../scenes/settings/Settings'

const Stack = createStackNavigator()

export const SettingsStacks = () => {
  return (
    <Stack.Navigator
      initialRouteName="Settings"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Settings" component={Settings} />
    </Stack.Navigator>
  )
}
