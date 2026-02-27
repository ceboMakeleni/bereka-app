"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { FileText, Briefcase, Clock, CheckCircle, XCircle } from "lucide-react"
import { toast } from "sonner"

interface ApplicationWithJob {
    id: string
    job_id: string
    worker_id: string
    cover_letter: string | null
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
    created_at: string
    jobs: {
        id: string
        title: string
        budget_sats: number
        status: string
        creator_id: string
    } | null
}

const statusConfig = {
    PENDING: { label: "Pending", variant: "outline" as const, icon: Clock },
    ACCEPTED: { label: "Accepted", variant: "default" as const, icon: CheckCircle },
    REJECTED: { label: "Rejected", variant: "destructive" as const, icon: XCircle },
}

export default function ApplicationsPage() {
    const [applications, setApplications] = useState<ApplicationWithJob[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'ACCEPTED' | 'REJECTED'>('ALL')

    useEffect(() => {
        document.title = "My Applications — Bereka"
    }, [])

    useEffect(() => {
        const fetchApplications = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('applications')
                .select('*, jobs(id, title, budget_sats, status, creator_id)')
                .eq('worker_id', user.id)
                .order('created_at', { ascending: false })

            if (error) {
                toast.error("Failed to load applications")
                console.error(error)
            } else {
                setApplications(data || [])
            }
            setLoading(false)
        }
        fetchApplications()
    }, [])

    const filteredApplications = filter === 'ALL'
        ? applications
        : applications.filter(a => a.status === filter)

    const counts = {
        ALL: applications.length,
        PENDING: applications.filter(a => a.status === 'PENDING').length,
        ACCEPTED: applications.filter(a => a.status === 'ACCEPTED').length,
        REJECTED: applications.filter(a => a.status === 'REJECTED').length,
    }

    if (loading) {
        return (
            <div className="space-y-6 p-4 md:p-6">
                <Skeleton className="h-8 w-48" />
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-28 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 p-4 md:p-6">
            <PageHeader
                title="My Applications"
                description="Track the status of your job applications"
                icon={FileText}
            />

            {/* Filter tabs */}
            <div className="flex gap-2 flex-wrap">
                {(['ALL', 'PENDING', 'ACCEPTED', 'REJECTED'] as const).map(status => (
                    <Button
                        key={status}
                        variant={filter === status ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilter(status)}
                        className="gap-1.5"
                    >
                        {status === 'ALL' ? 'All' : statusConfig[status].label}
                        <span className="ml-1 text-xs opacity-70">({counts[status]})</span>
                    </Button>
                ))}
            </div>

            {/* Application list */}
            {filteredApplications.length === 0 ? (
                <EmptyState
                    icon={FileText}
                    title={filter === 'ALL' ? "No applications yet" : `No ${filter.toLowerCase()} applications`}
                    description={filter === 'ALL' ? "Browse available jobs and submit your first application." : undefined}
                    actionLabel={filter === 'ALL' ? "Browse Jobs" : undefined}
                    actionHref={filter === 'ALL' ? "/dashboard/jobs" : undefined}
                />
            ) : (
                <div className="space-y-3">
                    {filteredApplications.map(app => {
                        const config = statusConfig[app.status]
                        const StatusIcon = config.icon
                        return (
                            <Card key={app.id} className="hover:border-primary/20 transition-colors">
                                <CardContent className="p-4 sm:p-6">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <StatusIcon className={`h-4 w-4 shrink-0 ${app.status === 'ACCEPTED' ? 'text-green-500' : app.status === 'REJECTED' ? 'text-destructive' : 'text-muted-foreground'}`} />
                                                <h3 className="font-semibold truncate">
                                                    {app.jobs?.title || "Untitled Job"}
                                                </h3>
                                            </div>
                                            {app.cover_letter && (
                                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                                    {app.cover_letter}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                                <span>⚡ {(app.jobs?.budget_sats || 0).toLocaleString()} sats</span>
                                                <span>•</span>
                                                <span>{new Date(app.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Badge variant={config.variant}>{config.label}</Badge>
                                            {app.jobs && (
                                                <Link href={`/dashboard/jobs/${app.job_id}`}>
                                                    <Button variant="ghost" size="sm">
                                                        <Briefcase className="h-4 w-4 mr-1" />
                                                        View Job
                                                    </Button>
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
