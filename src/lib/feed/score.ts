/**
 * Compute feed score for a product event.
 *
 * score = (1 / max(distance_km, 0.1)) * freshness * boost
 *
 * @param distanceKm - distance between consumer and merchant
 * @param daysSinceEvent - days since the feed event was created
 * @param categoryBoost - 1.0 default, 1.5 if consumer recently searched this category
 */
export function computeFeedScore(
    distanceKm: number,
    daysSinceEvent: number,
    categoryBoost: number = 1.0
): number {
    const distance = Math.max(distanceKm, 0.1);
    const freshness = 1 / (daysSinceEvent + 1);
    return (1 / distance) * freshness * categoryBoost;
}
