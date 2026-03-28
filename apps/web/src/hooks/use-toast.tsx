"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { X, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number; // ms, default 5000
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// ─── Variant styles ───────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<
  ToastVariant,
  { container: string; progress: string; icon: React.ReactNode }
> = {
  success: {
    container: "border-green-700/60 bg-zinc-900",
    progress: "bg-green-500",
    icon: <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />,
  },
  error: {
    container: "border-red-700/60 bg-zinc-900",
    progress: "bg-red-500",
    icon: <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />,
  },
  warning: {
    container: "border-yellow-600/60 bg-zinc-900",
    progress: "bg-yellow-500",
    icon: <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />,
  },
  info: {
    container: "border-blue-600/60 bg-zinc-900",
    progress: "bg-blue-500",
    icon: <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />,
  },
};

// ─── Single toast item ────────────────────────────────────────────────────────

const DEFAULT_DURATION = 5000;

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const duration = toast.duration ?? DEFAULT_DURATION;
  const { container, progress, icon } = VARIANT_STYLES[toast.variant];

  // Track remaining time for the progress bar
  const [remaining, setRemaining] = useState(duration);
  const startedAt = useRef(Date.now());
  const frameRef = useRef<number>(0);
  const pausedAt = useRef<number | null>(null);

  useEffect(() => {
    function tick() {
      if (pausedAt.current !== null) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = Date.now() - startedAt.current;
      const left = duration - elapsed;
      if (left <= 0) {
        onDismiss(toast.id);
        return;
      }
      setRemaining(left);
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [duration, onDismiss, toast.id]);

  function pause() {
    if (pausedAt.current === null) {
      pausedAt.current = Date.now();
    }
  }

  function resume() {
    if (pausedAt.current !== null) {
      startedAt.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
    }
  }

  const pct = Math.max(0, (remaining / duration) * 100);

  return (
    <div
      className={`relative w-80 rounded-xl border shadow-2xl overflow-hidden pointer-events-auto ${container}`}
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      {/* Content */}
      <div className="flex items-start gap-3 px-4 py-3">
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-100">{toast.title}</p>
          {toast.description && (
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              {toast.description}
            </p>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="cursor-pointer shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-zinc-800">
        <div
          className={`h-full transition-none ${progress}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Toaster container ────────────────────────────────────────────────────────

function Toaster({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((opts: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...opts, id }]);
  }, []);

  const success = useCallback(
    (title: string, description?: string) => toast({ variant: "success", title, description }),
    [toast]
  );
  const error = useCallback(
    (title: string, description?: string) => toast({ variant: "error", title, description }),
    [toast]
  );
  const warning = useCallback(
    (title: string, description?: string) => toast({ variant: "warning", title, description }),
    [toast]
  );
  const info = useCallback(
    (title: string, description?: string) => toast({ variant: "info", title, description }),
    [toast]
  );

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info, dismiss }}>
      {children}
      <Toaster toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}
