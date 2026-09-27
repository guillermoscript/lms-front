/**
 * Social sign-in is opt-in per deployment. Showing "Continue with Google"
 * while the Supabase Google provider isn't fully configured sends users into
 * a dead end ("Unable to exchange external code") — including users arriving
 * from the MCP OAuth consent flow, who then never finish connecting.
 * Set NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true once the provider is ready.
 */
export const googleAuthEnabled = process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === 'true'
