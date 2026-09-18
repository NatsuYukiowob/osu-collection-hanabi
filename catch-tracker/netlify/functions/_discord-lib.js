/* Shared helpers for Catch Tracker's Discord bot — trimmed port of the main
   site's netlify/functions/_discord-lib.js, scoped down to what this bot's
   core commands need (no mappool/collection helpers). Kept as its own copy
   rather than a shared package because each tracker is a separate Netlify
   site/deploy; a future taiko/standard tracker copies this file verbatim
   and only needs to swap MODE_LABEL/API_MODE's single entry. */
const crypto = require('crypto');
const { t } = require('./_discord-i18n');
const { MODE } = require('./_catch-constants');

const PINK = 0xff66aa;

// Interaction / response type numbers.
const T = { PING: 1, COMMAND: 2, COMPONENT: 3, AUTOCOMPLETE: 4 };
const R = { PONG: 1, MESSAGE: 4, DEFERRED_MESSAGE: 5, DEFERRED_UPDATE: 6, UPDATE_MESSAGE: 7, AUTOCOMPLETE: 8 };
const EPHEMERAL = 64;

// This bot is designed to grow into a shared multi-mode bot (one Discord
// application) once taiko/standard trackers exist alongside this one — see
// the memory note on the Discord bot plan. For now only fruits (catch) is
// wired up; MODE_LABEL exists as a map (not a bare string) so adding a
// second mode later is additive, not a rewrite.
const MODE_LABEL = { fruits: 'osu!catch' };
const SITE_MODE = MODE; // 'fruits'

const GRADE_EMOJI = { X: '**SS**', XH: '**SS**', SH: '**S**', S: '**S**', A: 'A', B: 'B', C: 'C', D: 'D', F: '' };
const gradeTag = (rank) => GRADE_EMOJI[rank] != null ? GRADE_EMOJI[rank] : `**${rank || '?'}**`;

// osu! score `mods` (array of strings or {acronym}) -> plain acronym array,
// "CL" (classic) dropped as noise.
function modsList(mods) {
    return (mods || [])
        .map(m => (typeof m === 'string' ? m : m && m.acronym))
        .filter(x => x && x !== 'CL')
        .map(x => String(x).toUpperCase());
}
const modsTag = (mods) => { const l = modsList(mods); return l.length ? `+${l.join('')}` : ''; };

/* --- signature --------------------------------------------------------- */

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function verifySignature(rawBody, signatureHex, timestamp, publicKeyHex) {
    if (!signatureHex || !timestamp || !publicKeyHex) return false;
    try {
        const key = crypto.createPublicKey({
            key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
            format: 'der',
            type: 'spki',
        });
        return crypto.verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, 'hex'));
    } catch {
        return false;
    }
}

/* --- response envelopes ------------------------------------------------ */

const json = (obj, statusCode = 200) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
});

const message = (embed, components) => json({
    type: R.MESSAGE,
    data: { embeds: [].concat(embed).slice(0, 10), components: components || [], allowed_mentions: { parse: [] } },
});

const updateMessage = (embed, components) => json({
    type: R.UPDATE_MESSAGE,
    data: { embeds: [].concat(embed).slice(0, 10), components: components || [], allowed_mentions: { parse: [] } },
});

const ephemeral = (content) => json({
    type: R.MESSAGE,
    data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } },
});

/* --- option access ------------------------------------------------------- */

const optsOf = (interaction) => (interaction.data && interaction.data.options) || [];
const optVal = (options, name) => {
    const o = (options || []).find(x => x.name === name);
    return o ? o.value : undefined;
};
const invokerId = (interaction) =>
    (interaction.member && interaction.member.user && interaction.member.user.id) ||
    (interaction.user && interaction.user.id) || null;

/* --- formatters ---------------------------------------------------------- */

function fmtLen(sec) {
    sec = Math.round(Number(sec) || 0);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
const fmtNum = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-US'));

function ago(iso) {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return '';
    const s = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 2592000) return `${Math.floor(s / 86400)}d`;
    return `${Math.floor(s / 2592000)}mo`;
}

function flagEmoji(code) {
    if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
    const cc = code.toUpperCase();
    return String.fromCodePoint(0x1f1e6 + cc.charCodeAt(0) - 65, 0x1f1e6 + cc.charCodeAt(1) - 65);
}

// osu!'s star-rating difficulty spectrum, as an embed side-stripe colour —
// same anchors as the main site's _discord-lib.js srColor().
function srColor(stars) {
    const s = Number(stars);
    if (!Number.isFinite(s)) return PINK;
    const stops = [
        [0.1, 0x4290fb], [1.25, 0x4fc0ff], [2.0, 0x4fffd5], [2.5, 0x7cff4f],
        [3.3, 0xf6f05c], [4.2, 0xff8068], [4.9, 0xff4e6f], [5.8, 0xc645b8],
        [6.7, 0x6563de], [7.7, 0x18158e], [9.0, 0x000000],
    ];
    if (s <= stops[0][0]) return stops[0][1];
    if (s >= stops[stops.length - 1][0]) return 0x000000;
    for (let i = 0; i < stops.length - 1; i++) {
        const [s0, c0] = stops[i];
        const [s1, c1] = stops[i + 1];
        if (s < s0 || s > s1) continue;
        const frac = (s - s0) / (s1 - s0);
        const lerp = (a, b) => Math.round(a + (b - a) * frac);
        const r = lerp((c0 >> 16) & 255, (c1 >> 16) & 255);
        const g = lerp((c0 >> 8) & 255, (c1 >> 8) & 255);
        const b = lerp(c0 & 255, c1 & 255);
        return (r << 16) | (g << 8) | b;
    }
    return PINK;
}

function rankColor(globalRank) {
    const r = Number(globalRank);
    if (!Number.isFinite(r) || r <= 0) return PINK;
    if (r <= 1000) return 0xffd24a;
    if (r <= 10000) return 0x4fc0ff;
    if (r <= 100000) return 0x7cff4f;
    return 0x9aa0a6;
}

/* --- embed building blocks ------------------------------------------------ */

function osuAuthor(u) {
    if (!u) return undefined;
    const flag = flagEmoji(u.country_code || (u.country && u.country.code));
    return {
        name: `${u.username}${flag ? ' ' + flag : ''}`,
        url: `https://osu.ppy.sh/users/${u.id}/${SITE_MODE}`,
        icon_url: u.avatar_url || undefined,
    };
}

const siteFooter = (extra) => {
    const base = t('site_footer');
    return { text: extra ? `${base} · ${extra}` : base };
};

function originOf(event) {
    const proto = (event.headers && event.headers['x-forwarded-proto']) || 'https';
    const host = (event.headers && event.headers.host) || 'catch-tracker-hanabi.netlify.app';
    return `${proto}://${host}`;
}

/* --- osu! API v2 --------------------------------------------------------- */

// Resolve a username-or-id to a full API v2 user object, scoped to this
// tracker's own mode (fruits).
async function resolveOsuUser(token, nameOrId) {
    const res = await fetch(
        `https://osu.ppy.sh/api/v2/users/${encodeURIComponent(String(nameOrId))}/${SITE_MODE}?key=username`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`osu! API ${res.status}`);
    return res.json();
}

module.exports = {
    PINK, T, R, EPHEMERAL, MODE_LABEL, SITE_MODE,
    gradeTag, modsTag, modsList,
    verifySignature, json, message, updateMessage, ephemeral,
    optsOf, optVal, invokerId,
    fmtLen, fmtNum, ago, flagEmoji, srColor, rankColor,
    osuAuthor, siteFooter, originOf, resolveOsuUser,
};
