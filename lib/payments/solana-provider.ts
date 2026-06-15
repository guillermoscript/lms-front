/**
 * Solana Pay Provider Implementation
 *
 * One-time transfer-request checkout via the Solana Pay spec. Payment
 * confirmation is ON-CHAIN: the checkout produces a `solana:` URL rendered as
 * a QR code; the verify endpoint (or a poller) calls `confirmTransfer()` which
 * polls the chain for a matching, finalised transfer carrying our unique
 * `reference` public key.
 *
 * Capability summary:
 *   - No native recurring billing → `supportsNativeSubscriptions: false`
 *   - No signed inbound webhook  → `emitsRenewalWebhooks: false`
 *   - WE manage the billing period (cron expires lapsed rows; a renewal is
 *     just a new one-time payment that extends `current_period_end`)
 *   - No hosted redirect URL     → `supportsHostedCheckout: false`
 *   - On-chain refunds are manual, out-of-band → `supportsRefunds: false`
 *
 * Spec: https://docs.solanapay.com/spec
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import {
  encodeURL,
  findReference,
  validateTransfer,
  FindReferenceError,
  ValidateTransferError,
} from '@solana/pay'
import BigNumber from 'bignumber.js'

import {
  IPaymentProvider,
  PaymentProvider,
  PaymentProduct,
  PaymentPrice,
  ProviderCapabilities,
  CreateProductParams,
  UpdateProductParams,
  CreatePriceParams,
  UpdatePriceParams,
  CreateCheckoutParams,
  CheckoutSession,
  NormalizedBillingEvent,
} from './types'

export class SolanaProvider implements IPaymentProvider {
  readonly provider: PaymentProvider = 'solana'

  /**
   * Solana Pay is a one-time, self-managed-period provider:
   * - No native recurring billing (no auto-pull on subscription schedules).
   * - No signed inbound webhook; confirmation flows through on-chain polling.
   * - Not a hosted-checkout redirect provider; the QR URL is rendered in-app.
   * - On-chain refunds require a manual reverse transfer (out of scope).
   */
  readonly capabilities: ProviderCapabilities = {
    supportsNativeSubscriptions: false,
    emitsRenewalWebhooks: false,
    supportsHostedCheckout: false,
    supportsRefunds: false,
    isMerchantOfRecord: false,
    selfManagedPeriod: true,
  }

  private readonly connection: Connection
  private readonly recipient: PublicKey
  private readonly splToken: PublicKey | undefined

  /**
   * @param rpcUrl   - Solana RPC endpoint (e.g. `https://api.mainnet-beta.solana.com`).
   * @param recipient - Base58 public key of the merchant wallet that receives funds.
   * @param usdcMint  - Optional SPL-token mint address (e.g. USDC). When omitted,
   *                    payments are denominated in native SOL.
   */
  constructor(rpcUrl: string, recipient: string, usdcMint?: string) {
    this.connection = new Connection(rpcUrl, 'confirmed')
    this.recipient = new PublicKey(recipient)
    this.splToken = usdcMint ? new PublicKey(usdcMint) : undefined
  }

  /**
   * Solana Pay amounts are decimal token units (e.g. 9.99 USDC), NOT cents.
   * The checkout route passes the plan/product price directly for solana without
   * any base-unit conversion, so we return the amount unchanged regardless of
   * `fromUnit`.
   */
  convertAmount(amount: number, _fromUnit: 'base' | 'major'): number {
    return amount
  }

  // ---------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------

  /**
   * Build a Solana Pay transfer-request URL for a one-time payment.
   *
   * A fresh `reference` keypair is generated for each session — this is the
   * on-chain correlation key (NOT the recipient). It is stored as
   * `providerRef` (base58) on the transaction row so the verify endpoint can
   * later call `confirmTransfer(providerRef, expectedAmount)` to locate and
   * validate the on-chain transfer.
   *
   * Returns `kind: 'qr'`; the checkout UI renders the URL as a QR code.
   *
   * @param params - `params.amount` must already be in decimal token units
   *   (e.g. 9.99), not cents. The unified checkout route for Solana passes
   *   the plan/product price directly without cent conversion.
   */
  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
    try {
      // Generate a unique on-chain marker for this payment (NOT the recipient).
      const reference = Keypair.generate().publicKey

      const amount = new BigNumber(params.amount)

      const url = encodeURL({
        recipient: this.recipient,
        amount,
        splToken: this.splToken,
        reference,
        label: params.metadata?.label ?? 'LMS',
        message: params.metadata?.message ?? `Order ${params.reference}`,
      })

      return {
        kind: 'qr',
        url: url.toString(),
        reference: params.reference,
        // Base58 on-chain reference public key. Store this on the transaction
        // row; the verify endpoint passes it back to confirmTransfer().
        providerRef: reference.toBase58(),
      }
    } catch (error) {
      throw new Error(
        `Solana createCheckoutSession failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // On-chain confirmation (public helper — NOT part of IPaymentProvider)
  // ---------------------------------------------------------------------------

  /**
   * Poll the chain for a finalised transfer carrying the given reference key.
   *
   * Called by the `/api/payments/verify/solana` endpoint (or a poller) after
   * the wallet signals it has broadcast the transaction.
   *
   * - Returns `{ confirmed: false }` when no signature is found yet
   *   (`FindReferenceError`) — the caller should keep polling.
   * - Returns `{ confirmed: true, signature }` when a valid matching transfer
   *   is found and passes `validateTransfer`.
   * - Throws on `ValidateTransferError` (payment found but invalid — wrong
   *   amount, wrong recipient, etc.) or on network/RPC errors.
   *
   * @param referenceBase58  - Base58 on-chain reference public key stored as
   *   `providerRef` on the transaction row at checkout time.
   * @param expectedAmount   - Decimal token amount expected (e.g. 9.99 USDC).
   */
  async confirmTransfer(
    referenceBase58: string,
    expectedAmount: number,
  ): Promise<{ confirmed: boolean; signature?: string }> {
    const reference = new PublicKey(referenceBase58)

    let sigInfo: Awaited<ReturnType<typeof findReference>>
    try {
      sigInfo = await findReference(this.connection, reference, { finality: 'confirmed' })
    } catch (err) {
      if (err instanceof FindReferenceError) {
        // No signature found yet — payment not yet broadcast or not yet confirmed.
        return { confirmed: false }
      }
      // Network / RPC error — rethrow wrapped.
      throw new Error(
        `Solana confirmTransfer findReference failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }

    try {
      await validateTransfer(
        this.connection,
        sigInfo.signature,
        {
          recipient: this.recipient,
          amount: new BigNumber(expectedAmount),
          splToken: this.splToken,
          reference,
        },
        { commitment: 'confirmed' },
      )
      return { confirmed: true, signature: sigInfo.signature }
    } catch (err) {
      if (err instanceof ValidateTransferError) {
        // Transfer was found on-chain but does not satisfy the payment fields
        // (wrong amount, wrong recipient, wrong mint, etc.). This is a real
        // error — the caller must NOT mark the payment as confirmed.
        throw new Error(
          `Solana transfer validation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        )
      }
      // Other unexpected errors (RPC, serialisation, etc.)
      throw new Error(
        `Solana confirmTransfer validateTransfer failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Webhooks — not applicable to Solana Pay
  // ---------------------------------------------------------------------------

  /**
   * Solana Pay has NO signed inbound webhook. Payment authenticity comes
   * entirely from the chain: only a real on-chain transfer carrying our unique
   * `reference` public key can confirm a payment. The generic webhook route
   * does not apply to this provider; always returns `false` so the router
   * skips processing.
   *
   * Confirmation flows through `confirmTransfer()` (called from the
   * `/api/payments/verify/solana` endpoint or a polling job).
   */
  async verifyWebhook(_rawBody: string, _headers: Record<string, string>): Promise<boolean> {
    return false
  }

  /**
   * Not webhook-driven. Instead, the verify endpoint calls
   * `confirmTransfer(providerRef, expectedAmount)`; on a matching finalised
   * transfer it synthesises `{ type: 'payment.succeeded', reference, providerPaymentId: signature }`
   * and feeds the same internal billing dispatcher.
   *
   * Returns `null` here to signal "this provider is not webhook-driven."
   */
  async normalizeWebhookEvent(_rawBody: string): Promise<NormalizedBillingEvent | null> {
    return null
  }

  // ---------------------------------------------------------------------------
  // Catalog — no remote catalog; products/prices live only in our DB
  // ---------------------------------------------------------------------------

  /**
   * No remote product catalog (like the manual provider). Returns a local
   * placeholder derived from the params — the canonical record is in our DB.
   */
  async createProduct(params: CreateProductParams): Promise<PaymentProduct> {
    return {
      id: `solana_prod_${params.name.toLowerCase().replace(/\s+/g, '_')}`,
      name: params.name,
      description: params.description,
      amount: 0,
      currency: 'usdt',
      metadata: params.metadata,
    }
  }

  /** Returns an updated local placeholder. The canonical record is in our DB. */
  async updateProduct(productId: string, params: UpdateProductParams): Promise<PaymentProduct> {
    return {
      id: productId,
      name: params.name ?? '',
      description: params.description ?? '',
      amount: 0,
      currency: 'usdt',
      metadata: params.metadata,
    }
  }

  /** Returns a local placeholder for the given id. */
  async getProduct(productId: string): Promise<PaymentProduct> {
    return { id: productId, name: 'Solana Product', description: '', amount: 0, currency: 'usdt' }
  }

  /** No-op — archive state is DB-only; there is no remote catalog to update. */
  async archiveProduct(_productId: string): Promise<void> {
    /* DB-only — no remote catalog */
  }

  /** No-op — restore state is DB-only; there is no remote catalog to update. */
  async restoreProduct(_productId: string): Promise<void> {
    /* DB-only — no remote catalog */
  }

  /**
   * No remote price catalog. Returns a local placeholder; the canonical record
   * is in our DB.
   */
  async createPrice(params: CreatePriceParams): Promise<PaymentPrice> {
    return {
      id: `solana_price_${params.productId}`,
      productId: params.productId,
      amount: params.amount,
      currency: params.currency,
      type: params.type,
      interval: params.interval,
      metadata: params.metadata,
    }
  }

  /** Returns an updated local placeholder. The canonical record is in our DB. */
  async updatePrice(priceId: string, params: UpdatePriceParams): Promise<PaymentPrice> {
    return {
      id: priceId,
      productId: '',
      amount: 0,
      currency: 'usdt',
      type: 'one_time',
      metadata: params.metadata,
    }
  }

  /** Returns a local placeholder for the given id. */
  async getPrice(priceId: string): Promise<PaymentPrice> {
    return { id: priceId, productId: '', amount: 0, currency: 'usdt', type: 'one_time' }
  }

  /** No-op — archive state is DB-only; there is no remote catalog to update. */
  async archivePrice(_priceId: string): Promise<void> {
    /* DB-only — no remote catalog */
  }
}
