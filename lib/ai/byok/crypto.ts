import 'server-only'

/**
 * Server-only entry point for BYOK key encryption. See crypto-core.ts for the
 * scheme and env contract (AI_KEYS_ENCRYPTION_KEYS / AI_KEYS_ACTIVE_VERSION).
 *
 *   encryptKey(plain, {tenantId, provider})   -> `v<N>:iv:tag:ct`
 *   decryptKey(envelope, {tenantId, provider})
 *   needsReencrypt(envelope)                  -> stored version !== active
 */
export {
  encryptKey,
  decryptKey,
  needsReencrypt,
  getActiveKeyVersion,
  envelopeVersion,
  ByokCryptoError,
} from './crypto-core'
export type { ByokCryptoContext, ByokCryptoErrorCode, ByokProviderId } from './crypto-core'
