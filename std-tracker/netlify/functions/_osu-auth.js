/* Shared osu! API v2 OAuth (client_credentials) helper. Ported verbatim from
   catch-tracker's own _osu-auth.js — this site reuses the SAME
   OSU_CLIENT_ID/OSU_CLIENT_SECRET osu! OAuth application as the main site
   and catch-tracker (client_credentials carries no redirect-URI/domain
   binding, so one app can safely back any number of deployed sites' server-
   side calls). Token is cached in-module so a warm function container
   doesn't re-auth on every request. */
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getOsuToken() {
    if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

    const res = await fetch('https://osu.ppy.sh/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            client_id: process.env.OSU_CLIENT_ID,
            client_secret: process.env.OSU_CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: 'public',
        }),
    });
    if (!res.ok) throw new Error('osu! token request failed');
    const data = await res.json();
    cachedToken = data.access_token;
    cachedTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
}

module.exports = { getOsuToken };
