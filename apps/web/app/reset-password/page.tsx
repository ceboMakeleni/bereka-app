"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Zap, CheckCircle } from "lucide-react"
import { toast } from "sonner"

export default function ResetPasswordPage() {
    const router = useRouter()
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [sessionReady, setSessionReady] = useState(false)

    useEffect(() => {
        // Supabase automatically handles the recovery token from the URL hash
        const supabase = createClient()
        supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setSessionReady(true)
            }
        })
        // Also check if we already have a session (user clicked link)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setSessionReady(true)
        })
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (password !== confirmPassword) {
            toast.error("Passwords do not match")
            return
        }

        if (password.length < 8) {
            toast.error("Password must be at least 8 characters")
            return
        }

        setLoading(true)
        const supabase = createClient()
        const { error } = await supabase.auth.updateUser({ password })

        if (error) {
            toast.error(error.message)
        } else {
            setSuccess(true)
            toast.success("Password updated successfully!")
            setTimeout(() => router.push("/dashboard"), 2000)
        }
        setLoading(false)
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-muted/40 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <div className="flex justify-center mb-4">
                        {success ? (
                            <CheckCircle className="h-10 w-10 text-green-500" />
                        ) : (
                            <Zap className="h-10 w-10 text-yellow-500" />
                        )}
                    </div>
                    <CardTitle className="text-2xl text-center">
                        {success ? "Password Updated" : "Set New Password"}
                    </CardTitle>
                    <CardDescription className="text-center">
                        {success
                            ? "Redirecting you to the dashboard..."
                            : "Enter your new password below"
                        }
                    </CardDescription>
                </CardHeader>
                {!success && (
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            {!sessionReady && (
                                <p className="text-sm text-muted-foreground text-center bg-muted/50 p-3 rounded-lg">
                                    ⏳ Verifying your reset link...
                                </p>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="password">New Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    minLength={8}
                                    placeholder="Minimum 8 characters"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    disabled={!sessionReady}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm Password</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    required
                                    minLength={8}
                                    placeholder="Confirm your password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    disabled={!sessionReady}
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full" type="submit" disabled={loading || !sessionReady}>
                                {loading ? "Updating..." : "Update Password"}
                            </Button>
                        </CardFooter>
                    </form>
                )}
            </Card>
        </div>
    )
}
