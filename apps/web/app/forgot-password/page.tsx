"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Zap, ArrowLeft } from "lucide-react"
import { toast } from "sonner"

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const supabase = createClient()
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        })

        if (error) {
            toast.error(error.message)
        } else {
            setSent(true)
            toast.success("Password reset email sent!")
        }
        setLoading(false)
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-muted/40 px-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <div className="flex justify-center mb-4">
                        <Zap className="h-10 w-10 text-yellow-500" />
                    </div>
                    <CardTitle className="text-2xl text-center">Reset Password</CardTitle>
                    <CardDescription className="text-center">
                        {sent
                            ? "Check your email for a password reset link"
                            : "Enter your email and we'll send you a reset link"
                        }
                    </CardDescription>
                </CardHeader>
                {sent ? (
                    <CardContent className="space-y-4 text-center">
                        <p className="text-sm text-muted-foreground">
                            We&apos;ve sent a password reset link to <strong>{email}</strong>.
                            Click the link in the email to set a new password.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Didn&apos;t receive the email? Check your spam folder or try again.
                        </p>
                        <Button variant="outline" onClick={() => setSent(false)} className="w-full">
                            Try another email
                        </Button>
                    </CardContent>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="m@example.com"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col space-y-2">
                            <Button className="w-full" type="submit" disabled={loading}>
                                {loading ? "Sending..." : "Send Reset Link"}
                            </Button>
                        </CardFooter>
                    </form>
                )}
                <div className="px-6 pb-6 text-center">
                    <Link href="/login" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                        <ArrowLeft className="h-3 w-3" />
                        Back to login
                    </Link>
                </div>
            </Card>
        </div>
    )
}
