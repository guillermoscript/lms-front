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

/**
 * Authenticated payment routes (checkout, submit) — keyed by user id.
 * 2000 users tracked; low limits since these trigger real checkout/RPC work.
 */
export const paymentAuthLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 2000,
});

/**
 * Polling routes (verify) — keyed by user id. Higher limit: the client polls
 * every 1-2s while waiting for on-chain confirmation.
 */
export const paymentPollLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 2000,
});

/**
 * Anonymous Solana Pay wallet endpoints (/tx, /subscribe-tx) — no session, hit
 * directly by wallet apps, so keyed by IP instead of user id.
 */
export const paymentAnonLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 5000,
});

/**
 * Outbound Binance Pay-history calls — keyed by TENANT id, not user. The
 * /sapi/v1/pay/transactions endpoint is UID-weight ~3000 (≈60 calls/min
 * budget on the school's account), so the verify route caps how often ALL
 * pollers combined may hit Binance for one tenant; throttled polls return
 * "still pending" without an outbound call.
 */
export const binancePayHistoryLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 2000,
});

/**
 * Free enrollment attempts — checked separately by user and IP.
 * The database grant remains idempotent; this limits bot-driven catalog churn.
 */
export const freeEnrollmentLimiter = rateLimit({
  interval: 60 * 60 * 1000,
  uniqueTokenPerInterval: 10_000,
});

/**
 * AI generation actions (starter-course drafts) — keyed by user id.
 * Each call is a full LLM generation, so the per-user limit is low; the
 * caller passes the allowed count per interval to `.check()`.
 */
export const aiGenerationLimiter = rateLimit({
  interval: 60 * 60 * 1000,
  uniqueTokenPerInterval: 2000,
});

/** Client IP from standard proxy headers, falling back to 'unknown'. */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
