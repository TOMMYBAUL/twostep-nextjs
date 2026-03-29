"use client";

export function BackButton() {
    return (
        <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-sm text-[#8E96B0] hover:text-[#1A1F36] cursor-pointer mb-8"
        >
            ← Retour
        </button>
    );
}
