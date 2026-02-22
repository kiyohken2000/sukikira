import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import Search from '../../../scenes/search/Search'

const Stack = createStackNavigator()

export const SearchStacks = () => {
  return (
    <Stack.Navigator
      initialRouteName="Search"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Search" component={Search} />
    </Stack.Navigator>
  )
}
