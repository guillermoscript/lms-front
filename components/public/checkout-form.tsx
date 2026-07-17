'use client';

import { useState, useEffect, useRef, useSyncExternalStore, useTransition } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { enrollUser, enrollFree, subscribeFree } from '@/app/[locale]/(public)/checkout/actions';
import { StripePaymentForm } from '@/components/public/stripe-payment-form';
import { createPaymentRequest } from '@/app/actions/payment-requests';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useTranslations } from 'next-intl';
import {
    IconLoader2,
    IconCreditCard,
    IconBuildingBank,
    IconCheck,
    IconLock,
    IconCalendar,
    IconWallet,
    IconAlertTriangle,
    IconQrcode,
} from '@tabler/icons-react';

// Minimal shape of the injected Phantom provider we rely on (sign-only flow).
interface PhantomProvider {
    isPhantom?: boolean;
    connect: () => Promise<{ publicKey: { toString: () => string } }>;
    signTransaction: <T>(tx: T) => Promise<T>;
}
function getPhantom(): PhantomProvider | null {
    if (typeof window === 'undefined') return null;
    const p = (window as unknown as { solana?: PhantomProvider }).solana;
    return p?.isPhantom ? p : null;
}

interface CheckoutFormProps {
    courseId?: string;
    planId?: string;
    title: string;
    description?: string | null;
    price: number | string;
    formattedPrice?: string | null;
    productId?: number;
    durationDays?: number;
    features?: string | null;
    userName?: string;
    userEmail?: string;
    paymentProvider?: string | null;
    /** One-time Solana settlement tokens this school offers (USDC and/or SOL). */
    solanaCurrencies?: ('usdc' | 'sol')[];
}

export function CheckoutForm({
    courseId,
    planId,
    title,
    description,
    price,
    formattedPrice,
    productId,
    durationDays,
    features,
    userName,
    userEmail,
    paymentProvider,
    solanaCurrencies,
}: CheckoutFormProps) {
    const [isPending, startTransition] = useTransition();
    const [paymentMethod, setPaymentMethod] = useState<'card' | 'offline'>('card');
    const [offlineData, setOfflineData] = useState({
        name: userName || '',
        email: userEmail || '',
        phone: '',
        message: ''
    });
    const router = useRouter();
    const t = useTranslations('checkout');

    // Provider-agnostic checkout (#280 Phase 4/5): Lemon Squeezy = hosted
    // redirect, Solana = QR + on-chain poll. Other providers use the inline flow.
    const isRedirectProvider = paymentProvider === 'lemonsqueezy';
    // Both one-time Solana ('solana') and native auto-pull subs ('solana_subs')
    // present a Solana Pay QR and poll /verify. The subscriber wallet is captured
    // server-side (subscribe-tx), so the poll body stays { transactionId }.
    const isQrProvider = paymentProvider === 'solana' || paymentProvider === 'solana_subs';
    const isSolanaSubs = paymentProvider === 'solana_subs';
    // One-time Solana settlement token choice (USDC default; SOL if the school
    // opted in). Both honor the USD price — USDC 1:1, SOL converted at the live
    // rate at checkout. solana_subs is always USDC, so no choice there.
    const solCurrencyOpts = paymentProvider === 'solana' ? (solanaCurrencies ?? ['usdc']) : [];
    const [solanaCurrency, setSolanaCurrency] = useState<'usdc' | 'sol'>(
        solCurrencyOpts[0] ?? 'usdc',
    );
    const [solanaQr, setSolanaQr] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // In-app desktop wallet ("Pay with Phantom"). The QR is for off-device /
    // mobile wallets; a first-time subscription needs TWO signed txs (init then
    // subscribe), which a single QR scan can't do — so subscriptions require the
    // in-app wallet (desktop extension or Phantom's in-app browser).
    const phantomAvailable = useSyncExternalStore(
        () => () => undefined,
        () => !!getPhantom(),
        () => false,
    );
    const [phantomBusy, setPhantomBusy] = useState(false);
    const [phantomMsg, setPhantomMsg] = useState<string | null>(null);
    const [phantomError, setPhantomError] = useState<string | null>(null);

    // Clean up the Solana poll on unmount.
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const isFree = typeof price === 'number' ? price === 0 : price === t('free')
    const showOfflineTab = !paymentProvider || paymentProvider === 'manual';
    const displayPrice = formattedPrice || (typeof price === 'number' ? `$${price}` : price);

    // Parse features into a list. Plans store features as a JSON array string
    // (e.g. '["Unlimited course access","Certificate"]'); other sources may use
    // plain newline/comma-separated text. Try JSON first, fall back to splitting.
    const featureList: string[] = (() => {
        if (!features) return [];
        const trimmed = features.trim();
        if (trimmed.startsWith('[')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map(f => String(f).trim()).filter(Boolean);
                }
            } catch {
                /* not valid JSON — fall through to plain-text split */
            }
        }
        return trimmed.split(/[\n,]+/).map(f => f.trim()).filter(Boolean);
    })();

    const checkoutDone = (transactionId: number) => {
        toast.success(t('toasts.paymentSuccess'));
        router.push(`/checkout/success?transactionId=${transactionId}`);
    };

    // Poll /verify until the on-chain transfer/subscription is confirmed. The
    // verify endpoint flips the transaction → successful (trigger creates the
    // subscription + entitlements) and, for solana_subs, fires the first charge.
    const startVerifyPoll = (txId: number, subscriber?: string) => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const vr = await fetch('/api/payments/solana/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transactionId: txId, subscriber }),
                });
                const vd = await vr.json();
                if (vd.confirmed) {
                    if (pollRef.current) clearInterval(pollRef.current);
                    checkoutDone(txId);
                }
            } catch {
                /* transient poll error — keep polling */
            }
        }, 3000);
    };

    // Create the pending transaction + provider checkout session. Returns the
    // parsed response so callers can branch on `kind` (redirect / qr).
    const createCheckoutSession = async () => {
        const res = await fetch('/api/payments/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                planId: planId ? parseInt(planId) : undefined,
                productId,
                ...(paymentProvider === 'solana' ? { solanaCurrency } : {}),
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Checkout failed');
        return data as { kind: string; url: string | null; transactionId: number };
    };

    // Real provider checkout (Lemon Squeezy redirect / Solana QR). Returns true
    // if it handled the flow, false to fall back to the inline/mock path.
    const startProviderCheckout = async (): Promise<boolean> => {
        if (!isRedirectProvider && !isQrProvider) return false;

        const data = await createCheckoutSession();

        if (data.kind === 'redirect' && data.url) {
            // Lemon Squeezy hosted checkout — leave the app.
            window.location.href = data.url;
            return true;
        }

        if (data.kind === 'qr' && data.url) {
            // Solana Pay — render the transfer-request URL as a QR and poll the
            // verify endpoint until the on-chain transfer is confirmed.
            const dataUrl = await QRCode.toDataURL(data.url, { width: 240, margin: 1 });
            setSolanaQr(dataUrl);
            startVerifyPoll(data.transactionId);
            return true;
        }

        throw new Error('Unsupported checkout response');
    };

    // In-app desktop wallet checkout: connect Phantom, sign (one tx for one-time,
    // two for a first-time subscription: init authority → subscribe), submit each
    // via our server (sign-only; Phantom's own simulate trips on these
    // instructions), then poll /verify. Mirrors the QR flow but signs locally so
    // it works on desktop where a QR can't be scanned, and can do the two-step
    // subscribe a single QR scan can't.
    const payWithPhantom = async () => {
        setPhantomError(null);
        setPhantomBusy(true);
        setPhantomMsg(t('payment.phantomPreparing'));
        try {
            const provider = getPhantom();
            if (!provider) throw new Error(t('payment.phantomNotFound'));

            const data = await createCheckoutSession();
            if (data.kind !== 'qr' || !data.url) throw new Error('Unsupported checkout response');
            const txId = data.transactionId;
            // The QR `url` is a Solana Pay link (solana:<encoded tx-request URL>).
            // POST { account } to that decoded endpoint — exactly what a wallet's
            // QR scanner does — to get the unsigned tx (it carries ?reference=).
            const endpoint = decodeURIComponent(data.url.replace(/^solana:/, ''));

            setPhantomMsg(t('payment.phantomConnecting'));
            const conn = await provider.connect();
            const account = conn.publicKey.toString();

            const { VersionedTransaction } = await import('@solana/web3.js');
            // One-time → 1 tx. Subscription → up to 2 (init authority, subscribe).
            const maxSteps = isSolanaSubs ? 2 : 1;
            for (let i = 0; i < maxSteps; i++) {
                setPhantomMsg(t('payment.phantomRequesting'));
                const br = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account }),
                });
                const bd = await br.json();
                if (!br.ok || !bd.transaction) throw new Error(bd.error || 'Failed to build transaction');
                const step: string | undefined = bd.step; // 'init' | 'subscribe' | undefined (one-time)

                setPhantomMsg(step === 'init' ? t('payment.phantomSignInit') : t('payment.phantomSign'));
                const bytes = Uint8Array.from(atob(bd.transaction), c => c.charCodeAt(0));
                const vtx = VersionedTransaction.deserialize(bytes);
                const signed = await provider.signTransaction(vtx);
                let binary = '';
                const serialized = signed.serialize();
                for (let k = 0; k < serialized.length; k++) binary += String.fromCharCode(serialized[k]);

                setPhantomMsg(t('payment.phantomSubmitting'));
                const sr = await fetch('/api/payments/solana/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transaction: btoa(binary) }),
                });
                const sd = await sr.json();
                if (!sr.ok || !sd.signature) throw new Error(sd.error || 'Submit failed');

                // The submit route confirms before returning, so by here the init
                // tx has landed and the next request will return the subscribe tx.
                if (step !== 'init') break;
                setPhantomMsg(t('payment.phantomInitDone'));
            }

            setPhantomMsg(t('payment.phantomConfirming'));
            startVerifyPoll(txId, account);
            // Leave phantomBusy true: the confirming spinner shows until the poll
            // redirects on success.
        } catch (error) {
            setPhantomError(error instanceof Error ? error.message : String(error));
            setPhantomBusy(false);
            setPhantomMsg(null);
        }
    };

    const handleEnroll = () => {
        startTransition(async () => {
            try {
                if (isFree) {
                    // Free plan → activate a zero-price subscription; free course →
                    // grant a free entitlement. Both are one-click, no payment.
                    if (planId) {
                        await subscribeFree(planId);
                        toast.success(t('toasts.success'));
                        router.push('/dashboard/student/browse?checkout=success');
                    } else {
                        await enrollFree(courseId);
                        toast.success(t('toasts.success'));
                        router.push(`/dashboard/student/courses/${courseId}`);
                    }
                    return;
                }

                if (paymentMethod === 'card') {
                    // Lemon Squeezy / Solana go through the real provider checkout;
                    // everything else uses the existing inline (mock) enrollment.
                    if (isRedirectProvider || isQrProvider) {
                        const handled = await startProviderCheckout();
                        if (handled) return; // redirect leaves the page / QR keeps loading
                    }
                    const result = await enrollUser(courseId, planId, 'mock_test');
                    toast.success(t('toasts.paymentSuccess'));
                    router.push(`/checkout/success?transactionId=${result.transaction_id}`);
                } else {
                    // Offline payment — works for both products and plans
                    if (productId) {
                        await createPaymentRequest({
                            productId,
                            contactName: offlineData.name,
                            contactEmail: offlineData.email,
                            contactPhone: offlineData.phone,
                            message: offlineData.message
                        });
                        toast.success(t('toasts.requestSent'));
                        router.push('/dashboard/student/payments');
                    } else if (planId) {
                        await createPaymentRequest({
                            planId: parseInt(planId),
                            contactName: offlineData.name,
                            contactEmail: offlineData.email,
                            contactPhone: offlineData.phone,
                            message: offlineData.message
                        });
                        toast.success(t('toasts.requestSent'));
                        router.push('/dashboard/student/payments');
                    } else {
                        throw new Error("No product or plan to process");
                    }
                }
            } catch (error) {
                toast.error(t('toasts.error', { message: error instanceof Error ? error.message : String(error) }));
            }
        });
    };

    // ─── Order summary block (shared between free and paid) ───
    const orderSummary = (
        <div className="border-b border-border px-6 py-5 sm:px-8">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{t('item')}</p>
                    <p className="mt-0.5 font-semibold">{title}</p>
                    {description && (
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                            {description}
                        </p>
                    )}
                    {durationDays && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <IconCalendar className="h-3.5 w-3.5" />
                            {t('duration', { days: durationDays })}
                        </p>
                    )}
                </div>
                <span className="shrink-0 text-2xl font-extrabold tabular-nums tracking-tight">
                    {isFree ? t('free') : displayPrice}
                </span>
            </div>

            {/* Features list */}
            {featureList.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{t('included')}</p>
                    <ul className="space-y-1.5">
                        {featureList.map((feature, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                                <IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                                {feature}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );

    // ─── Free enrollment ───
    if (isFree) {
        return (
            <div className="rounded-xl border border-border bg-card">
                {orderSummary}

                <div className="px-6 py-4 sm:px-8">
                    <Button
                        className="w-full"
                        onClick={handleEnroll}
                        disabled={isPending}
                    >
                        {isPending && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isPending ? t('enrollment.enrolling') : t('enrollment.button')}
                    </Button>
                </div>
            </div>
        );
    }

    // ─── Provider checkout (Lemon Squeezy redirect / Solana QR + Phantom) ───
    if (isRedirectProvider || isQrProvider) {
        // Subscriptions require the in-app wallet (two signed txs); a QR can't.
        const subsNeedsWallet = isSolanaSubs && !phantomAvailable;
        const showActions = !solanaQr && !phantomBusy;

        return (
            <div className="rounded-xl border border-border bg-card">
                {orderSummary}

                <div className="px-6 py-6 sm:px-8">
                    {solanaQr ? (
                        <div className="flex flex-col items-center gap-3 text-center">
                            <p className="text-sm font-medium">{t('payment.solanaScan')}</p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={solanaQr}
                                alt="Solana Pay QR"
                                width={240}
                                height={240}
                                className="rounded-lg border border-border"
                            />
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                                {t('payment.solanaWaiting')}
                            </p>
                        </div>
                    ) : phantomBusy ? (
                        <div className="flex flex-col items-center gap-3 py-2 text-center">
                            <IconLoader2 className="h-6 w-6 animate-spin text-primary" />
                            <p className="text-sm font-medium">{phantomMsg}</p>
                            <p className="text-xs text-muted-foreground">{t('payment.solanaWaiting')}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                                {isQrProvider ? t('payment.solanaInstructions') : t('payment.redirectInstructions')}
                            </p>
                            {/* One-time Solana: choose settlement token when the school offers both. */}
                            {paymentProvider === 'solana' && solCurrencyOpts.length > 1 && (
                                <div className="space-y-1.5">
                                    <p className="text-xs font-medium">{t('payment.payInLabel')}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {solCurrencyOpts.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setSolanaCurrency(c)}
                                                aria-pressed={solanaCurrency === c}
                                                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                                    solanaCurrency === c
                                                        ? 'border-primary bg-primary/10 text-foreground'
                                                        : 'border-border text-muted-foreground hover:bg-muted/50'
                                                }`}
                                            >
                                                {c === 'usdc' ? t('payment.payInUsdc') : t('payment.payInSol')}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        {solanaCurrency === 'sol' ? t('payment.solConversionNote') : t('payment.usdcNote')}
                                    </p>
                                </div>
                            )}
                            {subsNeedsWallet && (
                                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                                    <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <div className="space-y-1.5">
                                        <p>{t('payment.subsDesktopOnly')}</p>
                                        <a
                                            href="https://phantom.app/download"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
                                        >
                                            <IconWallet className="h-3.5 w-3.5" />
                                            {t('payment.phantomInstall')}
                                        </a>
                                    </div>
                                </div>
                            )}
                            {phantomError && (
                                <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs leading-relaxed text-destructive">
                                    <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                    {phantomError}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {showActions && (
                    <div className="border-t border-border px-6 py-4 sm:px-8">
                        {/* Solana with Phantom available → in-app wallet (primary). */}
                        {isQrProvider && phantomAvailable ? (
                            <div className="space-y-2">
                                <Button className="w-full" onClick={payWithPhantom} disabled={isPending || phantomBusy}>
                                    <IconWallet className="mr-2 h-4 w-4" />
                                    {phantomError ? t('payment.phantomRetry') : t('payment.payWithPhantom')}
                                </Button>
                                {/* One-time can fall back to QR; subscriptions can't. */}
                                {!isSolanaSubs && (
                                    <Button
                                        variant="ghost"
                                        className="w-full"
                                        onClick={handleEnroll}
                                        disabled={isPending || phantomBusy}
                                    >
                                        <IconQrcode className="mr-2 h-4 w-4" />
                                        {t('payment.payByQr')}
                                    </Button>
                                )}
                                <p className="text-center text-[11px] text-muted-foreground">{t('payment.phantomHint')}</p>
                            </div>
                        ) : subsNeedsWallet ? null : (
                            /* Lemon Squeezy redirect, or one-time Solana via QR. */
                            <Button className="w-full" onClick={handleEnroll} disabled={isPending}>
                                {isPending && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isPending ? t('payment.processing') : t('payment.button')}
                            </Button>
                        )}
                        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                            <IconLock className="h-3 w-3" />
                            {t('secureCheckout')}
                        </p>
                    </div>
                )}
            </div>
        );
    }

    // ─── Paid checkout ───
    // Stripe uses a real PaymentElement (webhook grants enrollment). The mock
    // "Pay & Enroll (Test)" button is a dev-only sandbox escape hatch — never
    // shown in production, and never for redirect/QR/manual providers (those
    // return earlier or use the offline tab).
    const isStripe = paymentProvider === 'stripe';
    const allowSandbox = process.env.NODE_ENV !== 'production' && paymentProvider !== 'manual';

    // Card payment panel: real Stripe form, an unavailable notice, or (in dev)
    // just the sandbox button below it.
    const cardPanel = (
        <div className="space-y-4">
            {isStripe ? (
                <StripePaymentForm
                    productId={productId}
                    planId={planId}
                    price={price}
                    hasManualFallback={showOfflineTab}
                />
            ) : !allowSandbox ? (
                <p className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                    {t('payment.cardUnavailable')}
                </p>
            ) : null}

            {allowSandbox && (
                <div className="space-y-2">
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={handleEnroll}
                        disabled={isPending}
                    >
                        {isPending && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isPending ? t('payment.processing') : t('payment.sandboxButton')}
                    </Button>
                    <p className="text-center text-[11px] text-muted-foreground">
                        {t('payment.sandboxHint')}
                    </p>
                </div>
            )}
        </div>
    );

    const offlinePanel = (
        <div className="space-y-4">
            <p className="rounded-lg bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                {t('payment.offlineInstructions')}
            </p>
            <div className="space-y-1.5">
                <Label htmlFor="offlineName" className="text-xs font-medium">{t('payment.contactName')}</Label>
                <Input
                    id="offlineName"
                    placeholder="Your Name"
                    value={offlineData.name}
                    onChange={e => setOfflineData({ ...offlineData, name: e.target.value })}
                    disabled={isPending}
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="offlineEmail" className="text-xs font-medium">{t('payment.contactEmail')}</Label>
                <Input
                    id="offlineEmail"
                    type="email"
                    placeholder="email@example.com"
                    value={offlineData.email}
                    onChange={e => setOfflineData({ ...offlineData, email: e.target.value })}
                    disabled={isPending}
                    readOnly={!!userEmail}
                    className={userEmail ? 'bg-muted' : ''}
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="offlinePhone" className="text-xs font-medium">{t('payment.contactPhone')}</Label>
                <Input
                    id="offlinePhone"
                    placeholder="+1 234 567 8900"
                    value={offlineData.phone}
                    onChange={e => setOfflineData({ ...offlineData, phone: e.target.value })}
                    disabled={isPending}
                />
            </div>
            <Button
                className="w-full"
                onClick={handleEnroll}
                disabled={isPending}
            >
                {isPending && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPending ? t('payment.processing') : t('payment.requestButton')}
            </Button>
        </div>
    );

    return (
        <div className="rounded-xl border border-border bg-card">
            {orderSummary}

            {/* Payment methods */}
            <div className="px-6 py-6 sm:px-8">
                {showOfflineTab ? (
                    <Tabs defaultValue="card" onValueChange={(v) => v && setPaymentMethod(v as 'card' | 'offline')}>
                        <TabsList className="w-full">
                            <TabsTrigger value="card" className="flex-1 gap-1.5">
                                <IconCreditCard className="h-3.5 w-3.5" />
                                {t('payment.card')}
                            </TabsTrigger>
                            <TabsTrigger value="offline" className="flex-1 gap-1.5">
                                <IconBuildingBank className="h-3.5 w-3.5" />
                                {t('payment.offline')}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="card" className="mt-5">
                            {cardPanel}
                        </TabsContent>

                        <TabsContent value="offline" className="mt-5">
                            {offlinePanel}
                        </TabsContent>
                    </Tabs>
                ) : (
                    cardPanel
                )}
            </div>

            <div className="border-t border-border px-6 py-4 sm:px-8">
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                    <IconLock className="h-3 w-3" />
                    {t('secureCheckout')}
                </p>
            </div>
        </div>
    );
}
