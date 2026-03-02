"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ShieldAlert, Download, Pencil, Trash2, Plus, X, BarChart2, TrendingUp, AlertTriangle, Clock, RefreshCw, Users } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DisputedJob {
    id: string
    title: string
    description: string
    budget_sats: number
    status: string
    creator_id: string
    worker_id: string | null
    disputes?: DisputeRecord[]
    creator_profile?: { username: string | null }
    worker_profile?: { username: string | null }
}

interface DisputeRecord {
    id: string
    reason: string
    evidence_urls: string[] | null
    opened_by: string
    status: string
    created_at: string
    opener_profile?: { username: string | null }
}

interface Profile {
    role: string
}

interface LedgerEntry {
    id: string
    debit_account_id: string
    credit_account_id: string
    amount_sats: number
    reference_type: string
    reference_id: string
    created_at: string
}

interface Account {
    id: string
    user_id: string | null
    type: string
    balance_sats: number
    created_at: string
}

interface PaymentEvent {
    id: string
    provider: string
    payment_hash: string
    amount_sats: number
    status: string
    processed_at: string
}

interface Category {
    id: string
    name: string
    created_at: string
}

// ─── Metrics types ────────────────────────────────────────────────────────────
interface MarketplaceOverview {
    total_jobs: number; open_jobs: number; funded_jobs: number
    in_progress_jobs: number; review_jobs: number; completed_jobs: number
    disputed_jobs: number; cancelled_jobs: number; accepted_jobs: number
    accept_rate_pct: number; completion_rate_pct: number
    active_posters_30d: number; active_workers_30d: number
}
interface FinancialsOverview {
    total_payout_sats: number; payout_count: number; total_fee_sats: number
    escrow_held_sats: number; escrow_released_sats: number; escrow_refunded_sats: number
    avg_budget_sats: number; gmv_sats: number
}
interface TrustSafetyOverview {
    open_disputes: number; resolved_disputes: number
    open_chat_reports: number; resolved_chat_reports: number
    low_ratings_count: number; avg_rating: number; total_ratings: number
}
interface FunnelRow {
    day: string; jobs_posted: number; jobs_funded: number; jobs_in_progress: number
    jobs_completed: number; jobs_cancelled: number; jobs_disputed: number
    jobs_accepted: number; accept_rate_pct: number; completion_rate_pct: number
    avg_budget_sats: number; gmv_sats: number
}
interface CategoryMetric {
    category: string; posted: number; accepted: number; completed: number
    accept_rate_pct: number; completion_rate_pct: number; avg_budget_sats: number
}
interface StuckJob {
    id: string; title: string; status: string; budget_sats: number
    category: string | null; updated_at: string; age_hours: number
    profiles?: { username: string | null }
}
interface MetricsState {
    marketplace: MarketplaceOverview | null
    financials: FinancialsOverview | null
    trustSafety: TrustSafetyOverview | null
    funnel: FunnelRow[]
    categories: CategoryMetric[]
    stuckJobs: StuckJob[]
    loading: boolean
    lastRefreshed: Date | null
}
// ── End metrics types ──────────────────────────────────────────────────────────

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<'disputes' | 'ledger' | 'categories' | 'metrics'>('disputes')
    const [disputes, setDisputes] = useState<DisputedJob[]>([])
    const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([])
    const [accounts, setAccounts] = useState<Account[]>([])
    const [paymentEvents, setPaymentEvents] = useState<PaymentEvent[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [user, setUser] = useState<any>(null)
    const [isAdmin, setIsAdmin] = useState(false)
    const [editingCategory, setEditingCategory] = useState<Category | null>(null)
    const [newCategoryName, setNewCategoryName] = useState("")
    const [isAddingCategory, setIsAddingCategory] = useState(false)
    const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d')
    const [metrics, setMetrics] = useState<MetricsState>({
        marketplace: null, financials: null, trustSafety: null,
        funnel: [], categories: [], stuckJobs: [], loading: false, lastRefreshed: null
    })
    const [refreshingViews, setRefreshingViews] = useState(false)

    useEffect(() => {
        document.title = "Admin — Bereka"
    }, [])

    useEffect(() => {
        const init = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)

            if (!user) { setLoading(false); return }

            // Check admin role
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()

            if (profile?.role !== 'admin') {
                setIsAdmin(false)
                setLoading(false)
                return
            }
            setIsAdmin(true)

            // Fetch disputed jobs with their dispute records
            const { data: disputesData } = await supabase
                .from('jobs')
                .select(`
                    *,
                    disputes!disputes_job_id_fkey(
                        id,
                        reason,
                        evidence_urls,
                        opened_by,
                        status,
                        created_at
                    ),
                    creator_profile:profiles!jobs_creator_id_fkey(username),
                    worker_profile:profiles!jobs_worker_id_fkey(username)
                `)
                .eq('status', 'DISPUTED')
                .order('updated_at', { ascending: false })

            if (disputesData) setDisputes(disputesData as unknown as DisputedJob[])

            // Fetch ledger data
            const { data: ledgerData } = await supabase
                .from('ledger_entries')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100)

            if (ledgerData) setLedgerEntries(ledgerData)

            // Fetch accounts
            const { data: accountsData } = await supabase
                .from('accounts')
                .select('*')
                .order('created_at', { ascending: false })

            if (accountsData) setAccounts(accountsData)

            // Fetch payment events
            const { data: eventsData } = await supabase
                .from('payment_events')
                .select('*')
                .order('processed_at', { ascending: false })
                .limit(50)

            if (eventsData) setPaymentEvents(eventsData)

            // Fetch categories
            const { data: categoriesData } = await supabase
                .from('job_categories')
                .select('*')
                .order('name')

            if (categoriesData) setCategories(categoriesData)

            setLoading(false)
        }
        init()
    }, [])

    const fetchMetrics = async () => {
        setMetrics(m => ({ ...m, loading: true }))
        const supabase = createClient()
        const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
        const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

        try {
            const [overviewRes, funnelRes, categoriesRes, stuckRes] = await Promise.all([
                supabase.functions.invoke('admin-metrics', {
                    body: undefined, method: 'GET',
                    headers: { 'x-query': JSON.stringify({ type: 'overview', start }) }
                }),
                supabase.functions.invoke('admin-metrics', {
                    body: undefined, method: 'GET',
                    headers: { 'x-query': JSON.stringify({ type: 'funnel', start }) }
                }),
                supabase.functions.invoke('admin-metrics', {
                    body: undefined, method: 'GET',
                    headers: { 'x-query': JSON.stringify({ type: 'categories' }) }
                }),
                supabase.functions.invoke('admin-metrics', {
                    body: undefined, method: 'GET',
                    headers: { 'x-query': JSON.stringify({ type: 'stuck-jobs' }) }
                }),
            ])

            // Use direct Supabase queries as fallback (edge function uses admin client)
            const [mktData, finData, tsData] = await Promise.all([
                supabase.from('v_marketplace_overview').select('*').single(),
                supabase.from('v_financials_overview').select('*').single(),
                supabase.from('v_trust_safety_overview').select('*').single(),
            ])
            const funnelData = await supabase.from('v_admin_funnel_daily').select('*')
                .gte('day', start).order('day', { ascending: true }).limit(90)
            const catData = await supabase.from('v_admin_category_weekly').select('*')
                .gte('week_start', start).order('week_start', { ascending: false })
            const stuckData = await supabase.from('jobs')
                .select('id, title, status, budget_sats, category, updated_at, profiles!jobs_creator_id_fkey(username)')
                .in('status', ['FUNDED', 'IN_PROGRESS', 'REVIEW'])
                .lt('updated_at', new Date(Date.now() - 48 * 3_600_000).toISOString())
                .order('updated_at', { ascending: true }).limit(25)

            // Build category rollup
            const catMap: Record<string, CategoryMetric> = {}
            for (const row of (catData.data ?? [])) {
                if (!catMap[row.category]) catMap[row.category] = { category: row.category, posted: 0, accepted: 0, completed: 0, accept_rate_pct: 0, completion_rate_pct: 0, avg_budget_sats: 0 }
                catMap[row.category].posted += Number(row.posted)
                catMap[row.category].accepted += Number(row.accepted)
                catMap[row.category].completed += Number(row.completed)
            }
            const cats = Object.values(catMap).map(c => ({
                ...c,
                accept_rate_pct: c.posted > 0 ? Math.round(c.accepted / c.posted * 100) : 0,
                completion_rate_pct: c.accepted > 0 ? Math.round(c.completed / c.accepted * 100) : 0,
            })).sort((a, b) => b.posted - a.posted)

            const now = Date.now()
            const stuck = (stuckData.data ?? []).map((j: any) => ({
                ...j, age_hours: Math.round((now - new Date(j.updated_at).getTime()) / 3_600_000)
            }))

            setMetrics({
                marketplace: mktData.data as MarketplaceOverview | null,
                financials: finData.data as FinancialsOverview | null,
                trustSafety: tsData.data as TrustSafetyOverview | null,
                funnel: (funnelData.data ?? []) as FunnelRow[],
                categories: cats,
                stuckJobs: stuck as StuckJob[],
                loading: false,
                lastRefreshed: new Date(),
            })
        } catch (e) {
            console.error('Metrics fetch error:', e)
            setMetrics(m => ({ ...m, loading: false }))
        }
    }

    const handleRefreshViews = async () => {
        setRefreshingViews(true)
        try {
            const { error } = await createClient().rpc('refresh_metrics_materialized_views')
            if (error) throw error
            toast.success('Materialized views refreshed')
            await fetchMetrics()
        } catch (e: any) {
            toast.error(e.message || 'Refresh failed')
        } finally {
            setRefreshingViews(false)
        }
    }

    const handleResolve = async (jobId: string, resolution: 'REFUND' | 'PAY_WORKER' | 'SPLIT') => {
        if (!user) return
        setActionLoading(jobId)
        const supabase = createClient()

        try {
            const { data, error } = await supabase.functions.invoke('resolve-dispute', {
                body: { jobId, resolution }
            })

            if (error) throw error
            setDisputes(disputes.filter(d => d.id !== jobId))
            toast.success(`Dispute resolved: ${resolution}`)
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Resolution failed")
        } finally {
            setActionLoading(null)
        }
    }

    const validateCategoryName = (name: string): string | null => {
        const trimmed = name.trim()
        if (trimmed.length < 2) return "Category name must be at least 2 characters"
        if (trimmed.length > 50) return "Category name must be 50 characters or less"

        // Check for duplicates (case-insensitive)
        const isDuplicate = categories.some(
            cat => cat.name.toLowerCase() === trimmed.toLowerCase() && cat.id !== editingCategory?.id
        )
        if (isDuplicate) return "A category with this name already exists"

        // Allow only alphanumeric, spaces, &, -, /
        const validPattern = /^[a-zA-Z0-9\s&\-\/]+$/
        if (!validPattern.test(trimmed)) return "Category name can only contain letters, numbers, spaces, &, -, /"

        return null
    }

    const handleCreateCategory = async () => {
        const validationError = validateCategoryName(newCategoryName)
        if (validationError) {
            toast.error(validationError)
            return
        }

        const supabase = createClient()
        const trimmed = newCategoryName.trim()

        try {
            const { error } = await supabase
                .from('job_categories')
                .insert({ name: trimmed })

            if (error) throw error

            // Refresh categories
            const { data } = await supabase
                .from('job_categories')
                .select('*')
                .order('name')

            if (data) setCategories(data)
            setNewCategoryName("")
            setIsAddingCategory(false)
            toast.success(`Category "${trimmed}" created successfully`)
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to create category")
        }
    }

    const handleUpdateCategory = async (category: Category, newName: string) => {
        const validationError = validateCategoryName(newName)
        if (validationError) {
            toast.error(validationError)
            return
        }

        const supabase = createClient()
        const trimmed = newName.trim()
        const oldName = category.name

        try {
            // Update the category name
            const { error: categoryError } = await supabase
                .from('job_categories')
                .update({ name: trimmed })
                .eq('id', category.id)

            if (categoryError) throw categoryError

            // Update all jobs with the old category name to the new name
            const { error: jobsError } = await supabase
                .from('jobs')
                .update({ category: trimmed })
                .eq('category', oldName)

            if (jobsError) throw jobsError

            // Refresh categories
            const { data } = await supabase
                .from('job_categories')
                .select('*')
                .order('name')

            if (data) setCategories(data)
            setEditingCategory(null)
            toast.success(`Category updated to "${trimmed}"`)
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to update category")
        }
    }

    const handleDeleteCategory = async (category: Category) => {
        // Prevent deletion of "Other" category
        if (category.name === 'Other') {
            toast.error('The "Other" category cannot be deleted')
            return
        }

        if (!confirm(`Are you sure you want to delete "${category.name}"? All jobs in this category will be moved to "Other".`)) {
            return
        }

        setActionLoading(category.id)
        const supabase = createClient()

        try {
            // First, update all jobs with this category to "Other"
            const { error: jobsError } = await supabase
                .from('jobs')
                .update({ category: 'Other' })
                .eq('category', category.name)

            if (jobsError) throw jobsError

            // Then delete the category
            const { error: deleteError } = await supabase
                .from('job_categories')
                .delete()
                .eq('id', category.id)

            if (deleteError) throw deleteError

            // Refresh categories
            const { data } = await supabase
                .from('job_categories')
                .select('*')
                .order('name')

            if (data) setCategories(data)
            toast.success(`Category "${category.name}" deleted successfully`)
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to delete category")
        } finally {
            setActionLoading(null)
        }
    }

    if (loading) return <div className="p-8">Loading...</div>

    const exportToCsv = (data: any[], filename: string) => {
        if (data.length === 0) return

        const headers = Object.keys(data[0])
        const csv = [
            headers.join(','),
            ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
        ].join('\n')

        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <ShieldAlert className="h-12 w-12 text-red-500" />
                <h1 className="text-2xl font-bold">Unauthorized</h1>
                <p className="text-muted-foreground">You must be an admin to access this page.</p>
            </div>
        )
    }

    // Calculate summary stats
    const totalAvailable = accounts
        .filter(a => a.type === 'AVAILABLE')
        .reduce((sum, a) => sum + Number(a.balance_sats), 0)
    const totalEscrow = accounts
        .filter(a => a.type === 'ESCROW')
        .reduce((sum, a) => sum + Number(a.balance_sats), 0)
    const platformFees = accounts
        .find(a => a.type === 'PLATFORM_FEES')?.balance_sats || 0
    const externalDeposits = accounts
        .find(a => a.type === 'EXTERNAL_DEPOSITS')?.balance_sats || 0

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Admin Console</h1>
                    <p className="text-muted-foreground">Manage disputes and monitor ledger activity</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b flex-wrap">
                <Button
                    variant={activeTab === 'disputes' ? 'default' : 'ghost'}
                    onClick={() => setActiveTab('disputes')}
                >
                    Disputes {disputes.length > 0 && `(${disputes.length})`}
                </Button>
                <Button
                    variant={activeTab === 'ledger' ? 'default' : 'ghost'}
                    onClick={() => setActiveTab('ledger')}
                >
                    Ledger &amp; Reconciliation
                </Button>
                <Button
                    variant={activeTab === 'categories' ? 'default' : 'ghost'}
                    onClick={() => setActiveTab('categories')}
                >
                    Categories
                </Button>
                <Button
                    variant={activeTab === 'metrics' ? 'default' : 'ghost'}
                    onClick={() => { setActiveTab('metrics'); if (!metrics.lastRefreshed) fetchMetrics() }}
                    className="flex items-center gap-1.5"
                >
                    <BarChart2 className="h-4 w-4" />
                    Metrics
                </Button>
            </div>

            {/* Disputes Tab */}
            {activeTab === 'disputes' && (
                <div className="grid gap-4">
                    {disputes.map(dispute => {
                        const openDispute = dispute.disputes?.find(d => d.status === 'OPEN')
                        return (
                            <Card key={dispute.id} className="border-red-200 bg-red-50">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <CardTitle>Dispute: {dispute.title}</CardTitle>
                                        <Badge variant="destructive">DISPUTED</Badge>
                                    </div>
                                    <CardDescription>
                                        Budget: {Number(dispute.budget_sats).toLocaleString()} sats
                                    </CardDescription>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Creator: {dispute.creator_profile?.username || dispute.creator_id.slice(0, 8) + '...'}
                                        {' '}&bull;{' '}
                                        Worker: {dispute.worker_profile?.username || dispute.worker_id?.slice(0, 8) || 'N/A'}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {openDispute ? (
                                        <div className="space-y-2">
                                            <div>
                                                <p className="text-xs font-semibold text-red-700 uppercase">Dispute Reason</p>
                                                <p className="text-sm mt-1">{openDispute.reason}</p>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Opened {new Date(openDispute.created_at).toLocaleString()} by {openDispute.opened_by.slice(0, 8)}...
                                            </div>
                                            {openDispute.evidence_urls && openDispute.evidence_urls.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-semibold text-muted-foreground">Evidence:</p>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {openDispute.evidence_urls.map((url, i) => (
                                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                                className="text-xs text-blue-600 hover:underline">
                                                                Evidence {i + 1}
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">{dispute.description}</p>
                                    )}
                                    <div className="border-t pt-2">
                                        <p className="text-xs font-semibold text-muted-foreground">Job Description</p>
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{dispute.description}</p>
                                    </div>
                                </CardContent>
                                <CardFooter className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => handleResolve(dispute.id, 'REFUND')}
                                        disabled={actionLoading === dispute.id}
                                    >
                                        Refund Creator
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleResolve(dispute.id, 'PAY_WORKER')}
                                        disabled={actionLoading === dispute.id}
                                    >
                                        Pay Worker
                                    </Button>
                                    <Button
                                        variant="default"
                                        onClick={() => handleResolve(dispute.id, 'SPLIT')}
                                        disabled={actionLoading === dispute.id}
                                    >
                                        Split 50/50
                                    </Button>
                                </CardFooter>
                            </Card>
                        )
                    })}
                    {disputes.length === 0 && (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground">No active disputes. 🎉</p>
                        </div>
                    )}
                </div>
            )}

            {/* Ledger Tab */}
            {activeTab === 'ledger' && (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Total Available</CardDescription>
                                <CardTitle className="text-2xl">{totalAvailable.toLocaleString()}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-muted-foreground">User balances</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Total in Escrow</CardDescription>
                                <CardTitle className="text-2xl">{totalEscrow.toLocaleString()}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-muted-foreground">Locked funds</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>Platform Fees</CardDescription>
                                <CardTitle className="text-2xl">{Number(platformFees).toLocaleString()}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-muted-foreground">Collected fees</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardDescription>External Deposits</CardDescription>
                                <CardTitle className="text-2xl">{Number(externalDeposits).toLocaleString()}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xs text-muted-foreground">Total inflows</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Ledger Entries */}
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Recent Ledger Entries</CardTitle>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => exportToCsv(ledgerEntries, 'ledger_entries.csv')}
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Export CSV
                                </Button>
                            </div>
                            <CardDescription>Last 100 transactions</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-2">Date</th>
                                            <th className="text-left p-2">Type</th>
                                            <th className="text-left p-2">Debit Account</th>
                                            <th className="text-left p-2">Credit Account</th>
                                            <th className="text-right p-2">Amount (sats)</th>
                                            <th className="text-left p-2">Ref ID</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ledgerEntries.map(entry => (
                                            <tr key={entry.id} className="border-b hover:bg-muted/50">
                                                <td className="p-2 text-xs">{new Date(entry.created_at).toLocaleDateString()}</td>
                                                <td className="p-2">
                                                    <Badge variant="outline" className="text-xs">{entry.reference_type}</Badge>
                                                </td>
                                                <td className="p-2 text-xs font-mono">{entry.debit_account_id.slice(0, 8)}...</td>
                                                <td className="p-2 text-xs font-mono">{entry.credit_account_id.slice(0, 8)}...</td>
                                                <td className="p-2 text-right font-semibold">{Number(entry.amount_sats).toLocaleString()}</td>
                                                <td className="p-2 text-xs font-mono">{entry.reference_id.slice(0, 12)}...</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payment Events */}
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Recent Payment Events</CardTitle>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => exportToCsv(paymentEvents, 'payment_events.csv')}
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Export CSV
                                </Button>
                            </div>
                            <CardDescription>Last 50 payments processed</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-2">Date</th>
                                            <th className="text-left p-2">Provider</th>
                                            <th className="text-left p-2">Payment Hash</th>
                                            <th className="text-right p-2">Amount (sats)</th>
                                            <th className="text-left p-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paymentEvents.map(event => (
                                            <tr key={event.id} className="border-b hover:bg-muted/50">
                                                <td className="p-2 text-xs">{new Date(event.processed_at).toLocaleString()}</td>
                                                <td className="p-2">
                                                    <Badge variant="secondary" className="text-xs">{event.provider}</Badge>
                                                </td>
                                                <td className="p-2 text-xs font-mono">{event.payment_hash.slice(0, 16)}...</td>
                                                <td className="p-2 text-right font-semibold">{Number(event.amount_sats).toLocaleString()}</td>
                                                <td className="p-2">
                                                    <Badge className="text-xs bg-green-100 text-green-800">{event.status}</Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Categories Tab */}
            {activeTab === 'categories' && (
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>Manage Categories</CardTitle>
                                    <CardDescription>Add, edit, or remove job categories</CardDescription>
                                </div>
                                {!isAddingCategory && (
                                    <Button onClick={() => setIsAddingCategory(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Category
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {/* Add Category Form */}
                            {isAddingCategory && (
                                <div className="mb-6 p-4 border rounded-lg bg-muted/50">
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1">
                                            <Label htmlFor="new-category">New Category Name</Label>
                                            <Input
                                                id="new-category"
                                                placeholder="Enter category name..."
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleCreateCategory()
                                                    if (e.key === 'Escape') {
                                                        setIsAddingCategory(false)
                                                        setNewCategoryName("")
                                                    }
                                                }}
                                                autoFocus
                                            />
                                        </div>
                                        <Button onClick={handleCreateCategory}>
                                            Create
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setIsAddingCategory(false)
                                                setNewCategoryName("")
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        2-50 characters. Only letters, numbers, spaces, &, -, / allowed.
                                    </p>
                                </div>
                            )}

                            {/* Categories Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-3">Category Name</th>
                                            <th className="text-left p-3">Created</th>
                                            <th className="text-right p-3">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categories.map(category => (
                                            <tr key={category.id} className="border-b hover:bg-muted/50">
                                                <td className="p-3">
                                                    {editingCategory?.id === category.id ? (
                                                        <Input
                                                            value={editingCategory.name}
                                                            onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleUpdateCategory(category, editingCategory.name)
                                                                if (e.key === 'Escape') setEditingCategory(null)
                                                            }}
                                                            autoFocus
                                                            className="max-w-xs"
                                                        />
                                                    ) : (
                                                        <span className="font-medium">{category.name}</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-muted-foreground">
                                                    {new Date(category.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex gap-2 justify-end">
                                                        {editingCategory?.id === category.id ? (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleUpdateCategory(category, editingCategory.name)}
                                                                >
                                                                    Save
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => setEditingCategory(null)}
                                                                >
                                                                    Cancel
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => setEditingCategory(category)}
                                                                >
                                                                    <Pencil className="h-3 w-3 mr-1" />
                                                                    Edit
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="destructive"
                                                                    onClick={() => handleDeleteCategory(category)}
                                                                    disabled={actionLoading === category.id || category.name === 'Other'}
                                                                >
                                                                    <Trash2 className="h-3 w-3 mr-1" />
                                                                    Delete
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {categories.length === 0 && (
                                <div className="text-center py-8">
                                    <p className="text-muted-foreground">No categories yet. Create one to get started.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ── Metrics Tab ─────────────────────────────────────────── */}
            {activeTab === 'metrics' && (
                <div className="space-y-6">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                            {(['7d', '30d', '90d'] as const).map(r => (
                                <Button
                                    key={r}
                                    size="sm"
                                    variant={dateRange === r ? 'default' : 'outline'}
                                    onClick={() => { setDateRange(r); setTimeout(fetchMetrics, 0) }}
                                >
                                    Last {r}
                                </Button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            {metrics.lastRefreshed && (
                                <span className="text-xs text-muted-foreground">
                                    Updated {metrics.lastRefreshed.toLocaleTimeString()}
                                </span>
                            )}
                            <Button size="sm" variant="outline" onClick={fetchMetrics} disabled={metrics.loading}
                                className="flex items-center gap-1.5">
                                <RefreshCw className={`h-3.5 w-3.5 ${metrics.loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleRefreshViews} disabled={refreshingViews}
                                className="flex items-center gap-1.5">
                                <RefreshCw className={`h-3.5 w-3.5 ${refreshingViews ? 'animate-spin' : ''}`} />
                                Refresh Views
                            </Button>
                        </div>
                    </div>

                    {metrics.loading && !metrics.lastRefreshed && (
                        <div className="text-center py-12 text-muted-foreground">Loading metrics…</div>
                    )}

                    {/* ── A: KPI Overview Cards ── */}
                    {metrics.marketplace && metrics.financials && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription className="flex items-center gap-1.5">
                                        <BarChart2 className="h-3.5 w-3.5" /> Jobs Posted
                                    </CardDescription>
                                    <CardTitle className="text-2xl">{metrics.marketplace.total_jobs.toLocaleString()}</CardTitle>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground">
                                    {metrics.marketplace.open_jobs} open · {metrics.marketplace.in_progress_jobs} in progress
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription className="flex items-center gap-1.5">
                                        <TrendingUp className="h-3.5 w-3.5" /> Completed
                                    </CardDescription>
                                    <CardTitle className="text-2xl">{metrics.marketplace.completed_jobs.toLocaleString()}</CardTitle>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground">
                                    {metrics.marketplace.completion_rate_pct}% of accepted jobs
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription className="flex items-center gap-1.5">
                                        <TrendingUp className="h-3.5 w-3.5" /> Accept Rate
                                    </CardDescription>
                                    <CardTitle className="text-2xl">{metrics.marketplace.accept_rate_pct}%</CardTitle>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground">
                                    {metrics.marketplace.accepted_jobs} of {metrics.marketplace.total_jobs} jobs accepted
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription className="flex items-center gap-1.5">
                                        <TrendingUp className="h-3.5 w-3.5" /> GMV (sats)
                                    </CardDescription>
                                    <CardTitle className="text-2xl">{Number(metrics.financials.gmv_sats).toLocaleString()}</CardTitle>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground">
                                    In completed jobs · avg {Number(metrics.financials.avg_budget_sats).toLocaleString()} sats/job
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription className="flex items-center gap-1.5">
                                        <TrendingUp className="h-3.5 w-3.5" /> Platform Fees
                                    </CardDescription>
                                    <CardTitle className="text-2xl">{Number(metrics.financials.total_fee_sats).toLocaleString()} <span className="text-sm font-normal">sats</span></CardTitle>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground">
                                    {metrics.financials.payout_count} payouts · {Number(metrics.financials.escrow_held_sats).toLocaleString()} sats in escrow
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription className="flex items-center gap-1.5">
                                        <Users className="h-3.5 w-3.5" /> Active Users (30d)
                                    </CardDescription>
                                    <CardTitle className="text-2xl">{(metrics.marketplace.active_posters_30d + metrics.marketplace.active_workers_30d).toLocaleString()}</CardTitle>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground">
                                    {metrics.marketplace.active_posters_30d} posters · {metrics.marketplace.active_workers_30d} workers
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* ── B: Job Funnel ── */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart2 className="h-4 w-4" /> Job Funnel
                            </CardTitle>
                            <CardDescription>Daily funnel for the selected period</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {metrics.funnel.length === 0 ? (
                                <p className="text-center py-6 text-muted-foreground">No funnel data for this period</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-muted-foreground text-xs">
                                                <th className="text-left p-2">Date</th>
                                                <th className="text-right p-2">Posted</th>
                                                <th className="text-right p-2">Accepted</th>
                                                <th className="text-right p-2">Completed</th>
                                                <th className="text-right p-2">Cancelled</th>
                                                <th className="text-right p-2">Disputed</th>
                                                <th className="text-right p-2">Accept %</th>
                                                <th className="text-right p-2">Complete %</th>
                                                <th className="text-right p-2">GMV (sats)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...metrics.funnel].reverse().slice(0, 30).map(row => (
                                                <tr key={row.day} className="border-b hover:bg-muted/30">
                                                    <td className="p-2 font-mono text-xs">{row.day}</td>
                                                    <td className="p-2 text-right">{row.jobs_posted}</td>
                                                    <td className="p-2 text-right">{row.jobs_accepted}</td>
                                                    <td className="p-2 text-right">{row.jobs_completed}</td>
                                                    <td className="p-2 text-right text-muted-foreground">{row.jobs_cancelled}</td>
                                                    <td className="p-2 text-right">
                                                        {row.jobs_disputed > 0 ? <Badge variant="destructive" className="text-xs">{row.jobs_disputed}</Badge> : <span className="text-muted-foreground">0</span>}
                                                    </td>
                                                    <td className="p-2 text-right">{row.accept_rate_pct}%</td>
                                                    <td className="p-2 text-right">{row.completion_rate_pct}%</td>
                                                    <td className="p-2 text-right font-mono text-xs">{Number(row.gmv_sats ?? 0).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── C: Trust & Safety ── */}
                    {metrics.trustSafety && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4" /> Trust &amp; Safety
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="text-center p-3 rounded-lg bg-muted/50">
                                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">{metrics.trustSafety.open_disputes}</div>
                                        <div className="text-xs text-muted-foreground mt-1">Open Disputes</div>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-muted/50">
                                        <div className="text-2xl font-bold">{metrics.trustSafety.resolved_disputes}</div>
                                        <div className="text-xs text-muted-foreground mt-1">Resolved Disputes</div>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-muted/50">
                                        <div className={`text-2xl font-bold ${metrics.trustSafety.open_chat_reports > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{metrics.trustSafety.open_chat_reports}</div>
                                        <div className="text-xs text-muted-foreground mt-1">Open Chat Reports</div>
                                    </div>
                                    <div className="text-center p-3 rounded-lg bg-muted/50">
                                        <div className="text-2xl font-bold">{metrics.trustSafety.avg_rating ? Number(metrics.trustSafety.avg_rating).toFixed(1) : '—'} <span className="text-base">★</span></div>
                                        <div className="text-xs text-muted-foreground mt-1">Avg Rating ({metrics.trustSafety.total_ratings} total)</div>
                                    </div>
                                </div>
                                {metrics.trustSafety.low_ratings_count > 0 && (
                                    <div className="mt-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        {metrics.trustSafety.low_ratings_count} low rating{metrics.trustSafety.low_ratings_count > 1 ? 's' : ''} (≤ 2 stars) — review recommended
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* ── D: Category Performance ── */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart2 className="h-4 w-4" /> Category Performance
                            </CardTitle>
                            <CardDescription>Aggregated for the selected period</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {metrics.categories.length === 0 ? (
                                <p className="text-center py-6 text-muted-foreground">No category data yet</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-muted-foreground text-xs">
                                                <th className="text-left p-2">Category</th>
                                                <th className="text-right p-2">Posted</th>
                                                <th className="text-right p-2">Accepted</th>
                                                <th className="text-right p-2">Completed</th>
                                                <th className="text-right p-2">Accept %</th>
                                                <th className="text-right p-2">Complete %</th>
                                                <th className="text-right p-2">Avg Budget (sats)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {metrics.categories.map(cat => (
                                                <tr key={cat.category} className="border-b hover:bg-muted/30">
                                                    <td className="p-2 font-medium">{cat.category}</td>
                                                    <td className="p-2 text-right">{cat.posted}</td>
                                                    <td className="p-2 text-right">{cat.accepted}</td>
                                                    <td className="p-2 text-right">{cat.completed}</td>
                                                    <td className="p-2 text-right">{cat.accept_rate_pct}%</td>
                                                    <td className="p-2 text-right">{cat.completion_rate_pct}%</td>
                                                    <td className="p-2 text-right font-mono text-xs">{Number(cat.avg_budget_sats).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── E: Stuck Jobs Queue ── */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-4 w-4" /> Stuck Jobs
                                {metrics.stuckJobs.length > 0 && (
                                    <Badge variant="destructive" className="ml-1">{metrics.stuckJobs.length}</Badge>
                                )}
                            </CardTitle>
                            <CardDescription>Jobs in FUNDED / IN_PROGRESS / REVIEW status for &gt; 48 hours</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {metrics.stuckJobs.length === 0 ? (
                                <p className="text-center py-6 text-muted-foreground">✓ No stuck jobs — everything is flowing well</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-muted-foreground text-xs">
                                                <th className="text-left p-2">Job</th>
                                                <th className="text-left p-2">Status</th>
                                                <th className="text-left p-2">Category</th>
                                                <th className="text-right p-2">Budget (sats)</th>
                                                <th className="text-right p-2">Stuck for</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {metrics.stuckJobs.map(job => (
                                                <tr key={job.id} className="border-b hover:bg-muted/30">
                                                    <td className="p-2">
                                                        <span className="font-medium truncate max-w-[200px] block">{job.title}</span>
                                                        <span className="text-xs text-muted-foreground">{job.id.slice(0, 8)}…</span>
                                                    </td>
                                                    <td className="p-2">
                                                        <Badge variant={job.status === 'DISPUTED' ? 'destructive' : 'secondary'} className="text-xs">
                                                            {job.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-2 text-muted-foreground text-xs">{job.category ?? '—'}</td>
                                                    <td className="p-2 text-right font-mono text-xs">{Number(job.budget_sats).toLocaleString()}</td>
                                                    <td className="p-2 text-right">
                                                        <span className={`text-xs font-medium ${job.age_hours > 168 ? 'text-red-600 dark:text-red-400' : job.age_hours > 72 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                                                            {job.age_hours >= 24 ? `${Math.floor(job.age_hours / 24)}d ${job.age_hours % 24}h` : `${job.age_hours}h`}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
