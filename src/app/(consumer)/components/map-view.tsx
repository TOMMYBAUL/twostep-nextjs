"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAPBOX_TOKEN, MAPBOX_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from "../lib/mapbox";

interface Merchant {
    merchant_id: string;
    merchant_name: string;
    merchant_photo: string | null;
    merchant_logo: string | null;
    merchant_lat: number;
    merchant_lng: number;
    product_count: number;
    promo_count: number;
    distance_km: number;
}

interface MapViewProps {
    merchants: Merchant[];
    userPosition?: { lat: number; lng: number } | null;
    className?: string;
    recenterTrigger?: number;
    is3D?: boolean;
    selectedMerchantId?: string | null;
    onMerchantSelect?: (merchant: Merchant) => void;
}

function getInitials(name: string): string {
    return name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const CATEGORY_COLORS: Record<string, string> = {
    mode: "#E07A5F",
    chaussures: "#C97C5D",
    bijoux: "#B56576",
    tech: "#355070",
    beaute: "#6B4E71",
    sport: "#81B29A",
    jouets: "#F2CC8F",
    accessoires: "#3D405B",
    bricolage: "#5B8C5A",
};

function getPinColor(merchant: Merchant): string {
    // Try to infer category from description or name
    const desc = (merchant.merchant_name + " " + (merchant as any).merchant_description || "").toLowerCase();
    for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
        if (desc.includes(cat)) return color;
    }
    return "#E07A5F"; // default ochre
}

export function MapView({ merchants, userPosition, className, recenterTrigger, is3D, selectedMerchantId, onMerchantSelect }: MapViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const hasFittedRef = useRef(false);

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
        map.on("load", () => {
            const logo = containerRef.current?.querySelector(".mapboxgl-ctrl-logo");
            if (logo) (logo as HTMLElement).style.display = "none";
        });
        map.on("style.load", () => {
            const layers = map.getStyle().layers ?? [];
            layers.forEach((layer) => {
                const id = layer.id;
                const type = layer.type;
                if (type === "background") map.setPaintProperty(id, "background-color", "#F5F0E8");
                if (id.includes("water") && type === "fill") map.setPaintProperty(id, "fill-color", "#c5d5c0");
                if ((id.includes("landuse") || id.includes("park") || id.includes("land-structure")) && type === "fill") {
                    try { map.setPaintProperty(id, "fill-color", "#dde8d5"); } catch {}
                }
                if (id.includes("road") && type === "line") {
                    try { map.setPaintProperty(id, "line-color", "#e0d5c4"); } catch {}
                }
                if (id.includes("building") && type === "fill") {
                    try { map.setPaintProperty(id, "fill-color", "#ebe3d6"); } catch {}
                }
            });
        });
        mapRef.current = map;
        return () => { map.remove(); mapRef.current = null; };
    }, []);

    // Fit map to show all merchants (smart centering)
    useEffect(() => {
        const map = mapRef.current;
        if (!map || merchants.length === 0 || hasFittedRef.current) return;

        const bounds = new mapboxgl.LngLatBounds();
        merchants.forEach(m => bounds.extend([m.merchant_lng, m.merchant_lat]));
        if (userPosition) bounds.extend([userPosition.lng, userPosition.lat]);

        map.fitBounds(bounds, { padding: { top: 80, bottom: 200, left: 40, right: 40 }, maxZoom: 15, duration: 800 });
        hasFittedRef.current = true;
    }, [merchants, userPosition]);

    // User position dot
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !userPosition) return;
        userMarkerRef.current?.remove();
        const el = document.createElement("div");
        el.className = "size-3 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.3)]";
        userMarkerRef.current = new mapboxgl.Marker({ element: el })
            .setLngLat([userPosition.lng, userPosition.lat])
            .addTo(map);
    }, [userPosition]);

    // Recenter
    useEffect(() => {
        if (!recenterTrigger || !mapRef.current || merchants.length === 0) return;
        const bounds = new mapboxgl.LngLatBounds();
        merchants.forEach(m => bounds.extend([m.merchant_lng, m.merchant_lat]));
        if (userPosition) bounds.extend([userPosition.lng, userPosition.lat]);
        mapRef.current.fitBounds(bounds, { padding: { top: 80, bottom: 200, left: 40, right: 40 }, maxZoom: 15, duration: 800 });
    }, [recenterTrigger]);

    // 3D toggle
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (is3D) {
            map.easeTo({ pitch: 45, bearing: -17, duration: 1000 });
            const layers = map.getStyle().layers ?? [];
            const buildingLayer = layers.find((l) => l.id.includes("building") && l.type === "fill-extrusion");
            if (!buildingLayer) {
                const fillLayer = layers.find((l) => l.id.includes("building") && l.type === "fill");
                if (fillLayer) {
                    try {
                        map.addLayer({
                            id: "3d-buildings", source: fillLayer.source, "source-layer": fillLayer["source-layer"],
                            type: "fill-extrusion", minzoom: 14,
                            paint: {
                                "fill-extrusion-color": "#ebe3d6",
                                "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 16, ["get", "height"]],
                                "fill-extrusion-base": ["get", "min_height"],
                                "fill-extrusion-opacity": 0.7,
                            },
                        });
                    } catch {}
                }
            }
        } else {
            map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
            if (map.getLayer("3d-buildings")) {
                try { map.removeLayer("3d-buildings"); } catch {}
            }
        }
    }, [is3D]);

    // Stable callback ref
    const onSelectRef = useRef(onMerchantSelect);
    onSelectRef.current = onMerchantSelect;

    // Render merchant pins
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        merchants.forEach((merchant) => {
            const color = getPinColor(merchant);
            const isSelected = selectedMerchantId === merchant.merchant_id;
            const logo = merchant.merchant_logo || merchant.merchant_photo;

            // Pin container — no position/transform/transition here, Mapbox controls these
            const wrapper = document.createElement("div");
            wrapper.style.cssText = `cursor:pointer;${isSelected ? "z-index:10;" : ""}`;

            // Pin body — scale applied here so it doesn't conflict with Mapbox's transform
            const el = document.createElement("div");
            const selectedScale = isSelected ? "transform:scale(1.25);" : "";
            if (logo) {
                el.style.cssText = `width:42px;height:42px;border-radius:50%;border:3px solid ${isSelected ? "var(--ts-ochre, #E07A5F)" : "white"};box-shadow:0 2px 10px rgba(0,0,0,${isSelected ? "0.3" : "0.15"});overflow:hidden;background:white;${selectedScale}`;
                const img = document.createElement("img");
                img.src = logo;
                img.alt = merchant.merchant_name;
                img.style.cssText = "width:100%;height:100%;object-fit:cover;";
                img.onerror = () => {
                    el.innerHTML = "";
                    el.style.cssText = `width:42px;height:42px;border-radius:50%;border:3px solid ${isSelected ? "var(--ts-ochre, #E07A5F)" : "white"};box-shadow:0 2px 10px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;background:${color};color:white;font-size:13px;font-weight:800;font-family:var(--font-plus-jakarta-sans),sans-serif;${selectedScale}`;
                    el.textContent = getInitials(merchant.merchant_name);
                };
                el.appendChild(img);
            } else {
                el.style.cssText = `width:42px;height:42px;border-radius:50%;border:3px solid ${isSelected ? "var(--ts-ochre, #E07A5F)" : "white"};box-shadow:0 2px 10px rgba(0,0,0,${isSelected ? "0.3" : "0.15"});display:flex;align-items:center;justify-content:center;background:${color};color:white;font-size:13px;font-weight:800;font-family:var(--font-plus-jakarta-sans),sans-serif;${selectedScale}`;
                el.textContent = getInitials(merchant.merchant_name);
            }
            wrapper.appendChild(el);

            // Promo badge
            if (merchant.promo_count > 0) {
                const badge = document.createElement("div");
                badge.style.cssText = "position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;background:#E07A5F;border:2px solid white;display:flex;align-items:center;justify-content:center;";
                const badgeText = document.createElement("span");
                badgeText.style.cssText = "color:white;font-size:8px;font-weight:800;";
                badgeText.textContent = "%";
                badge.appendChild(badgeText);
                wrapper.appendChild(badge);
            }

            // Click → select merchant (show mini-fiche)
            wrapper.addEventListener("click", (e) => {
                e.stopPropagation();
                onSelectRef.current?.(merchant);
            });

            const marker = new mapboxgl.Marker({ element: wrapper, anchor: "center" })
                .setLngLat([merchant.merchant_lng, merchant.merchant_lat])
                .addTo(map);

            markersRef.current.push(marker);
        });
    }, [merchants, selectedMerchantId]);

    return <div ref={containerRef} className={className} />;
}
