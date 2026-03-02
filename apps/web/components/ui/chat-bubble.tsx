"use client"

import { formatDistanceToNow } from "date-fns"
import { Flag } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { ChatMessage } from "@/lib/types"

interface ChatBubbleProps {
    message: ChatMessage
    isOwnMessage: boolean
    senderName?: string
    onReport?: (messageId: string) => void
}

export function ChatBubble({
    message,
    isOwnMessage,
    senderName,
    onReport,
}: ChatBubbleProps) {
    const timeAgo = formatDistanceToNow(new Date(message.created_at), {
        addSuffix: true,
    })

    return (
        <div
            className={cn(
                "flex flex-col gap-1 max-w-[80%]",
                isOwnMessage ? "self-end items-end" : "self-start items-start"
            )}
            role="listitem"
        >
            {/* Sender name (for received messages only) */}
            {!isOwnMessage && senderName && (
                <span className="text-xs text-muted-foreground px-2">
                    {senderName}
                </span>
            )}

            <div
                className={cn(
                    "rounded-2xl px-4 py-2.5 text-sm leading-relaxed relative group",
                    isOwnMessage
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md",
                    message.is_flagged && "opacity-60"
                )}
            >
                {message.is_flagged ? (
                    <span className="italic text-muted-foreground">
                        ⚠️ This message was flagged for review
                    </span>
                ) : (
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                )}

                {/* Report button — only on received, non-flagged messages */}
                {!isOwnMessage && !message.is_flagged && onReport && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "absolute -right-8 top-1/2 -translate-y-1/2",
                            "h-6 w-6 opacity-0 group-hover:opacity-100",
                            "transition-opacity focus:opacity-100"
                        )}
                        onClick={() => onReport(message.id)}
                        aria-label="Report this message"
                    >
                        <Flag className="h-3 w-3" />
                    </Button>
                )}
            </div>

            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground px-2">
                {timeAgo}
            </span>
        </div>
    )
}
