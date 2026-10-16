import { Pressable, View } from 'react-native';

import { Avatar, Card, CheckCircle, Page, ScreenHeader, T } from '../../components/ui';
import { fmt } from '../../lib/day';
import { useHub } from '../../state/household';
import * as sel from '../../state/selectors';
import { Palette } from '../../theme/theme';

const tints = [Palette.mint, Palette.pink, Palette.butter, Palette.sky];

export default function ChoresScreen() {
  const s = useHub();
  const today = sel.choresDue(s, new Date());

  return (
    <Page>
      <ScreenHeader eyebrow={fmt.headerDate(new Date())} title="Chores" />

      {sel.family(s).map((m, index) => {
        const mine = today.filter((c) => c.member_id === m.id);
        if (!mine.length) return null;
        const points = mine.filter((c) => sel.isDone(s, c)).reduce((n, c) => n + c.points, 0);
        return (
          <Card key={m.id} fill={tints[index % tints.length]} padding={14} style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 6 }}>
              <Avatar member={m} size={30} outlined />
              <T size={16} weight="bold" style={{ flex: 1 }}>{m.name}</T>
              <T size={13} color={Palette.inkMid}>{`${points} pts`}</T>
            </View>

            {mine.map((chore) => {
              const done = sel.isDone(s, chore);
              return (
                <Pressable
                  key={chore.id}
                  onPress={() => void s.toggleChore(chore)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 }}
                >
                  <CheckCircle done={done} fill={m.color} />
                  <T
                    size={16}
                    style={{ flex: 1, opacity: done ? 0.5 : 1, textDecorationLine: done ? 'line-through' : 'none' }}
                  >
                    {chore.title}
                  </T>
                  <T size={12} weight="bold" color={Palette.inkMid}>{`+${chore.points}`}</T>
                </Pressable>
              );
            })}
          </Card>
        );
      })}

      {today.length === 0 && <T size={15} weight="bold" color={Palette.inkSoft}>No chores today.</T>}
    </Page>
  );
}
