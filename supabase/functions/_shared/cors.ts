/**
 * CORS configuration with origin whitelist.
 * Only requests from allowed origins will receive proper CORS headers.
 */
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://bereka.co.za',
    'https://www.bereka.co.za',
    'https://bereka-app.vercel.app',
];

/**
 * Returns CORS headers with the correct Access-Control-Allow-Origin
 * based on the request's Origin header.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
    };
}

// NOTE: The deprecated wildcard `corsHeaders` export was removed.
// All edge functions must use getCorsHeaders(req) for proper origin checking.
