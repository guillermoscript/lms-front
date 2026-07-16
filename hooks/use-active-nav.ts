import { usePathname } from "next/navigation"

// On hard loads the browser URL carries the locale prefix (/en, /es) while nav
// hrefs are locale-less; client-side navigations are already locale-less.
// (i18n.ts can't be imported here — it pulls in next-intl/server.)
function stripLocale(pathname: string): string {
    return pathname.replace(/^\/(en|es)(?=\/|$)/, '') || '/'
}

function isNavActive(href: string, pathname: string): boolean {
    const hrefPath = href.split('?')[0]
    if (pathname === hrefPath) return true
    if (hrefPath !== '/dashboard/admin' && hrefPath !== '/dashboard/teacher' && hrefPath !== '/dashboard/student') {
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

    return {
        pathname,
        isActive: (href: string) => isNavActive(href, pathname),
    }
}
