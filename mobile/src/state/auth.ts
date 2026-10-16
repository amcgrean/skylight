import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import { supabase } from '../lib/supabase';
import { errorMessage, type UUID } from '../lib/types';

export type ClaimableAdult = { id: UUID; name: string; color: string };
export type AuthPhase = 'starting' | 'signedOut' | 'needsLink' | 'ready';

type AuthState = {
  phase: AuthPhase;
  errorMessage: string | null;
  isDemo: boolean;
  start: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  refreshLink: () => Promise<void>;
  claimableAdults: (code: string) => Promise<ClaimableAdult[]>;
  claim: (code: string, memberID: UUID) => Promise<void>;
  signOut: () => Promise<void>;
};

/** A network failure (offline, timeout) as opposed to the server saying no. */
function isNetworkError(e: unknown): boolean {
  const msg = errorMessage(e).toLowerCase();
  return msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('offline');
}

/** Sign in with Apple → Supabase session → link the account to Aaron or Makala. */
export const useAuth = create<AuthState>()((set, get) => ({
  phase: 'starting',
  errorMessage: null,
  isDemo: supabase === null,

  start: async () => {
    if (!supabase) {
      set({ phase: 'ready' });
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) await get().refreshLink();
    else set({ phase: 'signedOut' });
  },

  signInWithApple: async () => {
    if (!supabase) return;
    set({ errorMessage: null });
    try {
      // Apple gets the SHA-256 of the nonce; Supabase gets the raw value to check it.
      const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
        nonce: hashed,
      });
      if (!credential.identityToken) {
        set({ errorMessage: "Apple didn't return a sign-in token. Try again." });
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) throw error;
      await get().refreshLink();
    } catch (e) {
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      set({ errorMessage: errorMessage(e) });
    }
  },

  refreshLink: async () => {
    if (!supabase) {
      set({ phase: 'ready' });
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      const userID = data.session?.user.id;
      if (!userID) {
        set({ phase: 'signedOut' });
        return;
      }
      const { data: mine, error } = await supabase.from('members').select('id').eq('user_id', userID).limit(1);
      if (error) throw error;
      set({ phase: mine.length ? 'ready' : 'needsLink' });
    } catch (e) {
      // Offline or a timeout shouldn't sign anyone out: keep going if we still hold a session;
      // if it's truly invalid, loading will fail and the retry screen appears.
      const { data } = await supabase.auth.getSession();
      if (data.session && isNetworkError(e)) {
        set({ phase: 'ready' });
      } else {
        set({ errorMessage: errorMessage(e), phase: 'signedOut' });
      }
    }
  },

  claimableAdults: async (code) => {
    if (!supabase) return [];
    set({ errorMessage: null });
    const { data, error } = await supabase.rpc('unclaimed_adults', { p_invite_code: code });
    if (error) {
      set({ errorMessage: error.message });
      return [];
    }
    return (data ?? []) as ClaimableAdult[];
  },

  claim: async (code, memberID) => {
    if (!supabase) return;
    const { error } = await supabase.rpc('claim_member', { p_invite_code: code, p_member_id: memberID });
    if (error) set({ errorMessage: error.message });
    else set({ phase: 'ready' });
  },

  signOut: async () => {
    if (!supabase) return;
    await supabase.removeAllChannels();
    await supabase.auth.signOut();
    set({ phase: 'signedOut' });
  },
}));
