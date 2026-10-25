import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; tone: Tone }

interface ToastValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);
let sequence = 0;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback((message: string, tone: Tone, ttl: number) => {
    sequence += 1;
    const id = sequence;
    setToasts((list) => [...list, { id, message, tone }]);
    window.setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  const value = useMemo<ToastValue>(() => ({
    success: (message) => push(message, 'success', 3500),
    error: (message) => push(message, 'error', 6000),
    info: (message) => push(message, 'info', 4000),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <button key={toast.id} type="button" className={`toast toast--${toast.tone}`} onClick={() => dismiss(toast.id)}>
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastValue => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
};
