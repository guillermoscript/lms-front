import { LRUCache } from 'lru-cache';

type RateLimitOptions = {
  interval: number; // Time window in milliseconds
  uniqueTokenPerInterval: number; // Max unique tokens (users) to track
};

/**
 * Simple in-memory rate limiter using LRU cache
 * For production, consider using Redis-based rate limiting
 */
export function rateLimit(options: RateLimitOptions) {
  const tokenCache = new LRUCache<string, number[]>({
    max: options.uniqueTokenPerInterval,
    ttl: options.interval,
  });

  return {
    /**
     * Check if a token has exceeded the rate limit
     * @param limit - Maximum requests allowed in the interval
     * @param token - Unique identifier (e.g., user ID)
     * @returns Promise that resolves if within limit, rejects if exceeded
     */
    check: (limit: number, token: string) =>
      new Promise<void>((resolve, reject) => {
        const tokenCount = tokenCache.get(token) || [0];
        
        if (tokenCount[0] === 0) {
          tokenCache.set(token, tokenCount);
        }
        
        tokenCount[0] += 1;

        const currentUsage = tokenCount[0];
        const isRateLimited = currentUsage > limit;

        return isRateLimited ? reject() : resolve();
      }),
  };
}

/**
 * Pre-configured MCP rate limiter
 * 100 requests per minute per user
 * Tracks up to 500 unique users
 */
export const mcpLimiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500, // Track 500 users
});
