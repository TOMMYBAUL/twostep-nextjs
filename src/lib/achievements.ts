export type AchievementType =
    | "first-product"
    | "first-view"
    | "first-favorite"
    | "first-follower"
    | "views-100"
    | "first-promo"
    | "streak-7"
    | "onboarding-complete"
    | "score-50"
    | "score-80";

export type CelebrationMode = "toast" | "modal";

export type AchievementDef = {
    type: AchievementType;
    emoji: string;
    label: string;
    gamifiedLabel: string;
    subtitle: string;
    color: string;
    gradient: string;
    mode: CelebrationMode;
    order: number;
};

export const ACHIEVEMENTS: Record<AchievementType, AchievementDef> = {
    "first-product": {
        type: "first-product",
        emoji: "🎁",
        label: "Premier produit",
        gamifiedLabel: "Débloqué !",
        subtitle: "Vous avez fait le premier pas !",
        color: "#D4A574",
        gradient: "linear-gradient(135deg, #FFD700, #FFA500)",
        mode: "toast",
        order: 1,
    },
    "first-view": {
        type: "first-view",
        emoji: "👀",
        label: "Première vue",
        gamifiedLabel: "Débloqué !",
        subtitle: "Votre boutique a été vue !",
        color: "#E07A5F",
        gradient: "linear-gradient(135deg, #E07A5F, #C96A50)",
        mode: "toast",
        order: 2,
    },
    "first-favorite": {
        type: "first-favorite",
        emoji: "❤️",
        label: "Premier favori",
        gamifiedLabel: "Débloqué !",
        subtitle: "Un client vous a remarqué !",
        color: "#E07A5F",
        gradient: "linear-gradient(135deg, #E07A5F, #C96A50)",
        mode: "toast",
        order: 3,
    },
    "first-follower": {
        type: "first-follower",
        emoji: "🏪",
        label: "Premier abonné",
        gamifiedLabel: "Débloqué !",
        subtitle: "Votre communauté commence !",
        color: "#E07A5F",
        gradient: "linear-gradient(135deg, #E07A5F, #C96A50)",
        mode: "toast",
        order: 4,
    },
    "views-100": {
        type: "views-100",
        emoji: "💯",
        label: "100 vues",
        gamifiedLabel: "Débloqué !",
        subtitle: "Votre boutique rayonne !",
        color: "#E07A5F",
        gradient: "linear-gradient(135deg, #E07A5F, #C96A50)",
        mode: "toast",
        order: 7,
    },
    "first-promo": {
        type: "first-promo",
        emoji: "🏷️",
        label: "Première promo",
        gamifiedLabel: "Débloqué !",
        subtitle: "Vos offres attirent les clients !",
        color: "#D4A574",
        gradient: "linear-gradient(135deg, #FFD700, #FFA500)",
        mode: "toast",
        order: 5,
    },
    "streak-7": {
        type: "streak-7",
        emoji: "🔥",
        label: "7 jours d'affilée",
        gamifiedLabel: "En feu !",
        subtitle: "Régularité exemplaire !",
        color: "#E07A5F",
        gradient: "linear-gradient(135deg, #E07A5F, #FF6B3D)",
        mode: "toast",
        order: 9,
    },
    "onboarding-complete": {
        type: "onboarding-complete",
        emoji: "✅",
        label: "Onboarding complété",
        gamifiedLabel: "Prêt à briller !",
        subtitle: "Votre boutique est 100% configurée",
        color: "#81B29A",
        gradient: "linear-gradient(135deg, #81B29A, #3D9970)",
        mode: "modal",
        order: 6,
    },
    "score-50": {
        type: "score-50",
        emoji: "⭐",
        label: "Score 50+",
        gamifiedLabel: "En progrès !",
        subtitle: "Vous montez en puissance",
        color: "#D4A574",
        gradient: "linear-gradient(135deg, #D4A574, #C4956A)",
        mode: "modal",
        order: 8,
    },
    "score-80": {
        type: "score-80",
        emoji: "🏆",
        label: "Score Excellent",
        gamifiedLabel: "Légendaire !",
        subtitle: "Top boutique Two-Step !",
        color: "#81B29A",
        gradient: "linear-gradient(135deg, #81B29A, #3D9970)",
        mode: "modal",
        order: 10,
    },
};

export const ALL_ACHIEVEMENT_TYPES = Object.keys(ACHIEVEMENTS) as AchievementType[];

export type Achievement = {
    id: string;
    merchant_id: string;
    type: AchievementType;
    unlocked_at: string;
};
