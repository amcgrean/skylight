import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import type { PantryItem } from '../lib/types';
import { useHub } from '../state/household';
import * as sel from '../state/selectors';
import { Palette } from '../theme/theme';
import { Card, OutlineButton, RetroTextField, T } from './ui';

/** What's on hand at home. Scan or type to add; tap − as things get used up. */
export function PantryList() {
  const s = useHub();
  const [newItem, setNewItem] = useState('');
  const { onHand, out } = sel.pantrySorted(s);

  const add = () => {
    const name = newItem;
    setNewItem('');
    void s.addToPantry(name).then((row) => row && s.flash(`${row.name} — ${row.quantity} on hand`));
  };

  return (
    <>
      <Card fill={Palette.mint} padding={14} style={{ gap: 10 }}>
        <T size={16} weight="bold">{`Pantry · ${onHand.length} on hand`}</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <RetroTextField placeholder="Add to the pantry" value={newItem} onChangeText={setNewItem} onSubmitEditing={add} style={{ flex: 1 }} />
          <Pressable
            onPress={add}
            style={{ paddingHorizontal: 16, minHeight: 46, borderRadius: 12, backgroundColor: Palette.mintDeep, justifyContent: 'center' }}
          >
            <T size={15} weight="bold" color="#FFFFFF">Add</T>
          </Pressable>
        </View>
        <OutlineButton
          title="Scan into pantry"
          icon="barcode-outline"
          onPress={() => router.push({ pathname: '/scan', params: { mode: 'pantry' } })}
        />
        <T size={12} color={Palette.mintText}>
          Scanning the same thing again adds one more. Tap − as you use things up; when it hits zero, add it to the grocery list.
        </T>
      </Card>

      {onHand.length > 0 && (
        <Card bordered padding={14} style={{ gap: 0 }}>
          {onHand.map((item, i) => (
            <View key={item.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: Palette.sand }}>
              <PantryRow item={item} />
            </View>
          ))}
        </Card>
      )}

      {out.length > 0 && (
        <Card fill={Palette.pink} padding={14} style={{ gap: 0 }}>
          <T size={15} weight="bold" style={{ paddingBottom: 6 }}>Ran out</T>
          {out.map((item) => (
            <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: Palette.paper }}>
              <PantryRow item={item} />
            </View>
          ))}
        </Card>
      )}

      {s.pantry.length === 0 && (
        <T size={14} weight="bold" color={Palette.inkSoft} style={{ textAlign: 'center' }}>
          Nothing in the pantry yet — scan things as you put them away.
        </T>
      )}
    </>
  );
}

function PantryRow({ item }: { item: PantryItem }) {
  const s = useHub();
  const isOut = item.quantity === 0;
  const onList = s.groceries.some((g) => g.product_key === item.product_key && !g.checked);

  const confirmRemove = () =>
    Alert.alert(`Remove ${item.name}?`, 'It comes off the pantry list. Scanning it again adds it back.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void s.removePantryItem(item) },
    ]);

  return (
    <Pressable onLongPress={confirmRemove} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 }}>
      <View style={{ flex: 1, gap: 1 }}>
        <T size={16} style={{ opacity: isOut ? 0.6 : 1 }}>{item.name}</T>
        {onList && <T size={11} weight="bold" color={Palette.mintDeep}>On the grocery list</T>}
      </View>

      {isOut && !onList && (
        <Pressable
          onPress={() => void s.addGrocery(item.name, item.upc)}
          accessibilityLabel={`Add ${item.name} to the grocery list`}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 32, borderRadius: 16,
            backgroundColor: Palette.paper, borderWidth: 1.5, borderColor: Palette.ink,
          }}
        >
          <Ionicons name="add" size={14} color={Palette.ink} />
          <T size={12} weight="bold">list</T>
        </Pressable>
      )}

      <QtyButton icon="remove" label={`Use one ${item.name}`} disabled={isOut} onPress={() => void s.adjustPantryItem(item, -1)} />
      <T size={17} weight="bold" style={{ minWidth: 24, textAlign: 'center' }}>{String(item.quantity)}</T>
      <QtyButton icon="add" label={`Add one ${item.name}`} onPress={() => void s.adjustPantryItem(item, 1)} />
    </Pressable>
  );
}

function QtyButton({ icon, label, disabled = false, onPress }: {
  icon: 'add' | 'remove';
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={{
        width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: disabled ? Palette.lineDark : Palette.ink, backgroundColor: Palette.paper,
      }}
    >
      <Ionicons name={icon} size={16} color={disabled ? Palette.lineDark : Palette.ink} />
    </Pressable>
  );
}
