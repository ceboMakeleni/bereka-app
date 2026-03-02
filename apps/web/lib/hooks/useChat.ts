"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import type { ChatMessage } from "@/lib/types"

interface UseChatOptions {
    roomId: string | null
}

interface UseChatReturn {
    messages: ChatMessage[]
    loading: boolean
    sending: boolean
    error: string | null
    sendMessage: (content: string) => Promise<boolean>
}

export function useChat({ roomId }: UseChatOptions): UseChatReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)

    // Fetch initial messages and subscribe to Realtime
    useEffect(() => {
        if (!roomId) {
            setLoading(false)
            return
        }

        let cancelled = false
        const supabase = createClient()

        const fetchMessages = async () => {
            setLoading(true)
            setError(null)

            const { data, error: fetchError } = await supabase
                .from("chat_messages")
                .select("*")
                .eq("room_id", roomId)
                .order("created_at", { ascending: true })

            if (cancelled) return

            if (fetchError) {
                setError("Failed to load messages")
                setLoading(false)
                return
            }

            setMessages(data ?? [])
            setLoading(false)
        }

        fetchMessages()

        // Subscribe to new messages via Supabase Realtime
        const channel = supabase
            .channel(`chat:${roomId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "chat_messages",
                    filter: `room_id=eq.${roomId}`,
                },
                (payload) => {
                    const newMessage = payload.new as ChatMessage
                    setMessages((prev) => {
                        // Deduplicate — prevent adding if already present (optimistic update)
                        if (prev.some((m) => m.id === newMessage.id)) return prev
                        return [...prev, newMessage]
                    })
                }
            )
            .subscribe()

        channelRef.current = channel

        return () => {
            cancelled = true
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current)
                channelRef.current = null
            }
        }
    }, [roomId])

    const sendMessage = useCallback(
        async (content: string): Promise<boolean> => {
            if (!roomId || !content.trim()) return false

            setSending(true)
            setError(null)

            try {
                const supabase = createClient()
                const { data, error: invokeError } = await supabase.functions.invoke(
                    "send-chat-message",
                    { body: { roomId, content: content.trim() } }
                )

                if (invokeError) {
                    setError(invokeError.message || "Failed to send message")
                    return false
                }

                // Check for application-level error
                if (data?.error) {
                    setError(data.error)
                    return false
                }

                // Optimistically add the message if Realtime hasn't delivered it yet
                if (data?.message) {
                    setMessages((prev) => {
                        if (prev.some((m) => m.id === data.message.id)) return prev
                        return [...prev, data.message]
                    })
                }

                return true
            } catch (err) {
                setError((err as Error).message || "Failed to send message")
                return false
            } finally {
                setSending(false)
            }
        },
        [roomId]
    )

    return { messages, loading, sending, error, sendMessage }
}
