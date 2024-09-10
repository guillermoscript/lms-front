import { NextResponse, type NextRequest } from 'next/server'
import { createI18nMiddleware } from 'next-international/middleware'
import { updateSession } from '@/utils/supabase/middleware'

const I18nMiddleware = createI18nMiddleware({
    locales: ['en', 'es'],
    defaultLocale: 'es',
    urlMappingStrategy: 'rewrite'
})


export async function middleware(request: NextRequest) {
    const response = request.nextUrl.pathname.startsWith('/api') ? NextResponse.next({
        request: {
            headers: request.headers
        }
    }) : I18nMiddleware(request)


    return await updateSession(request, response)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
    ]
}
