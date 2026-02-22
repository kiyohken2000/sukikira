import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import RootStack from './rootStack/RootStack'

export default function Navigation() {
  return (
    <NavigationContainer>
      <RootStack />
    </NavigationContainer>
  )
}
