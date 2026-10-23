import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Avatar, Card, Eyebrow, OutlineButton, Page, T, TextButton } from '../components/ui';
import type { Member } from '../lib/types';
import { versionLabel } from '../lib/updates';
import { useAuth } from '../state/auth';
import { useHub } from '../state/household';
import * as sel from '../state/selectors';
import { AppFont, Palette } from '../theme/theme';

export default function SettingsScreen() {
  const s = useHub();
  const signOut = useAuth((a) => a.signOut);
  const h = s.household;

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <TextButton title="Done" onPress={() => router.back()} /> }} />
      <Page>
        {h && (
          <Card fill={Palette.mint} style={{ gap: 8 }}>
            <Eyebrow text="Household code" />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T size={28} weight="bold" style={{ flex: 1, letterSpacing: 4 }} selectable>{h.invite_code}</T>
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(h.invite_code);
                  s.flash('Code copied');
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}
              >
                <Ionicons name="copy-outline" size={16} color={Palette.pinkDeep} />
                <T size={14} weight="bold" color={Palette.pinkDeep}>Copy</T>
              </Pressable>
            </View>
            <T size={13} color={Palette.mintText}>
              The other adult signs in with Apple on their phone, enters this code and picks their name.
            </T>
          </Card>
        )}

        <Card bordered>
          <Eyebrow text="Calendar invites" />
          <T size={13} color={Palette.inkSoft}>Tagged adults get Google Calendar invites at these addresses.</T>
          {sel.adults(s).map((m) => <EmailRow key={m.id} member={m} />)}
        </Card>

        <Card bordered style={{ gap: 10 }}>
          <Eyebrow text="Tag-only" />
          {s.members.filter((m) => m.kind !== 'adult').map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar member={m} size={28} />
              <T size={15} weight="bold" style={{ flex: 1 }}>{m.name}</T>
              <T size={12} color={Palette.inkSoft}>{m.kind === 'grandparent' ? 'Pickups & sleepovers' : 'Tags'}</T>
            </View>
          ))}
        </Card>

        <Card bordered style={{ gap: 8 }}>
          <Eyebrow text="Connection" />
          <T size={14} weight="bold">
            {s.isDemo() ? 'Demo mode — sample data stored only on this phone.' : 'Live — synced with the family database.'}
          </T>
          {!s.isDemo() && (
            <OutlineButton
              title="Sign out"
              onPress={() => {
                router.back();
                void signOut();
              }}
            />
          )}
        </Card>

        <T size={12} color={Palette.inkSoft} style={{ textAlign: 'center' }} selectable>
          {`Version ${versionLabel()}`}
        </T>
      </Page>
    </>
  );
}

function EmailRow({ member }: { member: Member }) {
  const updateEmail = useHub((s) => s.updateEmail);
  const flash = useHub((s) => s.flash);
  const [email, setEmail] = useState(member.email ?? '');

  const save = async () => {
    const value = email.trim();
    if (!(await updateEmail(member, value))) return;
    flash(value ? `Saved — ${member.name} will get invites` : 'Email removed');
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Avatar member={member} size={30} />
      <View style={{ flex: 1, gap: 4 }}>
        <T size={15} weight="bold">{member.name}</T>
        <TextInput
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => void save()}
          placeholder="email@example.com"
          placeholderTextColor={Palette.inkSoft}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          style={[AppFont.body(15), { color: Palette.ink, paddingVertical: 4 }]}
        />
      </View>
      {email !== (member.email ?? '') && <TextButton title="Save" onPress={() => void save()} />}
    </View>
  );
}
