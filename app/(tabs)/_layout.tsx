import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { ThemeNavBar } from '@/components/theme-nav-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/lib/theme-provider';

const isWeb = Platform.OS === 'web';

export default function TabLayout() {
  const { colors, fonts } = useTheme();
  return (
    <Tabs
      // Web: render the custom marketing-style nav bar (brand + menu +
      // actions) per /preview/<theme>.html. Native: fall back to the
      // default bottom tab bar — users expect that on phones.
      tabBar={isWeb ? (props) => <ThemeNavBar {...props} /> : undefined}
      screenOptions={{
        tabBarPosition: isWeb ? 'top' : 'bottom',
        tabBarActiveTintColor: colors.rust,
        tabBarInactiveTintColor: colors.inkFaint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: isWeb
          ? undefined
          : {
              backgroundColor: colors.paper,
              borderTopColor: colors.paperEdge,
              borderTopWidth: 1,
              paddingTop: 6,
              height: 86,
            },
        tabBarLabelStyle: {
          fontFamily: fonts.bodyBold,
          fontSize: 10,
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginTop: 2,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pumps',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="list.bullet" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Atlas',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: 'Report',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="camera.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Garage',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="gearshape.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
