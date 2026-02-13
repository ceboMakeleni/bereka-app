"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Share2, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { canUseWebShare } from "@/lib/share-utils"

interface ShareButtonProps {
    url: string
    title: string
    text: string
    variant?: "default" | "outline" | "ghost" | "destructive"
    size?: "default" | "sm" | "lg" | "icon"
    className?: string
}

export function ShareButton({
    url,
    title,
    text,
    variant = "outline",
    size = "default",
    className = ""
}: ShareButtonProps) {
    const [copied, setCopied] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const useWebShare = canUseWebShare()

    const handleShare = async (e: React.MouseEvent) => {
        // Prevent parent link navigation
        e.preventDefault()
        e.stopPropagation()

        setIsSharing(true)

        try {
            if (useWebShare) {
                // Use native Web Share API
                await navigator.share({
                    title: title,
                    text: text,
                    url: url,
                })
                toast.success("Shared successfully!")
            } else {
                // Fallback to clipboard
                await navigator.clipboard.writeText(url)
                setCopied(true)
                toast.success("Link copied to clipboard!")

                // Reset copied state after 2 seconds
                setTimeout(() => setCopied(false), 2000)
            }
        } catch (err: any) {
            // User cancelled share - don't show error
            if (err.name === 'AbortError') {
                // Do nothing
            } else {
                console.error("Share error:", err)
                // Try clipboard as last resort
                try {
                    await navigator.clipboard.writeText(url)
                    setCopied(true)
                    toast.success("Link copied to clipboard!")
                    setTimeout(() => setCopied(false), 2000)
                } catch (clipErr) {
                    toast.error("Failed to share. Please try again.")
                }
            }
        } finally {
            setIsSharing(false)
        }
    }

    return (
        <Button
            onClick={handleShare}
            disabled={isSharing}
            variant={variant}
            size={size}
            className={className}
        >
            {copied ? (
                <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied!
                </>
            ) : useWebShare ? (
                <>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                </>
            ) : (
                <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Link
                </>
            )}
        </Button>
    )
}
