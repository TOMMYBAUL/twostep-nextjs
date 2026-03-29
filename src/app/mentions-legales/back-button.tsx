"use client";

export function BackButton() {
    return (
        <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-sm text-[#8B7355] hover:text-[#2C1A0E] cursor-pointer mb-8"
        >
            ← Retour
        </button>
    );
}
