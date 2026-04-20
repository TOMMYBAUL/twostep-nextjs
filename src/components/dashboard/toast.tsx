"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cx } from "@/utils/cx";

type ToastType = "success" | "error";

interface ToastAction {
    label: string;
    onClick: () => void;
}

interface ToastOptions {
    type?: ToastType;
    duration?: number;
    action?: ToastAction;
}

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    action?: ToastAction;
}

interface ToastContextValue {
    toast: (message: string, typeOrOptions?: ToastType | ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback((message: string, typeOrOptions?: ToastType | ToastOptions) => {
        const id = Date.now() + Math.random();
        const opts: ToastOptions = typeof typeOrOptions === "string"
            ? { type: typeOrOptions }
            : (typeOrOptions ?? {});
        const type = opts.type ?? "success";
        const duration = opts.duration ?? (opts.action ? 5000 : 3000);

        setToasts((prev) => [...prev, { id, message, type, action: opts.action }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);

    const dismiss = (id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed right-4 bottom-20 z-50 flex flex-col gap-2 md:bottom-4" aria-live="polite">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        role="alert"
                        className={cx(
                            "animate-fade-up flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-lg",
                            t.type === "success"
                                ? "bg-success-solid text-white"
                                : "bg-error-solid text-white",
                        )}
                    >
                        <span>{t.message}</span>
                        {t.action && (
                            <button
                                type="button"
                                onClick={() => {
                                    t.action!.onClick();
                                    dismiss(t.id);
                                }}
                                className="shrink-0 rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/30 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                            >
                                {t.action.label}
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
