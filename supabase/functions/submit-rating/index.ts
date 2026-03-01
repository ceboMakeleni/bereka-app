import { getCorsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUser, createAdminClient } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { writeAuditLog, logFunctionExecution, getRequestMeta } from "../_shared/audit.ts";

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const startTime = Date.now();
    let actorId: string | null = null;

    try {
        const user = await getAuthenticatedUser(req);
        actorId = user.id;
        const log = createLogger("submit-rating", actorId);

        const { jobId, score, comment } = await req.json();

        // --- Input validation ---
        if (!jobId) throw new Error("Missing jobId");
        if (typeof score !== "number" || score < 1 || score > 5) {
            throw new Error("score must be an integer between 1 and 5");
        }
        if (comment !== undefined && comment !== null && typeof comment !== "string") {
            throw new Error("comment must be a string if provided");
        }
        const sanitisedComment: string | null = comment?.trim() || null;

        log.info("Rating submission initiated", { jobId, score });

        const supabase = createAdminClient();

        // --- Fetch the job ---
        const { data: job, error: jobFetchError } = await supabase
            .from("jobs")
            .select("id, status, creator_id, worker_id")
            .eq("id", jobId)
            .single();

        if (jobFetchError || !job) throw new Error("Job not found");

        // --- Job must be COMPLETED ---
        if (job.status !== "COMPLETED") {
            throw new Error(
                `Ratings can only be submitted for completed jobs. Current status: ${job.status}`
            );
        }

        // --- Determine ratee (the other party) ---
        let rateeId: string;

        if (actorId === job.creator_id) {
            // Creator is rating the worker
            if (!job.worker_id) throw new Error("This job has no assigned worker to rate");
            rateeId = job.worker_id;
        } else if (actorId === job.worker_id) {
            // Worker is rating the creator
            rateeId = job.creator_id;
        } else {
            throw new Error("Unauthorized: you were not a party to this job");
        }

        // --- Insert rating (UNIQUE constraint on job_id + rater_id handles duplicates) ---
        const { error: insertError } = await supabase.from("ratings").insert({
            job_id: jobId,
            rater_id: actorId,
            ratee_id: rateeId,
            score,
            comment: sanitisedComment,
        });

        if (insertError) {
            if (insertError.code === "23505") {
                // Unique violation — already rated
                throw new Error("You have already submitted a rating for this job");
            }
            throw new Error(`Failed to save rating: ${insertError.message}`);
        }

        log.info("Rating submitted successfully", {
            jobId,
            rateeId,
            score,
            hasComment: !!sanitisedComment,
        });

        // --- Audit trail ---
        await writeAuditLog(supabase, {
            actorId,
            actorRole: actorId === job.creator_id ? "client" : "worker",
            action: "rating.submitted",
            resourceType: "job",
            resourceId: jobId,
            details: {
                ratee_id: rateeId,
                score,
                has_comment: !!sanitisedComment,
                rater_role: actorId === job.creator_id ? "creator" : "worker",
            },
            ipAddress: req.headers.get("x-forwarded-for"),
            userAgent: req.headers.get("user-agent"),
        });

        // --- Function execution log ---
        await logFunctionExecution(supabase, {
            functionName: "submit-rating",
            actorId,
            status: "success",
            durationMs: Date.now() - startTime,
            requestMeta: getRequestMeta(req),
            responseMeta: { status: 200, jobId, score },
        });

        // --- Non-blocking notification to ratee ---
        try {
            await supabase.functions.invoke("send-notification", {
                body: {
                    type: "RATING_SUBMITTED",
                    recipientUserId: rateeId,
                    jobId,
                },
            });
        } catch (_) {
            /* notification failure is non-blocking */
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        const supabase = createAdminClient();

        await logFunctionExecution(supabase, {
            functionName: "submit-rating",
            actorId,
            status: "error",
            durationMs: Date.now() - startTime,
            requestMeta: getRequestMeta(req),
            errorMessage: (error as Error).message,
        });

        return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
