"use client";

import { useCallback, useEffect, useState } from "react";

interface GeoPosition {
    lat: number;
    lng: number;
}

interface UseGeolocationReturn {
    position: GeoPosition | null;
    error: string | null;
    isLoading: boolean;
    refresh: () => void;
}

const TOULOUSE_DEFAULT: GeoPosition = { lat: 43.6047, lng: 1.4442 };

export function useGeolocation(): UseGeolocationReturn {
    const [position, setPosition] = useState<GeoPosition | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const requestPosition = useCallback(() => {
        if (typeof window === "undefined" || !navigator.geolocation) {
            console.warn("[geo] Geolocation API not available, using fallback");
            setError("Géolocalisation non supportée");
            setPosition(TOULOUSE_DEFAULT);
            setIsLoading(false);
            return;
        }

        // Check permission state if available (helps diagnose mobile Safari issues)
        if (navigator.permissions) {
            navigator.permissions.query({ name: "geolocation" }).then((result) => {
                console.log("[geo] Permission state:", result.state);
            }).catch(() => { /* permissions API not available on this browser */ });
        }

        console.log("[geo] Requesting position...");
        setIsLoading(true);

        // On mobile Safari, enableHighAccuracy can be slow or fail.
        // Strategy: try fast (low accuracy) first, then refine with GPS.
        let resolved = false;

        const onSuccess = (pos: GeolocationPosition, source: string) => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            console.log(`[geo] ${source} success:`, coords, `accuracy: ${pos.coords.accuracy}m`);
            setPosition(coords);
            setError(null);
            setIsLoading(false);
            resolved = true;
        };

        const onError = (err: GeolocationPositionError, source: string) => {
            const codeNames = { 1: "PERMISSION_DENIED", 2: "POSITION_UNAVAILABLE", 3: "TIMEOUT" } as Record<number, string>;
            console.warn(`[geo] ${source} error: ${codeNames[err.code] ?? err.code} — ${err.message}`);
            // Only use fallback if no position has been obtained yet
            if (!resolved) {
                console.log("[geo] Using Toulouse fallback");
                setError(err.message);
                setPosition(TOULOUSE_DEFAULT);
                setIsLoading(false);
                resolved = true;
            }
        };

        // First: fast request (network-based, works instantly on most devices)
        navigator.geolocation.getCurrentPosition(
            (pos) => onSuccess(pos, "fast"),
            (err) => onError(err, "fast"),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
        );

        // Second: high-accuracy request (GPS, may take longer on mobile)
        // This will refine the position if the fast one was imprecise
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (pos.coords.accuracy < 200) {
                    onSuccess(pos, "gps");
                } else {
                    console.log(`[geo] gps accuracy too low (${pos.coords.accuracy}m), keeping previous position`);
                }
            },
            () => { /* GPS failure is OK — we already have fast/fallback */ },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 },
        );
    }, []);

    useEffect(() => {
        requestPosition();
    }, [requestPosition]);

    return { position, error, isLoading, refresh: requestPosition };
}
