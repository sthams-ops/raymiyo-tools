// Where the app is running. Works on Vercel, Railway, or any server that sets
// FIELD_HTTPS=1 behind an https address. On a laptop all of these are false.
export const HOSTED = !!(process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.FIELD_HTTPS);
export const HTTPS = HOSTED;
