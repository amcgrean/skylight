import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { fmt, isSameDay, weekContaining } from '../lib/day';
import type { UUID } from '../lib/types';
import { useHub } from '../state/household';
import * as sel from '../state/selectors';
import { Palette, withAlpha } from '../theme/theme';
import { Card, Eyebrow, T } from './ui';

/**
 * The week's daycare runs. Tap a name to cycle who's doing it; tap the moon for a
 * sleepover (once for the first grandparents, twice for the second, again to clear).
 * Long-press a day to mark daycare closed.
 */
export function DaycareRunsCard() {
  const s = useHub();
  const kid = sel.child(s);
  const days = weekContaining(s.calendarDay)
    .map((d) => sel.daycare(s, d))
    .filter((d): d is sel.DaycareDay => !!d);
  if (!kid || !days.length) return null;

  const g = sel.grandparents(s).map((m) => m.name);
  const order = g.length >= 2 ? `once for ${g[0]}, twice for ${g[1]}` : g[0] ? `for ${g[0]}` : '';

  return (
    <Card fill={Palette.butter} padding={14} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingBottom: 2 }}>
        <T size={16} weight="bold" style={{ flex: 1 }}>{`${kid.name}'s daycare runs`}</T>
        <T size={12} color={Palette.butterText}>Tap a name to swap</T>
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4 }}>
          <View style={{ width: 40 }} />
          <View style={{ flex: 1 }}><Eyebrow text="Drop-off" color={Palette.butterText} /></View>
          <View style={{ flex: 1 }}><Eyebrow text="Pickup" color={Palette.butterText} /></View>
          <View style={{ width: 46, alignItems: 'center' }}><Eyebrow text="Stay" color={Palette.butterText} /></View>
        </View>
        {days.map((d) => <DaycareRow key={d.key} day={d} />)}
      </View>

      <T size={12} color={Palette.butterText} style={{ paddingTop: 2 }}>
        {`Moon = sleepover (${order}). The hosts get that night's pickup and the next drop-off — tagged only, no invites. Long-press a day to mark daycare closed.`}
      </T>
    </Card>
  );
}

function DaycareRow({ day }: { day: sel.DaycareDay }) {
  const s = useHub();
  const selected = isSameDay(day.date, s.calendarDay);
  const host = sel.member(s, day.sleepover);
  const toggleClosed = () => void s.toggleClosed(day.date);

  const runButton = (id: UUID | null, label: string, onPress: () => void) => {
    const m = sel.member(s, id);
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={`${label}: ${m?.name ?? 'nobody'}. Tap to change.`}
        style={{
          flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, borderRadius: 12,
          backgroundColor: m?.color ?? Palette.paper, borderWidth: 2, borderColor: Palette.ink,
        }}
      >
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: Palette.paper, borderWidth: 1.5, borderColor: Palette.ink }} />
        <T size={13} weight="bold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ flex: 1 }}>
          {m?.short_name ?? '—'}
        </T>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, borderRadius: 14,
        backgroundColor: selected ? withAlpha(Palette.paper, 0.7) : 'transparent',
      }}
    >
      <Pressable
        onLongPress={toggleClosed}
        accessibilityActions={[{ name: 'toggle', label: day.closed ? 'Mark daycare open' : 'Mark daycare closed' }]}
        onAccessibilityAction={toggleClosed}
        style={{ width: 40, alignItems: 'center' }}
      >
        <T size={11} weight="bold" color={Palette.inkSoft}>{fmt.weekdayShort(day.date)}</T>
        <T size={17} weight="bold">{fmt.dayNumber(day.date)}</T>
      </Pressable>

      {day.closed ? (
        <Pressable onLongPress={toggleClosed} style={{ flex: 1, minHeight: 42, justifyContent: 'center' }}>
          <T size={14} weight="bold" color={Palette.inkSoft}>{`Daycare closed${day.note ? ` · ${day.note}` : ''}`}</T>
        </Pressable>
      ) : (
        <>
          {runButton(day.drop, 'drop-off', () => void s.cycleDrop(day.date))}
          {runButton(day.pick, 'pickup', () => void s.cyclePick(day.date))}
          <Pressable
            onPress={() => void s.cycleSleepover(day.date)}
            accessibilityLabel={host ? `Sleepover at ${host.name}'s` : 'No sleepover'}
            style={{
              width: 46, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
              backgroundColor: host?.color ?? Palette.paper, borderWidth: 2, borderColor: host ? Palette.ink : Palette.lineDark,
            }}
          >
            <Ionicons name="moon" size={16} color={host ? Palette.ink : Palette.inkSoft} />
          </Pressable>
        </>
      )}
    </View>
  );
}
