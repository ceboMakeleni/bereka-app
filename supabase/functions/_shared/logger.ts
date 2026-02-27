/**
 * Structured logging utility for Supabase Edge Functions.
 *
 * Outputs JSON-formatted logs compatible with Supabase/GCP Cloud Logging.
 * Each log entry includes function name, actor ID, request ID, severity,
 * timestamp, and arbitrary metadata.
 *
 * Usage:
 *   const log = createLogger('approve-payout', userId);
 *   log.info('Payout initiated', { jobId, amount });
 *   log.error('Payout failed', { error: err.message });
 */

type Severity = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogEntry {
    severity: Severity;
    timestamp: string;
    function_name: string;
    request_id: string;
    actor_id: string | null;
    message: string;
    data?: Record<string, unknown>;
}

interface Logger {
    debug: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
    /** The unique request ID for this logger instance */
    requestId: string;
}

/**
 * Creates a structured logger for an edge function invocation.
 *
 * @param functionName - The name of the edge function (e.g., 'approve-payout')
 * @param actorId - The authenticated user's ID, or null for system/webhook calls
 * @returns A Logger instance with severity-level methods
 */
export function createLogger(
    functionName: string,
    actorId: string | null = null
): Logger {
    const requestId = crypto.randomUUID();

    const log = (
        severity: Severity,
        message: string,
        data?: Record<string, unknown>
    ) => {
        const entry: LogEntry = {
            severity,
            timestamp: new Date().toISOString(),
            function_name: functionName,
            request_id: requestId,
            actor_id: actorId,
            message,
            ...(data && Object.keys(data).length > 0 ? { data } : {}),
        };

        // Route to appropriate console method for Supabase Cloud Logging
        switch (severity) {
            case "ERROR":
                console.error(JSON.stringify(entry));
                break;
            case "WARN":
                console.warn(JSON.stringify(entry));
                break;
            case "DEBUG":
                console.debug(JSON.stringify(entry));
                break;
            default:
                console.log(JSON.stringify(entry));
        }
    };

    return {
        debug: (message, data) => log("DEBUG", message, data),
        info: (message, data) => log("INFO", message, data),
        warn: (message, data) => log("WARN", message, data),
        error: (message, data) => log("ERROR", message, data),
        requestId,
    };
}
