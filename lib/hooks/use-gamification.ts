"use client";

// Re-export types for backward compatibility
export type { GamificationSummary, GamificationFeatures } from "./use-gamification-summary";
export type { LeaderboardEntry } from "./use-leaderboard";
export type { Achievement } from "./use-achievements";
export type { StoreItem } from "./use-point-store";

// Re-export hooks for gradual migration
export { useGamificationSummary } from "./use-gamification-summary";
export { useLeaderboard } from "./use-leaderboard";
export { useAchievements } from "./use-achievements";
export { usePointStore } from "./use-point-store";

/**
 * @deprecated Use focused hooks instead:
 * - useGamificationSummary() for XP, level, streak, coins, features
 * - useLeaderboard() for leaderboard data
 * - useAchievements() for achievement data
 * - usePointStore() for store items and purchases
 */
export { useGamificationSummary as useGamification } from "./use-gamification-summary";
