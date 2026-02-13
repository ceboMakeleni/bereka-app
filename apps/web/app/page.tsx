import Link from 'next/link';
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ArrowRight, Code, Zap, ShieldCheck } from "lucide-react";

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-6 h-16 flex items-center border-b">
        <Link className="flex items-center justify-center" href="/">
          <Zap className="h-6 w-6 text-yellow-500 mr-2" />
          <span className="font-bold text-xl">Bereka</span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          {user ? (
            <Link className="text-sm font-medium hover:underline underline-offset-4" href="/dashboard">
              Dashboard
            </Link>
          ) : (
            <>
              <Link className="text-sm font-medium hover:underline underline-offset-4" href="/login">
                Login
              </Link>
              <Link className="text-sm font-medium hover:underline underline-offset-4" href="/signup">
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
                  Micro-tasks powered by Lightning
                </h1>
                <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
                  Earn sats instantly for completing small digital tasks. No minimum withdrawals, no friction.
                </p>
              </div>
              <div className="space-x-4">
                <Link href="/signup">
                  <Button size="lg">Get Started <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </Link>
                <Link href="/dashboard/jobs">
                  <Button variant="outline" size="lg">Browse Tasks</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
        <section className="w-full py-12 md:py-24 lg:py-32 bg-gray-100 dark:bg-gray-800">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <Zap className="h-10 w-10 text-yellow-500 mb-2" />
                  <CardTitle>Instant Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Payments flow directly to your in-app wallet via Lightning Network. Fast and frictionless.
                  </CardDescription>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <ShieldCheck className="h-10 w-10 text-blue-500 mb-2" />
                  <CardTitle>Secure Escrow</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Job creators fund tasks upfront. Funds are locked until work is approved.
                  </CardDescription>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <Code className="h-10 w-10 text-green-500 mb-2" />
                  <CardTitle>Digital Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    From data labeling to code reviews. Find tasks that match your skills.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-gray-500 dark:text-gray-400">© 2025 Bereka. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="/terms">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="/privacy">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  )
}
