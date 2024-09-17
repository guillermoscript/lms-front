import { Ratelimit } from '@upstash/ratelimit' // for deno: see above
import { Redis } from '@upstash/redis' // see below for cloudflare and fastly adapters
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

// Create a new ratelimiter, that allows 30 requests per minute.
const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(30, '1 m'),
    analytics: true,
    /**
     * Optional prefix for the keys used in redis. This is useful if you want to share a redis
     * instance with other applications and want to avoid key collisions. The default prefix is
     * "@upstash/ratelimit"
     */
    prefix: '@upstash/ratelimit',
})

function getIP() {
    return headers().get('x-real-ip') ?? 'unknown'
}

export async function rateLimit() {
    const limit = await ratelimit.limit(getIP())
    if (!limit.success) {
        redirect('/waiting-room')
    }
}
