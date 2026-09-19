/* Kicks off the osu! OAuth authorization-code flow — this site's login.
   Ported from catch-tracker's own osu-replay-login.js, renamed since this
   site never had a replay-only phase to carry legacy naming from. Uses a
   SEPARATE, dedicated osu! OAuth application from the one _osu-auth.js
   uses for client_credentials (that app is shared across every site in
   this repo and has no redirect_uri of its own to register;
   authorization_code needs one bound to THIS site's own domain, so
   sharing would mean fighting over a single callback URL between
   unrelated sites). Scope is "identify public" — "public" lets a future
   login-gated feature call the API as this user (see _user-auth.js), not
   just read their own id.

   `return_to` is carried through as OAuth `state` so login can be
   triggered from any page and land back where the visitor started;
   osu-callback.js validates it's a same-site relative path before
   redirecting there. */
exports.handler = async (event) => {
    const qs = event.queryStringParameters || {};
    const returnTo = typeof qs.return_to === 'string' && qs.return_to.startsWith('/') ? qs.return_to : '/';

    const params = new URLSearchParams({
        client_id: process.env.OSU_LOGIN_CLIENT_ID,
        redirect_uri: process.env.OSU_LOGIN_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify public',
        state: returnTo,
    });

    return {
        statusCode: 302,
        headers: { Location: `https://osu.ppy.sh/oauth/authorize?${params.toString()}` },
        body: '',
    };
};
