export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export const MAPBOX_STYLE = "mapbox://styles/mapbox/light-v11";

export const DEFAULT_CENTER: [number, number] = [1.4442, 43.6047]; // Toulouse [lng, lat]
export const DEFAULT_ZOOM = 13;

export const CATEGORY_COLORS: Record<string, string> = {
    mode: "#C8813A",
    tech: "#6B7B8D",
    sport: "#7A9E7E",
    maison: "#A0855B",
    alimentation: "#D94F4F",
    default: "#C8813A",
};

export function getCategoryColor(category?: string | null): string {
    if (!category) return CATEGORY_COLORS.default;
    const normalized = category.toLowerCase();
    return CATEGORY_COLORS[normalized] ?? CATEGORY_COLORS.default;
}
