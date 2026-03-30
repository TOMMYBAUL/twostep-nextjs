"use client";

import { useState, useRef, useEffect } from "react";
import { useToast } from "@/components/dashboard/toast";
import { useMerchant } from "@/hooks/use-merchant";

function TrashIcon() {
    return (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
    );
}

export default function StoriesPage() {
    const { merchant } = useMerchant();
    const { toast } = useToast();

    const fileRef = useRef<HTMLInputElement>(null);
    const [caption, setCaption] = useState("");
    const [preview, setPreview] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const [stories, setStories] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const fetchStories = async () => {
        if (!merchant?.id) return;
        const res = await fetch(`/api/stories?merchant_ids=${merchant.id}`);
        if (res.ok) {
            const data = await res.json();
            setStories(data.stories ?? []);
        }
        setLoaded(true);
    };

    useEffect(() => {
        if (merchant?.id && !loaded) {
            fetchStories();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [merchant?.id]);

    const handleCreate = async () => {
        if (!file || isCreating) return;
        setIsCreating(true);
        try {
            const formData = new FormData();
            formData.append("image", file);
            if (caption.trim()) formData.append("caption", caption.trim());
            const res = await fetch("/api/stories", { method: "POST", body: formData });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Échec de la publication");
            }
            if (preview) URL.revokeObjectURL(preview);
            setFile(null);
            setPreview(null);
            setCaption("");
            fetchStories();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Échec de la publication", "error");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        await fetch(`/api/stories/${id}`, { method: "DELETE" });
        fetchStories();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (preview) URL.revokeObjectURL(preview);
        setFile(f);
        setPreview(URL.createObjectURL(f));
    };

    return (
        <div>
            {/* Page Header */}
            <div className="border-b border-[#E2E5F0] bg-white px-4 py-5 md:px-8">
                <h1 className="text-lg font-bold text-[#1A1F36]">Stories</h1>
                <p className="mt-0.5 text-[13px] text-[#8E96B0]">Partagez des moments avec vos clients</p>
            </div>

            <div className="px-4 pb-8 pt-6 md:px-8">
                {/* Create form */}
                <div className="mb-8 rounded-2xl bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-sm font-bold text-[#1A1F36]">Publier une story</h3>

                    <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

                    {preview ? (
                        <div className="relative mb-4 overflow-hidden rounded-xl">
                            <img src={preview} alt="Aperçu" className="max-h-48 w-full rounded-xl object-cover" />
                            <button
                                type="button"
                                onClick={() => { setFile(null); setPreview(null); }}
                                className="absolute right-2 top-2 rounded-full bg-black/50 p-1"
                            >
                                <TrashIcon />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#E2E5F0] py-12 text-[#8E96B0] transition hover:border-[#4268FF] hover:text-[#4268FF]"
                        >
                            <span className="text-2xl">📷</span>
                            <span className="text-sm">Ajouter une photo</span>
                        </button>
                    )}

                    <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value.slice(0, 280))}
                        placeholder="Texte (optionnel)"
                        className="mb-2 w-full resize-none rounded-xl border border-[#E2E5F0] px-3.5 py-3 text-sm text-[#1A1F36] placeholder:text-[#8E96B0] focus:border-[#4268FF] focus:outline-none"
                        rows={2}
                    />
                    <p className="mb-4 text-right text-[10px] text-[#8E96B0]">{caption.length} / 280</p>

                    <div className="mb-4 rounded-xl bg-[#EEF0FF] px-3.5 py-2.5 text-[11px] text-[#4268FF]">
                        Visible pendant 48h dans l&apos;app consommateur
                    </div>

                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={!file || isCreating}
                        className="w-full rounded-xl bg-[#4268FF] py-3.5 text-sm font-bold text-white transition disabled:opacity-50"
                    >
                        {isCreating ? "Publication..." : "Publier la story"}
                    </button>
                </div>

                {/* Active stories list */}
                {stories.length > 0 && (
                    <div>
                        <h3 className="mb-3 text-sm font-bold text-[#1A1F36]">Stories actives ({stories.length})</h3>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                            {stories.map((s: any) => {
                                const hoursLeft = Math.max(0, Math.round((new Date(s.expires_at).getTime() - Date.now()) / 3600_000));
                                return (
                                    <div key={s.id} className="relative overflow-hidden rounded-xl bg-white shadow-sm">
                                        <img src={s.image_url} alt="" className="aspect-[3/4] w-full object-cover" />
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
                                            {s.caption && <p className="line-clamp-2 text-[11px] text-white">{s.caption}</p>}
                                            <p className="mt-1 text-[9px] text-white/60">Expire dans {hoursLeft}h</p>
                                        </div>
                                        {confirmDeleteId === s.id ? (
                                            <div className="absolute right-2 top-2 flex items-center gap-1.5">
                                                <button type="button" onClick={() => { handleDelete(s.id); setConfirmDeleteId(null); }} className="rounded-full bg-red-500 px-2 py-1 text-[10px] font-semibold text-white">Supprimer</button>
                                                <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-full bg-black/50 px-2 py-1 text-[10px] text-white">Annuler</button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setConfirmDeleteId(s.id)}
                                                className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5"
                                            >
                                                <TrashIcon />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
