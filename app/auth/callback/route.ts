import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET (request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the Auth Helpers package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/auth-helpers/nextjs#managing-sign-in-with-code-exchange
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const cookieStore = cookies()
    const supabase = createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(requestUrl.origin)
}

// import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
// import { cookies } from 'next/headers'
// import { NextRequest, NextResponse } from 'next/server'

// export async function GET(req: NextRequest) {
//   const cookieStore = cookies()
//   const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
//   const { searchParams } = new URL(req.url)
//   const code = searchParams.get('code')

//   if (code) {
//     await supabase.auth.exchangeCodeForSession(code)
//   }

//   return NextResponse.redirect(new URL('/account', req.url))
// }
