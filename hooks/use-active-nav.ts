import { usePathname, useSearchParams } from "next/navigation"

// On hard loads the browser URL carries the locale prefix (/en, /es) while nav
// hrefs are locale-less; client-side navigations are already locale-less.
// (i18n.ts can't be imported here — it pulls in next-intl/server.)
function stripLocale(pathname: string): string {
    return pathname.replace(/^\/(en|es)(?=\/|$)/, '') || '/'
}

const ROOT_HREFS = ['/dashboard/admin', '/dashboard/teacher', '/dashboard/student']

/**
 * Whether a nav `href` should highlight for the current URL.
 *
 * - A plain href matches its own path and every path nested under it, except
 *   the three dashboard roots (they would otherwise match everything).
 * - An href with a query string (`/dashboard/student/courses?status=completed`)
 *   is a filtered view of its path, not a section: it matches only the exact
 *   path with every one of its params present. Prefix-matching it lit
 *   "Completed" on every lesson and exam page (#729).
 */
export function isNavActive(href: string, pathname: string, searchParams?: URLSearchParams | null): boolean {
    const [hrefPath, hrefQuery] = href.split('?')

    if (hrefQuery !== undefined) {
        if (pathname !== hrefPath) return false
        const wanted = new URLSearchParams(hrefQuery)
        for (const [key, value] of wanted) {
            if (searchParams?.get(key) !== value) return false
        }
        return true
    }

    if (pathname === hrefPath) return true
    if (!ROOT_HREFS.includes(hrefPath)) {
        return pathname.startsWith(hrefPath + '/')
    }
    return false
}

/**
 * Isolates the active-link comparison logic used for sidebar nav highlighting.
 * Returns the current (locale-stripped) pathname plus a checker for whether a
 * given href should be considered "active" against it.
 */
export function useActiveNav() {
    const pathname = stripLocale(usePathname())
    const searchParams = useSearchParams()

    return {
        pathname,
        isActive: (href: string) => isNavActive(href, pathname, searchParams),
    }
}
