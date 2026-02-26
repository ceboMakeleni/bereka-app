import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Zap } from "lucide-react"

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground px-4">
            <div className="text-center space-y-6 max-w-md">
                <div className="w-16 h-16 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                    <Zap className="w-8 h-8 text-primary" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-6xl font-extrabold tracking-tight text-foreground/20">404</h1>
                    <h2 className="text-2xl font-bold tracking-tight">Page not found</h2>
                    <p className="text-muted-foreground text-lg">
                        The page you&apos;re looking for doesn&apos;t exist or has been moved.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <Link href="/dashboard">
                        <Button className="w-full sm:w-auto">Go to Dashboard</Button>
                    </Link>
                    <Link href="/">
                        <Button variant="outline" className="w-full sm:w-auto">Back to Home</Button>
                    </Link>
                </div>
            </div>
        </div>
    )
}
