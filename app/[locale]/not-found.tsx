import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations('errors')

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-16">
      {/* Faint notebook grid, fading toward the edges */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(circle, var(--border) 1px, transparent 1.4px)',
          backgroundSize: '22px 22px',
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 42%, black 30%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 42%, black 30%, transparent 78%)',
        }}
      />
      {/* Soft brand glow behind the numerals */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[38%] h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklch, var(--primary) 16%, transparent), transparent 68%)',
        }}
      />

      <div className="relative w-full max-w-xl text-center">
        <p className="nf-rise [font-family:var(--font-geist-mono)] text-xs font-medium uppercase tracking-[0.4em] text-muted-foreground">
          {t('notFound.title')}
        </p>

        {/* The displaced 404: solid, an outlined hole, then muted, each knocked askew */}
        <div
          aria-hidden
          className="my-6 flex select-none items-center justify-center gap-2 [font-family:var(--font-geist-mono)] text-[clamp(6rem,26vw,13rem)] font-bold leading-none tracking-tight sm:gap-4"
        >
          <span className="nf-glyph -translate-y-2 -rotate-6 text-primary">4</span>
          <span
            className="nf-glyph nf-glyph-2 translate-y-1 rotate-2 text-transparent"
            style={{ WebkitTextStroke: '2px var(--primary)' }}
          >
            0
          </span>
          <span className="nf-glyph nf-glyph-3 -translate-y-3 rotate-6 text-foreground/25">
            4
          </span>
        </div>

        <h1 className="nf-rise nf-rise-2 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {t('notFound.title')}
        </h1>
        <p className="nf-rise nf-rise-3 mx-auto mt-3 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t('notFound.description')}
        </p>

        <div className="nf-rise nf-rise-4 mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-7 text-sm font-medium text-primary-foreground shadow-sm transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t('notFound.backToDashboard')}
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border px-7 text-sm font-medium text-foreground transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t('notFound.goHome')}
          </Link>
        </div>
      </div>

      {/* Scoped entrance motion, disabled under reduced-motion */}
      <style>{`
        .nf-glyph {
          opacity: 0;
          transform-origin: center bottom;
          animation: nf-drop 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .nf-glyph-2 { animation-delay: 0.09s; }
        .nf-glyph-3 { animation-delay: 0.18s; }
        .nf-rise {
          opacity: 0;
          animation: nf-fade 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.28s forwards;
        }
        .nf-rise-2 { animation-delay: 0.36s; }
        .nf-rise-3 { animation-delay: 0.44s; }
        .nf-rise-4 { animation-delay: 0.52s; }
        @keyframes nf-drop {
          from { opacity: 0; transform: translateY(-1.5rem); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nf-fade {
          from { opacity: 0; transform: translateY(0.5rem); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .nf-glyph, .nf-rise { opacity: 1; animation: none; }
        }
      `}</style>
    </main>
  )
}
