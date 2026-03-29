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

export type AchievementIcon =
    | "gift" | "eye" | "heart" | "users" | "bar-chart"
    | "tag" | "zap" | "check-circle" | "star" | "trophy";

export type AchievementDef = {
    type: AchievementType;
    icon: AchievementIcon;
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
        icon: "gift",
        label: "Premier produit",
        gamifiedLabel: "Débloqué !",
        subtitle: "Vous avez fait le premier pas !",
        color: "#8E96B0",
        gradient: "linear-gradient(135deg, #FFD700, #FFA500)",
        mode: "toast",
        order: 1,
    },
    "first-view": {
        type: "first-view",
        icon: "eye",
        label: "Première vue",
        gamifiedLabel: "Débloqué !",
        subtitle: "Votre boutique a été vue !",
        color: "#4268FF",
        gradient: "linear-gradient(135deg, #4268FF, #3558E0)",
        mode: "toast",
        order: 2,
    },
    "first-favorite": {
        type: "first-favorite",
        icon: "heart",
        label: "Premier favori",
        gamifiedLabel: "Débloqué !",
        subtitle: "Un client vous a remarqué !",
        color: "#4268FF",
        gradient: "linear-gradient(135deg, #4268FF, #3558E0)",
        mode: "toast",
        order: 3,
    },
    "first-follower": {
        type: "first-follower",
        icon: "users",
        label: "Premier abonné",
        gamifiedLabel: "Débloqué !",
        subtitle: "Votre communauté commence !",
        color: "#4268FF",
        gradient: "linear-gradient(135deg, #4268FF, #3558E0)",
        mode: "toast",
        order: 4,
    },
    "views-100": {
        type: "views-100",
        icon: "bar-chart",
        label: "100 vues",
        gamifiedLabel: "Débloqué !",
        subtitle: "Votre boutique rayonne !",
        color: "#4268FF",
        gradient: "linear-gradient(135deg, #4268FF, #3558E0)",
        mode: "toast",
        order: 7,
    },
    "first-promo": {
        type: "first-promo",
        icon: "tag",
        label: "Première promo",
        gamifiedLabel: "Débloqué !",
        subtitle: "Vos offres attirent les clients !",
        color: "#8E96B0",
        gradient: "linear-gradient(135deg, #FFD700, #FFA500)",
        mode: "toast",
        order: 5,
    },
    "streak-7": {
        type: "streak-7",
        icon: "zap",
        label: "7 jours d'affilée",
        gamifiedLabel: "En feu !",
        subtitle: "Régularité exemplaire !",
        color: "#4268FF",
        gradient: "linear-gradient(135deg, #4268FF, #FF6B3D)",
        mode: "toast",
        order: 9,
    },
    "onboarding-complete": {
        type: "onboarding-complete",
        icon: "check-circle",
        label: "Onboarding complété",
        gamifiedLabel: "Prêt à briller !",
        subtitle: "Votre boutique est 100% configurée",
        color: "#22B86E",
        gradient: "linear-gradient(135deg, #22B86E, #3D9970)",
        mode: "modal",
        order: 6,
    },
    "score-50": {
        type: "score-50",
        icon: "star",
        label: "Score 50+",
        gamifiedLabel: "En progrès !",
        subtitle: "Vous montez en puissance",
        color: "#8E96B0",
        gradient: "linear-gradient(135deg, #8E96B0, #C4956A)",
        mode: "modal",
        order: 8,
    },
    "score-80": {
        type: "score-80",
        icon: "trophy",
        label: "Score Excellent",
        gamifiedLabel: "Légendaire !",
        subtitle: "Top boutique Two-Step !",
        color: "#22B86E",
        gradient: "linear-gradient(135deg, #22B86E, #3D9970)",
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
