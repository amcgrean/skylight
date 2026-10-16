import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { T } from '../components/ui';
import { useAuth } from '../state/auth';
import { AppFont, Palette } from '../theme/theme';

export default function SignInScreen() {
  const signIn = useAuth((s) => s.signInWithApple);
  const error = useAuth((s) => s.errorMessage);
  const [appleAvailable, setAppleAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.cream, padding: 24, gap: 24 }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={[AppFont.script(44), { color: Palette.mintDeep }]}>Family Hub</Text>
          <T size={16} color={Palette.inkMid} style={{ textAlign: 'center' }}>
            Calendar, daycare runs, chores and groceries for the whole crew.
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {['#5DB894', '#EE8FA8', '#F2C14E', '#6CC0CF'].map((hex) => (
            <View key={hex} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: hex, borderWidth: 2, borderColor: Palette.ink }} />
          ))}
        </View>
      </View>

      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={14}
          style={{ height: 52 }}
          onPress={() => void signIn()}
        />
      ) : appleAvailable === false ? (
        <T size={14} color={Palette.inkSoft} style={{ textAlign: 'center' }}>
          Sign in with Apple is only available on iPhone and iPad.
        </T>
      ) : null}

      {error && <T size={13} color={Palette.pinkDeep} style={{ textAlign: 'center' }}>{error}</T>}
    </SafeAreaView>
  );
}
