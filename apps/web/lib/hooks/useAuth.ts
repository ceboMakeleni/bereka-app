"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"
import type { Profile, UserRole } from "@/lib/types"

interface AuthState {
    user: User | null
    profile: Profile | null
    role: UserRole | null
    isAdmin: boolean
    loading: boolean
    error: string | null
}

/**
 * Custom hook for centralized auth state management.
 * Fetches the current user and their profile, and provides
 * convenient derived state like `isAdmin` and `role`.
 */
export function useAuth() {
    const [state, setState] = useState<AuthState>({
        user: null,
        profile: null,
        role: null,
        isAdmin: false,
        loading: true,
        error: null,
    })

    const refresh = useCallback(async () => {
        const supabase = createClient()
        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser()

            if (authError || !user) {
                setState(prev => ({ ...prev, user: null, profile: null, role: null, isAdmin: false, loading: false }))
                return
            }

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            if (profileError) {
                setState(prev => ({
                    ...prev,
                    user,
                    profile: null,
                    role: null,
                    isAdmin: false,
                    loading: false,
                    error: profileError.message,
                }))
                return
            }

            setState({
                user,
                profile,
                role: profile?.role || null,
                isAdmin: profile?.role === 'admin',
                loading: false,
                error: null,
            })
        } catch (err) {
            setState(prev => ({
                ...prev,
                loading: false,
                error: (err as Error).message,
            }))
        }
    }, [])

    useEffect(() => {
        refresh()
    }, [refresh])

    return { ...state, refresh }
}
