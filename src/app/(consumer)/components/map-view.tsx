/* v4-clustering */
"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Supercluster from "supercluster";
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

type MerchantPoint = Supercluster.PointFeature<{ merchant: Merchant }>;

function getInitials(name: string): string {
    return name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// Individual merchant pin — proven GPS-fixed from test-map
function createPinElement(merchant: Merchant, isSelected: boolean): HTMLElement {
    const size = 42;
    const logo = merchant.merchant_logo || merchant.merchant_photo;

    const el = document.createElement("div");
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.marginLeft = -(size / 2) + "px";
    el.style.marginTop = -(size / 2) + "px";
    el.style.cursor = "pointer";

    const circle = document.createElement("div");
    circle.style.cssText = `width:100%;height:100%;border-radius:50%;border:2.5px solid ${isSelected ? "#4268FF" : "white"};box-shadow:0 1px 6px rgba(0,0,0,0.15);overflow:hidden;display:flex;align-items:center;justify-content:center;`;

    if (logo) {
        circle.style.background = "white";
        const img = document.createElement("img");
        img.src = logo;
        img.style.cssText = "width:100%;height:100%;object-fit:cover;";
        img.onerror = () => {
            img.remove();
            circle.style.background = "#4268FF";
            circle.style.color = "white";
            circle.style.fontSize = "13px";
            circle.style.fontWeight = "800";
            circle.textContent = getInitials(merchant.merchant_name);
        };
        circle.appendChild(img);
    } else {
        circle.style.background = "#4268FF";
        circle.style.color = "white";
        circle.style.fontSize = "13px";
        circle.style.fontWeight = "800";
        circle.textContent = getInitials(merchant.merchant_name);
    }

    el.appendChild(circle);
    return el;
}

// Cluster bubble — ochre circle with white count
function createClusterElement(count: number): HTMLElement {
    const size = count >= 100 ? 56 : count >= 10 ? 48 : 42;

    const el = document.createElement("div");
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.marginLeft = -(size / 2) + "px";
    el.style.marginTop = -(size / 2) + "px";
    el.style.cursor = "pointer";

    const circle = document.createElement("div");
    circle.style.cssText = `width:100%;height:100%;border-radius:50%;background:#4268FF;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;color:white;font-size:${size >= 56 ? 16 : 14}px;font-weight:800;`;
    circle.textContent = String(count);

    el.appendChild(circle);
    return el;
}

export function MapView({ merchants, userPosition, className, recenterTrigger, is3D, selectedMerchantId, onMerchantSelect }: MapViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const clusterRef = useRef<Supercluster<{ merchant: Merchant }> | null>(null);
    const hasFittedRef = useRef(false);

    // Stable callback ref for onMerchantSelect
    const onSelectRef = useRef(onMerchantSelect);
    onSelectRef.current = onMerchantSelect;

    // Stable ref for selectedMerchantId (used inside updateMarkers)
    const selectedIdRef = useRef(selectedMerchantId);
    selectedIdRef.current = selectedMerchantId;

    // Init map
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

    // Build supercluster index when merchants change
    useEffect(() => {
        if (merchants.length === 0) return;

        const points: MerchantPoint[] = merchants.map((m) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [m.merchant_lng, m.merchant_lat] },
            properties: { merchant: m },
        }));

        const index = new Supercluster<{ merchant: Merchant }>({
            radius: 18,
            maxZoom: 12,
        });
        index.load(points);
        clusterRef.current = index;

        // Fit bounds once
        const map = mapRef.current;
        if (map && !hasFittedRef.current) {
            const bounds = new mapboxgl.LngLatBounds();
            merchants.forEach(m => bounds.extend([m.merchant_lng, m.merchant_lat]));
            if (userPosition) bounds.extend([userPosition.lng, userPosition.lat]);
            map.fitBounds(bounds, { padding: { top: 80, bottom: 200, left: 40, right: 40 }, maxZoom: 15, duration: 800 });
            hasFittedRef.current = true;
        }
    }, [merchants, userPosition]);

    // Render clusters/pins based on current zoom + bounds
    const updateMarkers = useCallback(() => {
        const map = mapRef.current;
        const index = clusterRef.current;
        if (!map || !index) return;

        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        const zoom = Math.floor(map.getZoom());
        const bounds = map.getBounds();
        if (!bounds) return;
        const latRange = bounds.getNorth() - bounds.getSouth();
        const lngRange = bounds.getEast() - bounds.getWest();
        const buffer = 0.3;
        const bbox: [number, number, number, number] = [
            bounds.getWest() - lngRange * buffer,
            bounds.getSouth() - latRange * buffer,
            bounds.getEast() + lngRange * buffer,
            bounds.getNorth() + latRange * buffer,
        ];

        const clusters = index.getClusters(bbox, zoom);

        clusters.forEach((feature) => {
            const [lng, lat] = feature.geometry.coordinates;

            if ("cluster" in feature.properties && feature.properties.cluster) {
                const props = feature.properties as Supercluster.ClusterProperties;
                const count = props.point_count;
                const el = createClusterElement(count);

                el.addEventListener("click", () => {
                    const expansionZoom = Math.min(
                        index.getClusterExpansionZoom(props.cluster_id),
                        20
                    );
                    map.easeTo({ center: [lng, lat], zoom: expansionZoom, duration: 500 });
                });

                const marker = new mapboxgl.Marker({ element: el })
                    .setLngLat([lng, lat])
                    .addTo(map);
                markersRef.current.push(marker);
            } else {
                const merchant = (feature.properties as { merchant: Merchant }).merchant;
                const isSelected = selectedIdRef.current === merchant.merchant_id;
                const el = createPinElement(merchant, isSelected);

                el.addEventListener("click", (e) => {
                    e.stopPropagation();
                    onSelectRef.current?.(merchant);
                });

                const marker = new mapboxgl.Marker({ element: el })
                    .setLngLat([lng, lat])
                    .addTo(map);
                markersRef.current.push(marker);
            }
        });
    }, []);

    // Hook map events to update clusters on zoom/pan
    useEffect(() => {
        const map = mapRef.current;
        if (!map || merchants.length === 0) return;

        const onMove = () => updateMarkers();

        if (map.loaded()) {
            updateMarkers();
        } else {
            map.on("load", onMove);
        }
        map.on("moveend", onMove);
        map.on("zoomend", onMove);

        return () => {
            map.off("load", onMove);
            map.off("moveend", onMove);
            map.off("zoomend", onMove);
        };
    }, [merchants, updateMarkers]);

    // Re-render markers when selection changes
    useEffect(() => {
        if (mapRef.current && clusterRef.current) updateMarkers();
    }, [selectedMerchantId]);

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

    return <div ref={containerRef} className={className} />;
}
