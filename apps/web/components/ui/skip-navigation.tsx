"use client"

import { cn } from "@/lib/utils"

export function SkipNavigation() {
    return (
        <a
            href="#main-content"
            className={cn(
                "fixed top-0 left-0 z-[100] px-4 py-3 text-sm font-semibold",
                "bg-primary text-primary-foreground rounded-br-lg shadow-lg",
                "transform -translate-y-full focus:translate-y-0",
                "transition-transform duration-200 ease-in-out",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            )}
        >
            Skip to main content
        </a>
    )
}
