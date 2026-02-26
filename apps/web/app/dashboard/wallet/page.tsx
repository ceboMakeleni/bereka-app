"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import { Copy, RefreshCw, CheckCircle, ArrowDownLeft, ArrowUpRight, Clock, History } from "lucide-react"

interface LedgerEntry {
    id: string
    amount_sats: number
    description: string
    created_at: string
}

const INVOICE_EXPIRY_SECONDS = 3600 // 1 hour
const POLL_INTERVAL_MS = 3000

export default function WalletPage() {
    const [amount, setAmount] = useState("")
    const [invoice, setInvoice] = useState<string | null>(null)
    const [paymentHash, setPaymentHash] = useState<string | null>(null)
    const [isPaid, setIsPaid] = useState(false)
    const [loading, setLoading] = useState(false)
    const [checkingNow, setCheckingNow] = useState(false)
    const [balance, setBalance] = useState(0)
    const [escrowBalance, setEscrowBalance] = useState(0)
    const [transactions, setTransactions] = useState<LedgerEntry[]>([])
    const [secondsLeft, setSecondsLeft] = useState(INVOICE_EXPIRY_SECONDS)
    const [isExpired, setIsExpired] = useState(false)
    const invoiceCreatedAt = useRef<number>(0)

    useEffect(() => {
        const fetchBalance = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Fetch balances
            const { data: accounts } = await supabase
                .from('accounts')
                .select('id, type, balance_sats')
                .eq('user_id', user.id)

            if (accounts) {
                const avail = accounts.find(a => a.type === 'AVAILABLE')
                const escrow = accounts.find(a => a.type === 'ESCROW')
                if (avail) setBalance(avail.balance_sats)
                if (escrow) setEscrowBalance(escrow.balance_sats)

                // Fetch ledger entries for user's accounts
                const accountIds = accounts.map(a => a.id)
                if (accountIds.length > 0) {
                    const { data: ledgerData } = await supabase
                        .from('ledger_entries')
                        .select('*')
                        .or(`debit_account_id.in.(${accountIds.join(',')}),credit_account_id.in.(${accountIds.join(',')})`)
                        .order('created_at', { ascending: false })
                        .limit(20)

                    if (ledgerData) {
                        // Transform ledger entries: credits to user accounts are positive, debits are negative
                        const transformed = ledgerData.map(entry => ({
                            id: entry.id,
                            amount_sats: accountIds.includes(entry.credit_account_id)
                                ? entry.amount_sats
                                : -entry.amount_sats,
                            description: entry.reference_type.replace(/_/g, ' ').toLowerCase(),
                            created_at: entry.created_at,
                        }))
                        setTransactions(transformed)
                    }
                }
            }
        }
        fetchBalance()
    }, [isPaid])

    const handleCreateInvoice = async () => {
        if (!amount || Number(amount) <= 0) return
        setLoading(true)
        setInvoice(null)
        setIsPaid(false)
        setIsExpired(false)

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        try {
            const { data, error } = await supabase.functions.invoke('create-invoice', {
                body: { amountSats: Number(amount) }
            })
            if (error) throw error

            setInvoice(data.payment_request)
            setPaymentHash(data.payment_hash)
            invoiceCreatedAt.current = Date.now()
            setSecondsLeft(INVOICE_EXPIRY_SECONDS)
        } catch (e: any) {
            toast.error(e.message || 'Failed to create invoice')
        } finally {
            setLoading(false)
        }
    }

    // Countdown timer
    useEffect(() => {
        if (!invoice || isPaid || isExpired) return

        const timer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - invoiceCreatedAt.current) / 1000)
            const remaining = INVOICE_EXPIRY_SECONDS - elapsed

            if (remaining <= 0) {
                setIsExpired(true)
                setSecondsLeft(0)
                clearInterval(timer)
            } else {
                setSecondsLeft(remaining)
            }
        }, 1000)

        return () => clearInterval(timer)
    }, [invoice, isPaid, isExpired])

    // Poll for payment status
    const checkPayment = useCallback(async () => {
        if (!paymentHash || isPaid || isExpired) return

        const supabase = createClient()
        try {
            const { data } = await supabase.functions.invoke('check-payment', {
                body: { paymentHash }
            })
            if (data?.paid) {
                setIsPaid(true)
                toast.success('Payment received!')
            }
        } catch {
            // Silently retry
        }
    }, [paymentHash, isPaid, isExpired])

    useEffect(() => {
        if (!paymentHash || isPaid || isExpired) return
        const interval = setInterval(checkPayment, POLL_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [paymentHash, isPaid, isExpired, checkPayment])

    // Manual "I've paid" check
    const handleManualCheck = async () => {
        setCheckingNow(true)
        await checkPayment()
        if (!isPaid) {
            toast.info("Payment not detected yet. We'll keep checking...")
        }
        setCheckingNow(false)
    }

    const handleCopyInvoice = () => {
        if (invoice) {
            navigator.clipboard.writeText(invoice)
            toast.success("Invoice copied to clipboard!")
        }
    }

    const handleReset = () => {
        setInvoice(null)
        setPaymentHash(null)
        setIsPaid(false)
        setIsExpired(false)
        setAmount("")
        setSecondsLeft(INVOICE_EXPIRY_SECONDS)
    }

    const formatTime = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds / 60)
        const s = totalSeconds % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Wallet</h1>
                <p className="text-muted-foreground">Manage your Lightning balance and view transactions.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                    {/* Balance Card */}
                    <Card className="bg-white/5 border-white/10 glass overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-transparent pointer-events-none" />
                        <CardHeader>
                            <CardTitle className="text-lg text-muted-foreground">Available Balance</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-1">
                                <p className="text-5xl font-bold text-foreground tracking-tight">{Number(balance).toLocaleString()} <span className="text-2xl text-yellow-500">sats</span></p>
                            </div>

                            {escrowBalance > 0 && (
                                <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Clock className="w-4 h-4" />
                                        <span>Locked in Escrow</span>
                                    </div>
                                    <p className="font-medium">{Number(escrowBalance).toLocaleString()} sats</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Top Up Card */}
                    <Card className="bg-white/5 border-white/10 glass">
                        <CardHeader>
                            <CardTitle>Top Up via Lightning</CardTitle>
                            <CardDescription>
                                Generate a Lightning invoice and pay it from any wallet
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Step 1: Enter amount */}
                            {!invoice && !isPaid && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="amount">Amount (sats)</Label>
                                        <Input
                                            id="amount"
                                            type="number"
                                            placeholder="1000"
                                            min="1"
                                            value={amount}
                                            onChange={e => setAmount(e.target.value)}
                                            className="bg-black/20 border-white/10 focus-visible:ring-yellow-500"
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {[1000, 5000, 10000, 50000].map(preset => (
                                            <Button
                                                key={preset}
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setAmount(String(preset))}
                                                className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 hover:text-yellow-500 transition-colors"
                                            >
                                                {(preset / 1000).toFixed(preset < 1000 ? 1 : 0)}k
                                            </Button>
                                        ))}
                                    </div>
                                    <Button
                                        onClick={handleCreateInvoice}
                                        disabled={loading || !amount || Number(amount) <= 0}
                                        className="w-full bg-yellow-500 text-black hover:bg-yellow-600 font-semibold"
                                    >
                                        {loading ? 'Generating...' : 'Generate Invoice'}
                                    </Button>
                                </div>
                            )}

                            {/* Step 2: Show invoice (not expired) */}
                            {invoice && !isPaid && !isExpired && (
                                <div className="space-y-4 text-center animate-in fade-in duration-300">
                                    {/* Countdown */}
                                    <div className={`text-sm font-mono font-medium ${secondsLeft < 300 ? 'text-red-500 animate-pulse' : 'text-yellow-500'}`}>
                                        Expires in {formatTime(secondsLeft)}
                                    </div>

                                    {/* QR Code */}
                                    <div className="bg-white p-4 rounded-xl inline-block shadow-xl">
                                        <QRCode value={invoice} size={220} />
                                    </div>

                                    <p className="text-sm text-muted-foreground">
                                        Scan with your Lightning wallet or copy the invoice below
                                    </p>

                                    {/* Invoice string + copy */}
                                    <div className="relative">
                                        <Input
                                            value={invoice}
                                            readOnly
                                            className="pr-24 text-xs font-mono bg-black/40 border-white/10 text-muted-foreground"
                                        />
                                        <Button
                                            size="sm"
                                            className="absolute right-1 top-1 h-7 bg-white/10 hover:bg-white/20 text-white"
                                            onClick={handleCopyInvoice}
                                        >
                                            <Copy className="h-3 w-3 mr-1" />
                                            Copy
                                        </Button>
                                    </div>

                                    {/* I've Paid + Waiting */}
                                    <div className="flex flex-col gap-2 pt-2">
                                        <Button
                                            variant="outline"
                                            className="border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-500"
                                            onClick={handleManualCheck}
                                            disabled={checkingNow}
                                        >
                                            {checkingNow ? (
                                                <>
                                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                                    Checking...
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle className="h-4 w-4 mr-2" />
                                                    I've Paid
                                                </>
                                            )}
                                        </Button>
                                    </div>

                                    <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
                                        Cancel Payment
                                    </Button>
                                </div>
                            )}

                            {/* Invoice expired */}
                            {invoice && !isPaid && isExpired && (
                                <div className="text-center py-8 space-y-4">
                                    <div className="text-4xl mb-2">⏳</div>
                                    <h3 className="text-lg font-semibold text-red-500">Invoice Expired</h3>
                                    <p className="text-sm text-muted-foreground px-4">
                                        The invoice has expired. Generate a new one to continue your top-up.
                                    </p>
                                    <div className="pt-2">
                                        <Button onClick={handleReset} variant="outline" className="w-full border-white/10 hover:bg-white/5">
                                            Start Over
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Payment successful */}
                            {isPaid && (
                                <div className="text-center py-8 space-y-4 animate-in zoom-in duration-500">
                                    <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-emerald-500">Payment Received!</h3>
                                    <p className="text-muted-foreground pb-4">
                                        Successfully added <strong className="text-foreground">{Number(amount).toLocaleString()} sats</strong> to your balance.
                                    </p>
                                    <Button onClick={handleReset} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                                        Top Up Again
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Transaction History */}
                <Card className="bg-white/5 border-white/10 glass md:h-full flex flex-col">
                    <CardHeader className="border-b border-white/5 pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <History className="w-5 h-5 text-muted-foreground" />
                                Transaction History
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                        {transactions.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground">
                                <History className="w-10 h-10 mx-auto opacity-20 mb-3" />
                                <p>No transactions yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {transactions.map((tx) => {
                                    const isDeposit = tx.amount_sats > 0
                                    return (
                                        <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-full ${isDeposit ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                    {isDeposit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm">{tx.description}</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {new Date(tx.created_at).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`font-semibold ${isDeposit ? 'text-emerald-500' : 'text-foreground'}`}>
                                                {isDeposit ? '+' : ''}{Number(tx.amount_sats).toLocaleString()}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
