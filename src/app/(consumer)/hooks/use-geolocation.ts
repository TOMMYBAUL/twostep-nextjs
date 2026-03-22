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
            setError("Géolocalisation non supportée");
            setPosition(TOULOUSE_DEFAULT);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setError(null);
                setIsLoading(false);
            },
            (err) => {
                setError(err.message);
                setPosition(TOULOUSE_DEFAULT);
                setIsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
        );
    }, []);

    useEffect(() => {
        requestPosition();
    }, [requestPosition]);

    return { position, error, isLoading, refresh: requestPosition };
}
