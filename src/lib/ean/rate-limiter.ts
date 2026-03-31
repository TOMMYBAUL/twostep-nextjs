type RateLimiter = {
    acquire: () => Promise<void>;
};

export function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
    const timestamps: number[] = [];

    async function acquire(): Promise<void> {
        const now = Date.now();
        // Remove expired timestamps
        while (timestamps.length > 0 && timestamps[0] <= now - windowMs) {
            timestamps.shift();
        }

        if (timestamps.length >= maxRequests) {
            const oldestExpiry = timestamps[0] + windowMs;
            const waitMs = oldestExpiry - now;
            if (waitMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, waitMs));
                // Clean again after waiting
                const afterWait = Date.now();
                while (timestamps.length > 0 && timestamps[0] <= afterWait - windowMs) {
                    timestamps.shift();
                }
            }
        }

        timestamps.push(Date.now());
    }

    return { acquire };
}
