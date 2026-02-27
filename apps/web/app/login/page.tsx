"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Zap } from "lucide-react"
import { toast } from "sonner"
import { loginSchema, validate } from "@/lib/validations"

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        document.title = "Login — Bereka"
    }, [])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        const result = validate(loginSchema, { email, password })
        if (!result.success) {
            setError(result.error)
            toast.error(result.error)
            return
        }

        setLoading(true)
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        })

        if (error) {
            setError(error.message)
            toast.error(error.message)
            setLoading(false)
        } else {
            toast.success("Logged in successfully!")
            router.push("/dashboard")
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-muted/40">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <div className="flex justify-center mb-4">
                        <Zap className="h-10 w-10 text-yellow-500" />
                    </div>
                    <CardTitle className="text-2xl text-center">Login to Bereka</CardTitle>
                    <CardDescription className="text-center">
                        Enter your email below to login to your account
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin} aria-label="Login form">
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded" role="alert" aria-live="assertive">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" placeholder="m@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-2">
                        <Button className="w-full" type="submit" disabled={loading}>
                            {loading ? "Logging in..." : "Login"}
                        </Button>
                        <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
                            Forgot your password?
                        </Link>
                        <div className="text-sm text-center text-muted-foreground">
                            Don't have an account? <Link href="/signup" className="underline">Sign up</Link>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
