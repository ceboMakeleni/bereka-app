import Link from 'next/link';
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ArrowRight, Code, Zap, ShieldCheck, Sparkles, Smartphone, Globe } from "lucide-react";

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex flex-col min-h-screen bg-background overflow-hidden relative selection:bg-primary/30 selection:text-primary">
      {/* Background Gradients */}
      <div className="absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-primary/10 via-background to-background pointer-events-none -z-10" />
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent/5 blur-[120px] pointer-events-none -z-10" />

      <header className="px-6 lg:px-12 h-20 flex items-center border-b border-border/40 bg-background/60 backdrop-blur-xl sticky top-0 z-50 transition-all duration-300">
        <Link className="flex items-center justify-center group" href="/">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center mr-3 shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
            <Zap className="h-5 w-5 text-primary-foreground animate-pulse" />
          </div>
          <span className="font-extrabold text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Bereka</span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6 items-center">
          {user ? (
            <Link href="/dashboard">
              <Button variant="default" className="rounded-full px-6 font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all">
                Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <>
              <Link className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors" href="/login">
                Login
              </Link>
              <Link href="/signup">
                <Button className="rounded-full px-6 font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all bg-gradient-to-r from-primary to-accent hover:opacity-90">
                  Sign Up <Sparkles className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center">
        {/* Hero Section */}
        <section className="w-full py-20 md:py-32 lg:py-40 relative">
          <div className="container px-4 md:px-6 mx-auto relative z-10">
            <div className="flex flex-col items-center space-y-8 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary shadow-sm backdrop-blur-sm">
                <Zap className="mr-2 h-4 w-4" />
                <span>Now live on the Lightning Network</span>
              </div>
              <div className="space-y-4 max-w-4xl">
                <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/60 leading-[1.1]">
                  Micro-tasks powered by <br className="hidden sm:block" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-primary animate-gradient-x">Lightning</span>
                </h1>
                <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl lg:text-2xl leading-relaxed font-medium mt-6">
                  Earn sats instantly for completing small digital tasks. No minimum withdrawals, no friction, absolute freedom.
                </p>
              </div>
              <div className="space-x-4 flex flex-col sm:flex-row gap-4 mt-8">
                <Link href="/signup">
                  <Button size="lg" className="rounded-full h-14 px-8 text-base font-semibold shadow-xl shadow-primary/20 hover:scale-105 transition-all duration-300 w-full sm:w-auto bg-gradient-to-r from-primary to-accent">
                    Start Earning Now <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/dashboard/jobs">
                  <Button variant="outline" size="lg" className="rounded-full h-14 px-8 text-base font-semibold hover:bg-primary/5 border-border shadow-sm hover:scale-105 transition-all duration-300 w-full sm:w-auto bg-background/50 backdrop-blur-sm">
                    Browse Available Tasks
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Section */}
        <section className="w-full py-20 md:py-32 border-t border-border/40 bg-muted/30 relative">
          <div className="container px-4 md:px-6 mx-auto">
            <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Why choose Bereka?</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Built from the ground up to leverage the speed and finality of Bitcoin's Lightning Network.</p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
              {/* Card 1 */}
              <div className="group relative rounded-3xl border border-border/50 bg-card/40 p-8 shadow-sm backdrop-blur-md hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-yellow-600/20 flex items-center justify-center mb-6 border border-yellow-500/20 group-hover:scale-110 transition-transform duration-500">
                    <Zap className="h-7 w-7 text-yellow-500" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3 tracking-tight">Instant Payments</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Payments flow directly to your in-app Lightning wallet the second a task is approved. Withdraw instantly anywhere.
                  </p>
                </div>
              </div>

              {/* Card 2 */}
              <div className="group relative rounded-3xl border border-border/50 bg-card/40 p-8 shadow-sm backdrop-blur-md hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400/20 to-blue-600/20 flex items-center justify-center mb-6 border border-blue-500/20 group-hover:scale-110 transition-transform duration-500">
                    <ShieldCheck className="h-7 w-7 text-blue-500" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3 tracking-tight">Secure Escrow</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Job creators fund tasks upfront. Funds are locked cryptographically in smart ledgers until work is verified.
                  </p>
                </div>
              </div>

              {/* Card 3 */}
              <div className="group relative rounded-3xl border border-border/50 bg-card/40 p-8 shadow-sm backdrop-blur-md hover:shadow-2xl hover:shadow-green-500/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden sm:col-span-2 lg:col-span-1">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400/20 to-green-600/20 flex items-center justify-center mb-6 border border-green-500/20 group-hover:scale-110 transition-transform duration-500">
                    <Globe className="h-7 w-7 text-green-500" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3 tracking-tight">Global Economy</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    No bank accounts needed. From data labeling to code reviews, work for anyone, anywhere, borderless.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full border-t border-border/50 bg-background/80 backdrop-blur-sm py-12 px-6 lg:px-12">
        <div className="container mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight">Bereka</span>
            <span className="text-muted-foreground ml-2 text-sm">© 2026</span>
          </div>
          <nav className="flex gap-6">
            <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" href="/terms">
              Terms of Service
            </Link>
            <Link className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" href="/privacy">
              Privacy Policy
            </Link>
            <a className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              Contact Us
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

