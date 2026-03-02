"use client"

import { useState, useRef, useEffect, type KeyboardEvent } from "react"
import { Send, Loader2, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChatBubble } from "@/components/ui/chat-bubble"
import { ReportMessageDialog } from "@/components/ui/report-message-dialog"
import type { ChatMessage } from "@/lib/types"

interface ChatPanelProps {
    messages: ChatMessage[]
    loading: boolean
    sending: boolean
    error: string | null
    currentUserId: string
    senderNames?: Record<string, string>
    onSendMessage: (content: string) => Promise<boolean>
}

export function ChatPanel({
    messages,
    loading,
    sending,
    error,
    currentUserId,
    senderNames = {},
    onSendMessage,
}: ChatPanelProps) {
    const [inputValue, setInputValue] = useState("")
    const [reportingMessageId, setReportingMessageId] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    const handleSend = async () => {
        const content = inputValue.trim()
        if (!content || sending) return

        const success = await onSendMessage(content)
        if (success) {
            setInputValue("")
            textareaRef.current?.focus()
        }
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter to send, Shift+Enter for newline
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // Loading skeleton
    if (loading) {
        return (
            <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading messages…</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full" role="region" aria-label="Chat">
            {/* Message list */}
            <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col"
                role="list"
                aria-label="Chat messages"
                aria-live="polite"
                aria-relevant="additions"
            >
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                        <MessageSquare className="h-10 w-10 opacity-50" />
                        <p className="text-sm">No messages yet. Start the conversation!</p>
                    </div>
                ) : (
                    messages.map((message) => (
                        <ChatBubble
                            key={message.id}
                            message={message}
                            isOwnMessage={message.sender_id === currentUserId}
                            senderName={
                                message.sender_id !== currentUserId
                                    ? senderNames[message.sender_id] || "Other"
                                    : undefined
                            }
                            onReport={setReportingMessageId}
                        />
                    ))
                )}
                <div ref={messagesEndRef} aria-hidden="true" />
            </div>

            {/* Error bar */}
            {error && (
                <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm">
                    {error}
                </div>
            )}

            {/* Message input */}
            <div className="border-t p-4 flex gap-2 items-end">
                <Textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message… (Shift+Enter for new line)"
                    className="min-h-[44px] max-h-[120px] resize-none"
                    rows={1}
                    disabled={sending}
                    aria-label="Message input"
                />
                <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={sending || !inputValue.trim()}
                    aria-label="Send message"
                >
                    {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="h-4 w-4" />
                    )}
                </Button>
            </div>

            {/* Report dialog */}
            <ReportMessageDialog
                messageId={reportingMessageId}
                open={!!reportingMessageId}
                onOpenChange={(open) => {
                    if (!open) setReportingMessageId(null)
                }}
            />
        </div>
    )
}
