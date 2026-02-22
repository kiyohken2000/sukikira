import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import { TransitionPresets } from '@react-navigation/stack'
import TabNavigator from '../tabs/Tabs'
import Details from '../../../scenes/details/Details'
import Post from '../../../scenes/post/Post'

const Stack = createStackNavigator()

export default function RootStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="HomeRoot" component={TabNavigator} />
      <Stack.Screen
        name="Details"
        component={Details}
        options={{
          ...TransitionPresets.SlideFromRightIOS,
        }}
      />
      <Stack.Screen
        name="Post"
        component={Post}
        options={{
          presentation: 'modal',
          ...TransitionPresets.ModalPresentationIOS,
        }}
      />
    </Stack.Navigator>
  )
}
