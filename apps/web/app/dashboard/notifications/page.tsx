"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { Bell, BellOff, CheckCheck, Briefcase, Zap, AlertTriangle, FileText, CreditCard, ExternalLink } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

interface Notification {
    id: string
    type: string
    title: string
    message: string
    job_id: string | null
    read: boolean
    created_at: string
}

function getNotificationIcon(type: string) {
    switch (type) {
        case 'APPLICATION_RECEIVED': return <FileText className="h-4 w-4 text-blue-400" />
        case 'JOB_ACCEPTED': return <Briefcase className="h-4 w-4 text-green-400" />
        case 'SUBMISSION_READY': return <ExternalLink className="h-4 w-4 text-purple-400" />
        case 'PAYOUT_APPROVED': return <Zap className="h-4 w-4 text-yellow-400" />
        case 'DISPUTE_OPENED': return <AlertTriangle className="h-4 w-4 text-red-400" />
        case 'DISPUTE_RESOLVED': return <CheckCheck className="h-4 w-4 text-green-400" />
        case 'PAYMENT_RECEIVED': return <CreditCard className="h-4 w-4 text-emerald-400" />
        default: return <Bell className="h-4 w-4 text-muted-foreground" />
    }
}

function timeAgo(dateString: string): string {
    const now = new Date()
    const date = new Date(dateString)
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return date.toLocaleDateString()
}

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchNotifications = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50)

            if (error) {
                console.error('Failed to fetch notifications:', error)
                toast.error('Failed to load notifications')
            }

            setNotifications(data ?? [])
            setLoading(false)
        }
        fetchNotifications()
    }, [])

    const handleMarkAsRead = async (id: string) => {
        const supabase = createClient()
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', id)

        if (!error) {
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, read: true } : n)
            )
        }
    }

    const handleMarkAllRead = async () => {
        const supabase = createClient()
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
        if (unreadIds.length === 0) return

        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .in('id', unreadIds)

        if (!error) {
            setNotifications(prev => prev.map(n => ({ ...n, read: true })))
            toast.success('All notifications marked as read')
        }
    }

    const unreadCount = notifications.filter(n => !n.read).length

    if (loading) {
        return (
            <div className="p-6 max-w-3xl mx-auto space-y-4">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-4 w-64" />
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                ))}
            </div>
        )
    }

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-6 animate-fade-in">
            <PageHeader
                title="Notifications"
                description={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                icon={Bell}
            >
                {unreadCount > 0 && (
                    <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                        <CheckCheck className="h-4 w-4 mr-2" />
                        Mark all read
                    </Button>
                )}
            </PageHeader>

            {notifications.length === 0 ? (
                <EmptyState
                    icon={BellOff}
                    title="No notifications yet"
                    description="You'll see updates about your jobs, applications, and payments here."
                />
            ) : (
                <div className="space-y-2">
                    {notifications.map((notification) => (
                        <Card
                            key={notification.id}
                            className={`transition-all cursor-pointer hover:shadow-sm ${notification.read
                                ? 'opacity-70'
                                : 'border-primary/20 bg-primary/[0.02]'
                                }`}
                            onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 shrink-0">
                                        {getNotificationIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className={`text-sm font-medium truncate ${notification.read ? 'text-muted-foreground' : 'text-foreground'
                                                }`}>
                                                {notification.title}
                                            </p>
                                            {!notification.read && (
                                                <span className="shrink-0 w-2 h-2 rounded-full bg-primary" />
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                            {notification.message}
                                        </p>
                                        <div className="flex items-center gap-3 mt-2">
                                            <span className="text-xs text-muted-foreground">
                                                {timeAgo(notification.created_at)}
                                            </span>
                                            {notification.job_id && (
                                                <Link
                                                    href={`/dashboard/jobs/${notification.job_id}`}
                                                    className="text-xs text-primary hover:underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    View job →
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
