/**
 * admin-metrics — Multi-route metrics aggregation for the admin dashboard.
 *
 * Routes (GET, admin-only):
 *   ?type=overview   — KPI overview (marketplace + financials + trust/safety)
 *   ?type=funnel     — Marketplace funnel daily series
 *   ?type=financials — Financial daily series
 *   ?type=trust-safety — Trust & safety daily series + latest disputes
 *   ?type=categories — Category weekly performance table
 *   ?type=stuck-jobs — Jobs stuck in FUNDED/IN_PROGRESS/REVIEW > threshold hours
 *   ?type=refresh-views — Trigger materialized view refresh (admin action)
 *
 * Common query params:
 *   start=ISO_DATE  (default: 30 days ago)
 *   end=ISO_DATE    (default: now)
 *   limit=N         (default: 60)
 */

import { getCorsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUser, createAdminClient } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { writeAuditLog, logFunctionExecution, getRequestMeta } from "../_shared/audit.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200, corsHeaders: Record<string, string>) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function parseDate(val: string | null, fallback: Date): string {
    if (!val) return fallback.toISOString();
    const d = new Date(val);
    return isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString();
}

// ─── Route handlers ──────────────────────────────────────────────────────────

async function handleOverview(
    supabase: ReturnType<typeof createAdminClient>,
    start: string,
    end: string,
) {
    const [{ data: marketplace }, { data: financials }, { data: trustSafety }] = await Promise.all([
        supabase.from("v_marketplace_overview").select("*").single(),
        supabase.from("v_financials_overview").select("*").single(),
        supabase.from("v_trust_safety_overview").select("*").single(),
    ]);

    // Recent 14-day funnel series for sparkline
    const { data: series } = await supabase
        .from("v_admin_funnel_daily")
        .select("day, jobs_posted, jobs_completed, gmv_sats, accept_rate_pct, completion_rate_pct")
        .gte("day", start)
        .lte("day", end)
        .order("day", { ascending: true })
        .limit(90);

    return { marketplace, financials, trustSafety, series: series ?? [] };
}

async function handleFunnel(
    supabase: ReturnType<typeof createAdminClient>,
    start: string,
    end: string,
    limit: number,
) {
    const { data, error } = await supabase
        .from("v_admin_funnel_daily")
        .select("*")
        .gte("day", start)
        .lte("day", end)
        .order("day", { ascending: true })
        .limit(limit);

    if (error) throw new Error(`Funnel query failed: ${error.message}`);
    return data ?? [];
}

async function handleFinancials(
    supabase: ReturnType<typeof createAdminClient>,
    start: string,
    end: string,
    limit: number,
) {
    const [{ data: series }, { data: overview }] = await Promise.all([
        supabase
            .from("v_admin_financials_daily")
            .select("*")
            .gte("day", start)
            .lte("day", end)
            .order("day", { ascending: true })
            .limit(limit),
        supabase.from("v_financials_overview").select("*").single(),
    ]);

    return { series: series ?? [], overview };
}

async function handleTrustSafety(
    supabase: ReturnType<typeof createAdminClient>,
    start: string,
    end: string,
    limit: number,
) {
    const [{ data: series }, { data: overview }, { data: recentDisputes }, { data: chatReports }] =
        await Promise.all([
            supabase
                .from("v_admin_trust_safety_daily")
                .select("*")
                .gte("day", start)
                .lte("day", end)
                .order("day", { ascending: true })
                .limit(limit),
            supabase.from("v_trust_safety_overview").select("*").single(),
            // Recent open disputes with job info
            supabase
                .from("disputes")
                .select("id, job_id, reason, status, created_at, jobs(title, budget_sats, creator_id, worker_id)")
                .eq("status", "OPEN")
                .order("created_at", { ascending: false })
                .limit(10),
            // Recent open chat reports
            supabase
                .from("chat_reports")
                .select("id, message_id, reason, status, created_at")
                .eq("status", "OPEN")
                .order("created_at", { ascending: false })
                .limit(10),
        ]);

    return {
        series: series ?? [],
        overview,
        recentDisputes: recentDisputes ?? [],
        chatReports: chatReports ?? [],
    };
}

async function handleCategories(
    supabase: ReturnType<typeof createAdminClient>,
    weeks: number,
) {
    // Aggregate the last N weeks of mv_category_weekly, grouped by category
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);

    const { data, error } = await supabase
        .from("v_admin_category_weekly")
        .select("*")
        .gte("week_start", cutoff.toISOString().slice(0, 10))
        .order("week_start", { ascending: false });

    if (error) throw new Error(`Category query failed: ${error.message}`);

    // Collapse weekly rows into category totals
    const byCategory: Record<string, {
        category: string;
        posted: number;
        accepted: number;
        completed: number;
        avg_budget_sats: number;
        weeks: number;
    }> = {};

    for (const row of data ?? []) {
        if (!byCategory[row.category]) {
            byCategory[row.category] = {
                category: row.category,
                posted: 0,
                accepted: 0,
                completed: 0,
                avg_budget_sats: 0,
                weeks: 0,
            };
        }
        byCategory[row.category].posted += Number(row.posted);
        byCategory[row.category].accepted += Number(row.accepted);
        byCategory[row.category].completed += Number(row.completed);
        byCategory[row.category].avg_budget_sats += Number(row.avg_budget_sats);
        byCategory[row.category].weeks += 1;
    }

    return Object.values(byCategory)
        .map((c) => ({
            ...c,
            avg_budget_sats: c.weeks > 0 ? Math.round(c.avg_budget_sats / c.weeks) : 0,
            accept_rate_pct: c.posted > 0 ? Math.round((c.accepted / c.posted) * 100) : 0,
            completion_rate_pct: c.accepted > 0 ? Math.round((c.completed / c.accepted) * 100) : 0,
        }))
        .sort((a, b) => b.posted - a.posted);
}

async function handleStuckJobs(
    supabase: ReturnType<typeof createAdminClient>,
    staleHours: number,
) {
    const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);

    const { data, error } = await supabase
        .from("jobs")
        .select(
            "id, title, status, budget_sats, category, created_at, updated_at, creator_id, worker_id, " +
            "profiles!jobs_creator_id_fkey(username)"
        )
        .in("status", ["FUNDED", "IN_PROGRESS", "REVIEW"])
        .lt("updated_at", cutoff.toISOString())
        .order("updated_at", { ascending: true })
        .limit(50);

    if (error) throw new Error(`Stuck jobs query failed: ${error.message}`);

    const now = Date.now();
    return (data ?? []).map((job) => ({
        ...job,
        age_hours: Math.round((now - new Date(job.updated_at).getTime()) / 3_600_000),
    }));
}

async function handleRefreshViews(
    supabase: ReturnType<typeof createAdminClient>,
) {
    const { data, error } = await supabase.rpc("refresh_metrics_materialized_views");
    if (error) throw new Error(`MV refresh failed: ${error.message}`);
    return data;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const startTime = Date.now();
    let actorId: string | null = null;

    try {
        // Auth
        const user = await getAuthenticatedUser(req);
        actorId = user.id;
        const log = createLogger("admin-metrics", actorId);

        const supabase = createAdminClient();

        // Admin role check
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", actorId)
            .single();

        if (profileError || !profile || profile.role !== "admin") {
            log.warn("Unauthorized metrics access attempt");
            return json({ error: "Unauthorized: Admin role required" }, 403, corsHeaders);
        }

        // Parse query params
        const url = new URL(req.url);
        const type = url.searchParams.get("type") ?? "overview";
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const start = parseDate(url.searchParams.get("start"), thirtyDaysAgo);
        const end = parseDate(url.searchParams.get("end"), now);
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "90", 10), 365);
        const weeks = Math.min(parseInt(url.searchParams.get("weeks") ?? "8", 10), 52);
        const staleHours = Math.min(parseInt(url.searchParams.get("stale_hours") ?? "48", 10), 720);

        log.info("Admin metrics request", { type, start, end });

        let data: unknown;

        switch (type) {
            case "overview":
                data = await handleOverview(supabase, start.slice(0, 10), end.slice(0, 10));
                break;
            case "funnel":
                data = await handleFunnel(supabase, start.slice(0, 10), end.slice(0, 10), limit);
                break;
            case "financials":
                data = await handleFinancials(supabase, start.slice(0, 10), end.slice(0, 10), limit);
                break;
            case "trust-safety":
                data = await handleTrustSafety(supabase, start.slice(0, 10), end.slice(0, 10), limit);
                break;
            case "categories":
                data = await handleCategories(supabase, weeks);
                break;
            case "stuck-jobs":
                data = await handleStuckJobs(supabase, staleHours);
                break;
            case "refresh-views":
                data = await handleRefreshViews(supabase);
                await writeAuditLog(supabase, {
                    actorId,
                    actorRole: "admin",
                    action: "metrics.views_refreshed",
                    resourceType: "system",
                    resourceId: "materialized_views",
                    ipAddress: req.headers.get("x-forwarded-for"),
                    userAgent: req.headers.get("user-agent"),
                });
                break;
            default:
                return json({ error: `Unknown metrics type: ${type}` }, 400, corsHeaders);
        }

        await logFunctionExecution(supabase, {
            functionName: "admin-metrics",
            actorId,
            status: "success",
            durationMs: Date.now() - startTime,
            requestMeta: { ...getRequestMeta(req), type },
            responseMeta: { status: 200 },
        });

        return json(
            { success: true, type, data, generatedAt: new Date().toISOString() },
            200,
            corsHeaders,
        );
    } catch (error) {
        const supabase = createAdminClient();
        await logFunctionExecution(supabase, {
            functionName: "admin-metrics",
            actorId,
            status: "error",
            durationMs: Date.now() - startTime,
            requestMeta: getRequestMeta(req),
            errorMessage: (error as Error).message,
        });

        return json({ error: (error as Error).message }, 400, corsHeaders);
    }
});
