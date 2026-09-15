/**
 * Auth — hardened email OTP flow with pluggable transport, guest sandbox
 * mode, and continuous local sessions (no re-login loops).
 *
 * Transport: `LocalInboxOtpTransport` ships as the dev/demo delivery
 * channel (codes surface in the UI inbox + console). A server transport
 * (e.g. Resend-backed API route) implements the same interface for
 * production — swap via `configureOtpTransport`.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { storageGet, storageSet, storageRemove } from "../lib/storage";
import { uid } from "../lib/utils";
import type { UserProfile } from "../lib/types";

const SESSION_KEY = "auth_session";

export interface OtpTransport {
  send(email: string, code: string): Promise<{ ok: boolean; error?: string }>;
}

/** Dev transport: surfaces the OTP locally (no server needed). */
export class LocalInboxOtpTransport implements OtpTransport {
  private listeners = new Set<(email: string, code: string) => void>();
  onCode(fn: (email: string, code: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  async send(email: string, code: string): Promise<{ ok: boolean }> {
    // eslint-disable-next-line no-console
    console.info(`[yutario][otp] ${code} → ${email} (local inbox)`);
    this.listeners.forEach((fn) => fn(email, code));
    return { ok: true };
  }
}

const localTransport = new LocalInboxOtpTransport();
let transport: OtpTransport = localTransport;

export function configureOtpTransport(next: OtpTransport): void {
  transport = next;
}

export function useOtpInboxListener(fn: (email: string, code: string) => void): () => void {
  // Stable across renders: localTransport is a module singleton.
  return localTransport.onCode(fn);
}

interface AuthContextValue {
  user: UserProfile | null;
  ready: boolean;
  pendingEmail: string | null;
  otpSent: boolean;
  sendOtp: (email: string) => Promise<{ ok: boolean; error?: string }>;
  verifyOtp: (email: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  continueAsGuest: () => void;
  signInWithOtp: (email: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
  isGuest: boolean;
  /** Codes delivered by the local transport, for the dev inbox UI. */
  inbox: { email: string; code: string; at: number }[];
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface StoredSession {
  user: UserProfile;
  otpCodes: Record<string, { code: string; at: number }>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => storageGet<StoredSession | null>(SESSION_KEY, null));
  const [ready] = useState(true);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [inbox, setInbox] = useState<{ email: string; code: string; at: number }[]>([]);

  const persist = (next: StoredSession | null) => {
    setSession(next);
    if (next) storageSet(SESSION_KEY, next);
    else storageRemove(SESSION_KEY);
  };

  const sendOtp = useCallback(async (email: string) => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      return { ok: false, error: "Enter a valid email address" };
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const res = await transport.send(clean, code);
    if (!res.ok) return { ok: false, error: res.error ?? "Could not send code" };
    setSession((prev) => {
      const next: StoredSession = {
        user: prev?.user ?? (null as unknown as UserProfile),
        otpCodes: { ...(prev?.otpCodes ?? {}), [clean]: { code, at: Date.now() } },
      };
      // Don't persist a null user — only in-memory.
      if (prev?.user) storageSet(SESSION_KEY, next);
      return next;
    });
    setPendingEmail(clean);
    setOtpSent(true);
    return { ok: true };
  }, []);

  const verifyOtp = useCallback(
    (email: string, code: string) => {
      const clean = email.trim().toLowerCase();
      const record = session?.otpCodes?.[clean];
      if (!record) return Promise.resolve({ ok: false, error: "Request a new code" });
      if (Date.now() - record.at > 10 * 60_000) return Promise.resolve({ ok: false, error: "Code expired — request a new one" });
      if (record.code !== code.trim()) return Promise.resolve({ ok: false, error: "Incorrect code" });
      const user: UserProfile = {
        id: uid("u"),
        email: clean,
        displayName: clean.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        avatarSeed: clean,
        provider: "otp",
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      };
      persist({ user, otpCodes: {} });
      setPendingEmail(null);
      setOtpSent(false);
      return Promise.resolve({ ok: true });
    },
    [session]
  );

  const signInWithOtp = useCallback(
    async (email: string, code: string) => verifyOtp(email, code),
    [verifyOtp]
  );

  const continueAsGuest = useCallback(() => {
    const user: UserProfile = {
      id: uid("guest"),
      email: "",
      displayName: "Guest Listener",
      avatarSeed: uid("g"),
      provider: "guest",
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    persist({ user, otpCodes: {} });
  }, []);

  const signOut = useCallback(() => {
    persist(null);
    setPendingEmail(null);
    setOtpSent(false);
  }, []);

  // Route codes from the local transport into the inbox UI state.
  const bindTransport = useRef(false);
  if (!bindTransport.current) {
    bindTransport.current = true;
    localTransport.onCode((email, code) => {
      setInbox((prev) => [{ email, code, at: Date.now() }, ...prev].slice(0, 5));
    });
  }

  const user = session?.user ?? null;
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      pendingEmail,
      otpSent,
      sendOtp,
      verifyOtp,
      continueAsGuest,
      signInWithOtp,
      signOut,
      isGuest: user?.provider === "guest",
      inbox,
    }),
    [user, ready, pendingEmail, otpSent, sendOtp, verifyOtp, continueAsGuest, signInWithOtp, signOut, inbox]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
