"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import Link from "next/link"
import { toast } from "sonner"
import { signupSchema, validate } from "@/lib/validations"

export default function SignupPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [username, setUsername] = useState("")

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const router = useRouter()

    useEffect(() => {
        document.title = "Sign Up — Bereka"
    }, [])

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        // Validate with Zod
        const result = validate(signupSchema, { username, email, password })
        if (!result.success) {
            setError(result.error)
            return
        }

        setLoading(true)
        const supabase = createClient()

        // 1. Sign up with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        })

        if (authError) {
            setError(authError.message)
            setLoading(false)
            return
        }

        const userId = authData.user?.id
        if (!userId) {
            setError("Signup succeeded but no user ID was returned")
            setLoading(false)
            return
        }

        // 2. Create a profile row (triggers `create_user_accounts` to make AVAILABLE + ESCROW accounts)
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: userId,
                username: username || email.split('@')[0],
                role: 'user',
            })

        if (profileError) {
            console.error("Profile creation error:", profileError)
            setError("Account created but profile setup failed: " + profileError.message)
            setLoading(false)
            return
        }

        // 3. Create LNbits wallet via edge function
        let walletCreated = true
        try {
            const { error: walletError } = await supabase.functions.invoke('create-wallet', {
                body: {},
            })
            if (walletError) {
                console.error("Wallet creation warning:", walletError)
                walletCreated = false
            }
        } catch (e) {
            console.error("Wallet creation failed:", e)
            walletCreated = false
        }

        setLoading(false)

        if (walletCreated) {
            toast.success("Account created successfully! Welcome to Bereka.")
        } else {
            toast.warning("Account created, but wallet setup failed. You can retry from Settings.")
        }

        router.refresh()
        router.push('/dashboard')
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Create Account</CardTitle>
                    <CardDescription>Join Bereka and start earning sats</CardDescription>
                </CardHeader>
                <form onSubmit={handleSignup}>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded" role="alert" aria-live="assertive">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="satoshi"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                required
                                minLength={3}
                            />
                            <p className="text-xs text-muted-foreground">
                                Letters, numbers, dashes, and underscores only
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                minLength={8}
                            />
                            <p className="text-xs text-muted-foreground">
                                Minimum 8 characters, 1 uppercase letter, 1 number
                            </p>
                        </div>

                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Creating account...' : 'Sign Up'}
                        </Button>
                        <p className="text-sm text-muted-foreground text-center">
                            Already have an account?{" "}
                            <Link href="/login" className="text-primary hover:underline">
                                Log in
                            </Link>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
