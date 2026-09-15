/**
 * Yutario UI primitives — aura-themed, motion-polished building blocks.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn, uid } from "../lib/utils";
import { useBackClose } from "../hooks/useBackClose";

/* ─── Button ───────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "ghost" | "outline" | "danger" | "subtle";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  glow?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-aura-500 to-aura-700 text-white shadow-cta border border-aura-400/40 hover:shadow-cta-lg hover:brightness-110 active:brightness-95",
  ghost: "bg-white/[0.06] text-white hover:bg-white/[0.12] border border-white/10 shadow-glass",
  outline: "bg-aura-500/[0.08] text-aura-200 border border-aura-500/45 hover:bg-aura-500/[0.16] shadow-aura-sm",
  danger: "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25",
  subtle: "bg-white/[0.03] text-silver hover:bg-white/[0.07] border border-transparent",
};

const SIZES = {
  sm: "h-10 px-4 text-[13px] rounded-xl gap-1.5",
  md: "h-12 px-6 text-sm rounded-2xl gap-2",
  lg: "h-14 px-7 text-[15px] rounded-2xl gap-2.5",
  xl: "h-16 px-9 text-base rounded-3xl gap-3",
};

export function Button({ variant = "primary", size = "md", glow, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-bold tracking-tight select-none",
        "transition-all duration-200 ease-out active:scale-[0.965]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
        "disabled:opacity-40 disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        glow && "animate-glow-breathe",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  className,
  active,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full",
        "transition-all duration-200 ease-out active:scale-90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-500/60",
        "disabled:opacity-40 disabled:pointer-events-none",
        active ? "text-aura-300 bg-aura-500/15 shadow-aura-sm" : "text-silver hover:text-white hover:bg-white/10",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ─── Chip ─────────────────────────────────────────────────────────────── */

export function Chip({
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 border",
        active
          ? "bg-aura-500/20 text-aura-200 border-aura-500/50 shadow-aura-sm"
          : "bg-white/[0.04] text-silver border-white/5 hover:bg-white/[0.08] hover:text-white",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ─── Skeleton ─────────────────────────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-2xl bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04] bg-[length:400px_100%]",
        className
      )}
    />
  );
}

/* ─── Sheet (bottom drawer) ────────────────────────────────────────────── */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  full?: boolean;
  /** Renders above other sheets (detail sheets opened from within a sheet). */
  elevated?: boolean;
}

export function Sheet({ open, onClose, title, children, full, elevated }: SheetProps) {
  const scrimZ = elevated ? "z-[80]" : "z-40";
  const panelZ = elevated ? "z-[85]" : "z-50";
  // Hardware/browser back closes the sheet (LIFO order) instead of leaving the app.
  useBackClose(open, `sheet-${title ?? "anon"}`, onClose);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={cn("fixed inset-0 bg-black/70 backdrop-blur-sm", scrimZ)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={cn(
              "fixed inset-x-0 bottom-0 mx-auto w-full max-w-md overflow-hidden rounded-t-3xl border-t border-white/10",
              "bg-ink-200/95 backdrop-blur-2xl shadow-[0_-24px_80px_rgba(0,0,0,0.6)]",
              full ? "h-[92dvh]" : "max-h-[85dvh]",
              panelZ
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div className="mx-auto h-1 w-10 rounded-full bg-white/15 absolute left-1/2 -translate-x-1/2 top-2" />
              {title && <h3 className="text-base font-bold text-white pt-2">{title}</h3>}
              <button
                onClick={onClose}
                className="ml-auto rounded-full p-2 text-silver hover:bg-white/10 hover:text-white transition-colors pt-2"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className={cn("overflow-y-auto px-5 pb-8", full ? "h-[calc(92dvh-56px)]" : "max-h-[calc(85dvh-64px)]")}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Toasts ───────────────────────────────────────────────────────────── */

interface Toast {
  id: string;
  text: string;
  kind: "info" | "success" | "error";
}

const ToastContext = createContext<{ toast: (text: string, kind?: Toast["kind"]) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = uid("t");
    setToasts((prev) => [...prev.slice(-2), { id, text, kind }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              className={cn(
                "pointer-events-auto max-w-sm rounded-2xl border px-4 py-2.5 text-sm font-medium backdrop-blur-xl shadow-xl",
                t.kind === "success" && "bg-emerald-500/15 border-emerald-500/30 text-emerald-200",
                t.kind === "error" && "bg-red-500/15 border-red-500/30 text-red-200",
                t.kind === "info" && "bg-ink-300/90 border-aura-500/30 text-white"
              )}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}

/* ─── Section header ───────────────────────────────────────────────────── */

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-3 flex items-end justify-between px-1">
      <h2 className="text-[17px] font-bold tracking-tight text-white">{title}</h2>
      {action && (
        <button onClick={onAction} className="text-xs font-semibold text-aura-400 hover:text-aura-300 transition-colors">
          {action}
        </button>
      )}
    </div>
  );
}
