"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCw } from "lucide-react"

export default function DashboardErrorPage({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Dashboard error:", error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="text-center space-y-6 max-w-md">
                <div className="w-14 h-14 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="w-7 h-7 text-destructive" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-xl font-bold tracking-tight">Something went wrong</h2>
                    <p className="text-sm text-muted-foreground">
                        An error occurred while loading this page. Your funds are safe.
                    </p>
                </div>
                {error.digest && (
                    <p className="text-xs text-muted-foreground font-mono bg-muted/50 px-3 py-1.5 rounded-lg inline-block">
                        Error ID: {error.digest}
                    </p>
                )}
                <Button onClick={reset} className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                </Button>
            </div>
        </div>
    )
}
