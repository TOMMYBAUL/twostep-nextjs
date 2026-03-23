interface DayHours {
    open: string; // "10:00"
    close: string; // "19:00"
}

type OpeningHours = Partial<Record<string, DayHours>>;

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS: Record<string, string> = {
    monday: "Lun",
    tuesday: "Mar",
    wednesday: "Mer",
    thursday: "Jeu",
    friday: "Ven",
    saturday: "Sam",
    sunday: "Dim",
};

export interface OpenStatus {
    isOpen: boolean;
    label: string; // "Ouvert · Ferme à 19:00" or "Fermé · Ouvre demain à 10:00"
}

export function getOpenStatus(hours: unknown): OpenStatus | null {
    if (!hours || typeof hours !== "object") return null;

    const oh = hours as OpeningHours;
    const now = new Date();
    const dayKey = DAY_KEYS[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const today = oh[dayKey];

    if (today) {
        const [openH, openM] = today.open.split(":").map(Number);
        const [closeH, closeM] = today.close.split(":").map(Number);
        const openMin = openH * 60 + openM;
        const closeMin = closeH * 60 + closeM;

        if (currentMinutes >= openMin && currentMinutes < closeMin) {
            return { isOpen: true, label: `Ouvert · Ferme à ${today.close}` };
        }

        if (currentMinutes < openMin) {
            return { isOpen: false, label: `Fermé · Ouvre à ${today.open}` };
        }
    }

    // Closed today or past closing — find next opening day
    for (let i = 1; i <= 7; i++) {
        const nextIdx = (now.getDay() + i) % 7;
        const nextKey = DAY_KEYS[nextIdx];
        const nextDay = oh[nextKey];
        if (nextDay) {
            const dayLabel = i === 1 ? "demain" : DAY_LABELS[nextKey];
            return { isOpen: false, label: `Fermé · Ouvre ${dayLabel} à ${nextDay.open}` };
        }
    }

    return { isOpen: false, label: "Fermé" };
}

export function formatWeeklyHours(hours: unknown): { day: string; hours: string }[] {
    if (!hours || typeof hours !== "object") return [];

    const oh = hours as OpeningHours;
    const ordered = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

    return ordered.map((day) => ({
        day: DAY_LABELS[day],
        hours: oh[day] ? `${oh[day]!.open} – ${oh[day]!.close}` : "Fermé",
    }));
}
