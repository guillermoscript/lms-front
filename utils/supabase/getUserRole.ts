import { jwtDecode } from 'jwt-decode'

import { createClient as ServerClient } from './server'
import { Tables } from './supabase'

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
        return userRole as Tables<'user_roles'>['role']
    }
}
