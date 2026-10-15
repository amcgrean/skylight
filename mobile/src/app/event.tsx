import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { DateField } from '../components/DateField';
import { Card, Eyebrow, Flow, Page, Pill, PrimaryButton, RetroTextField, T, TextButton } from '../components/ui';
import { getsInvites, type Member } from '../lib/types';
import { newDraft, useHub, type EventDraft } from '../state/household';
import * as sel from '../state/selectors';
import { Palette } from '../theme/theme';

export default function EventEditorScreen() {
  const s = useHub();
  const [draft, setDraft] = useState<EventDraft>(() => s.editorDraft ?? newDraft(s.calendarDay, s.me));
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const existing = draft.existing;
  const blank = !draft.title.trim();

  const save = async () => {
    if (saving || blank) return;
    setSaving(true);
    await s.saveEvent(draft);
    setSaving(false);
    router.back();
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(`Delete ${existing.title}?`, 'Anyone invited will get a cancellation from Google Calendar.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          router.back();
          void s.deleteEvent(existing);
        },
      },
    ]);
  };

  const toggleTag = (m: Member) =>
    update({ tagIDs: draft.tagIDs.includes(m.id) ? draft.tagIDs.filter((id) => id !== m.id) : [...draft.tagIDs, m.id] });

  return (
    <>
      <Stack.Screen
        options={{
          title: existing ? 'Edit event' : 'New event',
          headerLeft: () => <TextButton title="Cancel" onPress={() => router.back()} />,
        }}
      />
      <Page>
        <Card fill={Palette.mint}>
          <Eyebrow text="What" />
          <RetroTextField placeholder="e.g. Grooming for the dog" value={draft.title} onChangeText={(title) => update({ title })} />
          <Eyebrow text="Note (optional)" />
          <RetroTextField placeholder="e.g. Bring the vaccine card" value={draft.note} onChangeText={(note) => update({ note })} />
        </Card>

        <Card bordered>
          <Eyebrow text="When" />
          <DateField label="Day" mode="date" value={draft.day} onChange={(day) => update({ day })} />
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
            <T size={15} weight="bold" style={{ flex: 1 }}>All day</T>
            <Switch value={draft.allDay} onValueChange={(allDay) => update({ allDay })} trackColor={{ true: Palette.mintDeep }} />
          </View>
          {!draft.allDay && <DateField label="Time" mode="time" value={draft.time} onChange={(time) => update({ time })} />}
        </Card>

        <Card bordered style={{ gap: 10 }}>
          <Eyebrow text="Tag people" />
          <Flow>
            {s.members.map((m) => {
              const on = draft.tagIDs.includes(m.id);
              return (
                <Pill
                  key={m.id}
                  label={m.name}
                  selected={on}
                  selectedFill={m.color}
                  selectedText={Palette.ink}
                  dotHex={on ? undefined : m.color}
                  icon={getsInvites(m) ? 'mail-outline' : undefined}
                  onPress={() => toggleTag(m)}
                />
              );
            })}
          </Flow>
          <T size={13} color={Palette.mintText}>{invitePreview(s, draft)}</T>
        </Card>

        <PrimaryButton
          title={saving ? 'Saving…' : existing ? 'Save changes' : 'Add a family event'}
          disabled={blank}
          onPress={() => void save()}
        />

        {existing && <TextButton title="Delete event" onPress={confirmDelete} />}
      </Page>
    </>
  );
}

function invitePreview(s: sel.HubData, draft: EventDraft): string {
  const tagged = draft.tagIDs
    .map((id) => sel.member(s, id))
    .filter((m): m is Member => !!m)
    .sort((a, b) => a.sort - b.sort);
  if (!tagged.length) return "No one tagged — it'll be tagged to the whole family.";
  const invited = tagged.filter(getsInvites).map((m) => m.name);
  const tagOnly = tagged.filter((m) => !getsInvites(m)).map((m) => m.name);
  const parts = [invited.length ? `Invites go to ${invited.join(' & ')}` : 'No email invites'];
  if (tagOnly.length) parts.push(`${tagOnly.join(', ')} tagged only`);
  const adultsWithoutEmail = tagged.filter((m) => m.kind === 'adult' && !getsInvites(m)).map((m) => m.name);
  if (adultsWithoutEmail.length) parts.push(`add an email for ${adultsWithoutEmail.join(' & ')} in Settings`);
  return parts.join(' · ');
}
