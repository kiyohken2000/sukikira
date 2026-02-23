import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import History from '../../../scenes/history/History'

const Stack = createStackNavigator()

export const HistoryStacks = () => {
  return (
    <Stack.Navigator
      initialRouteName="History"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="History" component={History} />
    </Stack.Navigator>
  )
}
