import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push-send";
import { captureError } from "@/lib/error";

export const dynamic = "force-dynamic";

const WINDOW_MINUTES = 15;
const MAX_PUSHES_PER_RUN = 200;

type OpeningHours = Record<string, { open?: string; close?: string } | null> | null;

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function parseHHMM(s: string): { h: number; m: number } | null {
    const parts = s.split(":").map(Number);
    if (parts.length < 2 || parts.some(Number.isNaN)) return null;
    return { h: parts[0], m: parts[1] };
}

// Returns true if the merchant's closing time (in Europe/Paris) is
// between 55 and 70 minutes from now.
function isInReminderWindow(openingHours: OpeningHours, now: Date): boolean {
    if (!openingHours) return false;
    // Convert "now" to Paris local time. The server runs in UTC on Vercel;
    // Europe/Paris is UTC+1 (or +2 DST). For a 15-min wide window the DST
    // transition is irrelevant — an extra 15 min of tolerance covers both.
    const parisTz = "Europe/Paris";
    const fmt = new Intl.DateTimeFormat("fr-FR", {
        timeZone: parisTz,
        hour12: false,
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
    });
    const parts = fmt.formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const dayIdx = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"].indexOf(get("weekday").toLowerCase());
    const today = openingHours[DAY_NAMES[dayIdx]];
    if (!today?.close) return false;
    const close = parseHHMM(today.close);
    if (!close) return false;

    const h = Number(get("hour"));
    const m = Number(get("minute"));
    const nowMinutes = h * 60 + m;
    const closeMinutes = close.h * 60 + close.m;
    const diff = closeMinutes - nowMinutes;
    // Fire when 55 <= diff <= 70 (15-min window centered on "1h before close")
    return diff >= 55 && diff <= 70;
}

export async function GET(request: Request) {
    // Vercel Cron sends an Authorization header with CRON_SECRET.
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const { data: merchants, error } = await supabase
        .from("merchants")
        .select("id, user_id, name, pos_type, opening_hours")
        .is("pos_type", null)
        .not("user_id", "is", null);

    if (error) {
        captureError(error, { context: "closing-reminders:fetch-merchants" });
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }

    const candidates = (merchants ?? []).filter((m) => isInReminderWindow(m.opening_hours as OpeningHours, now));
    if (candidates.length === 0) {
        return NextResponse.json({ window_minutes: WINDOW_MINUTES, candidates: 0, sent: 0 });
    }

    const merchantIds = candidates.map((m) => m.id);
    const { data: sessionsDone } = await supabase
        .from("cloture_sessions")
        .select("merchant_id")
        .in("merchant_id", merchantIds)
        .eq("session_date", today);
    const alreadyDone = new Set((sessionsDone ?? []).map((s) => s.merchant_id as string));

    let sent = 0;
    for (const m of candidates) {
        if (sent >= MAX_PUSHES_PER_RUN) break;
        if (alreadyDone.has(m.id)) continue;
        if (!m.user_id) continue;
        try {
            const n = await sendPushToUser(m.user_id as string, {
                title: "🌙 Clôture du soir",
                body: "60 sec pour marquer les ruptures de la journée.",
                url: "/dashboard/stock/cloture",
            });
            sent += n;
        } catch (err) {
            captureError(err, { context: "closing-reminders:send", merchantId: m.id });
        }
    }

    return NextResponse.json({
        window_minutes: WINDOW_MINUTES,
        candidates: candidates.length,
        skipped_already_done: alreadyDone.size,
        sent,
    });
}
