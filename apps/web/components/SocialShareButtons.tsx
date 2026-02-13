"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Facebook, Linkedin, MessageCircle, Copy, Check } from "lucide-react"
import { toast } from "sonner"
import { getPlatformShareUrl } from "@/lib/share-utils"

// Using X/Twitter icon as a simple text icon since lucide-react may not have the X logo
const XIcon = () => (
    <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
)

interface SocialShareButtonsProps {
    url: string
    text: string
    className?: string
}

export function SocialShareButtons({ url, text, className = "" }: SocialShareButtonsProps) {
    const [copied, setCopied] = useState(false)

    const handlePlatformShare = (
        platform: 'twitter' | 'facebook' | 'linkedin' | 'whatsapp',
        e: React.MouseEvent
    ) => {
        // Prevent parent link navigation
        e.preventDefault()
        e.stopPropagation()

        const shareUrl = getPlatformShareUrl(platform, url, text)
        window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=600')
    }

    const handleCopyLink = async (e: React.MouseEvent) => {
        // Prevent parent link navigation
        e.preventDefault()
        e.stopPropagation()

        try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            toast.success("Link copied to clipboard!")

            // Reset copied state after 2 seconds
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error("Copy error:", err)
            toast.error("Failed to copy link")
        }
    }

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <span className="text-xs text-muted-foreground mr-1">Share on:</span>

            <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => handlePlatformShare('twitter', e)}
                title="Share on X (Twitter)"
            >
                <XIcon />
            </Button>

            <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => handlePlatformShare('facebook', e)}
                title="Share on Facebook"
            >
                <Facebook className="h-4 w-4" />
            </Button>

            <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => handlePlatformShare('linkedin', e)}
                title="Share on LinkedIn"
            >
                <Linkedin className="h-4 w-4" />
            </Button>

            <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => handlePlatformShare('whatsapp', e)}
                title="Share on WhatsApp"
            >
                <MessageCircle className="h-4 w-4" />
            </Button>

            <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopyLink}
                title="Copy link"
            >
                {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                ) : (
                    <Copy className="h-4 w-4" />
                )}
            </Button>
        </div>
    )
}
