let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (audioCtx) return audioCtx;
    try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        audioCtx = new Ctor();
        return audioCtx;
    } catch {
        return null;
    }
}

export function playScanFeedback() {
    if (typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReducedMotion && "vibrate" in navigator) {
        try { navigator.vibrate(50); } catch { /* not critical */ }
    }

    const ctx = getCtx();
    if (!ctx || ctx.state === "suspended") return;

    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.09);
    } catch {
        // AudioContext blocked or failed — silent fallback
    }
}
