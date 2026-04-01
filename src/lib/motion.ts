/** Shared motion constants — used across all animated pages */

/** Default spring for UI elements (slide-up, indicators, tabs) */
export const SPRING = { type: "spring" as const, stiffness: 200, damping: 30 };

/** Softer spring for visual elements (images, mockups, scale-up) */
export const SOFT_SPRING = { type: "spring" as const, stiffness: 150, damping: 30 };

/** Slide-up animation preset */
export const slideUp = (delay = 0) => ({
    initial: { opacity: 0, y: 50 },
    animate: { opacity: 1, y: 0 },
    transition: { ...SPRING, delay },
});

/** Scale-up animation preset */
export const scaleUp = (delay = 0) => ({
    initial: { opacity: 0, y: 40, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { ...SOFT_SPRING, delay },
});

/** Stagger delay calculator: 50ms per element */
export const stagger = (index: number, base = 0) => base + index * 0.05;
