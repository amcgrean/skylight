import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Eyebrow, OutlineButton, Page, RetroTextField, ScreenHeader, T, TextButton } from '../components/ui';
import { useAuth, type ClaimableAdult } from '../state/auth';
import { Palette } from '../theme/theme';

/** After signing in: enter the household invite code and pick who you are. */
export default function ClaimScreen() {
  const auth = useAuth();
  const [code, setCode] = useState('');
  const [people, setPeople] = useState<ClaimableAdult[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  const find = async () => {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    setPeople(await auth.claimableAdults(c));
    setSearched(true);
    setBusy(false);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Palette.cream }}>
      <Page>
        <ScreenHeader eyebrow="One more step" title="Who are you?" />
        <T size={14} color={Palette.inkMid}>
          Enter the household code from the Settings screen on the other phone (or the one printed when the database was set up).
        </T>

        <Card fill={Palette.mint} style={{ gap: 10 }}>
          <Eyebrow text="Household code" />
          <RetroTextField
            placeholder="e.g. E97352"
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => void find()}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <OutlineButton title={busy ? 'Looking…' : 'Find my family'} onPress={() => void find()} />
        </Card>

        {people.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Eyebrow text="I'm…" />
            {people.map((p) => (
              <Pressable
                key={p.id}
                onPress={async () => {
                  setBusy(true);
                  await auth.claim(code, p.id);
                  setBusy(false);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 56, borderRadius: 14,
                  backgroundColor: Palette.paper, borderWidth: 1, borderColor: Palette.line,
                }}
              >
                <View
                  style={{
                    width: 34, height: 34, borderRadius: 17, backgroundColor: p.color, borderWidth: 2, borderColor: Palette.ink,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <T size={15} weight="bold">{p.name.slice(0, 1)}</T>
                </View>
                <T size={17} weight="bold" style={{ flex: 1 }}>{p.name}</T>
                <Ionicons name="chevron-forward" size={18} color={Palette.ink} />
              </Pressable>
            ))}
          </View>
        ) : searched ? (
          <T size={14} color={Palette.pinkDeep}>No open spots for that code. Check it, or the person may already be linked.</T>
        ) : null}

        {auth.errorMessage && <T size={13} color={Palette.pinkDeep}>{auth.errorMessage}</T>}

        <TextButton title="Sign out" color={Palette.inkSoft} onPress={() => void auth.signOut()} />
      </Page>
    </SafeAreaView>
  );
}
