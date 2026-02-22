import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import FontIcon from 'react-native-vector-icons/FontAwesome'
import { colors } from '../../../theme'
import { RankingStacks } from '../stacks/RankingStacks'
import { SearchStacks } from '../stacks/SearchStacks'
import { SettingsStacks } from '../stacks/SettingsStacks'

const Tab = createBottomTabNavigator()

export default function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="RankingTab"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
      })}
    >
      <Tab.Screen
        name="RankingTab"
        component={RankingStacks}
        options={{
          tabBarLabel: 'ランキング',
          tabBarIcon: ({ color, size }) => (
            <FontIcon name="trophy" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchStacks}
        options={{
          tabBarLabel: '検索',
          tabBarIcon: ({ color, size }) => (
            <FontIcon name="search" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStacks}
        options={{
          tabBarLabel: '設定',
          tabBarIcon: ({ color, size }) => (
            <FontIcon name="cog" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}
