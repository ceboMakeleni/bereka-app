import { getCorsHeaders } from "../_shared/cors.ts";
import { getAuthenticatedUser, createAdminClient } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { writeAuditLog, logFunctionExecution, getRequestMeta } from "../_shared/audit.ts";

/**
 * Blocklist patterns for PII detection.
 * Matches common phone number formats (SA, international) and email addresses.
 */
const BLOCKLIST_PATTERNS = [
    // South African phone numbers: 0XX XXX XXXX, +27XXXXXXXXX, etc.
    /(?:\+?27|0)\s*\d{2}\s*\d{3}\s*\d{4}/g,
    // International phone patterns: +1-XXX-XXX-XXXX, (XXX) XXX-XXXX, etc.
    /(?:\+\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
    // Email addresses
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

function containsBlocklistedContent(text: string): boolean {
    return BLOCKLIST_PATTERNS.some((pattern) => {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;
        return pattern.test(text);
    });
}

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
        const log = createLogger("send-chat-message", actorId);

        const { roomId, content } = await req.json();

        // --- Input validation ---
        if (!roomId) throw new Error("Missing roomId");
        if (!content || typeof content !== "string" || content.trim().length === 0) {
            throw new Error("Message content cannot be empty");
        }

        const trimmedContent = content.trim();
        if (trimmedContent.length > 2000) {
            throw new Error("Message content exceeds 2000 character limit");
        }

        log.info("Chat message submission started", { roomId });

        const supabase = createAdminClient();

        // --- Verify chat room exists and caller is a participant ---
        const { data: room, error: roomError } = await supabase
            .from("chat_rooms")
            .select("id, job_id, creator_id, worker_id")
            .eq("id", roomId)
            .single();

        if (roomError || !room) {
            throw new Error("Chat room not found");
        }

        if (actorId !== room.creator_id && actorId !== room.worker_id) {
            throw new Error("Unauthorized: you are not a participant in this chat room");
        }

        // --- Blocklist detection ---
        const isFlagged = containsBlocklistedContent(trimmedContent);

        if (isFlagged) {
            log.warn("Message flagged by blocklist", {
                roomId,
                jobId: room.job_id,
            });
        }

        // --- Insert message ---
        const { data: message, error: insertError } = await supabase
            .from("chat_messages")
            .insert({
                room_id: roomId,
                sender_id: actorId,
                content: trimmedContent,
                is_flagged: isFlagged,
            })
            .select("id, content, is_flagged, created_at")
            .single();

        if (insertError) {
            throw new Error(`Failed to send message: ${insertError.message}`);
        }

        log.info("Chat message sent", {
            roomId,
            messageId: message.id,
            isFlagged,
        });

        // --- Audit trail ---
        await writeAuditLog(supabase, {
            actorId,
            actorRole: "user",
            action: "chat.message_sent",
            resourceType: "chat_room",
            resourceId: roomId,
            details: {
                message_id: message.id,
                job_id: room.job_id,
                is_flagged: isFlagged,
            },
            ipAddress: req.headers.get("x-forwarded-for"),
            userAgent: req.headers.get("user-agent"),
        });

        // --- Function execution log ---
        await logFunctionExecution(supabase, {
            functionName: "send-chat-message",
            actorId,
            status: "success",
            durationMs: Date.now() - startTime,
            requestMeta: getRequestMeta(req),
            responseMeta: { status: 200, roomId, messageId: message.id },
        });

        // --- Non-blocking notification to the other participant ---
        const recipientId =
            actorId === room.creator_id ? room.worker_id : room.creator_id;

        try {
            await supabase.functions.invoke("send-notification", {
                body: {
                    type: "NEW_CHAT_MESSAGE",
                    recipientUserId: recipientId,
                    jobId: room.job_id,
                },
            });
        } catch (_) {
            /* notification failure is non-blocking */
        }

        return new Response(
            JSON.stringify({ success: true, message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        const supabase = createAdminClient();

        await logFunctionExecution(supabase, {
            functionName: "send-chat-message",
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
