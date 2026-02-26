"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase"

interface BalanceState {
    available: number
    escrow: number
    total: number
    loading: boolean
    error: string | null
}

/**
 * Custom hook for wallet balance state.
 * Fetches available and escrow balances from the accounts table.
 * Call `refresh()` after deposits or fund movements.
 */
export function useBalance() {
    const [state, setState] = useState<BalanceState>({
        available: 0,
        escrow: 0,
        total: 0,
        loading: true,
        error: null,
    })

    const refresh = useCallback(async () => {
        const supabase = createClient()
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setState(prev => ({ ...prev, loading: false }))
                return
            }

            const { data: accounts, error } = await supabase
                .from('accounts')
                .select('type, balance_sats')
                .eq('user_id', user.id)

            if (error) {
                setState(prev => ({ ...prev, loading: false, error: error.message }))
                return
            }

            const available = accounts?.find(a => a.type === 'AVAILABLE')?.balance_sats || 0
            const escrow = accounts?.find(a => a.type === 'ESCROW')?.balance_sats || 0

            setState({
                available,
                escrow,
                total: available + escrow,
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
