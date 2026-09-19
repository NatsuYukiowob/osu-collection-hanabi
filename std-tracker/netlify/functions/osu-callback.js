/* Completes the osu! OAuth flow started in osu-login.js. Ported from
   catch-tracker's own osu-replay-callback.js.

   Stores the access + refresh tokens (encrypted — _token-crypto.js) in
   getAuthStore() keyed by user id, so a login-gated feature can call
   osu!'s API again on a later visit without asking for another login every
   time (see _user-auth.js). A signed identity token (_auth-token.js, this
   site's own OSU_AUTH_SECRET) is minted alongside so the browser can prove
   "this request really is user X" without ever holding the real osu!
   token itself.

   `state` carries the return_to path from osu-login.js. */
const { signAuthToken } = require('./_auth-token');
const { encrypt } = require('./_token-crypto');
const { getAuthStore } = require('./_blobs-store');

function fail(returnTo, stage, detail) {
    console.error(`osu-callback failed at "${stage}": ${detail || ''}`);
    const path = returnTo && returnTo.startsWith('/') ? returnTo : '/';
    const sep = path.includes('?') ? '&' : '?';
    return { statusCode: 302, headers: { Location: `${path}${sep}st_login_error=${encodeURIComponent(stage)}` }, body: '' };
}

exports.handler = async (event) => {
    const qs = event.queryStringParameters || {};
    const code = qs.code;
    const returnTo = typeof qs.state === 'string' && qs.state.startsWith('/') ? qs.state : '/';
    if (!code) return fail(returnTo, 'no_code');

    for (const k of ['OSU_LOGIN_CLIENT_ID', 'OSU_LOGIN_CLIENT_SECRET', 'OSU_LOGIN_REDIRECT_URI', 'OSU_AUTH_SECRET', 'TOKEN_ENC_KEY']) {
        if (!process.env[k]) return fail(returnTo, 'env', `${k} is not set`);
    }

    let tokenData;
    try {
        const form = new URLSearchParams({
            client_id: process.env.OSU_LOGIN_CLIENT_ID,
            client_secret: process.env.OSU_LOGIN_CLIENT_SECRET,
            redirect_uri: process.env.OSU_LOGIN_REDIRECT_URI,
            grant_type: 'authorization_code',
            code: String(code),
        });
        const tokenRes = await fetch('https://osu.ppy.sh/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: form.toString(),
        });
        const text = await tokenRes.text();
        if (!tokenRes.ok) return fail(returnTo, 'token_exchange', `${tokenRes.status} ${text.slice(0, 300)}`);
        tokenData = JSON.parse(text);
    } catch (err) {
        return fail(returnTo, 'token_exchange', err.message);
    }

    let me;
    try {
        const meRes = await fetch('https://osu.ppy.sh/api/v2/me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
        });
        if (!meRes.ok) return fail(returnTo, 'me', `${meRes.status}`);
        me = await meRes.json();
    } catch (err) {
        return fail(returnTo, 'me', err.message);
    }

    let signedToken;
    try {
        signedToken = signAuthToken({ id: me.id, username: me.username });

        const store = getAuthStore();
        await store.setJSON(`user-token:${me.id}`, {
            access_token: encrypt(tokenData.access_token),
            refresh_token: encrypt(tokenData.refresh_token),
            expires_at: Date.now() + (tokenData.expires_in - 60) * 1000,
            updatedAt: new Date().toISOString(),
        });
    } catch (err) {
        return fail(returnTo, 'sign_or_store', err.message);
    }

    const params = new URLSearchParams({
        st_login: me.id,
        st_login_name: me.username,
        st_login_token: signedToken,
    });
    const sep = returnTo.includes('?') ? '&' : '?';
    return { statusCode: 302, headers: { Location: `${returnTo}${sep}${params.toString()}` }, body: '' };
};
