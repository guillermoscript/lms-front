/**
 * solana-subscriptions.ts
 *
 * Pure Solana module wrapping the on-chain Subscriptions program using
 * @solana/kit v2 (web3.js v2) and @solana/subscriptions client.
 *
 * No DB, no Next.js — safe to import in any environment.
 * Boundary types use base58 STRING addresses only.
 */

import {
  address as addr,
  createSolanaRpc,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  createKeyPairSignerFromBytes,
  createNoopSigner,
  getBase64EncodedWireTransaction,
  compileTransaction,
  getBase58Encoder,
  AccountRole,
  type TransactionSigner,
  type Address,
  type Rpc,
  type GetLatestBlockhashApi,
  type GetSlotApi,
} from "@solana/kit";

import {
  SUBSCRIPTIONS_PROGRAM_ADDRESS,
  ZERO_ADDRESS,
  findPlanPda,
  findSubscriptionDelegationPda,
  findSubscriptionAuthorityPda,
  getCreatePlanInstruction,
  getSubscribeInstruction,
  getTransferSubscriptionInstruction,
  getCancelSubscriptionInstruction,
  getInitSubscriptionAuthorityInstruction,
  fetchMaybeSubscriptionDelegationFromSeeds,
  fetchMaybeSubscriptionAuthorityFromSeeds,
  fetchMaybePlanFromSeeds,
  fetchPlanFromSeeds,
  type PlanDataArgs,
  type SubscribeDataArgs,
  type TransferDataArgs,
} from "@solana/subscriptions";

// ─── Re-export program address as string ────────────────────────────────────

export const SUBS_PROGRAM_ADDRESS: string = SUBSCRIPTIONS_PROGRAM_ADDRESS;

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Pads an address array to exactly 4 items using ZERO_ADDRESS as filler.
 * The on-chain Subscriptions program uses fixed-size [Address; 4] arrays.
 */
function padToFour(arr: Address[]): [Address, Address, Address, Address] {
  const zero = addr(ZERO_ADDRESS) as Address;
  const result: Address[] = [...arr];
  while (result.length < 4) result.push(zero);
  return result.slice(0, 4) as [Address, Address, Address, Address];
}

type MinimalRpc = Parameters<typeof fetchMaybeSubscriptionDelegationFromSeeds>[0] &
  Rpc<GetLatestBlockhashApi & GetSlotApi>;

/** Creates a read-only RPC from a URL string. */
function makeRpc(rpcUrl: string): MinimalRpc {
  return createSolanaRpc(rpcUrl) as MinimalRpc;
}

/** Encodes a base58-encoded secret key string → Uint8Array of bytes. */
function decodeSecretKey(base58Sk: string): Uint8Array {
  // getBase58Encoder encodes a base58 STRING → bytes (ReadonlyUint8Array)
  return new Uint8Array(getBase58Encoder().encode(base58Sk));
}

/**
 * Builds a fully-signed base64 wire transaction from instructions
 * using a fee-payer signer.
 */
async function buildAndSignTx(
  rpcUrl: string,
  feePayer: TransactionSigner,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instructions: readonly any[]
): Promise<string> {
  const rpc = makeRpc(rpcUrl);
  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash()
    .send();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let msg: any = createTransactionMessage({ version: 0 });
  msg = setTransactionMessageFeePayer(feePayer.address, msg);
  msg = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg);
  for (const ix of instructions) {
    msg = appendTransactionMessageInstruction(ix, msg);
  }

  const signedTx = await signTransactionMessageWithSigners(msg);
  return getBase64EncodedWireTransaction(signedTx);
}

// ─── PDA derivations ─────────────────────────────────────────────────────────

/**
 * Derives the Plan PDA for a given merchant and plan ID.
 * Returns a base58 string address.
 */
export async function derivePlanPda(
  merchant: string,
  planId: bigint
): Promise<string> {
  const [pda] = await findPlanPda({
    owner: addr(merchant) as Address,
    planId,
  });
  return pda as string;
}

/**
 * Derives the SubscriptionDelegation PDA for subscriber → merchant:planId.
 * Returns a base58 string address.
 */
export async function deriveSubscriptionPda(
  merchant: string,
  planId: bigint,
  subscriber: string
): Promise<string> {
  const planPdaStr = await derivePlanPda(merchant, planId);
  const [pda] = await findSubscriptionDelegationPda({
    planPda: addr(planPdaStr) as Address,
    subscriber: addr(subscriber) as Address,
  });
  return pda as string;
}

// ─── Transaction builders ────────────────────────────────────────────────────

/**
 * Builds a base64 wire transaction that creates a subscription plan on-chain.
 *
 * Requires `merchantSecretKeyBase58` (base58-encoded 64-byte keypair).
 * `destinations` and `pullers` are base58 address strings (max 4 each).
 */
export async function buildCreatePlanTxBase64(p: {
  rpcUrl: string;
  merchant: string;
  planId: bigint;
  mint: string;
  amountBase: bigint;
  periodHours: bigint;
  destinations: string[];
  pullers: string[];
  metadataUri?: string;
  tokenProgram?: string;
  merchantSecretKeyBase58: string;
}): Promise<string> {
  const merchantSigner = await createKeyPairSignerFromBytes(
    decodeSecretKey(p.merchantSecretKeyBase58)
  );

  const [planPdaAddr] = await findPlanPda({
    owner: merchantSigner.address,
    planId: p.planId,
  });

  const planData: PlanDataArgs = {
    planId: p.planId,
    mint: addr(p.mint) as Address,
    terms: {
      amount: p.amountBase,
      periodHours: p.periodHours,
      createdAt: BigInt(Math.floor(Date.now() / 1000)),
    },
    endTs: BigInt(0),
    // destinations and pullers are fixed-size arrays of exactly 4 addresses;
    // pad with ZERO_ADDRESS to reach the required length.
    destinations: padToFour(p.destinations.map((d) => addr(d) as Address)),
    pullers: padToFour(p.pullers.map((pl) => addr(pl) as Address)),
    // Fixed-size 128-byte field — pad with null bytes up to 128 chars
    metadataUri: (p.metadataUri ?? "").padEnd(128, "\0").slice(0, 128),
  };

  const ix = getCreatePlanInstruction({
    merchant: merchantSigner,
    planPda: planPdaAddr,
    tokenMint: addr(p.mint) as Address,
    tokenProgram: p.tokenProgram
      ? (addr(p.tokenProgram) as Address)
      : undefined,
    planData,
  });

  return buildAndSignTx(p.rpcUrl, merchantSigner, [ix]);
}

/**
 * Builds a base64 wire transaction that subscribes a user to a plan.
 * The subscriber must sign; pass their 64-byte keypair as base58.
 *
 * Optionally accepts `userAta` (subscriber's ATA for the mint). If not
 * provided and @solana/spl-token v1 is available, the ATA is derived
 * automatically.
 */
export async function buildSubscribeTxBase64(p: {
  rpcUrl: string;
  subscriber: string;
  subscriberSecretKeyBase58: string;
  merchant: string;
  planId: bigint;
  mint: string;
  tokenProgram?: string;
  /** Optional: subscriber's ATA for the mint (avoids dynamic import). */
  userAta?: string;
}): Promise<string> {
  const subscriberSigner = await createKeyPairSignerFromBytes(
    decodeSecretKey(p.subscriberSecretKeyBase58)
  );

  const rpc = makeRpc(p.rpcUrl);

  const [planPdaAddr, planBump] = await findPlanPda({
    owner: addr(p.merchant) as Address,
    planId: p.planId,
  });

  // Fetch the live plan to read terms for the verification fields
  const plan = await fetchPlanFromSeeds(rpc, {
    owner: addr(p.merchant) as Address,
    planId: p.planId,
  });

  const [subAuthorityPda] = await findSubscriptionAuthorityPda({
    user: subscriberSigner.address,
    tokenMint: addr(p.mint) as Address,
  });

  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda: planPdaAddr,
    subscriber: subscriberSigner.address,
  });

  const instructions: unknown[] = [];

  // Init SubscriptionAuthority if it doesn't exist yet
  const maybeAuthority = await fetchMaybeSubscriptionAuthorityFromSeeds(rpc, {
    user: subscriberSigner.address,
    tokenMint: addr(p.mint) as Address,
  });

  if (!maybeAuthority.exists) {
    let ataAddr: string;
    if (p.userAta) {
      ataAddr = p.userAta;
    } else {
      // Try v1 helper (available in test / Node context)
      const spl = await import("@solana/spl-token").catch(() => null);
      const web3 = await import("@solana/web3.js").catch(() => null);
      if (spl && web3 && "getAssociatedTokenAddressSync" in spl) {
        const { getAssociatedTokenAddressSync } =
          spl as typeof import("@solana/spl-token");
        const { PublicKey } = web3 as typeof import("@solana/web3.js");
        ataAddr = getAssociatedTokenAddressSync(
          new PublicKey(p.mint),
          new PublicKey(subscriberSigner.address as string)
        ).toBase58();
      } else {
        throw new Error(
          "buildSubscribeTxBase64: userAta is required when @solana/spl-token v1 is unavailable"
        );
      }
    }

    const SPL_TOKEN_PROGRAM_ADDR = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const initIx = getInitSubscriptionAuthorityInstruction({
      owner: subscriberSigner,
      subscriptionAuthority: subAuthorityPda,
      tokenMint: addr(p.mint) as Address,
      userAta: addr(ataAddr) as Address,
      tokenProgram: addr(
        p.tokenProgram ?? SPL_TOKEN_PROGRAM_ADDR
      ) as Address,
    });
    instructions.push(initIx);
  }

  const subscribeData: SubscribeDataArgs = {
    planId: p.planId,
    planBump: planBump as unknown as number,
    expectedMint: addr(p.mint) as Address,
    expectedAmount: plan.data.data.terms.amount,
    expectedPeriodHours: plan.data.data.terms.periodHours,
    expectedCreatedAt: plan.data.data.terms.createdAt,
    expectedSubscriptionAuthorityInitId: BigInt(0),
  };

  const subscribeIx = getSubscribeInstruction({
    subscriber: subscriberSigner,
    merchant: addr(p.merchant) as Address,
    planPda: planPdaAddr,
    subscriptionPda,
    subscriptionAuthorityPda: subAuthorityPda,
    subscribeData,
  });
  instructions.push(subscribeIx);

  return buildAndSignTx(p.rpcUrl, subscriberSigner, instructions);
}

/**
 * Signs a transfer_subscription instruction as the puller and returns the
 * base64 wire transaction. The caller submits it to the network.
 *
 * `receiverAta` is the ATA that receives the tokens (typically merchant's ATA).
 */
export async function pullOnce(p: {
  rpcUrl: string;
  pullerSecretKeyBase58: string;
  subscriber: string;
  merchant: string;
  planId: bigint;
  mint: string;
  receiverAta: string;
  amountBase: bigint;
  tokenProgram?: string;
  /** Optional: subscriber's ATA for the mint. Derived from spl-token if omitted. */
  delegatorAta?: string;
}): Promise<string> {
  const pullerSigner = await createKeyPairSignerFromBytes(
    decodeSecretKey(p.pullerSecretKeyBase58)
  );

  const [planPda] = await findPlanPda({
    owner: addr(p.merchant) as Address,
    planId: p.planId,
  });

  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda,
    subscriber: addr(p.subscriber) as Address,
  });

  const [subAuthorityPda] = await findSubscriptionAuthorityPda({
    user: addr(p.subscriber) as Address,
    tokenMint: addr(p.mint) as Address,
  });

  let delegatorAtaAddr: string;
  if (p.delegatorAta) {
    delegatorAtaAddr = p.delegatorAta;
  } else {
    const spl = await import("@solana/spl-token").catch(() => null);
    const web3 = await import("@solana/web3.js").catch(() => null);
    if (spl && web3 && "getAssociatedTokenAddressSync" in spl) {
      const { getAssociatedTokenAddressSync } =
        spl as typeof import("@solana/spl-token");
      const { PublicKey } = web3 as typeof import("@solana/web3.js");
      delegatorAtaAddr = getAssociatedTokenAddressSync(
        new PublicKey(p.mint),
        new PublicKey(p.subscriber)
      ).toBase58();
    } else {
      throw new Error(
        "pullOnce: delegatorAta is required when @solana/spl-token v1 is unavailable"
      );
    }
  }

  const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

  const transferData: TransferDataArgs = {
    amount: p.amountBase,
    delegator: addr(p.subscriber) as Address,
    mint: addr(p.mint) as Address,
  };

  const ix = getTransferSubscriptionInstruction({
    subscriptionPda,
    planPda,
    subscriptionAuthority: subAuthorityPda,
    delegatorAta: addr(delegatorAtaAddr) as Address,
    receiverAta: addr(p.receiverAta) as Address,
    caller: pullerSigner,
    tokenMint: addr(p.mint) as Address,
    tokenProgram: addr(
      p.tokenProgram ?? SPL_TOKEN_PROGRAM
    ) as Address,
    transferData,
  });

  return buildAndSignTx(p.rpcUrl, pullerSigner, [ix]);
}

/**
 * Reads the on-chain SubscriptionDelegation account and returns its state,
 * or null if the account does not exist.
 */
export async function getSubscriptionState(p: {
  rpcUrl: string;
  merchant: string;
  planId: bigint;
  subscriber: string;
}): Promise<{
  amountPulledInPeriod: bigint;
  currentPeriodStartTs: bigint;
  periodHours: bigint;
  expiresAtTs: bigint;
} | null> {
  const rpc = makeRpc(p.rpcUrl);

  const [planPda] = await findPlanPda({
    owner: addr(p.merchant) as Address,
    planId: p.planId,
  });

  const maybeAccount = await fetchMaybeSubscriptionDelegationFromSeeds(rpc, {
    planPda,
    subscriber: addr(p.subscriber) as Address,
  });

  if (!maybeAccount.exists) return null;

  const d = maybeAccount.data;
  return {
    amountPulledInPeriod: d.amountPulledInPeriod,
    currentPeriodStartTs: d.currentPeriodStartTs,
    periodHours: d.terms.periodHours,
    expiresAtTs: d.expiresAtTs,
  };
}

/**
 * Builds a base64 wire transaction that cancels a subscription.
 * The subscriber must sign; pass their 64-byte keypair as base58.
 */
export async function buildCancelTxBase64(p: {
  rpcUrl: string;
  subscriber: string;
  subscriberSecretKeyBase58: string;
  merchant: string;
  planId: bigint;
}): Promise<string> {
  const subscriberSigner = await createKeyPairSignerFromBytes(
    decodeSecretKey(p.subscriberSecretKeyBase58)
  );

  const [planPda] = await findPlanPda({
    owner: addr(p.merchant) as Address,
    planId: p.planId,
  });

  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda,
    subscriber: subscriberSigner.address,
  });

  const ix = getCancelSubscriptionInstruction({
    subscriber: subscriberSigner,
    planPda,
    subscriptionPda,
  });

  return buildAndSignTx(p.rpcUrl, subscriberSigner, [ix]);
}

// ─── New exports ─────────────────────────────────────────────────────────────

/**
 * Builds an UNSIGNED base64 wire transaction for subscribing to a plan.
 *
 * Unlike buildSubscribeTxBase64, the caller provides only the subscriber's
 * public key string (no secret key). The transaction is compiled and serialised
 * with null signatures using `compileTransaction` + `getBase64EncodedWireTransaction`.
 * The wallet (e.g. browser extension) receives this base64 string, deserialises
 * it, signs with the subscriber's keypair, and submits to the network.
 *
 * If `reference` is provided it is appended to the subscribe instruction as a
 * READONLY (non-signer) account with `AccountRole.READONLY`.
 *
 * Encoding API used: `compileTransaction(msg)` → `getBase64EncodedWireTransaction(tx)`
 */
export async function buildSubscribeTxUnsignedBase64(p: {
  rpcUrl: string;
  /** Subscriber's base58 public key — NOT a secret key. */
  subscriber: string;
  merchant: string;
  planId: bigint;
  mint: string;
  tokenProgram?: string;
  /** Optional: subscriber's ATA for the mint. */
  userAta?: string;
  /** Optional: reference account (READONLY non-signer) to append to subscribe ix. */
  reference?: string;
}): Promise<string> {
  const rpc = makeRpc(p.rpcUrl);
  const subscriberAddr = addr(p.subscriber) as Address;

  // NoopSigner satisfies TransactionSigner but never signs — signatures stay null
  const subscriberSigner = createNoopSigner(subscriberAddr);

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const [planPdaAddr, planBump] = await findPlanPda({
    owner: addr(p.merchant) as Address,
    planId: p.planId,
  });

  // Fetch the live plan to read terms for the verification fields
  const plan = await fetchPlanFromSeeds(rpc, {
    owner: addr(p.merchant) as Address,
    planId: p.planId,
  });

  const [subAuthorityPda] = await findSubscriptionAuthorityPda({
    user: subscriberAddr,
    tokenMint: addr(p.mint) as Address,
  });

  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda: planPdaAddr,
    subscriber: subscriberAddr,
  });

  const instructions: unknown[] = [];

  // Init SubscriptionAuthority if it doesn't exist yet
  const maybeAuthority = await fetchMaybeSubscriptionAuthorityFromSeeds(rpc, {
    user: subscriberAddr,
    tokenMint: addr(p.mint) as Address,
  });

  // The on-chain program sets SubscriptionAuthority.init_id = Clock::slot at
  // init time, and subscribe() requires
  //   expected_subscription_authority_init_id == authority.init_id
  // (else SUBSCRIPTIONS_ERROR__STALE_SUBSCRIPTION_AUTHORITY = 136).
  //
  // - If the authority already exists, read its stored init_id.
  // - If we bundle init + subscribe in this same tx, the init instruction will
  //   set init_id to the slot in which the tx executes, so the matching value
  //   is the current slot. Query it from the RPC (constant within a slot).
  let expectedInitId: bigint;

  if (!maybeAuthority.exists) {
    let ataAddr: string;
    if (p.userAta) {
      ataAddr = p.userAta;
    } else {
      const spl = await import("@solana/spl-token").catch(() => null);
      const web3 = await import("@solana/web3.js").catch(() => null);
      if (spl && web3 && "getAssociatedTokenAddressSync" in spl) {
        const { getAssociatedTokenAddressSync } =
          spl as typeof import("@solana/spl-token");
        const { PublicKey } = web3 as typeof import("@solana/web3.js");
        ataAddr = getAssociatedTokenAddressSync(
          new PublicKey(p.mint),
          new PublicKey(p.subscriber)
        ).toBase58();
      } else {
        throw new Error(
          "buildSubscribeTxUnsignedBase64: userAta is required when @solana/spl-token v1 is unavailable"
        );
      }
    }

    const SPL_TOKEN_PROGRAM_ADDR =
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const initIx = getInitSubscriptionAuthorityInstruction({
      owner: subscriberSigner,
      subscriptionAuthority: subAuthorityPda,
      tokenMint: addr(p.mint) as Address,
      userAta: addr(ataAddr) as Address,
      tokenProgram: addr(
        p.tokenProgram ?? SPL_TOKEN_PROGRAM_ADDR
      ) as Address,
    });
    instructions.push(initIx);

    // init_id will equal Clock::slot at execution → use the current slot.
    const currentSlot = await rpc.getSlot().send();
    expectedInitId = BigInt(currentSlot);
  } else {
    // Authority already exists — match its stored init_id exactly.
    expectedInitId = maybeAuthority.data.initId;
  }

  const subscribeData: SubscribeDataArgs = {
    planId: p.planId,
    planBump: planBump as unknown as number,
    expectedMint: addr(p.mint) as Address,
    expectedAmount: plan.data.data.terms.amount,
    expectedPeriodHours: plan.data.data.terms.periodHours,
    expectedCreatedAt: plan.data.data.terms.createdAt,
    expectedSubscriptionAuthorityInitId: expectedInitId,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let subscribeIx: any = getSubscribeInstruction({
    subscriber: subscriberSigner,
    merchant: addr(p.merchant) as Address,
    planPda: planPdaAddr,
    subscriptionPda,
    subscriptionAuthorityPda: subAuthorityPda,
    subscribeData,
  });

  // Attach optional reference as READONLY non-signer account
  if (p.reference) {
    const refAccount = {
      address: addr(p.reference) as Address,
      role: AccountRole.READONLY,
    };
    subscribeIx = {
      ...subscribeIx,
      accounts: [...(subscribeIx.accounts ?? []), refAccount],
    };
  }

  instructions.push(subscribeIx);

  // Build message
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let msg: any = createTransactionMessage({ version: 0 });
  msg = setTransactionMessageFeePayer(subscriberAddr, msg);
  msg = setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg);
  for (const ix of instructions) {
    msg = appendTransactionMessageInstruction(ix as never, msg);
  }

  // Compile to Transaction (signatures map will have null entries — unsigned)
  // getBase64EncodedWireTransaction accepts Transaction (not just FullySignedTransaction)
  const compiledTx = compileTransaction(msg);
  return getBase64EncodedWireTransaction(compiledTx) as string;
}

/**
 * Idempotent: ensures a plan exists on-chain.
 *
 * Derives the merchant pubkey from `pullerSecretKeyBase58`, checks whether the
 * plan PDA already exists, and creates it if not. Returns metadata including
 * whether the plan was just created.
 *
 * The puller's keypair is used as the on-chain merchant (plan owner).
 */
export async function ensurePlanOnChain(p: {
  rpcUrl: string;
  /** Base58-encoded 64-byte keypair for the plan owner (merchant/puller). */
  pullerSecretKeyBase58: string;
  planId: bigint;
  mint: string;
  amountBase: bigint;
  periodHours: bigint;
  destinations: string[];
  pullers: string[];
  metadataUri?: string;
  tokenProgram?: string;
}): Promise<{ created: boolean; planPda: string; merchant: string }> {
  const merchantSigner = await createKeyPairSignerFromBytes(
    decodeSecretKey(p.pullerSecretKeyBase58)
  );
  const merchant = merchantSigner.address as string;

  const rpc = makeRpc(p.rpcUrl);

  const maybePlan = await fetchMaybePlanFromSeeds(rpc, {
    owner: merchantSigner.address,
    planId: p.planId,
  });

  const [planPdaAddr] = await findPlanPda({
    owner: merchantSigner.address,
    planId: p.planId,
  });
  const planPda = planPdaAddr as string;

  if (maybePlan.exists) {
    return { created: false, planPda, merchant };
  }

  // Plan does not exist — create it
  const planData: PlanDataArgs = {
    planId: p.planId,
    mint: addr(p.mint) as Address,
    terms: {
      amount: p.amountBase,
      periodHours: p.periodHours,
      createdAt: BigInt(Math.floor(Date.now() / 1000)),
    },
    endTs: BigInt(0),
    destinations: padToFour(p.destinations.map((d) => addr(d) as Address)),
    pullers: padToFour(p.pullers.map((pl) => addr(pl) as Address)),
    metadataUri: (p.metadataUri ?? "").padEnd(128, "\0").slice(0, 128),
  };

  const ix = getCreatePlanInstruction({
    merchant: merchantSigner,
    planPda: planPdaAddr,
    tokenMint: addr(p.mint) as Address,
    tokenProgram: p.tokenProgram
      ? (addr(p.tokenProgram) as Address)
      : undefined,
    planData,
  });

  // Build and send a signed tx
  const base64Tx = await buildAndSignTx(p.rpcUrl, merchantSigner, [ix]);

  // Submit via the RPC's sendTransaction
  const rpcWithSend = createSolanaRpc(p.rpcUrl);
  await rpcWithSend
    .sendTransaction(base64Tx as Parameters<typeof rpcWithSend.sendTransaction>[0], {
      encoding: "base64",
    })
    .send();

  return { created: true, planPda, merchant };
}
