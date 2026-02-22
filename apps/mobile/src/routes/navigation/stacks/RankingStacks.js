import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import Home from '../../../scenes/home/Home'

const Stack = createStackNavigator()

export const RankingStacks = () => {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Home" component={Home} />
    </Stack.Navigator>
  )
}
