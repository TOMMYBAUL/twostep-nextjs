"use client";

import { useState } from "react";
import { Drawer } from "vaul";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    merchantId: string;
};

export function SuggestionDrawer({ open, onOpenChange, merchantId }: Props) {
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async () => {
        if (!text.trim() || sending) return;
        setSending(true);
        try {
            await fetch("/api/suggestions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ merchant_id: merchantId, text: text.trim() }),
            });
            setSent(true);
            setTimeout(() => {
                onOpenChange(false);
                setSent(false);
                setText("");
            }, 1500);
        } catch {
            // Silent fail
        } finally {
            setSending(false);
        }
    };

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 z-[60] bg-overlay" />
                <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-2xl bg-secondary" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-describedby={undefined}>
                    <Drawer.Title className="sr-only">Suggérer une amélioration</Drawer.Title>
                    <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-quaternary" />
                    <div className="p-5 pb-6">
                        {sent ? (
                            <div className="py-8 text-center">
                                <div className="text-3xl">🙏</div>
                                <p className="mt-2 text-sm font-semibold text-primary">Merci pour votre suggestion !</p>
                            </div>
                        ) : (
                            <>
                                <h3 className="text-[15px] font-semibold text-primary">
                                    Aidez cette boutique à s&apos;améliorer
                                </h3>
                                <p className="mt-1 text-xs text-tertiary">
                                    Votre message est privé et sera relu avant d&apos;être transmis.
                                </p>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value.slice(0, 500))}
                                    placeholder="Ex : Ce serait super d'avoir plus de photos des produits…"
                                    className="mt-3 w-full rounded-xl border border-secondary bg-primary px-4 py-3 text-sm text-primary placeholder:text-placeholder focus:border-brand focus:outline-none"
                                    rows={3}
                                />
                                <div className="mt-1 text-right text-[10px] text-quaternary">
                                    {text.length}/500
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={!text.trim() || sending}
                                    className="mt-3 w-full rounded-xl bg-brand-solid py-3 text-sm font-semibold text-white transition active:opacity-80 disabled:opacity-40"
                                >
                                    {sending ? "Envoi…" : "Envoyer"}
                                </button>
                            </>
                        )}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}
