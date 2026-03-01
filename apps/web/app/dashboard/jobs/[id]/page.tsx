"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { ShareButton } from "@/components/ShareButton"
import { SocialShareButtons } from "@/components/SocialShareButtons"
import { generateJobUrl, generateShareText } from "@/lib/share-utils"
import { StarRating } from "@/components/ui/star-rating"
import { toast } from "sonner"
import { AlertTriangle } from "lucide-react"

interface Job {
    id: string
    title: string
    description: string
    budget_sats: number
    status: string
    creator_id: string
    worker_id: string | null
    category: string | null
    deadline: string | null
    created_at: string
    profiles?: { username: string | null }
}

interface Application {
    id: string
    worker_id: string
    cover_letter: string
    status: string
    created_at: string
    profiles?: { username: string | null }
}

interface Submission {
    id: string
    content: string
    attachments?: string[] | null
    created_at: string
    worker_id: string
}

interface Rating {
    id: string
    job_id: string
    rater_id: string
    ratee_id: string
    score: number
    comment: string | null
    created_at: string
}

export default function JobDetailsPage() {
    const { id } = useParams()
    const router = useRouter()
    const [job, setJob] = useState<Job | null>(null)
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [submissionText, setSubmissionText] = useState("")
    const [coverLetter, setCoverLetter] = useState("")
    const [submissions, setSubmissions] = useState<Submission[]>([])
    const [applications, setApplications] = useState<Application[]>([])
    const [hasApplied, setHasApplied] = useState(false)
    const [disputeReason, setDisputeReason] = useState("")
    const [uploadingFiles, setUploadingFiles] = useState(false)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [showCancelDialog, setShowCancelDialog] = useState(false)
    // Rating state
    const [myRating, setMyRating] = useState<Rating | null>(null)
    const [theirRating, setTheirRating] = useState<Rating | null>(null)
    const [ratingScore, setRatingScore] = useState(0)
    const [ratingComment, setRatingComment] = useState("")
    const [showRatingDialog, setShowRatingDialog] = useState(false)
    const [ratingLoading, setRatingLoading] = useState(false)

    const fetchJob = useCallback(async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)

        // Fetch real job from DB
        const { data: jobData, error } = await supabase
            .from('jobs')
            .select('*, profiles!jobs_creator_id_fkey(username)')
            .eq('id', id)
            .single()

        if (error || !jobData) {
            console.error("Failed to fetch job:", error)
            setLoading(false)
            return
        }

        setJob(jobData)

        // Fetch applications for this job
        const { data: apps } = await supabase
            .from('applications')
            .select('*, profiles!applications_worker_id_fkey(username)')
            .eq('job_id', id)
            .order('created_at', { ascending: false })

        if (apps) {
            setApplications(apps)
            if (user) {
                setHasApplied(apps.some(a => a.worker_id === user.id))
            }
        }

        // Fetch submissions for this job
        const { data: subs } = await supabase
            .from('submissions')
            .select('*')
            .eq('job_id', id)
            .order('created_at', { ascending: false })

        if (subs) setSubmissions(subs)

        // Fetch ratings if job is completed
        if (jobData.status === 'COMPLETED' && user) {
            const { data: ratingRows } = await supabase
                .from('ratings')
                .select('*')
                .eq('job_id', id)

            if (ratingRows) {
                const mine = ratingRows.find((r: Rating) => r.rater_id === user.id) ?? null
                const theirs = ratingRows.find((r: Rating) => r.rater_id !== user.id) ?? null
                setMyRating(mine)
                setTheirRating(theirs)
            }
        }

        setLoading(false)
    }, [id])

    useEffect(() => {
        fetchJob()
    }, [fetchJob])

    const handleApply = async () => {
        if (!user || !job) return
        setActionLoading(true)
        const supabase = createClient()

        try {
            const { error: appError } = await supabase
                .from('applications')
                .insert({
                    job_id: job.id,
                    worker_id: user.id,
                    cover_letter: coverLetter || 'I would like to work on this task.',
                    status: 'PENDING',
                })

            if (appError) throw appError

            // Notify creator
            try {
                await supabase.functions.invoke('send-notification', {
                    body: {
                        type: 'APPLICATION_RECEIVED',
                        recipientUserId: job.creator_id,
                        jobId: job.id,
                    }
                })
            } catch (_) { /* non-blocking */ }

            setHasApplied(true)
            setCoverLetter("")
            await fetchJob() // Refresh applications list
            toast.success("Application submitted successfully!")
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to apply")
        } finally {
            setActionLoading(false)
        }
    }



    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setSelectedFiles(Array.from(e.target.files))
        }
    }

    const uploadFiles = async (userId: string, submissionId: string): Promise<string[]> => {
        if (selectedFiles.length === 0) return []

        const supabase = createClient()
        const uploadedPaths: string[] = []

        for (const file of selectedFiles) {
            const fileExt = file.name.split('.').pop()
            const fileName = `${userId}/${submissionId}/${Date.now()}.${fileExt}`

            const { error: uploadError } = await supabase.storage
                .from('submissions')
                .upload(fileName, file)

            if (uploadError) {
                console.error("File upload error:", uploadError)
                throw new Error(`Failed to upload ${file.name}`)
            }

            uploadedPaths.push(fileName)
        }

        return uploadedPaths
    }

    const handleSubmitWork = async () => {
        if (!user || !job || !submissionText) return
        setActionLoading(true)
        setUploadingFiles(selectedFiles.length > 0)
        const supabase = createClient()

        try {
            // Generate submission ID first
            const submissionId = crypto.randomUUID()

            // Upload files if any
            let attachmentPaths: string[] = []
            if (selectedFiles.length > 0) {
                attachmentPaths = await uploadFiles(user.id, submissionId)
            }

            // Insert submission with attachments
            const { error: subError } = await supabase
                .from('submissions')
                .insert({
                    id: submissionId,
                    job_id: job.id,
                    worker_id: user.id,
                    content: submissionText,
                    attachments: attachmentPaths.length > 0 ? attachmentPaths : null,
                })

            if (subError) throw subError

            const { error: jobError } = await supabase
                .from('jobs')
                .update({ status: 'REVIEW' })
                .eq('id', job.id)

            if (jobError) throw jobError

            // Notify creator
            try {
                await supabase.functions.invoke('send-notification', {
                    body: {
                        type: 'SUBMISSION_READY',
                        recipientUserId: job.creator_id,
                        jobId: job.id,
                    }
                })
            } catch (_) { /* non-blocking */ }

            setJob({ ...job, status: 'REVIEW' })
            setSubmissions([
                {
                    id: submissionId,
                    content: submissionText,
                    attachments: attachmentPaths.length > 0 ? attachmentPaths : null,
                    created_at: new Date().toISOString(),
                    worker_id: user.id
                },
                ...submissions
            ])
            setSubmissionText("")
            setSelectedFiles([])
            toast.success("Work submitted successfully!")
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to submit work")
        } finally {
            setActionLoading(false)
            setUploadingFiles(false)
        }
    }

    const handleFundEscrow = async () => {
        if (!user || !job) return
        setActionLoading(true)
        const supabase = createClient()

        try {
            const { data, error } = await supabase.functions.invoke('fund-escrow', {
                body: { jobId: job.id }
            })
            if (error) throw error

            setJob({ ...job, status: 'FUNDED' })
            toast.success("Escrow funded successfully! Job is now live.")
            await fetchJob()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to fund escrow. Check your balance.")
        } finally {
            setActionLoading(false)
        }
    }

    const handleCancel = async () => {
        if (!user || !job) return
        setShowCancelDialog(false)
        setActionLoading(true)
        const supabase = createClient()

        try {
            const { data, error } = await supabase.functions.invoke('cancel-job', {
                body: { jobId: job.id }
            })
            if (error) throw error

            setJob({ ...job, status: 'CANCELLED' })
            const refundMessage = job.status === 'FUNDED'
                ? ` Your ${Number(job.budget_sats).toLocaleString()} sats have been returned to your wallet.`
                : ''
            toast.success(`Job cancelled.${refundMessage}`)
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to cancel job")
        } finally {
            setActionLoading(false)
        }
    }

    const downloadFile = async (filePath: string) => {
        const supabase = createClient()
        const { data, error } = await supabase.storage
            .from('submissions')
            .download(filePath)

        if (error) {
            console.error("Download error:", error)
            toast.error("Failed to download file")
            return
        }

        // Create download link
        const url = URL.createObjectURL(data)
        const a = document.createElement('a')
        a.href = url
        a.download = filePath.split('/').pop() || 'file'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const handleApprove = async () => {
        if (!user || !job) return
        setActionLoading(true)
        const supabase = createClient()

        try {
            const { error } = await supabase.functions.invoke('approve-payout', {
                body: { jobId: job.id }
            })
            if (error) throw error

            setJob({ ...job, status: 'COMPLETED' })
            toast.success("Payment approved and sent to worker!")
            // Refresh to load rating section
            await fetchJob()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Approval failed")
        } finally {
            setActionLoading(false)
        }
    }

    const handleSubmitRating = async () => {
        if (!user || !job || ratingScore === 0) return
        setShowRatingDialog(false)
        setRatingLoading(true)
        const supabase = createClient()

        try {
            const { error } = await supabase.functions.invoke('submit-rating', {
                body: {
                    jobId: job.id,
                    score: ratingScore,
                    comment: ratingComment.trim() || undefined,
                },
            })
            if (error) throw error

            toast.success("Rating submitted — thank you for your feedback!")
            // Refresh to show submitted state
            await fetchJob()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to submit rating")
        } finally {
            setRatingLoading(false)
        }
    }

    const handleDispute = async () => {
        if (!user || !job || !disputeReason) return
        setActionLoading(true)
        const supabase = createClient()

        try {
            // Create dispute record
            const { error: disputeErr } = await supabase
                .from('disputes')
                .insert({
                    job_id: job.id,
                    opened_by: user.id,
                    reason: disputeReason,
                })

            if (disputeErr) throw disputeErr

            // Update job status
            const { error: jobErr } = await supabase
                .from('jobs')
                .update({ status: 'DISPUTED' })
                .eq('id', job.id)

            if (jobErr) throw jobErr

            // Notify the other party
            const otherParty = user.id === job.creator_id ? job.worker_id : job.creator_id
            if (otherParty) {
                try {
                    await supabase.functions.invoke('send-notification', {
                        body: {
                            type: 'DISPUTE_OPENED',
                            recipientUserId: otherParty,
                            jobId: job.id,
                        }
                    })
                } catch (_) { /* non-blocking */ }
            }

            setJob({ ...job, status: 'DISPUTED' })
            setDisputeReason("")
            toast.success("Dispute opened. Admin will review and resolve.")
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || "Failed to raise dispute")
        } finally {
            setActionLoading(false)
        }
    }

    if (loading) return <div className="p-8">Loading...</div>
    if (!job) return <div className="p-8">Job not found</div>

    const isCreator = user?.id === job.creator_id
    const isWorker = user?.id === job.worker_id

    const statusColors: Record<string, string> = {
        OPEN: 'bg-green-100 text-green-800',
        FUNDED: 'bg-emerald-100 text-emerald-800',
        IN_PROGRESS: 'bg-blue-100 text-blue-800',
        REVIEW: 'bg-yellow-100 text-yellow-800',
        COMPLETED: 'bg-gray-100 text-gray-800',
        DISPUTED: 'bg-red-100 text-red-800',
        CANCELLED: 'bg-gray-100 text-gray-500',
    }

    const isCancellableByCreator = isCreator && (job.status === 'OPEN' || job.status === 'FUNDED')

    return (
        <>
            {/* Cancel Job confirmation dialog */}
            <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>

                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                            Cancel this job?
                        </DialogTitle>
                        <DialogDescription>
                            {job.status === 'FUNDED'
                                ? `This job is funded. Cancelling will immediately refund ${Number(job.budget_sats).toLocaleString()} sats back to your wallet balance. This action cannot be undone.`
                                : 'Are you sure you want to cancel this job? This action cannot be undone.'}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowCancelDialog(false)}
                            disabled={actionLoading}
                        >
                            Keep Job
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleCancel}
                            disabled={actionLoading}
                        >
                            {actionLoading ? 'Cancelling...' : 'Yes, Cancel Job'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Submit Rating confirmation dialog */}
            <Dialog open={showRatingDialog} onOpenChange={setShowRatingDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Submit your rating?</DialogTitle>
                        <DialogDescription>
                            You are about to submit a {ratingScore}-star rating. Ratings are final and cannot be changed after submission.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowRatingDialog(false)}
                            disabled={ratingLoading}
                        >
                            Go Back
                        </Button>
                        <Button
                            onClick={handleSubmitRating}
                            disabled={ratingLoading}
                        >
                            {ratingLoading ? 'Submitting...' : 'Confirm Rating'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="max-w-3xl mx-auto py-8 space-y-6">
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-2xl">{job.title}</CardTitle>
                                <CardDescription>
                                    Posted by {job.profiles?.username || 'Unknown'}
                                    {job.category && <> · <span className="font-medium">{job.category}</span></>}
                                </CardDescription>
                            </div>
                            <Badge className={statusColors[job.status] || ''}>{job.status}</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-4">
                            <div className="rounded-md bg-muted p-4 flex-1">
                                <div className="text-sm font-semibold mb-1">Budget</div>
                                <div className="text-lg">{Number(job.budget_sats).toLocaleString()} sats</div>
                            </div>
                            {job.deadline && (
                                <div className="rounded-md bg-muted p-4 flex-1">
                                    <div className="text-sm font-semibold mb-1">Deadline</div>
                                    <div className="text-lg">{new Date(job.deadline).toLocaleDateString()}</div>
                                </div>
                            )}
                        </div>
                        <div>
                            <h3 className="font-semibold mb-2">Description</h3>
                            <p className="text-muted-foreground whitespace-pre-wrap">{job.description}</p>
                        </div>

                        {/* Applications Section (visible to creator on OPEN/FUNDED jobs) */}
                        {isCreator && (job.status === 'OPEN' || job.status === 'FUNDED') && (
                            <div className="space-y-3 p-4 border rounded-md bg-muted/50 flex flex-col sm:flex-row justify-between items-center">
                                <div>
                                    <h3 className="font-semibold text-lg flex items-center gap-2">Applications <Badge variant="secondary">{applications.length}</Badge></h3>
                                    <p className="text-sm text-muted-foreground">Review and accept freelancers for your job.</p>
                                </div>
                                <Button asChild>
                                    <Link href={`/dashboard/jobs/${job.id}/applications`}>
                                        View Applications
                                    </Link>
                                </Button>
                            </div>
                        )}

                        {/* Show submissions */}
                        {submissions.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="font-semibold">Submissions</h3>
                                {submissions.map((sub) => (
                                    <div key={sub.id} className="border rounded p-4 space-y-2">
                                        <p className="text-sm">{sub.content}</p>
                                        {sub.attachments && sub.attachments.length > 0 && (
                                            <div className="space-y-1">
                                                <p className="text-xs font-semibold text-muted-foreground">Attachments:</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {sub.attachments.map((filePath, idx) => (
                                                        <Button
                                                            key={idx}
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => downloadFile(filePath)}
                                                            className="text-xs"
                                                        >
                                                            📎 {filePath.split('/').pop()}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            Submitted {new Date(sub.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {job.status === 'COMPLETED' && (
                            <div className="space-y-4">
                                <div className="text-center text-green-600 font-bold text-lg py-2">
                                    ✅ Job Completed — Payment has been released
                                </div>

                                {/* Ratings section — only visible to job parties */}
                                {(isCreator || isWorker) && (
                                    <div
                                        className="border rounded-lg p-4 space-y-4 bg-muted/30"
                                        aria-label="Job ratings"
                                    >
                                        <h3 className="font-semibold text-base">Ratings</h3>

                                        {/* Current user's rating */}
                                        {myRating ? (
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium text-muted-foreground">
                                                    Your rating
                                                </p>
                                                <StarRating value={myRating.score} readonly size="md" />
                                                {myRating.comment && (
                                                    <p className="text-sm text-muted-foreground italic">"{myRating.comment}"</p>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <p className="text-sm font-medium">
                                                    {isCreator ? 'Rate the worker' : 'Rate the job creator'}
                                                </p>
                                                <div className="space-y-2">
                                                    <Label htmlFor="rating-stars">Score</Label>
                                                    <div id="rating-stars">
                                                        <StarRating
                                                            value={ratingScore}
                                                            onChange={setRatingScore}
                                                            size="lg"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="rating-comment">Comment (optional)</Label>
                                                    <Textarea
                                                        id="rating-comment"
                                                        placeholder="Share your experience..."
                                                        value={ratingComment}
                                                        onChange={e => setRatingComment(e.target.value)}
                                                        rows={3}
                                                        maxLength={500}
                                                    />
                                                </div>
                                                <Button
                                                    onClick={() => setShowRatingDialog(true)}
                                                    disabled={ratingScore === 0 || ratingLoading}
                                                    className="w-full"
                                                    aria-label="Submit rating"
                                                >
                                                    {ratingLoading ? 'Submitting...' : 'Submit Rating'}
                                                </Button>
                                            </div>
                                        )}

                                        {/* Other party's rating */}
                                        {theirRating && (
                                            <div className="border-t pt-3 space-y-1">
                                                <p className="text-sm font-medium text-muted-foreground">
                                                    {isCreator ? 'Worker\'s rating of you' : 'Creator\'s rating of you'}
                                                </p>
                                                <StarRating value={theirRating.score} readonly size="md" />
                                                {theirRating.comment && (
                                                    <p className="text-sm text-muted-foreground italic">"{theirRating.comment}"</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        {job.status === 'DISPUTED' && (
                            <div className="text-center text-red-600 font-bold text-lg py-4">
                                ⚠️ This job is under dispute — awaiting admin resolution
                            </div>
                        )}
                        {job.status === 'CANCELLED' && (
                            <div className="text-center text-muted-foreground font-medium text-lg py-4">
                                🚫 This job has been cancelled
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        {/* Share Section - Only for OPEN/FUNDED jobs */}
                        {(job.status === 'OPEN' || job.status === 'FUNDED') && (
                            <div className="w-full border-b pb-4 space-y-3">
                                <h4 className="text-sm font-semibold">Share this job</h4>
                                <div className="flex flex-col gap-2">
                                    <ShareButton
                                        url={generateJobUrl(job.id)}
                                        title={job.title}
                                        text={generateShareText(job)}
                                        variant="outline"
                                        className="w-full"
                                    />
                                    <SocialShareButtons
                                        url={generateJobUrl(job.id)}
                                        text={generateShareText(job)}
                                    />
                                </div>
                            </div>
                        )}

                        {/* CREATOR: Fund Escrow (when job is OPEN and not yet funded) */}
                        {job.status === 'OPEN' && isCreator && (
                            <div className="w-full space-y-3">
                                <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4">
                                    <p className="text-sm text-yellow-800 font-medium">This job is not yet funded.</p>
                                    <p className="text-xs text-yellow-700 mt-1">
                                        Fund the escrow ({Number(job.budget_sats).toLocaleString()} sats) to make this job visible to workers.
                                        Make sure you have enough balance in your wallet.
                                    </p>
                                </div>
                                <Button onClick={handleFundEscrow} disabled={actionLoading} className="w-full">
                                    {actionLoading ? 'Funding...' : `Fund Escrow (${Number(job.budget_sats).toLocaleString()} sats)`}
                                </Button>
                            </div>
                        )}

                        {/* CREATOR: Cancel job (OPEN or FUNDED, no worker assigned yet) */}
                        {isCancellableByCreator && (
                            <div className="w-full">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => setShowCancelDialog(true)}
                                    disabled={actionLoading}
                                    aria-label="Cancel this job"
                                >
                                    Cancel Job
                                </Button>
                            </div>
                        )}

                        {/* WORKER: Apply to job */}
                        {(job.status === 'OPEN' || job.status === 'FUNDED') && !isCreator && !hasApplied && (
                            <div className="w-full space-y-3">
                                <Textarea
                                    placeholder="Write a brief cover letter explaining why you're a good fit..."
                                    value={coverLetter}
                                    onChange={e => setCoverLetter(e.target.value)}
                                />
                                <Button onClick={handleApply} disabled={actionLoading} className="w-full">
                                    {actionLoading ? 'Applying...' : 'Apply for this Job'}
                                </Button>
                            </div>
                        )}

                        {(job.status === 'OPEN' || job.status === 'FUNDED') && !isCreator && hasApplied && (
                            <div className="w-full text-center py-3 text-muted-foreground">
                                ✅ You have already applied to this job
                            </div>
                        )}

                        {/* WORKER: Submit work */}
                        {job.status === 'IN_PROGRESS' && isWorker && (
                            <div className="w-full space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="submission-text">Work Description</Label>
                                    <Textarea
                                        id="submission-text"
                                        placeholder="Describe your work or paste a link..."
                                        value={submissionText}
                                        onChange={e => setSubmissionText(e.target.value)}
                                        rows={4}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="file-upload">Attachments (optional)</Label>
                                    <Input
                                        id="file-upload"
                                        type="file"
                                        multiple
                                        onChange={handleFileSelect}
                                        accept="image/*,application/pdf,.doc,.docx,.txt,.zip"
                                        disabled={actionLoading}
                                    />
                                    {selectedFiles.length > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            {selectedFiles.length} file(s) selected: {selectedFiles.map(f => f.name).join(', ')}
                                        </p>
                                    )}
                                </div>
                                <Button
                                    onClick={handleSubmitWork}
                                    disabled={actionLoading || !submissionText}
                                    className="w-full"
                                >
                                    {uploadingFiles ? 'Uploading files...' : actionLoading ? 'Submitting...' : 'Submit Work'}
                                </Button>
                            </div>
                        )}

                        {/* CREATOR: Review submission */}
                        {job.status === 'REVIEW' && isCreator && (
                            <div className="w-full space-y-3">
                                <div className="flex justify-end gap-2">
                                    <Button variant="destructive" onClick={() => document.getElementById('dispute-section')?.scrollIntoView()} disabled={actionLoading}>
                                        Dispute
                                    </Button>
                                    <Button onClick={handleApprove} disabled={actionLoading} className="bg-green-600 hover:bg-green-700">
                                        {actionLoading ? 'Processing...' : 'Approve & Pay'}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Dispute section (visible to both parties if job is in REVIEW or IN_PROGRESS) */}
                        {(job.status === 'REVIEW' || job.status === 'IN_PROGRESS') && (isCreator || isWorker) && (
                            <div id="dispute-section" className="w-full border-t pt-4 space-y-3">
                                <h4 className="font-semibold text-sm text-red-600">Raise a Dispute</h4>
                                <Textarea
                                    placeholder="Explain the reason for the dispute..."
                                    value={disputeReason}
                                    onChange={e => setDisputeReason(e.target.value)}
                                />
                                <Button
                                    variant="destructive"
                                    onClick={handleDispute}
                                    disabled={actionLoading || !disputeReason}
                                    className="w-full"
                                >
                                    {actionLoading ? 'Submitting...' : 'Submit Dispute'}
                                </Button>
                            </div>
                        )}
                    </CardFooter>
                </Card>
            </div>
        </>
    )
}
