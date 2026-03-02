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
        const log = createLogger("report-chat-message", actorId);

        const { messageId, reason } = await req.json();

        // --- Input validation ---
        if (!messageId) throw new Error("Missing messageId");
        if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
            throw new Error("Report reason cannot be empty");
        }

        const trimmedReason = reason.trim();
        if (trimmedReason.length > 1000) {
            throw new Error("Report reason exceeds 1000 character limit");
        }

        log.info("Chat message report initiated", { messageId });

        const supabase = createAdminClient();

        // --- Verify message exists and caller is a room participant ---
        const { data: message, error: msgError } = await supabase
            .from("chat_messages")
            .select("id, room_id, sender_id")
            .eq("id", messageId)
            .single();

        if (msgError || !message) {
            throw new Error("Message not found");
        }

        const { data: room, error: roomError } = await supabase
            .from("chat_rooms")
            .select("id, job_id, creator_id, worker_id")
            .eq("id", message.room_id)
            .single();

        if (roomError || !room) {
            throw new Error("Chat room not found");
        }

        if (actorId !== room.creator_id && actorId !== room.worker_id) {
            throw new Error("Unauthorized: you are not a participant in this chat room");
        }

        // --- Cannot report your own messages ---
        if (actorId === message.sender_id) {
            throw new Error("You cannot report your own message");
        }

        // --- Insert report (unique constraint handles duplicates) ---
        const { error: insertError } = await supabase.from("chat_reports").insert({
            message_id: messageId,
            reporter_id: actorId,
            reason: trimmedReason,
            status: "OPEN",
        });

        if (insertError) {
            if (insertError.code === "23505") {
                throw new Error("You have already reported this message");
            }
            throw new Error(`Failed to submit report: ${insertError.message}`);
        }

        log.info("Chat message reported", {
            messageId,
            roomId: room.id,
            jobId: room.job_id,
        });

        // --- Audit trail ---
        await writeAuditLog(supabase, {
            actorId,
            actorRole: "user",
            action: "chat.message_reported",
            resourceType: "chat_message",
            resourceId: messageId,
            details: {
                room_id: room.id,
                job_id: room.job_id,
                reported_sender_id: message.sender_id,
            },
            ipAddress: req.headers.get("x-forwarded-for"),
            userAgent: req.headers.get("user-agent"),
        });

        // --- Function execution log ---
        await logFunctionExecution(supabase, {
            functionName: "report-chat-message",
            actorId,
            status: "success",
            durationMs: Date.now() - startTime,
            requestMeta: getRequestMeta(req),
            responseMeta: { status: 200, messageId },
        });

        return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        const supabase = createAdminClient();

        await logFunctionExecution(supabase, {
            functionName: "report-chat-message",
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
