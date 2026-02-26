"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2, XCircle, Clock, User, Calendar } from "lucide-react"
import Link from "next/link"

interface Application {
    id: string
    worker_id: string
    cover_letter: string
    status: string
    created_at: string
    profiles?: { username: string | null, avatar_url: string | null }
}

interface Job {
    id: string
    title: string
    creator_id: string
    status: string
}

export default function JobApplicationsPage() {
    const { id } = useParams()
    const router = useRouter()
    const [job, setJob] = useState<Job | null>(null)
    const [applications, setApplications] = useState<Application[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    const fetchData = useCallback(async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            router.push('/login')
            return
        }

        const { data: jobData } = await supabase
            .from('jobs')
            .select('id, title, creator_id, status')
            .eq('id', id)
            .single()

        if (!jobData) {
            setLoading(false)
            return
        }

        // Only creator can view applications page
        if (jobData.creator_id !== user.id) {
            router.push(`/dashboard/jobs/${id}`)
            return
        }

        setJob(jobData)

        const { data: apps } = await supabase
            .from('applications')
            .select('*, profiles!applications_worker_id_fkey(username, avatar_url)')
            .eq('job_id', id)
            .order('created_at', { ascending: false })

        if (apps) {
            setApplications(apps)
        }

        setLoading(false)
    }, [id, router])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleAcceptApplication = async (application: Application) => {
        if (!job) return
        setActionLoading(application.id)
        const supabase = createClient()

        try {
            // Accept this application
            const { error: updateAppErr } = await supabase
                .from('applications')
                .update({ status: 'ACCEPTED' })
                .eq('id', application.id)

            if (updateAppErr) throw updateAppErr

            // Reject other pending applications
            await supabase
                .from('applications')
                .update({ status: 'REJECTED' })
                .eq('job_id', job.id)
                .neq('id', application.id)
                .eq('status', 'PENDING')

            // Assign worker to job
            const { error: jobError } = await supabase
                .from('jobs')
                .update({
                    worker_id: application.worker_id,
                    status: 'IN_PROGRESS',
                })
                .eq('id', job.id)

            if (jobError) throw jobError

            // Notify worker
            try {
                await supabase.functions.invoke('send-notification', {
                    body: {
                        type: 'JOB_ACCEPTED',
                        recipientUserId: application.worker_id,
                        jobId: job.id,
                    }
                })
            } catch (_) { /* non-blocking */ }

            toast.success("Application accepted! Job is now in progress.")
            router.push(`/dashboard/jobs/${job.id}`)
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to accept application")
            setActionLoading(null)
        }
    }

    const handleRejectApplication = async (application: Application) => {
        setActionLoading(application.id)
        const supabase = createClient()

        try {
            const { error } = await supabase
                .from('applications')
                .update({ status: 'REJECTED' })
                .eq('id', application.id)

            if (error) throw error

            toast.success("Application rejected.")
            await fetchData()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to reject application")
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

    if (!job) {
        return (
            <div className="max-w-4xl mx-auto py-8">
                <Card className="p-8 text-center text-muted-foreground bg-white/5 border-white/10 glass">
                    Job not found or you don't have access.
                </Card>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto py-8 space-y-6">
            <div className="flex items-center gap-4 mb-6">
                <Button variant="ghost" size="icon" asChild className="hover:bg-white/5 rounded-full">
                    <Link href={`/dashboard/jobs/${job.id}`}>
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Review Applications</h1>
                    <p className="text-muted-foreground">Manage candidates for <span className="text-foreground font-medium">{job.title}</span></p>
                </div>
            </div>

            {applications.length === 0 ? (
                <Card className="p-12 text-center text-muted-foreground bg-white/5 border-white/10 glass">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 rounded-full bg-primary/10 text-primary">
                            <User className="h-8 w-8" />
                        </div>
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-1">No applications yet</h3>
                    <p>When freelancers apply to your job, they will appear here.</p>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {applications.map((app) => (
                        <Card key={app.id} className="overflow-hidden bg-white/5 border-white/10 glass hover:bg-white/[0.07] transition-colors">
                            <div className="flex flex-col md:flex-row gap-6 p-6">
                                <div className="flex-1 space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden border border-white/10">
                                                {app.profiles?.avatar_url ? (
                                                    <img src={app.profiles.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                                                ) : (
                                                    <User className="h-5 w-5 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-lg">{app.profiles?.username || app.worker_id.slice(0, 8) + '...'}</h3>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    Applied {new Date(app.created_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>

                                        <Badge variant={app.status === 'PENDING' ? 'secondary' : app.status === 'ACCEPTED' ? 'default' : 'destructive'}
                                            className={
                                                app.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                                    app.status === 'ACCEPTED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                        'bg-red-500/10 text-red-500 border-red-500/20'
                                            }>
                                            {app.status === 'PENDING' ? <Clock className="w-3 h-3 mr-1" /> : null}
                                            {app.status}
                                        </Badge>
                                    </div>

                                    <div className="bg-black/20 dark:bg-black/40 rounded-xl p-4 text-sm leading-relaxed border border-white/5">
                                        <h4 className="font-medium text-muted-foreground mb-2 text-xs uppercase tracking-wider">Cover Letter</h4>
                                        <p className="whitespace-pre-wrap">{app.cover_letter}</p>
                                    </div>
                                </div>

                                {app.status === 'PENDING' && (
                                    <div className="flex flex-row md:flex-col gap-3 justify-center md:border-l md:border-white/10 md:pl-6 pt-4 md:pt-0 border-t border-white/10 md:border-t-0 md:min-w-[140px]">
                                        <Button
                                            onClick={() => handleAcceptApplication(app)}
                                            disabled={actionLoading !== null}
                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                                        >
                                            {actionLoading === app.id ? 'Processing...' : (
                                                <>
                                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                                    Accept
                                                </>
                                            )}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => handleRejectApplication(app)}
                                            disabled={actionLoading !== null}
                                            className="w-full border-red-500/20 text-red-500 hover:bg-red-500/10"
                                        >
                                            <XCircle className="w-4 h-4 mr-2" />
                                            Reject
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
