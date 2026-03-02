"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { MessageSquare, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { formatDistanceToNow } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"

interface ChatRoomListItem {
    id: string
    job_id: string
    creator_id: string
    worker_id: string
    created_at: string
    jobs: {
        title: string
    } | { title: string }[]
    other_username?: string
    last_message?: {
        content: string
        is_flagged: boolean
        created_at: string
    } | null
}

export default function MessagesPage() {
    const [rooms, setRooms] = useState<ChatRoomListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [userId, setUserId] = useState<string | null>(null)

    useEffect(() => {
        const fetchRooms = async () => {
            const supabase = createClient()

            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setLoading(false)
                return
            }

            setUserId(user.id)

            // Fetch all chat rooms the user is a participant in, with job title
            const { data: chatRooms, error } = await supabase
                .from("chat_rooms")
                .select(`
                    id,
                    job_id,
                    creator_id,
                    worker_id,
                    created_at,
                    jobs ( title )
                `)
                .order("created_at", { ascending: false })

            if (error || !chatRooms) {
                setLoading(false)
                return
            }

            // For each room, fetch the last message and the other user's username
            const enrichedRooms = await Promise.all(
                chatRooms.map(async (room: ChatRoomListItem) => {
                    // Get last message
                    const { data: lastMessages } = await supabase
                        .from("chat_messages")
                        .select("content, is_flagged, created_at")
                        .eq("room_id", room.id)
                        .order("created_at", { ascending: false })
                        .limit(1)

                    // Get the other participant's username
                    const otherId = room.creator_id === user.id ? room.worker_id : room.creator_id
                    const { data: profile } = await supabase
                        .from("profiles")
                        .select("username")
                        .eq("id", otherId)
                        .single()

                    return {
                        ...room,
                        last_message: lastMessages?.[0] ?? null,
                        other_username: profile?.username ?? "Unknown user",
                    }
                })
            )

            setRooms(enrichedRooms)
            setLoading(false)
        }

        fetchRooms()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
                <p className="text-muted-foreground">
                    Chat with job creators and workers about active jobs.
                </p>
            </div>

            {rooms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 opacity-40" />
                    <div className="text-center space-y-1">
                        <p className="font-medium">No active chats</p>
                        <p className="text-sm">
                            Chats appear here when you accept or are assigned a job.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {rooms.map((room) => (
                        <Link
                            key={room.id}
                            href={`/dashboard/jobs/${room.job_id}?tab=chat`}
                            className="block"
                        >
                            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3 min-w-0 flex-1">
                                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                                <MessageSquare className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-sm truncate">
                                                    {Array.isArray(room.jobs)
                                                        ? room.jobs[0]?.title ?? "Unknown Job"
                                                        : room.jobs?.title ?? "Unknown Job"}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    with {room.other_username}
                                                </p>
                                                {room.last_message && (
                                                    <p className="text-sm text-muted-foreground mt-1 truncate">
                                                        {room.last_message.is_flagged
                                                            ? "⚠️ Message flagged for review"
                                                            : room.last_message.content}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                                            {room.last_message
                                                ? formatDistanceToNow(new Date(room.last_message.created_at), {
                                                    addSuffix: true,
                                                })
                                                : formatDistanceToNow(new Date(room.created_at), {
                                                    addSuffix: true,
                                                })}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
