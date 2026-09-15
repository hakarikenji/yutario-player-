/**
 * Auth — branded Yutario lockup, hardened email OTP with 6-digit code
 * blocks, local inbox preview, and instant guest sandbox.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Music4, Mail, ArrowLeft, Loader2, KeyRound, UserRound } from "lucide-react";
import { useAuth, useOtpInboxListener } from "../state/auth";
import { Button, useToast } from "../ui/primitives";
import { cn } from "../lib/utils";

const CODE_LEN = 6;

export function AuthPage({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inboxCode, setInboxCode] = useState<string | null>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Surface codes delivered by the local OTP transport.
  useOtpInboxListener((addr, code) => {
    if (addr === email.trim().toLowerCase()) {
      setInboxCode(code);
    }
  });

  useEffect(() => {
    if (mode === "code") inputsRef.current[0]?.focus();
  }, [mode]);

  useEffect(() => {
    if (auth.user) onDone();
  }, [auth.user, onDone]);

  const submitEmail = async () => {
    setBusy(true);
    setError(null);
    const res = await auth.sendOtp(email);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong");
      return;
    }
    setMode("code");
  };

  const submitCode = async (code?: string) => {
    const full = (code ?? digits.join("")).trim();
    if (full.length !== CODE_LEN) return;
    setBusy(true);
    setError(null);
    const res = await auth.signInWithOtp(email, full);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Invalid code");
      setDigits(Array(CODE_LEN).fill(""));
      inputsRef.current[0]?.focus();
      return;
    }
    toast("Welcome to Yutario", "success");
    onDone();
  };

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < CODE_LEN - 1) inputsRef.current[i + 1]?.focus();
    const joined = next.join("");
    if (joined.length === CODE_LEN && !next.includes("")) void submitCode(joined);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < CODE_LEN - 1) inputsRef.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LEN);
    if (!text) return;
    e.preventDefault();
    const next = Array(CODE_LEN).fill("");
    text.split("").forEach((c, i) => (next[i] = c));
    setDigits(next);
    if (text.length === CODE_LEN) void submitCode(text);
  };

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden px-5">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[480px] bg-aura-radial" />
        <div className="absolute -right-24 bottom-10 h-72 w-72 rounded-full bg-aura-700/15 blur-3xl animate-pulse-aura" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col">
        <button
          onClick={() => (mode === "code" ? setMode("email") : history.back())}
          className="mt-6 flex h-10 w-10 items-center justify-center rounded-full text-silver hover:bg-white/5 hover:text-white"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Brand lockup */}
        <div className="mt-6 flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative"
          >
            <div className="absolute inset-0 -z-10 m-auto h-20 w-20 rounded-full bg-aura-600/40 blur-2xl animate-pulse-aura" />
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-aura-btn shadow-aura-lg">
              <Music4 size={34} className="text-white" />
            </div>
          </motion.div>
          <h1 className="mt-5 text-2xl font-black tracking-tight text-white">Yutario Player</h1>
          <p className="mt-1 text-sm text-silver">
            {mode === "email" ? "Sign in to sync your aura" : `Code sent to ${email}`}
          </p>
        </div>

        {mode === "email" ? (
          <div className="mt-8 space-y-3">
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-silver-dim" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submitEmail()}
                placeholder="you@aura.fm"
                className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.05] pl-11 pr-4 text-sm font-medium text-white placeholder:text-silver-dim focus:border-aura-500/50 focus:outline-none focus:ring-2 focus:ring-aura-500/20"
              />
            </div>
            {error && <p className="px-1 text-xs text-red-300">{error}</p>}
            <Button size="lg" className="w-full" glow disabled={busy || !email.includes("@")} onClick={() => void submitEmail()}>
              {busy ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={16} />}
              Continue with Email
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-silver-dim">
              We email a 6-digit one-time code. No passwords, ever.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputsRef.current[i] = el;
                  }}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  className={cn(
                    "h-14 w-12 rounded-2xl border bg-white/[0.05] text-center text-xl font-black text-white transition-all",
                    "focus:border-aura-500/60 focus:outline-none focus:ring-2 focus:ring-aura-500/25",
                    d ? "border-aura-500/50 shadow-aura-sm" : "border-white/10"
                  )}
                />
              ))}
            </div>
            {inboxCode && (
              <button
                onClick={() => {
                  const next = Array(CODE_LEN).fill("");
                  inboxCode.split("").forEach((c, i) => (next[i] = c));
                  setDigits(next);
                  void submitCode(inboxCode);
                }}
                className="mx-auto block rounded-xl border border-aura-500/30 bg-aura-500/10 px-3 py-1.5 text-xs font-semibold text-aura-200 hover:bg-aura-500/20"
              >
                Dev inbox: {inboxCode} — tap to autofill
              </button>
            )}
            {error && <p className="text-center text-xs text-red-300">{error}</p>}
            <Button size="lg" className="w-full" glow disabled={busy || digits.some((d) => !d)} onClick={() => void submitCode()}>
              {busy ? <Loader2 size={17} className="animate-spin" /> : "Verify & Enter"}
            </Button>
            <button
              onClick={() => void auth.sendOtp(email)}
              className="mx-auto block text-xs font-semibold text-aura-400 hover:text-aura-300"
            >
              Resend code
            </button>
          </div>
        )}

        {/* Guest */}
        <div className="mt-auto pb-[max(env(safe-area-inset-bottom),28px)] pt-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-silver-dim">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => { auth.continueAsGuest(); onDone(); }}>
            <UserRound size={16} /> Continue as Guest
          </Button>
          <p className="mt-2.5 text-center text-[11px] text-silver-dim">
            Full playback, device library & AI — sessions persist locally.
          </p>
        </div>
      </div>
    </div>
  );
}
