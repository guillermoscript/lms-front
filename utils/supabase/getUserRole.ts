import { jwtDecode } from 'jwt-decode'

import { createClient } from './client'
import { createClient as ServerClient } from './server'

export async function getServerUserRole () {
    const supabase = ServerClient()
    const userData = await supabase.auth.getSession()

    if (userData.error) {
        console.log('Error getting user data', userData.error)
        throw new Error('Error getting user data')
    }

    if (userData.data?.session?.access_token) {
        const decodedToken = jwtDecode(userData.data.session.access_token)
        // @ts-expect-error
        const userRole = decodedToken?.user_role
        return userRole
    }
}

export async function getClientUserRole () {
    const supabase = createClient()
    const userData = await supabase.auth.getSession()

    if (userData.error) {
        console.log('Error getting user data', userData.error)
        throw new Error('Error getting user data')
    }

    if (userData.data?.session?.access_token) {
        const decodedToken = jwtDecode(userData.data.session.access_token)
        // @ts-expect-error
        const userRole = decodedToken?.user_role
        return userRole
    }
}
