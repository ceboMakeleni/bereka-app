"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
    ShieldAlert,
    Download,
    Search,
    ChevronLeft,
    ChevronRight,
    Activity,
    Clock,
    AlertTriangle,
    Filter,
    X,
} from "lucide-react"

interface AuditLogEntry {
    id: string
    actor_id: string | null
    actor_role: string | null
    action: string
    resource_type: string
    resource_id: string
    details: Record<string, any>
    ip_address: string | null
    user_agent: string | null
    created_at: string
    actor_profile?: { username: string | null } | null
}

interface EdgeFunctionLog {
    id: string
    function_name: string
    actor_id: string | null
    status: string
    duration_ms: number | null
    request_meta: Record<string, any>
    response_meta: Record<string, any>
    error_message: string | null
    created_at: string
}

const ACTION_COLORS: Record<string, string> = {
    "payout.approved": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    "escrow.funded": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "escrow.status_changed": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "dispute.resolved": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    "dispute.status_changed": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    "wallet.created": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    "payment.completed": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    "payment.invoice_created": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    "payment.webhook_processed": "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
    "job.created": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    "job.status_changed": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    "profile.role_changed": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    "application.status_changed": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
}

const STATUS_COLORS: Record<string, string> = {
    success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
}

const PAGE_SIZE = 25

export default function AuditPage() {
    const [activeTab, setActiveTab] = useState<"audit" | "functions">("audit")
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
    const [functionLogs, setFunctionLogs] = useState<EdgeFunctionLog[]>([])
    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)
    const [auditPage, setAuditPage] = useState(0)
    const [fnPage, setFnPage] = useState(0)
    const [auditTotal, setAuditTotal] = useState(0)
    const [fnTotal, setFnTotal] = useState(0)

    // Filters
    const [actionFilter, setActionFilter] = useState("")
    const [resourceFilter, setResourceFilter] = useState("")
    const [roleFilter, setRoleFilter] = useState("")
    const [fnNameFilter, setFnNameFilter] = useState("")
    const [fnStatusFilter, setFnStatusFilter] = useState("")
    const [showFilters, setShowFilters] = useState(false)

    // Expanded row for details
    const [expandedAuditRow, setExpandedAuditRow] = useState<string | null>(null)

    const fetchAuditLogs = useCallback(async () => {
        const supabase = createClient()
        let query = supabase
            .from("audit_log")
            .select("*, actor_profile:profiles!audit_log_actor_id_fkey(username)", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(auditPage * PAGE_SIZE, (auditPage + 1) * PAGE_SIZE - 1)

        if (actionFilter) query = query.ilike("action", `%${actionFilter}%`)
        if (resourceFilter) query = query.ilike("resource_type", `%${resourceFilter}%`)
        if (roleFilter) query = query.eq("actor_role", roleFilter)

        const { data, count } = await query
        if (data) setAuditLogs(data as unknown as AuditLogEntry[])
        if (count !== null) setAuditTotal(count)
    }, [auditPage, actionFilter, resourceFilter, roleFilter])

    const fetchFunctionLogs = useCallback(async () => {
        const supabase = createClient()
        let query = supabase
            .from("edge_function_logs")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(fnPage * PAGE_SIZE, (fnPage + 1) * PAGE_SIZE - 1)

        if (fnNameFilter) query = query.ilike("function_name", `%${fnNameFilter}%`)
        if (fnStatusFilter) query = query.eq("status", fnStatusFilter)

        const { data, count } = await query
        if (data) setFunctionLogs(data)
        if (count !== null) setFnTotal(count)
    }, [fnPage, fnNameFilter, fnStatusFilter])

    useEffect(() => {
        const init = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { setLoading(false); return }

            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .single()

            if (profile?.role !== "admin") {
                setIsAdmin(false)
                setLoading(false)
                return
            }
            setIsAdmin(true)
            setLoading(false)
        }
        init()
    }, [])

    useEffect(() => {
        if (isAdmin && activeTab === "audit") fetchAuditLogs()
    }, [isAdmin, activeTab, fetchAuditLogs])

    useEffect(() => {
        if (isAdmin && activeTab === "functions") fetchFunctionLogs()
    }, [isAdmin, activeTab, fetchFunctionLogs])

    const exportToCsv = (data: any[], filename: string) => {
        if (data.length === 0) return
        const headers = Object.keys(data[0]).filter(h => h !== "actor_profile")
        const csv = [
            headers.join(","),
            ...data.map(row =>
                headers.map(h => {
                    const val = row[h]
                    if (typeof val === "object" && val !== null) return JSON.stringify(JSON.stringify(val))
                    return JSON.stringify(val ?? "")
                }).join(",")
            ),
        ].join("\n")
        const blob = new Blob([csv], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const clearFilters = () => {
        setActionFilter("")
        setResourceFilter("")
        setRoleFilter("")
        setFnNameFilter("")
        setFnStatusFilter("")
        setAuditPage(0)
        setFnPage(0)
    }

    if (loading) return <div className="p-8">Loading...</div>

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <ShieldAlert className="h-12 w-12 text-red-500" />
                <h1 className="text-2xl font-bold">Unauthorized</h1>
                <p className="text-muted-foreground">Admin access required.</p>
            </div>
        )
    }

    const auditTotalPages = Math.ceil(auditTotal / PAGE_SIZE)
    const fnTotalPages = Math.ceil(fnTotal / PAGE_SIZE)

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Activity className="h-6 w-6" />
                        Audit Trail
                    </h1>
                    <p className="text-muted-foreground">Monitor all system activity and edge function performance</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <Filter className="h-4 w-4 mr-1" />
                        {showFilters ? "Hide Filters" : "Filters"}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            if (activeTab === "audit") {
                                exportToCsv(auditLogs, "audit_log.csv")
                            } else {
                                exportToCsv(functionLogs, "function_logs.csv")
                            }
                        }}
                    >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b">
                <Button
                    variant={activeTab === "audit" ? "default" : "ghost"}
                    onClick={() => { setActiveTab("audit"); setAuditPage(0) }}
                >
                    <Clock className="h-4 w-4 mr-1" />
                    Audit Log {auditTotal > 0 && `(${auditTotal})`}
                </Button>
                <Button
                    variant={activeTab === "functions" ? "default" : "ghost"}
                    onClick={() => { setActiveTab("functions"); setFnPage(0) }}
                >
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Function Logs {fnTotal > 0 && `(${fnTotal})`}
                </Button>
            </div>

            {/* Filters */}
            {showFilters && (
                <Card>
                    <CardContent className="pt-4">
                        {activeTab === "audit" ? (
                            <div className="flex flex-wrap gap-3 items-end">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Action</label>
                                    <Input
                                        placeholder="e.g. payout.approved"
                                        value={actionFilter}
                                        onChange={(e) => { setActionFilter(e.target.value); setAuditPage(0) }}
                                        className="w-48"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Resource Type</label>
                                    <Input
                                        placeholder="e.g. job, dispute"
                                        value={resourceFilter}
                                        onChange={(e) => { setResourceFilter(e.target.value); setAuditPage(0) }}
                                        className="w-40"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Role</label>
                                    <select
                                        value={roleFilter}
                                        onChange={(e) => { setRoleFilter(e.target.value); setAuditPage(0) }}
                                        className="w-32 h-9 rounded-md border px-3 text-sm bg-background"
                                    >
                                        <option value="">All</option>
                                        <option value="admin">Admin</option>
                                        <option value="client">Client</option>
                                        <option value="worker">Worker</option>
                                        <option value="system">System</option>
                                    </select>
                                </div>
                                <Button variant="ghost" size="sm" onClick={clearFilters}>
                                    <X className="h-4 w-4 mr-1" /> Clear
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-3 items-end">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Function Name</label>
                                    <Input
                                        placeholder="e.g. approve-payout"
                                        value={fnNameFilter}
                                        onChange={(e) => { setFnNameFilter(e.target.value); setFnPage(0) }}
                                        className="w-48"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground">Status</label>
                                    <select
                                        value={fnStatusFilter}
                                        onChange={(e) => { setFnStatusFilter(e.target.value); setFnPage(0) }}
                                        className="w-32 h-9 rounded-md border px-3 text-sm bg-background"
                                    >
                                        <option value="">All</option>
                                        <option value="success">Success</option>
                                        <option value="error">Error</option>
                                        <option value="warning">Warning</option>
                                    </select>
                                </div>
                                <Button variant="ghost" size="sm" onClick={clearFilters}>
                                    <X className="h-4 w-4 mr-1" /> Clear
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Audit Log Tab */}
            {activeTab === "audit" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Business Audit Trail</CardTitle>
                        <CardDescription>
                            All business-critical actions including CDC-triggered data changes. Click a row to see details.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left p-2">Timestamp</th>
                                        <th className="text-left p-2">Actor</th>
                                        <th className="text-left p-2">Role</th>
                                        <th className="text-left p-2">Action</th>
                                        <th className="text-left p-2">Resource</th>
                                        <th className="text-left p-2">IP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.map(entry => (
                                        <>
                                            <tr
                                                key={entry.id}
                                                className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                                                onClick={() => setExpandedAuditRow(
                                                    expandedAuditRow === entry.id ? null : entry.id
                                                )}
                                            >
                                                <td className="p-2 text-xs whitespace-nowrap">
                                                    {new Date(entry.created_at).toLocaleString()}
                                                </td>
                                                <td className="p-2 text-xs">
                                                    {entry.actor_profile?.username
                                                        || (entry.actor_id ? entry.actor_id.slice(0, 8) + "..." : "—")}
                                                </td>
                                                <td className="p-2">
                                                    <Badge variant="outline" className="text-xs capitalize">
                                                        {entry.actor_role || "system"}
                                                    </Badge>
                                                </td>
                                                <td className="p-2">
                                                    <Badge
                                                        className={`text-xs ${ACTION_COLORS[entry.action] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}
                                                    >
                                                        {entry.action}
                                                    </Badge>
                                                </td>
                                                <td className="p-2 text-xs">
                                                    <span className="font-medium">{entry.resource_type}</span>
                                                    <span className="text-muted-foreground ml-1 font-mono">
                                                        {entry.resource_id.slice(0, 8)}...
                                                    </span>
                                                </td>
                                                <td className="p-2 text-xs text-muted-foreground font-mono">
                                                    {entry.ip_address || "—"}
                                                </td>
                                            </tr>
                                            {expandedAuditRow === entry.id && (
                                                <tr key={`${entry.id}-details`}>
                                                    <td colSpan={6} className="p-4 bg-muted/30">
                                                        <div className="space-y-2">
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                                                <div>
                                                                    <span className="font-semibold text-muted-foreground">Resource ID:</span>
                                                                    <p className="font-mono break-all">{entry.resource_id}</p>
                                                                </div>
                                                                <div>
                                                                    <span className="font-semibold text-muted-foreground">Actor ID:</span>
                                                                    <p className="font-mono break-all">{entry.actor_id ?? "N/A"}</p>
                                                                </div>
                                                                <div>
                                                                    <span className="font-semibold text-muted-foreground">User Agent:</span>
                                                                    <p className="truncate">{entry.user_agent || "N/A"}</p>
                                                                </div>
                                                                <div>
                                                                    <span className="font-semibold text-muted-foreground">IP Address:</span>
                                                                    <p className="font-mono">{entry.ip_address || "N/A"}</p>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <span className="font-semibold text-muted-foreground text-xs">Details:</span>
                                                                <pre className="mt-1 p-3 rounded bg-background border text-xs overflow-x-auto max-h-48">
                                                                    {JSON.stringify(entry.details, null, 2)}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {auditLogs.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground">
                                No audit log entries found.
                            </div>
                        )}

                        {/* Pagination */}
                        {auditTotalPages > 1 && (
                            <div className="flex justify-between items-center mt-4 pt-4 border-t">
                                <span className="text-xs text-muted-foreground">
                                    Page {auditPage + 1} of {auditTotalPages} ({auditTotal} entries)
                                </span>
                                <div className="flex gap-1">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={auditPage === 0}
                                        onClick={() => setAuditPage(p => p - 1)}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={auditPage >= auditTotalPages - 1}
                                        onClick={() => setAuditPage(p => p + 1)}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Function Logs Tab */}
            {activeTab === "functions" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Edge Function Execution Logs</CardTitle>
                        <CardDescription>
                            Performance and error tracking for all edge function invocations.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left p-2">Timestamp</th>
                                        <th className="text-left p-2">Function</th>
                                        <th className="text-left p-2">Status</th>
                                        <th className="text-right p-2">Duration</th>
                                        <th className="text-left p-2">Error</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {functionLogs.map(log => (
                                        <tr
                                            key={log.id}
                                            className="border-b hover:bg-muted/50"
                                        >
                                            <td className="p-2 text-xs whitespace-nowrap">
                                                {new Date(log.created_at).toLocaleString()}
                                            </td>
                                            <td className="p-2">
                                                <Badge variant="outline" className="text-xs font-mono">
                                                    {log.function_name}
                                                </Badge>
                                            </td>
                                            <td className="p-2">
                                                <Badge
                                                    className={`text-xs ${STATUS_COLORS[log.status] || "bg-gray-100 text-gray-800"}`}
                                                >
                                                    {log.status}
                                                </Badge>
                                            </td>
                                            <td className="p-2 text-right text-xs font-mono">
                                                {log.duration_ms !== null ? `${log.duration_ms}ms` : "—"}
                                            </td>
                                            <td className="p-2 text-xs text-red-600 max-w-xs truncate">
                                                {log.error_message || "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {functionLogs.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground">
                                No function logs found.
                            </div>
                        )}

                        {/* Pagination */}
                        {fnTotalPages > 1 && (
                            <div className="flex justify-between items-center mt-4 pt-4 border-t">
                                <span className="text-xs text-muted-foreground">
                                    Page {fnPage + 1} of {fnTotalPages} ({fnTotal} entries)
                                </span>
                                <div className="flex gap-1">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={fnPage === 0}
                                        onClick={() => setFnPage(p => p - 1)}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={fnPage >= fnTotalPages - 1}
                                        onClick={() => setFnPage(p => p + 1)}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
