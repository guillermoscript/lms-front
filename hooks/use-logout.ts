"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function useLogout() {
    const router = useRouter()

    const logout = useCallback(async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push("/auth/login")
        router.refresh()
    }, [router])

    return logout
}
