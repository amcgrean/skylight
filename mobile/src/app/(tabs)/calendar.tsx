import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { DaycareRunsCard } from '../../components/DaycareRunsCard';
import { Card, ColorDot, Page, Pill, PrimaryButton, ScreenHeader, T } from '../../components/ui';
import { addDays, fmt, isSameDay, weekContaining } from '../../lib/day';
import { draftFor, newDraft, useHub } from '../../state/household';
import * as sel from '../../state/selectors';
import { memberTint, Palette } from '../../theme/theme';

export default function CalendarScreen() {
  const s = useHub();
  const [filter, setFilter] = useState<sel.AgendaFilter>({ kind: 'everyone' });
  const day = s.calendarDay;
  const items = sel.agenda(s, day, filter);

  return (
    <Page>
      <ScreenHeader eyebrow={fmt.headerDate(day)} title="Family calendar" />
      <WeekStrip filter={filter} />
      <FilterChips filter={filter} onChange={setFilter} />

      <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 2 }}>
        <T size={18} weight="bold" style={{ flex: 1 }}>{isSameDay(day, new Date()) ? 'Today' : fmt.weekdayLong(day)}</T>
        <T size={13} weight="bold" color={Palette.inkSoft}>{`${items.length} ${items.length === 1 ? 'plan' : 'plans'}`}</T>
      </View>

      <View style={{ gap: 8 }}>
        {items.map((item) => (
          <AgendaRow
            key={item.id}
            item={item}
            onPress={item.event ? () => { s.openEditor(draftFor(item.event!)); router.push('/event'); } : undefined}
          />
        ))}
        {items.length === 0 && (
          <View
            style={{
              minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 16,
              borderWidth: 2, borderStyle: 'dashed', borderColor: Palette.line,
            }}
          >
            <T size={14} weight="bold" color={Palette.inkSoft}>Nothing here — room to breathe.</T>
          </View>
        )}
      </View>

      <PrimaryButton
        title="Add a family event"
        icon="add"
        onPress={() => {
          s.openEditor(newDraft(day, s.me));
          router.push('/event');
        }}
      />

      <DaycareRunsCard />
      <CalendarSourcesCard />
    </Page>
  );
}

function WeekStrip({ filter }: { filter: sel.AgendaFilter }) {
  const s = useHub();
  const week = weekContaining(s.calendarDay);
  const shift = (days: number) => s.setCalendarDay(addDays(days, s.calendarDay));
  const touchX = useRef(0);

  return (
    <View
      style={{ gap: 8 }}
      onTouchStart={(e) => { touchX.current = e.nativeEvent.pageX; }}
      onTouchEnd={(e) => {
        const dx = e.nativeEvent.pageX - touchX.current;
        if (dx < -60) shift(7);
        else if (dx > 60) shift(-7);
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => shift(-7)} accessibilityLabel="Previous week" style={{ width: 44, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={20} color={Palette.inkMid} />
        </Pressable>
        <T size={14} weight="bold" color={Palette.inkMid} style={{ flex: 1, textAlign: 'center' }}>
          {`${fmt.monthDay(week[0])} – ${fmt.monthDay(week[6])}`}
        </T>
        <Pressable onPress={() => shift(7)} accessibilityLabel="Next week" style={{ width: 44, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-forward" size={20} color={Palette.inkMid} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 4 }}>
        {week.map((d) => {
          const selected = isSameDay(d, s.calendarDay);
          const isToday = isSameDay(d, new Date());
          const has = sel.agenda(s, d, filter).length > 0;
          const color = selected ? Palette.cream : Palette.ink;
          return (
            <Pressable
              key={d.toISOString()}
              onPress={() => s.setCalendarDay(d)}
              accessibilityState={{ selected }}
              style={{
                flex: 1, minHeight: 64, gap: 3, alignItems: 'center', justifyContent: 'center', borderRadius: 14,
                backgroundColor: selected ? Palette.mintDeep : isToday ? Palette.pink : Palette.paper,
              }}
            >
              <T size={11} weight="bold" color={color} style={{ letterSpacing: 0.6 }}>{fmt.weekdayShort(d).toUpperCase()}</T>
              <T size={19} weight="bold" color={color}>{fmt.dayNumber(d)}</T>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: has ? color : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FilterChips({ filter, onChange }: { filter: sel.AgendaFilter; onChange: (f: sel.AgendaFilter) => void }) {
  const s = useHub();
  const grands = sel.grandparents(s);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -16 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
    >
      <Pill label="Everyone" selected={filter.kind === 'everyone'} dotHex="#F08A6C" onPress={() => onChange({ kind: 'everyone' })} />
      {sel.family(s).map((m) => (
        <Pill
          key={m.id}
          label={m.name}
          dotHex={m.color}
          selected={filter.kind === 'member' && filter.id === m.id}
          onPress={() => onChange({ kind: 'member', id: m.id })}
        />
      ))}
      {grands.length > 0 && (
        <Pill label="Grands" dotHex={grands[0].color} selected={filter.kind === 'grandparents'} onPress={() => onChange({ kind: 'grandparents' })} />
      )}
    </ScrollView>
  );
}

function AgendaRow({ item, onPress }: { item: sel.AgendaItem; onPress?: () => void }) {
  const s = useHub();
  const lead = sel.leadColor(s, item.tagIDs);
  const past = !!item.start && item.start < new Date() && isSameDay(item.start, new Date());
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, opacity: past ? 0.5 : 1 }}>
      <View style={{ width: 52, paddingTop: 12 }}>
        {item.start ? (
          <>
            <T size={14} weight="bold">{fmt.clock(item.start)}</T>
            <T size={11} weight="bold" color={Palette.inkSoft}>{fmt.ampm(item.start)}</T>
          </>
        ) : (
          <T size={12} weight="bold">All day</T>
        )}
      </View>
      <View style={{ flex: 1, gap: 4, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: memberTint(lead) }}>
        <T size={16} weight="bold">{item.title}</T>
        {!!item.note && <T size={13} color={Palette.inkMid}>{item.note}</T>}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
          <ColorDot hex={lead} size={9} />
          <T size={12} weight="bold" color={Palette.inkMid}>{sel.names(s, item.tagIDs)}</T>
          {item.sourceLabel && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: Palette.paper }}>
              <T size={11} weight="bold" color={Palette.inkMid}>{item.sourceLabel}</T>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function CalendarSourcesCard() {
  const s = useHub();
  const manual = s.events.filter((e) => e.source === 'manual');
  const synced = manual.some((e) => e.sync_status === 'synced');
  const failed = manual.some((e) => e.sync_status === 'error');
  const row = (dot: string, name: string, status: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <ColorDot hex={dot} size={12} outlined={false} />
      <T size={15} weight="bold" style={{ flex: 1 }}>{name}</T>
      <T size={12} weight="bold" color={Palette.inkSoft}>{status}</T>
    </View>
  );
  return (
    <Card bordered>
      <View style={{ gap: 2 }}>
        <T size={16} weight="bold">Connected calendars</T>
        <T size={13} color={Palette.inkSoft}>
          Events you add land on the family Google Calendar, and tagged adults get an invite by email. Grandparents, kids and pets are tagged only.
        </T>
      </View>
      {row('#5DB894', 'Family Google Calendar', s.isDemo() ? 'Demo' : failed ? 'Check setup' : synced ? 'Connected' : 'Waiting for first event')}
      {row('#6CC0CF', 'Family inbox', 'Phase 3')}
      {row('#EE8FA8', 'Personal calendars', 'Phase 3')}
    </Card>
  );
}
