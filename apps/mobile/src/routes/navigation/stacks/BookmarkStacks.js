import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import Bookmark from '../../../scenes/bookmark/Bookmark'
import BookmarkFolder from '../../../scenes/bookmark/BookmarkFolder'

const Stack = createStackNavigator()

export function BookmarkStacks() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Bookmark" component={Bookmark} />
      <Stack.Screen name="BookmarkFolder" component={BookmarkFolder} />
    </Stack.Navigator>
  )
}
