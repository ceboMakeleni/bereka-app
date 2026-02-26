"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { AlertCircle, FileText, User as UserIcon, Clock } from "lucide-react"

interface Dispute {
    id: string
    job_id: string
    opened_by: string
    reason: string
    status: string
    created_at: string
    jobs?: {
        title: string
        creator_id: string
        worker_id: string
    }
    profiles?: {
        username: string | null
    }
}

export default function DisputesPage() {
    const [disputes, setDisputes] = useState<Dispute[]>([])
    const [loading, setLoading] = useState(true)
    const [user, setUser] = useState<any>(null)
    const [userRole, setUserRole] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    const fetchDisputes = useCallback(async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            setLoading(false)
            return
        }

        setUser(user)

        // Fetch user role
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        const role = profile?.role || 'user'
        setUserRole(role)

        let query = supabase
            .from('disputes')
            .select(`
                *,
                jobs ( title, creator_id, worker_id ),
                profiles!disputes_opened_by_fkey ( username )
            `)
            .order('created_at', { ascending: false })

        // If not an admin, only show disputes they are involved in
        if (role !== 'admin') {
            query = query.or(`opened_by.eq.${user.id},jobs.creator_id.eq.${user.id},jobs.worker_id.eq.${user.id}`)
        }

        const { data, error } = await query

        if (error) {
            console.error(error)
            toast.error("Failed to load disputes")
        } else {
            setDisputes(data || [])
        }

        setLoading(false)
    }, [])

    useEffect(() => {
        fetchDisputes()
    }, [fetchDisputes])

    const handleResolve = async (disputeId: string, resolution: 'FAVOR_CREATOR' | 'FAVOR_WORKER') => {
        if (!user || userRole !== 'admin') return
        setActionLoading(disputeId)
        const supabase = createClient()

        try {
            // Need a backend edge function ideally for this, but for now we manually simulate if admin
            // In a real app this would definitely call an edge function with admin privileges.

            // 1. Mark dispute as resolved
            const { error: disputeErr } = await supabase
                .from('disputes')
                .update({ status: 'RESOLVED' })
                .eq('id', disputeId)

            if (disputeErr) throw disputeErr

            toast.success(`Dispute resolved in favor of the ${resolution === 'FAVOR_CREATOR' ? 'creator' : 'worker'}!`)
            await fetchDisputes()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to resolve dispute")
        } finally {
            setActionLoading(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Disputes</h1>
                    <p className="text-muted-foreground">Manage and resolve job-related disputes.</p>
                </div>
            </div>

            {disputes.length === 0 ? (
                <Card className="p-12 text-center text-muted-foreground bg-white/5 border-white/10 glass">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 rounded-full bg-primary/10 text-primary">
                            <AlertCircle className="h-8 w-8" />
                        </div>
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-1">No active disputes</h3>
                    <p>There are no disputes perfectly handled yet.</p>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {disputes.map((dispute) => (
                        <Card key={dispute.id} className="overflow-hidden bg-white/5 border-white/10 glass">
                            <div className="p-6">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-red-500/10 rounded-lg">
                                            <AlertCircle className="h-5 w-5 text-red-500" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">{dispute.jobs?.title || 'Unknown Job'}</h3>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Clock className="h-3.5 w-3.5" />
                                                Opened {new Date(dispute.created_at).toLocaleDateString()} by {dispute.profiles?.username || 'Unknown User'}
                                            </div>
                                        </div>
                                    </div>
                                    <Badge
                                        variant={dispute.status === 'OPEN' ? 'destructive' : 'secondary'}
                                        className={dispute.status === 'OPEN' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}
                                    >
                                        {dispute.status}
                                    </Badge>
                                </div>

                                <div className="bg-black/20 dark:bg-black/40 rounded-xl p-4 text-sm leading-relaxed border border-white/5 mb-4">
                                    <h4 className="font-medium text-muted-foreground mb-2 text-xs uppercase tracking-wider flex items-center gap-1">
                                        <FileText className="h-3.5 w-3.5" /> Reason
                                    </h4>
                                    <p className="whitespace-pre-wrap">{dispute.reason}</p>
                                </div>

                                {userRole === 'admin' && dispute.status === 'OPEN' && (
                                    <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-white/5">
                                        <Button
                                            onClick={() => handleResolve(dispute.id, 'FAVOR_CREATOR')}
                                            disabled={actionLoading !== null}
                                            variant="outline"
                                            className="flex-1 bg-white/5 hover:bg-white/10"
                                        >
                                            <UserIcon className="h-4 w-4 mr-2" />
                                            Resolve in favor of Creator
                                        </Button>
                                        <Button
                                            onClick={() => handleResolve(dispute.id, 'FAVOR_WORKER')}
                                            disabled={actionLoading !== null}
                                            variant="outline"
                                            className="flex-1 bg-white/5 hover:bg-white/10"
                                        >
                                            <UserIcon className="h-4 w-4 mr-2" />
                                            Resolve in favor of Worker
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
