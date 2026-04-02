import type { AchievementIcon } from "@/lib/achievements";
import { Gift01, Eye, Heart, Users01, BarChart01, Tag01, Zap, CheckCircle, Star01, Trophy01 } from "@untitledui/icons";
import type { FC, SVGProps } from "react";

const ICON_MAP: Record<AchievementIcon, FC<SVGProps<SVGSVGElement>>> = {
    gift: Gift01,
    eye: Eye,
    heart: Heart,
    users: Users01,
    "bar-chart": BarChart01,
    tag: Tag01,
    zap: Zap,
    "check-circle": CheckCircle,
    star: Star01,
    trophy: Trophy01,
};

export function AchievementIconRenderer({ icon, size }: { icon: AchievementIcon; size: number }) {
    const Icon = ICON_MAP[icon];
    return <Icon style={{ width: size, height: size }} className="text-white" aria-hidden="true" />;
}
