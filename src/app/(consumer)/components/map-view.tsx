"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, MAPBOX_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM, getCategoryColor } from "../lib/mapbox";

interface Merchant {
    merchant_id: string;
    merchant_name: string;
    merchant_lat: number;
    merchant_lng: number;
    product_count: number;
    distance_km: number;
}

interface MapViewProps {
    merchants: Merchant[];
    userPosition?: { lat: number; lng: number } | null;
    className?: string;
    recenterTrigger?: number;
}

export function MapView({ merchants, userPosition, className, recenterTrigger }: MapViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const hasCenteredRef = useRef(false);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: MAPBOX_STYLE,
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            attributionControl: false,
            logoPosition: "top-left",
        });
        // Hide Mapbox logo (attribution kept in footer per TOS)
        map.on("load", () => {
            const logo = containerRef.current?.querySelector(".mapboxgl-ctrl-logo");
            if (logo) (logo as HTMLElement).style.display = "none";
        });
        map.on("style.load", () => {
            // Two-Step branded map colors
            const layers = map.getStyle().layers ?? [];
            layers.forEach((layer) => {
                const id = layer.id;
                const type = layer.type;
                // Background & land
                if (type === "background") {
                    map.setPaintProperty(id, "background-color", "#F5F0E8");
                }
                // Water
                if (id.includes("water") && type === "fill") {
                    map.setPaintProperty(id, "fill-color", "#c5d5c0");
                }
                // Parks & green areas
                if ((id.includes("landuse") || id.includes("park") || id.includes("land-structure")) && type === "fill") {
                    try { map.setPaintProperty(id, "fill-color", "#dde8d5"); } catch {}
                }
                // Roads
                if (id.includes("road") && type === "line") {
                    try { map.setPaintProperty(id, "line-color", "#e0d5c4"); } catch {}
                }
                // Buildings
                if (id.includes("building") && type === "fill") {
                    try { map.setPaintProperty(id, "fill-color", "#ebe3d6"); } catch {}
                }
            });
        });
        mapRef.current = map;
        return () => { map.remove(); mapRef.current = null; };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !userPosition) return;
        if (!hasCenteredRef.current) {
            map.flyTo({ center: [userPosition.lng, userPosition.lat], zoom: DEFAULT_ZOOM });
            hasCenteredRef.current = true;
        }
        userMarkerRef.current?.remove();
        const el = document.createElement("div");
        el.className = "size-3 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.3)]";
        userMarkerRef.current = new mapboxgl.Marker({ element: el })
            .setLngLat([userPosition.lng, userPosition.lat])
            .addTo(map);
    }, [userPosition]);

    useEffect(() => {
        if (!recenterTrigger || !mapRef.current || !userPosition) return;
        mapRef.current.flyTo({ center: [userPosition.lng, userPosition.lat], zoom: DEFAULT_ZOOM });
    }, [recenterTrigger]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        merchants.forEach((merchant) => {
            const el = document.createElement("div");
            el.className = "flex size-8 items-center justify-center rounded-full border-2 border-white shadow-md cursor-pointer";
            el.style.backgroundColor = getCategoryColor(null);
            const countSpan = document.createElement("span");
            countSpan.style.cssText = "color:white;font-size:10px;font-weight:700";
            countSpan.textContent = String(merchant.product_count);
            el.appendChild(countSpan);

            const popupEl = document.createElement("div");
            popupEl.style.cssText = "font-family:var(--font-plus-jakarta-sans),sans-serif;padding:4px";
            const nameEl = document.createElement("strong");
            nameEl.style.fontSize = "13px";
            nameEl.textContent = merchant.merchant_name;
            const infoEl = document.createElement("div");
            infoEl.style.cssText = "font-size:11px;color:#666;margin-top:2px";
            const dist = merchant.distance_km < 1 ? `${Math.round(merchant.distance_km * 1000)}m` : `${merchant.distance_km}km`;
            infoEl.textContent = `${merchant.product_count} produits · ${dist}`;
            popupEl.appendChild(nameEl);
            popupEl.appendChild(infoEl);
            const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setDOMContent(popupEl);
            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([merchant.merchant_lng, merchant.merchant_lat])
                .setPopup(popup)
                .addTo(map);
            markersRef.current.push(marker);
        });
    }, [merchants]);

    return <div ref={containerRef} className={className} />;
}
