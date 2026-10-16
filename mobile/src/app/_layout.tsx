import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { supabase } from '../lib/supabase';
import { DemoRepository } from '../services/demoRepository';
import { SupabaseRepository } from '../services/supabaseRepository';
import { useAuth } from '../state/auth';
import { useHub } from '../state/household';
import { AppFont, fontFiles, Palette } from '../theme/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontFiles);
  const phase = useAuth((s) => s.phase);
  const start = useAuth((s) => s.start);

  useEffect(() => {
    void start();
  }, [start]);

  // Build the household store once signed in and linked; drop it on sign-out.
  useEffect(() => {
    if (phase === 'ready') {
      void useHub.getState().start(supabase ? new SupabaseRepository(supabase) : new DemoRepository());
    } else if (phase === 'signedOut' || phase === 'needsLink') {
      useHub.getState().reset();
    }
  }, [phase]);

  const booting = !fontsLoaded || phase === 'starting';
  useEffect(() => {
    if (!booting) void SplashScreen.hideAsync();
  }, [booting]);
  if (booting) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Palette.cream },
          headerStyle: { backgroundColor: Palette.cream },
          headerTitleStyle: { ...AppFont.body(17, 'bold'), color: Palette.ink },
          headerTintColor: Palette.pinkDeep,
          headerShadowVisible: false,
        }}
      >
        <Stack.Protected guard={phase === 'signedOut'}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={phase === 'needsLink'}>
          <Stack.Screen name="claim" />
        </Stack.Protected>
        <Stack.Protected guard={phase === 'ready'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="event" options={{ presentation: 'modal', headerShown: true }} />
          <Stack.Screen name="scan" options={{ presentation: 'modal', headerShown: true, title: 'Scan a barcode' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: true, title: 'Settings' }} />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}
