import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Card, Eyebrow, Flow, Page, Pill, PrimaryButton, RetroTextField, T, TextButton } from '../components/ui';
import type { UUID } from '../lib/types';
import { useHub } from '../state/household';
import * as sel from '../state/selectors';
import { Palette } from '../theme/theme';

/** Scan a UPC → look it up → pick (or accept the learned) store → add to the list. */
export default function ScanScreen() {
  const s = useHub();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState<string | null>(null);
  const [typedCode, setTypedCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [name, setName] = useState('');
  const [found, setFound] = useState(false);
  const [storeID, setStoreID] = useState<UUID | null>(null);
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
    setStoreID(sel.suggestion(useHub.getState(), `upc:${digits}`)?.store.id ?? null);
    void (async () => {
      const info = await useHub.getState().lookup(digits);
      if (info?.found && info.name) {
        const brand = info.brand?.trim();
        setName(brand && !info.name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${info.name}` : info.name);
        setFound(true);
      } else {
        setName('');
        setFound(false);
      }
      setLooking(false);
    })();
  };

  const reset = () => {
    fired.current = false;
    setCode(null);
    setTypedCode('');
    setName('');
    setFound(false);
    setStoreID(null);
  };

  const learned = code ? sel.suggestion(s, `upc:${code}`) : null;
  const chosen = sel.store(s, storeID);
  const canAdd = !!chosen && !!name.trim() && !!code;

  return (
    <>
      <Stack.Screen options={{ headerLeft: () => <TextButton title="Close" onPress={() => router.back()} /> }} />
      <Page>
        {!code ? (
          <>
            {permission?.granted ? (
              <>
                <View style={{ height: 240, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: Palette.ink }}>
                  <CameraView
                    style={{ flex: 1 }}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
                    onBarcodeScanned={({ data }) => {
                      if (fired.current) return;
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      handle(data);
                    }}
                  />
                </View>
                <T size={14} color={Palette.inkSoft}>Point the camera at the barcode.</T>
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
            <Eyebrow text={found ? `Found · UPC ${code}` : `Not in the database · UPC ${code}`} color={Palette.mintDeep} />
            <RetroTextField placeholder="What is it?" value={name} onChangeText={setName} />
            <T size={13} color={Palette.inkSoft}>
              {learned
                ? `Usually from ${learned.store.name} — ${learned.trips} of ${learned.total} past trips`
                : "First time scanning this — pick a store and it'll remember."}
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
              title={chosen ? `Add to ${chosen.name} list` : 'Pick a store'}
              fill={Palette.mintDeep}
              disabled={!canAdd}
              onPress={async () => {
                if (!canAdd) return;
                await s.addGrocery(name, code, storeID);
                router.back();
              }}
            />
            <TextButton title="Scan another" onPress={reset} />
          </Card>
        )}
      </Page>
    </>
  );
}
