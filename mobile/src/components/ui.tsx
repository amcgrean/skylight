import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';

import type { Member } from '../lib/types';
import { AppFont, Palette, type Weight } from '../theme/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// MARK: - Text

/** Text in the app's body font. */
export function T({ size = 15, weight = 'semibold', color = Palette.ink, style, ...rest }: TextProps & {
  size?: number;
  weight?: Weight;
  color?: string;
}) {
  return <Text {...rest} style={[AppFont.body(size, weight), { color }, style]} />;
}

export function Eyebrow({ text, color = Palette.inkSoft }: { text: string; color?: string }) {
  return (
    <T size={11} weight="bold" color={color} style={{ letterSpacing: 1.1 }}>
      {text.toUpperCase()}
    </T>
  );
}

export function ScreenHeader({ eyebrow, title, trailing }: { eyebrow: string; title: string; trailing?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Eyebrow text={eyebrow} />
        <Text style={[AppFont.script(28), { color: Palette.mintDeep }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {title}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

// MARK: - Layout

/** Shared page scaffold: cream background, scrolling content, consistent padding. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Palette.cream }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 14 }}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, fill = Palette.paper, bordered = false, padding = 16, style }: {
  children: ReactNode;
  fill?: string;
  bordered?: boolean;
  padding?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { backgroundColor: fill, borderRadius: 20, padding, gap: 12 },
        bordered && { borderWidth: 1, borderColor: Palette.line },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Wrapping row for chips. */
export function Flow({ children, gap = 6 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{children}</View>;
}

// MARK: - People

export function Avatar({ member, size = 30, outlined = false }: { member: Member; size?: number; outlined?: boolean }) {
  return (
    <View
      accessibilityLabel={member.name}
      style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: member.color,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: outlined ? 2 : 0, borderColor: Palette.ink,
      }}
    >
      {member.kind === 'pets' ? (
        <Ionicons name="paw" size={size * 0.46} color={Palette.ink} />
      ) : (
        <T size={size * 0.44} weight="bold">{member.name.slice(0, 1)}</T>
      )}
    </View>
  );
}

export function AvatarStack({ members }: { members: Member[] }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {members.map((m, i) => (
        <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: 17, borderWidth: 2, borderColor: Palette.cream }}>
          <Avatar member={m} size={30} />
        </View>
      ))}
    </View>
  );
}

export function ColorDot({ hex, size = 10, outlined = true }: { hex: string; size?: number; outlined?: boolean }) {
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: hex,
        borderWidth: outlined ? 1.5 : 0, borderColor: Palette.ink,
      }}
    />
  );
}

// MARK: - Controls

export function CheckCircle({ done, fill = Palette.mintDeep, square = false, size = 24 }: {
  done: boolean;
  fill?: string;
  square?: boolean;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size, height: size, borderRadius: square ? 6 : size / 2, borderWidth: 2, borderColor: Palette.ink,
        backgroundColor: done ? fill : 'transparent', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {done && <Ionicons name="checkmark-sharp" size={size * 0.62} color={square ? '#FFFFFF' : Palette.ink} />}
    </View>
  );
}

/** Rounded chip used for filters, tags and choices. */
export function Pill({ label, selected = false, selectedFill = Palette.ink, selectedText = Palette.cream, dotHex, icon, onPress }: {
  label: string;
  selected?: boolean;
  selectedFill?: string;
  selectedText?: string;
  dotHex?: string;
  icon?: IconName;
  onPress: () => void;
}) {
  const color = selected ? selectedText : Palette.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 38, borderRadius: 19,
        backgroundColor: selected ? selectedFill : Palette.paper,
        borderWidth: 2, borderColor: selected ? Palette.ink : Palette.lineDark,
      }}
    >
      {dotHex && <ColorDot hex={dotHex} />}
      <T size={13} weight="bold" color={color}>{label}</T>
      {icon && <Ionicons name={icon} size={12} color={color} />}
    </Pressable>
  );
}

export function PrimaryButton({ title, fill = Palette.pinkDeep, icon, disabled = false, onPress }: {
  title: string;
  fill?: string;
  icon?: IconName;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 14,
        backgroundColor: fill, opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {icon && <Ionicons name={icon} size={18} color="#FFFFFF" />}
      <T size={16} weight="bold" color="#FFFFFF">{title}</T>
    </Pressable>
  );
}

export function OutlineButton({ title, icon, onPress, style }: {
  title: string;
  icon?: IconName;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 14,
          backgroundColor: Palette.paper, borderWidth: 2, borderColor: Palette.ink, opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={18} color={Palette.ink} />}
      <T size={15} weight="bold">{title}</T>
    </Pressable>
  );
}

/** Plain text button, e.g. "Clear checked items". */
export function TextButton({ title, color = Palette.pinkDeep, onPress }: { title: string; color?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <T size={14} weight="bold" color={color}>{title}</T>
    </Pressable>
  );
}

export function RetroTextField({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={Palette.inkSoft}
      returnKeyType="done"
      {...props}
      style={[
        AppFont.body(16, 'semibold'),
        {
          color: Palette.ink, paddingHorizontal: 12, minHeight: 46, borderRadius: 12,
          backgroundColor: Palette.paper, borderWidth: 2, borderColor: Palette.ink,
        },
        style,
      ]}
    />
  );
}

export function ProgressBar({ value, color, track = Palette.paper }: { value: number; color: string; track?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: track, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

// MARK: - Toast

export function Toast({ text }: { text: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12,
        borderRadius: 14, backgroundColor: Palette.ink,
        shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
      }}
    >
      <ColorDot hex="#EE8FA8" size={8} outlined={false} />
      <T size={14} weight="bold" color={Palette.cream} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}
