"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DetectedHandler = (ean: string) => void;
type ErrorHandler = (reason: "permission" | "not_found" | "decoder" | "other", err?: unknown) => void;

interface UseBarcodeScannerOptions {
    enabled: boolean;
    onDetected: DetectedHandler;
    onError?: ErrorHandler;
}

interface UseBarcodeScannerResult {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    supported: boolean | null; // null until probed
    usingNative: boolean | null;
}

interface NativeBarcodeDetector {
    detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

interface BarcodeDetectorConstructor {
    new (options: { formats: string[] }): NativeBarcodeDetector;
}

const SUPPORTED_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
const DEDUP_WINDOW_MS = 2000;

export function useBarcodeScanner({ enabled, onDetected, onError }: UseBarcodeScannerOptions): UseBarcodeScannerResult {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number | null>(null);
    const lastHitRef = useRef<{ ean: string; at: number } | null>(null);
    const stopFallbackRef = useRef<(() => void) | null>(null);
    const [supported, setSupported] = useState<boolean | null>(null);
    const [usingNative, setUsingNative] = useState<boolean | null>(null);

    const emit = useCallback((ean: string) => {
        const now = Date.now();
        const last = lastHitRef.current;
        if (last && last.ean === ean && now - last.at < DEDUP_WINDOW_MS) return;
        lastHitRef.current = { ean, at: now };
        onDetected(ean);
    }, [onDetected]);

    useEffect(() => {
        if (!enabled) return;

        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            setSupported(false);
            onError?.("not_found");
            return;
        }

        let cancelled = false;

        (async () => {
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
                    audio: false,
                });
            } catch (err) {
                if (cancelled) return;
                const name = (err as { name?: string } | null)?.name;
                setSupported(false);
                onError?.(name === "NotAllowedError" ? "permission" : "not_found", err);
                return;
            }

            if (cancelled) {
                stream.getTracks().forEach((t) => t.stop());
                return;
            }

            streamRef.current = stream;
            const videoEl = videoRef.current;
            if (!videoEl) return;
            videoEl.srcObject = stream;
            try { await videoEl.play(); } catch { /* autoplay race — safe to ignore */ }

            const NativeDetector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;

            if (NativeDetector) {
                setUsingNative(true);
                setSupported(true);
                const detector = new NativeDetector({ formats: SUPPORTED_FORMATS });
                const tick = async () => {
                    if (cancelled) return;
                    try {
                        const codes = await detector.detect(videoEl);
                        if (codes?.[0]?.rawValue) emit(codes[0].rawValue);
                    } catch {
                        // transient decode errors are expected
                    }
                    rafRef.current = requestAnimationFrame(tick);
                };
                rafRef.current = requestAnimationFrame(tick);
                return;
            }

            setUsingNative(false);
            try {
                const mod = await import("@zxing/browser");
                if (cancelled) return;
                const reader = new mod.BrowserMultiFormatReader();
                const controls = await reader.decodeFromVideoElement(videoEl, (result) => {
                    if (!result) return;
                    const text = result.getText();
                    if (text) emit(text);
                });
                stopFallbackRef.current = () => controls.stop();
                setSupported(true);
            } catch (err) {
                if (cancelled) return;
                setSupported(false);
                onError?.("decoder", err);
            }
        })();

        return () => {
            cancelled = true;
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            stopFallbackRef.current?.();
            stopFallbackRef.current = null;
            const stream = streamRef.current;
            if (stream) {
                stream.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, [enabled, emit, onError]);

    return { videoRef, supported, usingNative };
}
