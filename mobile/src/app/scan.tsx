import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Card, Eyebrow, Flow, Page, Pill, PrimaryButton, RetroTextField, T, TextButton } from '../components/ui';
import type { ProductInfo, UUID } from '../lib/types';
import { useHub } from '../state/household';
import * as sel from '../state/selectors';
import { Palette } from '../theme/theme';

type Mode = 'grocery' | 'pantry';

/**
 * Scan a barcode → look it up (the family's own names first, then the public
 * databases) → add it to the grocery list (pick a store) or to the pantry.
 * Pantry mode goes straight back to the camera so a whole bag can be scanned in a row.
 */
export default function ScanScreen() {
  const s = useHub();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'pantry' ? 'pantry' : 'grocery');
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState<string | null>(null);
  const [typedCode, setTypedCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [name, setName] = useState('');
  const [info, setInfo] = useState<ProductInfo | null>(null);
  const [storeID, setStoreID] = useState<UUID | null>(null);
  const [count, setCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const handle = (raw: string) => {
    let digits = raw.replace(/\D/g, '');
    // UPC-A is often reported as EAN-13 with a leading 0; normalize so scans and typed codes match.
    if (digits.length === 13 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length < 8 || code || fired.current) return;
    fired.current = true;
    setCode(digits);
    setLooking(true);
    setLastAdded(null);
    setCount(1);
    setStoreID(sel.suggestion(useHub.getState(), `upc:${digits}`)?.store.id ?? null);
    void (async () => {
      const result = await useHub.getState().lookup(digits);
      setInfo(result);
      if (result?.found && result.name) {
        const brand = result.brand?.trim();
        setName(brand && !result.name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${result.name}` : result.name);
      } else {
        setName('');
      }
      setLooking(false);
    })();
  };

  const reset = () => {
    fired.current = false;
    setCode(null);
    setTypedCode('');
    setName('');
    setInfo(null);
    setStoreID(null);
    setCount(1);
  };

  const learned = code ? sel.suggestion(s, `upc:${code}`) : null;
  const chosen = sel.store(s, storeID);
  const onHand = code ? sel.pantryItem(s, `upc:${code}`) : undefined;
  const named = !!name.trim();

  const addToGroceries = async () => {
    if (!chosen || !named || !code) return;
    setSaving(true);
    await s.addGrocery(name, code, storeID);
    setSaving(false);
    router.back();
  };

  const addToPantry = async () => {
    if (!named || !code) return;
    setSaving(true);
    const row = await s.addToPantry(name, code, count);
    setSaving(false);
    if (row) setLastAdded(`${row.name} — ${row.quantity} on hand`);
    reset(); // straight back to the camera for the next item
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: mode === 'pantry' ? 'Scan into pantry' : 'Scan a barcode',
          headerLeft: () => <TextButton title={mode === 'pantry' ? 'Done' : 'Close'} onPress={() => router.back()} />,
        }}
      />
      <Page>
        <Flow>
          <Pill label="Grocery list" selected={mode === 'grocery'} onPress={() => setMode('grocery')} />
          <Pill label="Pantry" selected={mode === 'pantry'} onPress={() => setMode('pantry')} />
        </Flow>

        {lastAdded && (
          <Card fill={Palette.mint} padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="checkmark-circle" size={20} color={Palette.mintDeep} />
            <T size={14} weight="bold" color={Palette.mintText} style={{ flex: 1 }}>{`Added ${lastAdded}`}</T>
          </Card>
        )}

        {!code ? (
          <>
            {permission?.granted ? (
              <>
                <View style={{ height: 240, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: Palette.ink }}>
                  <CameraView
                    style={{ flex: 1 }}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'itf14'] }}
                    onBarcodeScanned={({ data }) => {
                      if (fired.current) return;
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      handle(data);
                    }}
                  />
                </View>
                <T size={14} color={Palette.inkSoft}>
                  {mode === 'pantry'
                    ? 'Scan each item as you put it away. The camera comes back after each one.'
                    : 'Point the camera at the barcode.'}
                </T>
              </>
            ) : permission ? (
              <T size={14} color={Palette.inkSoft}>
                {"The camera isn't available (no permission, or a simulator). Type the number instead."}
              </T>
            ) : null}
            <Card bordered style={{ gap: 8 }}>
              <Eyebrow text="Or type the number" />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <RetroTextField
                  placeholder="e.g. 036000411287"
                  value={typedCode}
                  onChangeText={setTypedCode}
                  onSubmitEditing={() => handle(typedCode)}
                  keyboardType="number-pad"
                  style={{ flex: 1 }}
                />
                <TextButton title="Look up" color={Palette.mintDeep} onPress={() => handle(typedCode)} />
              </View>
            </Card>
          </>
        ) : looking ? (
          <Card bordered style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={Palette.mintDeep} />
            <T size={15} weight="bold">{`Looking up ${code}…`}</T>
          </Card>
        ) : (
          <Card bordered>
            <Eyebrow text={`${statusLabel(info)} · UPC ${code}`} color={Palette.mintDeep} />
            <RetroTextField placeholder="What is it?" value={name} onChangeText={setName} autoFocus={!info?.found} />
            {!info?.found && (
              <T size={13} color={Palette.inkSoft}>
                {info?.incomplete
                  ? "Couldn't reach the barcode databases right now. Type what it is and every phone will remember it."
                  : 'Type what it is once — every phone will remember this barcode from now on.'}
              </T>
            )}

            {mode === 'grocery' ? (
              <>
                <T size={13} color={Palette.inkSoft}>
                  {learned
                    ? `Usually from ${learned.store.name} — ${learned.trips} of ${learned.total} past trips`
                    : "First time buying this — pick a store and it'll remember."}
                </T>
                <Eyebrow text="Get it from" />
                <Flow>
                  {s.stores.map((st) => (
                    <Pill
                      key={st.id}
                      label={st.name + (learned?.store.id === st.id ? ' ★' : '')}
                      selected={storeID === st.id}
                      dotHex={st.color}
                      onPress={() => setStoreID(st.id)}
                    />
                  ))}
                </Flow>
                <PrimaryButton
                  title={saving ? 'Adding…' : chosen ? `Add to ${chosen.name} list` : 'Pick a store'}
                  fill={Palette.mintDeep}
                  disabled={!chosen || !named || saving}
                  onPress={() => void addToGroceries()}
                />
              </>
            ) : (
              <>
                <T size={13} color={Palette.inkSoft}>
                  {onHand ? `In the pantry now: ${onHand.quantity}` : 'New to the pantry.'}
                </T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <T size={15} weight="bold" style={{ flex: 1 }}>How many?</T>
                  <Stepper value={count} onChange={setCount} />
                </View>
                <PrimaryButton
                  title={saving ? 'Adding…' : `Add ${count} to pantry`}
                  fill={Palette.mintDeep}
                  disabled={!named || saving}
                  onPress={() => void addToPantry()}
                />
              </>
            )}
            <TextButton title="Scan something else" onPress={reset} />
          </Card>
        )}
      </Page>
    </>
  );
}

function statusLabel(info: ProductInfo | null): string {
  if (info?.source === 'household') return 'Remembered';
  if (info?.found) return 'Found';
  if (info?.incomplete) return 'Lookup unavailable';
  return 'Not in the database';
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const button = (icon: 'remove' | 'add', next: number, label: string) => (
    <Pressable
      onPress={() => onChange(Math.max(1, next))}
      accessibilityLabel={label}
      style={{
        width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: Palette.ink, backgroundColor: Palette.paper,
      }}
    >
      <Ionicons name={icon} size={18} color={Palette.ink} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {button('remove', value - 1, 'One fewer')}
      <T size={18} weight="bold" style={{ minWidth: 24, textAlign: 'center' }}>{String(value)}</T>
      {button('add', value + 1, 'One more')}
    </View>
  );
}
