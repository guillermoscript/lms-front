/**
 * Auth Context Management using AsyncLocalStorage
 * 
 * This module provides per-request auth context using Node.js AsyncLocalStorage.
 * This allows tools to access the current request's AuthManager without passing it
 * as a parameter.
 */

import { AsyncLocalStorage } from "async_hooks";
import { AuthManager } from "./auth.js";

// Create an AsyncLocalStorage instance for auth context
const authStorage = new AsyncLocalStorage<AuthManager>();

/**
 * Run a function with an auth context
 */
export function runWithAuthContext<T>(
  auth: AuthManager,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return authStorage.run(auth, fn);
}

/**
 * Get the current auth context
 * Throws an error if called outside of runWithAuthContext
 */
export function getAuthContext(): AuthManager {
  const auth = authStorage.getStore();
  if (!auth) {
    throw new Error("No auth context available. This should not happen.");
  }
  return auth;
}

/**
 * Check if auth context is available
 */
export function hasAuthContext(): boolean {
  return authStorage.getStore() !== undefined;
}
