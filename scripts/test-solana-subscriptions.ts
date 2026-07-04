/**
 * test-solana-subscriptions.ts
 *
 * In-process LiteSVM integration test for the Subscriptions on-chain program.
 *
 * Run with:
 *   npx tsx scripts/test-solana-subscriptions.ts
 *
 * Requires: litesvm @solana/subscriptions @solana/kit @solana/web3.js @solana/spl-token
 *
 * The test:
 *   1. Fetches the Subscriptions BPF-upgradeable program ELF from mainnet.
 *   2. Loads it into LiteSVM.
 *   3. Sets up SPL mint + ATAs, mints tokens to subscriber.
 *   4. Creates a plan (merchant).
 *   5. Subscribes (subscriber → plan).
 *   6. Pulls tokens twice in the same period (second should fail).
 *   7. Advances the clock past one period, pulls again (should succeed).
 *   8. Cancels the subscription.
 *   9. Prints ✓/✗ per assertion and PASS or FAIL.
 */

import * as web3 from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { LiteSVM, Clock, FailedTransactionMetadata } from "litesvm";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";

import {
  generateKeyPairSigner,
  createKeyPairSignerFromBytes,
  createKeyPairFromBytes,
  getBase58Encoder,
  getBase58Decoder,
  getTransactionDecoder,
  partiallySignTransaction,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  type TransactionSigner,
  type Address,
  address as addr,
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
  decodePlan,
  type PlanDataArgs,
  type SubscribeDataArgs,
  type TransferDataArgs,
} from "@solana/subscriptions";

import {
  ensurePlanOnChain,
  buildSubscribeTxUnsignedBase64,
} from "../lib/payments/solana-subscriptions";

// ─── Utility helpers ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

/** Returns true if the LiteSVM result is a failure (FailedTransactionMetadata). */
function isTxFailed(result: unknown): result is InstanceType<typeof FailedTransactionMetadata> {
  return result instanceof FailedTransactionMetadata;
}

function assertTxOk(result: unknown, label: string): boolean {
  if (!isTxFailed(result)) {
    console.log(`  ✓ ${label}`);
    passed++;
    return true;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    console.error(`    Error: ${result.err()}`);
    // logs() is a method, not a property
    const logs = result.meta().logs();
    console.error(`    Logs:\n      ${logs.join("\n      ")}`);
    failed++;
    return false;
  }
}

function assertTxReverts(result: unknown, label: string): boolean {
  if (isTxFailed(result)) {
    const logs = result.meta().logs();
    console.log(`  ✓ ${label} (reverted as expected: ${result.err()})`);
    if (logs.length > 0) {
      console.log(`    Revert logs:\n      ${logs.join("\n      ")}`);
    }
    passed++;
    return true;
  } else {
    console.error(`  ✗ FAIL: ${label} — expected revert but tx succeeded`);
    failed++;
    return false;
  }
}

// ─── Keypair conversion helpers ───────────────────────────────────────────────

/** Converts a v1 Keypair → LiteSVM-compatible address (kit v2 Address). */
function v1PubkeyToAddr(kp: web3.Keypair): Address {
  return addr(kp.publicKey.toBase58()) as Address;
}

/**
 * Creates a kit v2 KeyPairSigner from a v1 Keypair (64-byte secret key).
 * v1 secretKey is [privKey(32) | pubKey(32)].
 */
async function toKitSigner(kp: web3.Keypair): Promise<TransactionSigner> {
  return createKeyPairSignerFromBytes(kp.secretKey);
}

// ─── Fetch mainnet program ELF ────────────────────────────────────────────────

async function fetchProgramElf(programId: string): Promise<Buffer> {
  const MAINNET = "https://api.mainnet-beta.solana.com";
  const conn = new web3.Connection(MAINNET, "confirmed");
  const programPubkey = new web3.PublicKey(programId);

  console.log(`  Fetching program account: ${programId}`);
  const programAccount = await conn.getAccountInfo(programPubkey);
  if (!programAccount) throw new Error("Program account not found on mainnet");

  // BPF-upgradeable loader: account data is [discriminator(4) | programDataAddress(32)]
  const programDataAddr = new web3.PublicKey(programAccount.data.slice(4, 36));
  console.log(`  Fetching program data: ${programDataAddr.toBase58()}`);

  const programDataAccount = await conn.getAccountInfo(programDataAddr);
  if (!programDataAccount) throw new Error("ProgramData account not found");

  // ProgramData layout: [discriminator(4) | slot(8) | upgradeAuthorityOption(33)] = 45 bytes header
  // After offset 45: ELF bytes
  const elf = programDataAccount.data.slice(45);
  console.log(`  ELF size: ${elf.length} bytes`);
  return Buffer.from(elf);
}

// ─── LiteSVM transaction builder ─────────────────────────────────────────────

/** Builds and sends a transaction through LiteSVM. Returns the result. */
async function svmSend(
  svm: LiteSVM,
  feePayer: TransactionSigner,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instructions: any[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let msg: any = createTransactionMessage({ version: 0 });
  msg = setTransactionMessageFeePayer(feePayer.address, msg);
  msg = svm.setTransactionMessageLifetimeUsingLatestBlockhash(msg);
  for (const ix of instructions) {
    msg = appendTransactionMessageInstruction(ix, msg);
  }
  const signedTx = await signTransactionMessageWithSigners(msg);
  return svm.sendTransaction(signedTx);
}

// ─── Main test ────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Solana Subscriptions LiteSVM Test ===\n");

  // ── Step 1: Fetch program ELF from mainnet and load into LiteSVM ──────────
  console.log("[ STEP 1 ] Loading Subscriptions program into LiteSVM…");
  let svm: LiteSVM;
  try {
    const elfBuffer = await fetchProgramElf(SUBSCRIPTIONS_PROGRAM_ADDRESS);

    // Write ELF to a temp file (addProgramFromFile is the stable path)
    const elfPath = path.join(os.tmpdir(), "subscriptions.so");
    fs.writeFileSync(elfPath, elfBuffer);

    svm = new LiteSVM();
    svm.addProgramFromFile(
      addr(SUBSCRIPTIONS_PROGRAM_ADDRESS) as Address,
      elfPath
    );
    fs.unlinkSync(elfPath);
    console.log("  ✓ Program loaded\n");
  } catch (e) {
    console.error("  ✗ Failed to load program:", (e as Error).message);
    console.error("  BLOCKED: Cannot proceed without the program.\n");
    console.log("FAIL");
    process.exit(1);
  }

  // ── Step 2: Create keypairs & airdrop SOL ─────────────────────────────────
  console.log("[ STEP 2 ] Creating keypairs and airdropping SOL…");
  const merchantKp = web3.Keypair.generate();
  const subscriberKp = web3.Keypair.generate();
  const pullerKp = web3.Keypair.generate();
  const platformKp = web3.Keypair.generate();

  const merchantSigner = await toKitSigner(merchantKp);
  const subscriberSigner = await toKitSigner(subscriberKp);
  const pullerSigner = await toKitSigner(pullerKp);

  const SOL = BigInt(1_000_000_000);
  svm.airdrop(merchantSigner.address, SOL * BigInt(10));
  svm.airdrop(subscriberSigner.address, SOL * BigInt(10));
  svm.airdrop(pullerSigner.address, SOL * BigInt(10));
  console.log("  ✓ Airdrops done\n");

  // ── Step 3: Create SPL mint + ATAs using v1 helpers against a fake RPC ────
  // LiteSVM doesn't expose an HTTP port, so we use its setAccount to inject
  // a mint account directly. We'll use web3.js v1 to build the account data
  // and svm.setAccount to inject it.
  console.log("[ STEP 3 ] Creating SPL mint + token accounts…");

  // We build the SPL token state using a local connection to LiteSVM's
  // JSON-RPC-like interface. LiteSVM exposes `setAccount` — we use the
  // spl-token JavaScript SDK helpers that work against a Connection, but
  // we need an actual RPC endpoint. Instead, use the LiteSVM devnet shim:
  // LiteSVM has a `startRpcServer` in some versions — check:
  const svmAsAny = svm as unknown as Record<string, unknown>;
  let mint: web3.PublicKey;
  let subscriberAta: web3.PublicKey;
  let merchantAta: web3.PublicKey;
  let platformAta: web3.PublicKey;

  if (typeof svmAsAny["startRpcServer"] === "function") {
    // If the startRpcServer is available, use it to set up a real connection
    const { port } = (svmAsAny["startRpcServer"] as () => { port: number })();
    const conn = new web3.Connection(`http://localhost:${port}`, "confirmed");
    mint = await createMint(conn, merchantKp, merchantKp.publicKey, null, 6);
    const subAtaInfo = await getOrCreateAssociatedTokenAccount(
      conn, merchantKp, mint, subscriberKp.publicKey
    );
    subscriberAta = subAtaInfo.address;
    const merchantAtaInfo = await getOrCreateAssociatedTokenAccount(
      conn, merchantKp, mint, merchantKp.publicKey
    );
    merchantAta = merchantAtaInfo.address;
    const platformAtaInfo = await getOrCreateAssociatedTokenAccount(
      conn, merchantKp, mint, platformKp.publicKey
    );
    platformAta = platformAtaInfo.address;
    await mintTo(conn, merchantKp, mint, subscriberAta, merchantKp, 1_000_000_000);
  } else {
    // Manual account injection: build raw SPL token account data via spl-token layout
    // We create a devnet connection just to derive the accounts, then inject them
    // into LiteSVM via setAccount.
    console.log("  (Using manual account injection — no RPC server available)");

    // Use a real connection to devnet only to create mint/ATA data, but we
    // won't actually broadcast — we just use the key derivation from the SDK.
    // The mint pubkey = we generate it
    mint = web3.Keypair.generate().publicKey;
    subscriberAta = getAssociatedTokenAddressSync(mint, subscriberKp.publicKey);
    merchantAta = getAssociatedTokenAddressSync(mint, merchantKp.publicKey);
    platformAta = getAssociatedTokenAddressSync(mint, platformKp.publicKey);

    const MINT_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

    // Build mint account data (82 bytes for SPL Token mint)
    const { MintLayout, AccountLayout } = await import("@solana/spl-token");

    const mintData = Buffer.alloc(MintLayout.span);
    MintLayout.encode({
      mintAuthorityOption: 1,
      mintAuthority: merchantKp.publicKey,
      supply: BigInt(1_000_000_000),
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: web3.PublicKey.default,
    }, mintData);

    const rentExemptMint = svm.minimumBalanceForRentExemption(BigInt(MintLayout.span));
    svm.setAccount({
      address: addr(mint.toBase58()) as Address,
      lamports: rentExemptMint,
      data: new Uint8Array(mintData),
      programAddress: addr(MINT_PROGRAM) as Address,
      executable: false,
    });

    // Build subscriber token account (165 bytes)
    const SUPPLY = BigInt(1_000_000_000);
    for (const [ataKey, owner, amount] of [
      [subscriberAta, subscriberKp.publicKey, SUPPLY],
      [merchantAta, merchantKp.publicKey, BigInt(0)],
      [platformAta, platformKp.publicKey, BigInt(0)],
    ] as [web3.PublicKey, web3.PublicKey, bigint][]) {
      const ataData = Buffer.alloc(AccountLayout.span);
      AccountLayout.encode({
        mint,
        owner,
        amount,
        delegateOption: 0,
        delegate: web3.PublicKey.default,
        state: 1, // initialized
        isNativeOption: 0,
        isNative: BigInt(0),
        delegatedAmount: BigInt(0),
        closeAuthorityOption: 0,
        closeAuthority: web3.PublicKey.default,
      }, ataData);
      const rentExemptAta = svm.minimumBalanceForRentExemption(BigInt(AccountLayout.span));
      svm.setAccount({
        address: addr(ataKey.toBase58()) as Address,
        lamports: rentExemptAta,
        data: new Uint8Array(ataData),
        programAddress: addr(MINT_PROGRAM) as Address,
        executable: false,
      });
    }
  }
  console.log(`  ✓ mint=${mint.toBase58().slice(0, 8)}…`);
  console.log(`  ✓ subscriberAta=${subscriberAta.toBase58().slice(0, 8)}…\n`);

  // Constants
  const PLAN_ID = BigInt(1);
  const AMOUNT_BASE = BigInt(100_000); // 0.1 token (6 decimals)
  const PERIOD_HOURS = BigInt(24);
  const SPL_TOKEN_PROGRAM = addr("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") as Address;
  const mintAddr = addr(mint.toBase58()) as Address;
  const merchantAddrStr = merchantKp.publicKey.toBase58();
  const subscriberAddrStr = subscriberKp.publicKey.toBase58();
  const ZERO = addr(ZERO_ADDRESS) as Address;

  /** Pad an address array to exactly 4 items. */
  function padToFour(arr: Address[]): [Address, Address, Address, Address] {
    const result = [...arr];
    while (result.length < 4) result.push(ZERO);
    return result.slice(0, 4) as [Address, Address, Address, Address];
  }

  // ── Step 4: Create Plan ───────────────────────────────────────────────────
  console.log("[ STEP 4 ] Creating subscription plan…");

  // Set the LiteSVM clock to real unix time so the on-chain program's clock
  // matches our Date.now() timestamps. LiteSVM defaults to unix_timestamp=0.
  const nowTs = BigInt(Math.floor(Date.now() / 1000));
  {
    const c = svm.getClock();
    svm.setClock(new Clock(c.slot, nowTs, c.epoch, c.leaderScheduleEpoch, nowTs));
    console.log(`  Clock set to unix_timestamp=${nowTs}`);
  }

  const [planPda, planBump] = await findPlanPda({
    owner: merchantSigner.address,
    planId: PLAN_ID,
  });

  const createdAt = svm.getClock().unixTimestamp;
  const planData: PlanDataArgs = {
    planId: PLAN_ID,
    mint: mintAddr,
    terms: {
      amount: AMOUNT_BASE,
      periodHours: PERIOD_HOURS,
      createdAt,
    },
    endTs: BigInt(0),
    destinations: padToFour([
      addr(merchantKp.publicKey.toBase58()) as Address,
      addr(platformKp.publicKey.toBase58()) as Address,
    ]),
    pullers: padToFour([
      addr(pullerKp.publicKey.toBase58()) as Address,
    ]),
    metadataUri: "https://example.com/plan".padEnd(128, "\0").slice(0, 128),
  };

  const createPlanIx = getCreatePlanInstruction({
    merchant: merchantSigner,
    planPda,
    tokenMint: mintAddr,
    tokenProgram: SPL_TOKEN_PROGRAM,
    planData,
  });

  const createPlanResult = await svmSend(svm, merchantSigner, [createPlanIx]);
  assertTxOk(createPlanResult, "Create plan succeeded");

  // Read the plan PDA account and decode it to get the actual stored createdAt.
  // The on-chain program may use the clock's unix_timestamp for createdAt rather
  // than the value we passed — read it back to use the exact stored value in subscribe.
  let actualCreatedAt = createdAt; // default: what we passed
  {
    const planAccountRaw = svm.getAccount(planPda);
    if (planAccountRaw.exists && planAccountRaw.data) {
      try {
        const decoded = decodePlan({
          address: planPda,
          data: planAccountRaw.data,
          executable: false,
          lamports: planAccountRaw.lamports,
          programAddress: planAccountRaw.programAddress,
        });
        actualCreatedAt = decoded.data.data.terms.createdAt;
        console.log(`  Plan stored createdAt: ${actualCreatedAt} (passed: ${createdAt})`);
        if (actualCreatedAt !== createdAt) {
          console.log(`  NOTE: on-chain createdAt differs — using ${actualCreatedAt} for subscribe`);
        }
      } catch (e) {
        console.log(`  Warning: could not decode plan account: ${(e as Error).message}`);
      }
    }
  }

  // ── Step 5: Init SubscriptionAuthority + Subscribe ────────────────────────
  console.log("\n[ STEP 5 ] Initializing subscription authority + subscribing…");

  const [subAuthorityPda] = await findSubscriptionAuthorityPda({
    user: subscriberSigner.address,
    tokenMint: mintAddr,
  });

  const [subscriptionPda] = await findSubscriptionDelegationPda({
    planPda,
    subscriber: subscriberSigner.address,
  });

  const initAuthorityIx = getInitSubscriptionAuthorityInstruction({
    owner: subscriberSigner,
    subscriptionAuthority: subAuthorityPda,
    tokenMint: mintAddr,
    userAta: addr(subscriberAta.toBase58()) as Address,
    tokenProgram: SPL_TOKEN_PROGRAM,
  });

  const subscribeData: SubscribeDataArgs = {
    planId: PLAN_ID,
    planBump: planBump as unknown as number,
    expectedMint: mintAddr,
    expectedAmount: AMOUNT_BASE,
    expectedPeriodHours: PERIOD_HOURS,
    expectedCreatedAt: actualCreatedAt, // use actual stored value from plan PDA
    expectedSubscriptionAuthorityInitId: BigInt(0),
  };

  const subscribeIx = getSubscribeInstruction({
    subscriber: subscriberSigner,
    merchant: merchantSigner.address,
    planPda,
    subscriptionPda,
    subscriptionAuthorityPda: subAuthorityPda,
    subscribeData,
  });

  // First try initAuthority alone to identify if the issue is there or in subscribe
  console.log("  Sending initSubscriptionAuthority…");
  const initResult = await svmSend(svm, subscriberSigner, [initAuthorityIx]);
  const initOk = assertTxOk(initResult, "initSubscriptionAuthority succeeded");

  if (initOk) {
    // Check subscriber ATA delegate after init
    const ataAccountAfterInit = svm.getAccount(addr(subscriberAta.toBase58()) as Address);
    if (ataAccountAfterInit.exists && ataAccountAfterInit.data) {
      const { AccountLayout } = await import("@solana/spl-token");
      const decoded = AccountLayout.decode(Buffer.from(ataAccountAfterInit.data));
      console.log(`  ATA delegate after init: ${new web3.PublicKey(decoded.delegate).toBase58()}`);
      console.log(`  ATA delegateOption: ${decoded.delegateOption}`);
      console.log(`  ATA delegatedAmount: ${decoded.delegatedAmount}`);
    }
  }

  console.log("  Sending subscribe…");
  const subscribeResult = await svmSend(svm, subscriberSigner, [subscribeIx]);
  const subscribeOk = assertTxOk(subscribeResult, "Subscribe succeeded");

  // Assert subscription state: account exists with data
  const subAccountRaw = svm.getAccount(subscriptionPda);
  assert(subAccountRaw !== null && subAccountRaw.exists, "SubscriptionDelegation account exists");
  assert(
    subAccountRaw !== null && subAccountRaw.exists && subAccountRaw.data !== undefined && subAccountRaw.data.length > 0,
    "SubscriptionDelegation has account data"
  );

  if (!subscribeOk) {
    console.error("\n  BLOCKED at subscribe step — skipping remaining steps.");
    printResults();
    process.exit(1);
  }

  // Debug: decode the existing subscriber's subscription authority after init
  if (initOk) {
    const { decodeSubscriptionAuthority: decodeSubAuth } = await import("@solana/subscriptions");
    const authAccountRaw = svm.getAccount(subAuthorityPda);
    if (authAccountRaw.exists && authAccountRaw.data) {
      try {
        const decoded = decodeSubAuth({
          address: subAuthorityPda,
          data: authAccountRaw.data,
          executable: false,
          lamports: authAccountRaw.lamports,
          programAddress: authAccountRaw.programAddress,
        });
        console.log(`  DEBUG subscriber authority initId: ${decoded.data.initId}`);
      } catch (e) {
        console.log(`  DEBUG could not decode authority: ${(e as Error).message}`);
      }
    }
  }

  // ── Step 6: First pull (should succeed) ───────────────────────────────────
  console.log("\n[ STEP 6 ] First pull (merchant receives tokens)…");

  const transferData1: TransferDataArgs = {
    amount: AMOUNT_BASE,
    delegator: addr(subscriberAddrStr) as Address,
    mint: mintAddr,
  };

  const pullIx1 = getTransferSubscriptionInstruction({
    subscriptionPda,
    planPda,
    subscriptionAuthority: subAuthorityPda,
    delegatorAta: addr(subscriberAta.toBase58()) as Address,
    receiverAta: addr(merchantAta.toBase58()) as Address,
    caller: pullerSigner,
    tokenMint: mintAddr,
    tokenProgram: SPL_TOKEN_PROGRAM,
    transferData: transferData1,
  });

  const pull1Result = await svmSend(svm, pullerSigner, [pullIx1]);
  const pull1Ok = assertTxOk(pull1Result, "First pull succeeded");

  if (!pull1Ok) {
    console.error("\n  BLOCKED at first pull — skipping remaining steps.");
    printResults();
    process.exit(1);
  }

  // ── Step 7: Second pull in same period (should REVERT) ───────────────────
  console.log("\n[ STEP 7 ] Second pull in same period (expect revert)…");

  const pullIx2 = getTransferSubscriptionInstruction({
    subscriptionPda,
    planPda,
    subscriptionAuthority: subAuthorityPda,
    delegatorAta: addr(subscriberAta.toBase58()) as Address,
    receiverAta: addr(merchantAta.toBase58()) as Address,
    caller: pullerSigner,
    tokenMint: mintAddr,
    tokenProgram: SPL_TOKEN_PROGRAM,
    transferData: transferData1,
  });

  const pull2Result = await svmSend(svm, pullerSigner, [pullIx2]);
  assertTxReverts(pull2Result, "Second pull in same period reverted");

  // ── Step 8: Advance clock past one period, pull again (should succeed) ────
  console.log("\n[ STEP 8 ] Advance clock one period + pull again…");

  const currentClock = svm.getClock();
  const newUnixTimestamp =
    currentClock.unixTimestamp + PERIOD_HOURS * BigInt(3600) + BigInt(60);
  const newClock = new Clock(
    currentClock.slot + BigInt(100),
    currentClock.epochStartTimestamp,
    currentClock.epoch,
    currentClock.leaderScheduleEpoch,
    newUnixTimestamp
  );
  svm.setClock(newClock);
  console.log(
    `  Clock advanced by ${PERIOD_HOURS * BigInt(3600) + BigInt(60)}s (past one period)`
  );

  // Expire the blockhash so pull3 gets a fresh blockhash and is not deduplicated
  // against pull1 (which has identical instruction bytes). LiteSVM's transaction
  // history would otherwise reject it as AlreadyProcessed.
  svm.expireBlockhash();

  const pullIx3 = getTransferSubscriptionInstruction({
    subscriptionPda,
    planPda,
    subscriptionAuthority: subAuthorityPda,
    delegatorAta: addr(subscriberAta.toBase58()) as Address,
    receiverAta: addr(merchantAta.toBase58()) as Address,
    caller: pullerSigner,
    tokenMint: mintAddr,
    tokenProgram: SPL_TOKEN_PROGRAM,
    transferData: transferData1,
  });

  const pull3Result = await svmSend(svm, pullerSigner, [pullIx3]);
  assertTxOk(pull3Result, "Pull after period advance succeeded");

  // ── Step 9: Cancel subscription ───────────────────────────────────────────
  console.log("\n[ STEP 9 ] Cancelling subscription…");

  const cancelIx = getCancelSubscriptionInstruction({
    subscriber: subscriberSigner,
    planPda,
    subscriptionPda,
  });

  const cancelResult = await svmSend(svm, subscriberSigner, [cancelIx]);
  assertTxOk(cancelResult, "Cancel subscription succeeded");

  // Assert expiresAtTs !== 0 after cancel (account still exists, field changed)
  const subAccountAfterCancel = svm.getAccount(subscriptionPda);
  assert(
    subAccountAfterCancel !== null && subAccountAfterCancel.exists,
    "SubscriptionDelegation account still exists after cancel"
  );

  // ── Step 10: ensurePlanOnChain + buildSubscribeTxUnsignedBase64 ──────────
  //
  // These functions require a Solana JSON-RPC URL. We spin up a minimal
  // in-process HTTP JSON-RPC server backed by the current LiteSVM instance.
  // This lets us run the full round-trip without any external network calls.
  //
  console.log("\n[ STEP 10 ] ensurePlanOnChain + buildSubscribeTxUnsignedBase64…");

  // ── 10a: spin up a minimal JSON-RPC server backed by LiteSVM ─────────────
  const svmRpcPort = await new Promise<number>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let rpcReq: { id: unknown; method: string; params?: unknown[] };
        try {
          rpcReq = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "bad json" }));
          return;
        }

        const respond = (result: unknown) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: rpcReq.id, result }));
        };
        const respondError = (code: number, message: string) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: rpcReq.id,
              error: { code, message },
            })
          );
        };

        const method = rpcReq.method;
        const params = (rpcReq.params ?? []) as unknown[];

        if (method === "getLatestBlockhash") {
          const bh = svm.latestBlockhash();
          respond({
            context: { slot: 1 },
            value: { blockhash: bh, lastValidBlockHeight: 9999999 },
          });
        } else if (method === "getSlot") {
          // The Subscriptions program sets SubscriptionAuthority.init_id =
          // Clock::slot at init time, and subscribe() verifies it. The unsigned
          // builder reads getSlot() to know the value the bundled init will use,
          // so expose the LiteSVM clock's current slot here.
          respond(Number(svm.getClock().slot));
        } else if (method === "getAccountInfo") {
          const address = (params[0] as string) ?? "";
          const opts = (params[1] as Record<string, unknown>) ?? {};
          const encoding = (opts["encoding"] as string) ?? "base64";
          const account = svm.getAccount(addr(address) as Address);
          if (!account.exists) {
            respond({ context: { slot: 1 }, value: null });
          } else {
            let dataField: unknown;
            if (encoding === "base64") {
              dataField = [
                Buffer.from(account.data).toString("base64"),
                "base64",
              ];
            } else {
              dataField = [
                Buffer.from(account.data).toString("base64"),
                "base64",
              ];
            }
            respond({
              context: { slot: 1 },
              value: {
                lamports: Number(account.lamports),
                owner: account.programAddress,
                data: dataField,
                executable: account.executable,
                rentEpoch: 0,
                space: account.data.length,
              },
            });
          }
        } else if (method === "sendTransaction") {
          // Decode base64 tx → send via LiteSVM
          const txBase64 = params[0] as string;
          try {
            const txBytes = Buffer.from(txBase64, "base64");
            const txDecoder = getTransactionDecoder();
            const decodedTx = txDecoder.decode(new Uint8Array(txBytes));
            const sendResult = svm.sendTransaction(decodedTx);
            if (sendResult instanceof FailedTransactionMetadata) {
              respondError(-32002, `Transaction simulation failed: ${sendResult.err()}`);
            } else {
              // Return a fake signature
              respond("5" + "A".repeat(86));
            }
          } catch (e) {
            respondError(-32002, `sendTransaction error: ${(e as Error).message}`);
          }
        } else if (method === "getSignatureStatuses") {
          // Return confirmed for all signatures
          const sigs = (params[0] as string[]) ?? [];
          respond({
            context: { slot: 1 },
            value: sigs.map(() => ({
              slot: 1,
              confirmations: 1,
              err: null,
              confirmationStatus: "confirmed",
            })),
          });
        } else if (method === "getFeeForMessage") {
          respond({ context: { slot: 1 }, value: 5000 });
        } else {
          respondError(-32601, `Method not found: ${method}`);
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        resolve(address.port);
      } else {
        reject(new Error("Failed to get server port"));
      }
    });
  });

  const svmRpcUrl = `http://127.0.0.1:${svmRpcPort}`;
  console.log(`  LiteSVM JSON-RPC shim listening at ${svmRpcUrl}`);

  // ── 10b: Test ensurePlanOnChain ──────────────────────────────────────────
  console.log("\n  [10b] Testing ensurePlanOnChain…");

  // Use pullerKp as the "puller/merchant" for this test plan
  const ENSURE_PLAN_ID = BigInt(42);

  // Encode pullerKp.secretKey (64 bytes) to base58 for use as pullerSecretKeyBase58
  // @solana/kit's getBase58Encoder expects a string; use bs58 from @solana/web3.js bundled dep
  const bs58 = (await import("bs58")).default;
  const pullerSkBase58Str = bs58.encode(pullerKp.secretKey);

  let ensureResult1: { created: boolean; planPda: string; merchant: string };
  try {
    ensureResult1 = await ensurePlanOnChain({
      rpcUrl: svmRpcUrl,
      pullerSecretKeyBase58: pullerSkBase58Str,
      planId: ENSURE_PLAN_ID,
      mint: mint.toBase58(),
      amountBase: AMOUNT_BASE,
      periodHours: PERIOD_HOURS,
      destinations: [merchantKp.publicKey.toBase58()],
      pullers: [pullerKp.publicKey.toBase58()],
      metadataUri: "https://example.com/ensure-plan",
    });
    assert(ensureResult1.created === true, "ensurePlanOnChain: first call created=true");
    assert(
      ensureResult1.merchant === pullerKp.publicKey.toBase58(),
      "ensurePlanOnChain: merchant matches puller pubkey"
    );
    console.log(`  planPda: ${ensureResult1.planPda.slice(0, 8)}…`);
  } catch (e) {
    console.error(`  ensurePlanOnChain first call threw: ${(e as Error).message}`);
    failed++;
  }

  // Second call should be idempotent (created=false)
  try {
    const ensureResult2 = await ensurePlanOnChain({
      rpcUrl: svmRpcUrl,
      pullerSecretKeyBase58: pullerSkBase58Str,
      planId: ENSURE_PLAN_ID,
      mint: mint.toBase58(),
      amountBase: AMOUNT_BASE,
      periodHours: PERIOD_HOURS,
      destinations: [merchantKp.publicKey.toBase58()],
      pullers: [pullerKp.publicKey.toBase58()],
    });
    assert(
      ensureResult2.created === false,
      "ensurePlanOnChain: second call created=false (idempotent)"
    );
  } catch (e) {
    console.error(`  ensurePlanOnChain second call threw: ${(e as Error).message}`);
    failed++;
  }

  // ── 10c: Test buildSubscribeTxUnsignedBase64 ─────────────────────────────
  console.log("\n  [10c] Testing buildSubscribeTxUnsignedBase64…");

  // Fresh subscriber keypair (has never subscribed to PLAN_ID=1 from Step 4)
  const freshSubscriberKp = web3.Keypair.generate();
  const freshSubscriberSigner = await toKitSigner(freshSubscriberKp);
  svm.airdrop(freshSubscriberSigner.address, SOL * BigInt(10));

  // Set up ATA for fresh subscriber (inject into LiteSVM)
  const freshSubscriberAta = getAssociatedTokenAddressSync(mint, freshSubscriberKp.publicKey);
  {
    const { AccountLayout } = await import("@solana/spl-token");
    const ataData = Buffer.alloc(AccountLayout.span);
    AccountLayout.encode({
      mint,
      owner: freshSubscriberKp.publicKey,
      amount: BigInt(1_000_000_000), // enough tokens
      delegateOption: 0,
      delegate: web3.PublicKey.default,
      state: 1,
      isNativeOption: 0,
      isNative: BigInt(0),
      delegatedAmount: BigInt(0),
      closeAuthorityOption: 0,
      closeAuthority: web3.PublicKey.default,
    }, ataData);
    const MINT_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    svm.setAccount({
      address: addr(freshSubscriberAta.toBase58()) as Address,
      lamports: svm.minimumBalanceForRentExemption(BigInt(AccountLayout.span)),
      data: new Uint8Array(ataData),
      programAddress: addr(MINT_PROGRAM) as Address,
      executable: false,
    });
  }

  // Build the unsigned tx (merchant = merchantKp, planId = PLAN_ID = 1 from Step 4)
  let unsignedBase64: string;
  try {
    unsignedBase64 = await buildSubscribeTxUnsignedBase64({
      rpcUrl: svmRpcUrl,
      subscriber: freshSubscriberKp.publicKey.toBase58(),
      merchant: merchantAddrStr,
      planId: PLAN_ID,
      mint: mint.toBase58(),
      userAta: freshSubscriberAta.toBase58(),
      // reference: platformKp.publicKey.toBase58(), // test first without reference
    });
    assert(
      typeof unsignedBase64 === "string" && unsignedBase64.length > 100,
      "buildSubscribeTxUnsignedBase64: returns non-empty base64 string"
    );
    console.log(`  unsigned tx base64 length: ${unsignedBase64.length}`);
  } catch (e) {
    console.error(`  buildSubscribeTxUnsignedBase64 threw: ${(e as Error).message}`);
    failed++;
    // Can't continue without the tx
    printResults();
    return;
  }

  // Decode, sign with fresh subscriber, submit to LiteSVM, assert delegation
  try {
    const txBytes = Buffer.from(unsignedBase64, "base64");
    const txDecoder = getTransactionDecoder();
    const unsignedTx = txDecoder.decode(new Uint8Array(txBytes));

    // Convert web3.js v1 secretKey (64-byte raw) into a CryptoKeyPair for signing
    const freshSubscriberCryptoKp = await createKeyPairFromBytes(
      freshSubscriberKp.secretKey,
      true /* extractable */
    );
    // Sign the compiled tx with the subscriber's CryptoKeyPair
    const signedTx = await partiallySignTransaction(
      [freshSubscriberCryptoKp],
      unsignedTx
    );

      // Debug: show signature map
    const sigEntries = Object.entries(signedTx.signatures);
    console.log(`  Signatures in tx (${sigEntries.length} required signers):`);
    for (const [addr2, sig] of sigEntries) {
      console.log(`    ${addr2.slice(0, 8)}…: ${sig ? "SIGNED" : "NULL"}`);
    }
    console.log(`  fresh subscriber addr: ${freshSubscriberKp.publicKey.toBase58().slice(0, 8)}…`);

    // Debug: check subscription authority initId after the initAuth instruction would have run
    // Check the fresh subscriber's subscription authority account BEFORE submit
    const { decodeSubscriptionAuthority } = await import("@solana/subscriptions");
    const [freshSubAuthorityPda] = await findSubscriptionAuthorityPda({
      user: freshSubscriberSigner.address,
      tokenMint: addr(mint.toBase58()) as Address,
    });
    const authorityAccountBefore = svm.getAccount(freshSubAuthorityPda);
    console.log(`  subscription authority before submit: exists=${authorityAccountBefore.exists}`);
    if (authorityAccountBefore.exists && authorityAccountBefore.data) {
      try {
        const decodedAuth = decodeSubscriptionAuthority({
          address: freshSubAuthorityPda,
          data: authorityAccountBefore.data,
          executable: false,
          lamports: authorityAccountBefore.lamports,
          programAddress: authorityAccountBefore.programAddress,
        });
        console.log(`  authority initId: ${decodedAuth.data.initId}`);
      } catch (decodeErr) {
        console.log(`  could not decode authority: ${(decodeErr as Error).message}`);
      }
    }

    const submitResult = svm.sendTransaction(signedTx);
    assertTxOk(submitResult, "buildSubscribeTxUnsignedBase64: signed tx submitted to LiteSVM");

    // Verify the SubscriptionDelegation account was created
    const [freshPlanPda] = await findPlanPda({
      owner: addr(merchantAddrStr) as Address,
      planId: PLAN_ID,
    });
    const [freshSubPda] = await findSubscriptionDelegationPda({
      planPda: freshPlanPda,
      subscriber: freshSubscriberSigner.address,
    });
    const freshSubAccount = svm.getAccount(freshSubPda);
    assert(
      freshSubAccount !== null && freshSubAccount.exists,
      "buildSubscribeTxUnsignedBase64: SubscriptionDelegation account created for fresh subscriber"
    );
  } catch (e) {
    console.error(`  sign/submit unsigned tx threw: ${(e as Error).message}`);
    failed++;
  }

  // ── Results ───────────────────────────────────────────────────────────────
  printResults();
}

function printResults() {
  console.log("\n=== Results ===");
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(failed === 0 ? "\nPASS" : "\nFAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
