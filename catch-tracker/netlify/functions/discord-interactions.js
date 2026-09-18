/* Catch Tracker's Discord bot — HTTP Interactions endpoint (no persistent
   gateway), same architecture as the main osu-collection site's own bot
   (netlify/functions/discord-interactions.js there): Discord POSTs every
   slash-command interaction here, we verify the Ed25519 signature (see
   _discord-lib.js), then answer synchronously within the 3s window.

   Scope: this is meant to grow into ONE shared bot across future
   taiko/standard trackers too (not a separate bot per tracker) — see the
   memory note on the Discord bot plan. Only osu!catch exists today, so
   every command is hardcoded to _catch-constants.js's MODE for now; a
   future tracker adds its own mode option value + resolveOsuUser() calls
   rather than restructuring this file. Core command set only (not a port
   of the main bot's full 11 commands): /link /unlink /pp /recent /top
   /replay — the last one is the direct answer to "can Discord show my
   replay?": a score-card embed + a button linking to this site's real
   interactive replay player, since Discord embeds can't host that.

   Endpoint URL (set in the Discord developer portal, once this tracker's
   own Discord Application exists): https://<this-site>.netlify.app/discord
   (see netlify.toml's redirect below).

   Env: DISCORD_PUBLIC_KEY (signature verification). OSU_CLIENT_ID/SECRET
   and NETLIFY_BLOBS_* are already set for the rest of this site. Command
   definitions: scripts/register-discord-commands.mjs — run
   `npm run discord:register` after changing them. */
const { getDiscordBotStore } = require('./_blobs-store');
const { getOsuToken } = require('./_osu-auth');
const { setLocale, t } = require('./_discord-i18n');
const L = require('./_discord-lib');

const { PINK } = L;

/* --- osu! account link (so /pp /recent /top work with no argument) ------ */

async function getLink(discordId) {
    if (!discordId) return null;
    try {
        return await getDiscordBotStore().get(`link:${discordId}`, { type: 'json' });
    } catch {
        return null;
    }
}

async function cmdLink(options, interaction) {
    const name = String(L.optVal(options, 'username') || '').trim();
    if (!name) return L.ephemeral(t('link_need_name'));
    const token = await getOsuToken();
    const u = await L.resolveOsuUser(token, name);
    if (!u) return L.ephemeral(t('user_not_found', { name }));
    await getDiscordBotStore().setJSON(`link:${L.invokerId(interaction)}`, {
        osuUserId: u.id, osuUsername: u.username, linkedAt: new Date().toISOString(),
    });
    return L.ephemeral(t('link_done', { name: u.username, id: u.id }));
}

async function cmdUnlink(interaction) {
    await getDiscordBotStore().delete(`link:${L.invokerId(interaction)}`);
    return L.ephemeral(t('unlink_done'));
}

// The osu! identity a /pp|/recent|/top call should act on: explicit arg
// wins, else the caller's linked account.
async function resolveWho(options, interaction) {
    const arg = String(L.optVal(options, 'username') || '').trim();
    if (arg) return arg;
    const link = await getLink(L.invokerId(interaction));
    return link ? link.osuUsername : null;
}

/* --- /pp ------------------------------------------------------------- */

async function cmdPp(options, interaction) {
    const who = await resolveWho(options, interaction);
    if (!who) return L.ephemeral(t('need_name_or_link'));

    const token = await getOsuToken();
    const u = await L.resolveOsuUser(token, who);
    if (!u) return L.ephemeral(t('user_not_found', { name: who }));
    const s = u.statistics || {};
    const g = s.grade_counts || {};
    const playHours = s.play_time != null ? t('hours', { n: Math.round(s.play_time / 3600).toLocaleString('en-US') }) : '—';

    return L.message({
        author: L.osuAuthor(u),
        title: `${u.username} — osu!catch`,
        url: `https://osu.ppy.sh/users/${u.id}/${L.SITE_MODE}`,
        color: L.rankColor(s.global_rank),
        thumbnail: u.avatar_url ? { url: u.avatar_url } : undefined,
        fields: [
            { name: t('f_pp'), value: s.pp != null ? `${Math.round(s.pp).toLocaleString('en-US')}pp` : '—', inline: true },
            { name: t('f_global_rank'), value: s.global_rank ? `#${L.fmtNum(s.global_rank)}` : '—', inline: true },
            { name: t('f_country_rank', { cc: u.country_code || t('country_word') }), value: s.country_rank ? `#${L.fmtNum(s.country_rank)}` : '—', inline: true },
            { name: t('f_acc'), value: s.hit_accuracy != null ? `${s.hit_accuracy.toFixed(2)}%` : '—', inline: true },
            { name: t('f_playcount'), value: L.fmtNum(s.play_count), inline: true },
            { name: t('f_level'), value: s.level && s.level.current != null ? String(s.level.current) : '—', inline: true },
            { name: t('f_max_combo'), value: L.fmtNum(s.maximum_combo), inline: true },
            { name: t('f_playtime'), value: playHours, inline: true },
            { name: t('f_grades'), value: `SS ${L.fmtNum(g.ss || 0)}  SSH ${L.fmtNum(g.ssh || 0)}  S ${L.fmtNum(g.s || 0)}  SH ${L.fmtNum(g.sh || 0)}  A ${L.fmtNum(g.a || 0)}`, inline: false },
        ],
        footer: L.siteFooter(t('api_v2')),
    });
}

/* --- /recent & /top ---------------------------------------------------- */

function scoreEmbed(score, user) {
    const bs = score.beatmapset || {};
    const bm = score.beatmap || {};
    const modStr = L.modsTag(score.mods);
    const acc = score.accuracy != null ? `${(score.accuracy * 100).toFixed(2)}%` : '—';
    const pp = score.pp != null ? `${Math.round(score.pp)}pp` : (score.passed === false ? t('not_passed') : '—');
    const combo = `${L.fmtNum(score.max_combo)}x${bm.max_combo ? ` / ${L.fmtNum(bm.max_combo)}x` : ''}`;
    const covers = bs.covers || {};
    return {
        author: L.osuAuthor(user),
        title: `${bs.artist || ''} - ${bs.title || ''} [${bm.version || ''}]`.slice(0, 250),
        url: bm.url || (bm.id ? `https://osu.ppy.sh/b/${bm.id}` : undefined),
        description: [
            `${L.gradeTag(score.rank)}${modStr ? ' ' + modStr : ''} · ${acc} · **${pp}**`,
            `${L.fmtNum(score.score)} · ${combo}`,
            `${bm.difficulty_rating != null ? Number(bm.difficulty_rating).toFixed(2) : '?'}★ · ${L.ago(score.created_at)}`,
        ].join('\n'),
        thumbnail: { url: covers['list@2x'] || covers.list || covers.card || undefined },
        color: L.srColor(bm.difficulty_rating),
        footer: L.siteFooter(),
    };
}

async function fetchScores(token, userId, type, limit, includeFails) {
    const p = new URLSearchParams({ mode: L.SITE_MODE, limit: String(limit) });
    if (type === 'recent') p.set('include_fails', includeFails ? '1' : '0');
    const res = await fetch(`https://osu.ppy.sh/api/v2/users/${userId}/scores/${type}?${p}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`osu! API ${res.status}`);
    return res.json();
}

const TOP_PER_PAGE = 5;
const TOP_MAX = 50;

function topScoreEmbed(s, rank) {
    const bs = s.beatmapset || {};
    const bm = s.beatmap || {};
    const covers = bs.covers || {};
    const modStr = L.modsTag(s.mods);
    const acc = s.accuracy != null ? `${(s.accuracy * 100).toFixed(2)}%` : '—';
    const pp = s.pp != null ? `${Math.round(s.pp)}pp` : (s.passed === false ? t('not_passed') : '—');
    return {
        title: `#${rank} · ${bs.artist || ''} - ${bs.title || ''} [${bm.version || ''}]`.slice(0, 250),
        url: bm.url || (bm.id ? `https://osu.ppy.sh/b/${bm.id}` : undefined),
        description: [
            `${L.gradeTag(s.rank)}${modStr ? ' ' + modStr : ''} · ${acc} · **${pp}**`,
            `${bm.difficulty_rating != null ? Number(bm.difficulty_rating).toFixed(2) : '?'}★ · ${L.ago(s.created_at)}`,
        ].join('\n'),
        thumbnail: { url: covers['list@2x'] || covers.list || covers.card || undefined },
        color: L.srColor(bm.difficulty_rating),
    };
}

function topPage(u, scores, page) {
    const total = Math.min(scores.length, TOP_MAX);
    const pages = Math.max(1, Math.ceil(total / TOP_PER_PAGE));
    page = Math.max(0, Math.min(pages - 1, Number(page) || 0));
    const start = page * TOP_PER_PAGE;

    const embeds = scores.slice(start, start + TOP_PER_PAGE).map((s, i) => topScoreEmbed(s, start + i + 1));
    if (embeds[0]) embeds[0].author = L.osuAuthor(u);
    const last = embeds[embeds.length - 1];
    if (last) last.footer = L.siteFooter(`${t('top_title', { name: u.username, mode: 'osu!catch', n: total })} · ${page + 1}/${pages}`);

    const cid = (p) => `top|${u.id}|${Math.max(0, p)}|${encodeURIComponent(u.username)}`;
    const components = [{
        type: 1,
        components: [
            { type: 2, style: 2, label: t('page_prev'), custom_id: cid(page - 1), disabled: page === 0 },
            { type: 2, style: 2, label: t('page_next'), custom_id: cid(page + 1), disabled: page >= pages - 1 },
        ],
    }];
    return { embeds, components };
}

async function cmdRecent(options, interaction) {
    const who = await resolveWho(options, interaction);
    if (!who) return L.ephemeral(t('need_name_or_link'));
    const idx = Math.max(1, Math.min(50, Number(L.optVal(options, 'index')) || 1));

    const token = await getOsuToken();
    const u = await L.resolveOsuUser(token, who);
    if (!u) return L.ephemeral(t('user_not_found', { name: who }));

    const scores = await fetchScores(token, u.id, 'recent', idx, true);
    if (!scores.length) return L.ephemeral(t('recent_none', { name: u.username, mode: 'osu!catch' }));
    const score = scores[Math.min(idx, scores.length) - 1];
    return L.message(scoreEmbed(score, u));
}

async function cmdTop(options, interaction) {
    const who = await resolveWho(options, interaction);
    if (!who) return L.ephemeral(t('need_name_or_link'));
    const idxOpt = L.optVal(options, 'index');

    const token = await getOsuToken();
    const u = await L.resolveOsuUser(token, who);
    if (!u) return L.ephemeral(t('user_not_found', { name: who }));

    if (idxOpt != null) {
        const idx = Math.max(1, Math.min(100, Number(idxOpt) || 1));
        const scores = await fetchScores(token, u.id, 'best', idx, false);
        if (scores.length < idx) return L.ephemeral(t('top_no_nth', { name: u.username, idx, mode: 'osu!catch' }));
        const e = scoreEmbed(scores[idx - 1], u);
        e.title = `#${idx} · ${e.title}`;
        return L.message(e);
    }

    const scores = await fetchScores(token, u.id, 'best', TOP_MAX, false);
    if (!scores.length) return L.ephemeral(t('top_none', { name: u.username, mode: 'osu!catch' }));
    const v = topPage(u, scores, 0);
    return L.message(v.embeds, v.components);
}

/* --- /replay: score-card embed + a link to the real player -------------
   Discord embeds can only show images/video files/text, never an
   interactive page — so this can't play the replay inline. What it CAN do
   is resolve the score, show its stats, and hand back a button straight
   into replay.html?score_id=..&beatmap_id=.., which is genuinely
   interactive (skin, hyperdash effects, plate stacking). */

function parseScoreId(raw) {
    const s = String(raw || '').trim();
    let m = s.match(/\/scores\/(?:fruits\/)?(\d+)/); // osu.ppy.sh/scores/fruits/123 or /scores/123
    if (m) return m[1];
    m = s.match(/[?&]score_id=(\d+)/); // this site's own replay.html?score_id=123
    if (m) return m[1];
    if (/^\d+$/.test(s)) return s;
    return null;
}

async function cmdReplay(options, origin) {
    const scoreId = parseScoreId(L.optVal(options, 'query'));
    if (!scoreId) return L.ephemeral(t('replay_need_query'));

    let data;
    try {
        const r = await fetch(`${origin}/.netlify/functions/score-lookup?score_id=${encodeURIComponent(scoreId)}`);
        if (r.status === 404) return L.ephemeral(t('replay_not_found'));
        if (r.status === 422) return L.ephemeral(t('replay_wrong_mode'));
        if (!r.ok) return L.ephemeral(t('replay_fail'));
        data = await r.json();
    } catch {
        return L.ephemeral(t('replay_fail'));
    }
    if (!data.has_replay) return L.ephemeral(t('replay_no_replay'));

    const name = `${data.artist || ''} - ${data.title || ''}`.trim() || `#${data.beatmapset_id}`;
    const acc = data.accuracy != null ? `${(data.accuracy * 100).toFixed(2)}%` : '—';
    const pp = data.pp != null ? `${Math.round(data.pp)}pp` : '—';
    const modStr = L.modsTag(data.mods);
    const replayUrl = `${origin}/replay.html?score_id=${encodeURIComponent(scoreId)}&beatmap_id=${encodeURIComponent(data.beatmap_id)}`;

    return L.message({
        author: data.username ? {
            name: `${data.username}${L.flagEmoji(data.country_code) ? ' ' + L.flagEmoji(data.country_code) : ''}`,
            url: `https://osu.ppy.sh/users/${data.user_id}/${L.SITE_MODE}`,
            icon_url: data.avatar_url || undefined,
        } : undefined,
        title: `${name}${data.version ? ` [${data.version}]` : ''}`.slice(0, 250),
        url: `https://osu.ppy.sh/b/${data.beatmap_id}`,
        description: `${L.gradeTag(data.rank)}${modStr ? ' ' + modStr : ''} · ${acc} · **${pp}**` + (data.max_combo ? ` · ${L.fmtNum(data.max_combo)}x` : ''),
        color: PINK,
        image: data.beatmapset_id ? { url: `https://assets.ppy.sh/beatmaps/${data.beatmapset_id}/covers/cover.jpg` } : undefined,
        footer: L.siteFooter(data.created_at ? L.ago(data.created_at) : undefined),
    }, [{
        type: 1,
        components: [
            { type: 2, style: 5, label: t('replay_view_btn'), url: replayUrl },
            { type: 2, style: 5, label: t('replay_map_btn'), url: `https://osu.ppy.sh/b/${data.beatmap_id}` },
        ],
    }]);
}

/* --- message component (buttons): only /top pagination for now --------- */

async function handleComponent(interaction) {
    const id = (interaction.data && interaction.data.custom_id) || '';

    if (id.startsWith('top|')) {
        const [, userId, pageS, nameEnc] = id.split('|');
        const username = nameEnc ? decodeURIComponent(nameEnc) : `#${userId}`;
        let scores;
        try {
            const token = await getOsuToken();
            scores = await fetchScores(token, userId, 'best', TOP_MAX, false);
        } catch {
            return L.updateMessage({ title: t('top_none', { name: username, mode: 'osu!catch' }), color: PINK });
        }
        if (!scores || !scores.length) {
            return L.updateMessage({ title: t('top_none', { name: username, mode: 'osu!catch' }), color: PINK });
        }
        const u = { id: userId, username, avatar_url: `https://a.ppy.sh/${userId}` };
        const v = topPage(u, scores, Number(pageS) || 0);
        return L.updateMessage(v.embeds, v.components);
    }

    return L.json({ type: L.R.DEFERRED_UPDATE });
}

/* --- handler ------------------------------------------------------------ */

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

    const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64').toString('utf8')
        : (event.body || '');

    const h = event.headers || {};
    const ok = L.verifySignature(
        rawBody,
        h['x-signature-ed25519'] || h['X-Signature-Ed25519'],
        h['x-signature-timestamp'] || h['X-Signature-Timestamp'],
        process.env.DISCORD_PUBLIC_KEY,
    );
    if (!ok) return { statusCode: 401, body: 'invalid request signature' };

    let interaction;
    try {
        interaction = JSON.parse(rawBody);
    } catch {
        return { statusCode: 400, body: 'bad json' };
    }

    if (interaction.type === L.T.PING) return L.json({ type: L.R.PONG });

    setLocale(interaction.locale);

    const origin = L.originOf(event);
    const name = interaction.data && interaction.data.name;
    const options = L.optsOf(interaction);

    try {
        if (interaction.type === L.T.COMPONENT) return await handleComponent(interaction);

        if (interaction.type === L.T.COMMAND) {
            switch (name) {
                case 'pp': return await cmdPp(options, interaction);
                case 'recent': return await cmdRecent(options, interaction);
                case 'top': return await cmdTop(options, interaction);
                case 'replay': return await cmdReplay(options, origin);
                case 'link': return await cmdLink(options, interaction);
                case 'unlink': return await cmdUnlink(interaction);
                default: return L.ephemeral(t('unknown_command'));
            }
        }

        return L.json({ type: L.R.PONG });
    } catch (err) {
        return L.ephemeral(t('error_generic', { msg: String((err && err.message) || err).slice(0, 200) }));
    }
};
