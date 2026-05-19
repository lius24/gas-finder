import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/lib/theme-provider';

const isWeb = Platform.OS === 'web';

export default function TabLayout() {
  const { colors, fonts } = useTheme();
  return (
    <Tabs
      screenOptions={{
        // On web the bottom tab bar collides with Safari's URL/tab strip
        // (and looks alien on desktop). Top-mount it on web; keep native
        // platforms at the bottom where users expect them.
        tabBarPosition: isWeb ? 'top' : 'bottom',
        tabBarActiveTintColor: colors.rust,
        tabBarInactiveTintColor: colors.inkFaint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: isWeb
          ? {
              backgroundColor: colors.paper,
              borderBottomColor: colors.paperEdge,
              borderBottomWidth: 1,
              borderTopWidth: 0,
              height: 60,
              paddingTop: 0,
            }
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
