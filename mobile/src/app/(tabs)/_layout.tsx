import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OutlineButton, T, Toast } from '../../components/ui';
import { useHub } from '../../state/household';
import { AppFont, Palette } from '../../theme/theme';

export default function TabsLayout() {
  const hasLoaded = useHub((s) => s.hasLoaded);
  const loadError = useHub((s) => s.loadError);
  const toast = useHub((s) => s.toast);

  if (!hasLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.cream, padding: 32, gap: 16 }}>
        {loadError ? (
          <>
            <T style={AppFont.script(24)} color={Palette.mintDeep}>{"Couldn't load the family"}</T>
            <T size={14} color={Palette.inkSoft} style={{ textAlign: 'center' }}>{loadError}</T>
            <OutlineButton title="Try again" onPress={() => void useHub.getState().load()} style={{ width: 220 }} />
          </>
        ) : (
          <ActivityIndicator color={Palette.mintDeep} />
        )}
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Palette.cream }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: Palette.cream },
          tabBarActiveTintColor: Palette.pinkDeep,
          tabBarInactiveTintColor: Palette.inkSoft,
          tabBarLabelStyle: AppFont.body(11, 'bold'),
          tabBarStyle: { backgroundColor: Palette.paper, borderTopColor: Palette.line },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }} />
        <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} /> }} />
        <Tabs.Screen name="chores" options={{ title: 'Chores', tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-circle-outline" color={color} size={size} /> }} />
        <Tabs.Screen name="lists" options={{ title: 'Lists', tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} /> }} />
      </Tabs>
      {toast && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 96 }}>
          <Toast text={toast} />
        </View>
      )}
    </SafeAreaView>
  );
}
