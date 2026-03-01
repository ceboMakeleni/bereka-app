"use client"

import * as React from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

export interface StarRatingProps {
    /** Current selected value (1–5). Use 0 for no selection. */
    value: number
    /** Called when the user selects a new value. Not called in readonly mode. */
    onChange?: (value: number) => void
    /** When true, interaction is disabled and no hover effects are shown. */
    readonly?: boolean
    /** Visual size of each star icon. Defaults to 'md'. */
    size?: "sm" | "md" | "lg"
    /** Additional class names applied to the container. */
    className?: string
}

const sizeMap = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
} as const

/**
 * StarRating — accessible 1-to-5 star selector.
 *
 * Follows the Shadcn UI pattern: CVA-free for simplicity, uses Lucide icons,
 * supports keyboard navigation (ArrowLeft / ArrowRight) and aria attributes.
 * Compliant with WCAG 2.2 Level AA (AGENTS.md §13).
 */
export function StarRating({
    value,
    onChange,
    readonly = false,
    size = "md",
    className,
}: StarRatingProps) {
    const [hovered, setHovered] = React.useState(0)
    const isInteractive = !readonly && !!onChange

    const effectiveValue = hovered > 0 ? hovered : value

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!isInteractive) return
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault()
            onChange(Math.min(5, value + 1))
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault()
            onChange(Math.max(1, value - 1))
        }
    }

    return (
        <div
            role="radiogroup"
            aria-label="Star rating"
            aria-required={!readonly}
            className={cn("flex items-center gap-1", className)}
            onMouseLeave={() => setHovered(0)}
            onKeyDown={handleKeyDown}
            tabIndex={isInteractive ? 0 : -1}
        >
            {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = star <= effectiveValue
                const label = `${star} star${star !== 1 ? "s" : ""}`

                return (
                    <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-label={label}
                        aria-checked={star === value}
                        disabled={!isInteractive}
                        tabIndex={-1} // parent div handles tab stop
                        className={cn(
                            "rounded-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isInteractive && "cursor-pointer hover:scale-110 active:scale-95",
                            !isInteractive && "cursor-default"
                        )}
                        onClick={() => isInteractive && onChange(star)}
                        onMouseEnter={() => isInteractive && setHovered(star)}
                    >
                        <Star
                            aria-hidden="true"
                            className={cn(
                                sizeMap[size],
                                "transition-colors",
                                isFilled
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "fill-transparent text-muted-foreground"
                            )}
                        />
                    </button>
                )
            })}
        </div>
    )
}
