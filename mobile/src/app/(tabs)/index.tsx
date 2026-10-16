import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  Avatar,
  AvatarStack,
  Card,
  ColorDot,
  Eyebrow,
  Flow,
  OutlineButton,
  Page,
  Pill,
  PrimaryButton,
  ProgressBar,
  RetroTextField,
  ScreenHeader,
  T,
} from '../../components/ui';
import { atTime, fmt, startOfDay } from '../../lib/day';
import type { UUID } from '../../lib/types';
import { useHub } from '../../state/household';
import * as sel from '../../state/selectors';
import { Palette } from '../../theme/theme';

export default function HomeScreen() {
  const s = useHub();
  const fam = sel.family(s);
  return (
    <Page>
      <ScreenHeader
        eyebrow={fmt.headerDate(new Date())}
        title={`Hey, ${s.me?.name ?? 'there'}`}
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AvatarStack members={fam.slice(0, 4)} />
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityLabel="Settings"
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="settings-sharp" size={20} color={Palette.inkMid} />
            </Pressable>
          </View>
        }
      />
      <T size={13} color={Palette.inkSoft} style={{ marginTop: -8 }}>{fam.map((m) => m.name).join(' · ')}</T>

      {s.isDemo() && (
        <Card fill={Palette.butter} padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="sparkles" size={16} color={Palette.butterText} />
          <T size={13} color={Palette.butterText} style={{ flex: 1 }}>
            Demo mode — sample data on this phone only. Add your Supabase keys to go live.
          </T>
        </Card>
      )}

      <DaycareTodayCard />
      <UpNextCard />
      <ChoreSummaryCard />
      <DinnerCard />
    </Page>
  );
}

function DaycareTodayCard() {
  const s = useHub();
  const kid = sel.child(s);
  const d = sel.daycare(s, new Date());
  if (!kid || !d) return null;

  const runTile = (label: string, id: UUID | null) => {
    const m = sel.member(s, id);
    return (
      <View style={{ flex: 1, gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: Palette.paper }}>
        <Eyebrow text={label} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {m && <ColorDot hex={m.color} size={16} />}
          <T size={15} weight="bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{m?.name ?? 'Nobody yet'}</T>
        </View>
      </View>
    );
  };

  const host = sel.member(s, d.sleepover);
  return (
    <Pressable
      onPress={() => {
        s.setCalendarDay(startOfDay(new Date()));
        router.navigate('/calendar');
      }}
    >
      <Card fill={Palette.butter}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T size={16} weight="bold" style={{ flex: 1 }}>{`${kid.name}'s day`}</T>
          <Eyebrow text="Daycare" color={Palette.butterText} />
        </View>
        {d.closed ? (
          <T size={15} weight="bold" color={Palette.butterText}>
            {`Daycare is closed today${d.note ? ` · ${d.note}` : ''}`}
          </T>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {runTile(`Drop-off ${fmt.clock(atTime(d.dropTime, d.date))}`, d.drop)}
              {runTile(`Pickup ${fmt.clock(atTime(d.pickTime, d.date))}`, d.pick)}
            </View>
            {host && <T size={13} weight="bold" color={Palette.butterText}>{`Sleepover at ${host.name}’s tonight`}</T>}
          </>
        )}
      </Card>
    </Pressable>
  );
}

function until(date: Date): string {
  const mins = Math.floor((date.getTime() - Date.now()) / 60000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins}m`;
  return `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function UpNextCard() {
  const s = useHub();
  const next = sel.upNext(s);
  const start = next?.start;
  return (
    <Card fill={Palette.pink} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      {next && start ? (
        <>
          <View
            style={{
              width: 58, height: 58, borderRadius: 29, backgroundColor: Palette.paper, borderWidth: 2, borderColor: Palette.ink,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <T size={15} weight="bold">{fmt.clock(start)}</T>
            <T size={10} weight="bold">{fmt.ampm(start)}</T>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Eyebrow text={`Up next · ${until(start)}`} color={Palette.pinkText} />
            <T size={18} weight="bold">{next.title}</T>
            <T size={13} color={Palette.pinkText}>{sel.names(s, next.tagIDs)}</T>
          </View>
        </>
      ) : (
        <View style={{ gap: 2 }}>
          <Eyebrow text="Up next" color={Palette.pinkText} />
          <T size={18} weight="bold">Nothing else today</T>
        </View>
      )}
    </Card>
  );
}

function ChoreSummaryCard() {
  const s = useHub();
  const today = sel.choresDue(s, new Date());
  const done = today.filter((c) => sel.isDone(s, c)).length;
  return (
    <Pressable onPress={() => router.navigate('/chores')}>
      <Card fill={Palette.mint}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <T size={16} weight="bold" style={{ flex: 1 }}>{"Today's chores"}</T>
          <T size={13} color={Palette.mintText}>{`${done} of ${today.length} done`}</T>
        </View>
        {sel.family(s).map((m) => {
          const mine = today.filter((c) => c.member_id === m.id);
          if (!mine.length) return null;
          const n = mine.filter((c) => sel.isDone(s, c)).length;
          return (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar member={m} size={26} />
              <T size={14} style={{ width: 62 }} numberOfLines={1}>{m.name}</T>
              <ProgressBar value={n / mine.length} color={m.color} />
              <T size={13} color={Palette.mintText} style={{ width: 32, textAlign: 'right' }}>{`${n}/${mine.length}`}</T>
            </View>
          );
        })}
      </Card>
    </Pressable>
  );
}

function DinnerCard() {
  const s = useHub();
  const meal = sel.meal(s, new Date());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [cook, setCook] = useState<UUID | null>(null);
  const [takeout, setTakeout] = useState(false);

  const save = () => {
    setEditing(false);
    void s.setMeal(new Date(), draft, takeout ? null : cook, takeout ? 'Takeout' : null);
  };

  return (
    <Card bordered>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow text="What's for dinner" />
          <T size={19} weight="bold">{meal?.title ?? 'Not planned yet'}</T>
          <T size={13} color={Palette.inkSoft}>{sel.cookLabel(s, meal)}</T>
        </View>
        <Pressable
          onPress={() => router.navigate('/lists')}
          style={{ paddingHorizontal: 12, minHeight: 38, borderRadius: 19, borderWidth: 2, borderColor: Palette.ink, justifyContent: 'center' }}
        >
          <T size={13} weight="bold">{`${sel.groceriesLeft(s)} to buy`}</T>
        </Pressable>
      </View>

      {editing ? (
        <>
          <RetroTextField placeholder="Tonight's dinner" value={draft} onChangeText={setDraft} onSubmitEditing={save} autoFocus />
          <Flow>
            {sel.adults(s).map((a) => (
              <Pill key={a.id} label={a.name} selected={!takeout && cook === a.id} onPress={() => { setCook(a.id); setTakeout(false); }} />
            ))}
            <Pill label="Takeout" selected={takeout} onPress={() => { setTakeout(true); setCook(null); }} />
          </Flow>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><OutlineButton title="Cancel" onPress={() => setEditing(false)} /></View>
            <View style={{ flex: 1 }}><PrimaryButton title="Save" fill={Palette.mintDeep} onPress={save} /></View>
          </View>
        </>
      ) : (
        <PrimaryButton
          title={meal ? "Edit tonight's dinner" : "Plan tonight's dinner"}
          fill={Palette.mintDeep}
          onPress={() => {
            setDraft(meal?.title ?? '');
            setCook(meal?.cook_member ?? s.me?.id ?? null);
            setTakeout(meal?.cook_label === 'Takeout');
            setEditing(true);
          }}
        />
      )}
    </Card>
  );
}
