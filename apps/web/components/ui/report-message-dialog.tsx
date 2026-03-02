"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

interface ReportMessageDialogProps {
    messageId: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ReportMessageDialog({
    messageId,
    open,
    onOpenChange,
}: ReportMessageDialogProps) {
    const [reason, setReason] = useState("")
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        if (!messageId || !reason.trim()) return

        setSubmitting(true)

        try {
            const supabase = createClient()
            const { data, error } = await supabase.functions.invoke(
                "report-chat-message",
                { body: { messageId, reason: reason.trim() } }
            )

            if (error) {
                toast.error(error.message || "Failed to submit report")
                return
            }

            if (data?.error) {
                toast.error(data.error)
                return
            }

            toast.success("Report submitted. Our team will review it.")
            setReason("")
            onOpenChange(false)
        } catch {
            toast.error("Something went wrong. Please try again.")
        } finally {
            setSubmitting(false)
        }
    }

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setReason("")
        }
        onOpenChange(nextOpen)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Report Message</DialogTitle>
                    <DialogDescription>
                        Let us know why this message is inappropriate. Our team will
                        review your report.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="report-reason">Reason</Label>
                        <Textarea
                            id="report-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Describe why this message is inappropriate…"
                            rows={3}
                            maxLength={1000}
                            disabled={submitting}
                        />
                        <p className="text-xs text-muted-foreground text-right">
                            {reason.length}/1000
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || !reason.trim()}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Submitting…
                            </>
                        ) : (
                            "Submit Report"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
