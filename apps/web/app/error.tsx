"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCw } from "lucide-react"

export default function ErrorPage({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Application error:", error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground px-4">
            <div className="text-center space-y-6 max-w-md">
                <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-destructive" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
                    <p className="text-muted-foreground text-lg">
                        An unexpected error occurred. Don&apos;t worry, your funds are safe.
                    </p>
                </div>
                {error.digest && (
                    <p className="text-xs text-muted-foreground font-mono bg-muted/50 px-3 py-1.5 rounded-lg inline-block">
                        Error ID: {error.digest}
                    </p>
                )}
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <Button onClick={reset} className="gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Try Again
                    </Button>
                    <Button variant="outline" onClick={() => window.location.href = "/dashboard"}>
                        Go to Dashboard
                    </Button>
                </div>
            </div>
        </div>
    )
}
