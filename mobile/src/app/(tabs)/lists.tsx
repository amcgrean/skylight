import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import {
  Card,
  CheckCircle,
  ColorDot,
  OutlineButton,
  Page,
  RetroTextField,
  ScreenHeader,
  T,
  TextButton,
} from '../../components/ui';
import { productKey, type GroceryItem } from '../../lib/types';
import { useHub } from '../../state/household';
import * as sel from '../../state/selectors';
import { Palette } from '../../theme/theme';

type StoreGroup = { title: string; color: string; items: GroceryItem[] };

export default function ListsScreen() {
  const s = useHub();
  const [newItem, setNewItem] = useState('');
  const [picking, setPicking] = useState<GroceryItem | null>(null);

  const add = () => {
    const name = newItem;
    setNewItem('');
    void s.addGrocery(name);
  };

  const typed = newItem.trim();
  const learned = typed ? sel.suggestion(s, productKey(typed)) : null;
  const hint = !typed
    ? 'Items sort by store. The app learns where each thing usually comes from.'
    : learned
      ? `Goes on the ${learned.store.name} list — learned from ${learned.total} past trip${learned.total === 1 ? '' : 's'}`
      : 'New item — tap its store chip after adding to teach the app';

  const sections: StoreGroup[] = s.stores
    .map((st) => ({ title: st.name, color: st.color, items: s.groceries.filter((g) => g.store_id === st.id) }))
    .filter((g) => g.items.length > 0);
  const loose = s.groceries.filter((g) => !sel.store(s, g.store_id));
  if (loose.length) sections.push({ title: 'Pick a store', color: Palette.lineDark, items: loose });

  return (
    <Page>
      <ScreenHeader eyebrow="Shared with everyone" title="Our lists" />

      <Card fill={Palette.pink} padding={14} style={{ gap: 10 }}>
        <T size={16} weight="bold">{`Groceries · ${sel.groceriesLeft(s)} left`}</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <RetroTextField
            placeholder="Add an item"
            value={newItem}
            onChangeText={setNewItem}
            onSubmitEditing={add}
            style={{ flex: 1 }}
          />
          <Pressable
            onPress={add}
            style={{ paddingHorizontal: 16, minHeight: 46, borderRadius: 12, backgroundColor: Palette.mintDeep, justifyContent: 'center' }}
          >
            <T size={15} weight="bold" color="#FFFFFF">Add</T>
          </Pressable>
        </View>
        <OutlineButton title="Scan a barcode" icon="barcode-outline" onPress={() => router.push('/scan')} />
        <T size={12} color={Palette.pinkText}>{hint}</T>
      </Card>

      {sections.map((section) => (
        <Card key={section.title} bordered padding={14} style={{ gap: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
            <ColorDot hex={section.color} size={12} outlined={false} />
            <T size={15} weight="bold" style={{ flex: 1 }}>{section.title}</T>
            <T size={12} weight="bold" color={Palette.inkSoft}>{`${section.items.filter((i) => !i.checked).length} left`}</T>
          </View>
          {section.items.map((item) => (
            <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: Palette.sand }}>
              <GroceryRow item={item} onPickStore={() => setPicking(item)} />
            </View>
          ))}
        </Card>
      ))}

      {s.groceries.some((g) => g.checked) && <TextButton title="Clear checked items" onPress={() => void s.clearChecked()} />}

      <StorePicker item={picking} onClose={() => setPicking(null)} />
    </Page>
  );
}

function GroceryRow({ item, onPickStore }: { item: GroceryItem; onPickStore: () => void }) {
  const s = useHub();
  const sug = sel.suggestion(s, item.product_key);
  const learned = !!sug && sug.store.id === item.store_id && sug.trips >= 2;
  const st = sel.store(s, item.store_id);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable
        onPress={() => void s.toggleGrocery(item)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}
      >
        <CheckCircle done={item.checked} square />
        <View style={{ flex: 1, gap: 1 }}>
          <T size={16} style={{ opacity: item.checked ? 0.45 : 1, textDecorationLine: item.checked ? 'line-through' : 'none' }}>
            {item.name}
          </T>
          {learned && sug && (
            <T size={11} weight="bold" color={Palette.mintDeep}>{`Learned · ${sug.trips} of ${sug.total} trips here`}</T>
          )}
        </View>
      </Pressable>

      <Pressable
        onPress={onPickStore}
        accessibilityLabel={`Store: ${st?.name ?? 'none'}. Change store`}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 32, borderRadius: 16,
          backgroundColor: Palette.cream, borderWidth: 1.5, borderColor: Palette.lineDark,
        }}
      >
        <ColorDot hex={st?.color ?? Palette.lineDark} size={8} outlined={false} />
        <T size={12} weight="bold">{st?.name ?? 'Store'}</T>
      </Pressable>
    </View>
  );
}

/** Bottom sheet for choosing which store an item comes from. */
function StorePicker({ item, onClose }: { item: GroceryItem | null; onClose: () => void }) {
  const s = useHub();
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(46,42,38,0.35)', justifyContent: 'flex-end' }}>
        <Pressable style={{ backgroundColor: Palette.cream, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 36, gap: 8 }}>
          <T size={13} weight="bold" color={Palette.inkSoft} style={{ textAlign: 'center' }}>
            {item ? `Where does ${item.name} come from?` : ''}
          </T>
          {s.stores.map((st) => (
            <Pressable
              key={st.id}
              onPress={() => {
                if (item) void s.setStore(item, st.id);
                onClose();
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 14, borderRadius: 14,
                backgroundColor: Palette.paper, borderWidth: 1, borderColor: Palette.line,
              }}
            >
              <ColorDot hex={st.color} size={12} />
              <T size={16} weight="bold" style={{ flex: 1 }}>{st.name}</T>
              {item?.store_id === st.id && <Ionicons name="checkmark" size={18} color={Palette.mintDeep} />}
            </Pressable>
          ))}
          <TextButton title="Cancel" color={Palette.inkSoft} onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
