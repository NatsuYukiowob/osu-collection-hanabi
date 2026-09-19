/* Thin same-origin fetch wrapper for this site's own Netlify Functions.
   Ported from catch-tracker's own api.js, minus its apiPost() (this site
   has no login-gated writes yet — v1 is read-only). */
const API_BASE = '/.netlify/functions';

async function apiGet(fn, params) {
    // URLSearchParams stringifies undefined/null to the literal string
    // "undefined"/"null" rather than dropping the key — strip them here so
    // every caller can pass `{foo: maybeUndefined}` directly instead of
    // having to pre-filter.
    let qs = '';
    if (params) {
        const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null));
        const search = new URLSearchParams(clean).toString();
        if (search) qs = '?' + search;
    }
    const res = await fetch(`${API_BASE}/${fn}${qs}`);
    if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
    return res.json();
}
