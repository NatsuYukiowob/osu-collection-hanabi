/* ===== Small helpers ported from the main site's js/quiz.js (osu.js's only
   two external dependencies there) — inlined here since this site doesn't
   load quiz.js. ===== */
function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showShareToast(msg) {
    let toast = document.getElementById('share-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'share-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'share-toast show';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function() { toast.className = 'share-toast'; }, 2500);
}

/* Builds the numbered-button portion of a pagination bar, collapsing long
   runs into a "…" — used by this file, public-collections.js and
   farm-maps.js, all of which can page into the hundreds/thousands and would
   otherwise render one button per page. Keeps first/last page plus a small
   window around the current page always reachable. onClickForPage(i) returns
   the onclick JS for page i (each caller wires it to its own page-load fn). */
function buildPaginationPageButtons(currentPage, totalPages, onClickForPage) {
    const windowSize = 2;
    const pageSet = new Set([0, totalPages - 1]);
    for (let i = currentPage - windowSize; i <= currentPage + windowSize; i++) {
        if (i >= 0 && i < totalPages) pageSet.add(i);
    }
    const sorted = [...pageSet].sort((a, b) => a - b);

    let html = '';
    let prev = null;
    sorted.forEach(i => {
        if (prev !== null && i - prev > 1) {
            html += `<span class="osu-page-ellipsis">…</span>`;
        }
        html += `<button class="osu-page-btn ${i === currentPage ? 'active' : ''}" onclick="${onClickForPage(i)}">${i + 1}</button>`;
        prev = i;
    });
    return html;
}

/* ===== osu! Collection ===== */
const OSU_MODES = ['standard', 'taiko', 'catch', 'mania'];
const OSU_MODE_NAMES = { 0: 'standard', 1: 'taiko', 2: 'catch', 3: 'mania' };
const OSU_MODE_LABELS = ['Standard', 'Taiko', 'Catch', 'Mania'];
// This site's frontend mode keys differ from osu!'s own API/URL mode strings
// (see also FARM_MODE_TO_API in js/farm-maps.js, same mapping).
const OSU_API_MODE = { standard: 'osu', taiko: 'taiko', catch: 'fruits', mania: 'mania' };

// osu! API v2 LanguageEnum id -> flag emoji + i18n key (see
// netlify/functions/osu-beatmapset.js). Names resolve through t() so the
// card badge follows the site UI language; the API's own English name is
// the fallback when a locale is missing the key.
const OSU_LANGUAGES = {
    1:  { flag: '🌐', key: 'lang_unspecified' },
    2:  { flag: '🇬🇧', key: 'lang_english' },
    3:  { flag: '🇯🇵', key: 'lang_japanese' },
    4:  { flag: '🇨🇳', key: 'lang_chinese' },
    5:  { flag: '🎵', key: 'lang_instrumental' },
    6:  { flag: '🇰🇷', key: 'lang_korean' },
    7:  { flag: '🇫🇷', key: 'lang_french' },
    8:  { flag: '🇩🇪', key: 'lang_german' },
    9:  { flag: '🇸🇪', key: 'lang_swedish' },
    10: { flag: '🇪🇸', key: 'lang_spanish' },
    11: { flag: '🇮🇹', key: 'lang_italian' },
    12: { flag: '🇷🇺', key: 'lang_russian' },
    13: { flag: '🇵🇱', key: 'lang_polish' },
    14: { flag: '🏳️', key: 'lang_other' },
};
function osuLangEntry(set) { return set && set.language ? OSU_LANGUAGES[set.language.id] : null; }
function osuLangFlag(set) { const e = osuLangEntry(set); return e ? e.flag : '🌐'; }
function osuLangName(set) {
    const e = osuLangEntry(set);
    if (e) return t(e.key);
    return (set && set.language && set.language.name) || '';
}

/* osu! API v2 genre ids (osu.ppy.sh/docs — Genre). 8 is unused. */
const OSU_GENRES = {
    1: 'genre_unspecified', 2: 'genre_video_game', 3: 'genre_anime', 4: 'genre_rock',
    5: 'genre_pop', 6: 'genre_other', 7: 'genre_novelty', 9: 'genre_hiphop',
    10: 'genre_electronic', 11: 'genre_metal', 12: 'genre_classical', 13: 'genre_folk', 14: 'genre_jazz',
};
function osuGenreName(set) {
    const g = set && set.genre;
    if (!g) return '';
    return OSU_GENRES[g.id] ? t(OSU_GENRES[g.id]) : (g.name || '');
}

/* Collapses an osu! Artist string to its lead artist for the artist filter:
   "Camellia feat. Nanahira" and "ClariS (CV: ...)" both key on the part
   before the qualifier. Deliberately conservative — only strips a trailing
   feat./ft./featuring or (CV: ...), never inner separators like "&", ",",
   or "vs." (a mashup stays its own entry). */
function primaryArtist(artist) {
    let a = (artist || '').trim();
    if (!a) return '';
    a = a.replace(/\s*\((?:CV|cv)[:：][^)]*\)\s*$/, '');
    a = a.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.+$/i, '');
    return a.trim();
}

/* Every artist a set should be findable under: the lead artist (as above)
   plus any name credited after a feat./ft./featuring, split on the safe
   separators only (",", "&", "×", " x "). Deduped. "vs." mashups and
   "(CV: ...)" are still left whole by primaryArtist() — this only expands
   the feat. tail. */
function artistKeys(artist) {
    const raw = (artist || '').trim();
    if (!raw) return [];
    const keys = new Set();
    const lead = primaryArtist(raw);
    if (lead) keys.add(lead);
    const m = raw.match(/\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$/i);
    if (m) {
        const tail = m[1].replace(/\s*\([^)]*\)\s*$/, '');   // drop a trailing "(...)" on the chunk
        for (const part of tail.split(/\s*[,&×]\s*|\s+x\s+/i)) {
            const p = part.trim();
            if (p) keys.add(p);
        }
    }
    return [...keys];
}

const MODE_ICON_PATHS = {
    standard: '<circle cx="50" cy="50" r="41"/><circle cx="50" cy="50" r="22" fill="currentColor" stroke="none"/>',
    taiko: '<circle cx="50" cy="50" r="41"/><circle cx="50" cy="50" r="29"/><line x1="50" y1="21" x2="50" y2="79"/>',
    catch: '<circle cx="50" cy="50" r="41"/><circle cx="50" cy="38" r="7" fill="currentColor" stroke="none"/><circle cx="38" cy="60" r="5.5" fill="currentColor" stroke="none"/><circle cx="62" cy="60" r="5.5" fill="currentColor" stroke="none"/>',
    mania: '<circle cx="50" cy="50" r="41"/><rect x="31" y="39" width="8" height="22" rx="4" fill="currentColor" stroke="none"/><rect x="42" y="31" width="8" height="38" rx="4" fill="currentColor" stroke="none"/><rect x="53" y="31" width="8" height="38" rx="4" fill="currentColor" stroke="none"/><rect x="64" y="39" width="8" height="22" rx="4" fill="currentColor" stroke="none"/>'
};
function modeIconSvg(mode, color) {
    const path = MODE_ICON_PATHS[mode];
    if (!path) return '';
    const style = color ? ` style="color:${color}"` : '';
    return `<svg class="mode-icon-inline"${style} viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6">${path}</svg>`;
}

/* Star-rating colour scale matching osu!'s own beatmap pages (light blue for
   low SR, shifting through green/yellow/red/purple up to near-black for very
   high SR). Stops taken from osu-web's difficulty colour table. */
const STAR_COLOR_STOPS = [
    [0.1, [79, 192, 255]],
    [1.25, [79, 192, 255]],
    [2.0, [79, 255, 213]],
    [2.5, [124, 255, 79]],
    [3.3, [246, 240, 92]],
    [4.2, [255, 128, 104]],
    [4.9, [255, 78, 111]],
    [5.8, [198, 69, 184]],
    [6.7, [101, 99, 222]],
    [7.7, [24, 21, 142]],
    [9.0, [0, 0, 0]],
];
/* osu!'s own colour table runs all the way to near-black at the high-SR end,
   which reads fine on their white beatmap pages but disappears against this
   site's dark card backgrounds. Lift any colour below a minimum luminance by
   mixing it toward white by just enough to hit that floor exactly (mixing is
   linear in each channel, so this ratio is exact, not approximate) — keeps
   the hue direction (still reads as "the dark end") while staying visible. */
function liftForContrast(rgb, minLum = 92) {
    const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    if (lum >= minLum) return rgb;
    const r = (minLum - lum) / (255 - lum);
    return rgb.map(v => v + (255 - v) * r);
}
function starRatingColor(stars) {
    stars = Number(stars) || 0;
    const stops = STAR_COLOR_STOPS;
    if (stars <= 0) return '#888';
    if (stars <= stops[0][0]) return rgbHex(liftForContrast(stops[0][1]));
    for (let i = 1; i < stops.length; i++) {
        if (stars <= stops[i][0]) {
            const [s0, c0] = stops[i - 1];
            const [s1, c1] = stops[i];
            const t = (stars - s0) / (s1 - s0);
            return rgbHex(liftForContrast(c0.map((v, idx) => v + (c1[idx] - v) * t)));
        }
    }
    return rgbHex(liftForContrast(stops[stops.length - 1][1]));
}
function rgbHex(rgb) {
    return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/* Mode icon tinted by star rating, with a native hover tooltip showing the
   exact SR (and optional difficulty name) — mirrors osu!'s own beatmap page.
   Pass `url` to make the icon itself jump straight to that difficulty on
   osu! (stopping the click from also bubbling to the card's own onclick). */
function modeDiffIcon(mode, stars, label, url) {
    const color = starRatingColor(stars);
    const starsStr = (Number(stars) || 0).toFixed(2);
    // nbsp between the value and the star so "5.23 ⭐" never wraps apart.
    const titleText = label ? `${label} ${starsStr} ⭐` : `${starsStr} ⭐`;
    const clickAttr = url ? ` onclick="event.stopPropagation();window.open('${url}','_blank')" style="cursor:pointer"` : '';
    return `<span class="mode-diff-icon" title="${escHtml(titleText)}"${clickAttr}>${modeIconSvg(mode, color)}</span>`;
}
let osuCurrentTab = 'standard';
let osuCurrentAudio = null;
// Persisted across visits so a returning visitor doesn't have to re-lower a
// loud default every time — read once at load, written on every slider move.
const OSU_VOLUME_KEY = 'osu_preview_volume';
let osuVolume = (() => {
    const saved = parseFloat(localStorage.getItem(OSU_VOLUME_KEY));
    return saved >= 0 && saved <= 1 ? saved : 0.4;
})();
// #osu-volume itself only exists once #osu-mini-player is first built
// (ensureOsuMiniPlayer() in playOsuPreview()), where its initial value is
// set inline from osuVolume directly — nothing to sync at load time here.
let osuPage = 0;
let osuSortMode = 'default';
let osuSearchQuery = '';
let osuLangFilter = 'all';     // 'all' | 'unknown' | '<language id>'
let osuGenreFilter = 'all';    // 'all' | 'unknown' | '<genre id>'
let osuSourceFilter = 'all';   // 'all' | 'none' | '<source string>'
let osuArtistFilter = 'all';   // 'all' | '<primary artist string>'
const OSU_PAGE_SIZE = 8;
// Populated by renderOsuCollection() on every render — the current page's
// sets, one representative (hardest-visible-difficulty) beatmap id + mode
// each, for checkCollectionPlayedStatus() to check against. See its own
// comment at the assignment site for why it's per-set, not per-difficulty.
let osuPageCheckTargets = [];
// The current tab+search+filter's full set list (every page, pre-pagination)
// — batchDownloadCollectionView() downloads this, not just the visible page.
let osuCurrentViewSets = [];

function osuAvatarUrl(userId) {
    return `/.netlify/functions/osu-avatar?id=${userId}`;
}

function filterOsuCollection(query) {
    osuSearchQuery = query.trim();
    osuPage = 0;
    renderOsuCollection();
}

function switchOsuSort(mode) {
    osuSortMode = mode;
    osuPage = 0;
    renderOsuCollection();
}

function switchOsuLangFilter(v) {
    osuLangFilter = v;
    osuPage = 0;
    renderOsuCollection();
}

function switchOsuGenreFilter(v) {
    osuGenreFilter = v;
    osuPage = 0;
    renderOsuCollection();
}

function switchOsuSourceFilter(v) {
    osuSourceFilter = v;
    osuPage = 0;
    renderOsuCollection();
}

function switchOsuArtistFilter(v) {
    osuArtistFilter = v;
    osuPage = 0;
    renderOsuCollection();
}

/* Rebuilds #osu-lang-filter's options from the languages present in `sets`
   (+ "all", + "unlabeled" if any set has no language yet), keeping the
   current selection. Called from renderOsuCollection() so it also
   re-localizes on a language switch (refreshDynamicContent -> renderOsuCollection). */
function renderOsuLangFilterOptions(sets) {
    const sel = document.getElementById('osu-lang-filter');
    if (!sel) return;
    const ids = new Set();
    let hasUnknown = false;
    for (const s of sets) {
        if (s.language && s.language.id) ids.add(s.language.id);
        else hasUnknown = true;
    }
    const ordered = [...ids].sort((a, b) => a - b);
    let html = `<option value="all">${t('osu_lang_filter_all')}</option>`;
    for (const id of ordered) {
        const e = OSU_LANGUAGES[id];
        const name = e ? t(e.key) : String(id);
        const flag = e ? e.flag : '🌐';
        html += `<option value="${id}">${flag} ${escHtml(name)}</option>`;
    }
    if (hasUnknown) html += `<option value="unknown">🌐 ${t('lang_unknown')}</option>`;
    if (osuLangFilter !== 'all' && osuLangFilter !== 'unknown' && !ids.has(Number(osuLangFilter))) {
        osuLangFilter = 'all';   // selected language no longer present (tab switch / removal)
    }
    sel.innerHTML = html;
    sel.value = osuLangFilter;
}

/* Same idea as the language filter but for API v2 genre (a fixed enum).
   Hidden entirely when the current tab's sets don't span at least two
   genres — nothing to choose between. */
function renderOsuGenreFilterOptions(sets) {
    const sel = document.getElementById('osu-genre-filter');
    if (!sel) return;
    const ids = new Set();
    let hasUnknown = false;
    for (const s of sets) {
        if (s.genre && s.genre.id) ids.add(s.genre.id);
        else hasUnknown = true;
    }
    if (ids.size + (hasUnknown ? 1 : 0) < 2) {
        sel.style.display = 'none';
        osuGenreFilter = 'all';   // no visible control — don't leave a hidden filter applied
        return;
    }
    sel.style.display = '';
    let html = `<option value="all">${t('osu_genre_filter_all')}</option>`;
    for (const id of [...ids].sort((a, b) => a - b)) {
        const name = OSU_GENRES[id] ? t(OSU_GENRES[id]) : String(id);
        html += `<option value="${id}">${escHtml(name)}</option>`;
    }
    if (hasUnknown) html += `<option value="unknown">${t('lang_unknown')}</option>`;
    if (osuGenreFilter !== 'all' && osuGenreFilter !== 'unknown' && !ids.has(Number(osuGenreFilter))) {
        osuGenreFilter = 'all';
    }
    sel.innerHTML = html;
    sel.value = osuGenreFilter;
}

/* Source is free text with a long tail, so unlike language/genre this list
   is built from whatever's actually in the collection: one option per
   source carrying >=2 maps (rarer ones fold into "all"), most-common first,
   plus "(no source)". Hidden when there's nothing worth filtering by. */
function renderOsuSourceFilterOptions(sets) {
    const sel = document.getElementById('osu-source-filter');
    if (!sel) return;
    const counts = new Map();
    let hasNone = false;
    for (const s of sets) {
        const src = (s.source || '').trim();
        if (src) counts.set(src, (counts.get(src) || 0) + 1);
        else hasNone = true;
    }
    const shown = [...counts.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (shown.length + (hasNone ? 1 : 0) < 2) {
        sel.style.display = 'none';
        osuSourceFilter = 'all';
        return;
    }
    sel.style.display = '';
    // If a filtered-on source has since dropped below the >=2 cutoff, keep
    // it as an option anyway so the active filter still has a matching row.
    if (osuSourceFilter !== 'all' && osuSourceFilter !== 'none'
        && counts.has(osuSourceFilter) && !shown.some(([s]) => s === osuSourceFilter)) {
        shown.push([osuSourceFilter, counts.get(osuSourceFilter)]);
    }
    let html = `<option value="all">${t('osu_source_filter_all')}</option>`;
    for (const [src, n] of shown) html += `<option value="${escHtml(src)}">${escHtml(src)} (${n})</option>`;
    if (hasNone) html += `<option value="none">${t('osu_source_filter_none')}</option>`;
    if (osuSourceFilter !== 'all' && osuSourceFilter !== 'none' && !counts.has(osuSourceFilter)) {
        osuSourceFilter = 'all';
    }
    sel.innerHTML = html;
    sel.value = osuSourceFilter;
}

/* Same build-from-the-collection approach as source, keyed on artistKeys()
   so a set counts under its lead artist AND every feat. name. No "(none)"
   bucket — an osu! set essentially always has an artist. Hidden when fewer
   than two names have >=2 maps. */
function renderOsuArtistFilterOptions(sets) {
    const sel = document.getElementById('osu-artist-filter');
    if (!sel) return;
    const counts = new Map();
    for (const s of sets) {
        for (const a of artistKeys(s.artist)) counts.set(a, (counts.get(a) || 0) + 1);
    }
    const shown = [...counts.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (shown.length < 2) {
        sel.style.display = 'none';
        osuArtistFilter = 'all';
        return;
    }
    sel.style.display = '';
    if (osuArtistFilter !== 'all' && counts.has(osuArtistFilter)
        && !shown.some(([a]) => a === osuArtistFilter)) {
        shown.push([osuArtistFilter, counts.get(osuArtistFilter)]);
    }
    let html = `<option value="all">${t('osu_artist_filter_all')}</option>`;
    for (const [a, n] of shown) html += `<option value="${escHtml(a)}">${escHtml(a)} (${n})</option>`;
    if (osuArtistFilter !== 'all' && !counts.has(osuArtistFilter)) osuArtistFilter = 'all';
    sel.innerHTML = html;
    sel.value = osuArtistFilter;
}

/* Pulls a set's language, genre + source from API v2 (see
   netlify/functions/osu-beatmapset.js). Never throws — a null result just
   means the fields stay unset and the next backfill pass retries. */
async function fetchOsuSetMeta(setId) {
    try {
        const r = await fetch(`/.netlify/functions/osu-beatmapset?id=${setId}`);
        if (!r.ok) return null;
        const d = await r.json();
        return { language: d.language || null, genre: d.genre || null, source: (d.source || '').trim() };
    } catch {
        return null;
    }
}

// Guards backfillOsuLanguages() against overlapping itself or a manual
// refreshAllOsuSets().
let osuMetaBackfillRunning = false;

/* Fills in `language`/`genre`/`source` for collection sets saved before
   this feature existed. Runs a capped, gently-paced batch on page load (see
   js/main.js init) so a large collection tops up over a few visits rather
   than firing hundreds of API calls at once. New adds and "Refresh all"
   fetch the meta inline, so this only ever has old data to catch up on. */
/* Set ids in the collection still missing language/source metadata — the
   scan backfillOsuLanguages() uses, exposed so the Catalog completion panel
   can show "還有 N 個" and decide whether a burst is worth it. */
function osuMetaPendingCount() {
    const col = getOsuCollection();
    const seen = new Set();
    let n = 0;
    for (const mode of OSU_MODES) {
        for (const s of col[mode]) {
            if ((s.language && s.source !== undefined) || seen.has(s.beatmapset_id)) continue;
            seen.add(s.beatmapset_id);
            n++;
        }
    }
    return n;
}

async function backfillOsuLanguages(opts) {
    if (osuMetaBackfillRunning) return false;
    const { max = 24, chunk = 4, pauseMs = 800, onProgress } = opts || {};
    const col = getOsuCollection();
    const seen = new Set();
    const pending = [];
    for (const mode of OSU_MODES) {
        for (const s of col[mode]) {
            // `source` is the newest of the three fields — a set with a
            // language but no `source` key was backfilled before source
            // existed, so it still needs one more pass.
            if ((s.language && s.source !== undefined) || seen.has(s.beatmapset_id)) continue;
            seen.add(s.beatmapset_id);
            pending.push(s.beatmapset_id);
        }
    }
    if (pending.length === 0) return 0;

    osuMetaBackfillRunning = true;
    const batch = pending.slice(0, max);
    try {
        for (let i = 0; i < batch.length; i += chunk) {
            const ids = batch.slice(i, i + chunk);
            const metas = await Promise.all(ids.map(id =>
                fetchOsuSetMeta(id).then(m => ({ id, m }))
            ));
            const fresh = getOsuCollection();
            let changed = false;
            for (const { id, m } of metas) {
                if (!m) continue;
                for (const mode of OSU_MODES) {
                    const set = fresh[mode].find(s => s.beatmapset_id === id);
                    if (set) { set.language = m.language; set.genre = m.genre; set.source = m.source; changed = true; }
                }
            }
            if (changed) saveOsuCollection(fresh);
            if (onProgress) onProgress(Math.min(i + chunk, batch.length), batch.length);
            if (i + chunk < batch.length) await new Promise(res => setTimeout(res, pauseMs));
        }
        renderOsuCollection();
    } finally {
        osuMetaBackfillRunning = false;
    }
    return batch.length;
}

function osuSetMaxRating(set) {
    return Math.max(...set.beatmaps.map(b => b.difficulty_rating));
}

function sortOsuSets(sets) {
    if (osuSortMode === 'rating-desc') return [...sets].sort((a, b) => osuSetMaxRating(b) - osuSetMaxRating(a));
    if (osuSortMode === 'rating-asc') return [...sets].sort((a, b) => osuSetMaxRating(a) - osuSetMaxRating(b));
    return sets;
}

async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function getOsuPassword() { return localStorage.getItem('osu_password_hash'); }

async function setOsuPassword(pw) {
    localStorage.setItem('osu_password_hash', await sha256(pw));
}

function hasOsuPassword() { return !!getOsuPassword(); }

let osuPasswordVerifiedThisSession = false;

async function verifyOsuPassword() {
    if (!hasOsuPassword() || osuPasswordVerifiedThisSession) return true;
    const pw = prompt(t('osu_password_prompt'));
    if (pw === null) return false;
    const hash = await sha256(pw);
    if (hash !== getOsuPassword()) {
        alert(t('osu_password_wrong'));
        return false;
    }
    osuPasswordVerifiedThisSession = true;
    return true;
}

async function setupOsuPassword() {
    if (!await verifyOsuPassword()) return;
    const pw = prompt(t('osu_set_password'));
    if (pw === null || pw === '') return;
    const pw2 = prompt(t('osu_confirm_password'));
    if (pw !== pw2) { alert(t('osu_password_mismatch')); return; }
    await setOsuPassword(pw);
    osuPasswordVerifiedThisSession = true;
    alert(t('osu_password_set'));
}

function copyBeatmapId(setId, event) {
    event.stopPropagation();
    navigator.clipboard.writeText(String(setId)).then(() => {
        const btn = event.currentTarget;
        btn.classList.add('copied');
        btn.innerHTML = icon('check');
        setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = icon('copy'); }, 1200);
    });
}

/* Direct beatmapset download via hinai (mirror.hinamizawa.ai), an open-source
   no-login mirror — osu.ppy.sh's own download requires an account/supporter.
   no_video keeps the .osz small; ?redirect=true has it 307 to the fastest
   working mirror host so the browser just follows it and saves the file. */
function downloadBeatmapset(setId, event) {
    event.stopPropagation();
    window.open(`https://mirror.hinamizawa.ai/d/${setId}?no_video=true&redirect=true`, '_blank');
}

/* Same mirror as downloadBeatmapset(), but fetched as a blob and saved via a
   named <a download> instead of window.open — used by the batch downloader
   below so files land with a readable name and errors/429s can be caught
   instead of silently opening a blocked popup. mirror.hinamizawa.ai sends
   Access-Control-Allow-Origin: * through its whole redirect chain (verified
   against osu.direct and the final S3 host), so this fetch works cross-origin
   with no server-side proxy. */
async function fetchBeatmapsetBlob(setId, filenameBase, retriesLeft = 2) {
    const res = await fetch(`https://mirror.hinamizawa.ai/d/${setId}?no_video=true&redirect=true`);
    if (res.status === 429 && retriesLeft > 0) {
        const wait = Math.min(parseInt(res.headers.get('retry-after') || '3', 10), 15);
        await new Promise(r => setTimeout(r, wait * 1000));
        return fetchBeatmapsetBlob(setId, filenameBase, retriesLeft - 1);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameBase}.osz`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

let osuBatchDownloadActive = false;

let osuBatchDownloadPaused = false;
// Set while paused to the resolver of the in-loop wait promise, so the same
// button's "resume" click can wake the loop back up.
let osuBatchDownloadResumeResolve = null;

/* Downloads every .osz set currently visible in the collection grid — same
   tab + search + filters the user is looking at (osuCurrentViewSets, set by
   renderOsuCollection() before pagination so this covers every page, not
   just the one on screen). Sequential on purpose: osu.direct's own mirror
   caps bursts at 10 req/2s and 120/min, and each file already takes a couple
   seconds to fetch, so one-at-a-time naturally stays under that without extra
   throttling logic — a 429 still gets one retry via fetchBeatmapsetBlob().

   The same button drives all three states (start / pause / resume) — while
   a run is active this function is re-entered by the button's own onclick,
   so it toggles the pause flag instead of starting a second run. Pausing
   only holds the loop *between* files (checked before each fetch starts),
   it never aborts a file that's already downloading. */
async function batchDownloadCollectionView() {
    const status = document.getElementById('osu-batch-dl-status');
    const btn = document.getElementById('osu-batch-dl-btn');

    if (osuBatchDownloadActive) {
        osuBatchDownloadPaused = !osuBatchDownloadPaused;
        if (osuBatchDownloadPaused) {
            if (btn) btn.textContent = t('batch_dl_resume_btn');
        } else {
            if (btn) btn.textContent = t('batch_dl_pause_btn');
            if (osuBatchDownloadResumeResolve) { osuBatchDownloadResumeResolve(); osuBatchDownloadResumeResolve = null; }
        }
        return;
    }

    const sets = osuCurrentViewSets || [];
    if (!sets.length) {
        if (status) { status.innerText = t('batch_dl_empty'); status.style.color = '#ff5252'; }
        return;
    }
    if (!confirm(t('batch_dl_confirm', { n: sets.length }))) return;

    osuBatchDownloadActive = true;
    osuBatchDownloadPaused = false;
    const originalLabel = btn ? btn.textContent : '';
    if (btn) btn.textContent = t('batch_dl_pause_btn');

    let done = 0, failed = 0;
    for (const set of sets) {
        if (osuBatchDownloadPaused) {
            if (status) { status.innerText = t('batch_dl_paused', { done, total: sets.length }); status.style.color = '#f5a623'; }
            await new Promise(resolve => { osuBatchDownloadResumeResolve = resolve; });
        }
        if (status) { status.innerText = t('batch_dl_progress', { done, total: sets.length }); status.style.color = '#c8a2e0'; }
        const name = `${set.artist} - ${set.title}`.replace(/[\\/:*?"<>|]/g, '_').slice(0, 150);
        try {
            await fetchBeatmapsetBlob(set.beatmapset_id, name);
        } catch (e) {
            failed++;
        }
        done++;
    }
    if (status) {
        status.innerText = failed ? t('batch_dl_done_errors', { done, failed }) : t('batch_dl_done', { done });
        status.style.color = failed ? '#ff5252' : '#34d399';
    }
    if (btn) btn.textContent = originalLabel;
    osuBatchDownloadActive = false;
    osuBatchDownloadPaused = false;
}

/* Copy one set's hardest difficulty as a `!mp map <beatmapId> <mode>` line
   for an osu! multiplayer lobby (you host — paste one per round). Wired to
   the small ⚔ button on every collection card. */
function copyMpMap(setId, event) {
    if (event) event.stopPropagation();
    const col = getOsuCollection();
    let set = null;
    for (const m of OSU_MODES) {
        const f = (col[m] || []).find(s => s.beatmapset_id === setId);
        if (f) { set = f; break; }
    }
    if (!set) return;
    const diffs = (set.beatmaps || []).filter(b => b.beatmap_id);
    if (!diffs.length) return;
    const hardest = diffs.slice().sort((a, b) => (a.difficulty_rating || 0) - (b.difficulty_rating || 0)).pop();
    const mode = Number.isInteger(hardest.mode_int) ? hardest.mode_int
        : (Number.isInteger(set.mode) ? set.mode : 0);
    const line = `!mp map ${parseInt(hardest.beatmap_id, 10)} ${mode}`;
    const toast = (msg) => { if (typeof showShareToast === 'function') showShareToast(msg); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(line).then(() => toast(t('mplist_mp_copied')), () => toast(line));
    } else {
        toast(line);
    }
}

// The original local-download detector asked for a *folder* handle (File
// System Access API) to osu! stable's Songs directory — Chrome hard-blocks
// that everywhere under %AppData%, which is exactly where the default
// install puts Songs, so it only ever worked for a custom-path minority.
// Replaced with js/local-db-match.js: a plain single-file upload of osu!
// stable's own "osu!.db" cache (same %AppData% folder, but a single-file
// pick isn't subject to the directory-grant block), parsed client-side for
// beatmapset ids. See isLocalDbMatched() in js/local-db-match.js / [[local-download-scan-2026-09]].

function osuSetVolume(val) {
    osuVolume = parseFloat(val);
    localStorage.setItem(OSU_VOLUME_KEY, String(osuVolume));
    if (osuCurrentAudio && !osuCurrentAudio.ended) osuCurrentAudio.volume = osuVolume;
}

/* Markup for every .osu-play-btn/.games-card-btn: a static play icon, plus
   a hidden-until-.playing 12-bar equalizer (catch-tracker's own preview
   button — catch-tracker/js/common.js previewButton() / catch-tracker/css/
   style.css .icon-eq — ported here to match it exactly). Pure CSS
   transform(scaleY) animation, NOT driven by real audio analysis: plain
   <audio> playback needs no CORS at all (that's only a Web Audio API/
   AnalyserNode requirement), so this is a decorative simulated equalizer
   with zero backend involvement, same as catch-tracker's rationale for
   dropping the real analyser. */
const OSU_PLAY_BARS_COUNT = 12;
function playBtnIcon() {
    return `${icon('play', { filled: true })}<span class="osu-play-bars">${'<i></i>'.repeat(OSU_PLAY_BARS_COUNT)}</span>`;
}

/* Each bar's animation-duration/-delay is a multiple of --beat-s (set
   inline on the <button> via osuPreviewBeatStyle() below), so the whole
   equalizer's bounce rate tracks the specific map's tempo instead of
   pulsing at a fixed rate regardless of BPM — identical formula to
   catch-tracker's previewButton(), including the exaggerated >1 exponent
   (a plain 60/bpm reads as barely different card-to-card) and the clamp
   (this catalog's BPM outliers go up to ~350+, which unclamped would push
   the exponent into an uncomfortably fast flicker). */
const OSU_PREVIEW_REFERENCE_BPM = 150, OSU_PREVIEW_BEAT_EXPONENT = 1.5;
const OSU_PREVIEW_MIN_BEAT_S = 0.12, OSU_PREVIEW_MAX_BEAT_S = 0.9;
function osuPreviewBeatSeconds(bpm) {
    return bpm && bpm > 0
        ? Math.min(OSU_PREVIEW_MAX_BEAT_S, Math.max(OSU_PREVIEW_MIN_BEAT_S, 0.4 * Math.pow(OSU_PREVIEW_REFERENCE_BPM / bpm, OSU_PREVIEW_BEAT_EXPONENT)))
        : 0.4;
}
// Ready-to-splice `style="--beat-s:…s"` attribute for a play-button <button>
// tag. bpm may be null/undefined (falls back to the 0.4s reference beat).
function osuPreviewBeatStyle(bpm) {
    return ` style="--beat-s:${osuPreviewBeatSeconds(bpm).toFixed(4)}s"`;
}

function playOsuPreview(setId, event) {
    event.stopPropagation();

    if (osuCurrentAudio && !osuCurrentAudio.ended) {
        osuCurrentAudio.pause();
        document.querySelectorAll('.osu-play-btn.playing, .games-card-btn.playing').forEach(b => b.classList.remove('playing'));
        if (osuCurrentAudio._setId === setId) { osuCurrentAudio = null; hideOsuMiniPlayer(); return; }
    }

    // Straight at b.ppy.sh, no CORS proxy — a plain <audio> element (no
    // Web Audio graph reading its samples) needs no CORS headers at all.
    const audio = new Audio(`https://b.ppy.sh/preview/${setId}.mp3`);
    audio._setId = setId;
    audio.volume = osuVolume;
    audio.loop = osuPreviewLoop;
    osuCurrentAudio = audio;

    const btn = event.currentTarget;
    btn.classList.add('playing');
    audio.play().catch(() => {});
    showOsuMiniPlayer(osuPreviewItemFromButton(btn, setId));
    audio.addEventListener('timeupdate', updateOsuMiniPlayerProgress);
    audio.addEventListener('loadedmetadata', updateOsuMiniPlayerProgress);
    audio.addEventListener('play', updateOsuMiniPlayerPlayState);
    audio.addEventListener('pause', updateOsuMiniPlayerPlayState);

    audio.onended = () => {
        btn.classList.remove('playing');
        osuCurrentAudio = null;
        hideOsuMiniPlayer();
    };
    audio.onerror = () => {
        btn.classList.remove('playing');
        osuCurrentAudio = null;
        hideOsuMiniPlayer();
    };
}

/* ===== Floating mini-player =====
   Ported from catch-tracker's own bottom-right mini-player (catch-tracker/
   js/common.js ensureMiniPlayer()/showMiniPlayer()) — appears once any
   preview starts: cover/title/artist, play/pause, seek+time, loop, and the
   preview-volume slider (moved in from the old always-on #volume-fab,
   removed 2026-09-13 — see osuSetVolume()). A real transport surface,
   separate from the decorative per-card equalizer above. */
let osuPreviewLoop = false;

// Best-effort title/artist/cover for the mini-player, scraped from the
// clicked button's own card rather than threading it through every one of
// playOsuPreview's 8 call sites (Catalog/Farm/mini-games/gallery/…) — the
// cover URL alone is always derivable from setId, so that part never fails.
function osuPreviewItemFromButton(btn, setId) {
    const card = btn.closest('.osu-card, .gallery-detail-item, .gq-card') || btn.parentElement;
    let title = '', artist = '';
    if (card) {
        const titleEl = card.querySelector('.osu-card-title, .gallery-detail-item-title, .map-title');
        const artistEl = card.querySelector('.osu-card-artist, .map-artist');
        if (titleEl) title = titleEl.textContent.trim();
        if (artistEl) artist = artistEl.textContent.trim();
    }
    return { title, artist, cover: `https://assets.ppy.sh/beatmaps/${setId}/covers/card.jpg` };
}

function ensureOsuMiniPlayer() {
    if (document.getElementById('osu-mini-player')) return;
    const el = document.createElement('div');
    el.id = 'osu-mini-player';
    el.className = 'osu-mini-player';
    el.hidden = true;
    el.innerHTML = `
        <div class="osu-mini-player-top">
            <img class="osu-mini-player-cover" id="osu-mini-player-cover" alt="">
            <div class="osu-mini-player-info">
                <div class="osu-mini-player-title" id="osu-mini-player-title"></div>
                <div class="osu-mini-player-artist" id="osu-mini-player-artist"></div>
            </div>
            <button type="button" class="osu-mini-player-icon-btn" id="osu-mini-player-loop" title="${escHtml(t('mini_player_loop'))}">${icon('repeat')}</button>
            <button type="button" class="osu-mini-player-icon-btn" id="osu-mini-player-close" title="${escHtml(t('mini_player_close'))}">${icon('x')}</button>
        </div>
        <div class="osu-mini-player-controls">
            <button type="button" class="osu-mini-player-playpause" id="osu-mini-player-playpause" title="${escHtml(t('mini_player_playpause'))}">${icon('pause', { filled: true })}</button>
            <input type="range" id="osu-mini-player-seek" min="0" max="1" step="0.001">
            <span class="osu-mini-player-time" id="osu-mini-player-time">0:00 / 0:00</span>
        </div>
        <div class="osu-mini-player-volume-row">
            <span class="osu-mini-player-icon-btn osu-mini-player-volume-icon">${icon('volume2')}</span>
            <input type="range" id="osu-volume" min="0" max="1" step="0.05" value="${osuVolume}" oninput="osuSetVolume(this.value)" data-i18n-title="volume_fab_title" title="調整預覽音量" aria-label="調整預覽音量">
        </div>`;
    document.body.appendChild(el);

    document.getElementById('osu-mini-player-close').addEventListener('click', () => {
        if (osuCurrentAudio) {
            osuCurrentAudio.pause();
            osuCurrentAudio = null;
        }
        document.querySelectorAll('.osu-play-btn.playing, .games-card-btn.playing').forEach(b => b.classList.remove('playing'));
        hideOsuMiniPlayer();
    });
    document.getElementById('osu-mini-player-playpause').addEventListener('click', () => {
        if (!osuCurrentAudio) return;
        if (osuCurrentAudio.paused) osuCurrentAudio.play().catch(() => {});
        else osuCurrentAudio.pause();
    });
    document.getElementById('osu-mini-player-loop').addEventListener('click', () => {
        osuPreviewLoop = !osuPreviewLoop;
        if (osuCurrentAudio) osuCurrentAudio.loop = osuPreviewLoop;
        document.getElementById('osu-mini-player-loop').classList.toggle('active', osuPreviewLoop);
    });
    document.getElementById('osu-mini-player-seek').addEventListener('input', (e) => {
        if (osuCurrentAudio && osuCurrentAudio.duration) osuCurrentAudio.currentTime = parseFloat(e.target.value) * osuCurrentAudio.duration;
    });
}

function fmtOsuPreviewTime(s) {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function updateOsuMiniPlayerPlayState() {
    const btn = document.getElementById('osu-mini-player-playpause');
    if (!btn || !osuCurrentAudio) return;
    btn.innerHTML = icon(osuCurrentAudio.paused ? 'play' : 'pause', { filled: true });
}

function updateOsuMiniPlayerProgress() {
    if (!osuCurrentAudio) return;
    const seek = document.getElementById('osu-mini-player-seek');
    const time = document.getElementById('osu-mini-player-time');
    if (!seek || !time) return;
    const duration = osuCurrentAudio.duration || 0;
    const current = osuCurrentAudio.currentTime || 0;
    if (document.activeElement !== seek) seek.value = duration ? String(current / duration) : '0';
    time.textContent = `${fmtOsuPreviewTime(current)} / ${fmtOsuPreviewTime(duration)}`;
}

function showOsuMiniPlayer(item) {
    ensureOsuMiniPlayer();
    document.getElementById('osu-mini-player').hidden = false;
    document.getElementById('osu-mini-player-cover').src = item.cover || '';
    document.getElementById('osu-mini-player-title').textContent = item.title || '';
    document.getElementById('osu-mini-player-artist').textContent = item.artist || '';
    document.getElementById('osu-mini-player-seek').value = '0';
    document.getElementById('osu-mini-player-time').textContent = '0:00 / 0:00';
    document.getElementById('osu-mini-player-loop').classList.toggle('active', osuPreviewLoop);
    updateOsuMiniPlayerPlayState();
}

function hideOsuMiniPlayer() {
    const el = document.getElementById('osu-mini-player');
    if (el) el.hidden = true;
}

function getOsuFavorites() {
    try { return JSON.parse(localStorage.getItem('osu_favorites')) || []; }
    catch { return []; }
}

function saveOsuFavorites(favs) {
    localStorage.setItem('osu_favorites', JSON.stringify(favs));
}

function isOsuFavorited(setId) {
    return getOsuFavorites().includes(setId);
}

async function toggleOsuFavorite(setId, event) {
    event.stopPropagation();
    if (!await verifyOsuPassword()) return;
    const favs = getOsuFavorites();
    const idx = favs.indexOf(setId);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(setId);
    saveOsuFavorites(favs);
    renderOsuCollection();
}

/* ===== Custom collection categories =====
   Generalizes the single "Favorites" tag into user-defined named tags,
   many-to-many with beatmaps. Carried along by the JSON export/import
   (exportOsuCollection/importOsuCollection) and by shareOsuCollectionLink/
   checkImportFromHash (see mergeIncomingCategories) so a category survives
   a move to another device either way — but still deliberately excluded
   from the public gallery publish (js/public-collections.js), since a
   category is personal organization, not something worth exposing as
   public metadata about a published collection. */
/* Locale-aware sort so categories display in a sensible order regardless
   of what script their names happen to be in: 'ja' collation gives real
   alphabetical order for Latin names, gojuon (あいうえお) order for kana,
   and falls back to code-point order for kanji/hanzi (no single "correct"
   order exists there without per-character reading data, so this is
   intentionally just "consistent", not linguistically meaningful). */
function sortCategoriesByName(cats) {
    return [...cats].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

function getOsuCategories() {
    try { return sortCategoriesByName(JSON.parse(localStorage.getItem('osu_categories')) || []); }
    catch { return []; }
}

function saveOsuCategories(cats) {
    localStorage.setItem('osu_categories', JSON.stringify(cats));
}

function getOsuCategoryMembers() {
    try { return JSON.parse(localStorage.getItem('osu_category_members')) || {}; }
    catch { return {}; }
}

function saveOsuCategoryMembers(members) {
    localStorage.setItem('osu_category_members', JSON.stringify(members));
}

function getCategoryMemberIds(categoryId) {
    return getOsuCategoryMembers()[categoryId] || [];
}

/* Refreshes the modal's list too when the mutating action was triggered
   from inside it (openCategoryManageModal), so rename/delete stay in sync
   with the modal view without every caller needing to remember to do it. */
function refreshCategoryManageModalIfOpen() {
    const modal = document.getElementById('category-manage-modal');
    if (modal && modal.style.display !== 'none') renderCategoryManageList();
}

async function renameOsuCategory(categoryId, event) {
    if (event) event.stopPropagation();
    if (!await verifyOsuPassword()) return;
    const cats = getOsuCategories();
    const cat = cats.find(c => c.id === categoryId);
    if (!cat) return;
    const name = prompt(t('osu_category_rename_prompt'), cat.name);
    if (!name || !name.trim()) return;
    cat.name = name.trim();
    saveOsuCategories(cats);
    refreshCategoryManageModalIfOpen();
    renderOsuCollection();
}

async function deleteOsuCategory(categoryId, event) {
    if (event) event.stopPropagation();
    if (!await verifyOsuPassword()) return;
    if (!confirm(t('osu_category_delete_confirm'))) return;
    saveOsuCategories(getOsuCategories().filter(c => c.id !== categoryId));
    const members = getOsuCategoryMembers();
    delete members[categoryId];
    saveOsuCategoryMembers(members);
    removeSmartCategory(categoryId);
    if (osuCurrentTab === categoryId) osuCurrentTab = 'standard';
    refreshCategoryManageModalIfOpen();
    renderOsuCollection();
}

/* ===== Smart (dynamic) categories =====
   A category built from a Catalog facet (catalogCreateCollectionFromFacet)
   can remember that facet so newly-ranked sets matching it get pulled in
   later with one click, instead of the category being a frozen snapshot —
   the "static vs live" gap vs osu!Collector's fixed collections. Purely
   client-side: { [catId]: { facet:{type,value}, mode:'<int>'|'', label,
   lastSyncAt, lastCount } } in localStorage; refresh re-runs the same
   catalog-list query the create button used. */
function getSmartCategories() {
    try { return JSON.parse(localStorage.getItem('osu_smart_categories')) || {}; }
    catch { return {}; }
}
function saveSmartCategories(map) {
    try { localStorage.setItem('osu_smart_categories', JSON.stringify(map)); } catch (e) {}
}
function getSmartCategory(catId) { return getSmartCategories()[catId] || null; }
function setSmartCategory(catId, data) {
    const map = getSmartCategories();
    map[catId] = { ...(map[catId] || {}), ...data };
    saveSmartCategories(map);
}
function removeSmartCategory(catId) {
    const map = getSmartCategories();
    if (map[catId]) { delete map[catId]; saveSmartCategories(map); }
}

/* Banner shown at the top of a smart category's grid: what facet drives it,
   when it last synced, and a one-click refresh. */
function smartCategoryBannerHtml() {
    if (OSU_MODES.includes(osuCurrentTab) || osuCurrentTab === 'favorites' || osuCurrentTab === 'all') return '';
    const meta = getSmartCategory(osuCurrentTab);
    if (!meta || !meta.facet) return '';
    const when = meta.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleDateString() : '—';
    return `<div class="smart-cat-banner">
        <span class="smart-cat-label">${icon('refreshCw')}<span>${t('smart_cat_badge')} · ${escHtml(meta.label || '')}</span></span>
        <span class="smart-cat-when">${t('smart_cat_last_sync', { d: when })}</span>
        <button class="btn btn-sm" id="smart-cat-refresh-btn" onclick="refreshSmartCategory('${osuCurrentTab}')">${t('smart_cat_refresh_btn')}</button>
        <button class="smart-cat-detach" onclick="detachSmartCategory('${osuCurrentTab}')" title="${t('smart_cat_detach')}">${icon('x')}</button>
    </div>`;
}

function detachSmartCategory(catId) {
    if (!confirm(t('smart_cat_detach_confirm'))) return;
    removeSmartCategory(catId);
    renderOsuCollection();
}

/* Re-run the stored facet query and merge any set ids the category doesn't
   already have. Reuses applyImportedCollections (fetches each new set, files
   it under the same-named category). */
async function refreshSmartCategory(catId) {
    const meta = getSmartCategory(catId);
    if (!meta || !meta.facet) return;
    const cat = getOsuCategories().find(c => c.id === catId);
    if (!cat) return;
    const btn = document.getElementById('smart-cat-refresh-btn');
    const setBtn = (txt, dis) => { if (btn) { btn.textContent = txt; btn.disabled = !!dis; } };

    const params = new URLSearchParams({ limit: '300', sort: 'ranked_desc' });
    params.set(meta.facet.type, meta.facet.value);
    if (meta.mode) params.set('mode', String(meta.mode));

    try {
        setBtn(t('gallery_loading'), true);
        const res = await fetch(`/.netlify/functions/catalog-list?${params}`);
        if (!res.ok) throw new Error('bad response');
        const data = await res.json();
        const ids = (data.items || []).map(x => x.id).filter(Boolean);
        const have = new Set(getCategoryMemberIds(catId));
        const fresh = ids.filter(id => !have.has(id));

        if (fresh.length === 0) {
            setSmartCategory(catId, { lastSyncAt: new Date().toISOString(), lastCount: ids.length });
            if (typeof showShareToast === 'function') showShareToast(t('smart_cat_no_new'));
            renderOsuCollection();
            return;
        }
        const report = await applyImportedCollections(
            [{ name: cat.name, entries: fresh.map(id => ({ setId: id })) }],
            (msg) => setBtn(msg, true),
        );
        setSmartCategory(catId, { lastSyncAt: new Date().toISOString(), lastCount: ids.length });
        if (typeof showShareToast === 'function') showShareToast(t('smart_cat_synced', { n: report.addedSets }));
    } catch (e) {
        console.error('Smart category refresh failed:', e);
        if (typeof showShareToast === 'function') showShareToast(t('catalog_load_fail'));
    } finally {
        renderOsuCollection();
    }
}

/* ===== Category tabs row (between the mode-tabs row and the search bar) =====
   A second .osu-mode-tabs-style row, one plain clickable .osu-tab per
   category — clicking reuses switchOsuTab() directly (it doesn't care
   whether "mode" is a real mode key or a category id, it just toggles
   .active and re-renders). Doesn't wrap; overflow scrolls horizontally,
   including via a plain vertical mouse wheel (initCategoryTabsWheelScroll)
   since most mice don't have a horizontal scroll axis. Add/rename/delete
   live in the ⚙ manage modal (openCategoryManageModal below), not here —
   this row is pure navigation. */
function renderOsuCategoryTabsRow() {
    const row = document.getElementById('osu-category-tabs-row');
    if (!row) return;
    const cats = getOsuCategories();
    row.innerHTML = cats.map(c =>
        `<button class="osu-tab ${c.id === osuCurrentTab ? 'active' : ''}" data-mode="${c.id}" onclick="switchOsuTab('${c.id}', this)">${icon('tag', { extraClass: 'icon-label-gap' })}${escHtml(c.name)}</button>`
    ).join('');
    initCategoryTabsWheelScroll();
}

function initCategoryTabsWheelScroll() {
    const row = document.getElementById('osu-category-tabs-row');
    if (!row || row.dataset.wheelBound) return;
    row.dataset.wheelBound = '1';
    row.addEventListener('wheel', e => {
        if (e.deltaY === 0) return;
        e.preventDefault();
        row.scrollLeft += e.deltaY;
    }, { passive: false });
}

/* ===== Category manage modal (⚙ button next to the select dropdown) =====
   Add/rename/delete all live here — reuses the .pp-calc-modal-* shell
   (see gallery-detail-modal for the other user of that pattern). */
function openCategoryManageModal() {
    const modal = document.getElementById('category-manage-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    renderCategoryManageList();
}

function closeCategoryManageModal() {
    const modal = document.getElementById('category-manage-modal');
    if (modal) modal.style.display = 'none';
}

function renderCategoryManageList() {
    const listEl = document.getElementById('osu-category-manage-list');
    if (!listEl) return;
    const cats = getOsuCategories();
    listEl.innerHTML = cats.length === 0
        ? `<p class="osu-empty">${t('osu_category_picker_empty')}</p>`
        : cats.map(c => `
            <div class="osu-category-manage-item">
                <span class="osu-category-manage-name">${escHtml(c.name)}</span>
                <span class="osu-category-manage-actions">
                    <button class="osu-cat-rename" onclick="renameOsuCategory('${c.id}', event)" title="${t('osu_category_rename_title')}">${icon('pencil')}</button>
                    <button class="osu-cat-delete" onclick="deleteOsuCategory('${c.id}', event)" title="${t('osu_category_delete_title')}">${icon('trash2')}</button>
                </span>
            </div>`).join('');
}

async function addOsuCategoryFromModal() {
    if (!await verifyOsuPassword()) return;
    const input = document.getElementById('osu-category-manage-input');
    const name = input.value.trim();
    if (!name) return;
    const cats = getOsuCategories();
    cats.push({ id: crypto.randomUUID(), name });
    saveOsuCategories(cats);
    input.value = '';
    renderCategoryManageList();
    renderOsuCollection();
}

/* ===== Per-card category assignment popover =====
   A single document.body-level singleton (same lazy-singleton pattern as
   #share-toast, see showShareToast() above) rather than a per-card popover,
   because .osu-card has overflow:hidden (load-bearing for the cover-image
   hover-zoom) which would clip anything absolutely-positioned inside it,
   and renderOsuCollection() replaces #osu-collection's innerHTML on every
   re-render (including the one triggered by ticking a checkbox), which
   would destroy a popover embedded in a card mid-interaction. */
function ensureCategoryPickerEl() {
    let el = document.getElementById('osu-category-picker');
    if (!el) {
        el = document.createElement('div');
        el.id = 'osu-category-picker';
        el.className = 'osu-category-picker';
        document.body.appendChild(el);
    }
    return el;
}

let osuCategoryPickerSetId = null;

function toggleCategoryPicker(setId, event) {
    event.stopPropagation();
    const el = ensureCategoryPickerEl();
    if (osuCategoryPickerSetId === setId && el.classList.contains('open')) {
        closeCategoryPicker();
        return;
    }
    osuCategoryPickerSetId = setId;
    renderCategoryPickerContent(setId);
    // .osu-category-picker is position:fixed, so getBoundingClientRect()'s
    // viewport-relative coordinates are exactly what's needed here — adding
    // window.scrollY/scrollX (which is correct for position:absolute) double-
    // counts the scroll offset and drifts the popover away from the button
    // the further down the page you've scrolled.
    const r = event.currentTarget.getBoundingClientRect();
    el.style.top = `${r.bottom + 6}px`;
    el.style.left = `${Math.min(r.left, window.innerWidth - 220)}px`;
    el.classList.add('open');
    document.addEventListener('click', onCategoryPickerOutsideClick);
    document.addEventListener('keydown', onCategoryPickerEscape);
}

function closeCategoryPicker() {
    const el = document.getElementById('osu-category-picker');
    if (el) el.classList.remove('open');
    osuCategoryPickerSetId = null;
    document.removeEventListener('click', onCategoryPickerOutsideClick);
    document.removeEventListener('keydown', onCategoryPickerEscape);
}

function onCategoryPickerOutsideClick(e) {
    if (!e.target.closest('#osu-category-picker') && !e.target.closest('.osu-category-btn')) closeCategoryPicker();
}

function onCategoryPickerEscape(e) {
    if (e.key === 'Escape') closeCategoryPicker();
}

function renderCategoryPickerContent(setId) {
    const el = document.getElementById('osu-category-picker');
    const cats = getOsuCategories();
    if (cats.length === 0) {
        el.innerHTML = `<div class="osu-category-picker-empty">${t('osu_category_picker_empty')}</div>`;
        return;
    }
    const members = getOsuCategoryMembers();
    el.innerHTML = `<div class="osu-category-picker-title">${t('osu_category_picker_title')}</div>` +
        cats.map(c => `
        <label class="osu-category-picker-item">
            <input type="checkbox" ${(members[c.id] || []).includes(setId) ? 'checked' : ''} onchange="toggleCategoryMembership('${c.id}', ${setId})">
            <span>${escHtml(c.name)}</span>
        </label>`).join('');
}

async function toggleCategoryMembership(categoryId, setId) {
    if (!await verifyOsuPassword()) { renderCategoryPickerContent(setId); return; }
    const members = getOsuCategoryMembers();
    const arr = members[categoryId] || (members[categoryId] = []);
    const idx = arr.indexOf(setId);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(setId);
    saveOsuCategoryMembers(members);
    renderCategoryPickerContent(setId);
    renderOsuCollection();
}

function getOsuCollection() {
    try {
        return JSON.parse(localStorage.getItem('osu_collection')) || { standard: [], taiko: [], catch: [], mania: [] };
    } catch { return { standard: [], taiko: [], catch: [], mania: [] }; }
}

function saveOsuCollection(col) {
    localStorage.setItem('osu_collection', JSON.stringify(col));
}

/* The old whole-header cover carousel + the ambient particle/glow layer
   were removed in the 2026 visual redesign (docs/visual-redesign-spec.md
   §6.5/§7). The collection page's framed hero (updateCollectionHeroV2) is
   the only place cover art appears now. */

// Bumped whenever the exported shape changes in a way that matters for
// import-time compatibility decisions — not enforced as a hard gate (older
// exports with no schemaVersion at all are still accepted, see importOsuCollection),
// just carried along so a future incompatible format has something to check.
// v2: sets carry optional `language`/`genre` (osu! API v2). Purely additive —
// v1 exports import fine and get backfilled on later visits.
const OSU_EXPORT_SCHEMA_VERSION = 2;

function exportOsuCollection() {
    const data = {
        schemaVersion: OSU_EXPORT_SCHEMA_VERSION,
        collection: getOsuCollection(),
        favorites: getOsuFavorites(),
        categories: getOsuCategories(),
        categoryMembers: getOsuCategoryMembers(),
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `osu-collection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showShareToast(t('osu_export_done'));
}

/* Drops any categoryMembers entries that reference a category id not present
   in `categories`, or a beatmapset id not present in `collection` — an
   import built by hand, from an older export, or from a partially-edited
   file could otherwise leave orphaned references that the category picker/
   tabs would silently choke on. De-dupes category ids too, keeping the
   first occurrence (a hand-edited file is the realistic way to end up with
   duplicates; a normal export never does). */
function sanitizeImportedCategoryData(collection, categories, categoryMembers) {
    const validSetIds = new Set(OSU_MODES.flatMap(m => (collection[m] || []).map(s => s.beatmapset_id)));
    const seenIds = new Set();
    const cleanCategories = categories.filter(c => {
        if (!c || typeof c.id !== 'string' || typeof c.name !== 'string') return false;
        if (seenIds.has(c.id)) return false;
        seenIds.add(c.id);
        return true;
    });
    const cleanMembers = {};
    for (const catId of seenIds) {
        const ids = Array.isArray(categoryMembers[catId]) ? categoryMembers[catId] : [];
        const filtered = ids.filter(id => validSetIds.has(id));
        if (filtered.length) cleanMembers[catId] = filtered;
    }
    return { categories: cleanCategories, categoryMembers: cleanMembers };
}

async function importOsuCollection(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!await verifyOsuPassword()) { event.target.value = ''; return; }

    let data;
    try {
        const text = await file.text();
        data = JSON.parse(text);
    } catch (e) {
        console.error('Import failed (not valid JSON):', e);
        alert(t('osu_import_fail_json'));
        event.target.value = '';
        return;
    }
    if (!data || typeof data !== 'object' || !data.collection || !OSU_MODES.every(m => Array.isArray(data.collection[m]))) {
        console.error('Import failed (missing/invalid collection field)');
        alert(t('osu_import_fail_format'));
        event.target.value = '';
        return;
    }

    try {
        saveOsuCollection(data.collection);
        if (Array.isArray(data.favorites)) saveOsuFavorites(data.favorites);

        const rawCategories = Array.isArray(data.categories) ? data.categories : [];
        const rawMembers = (data.categoryMembers && typeof data.categoryMembers === 'object' && !Array.isArray(data.categoryMembers))
            ? data.categoryMembers : {};
        const { categories, categoryMembers } = sanitizeImportedCategoryData(data.collection, rawCategories, rawMembers);
        saveOsuCategories(categories);
        saveOsuCategoryMembers(categoryMembers);

        renderOsuCollection();
        showShareToast(t('osu_import_done'));
    } catch (e) {
        console.error('Import failed while applying data:', e);
        alert(t('osu_import_fail'));
    } finally {
        event.target.value = '';
    }
}

/* ===== Collection diff — compare an old exportOsuCollection() JSON backup
   against the current collection =====
   Purely a read: never touches localStorage, so unlike importOsuCollection
   this doesn't need verifyOsuPassword(). Reuses the same export file shape
   (same validation as importOsuCollection) so any backup a user already has
   from the "下載收藏成 JSON 備份檔" button works as-is. */
function diffOsuCollections(oldCol, newCol) {
    const result = { added: [], removed: [] };
    for (const mode of OSU_MODES) {
        const oldIds = new Set((oldCol[mode] || []).map(s => s.beatmapset_id));
        const newIds = new Set((newCol[mode] || []).map(s => s.beatmapset_id));
        (newCol[mode] || []).forEach(s => { if (!oldIds.has(s.beatmapset_id)) result.added.push(s); });
        (oldCol[mode] || []).forEach(s => { if (!newIds.has(s.beatmapset_id)) result.removed.push(s); });
    }
    return result;
}

function collectionCompareRowHtml(set, sign) {
    return `<div class="collection-compare-row ${sign > 0 ? 'added' : 'removed'}">
        <span class="collection-compare-sign">${sign > 0 ? '+' : '−'}</span>
        <span class="collection-compare-title">${escHtml(set.title || ('#' + set.beatmapset_id))}</span>
        <span class="collection-compare-artist">${escHtml(set.artist || '')}</span>
    </div>`;
}

function renderCollectionCompareResult(diff) {
    const body = document.getElementById('collection-compare-body');
    if (!body) return;
    if (diff.added.length === 0 && diff.removed.length === 0) {
        body.innerHTML = `<p class="osu-empty">${t('collection_compare_no_diff')}</p>`;
        return;
    }
    body.innerHTML = `
        <div class="collection-compare-summary">
            <span class="collection-compare-added-count">+${diff.added.length}</span>
            <span class="collection-compare-removed-count">−${diff.removed.length}</span>
        </div>
        <div class="collection-compare-list">
            ${diff.added.map(s => collectionCompareRowHtml(s, 1)).join('')}
            ${diff.removed.map(s => collectionCompareRowHtml(s, -1)).join('')}
        </div>`;
}

async function compareOsuCollectionFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const body = document.getElementById('collection-compare-body');
    document.getElementById('collection-compare-modal').style.display = 'flex';
    body.innerHTML = `<p class="osu-empty">${t('gallery_loading')}</p>`;

    let data;
    try {
        const text = await file.text();
        data = JSON.parse(text);
    } catch (e) {
        body.innerHTML = `<p class="osu-empty">${t('osu_import_fail_json')}</p>`;
        event.target.value = '';
        return;
    }
    if (!data || typeof data !== 'object' || !data.collection || !OSU_MODES.every(m => Array.isArray(data.collection[m]))) {
        body.innerHTML = `<p class="osu-empty">${t('osu_import_fail_format')}</p>`;
        event.target.value = '';
        return;
    }

    const diff = diffOsuCollections(data.collection, getOsuCollection());
    renderCollectionCompareResult(diff);
    event.target.value = '';
}

function closeCollectionCompareModal() {
    document.getElementById('collection-compare-modal').style.display = 'none';
}

/* ===== Export to osu!'s own collection.db =====
   Binary format per ppy's "Legacy database file structure" docs (also used
   by community tools like osu-db and osu!collection exporter): int32
   version, int32 collection count, then per collection an osu!-string name
   + int32 beatmap count + that many osu!-string MD5 hashes. The "osu!
   string" encoding (0x00 for empty, else 0x0b + ULEB128 byte-length + UTF-8
   bytes) is the same one used across osu!'s other binary formats (replays,
   osu!.db), not something specific to collections.
   The site's own collection only stores the trimmed API fields it actually
   renders (js/osu.js addOsuBeatmap) — never the file MD5 collection.db
   needs to identify a specific difficulty — so that has to be fetched
   per-beatmap at export time via the same get_beatmaps proxy used
   elsewhere, chunked to avoid firing hundreds of requests at once. */
function writeUleb128(bytes, value) {
    do {
        let byte = value & 0x7f;
        value >>>= 7;
        if (value !== 0) byte |= 0x80;
        bytes.push(byte);
    } while (value !== 0);
}

function writeOsuDbString(bytes, str) {
    if (!str) { bytes.push(0x00); return; }
    const utf8 = Array.from(new TextEncoder().encode(str));
    bytes.push(0x0b);
    writeUleb128(bytes, utf8.length);
    bytes.push(...utf8);
}

function writeInt32LE(bytes, value) {
    bytes.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff);
}

function buildCollectionDb(collectionsMap) {
    const bytes = [];
    writeInt32LE(bytes, 20220301); // just needs to look like a recent client version
    writeInt32LE(bytes, collectionsMap.size);
    for (const [name, hashSet] of collectionsMap) {
        writeOsuDbString(bytes, name);
        writeInt32LE(bytes, hashSet.size);
        for (const md5 of hashSet) writeOsuDbString(bytes, md5);
    }
    return new Uint8Array(bytes);
}

function readUleb128(view, offset) {
    let result = 0, shift = 0, pos = offset;
    for (;;) {
        const byte = view.getUint8(pos++);
        result |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
    }
    return { value: result, next: pos };
}

function readOsuDbString(view, offset) {
    const marker = view.getUint8(offset);
    if (marker === 0x00) return { value: '', next: offset + 1 };
    const { value: len, next } = readUleb128(view, offset + 1);
    const bytes = new Uint8Array(view.buffer, view.byteOffset + next, len);
    return { value: new TextDecoder('utf-8').decode(bytes), next: next + len };
}

function parseCollectionDb(buffer) {
    const view = new DataView(buffer);
    let offset = 4; // skip version
    const count = view.getInt32(offset, true); offset += 4;
    const collections = new Map();
    for (let i = 0; i < count; i++) {
        const nameRes = readOsuDbString(view, offset); offset = nameRes.next;
        const beatmapCount = view.getInt32(offset, true); offset += 4;
        const hashes = new Set();
        for (let j = 0; j < beatmapCount; j++) {
            const hashRes = readOsuDbString(view, offset); offset = hashRes.next;
            if (hashRes.value) hashes.add(hashRes.value);
        }
        collections.set(nameRes.value, hashes);
    }
    return collections;
}

function openCollectionDbModal() {
    const status = document.getElementById('collection-db-status');
    status.innerText = '';
    status.style.color = '';
    document.getElementById('collection-db-merge-input').value = '';
    document.getElementById('collection-io-import-input').value = '';
    document.getElementById('collection-db-modal').style.display = 'flex';
}
function closeCollectionDbModal() {
    document.getElementById('collection-db-modal').style.display = 'none';
}

async function exportOsuCollectionDb() {
    const status = document.getElementById('collection-db-status');
    const col = getOsuCollection();
    const allSets = OSU_MODES.flatMap(m => col[m]);
    if (allSets.length === 0) {
        status.innerText = t('collection_db_empty');
        status.style.color = '#ff5252';
        return;
    }

    const setById = new Map(allSets.map(s => [s.beatmapset_id, s]));
    const allBeatmapIds = [...new Set(allSets.flatMap(s => s.beatmaps.map(b => b.beatmap_id)))];
    const md5Map = {};
    const CHUNK = 10;

    status.style.color = '#c8a2e0';
    for (let i = 0; i < allBeatmapIds.length; i += CHUNK) {
        status.innerText = t('collection_db_fetching', { done: i, total: allBeatmapIds.length });
        const chunk = allBeatmapIds.slice(i, i + CHUNK);
        const results = await Promise.all(chunk.map(id => osuFetch(`b=${id}`).catch(() => null)));
        results.forEach((r, idx) => {
            const bm = r && r[0];
            if (bm && bm.file_md5) md5Map[chunk[idx]] = bm.file_md5;
        });
    }

    const generated = new Map();
    const addToCollection = (name, beatmapsetIds, catId) => {
        if (!name) return;
        if (!generated.has(name)) generated.set(name, new Set());
        const bucket = generated.get(name);
        const diffFilter = practiceDiffFilter(catId);
        beatmapsetIds.forEach(setId => {
            const set = setById.get(setId);
            if (!set) return;
            // Restrict to the practice-picked diffs only if this set actually
            // has one of them cached — otherwise fall back to all diffs so a
            // stale cache can't silently drop the whole set.
            const restrict = diffFilter && set.beatmaps.some(b => diffFilter.has(b.beatmap_id)) ? diffFilter : null;
            set.beatmaps.forEach(b => {
                if (restrict && !restrict.has(b.beatmap_id)) return;
                if (md5Map[b.beatmap_id]) bucket.add(md5Map[b.beatmap_id]);
            });
        });
    };

    getOsuCategories().forEach(c => {
        const members = getOsuCategoryMembers()[c.id] || [];
        if (members.length) addToCollection(c.name, members, c.id);
    });
    const favorites = getOsuFavorites();
    if (favorites.length) addToCollection(t('osu_fav'), favorites);
    if (generated.size === 0) addToCollection(t('collection_db_all_name'), allSets.map(s => s.beatmapset_id));

    let finalMap = generated;
    const mergeFile = document.getElementById('collection-db-merge-input').files[0];
    if (mergeFile) {
        try {
            const existing = parseCollectionDb(await mergeFile.arrayBuffer());
            for (const [name, hashes] of generated) existing.set(name, hashes);
            finalMap = existing;
        } catch (e) {
            console.error('Failed to parse uploaded collection.db, exporting without merge:', e);
        }
    }

    const bytes = buildCollectionDb(finalMap);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'collection.db';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    status.innerText = t('collection_db_done');
    status.style.color = '#34d399';
}

/* ===== .osdb (Collection Manager / osu!Stats format) =====
   Piotrekol's Collection Manager format. Unlike collection.db it stores the
   beatmap + beatmapset ids (plus metadata), so Collection Manager can match
   it in-game *without* the per-difficulty MD5 that collection.db needs — and
   it's the usual way whole collections get shared. Field order below is from
   Collection Manager's OsdbCollectionHandler, "o!dm8" (full) variant.

   NOTE: .osdb strings are plain .NET BinaryWriter strings — a 7-bit
   (ULEB128) byte length then UTF-8, 0x00 for an empty string — NOT the
   0x0b-prefixed "osu! string" writeOsuDbString() uses. From o!dm7 on,
   everything after the leading version string is gzipped (fflate). */
const OSDB_VERSIONS = { 'o!dm': 1, 'o!dm2': 2, 'o!dm3': 3, 'o!dm4': 4, 'o!dm5': 5, 'o!dm6': 6, 'o!dm7': 7, 'o!dm8': 8, 'o!dm7min': 1007, 'o!dm8min': 1008 };
const OSDB_WRITE_VERSION = 'o!dm8';

function writeNetString(bytes, str) {
    const utf8 = str ? new TextEncoder().encode(str) : new Uint8Array(0);
    writeUleb128(bytes, utf8.length);
    for (let i = 0; i < utf8.length; i++) bytes.push(utf8[i]);
}
function readNetString(view, offset) {
    const { value: len, next } = readUleb128(view, offset);
    const bytes = new Uint8Array(view.buffer, view.byteOffset + next, len);
    return { value: new TextDecoder('utf-8').decode(bytes), next: next + len };
}
function writeFloat64LE(bytes, value) {
    const u8 = new Uint8Array(8);
    new DataView(u8.buffer).setFloat64(0, value, true);
    for (let i = 0; i < 8; i++) bytes.push(u8[i]);
}
function triggerBytesDownload(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* collections: [{ name, onlineId?, beatmaps: [{ mapId, mapSetId, artist, title, diff, md5, mode, stars }] }] */
function buildOsdb(collections, editor) {
    const p = [];
    writeNetString(p, OSDB_WRITE_VERSION);
    writeFloat64LE(p, Date.now() / 86400000 + 25569); // OLE Automation date (days since 1899-12-30)
    writeNetString(p, editor || 'osu! collection');
    writeInt32LE(p, collections.length);
    for (const c of collections) {
        writeNetString(p, c.name || '');
        writeInt32LE(p, Number.isInteger(c.onlineId) ? c.onlineId : -1);
        const maps = c.beatmaps || [];
        writeInt32LE(p, maps.length);
        for (const m of maps) {
            writeInt32LE(p, m.mapId || 0);
            writeInt32LE(p, m.mapSetId || 0);
            writeNetString(p, m.artist || '');
            writeNetString(p, m.title || '');
            writeNetString(p, m.diff || '');
            writeNetString(p, m.md5 || '');
            writeNetString(p, '');               // user comment
            p.push((m.mode || 0) & 0xff);        // play mode
            writeFloat64LE(p, m.stars || 0);     // star rating
        }
        writeInt32LE(p, 0);                      // hash-only beatmap count
    }
    writeNetString(p, 'By Piotrekol');

    const gz = fflate.gzipSync(new Uint8Array(p));
    const head = [];
    writeNetString(head, OSDB_WRITE_VERSION);    // uncompressed leading version string
    const out = new Uint8Array(head.length + gz.length);
    out.set(head, 0);
    out.set(gz, head.length);
    return out;
}

/* -> [{ name, beatmaps: [{ mapId, mapSetId, mode }] }] (metadata/md5 are read past but dropped) */
function parseOsdb(buffer) {
    let view = new DataView(buffer);
    const head = readNetString(view, 0);
    const versionString = head.value;
    const fileVersion = OSDB_VERSIONS[versionString];
    if (!fileVersion) throw new Error('OSDB_BAD_VERSION:' + versionString);

    let cur;
    if (fileVersion >= 7) {
        const inflated = fflate.gunzipSync(new Uint8Array(buffer, head.next));
        view = new DataView(inflated.buffer, inflated.byteOffset, inflated.byteLength);
        cur = readNetString(view, 0).next;      // skip inner version string
    } else {
        cur = head.next;
    }

    const isMin = versionString.endsWith('min');
    const isFull = !isMin;
    cur += 8;                                    // save date (f64)
    cur = readNetString(view, cur).next;         // editor
    const count = view.getInt32(cur, true); cur += 4;

    const collections = [];
    for (let i = 0; i < count; i++) {
        const nameRes = readNetString(view, cur); cur = nameRes.next;
        if (fileVersion >= 7) cur += 4;          // online id
        const nBeatmaps = view.getInt32(cur, true); cur += 4;
        const beatmaps = [];
        for (let j = 0; j < nBeatmaps; j++) {
            const mapId = view.getInt32(cur, true); cur += 4;
            let mapSetId = 0;
            if (fileVersion >= 2) { mapSetId = view.getInt32(cur, true); cur += 4; }
            if (!isMin) {
                cur = readNetString(view, cur).next; // artist
                cur = readNetString(view, cur).next; // title
                cur = readNetString(view, cur).next; // diff
            }
            cur = readNetString(view, cur).next;     // md5
            if (fileVersion >= 4) cur = readNetString(view, cur).next; // user comment
            let mode = 0;
            if (fileVersion >= 8 || (fileVersion >= 5 && isFull)) { mode = view.getUint8(cur); cur += 1; }
            if (fileVersion >= 8 || (fileVersion >= 6 && isFull)) cur += 8; // star rating (f64)
            beatmaps.push({ mapId, mapSetId, mode });
        }
        if (fileVersion >= 3) {
            const nHashes = view.getInt32(cur, true); cur += 4;
            for (let j = 0; j < nHashes; j++) cur = readNetString(view, cur).next;
        }
        collections.push({ name: nameRes.value, beatmaps });
    }
    return collections;
}

/* Export the collection as an .osdb (Collection Manager / osu!Stats). Unlike
   the collection.db export this needs no network calls — .osdb carries the
   ids the site already has. One .osdb collection per category (+ Favorites),
   or a single "osu!收藏" collection if there are no categories. */
async function exportOsuOsdb() {
    const status = document.getElementById('collection-db-status');
    const col = getOsuCollection();
    const allSets = OSU_MODES.flatMap(m => col[m]);
    if (allSets.length === 0) {
        if (status) { status.innerText = t('collection_db_empty'); status.style.color = '#ff5252'; }
        return;
    }
    const setById = new Map(allSets.map(s => [s.beatmapset_id, s]));

    const osdbCollections = [];
    const addColl = (name, setIds, catId) => {
        const beatmaps = [];
        const diffFilter = practiceDiffFilter(catId);
        setIds.forEach(id => {
            const set = setById.get(id);
            if (!set) return;
            const all = set.beatmaps || [];
            const restrict = diffFilter && all.some(b => diffFilter.has(b.beatmap_id)) ? diffFilter : null;
            all.forEach(b => {
                if (restrict && !restrict.has(b.beatmap_id)) return;
                beatmaps.push({
                    mapId: b.beatmap_id || 0,
                    mapSetId: set.beatmapset_id,
                    artist: set.artist || '',
                    title: set.title || '',
                    diff: b.version || '',
                    md5: '',
                    mode: Number.isInteger(b.mode_int) ? b.mode_int : (set.mode || 0),
                    stars: b.difficulty_rating || 0,
                });
            });
        });
        if (beatmaps.length) osdbCollections.push({ name, beatmaps });
    };

    const members = getOsuCategoryMembers();
    getOsuCategories().forEach(c => { if ((members[c.id] || []).length) addColl(c.name, members[c.id], c.id); });
    const favorites = getOsuFavorites();
    if (favorites.length) addColl(t('osu_fav'), favorites);
    if (osdbCollections.length === 0) addColl(t('collection_db_all_name'), allSets.map(s => s.beatmapset_id));

    const editor = (getLoggedInOsuUser && getLoggedInOsuUser() && getLoggedInOsuUser().username) || 'osu! collection';
    try { if (typeof fflate === 'undefined') await ensureFflate(); }
    catch (e) { if (status) { status.innerText = t('cdn_lib_fail'); status.style.color = '#ff5252'; } return; }
    triggerBytesDownload(buildOsdb(osdbCollections, editor), 'osu!collection.osdb');
    if (status) { status.innerText = t('collection_io_osdb_done'); status.style.color = '#34d399'; }
}

/* Import an in-game collection.db OR a shared/osu!Stats .osdb onto the site.
   Never destructive — only adds sets you don't already have, and merges into
   a same-named category (creating it if missing). collection.db entries are
   MD5 hashes so they need a lookup pass (h=<md5> via the osu proxy); .osdb
   carries beatmapset ids directly and skips straight to the set fetch. */
async function importOsuGameCollection(event) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (!file) return;
    if (!await verifyOsuPassword()) { fileInput.value = ''; return; }

    const status = document.getElementById('collection-db-status');
    const setStatus = (msg, color) => { if (status) { status.innerText = msg; status.style.color = color || '#c8a2e0'; } };

    try {
        const buffer = await file.arrayBuffer();
        const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(6, buffer.byteLength)));
        const isOsdb = magic.startsWith('o!dm') || file.name.toLowerCase().endsWith('.osdb');

        let named = [];      // [{ name, entries: [{ setId, mode }] }]
        let unresolved = 0;

        if (isOsdb) {
            try { if (typeof fflate === 'undefined') await ensureFflate(); }
            catch (e) { setStatus(t('cdn_lib_fail'), '#ff5252'); fileInput.value = ''; return; }
            let parsed;
            try {
                parsed = parseOsdb(buffer);
            } catch (e) {
                if (String(e.message).startsWith('OSDB_BAD_VERSION')) { setStatus(t('collection_io_osdb_unsupported'), '#ff5252'); fileInput.value = ''; return; }
                throw e;
            }
            named = parsed.map(c => ({
                name: c.name,
                entries: c.beatmaps.filter(b => b.mapSetId > 0).map(b => ({ setId: b.mapSetId, mode: b.mode })),
            }));
        } else {
            let dbMap;
            try { dbMap = parseCollectionDb(buffer); }
            catch (e) { setStatus(t('collection_io_bad_file'), '#ff5252'); fileInput.value = ''; return; }

            const allHashes = [...new Set([...dbMap.values()].flatMap(s => [...s]))];
            const hashToSet = {};
            const HCHUNK = 10;
            for (let i = 0; i < allHashes.length; i += HCHUNK) {
                setStatus(t('collection_db_fetching', { done: i, total: allHashes.length }));
                const chunk = allHashes.slice(i, i + HCHUNK);
                const results = await Promise.all(chunk.map(h => osuFetch(`h=${h}`).catch(() => null)));
                results.forEach((r, idx) => {
                    const bm = r && r[0];
                    if (bm && bm.beatmapset_id) hashToSet[chunk[idx]] = { setId: parseInt(bm.beatmapset_id), mode: parseInt(bm.mode) };
                });
            }
            named = [...dbMap.entries()].map(([name, hashes]) => {
                const entries = [];
                hashes.forEach(h => { if (hashToSet[h]) entries.push(hashToSet[h]); else unresolved++; });
                return { name, entries };
            });
        }

        const report = await applyImportedCollections(named, msg => setStatus(msg));
        report.unresolved += unresolved;
        const doneMsg = t('collection_io_import_done', { sets: report.addedSets, cats: report.touchedCats, missed: report.unresolved });
        setStatus(doneMsg, '#34d399');
        if (typeof showShareToast === 'function') showShareToast(doneMsg);
    } catch (e) {
        console.error('Game collection import failed:', e);
        setStatus(t('collection_io_bad_file'), '#ff5252');
    } finally {
        fileInput.value = '';
    }
}

/* Shared tail of every "bring a list of collections in" flow (game file
   import, osu! profile import): given [{ name, entries: [{ setId }] }], fetch
   each set the collection doesn't already have (via the v1 s= proxy, chunked)
   into the standard setInfo shape, then merge each source list into a
   same-named category — creating it if missing, never overwriting. Returns
   { addedSets, touchedCats, unresolved }. onProgress(msg) is optional. */
async function applyImportedCollections(named, onProgress) {
    const report = { addedSets: 0, touchedCats: 0, unresolved: 0 };
    const col = getOsuCollection();
    const haveSetIds = new Set(OSU_MODES.flatMap(m => col[m].map(s => s.beatmapset_id)));
    const wantedSetIds = [...new Set(named.flatMap(c => c.entries.map(e => e.setId)))].filter(id => !haveSetIds.has(id));

    const SCHUNK = 6;
    for (let i = 0; i < wantedSetIds.length; i += SCHUNK) {
        if (onProgress) onProgress(t('collection_io_importing', { done: i, total: wantedSetIds.length }));
        const chunk = wantedSetIds.slice(i, i + SCHUNK);
        const results = await Promise.all(chunk.map(id => osuFetch(`s=${id}`).catch(() => null)));
        for (const beatmaps of results) {
            if (!beatmaps || beatmaps.length === 0) { report.unresolved++; continue; }
            const modeNum = parseInt(beatmaps[0].mode);
            const modeKey = OSU_MODE_NAMES[modeNum];
            const setId = parseInt(beatmaps[0].beatmapset_id);
            if (!modeKey || haveSetIds.has(setId)) continue;
            const setInfo = {
                beatmapset_id: setId,
                title: beatmaps[0].title,
                artist: beatmaps[0].artist,
                creator: beatmaps[0].creator,
                mode: modeNum,
                addedAt: new Date().toISOString(),
                beatmaps: beatmaps.map(b => ({
                    beatmap_id: parseInt(b.beatmap_id),
                    version: b.version,
                    difficulty_rating: parseFloat(b.difficultyrating),
                    hit_length: parseInt(b.hit_length),
                    total_length: parseInt(b.total_length),
                    bpm: parseFloat(b.bpm),
                    key_count: parseFloat(b.diff_size),
                    mode_int: parseInt(b.mode),
                })).sort((a, b) => a.difficulty_rating - b.difficulty_rating),
            };
            const meta = await fetchOsuSetMeta(setId).catch(() => null);
            if (meta) { setInfo.language = meta.language; setInfo.genre = meta.genre; setInfo.source = meta.source; }
            col[modeKey].push(setInfo);
            haveSetIds.add(setId);
            report.addedSets++;
        }
        saveOsuCollection(col);
    }

    const cats = getOsuCategories();
    const catMembers = getOsuCategoryMembers();
    const validSetIds = new Set(OSU_MODES.flatMap(m => col[m].map(s => s.beatmapset_id)));
    for (const c of named) {
        const name = (c.name || '').trim();
        const ids = [...new Set(c.entries.map(e => e.setId))].filter(id => validSetIds.has(id));
        if (!name || ids.length === 0) continue;
        let cat = cats.find(x => x.name === name);
        if (!cat) { cat = { id: crypto.randomUUID(), name }; cats.push(cat); }
        catMembers[cat.id] = [...new Set([...(catMembers[cat.id] || []), ...ids])];
        report.touchedCats++;
    }
    saveOsuCategories(cats);
    saveOsuCategoryMembers(catMembers);

    renderOsuCollection();
    return report;
}

/* Page through a logged-in visitor's osu! profile beatmapsets (favourite or
   most_played) via the v2 proxy, newest/most-played first, capped. */
async function fetchOsuProfileBeatmapsets(userId, type, cap) {
    const out = [];
    const PAGE = Math.min(100, cap);
    for (let offset = 0; out.length < cap; offset += PAGE) {
        let batch;
        try {
            const r = await fetch(`/.netlify/functions/osu-user-beatmapsets?id=${userId}&type=${type}&limit=${PAGE}&offset=${offset}`);
            if (!r.ok) break;
            batch = await r.json();
        } catch { break; }
        if (!Array.isArray(batch) || batch.length === 0) break;
        for (const x of batch) { if (x && x.beatmapset_id) out.push(parseInt(x.beatmapset_id)); }
        if (batch.length < PAGE) break;
    }
    return [...new Set(out)].slice(0, cap);
}

/* Seed the collection from the logged-in visitor's osu! profile — all their
   favourite beatmapsets + their top 50 most-played — into "Favourites" and
   "Most played" categories. Offered once on first login when the collection
   is empty (checkOsuLoginFromUrl), and available any time from the toolbar
   button. Non-destructive, same as every other import. */
async function importFromOsuProfile() {
    if (!await verifyOsuPassword()) return;
    const user = getLoggedInOsuUser();
    if (!user || !user.id) { showShareToast(t('osu_profile_need_login')); return; }

    showShareToast(t('osu_profile_importing', { done: 0, total: '…' }));
    let favIds, mpIds;
    try {
        favIds = await fetchOsuProfileBeatmapsets(user.id, 'favourite', 300);
        mpIds = await fetchOsuProfileBeatmapsets(user.id, 'most_played', 50);
    } catch (e) {
        console.error('osu! profile beatmapset fetch failed:', e);
        showShareToast(t('osu_profile_import_fail'));
        return;
    }

    const named = [];
    if (favIds.length) named.push({ name: t('osu_profile_cat_favourites'), entries: favIds.map(id => ({ setId: id })) });
    if (mpIds.length) named.push({ name: t('osu_profile_cat_mostplayed'), entries: mpIds.map(id => ({ setId: id })) });
    if (named.length === 0) { showShareToast(t('osu_profile_import_empty')); return; }

    const report = await applyImportedCollections(named, msg => showShareToast(msg));
    showShareToast(t('collection_io_import_done', { sets: report.addedSets, cats: report.touchedCats, missed: report.unresolved }));
}

/* ===== Collection tools modal — generate categories from your osu! account,
   and a health check for the collection ===== */
/* <details class="modal-howto"> in the deeper modals (.db export, ✨ tools):
   expanded by default, but remembers per-modal if the visitor collapses it
   so it doesn't nag on every open. */
function wireModalHowto() {
    document.querySelectorAll('.modal-howto[data-howto-key]').forEach(el => {
        const key = 'howto_open_' + el.dataset.howtoKey;
        let stored;
        try { stored = localStorage.getItem(key); } catch { stored = null; }
        el.open = stored !== '0';
        el.addEventListener('toggle', () => {
            try { localStorage.setItem(key, el.open ? '1' : '0'); } catch { /* private mode */ }
        });
    });
}

function openCollectionToolsModal() {
    const gs = document.getElementById('ctools-gen-status');
    gs.innerText = ''; gs.style.color = '';
    const ps = document.getElementById('ctools-practice-status');
    if (ps) { ps.innerText = ''; ps.style.color = ''; }
    document.getElementById('ctools-health-results').innerHTML = '';
    document.getElementById('ctools-mapper-input').value = '';
    document.getElementById('collection-tools-modal').style.display = 'flex';
    if (typeof renderPracticeProgress === 'function') renderPracticeProgress();
}
function closeCollectionToolsModal() {
    document.getElementById('collection-tools-modal').style.display = 'none';
}

/* type: 'favourite' | 'most_played' | 'best' | 'recent' — turns a slice of
   the logged-in visitor's osu! account into one merged category, reusing
   applyImportedCollections (so nothing already collected is touched). */
async function generateCollectionFor(type) {
    if (!await verifyOsuPassword()) return;
    const user = getLoggedInOsuUser();
    const status = document.getElementById('ctools-gen-status');
    const setS = (m, c) => { status.innerText = m; status.style.color = c || '#c8a2e0'; };
    if (!user || !user.id) { setS(t('osu_profile_need_login'), '#ff5252'); return; }

    setS(t('osu_profile_importing', { done: 0, total: '…' }));
    let setIds = [];
    let name = '';
    try {
        if (type === 'favourite') {
            setIds = await fetchOsuProfileBeatmapsets(user.id, 'favourite', 300);
            name = t('osu_profile_cat_favourites');
        } else if (type === 'most_played') {
            setIds = await fetchOsuProfileBeatmapsets(user.id, 'most_played', 50);
            name = t('osu_profile_cat_mostplayed');
        } else if (type === 'best' || type === 'recent') {
            const plays = await osuFetch(`${type}=${user.id}&limit=${type === 'best' ? 100 : 50}`);
            const bmIds = [...new Set((plays || []).map(p => p.beatmap_id).filter(Boolean))];
            const sids = new Set();
            const CH = 10;
            for (let i = 0; i < bmIds.length; i += CH) {
                setS(t('osu_profile_importing', { done: i, total: bmIds.length }));
                const chunk = bmIds.slice(i, i + CH);
                const rs = await Promise.all(chunk.map(id => osuFetch(`b=${id}`).catch(() => null)));
                rs.forEach(r => { const b = r && r[0]; if (b && b.beatmapset_id) sids.add(parseInt(b.beatmapset_id)); });
            }
            setIds = [...sids];
            name = type === 'best' ? t('ctools_cat_best') : t('ctools_cat_recent');
        }
    } catch (e) {
        console.error('generateCollectionFor failed:', e);
        setS(t('osu_profile_import_fail'), '#ff5252');
        return;
    }
    if (!setIds.length) { setS(t('osu_profile_import_empty'), '#f59e0b'); return; }

    const report = await applyImportedCollections([{ name, entries: setIds.map(id => ({ setId: id })) }], m => setS(m));
    setS(t('collection_io_import_done', { sets: report.addedSets, cats: report.touchedCats, missed: report.unresolved }), '#34d399');
}

/* All of a mapper's ranked/approved/loved sets (graveyard/pending skipped),
   capped, into a "Mapper: <name>" category. */
async function generateCollectionFromMapper() {
    if (!await verifyOsuPassword()) return;
    const status = document.getElementById('ctools-gen-status');
    const setS = (m, c) => { status.innerText = m; status.style.color = c || '#c8a2e0'; };
    const raw = document.getElementById('ctools-mapper-input').value.trim();
    if (!raw) return;

    setS(t('osu_profile_importing', { done: 0, total: '…' }));
    let rows;
    try {
        const isId = /^\d+$/.test(raw);
        rows = await osuFetch(`mapper=${encodeURIComponent(raw)}${isId ? '' : '&mapper_type=string'}`);
    } catch (e) {
        console.error('mapper lookup failed:', e);
        setS(t('osu_profile_import_fail'), '#ff5252');
        return;
    }
    if (!Array.isArray(rows) || rows.length === 0) { setS(t('ctools_mapper_none'), '#f59e0b'); return; }

    const RANKED = new Set(['1', '2', '4']); // ranked / approved / loved
    const setIds = [...new Set(rows.filter(r => RANKED.has(String(r.approved))).map(r => parseInt(r.beatmapset_id)))].slice(0, 80);
    if (!setIds.length) { setS(t('ctools_mapper_none'), '#f59e0b'); return; }

    const creator = rows[0].creator || raw;
    const report = await applyImportedCollections(
        [{ name: t('ctools_cat_mapper', { name: creator }), entries: setIds.map(id => ({ setId: id })) }],
        m => setS(m),
    );
    setS(t('collection_io_import_done', { sets: report.addedSets, cats: report.touchedCats, missed: report.unresolved }), '#34d399');
}

/* ===== 🎯 Practice-collection generators =====
   Turn the visitor's own osu! results into a collection they can play
   against — the wedge this site has over osu!Collector / CollectionManager,
   which have no notion of your scores. See
   docs/practice-collection-generator-spec.md.

   MVP = two farm-dataset-backed kinds, standard mode only:
   - 'push' 突破分  : farm maps whose FC pp would break into your top 100
   - 'goal' 目標圖池 : farm maps each worth >= the single-score pp you still
                       need for the target total typed in the PP panel
   Both are 5.5*+ only (the farm crawler's STAR_FLOOR); lower brackets get
   blocked with an honest message and are the job of the score-driven kinds
   (低準度 / 相似圖 / 弱項) planned for later. */

const PRACTICE_N_MIN = 40;
const PRACTICE_N_MAX = 60;
const PRACTICE_MODE = 0;                 // MVP: standard only
const PRACTICE_MODE_NAME = 'osu';        // farm-maps-list `mode` param
const PRACTICE_GOOD_ACC = 95;            // a top-100 play at >= this acc counts as "already done"
const PRACTICE_WEAK_LENGTH_CAP = 400;    // s — keep 弱項 targets to normal-length maps, no marathons

function practiceMedian(nums) {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function practicePercentile(nums, p) {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
}

/* Chunked get_beatmap (b=) fill: for every beatmap_id not already in
   `detailByBeatmap`, fetch its details and store
   { setId, stars, creator, bpm, length }. Mutates the map; used by
   practiceFetchTopPlays and by the low-acc kind for recent plays outside
   the top 100. */
async function practiceResolveMissingDetails(beatmapIds, detailByBeatmap, onProgress, label) {
    const need = [...new Set(beatmapIds)].filter(id => id && !detailByBeatmap.has(id));
    const CH = 10;
    for (let i = 0; i < need.length; i += CH) {
        if (onProgress) onProgress(t(label || 'practice_reading_top', { done: i, total: need.length }));
        const chunk = need.slice(i, i + CH);
        const rs = await Promise.all(chunk.map(id => osuFetch(`b=${id}`).catch(() => null)));
        rs.forEach((r, j) => {
            const b = r && r[0];
            if (!b) return;
            detailByBeatmap.set(chunk[j], {
                setId: parseInt(b.beatmapset_id) || null,
                stars: parseFloat(b.difficultyrating),
                creator: b.creator || null,
                bpm: parseFloat(b.bpm) || null,
                length: parseInt(b.total_length) || null,
                ar: b.diff_approach != null ? parseFloat(b.diff_approach) : null,
                cs: b.diff_size != null ? parseFloat(b.diff_size) : null,
            });
        });
    }
}

/* 弱項: bucket the top plays by length and by BPM, return the single bucket
   with the fewest of them (ties → lowest average pp). The farm-maps-list
   query params for that bucket ride along in `band`. */
const PRACTICE_WEAK_BUCKETS = [
    { dim: 'len_short', band: { lengthMax: 90 },              hit: d => d.length != null && d.length < 90 },
    { dim: 'len_mid',   band: { lengthMin: 90, lengthMax: 150 }, hit: d => d.length != null && d.length >= 90 && d.length <= 150 },
    { dim: 'len_long',  band: { lengthMin: 150 },             hit: d => d.length != null && d.length > 150 },
    { dim: 'bpm_low',   band: { bpmMax: 160 },                hit: d => d.bpm != null && d.bpm < 160 },
    { dim: 'bpm_mid',   band: { bpmMin: 160, bpmMax: 200 },   hit: d => d.bpm != null && d.bpm >= 160 && d.bpm <= 200 },
    { dim: 'bpm_high',  band: { bpmMin: 200 },                hit: d => d.bpm != null && d.bpm > 200 },
    { dim: 'ar_low',    band: { arMax: 8.3 },                 hit: d => d.ar != null && d.ar < 8.3 },
    { dim: 'ar_mid',    band: { arMin: 8.3, arMax: 9.3 },     hit: d => d.ar != null && d.ar >= 8.3 && d.ar <= 9.3 },
    { dim: 'ar_high',   band: { arMin: 9.3 },                 hit: d => d.ar != null && d.ar > 9.3 },
    { dim: 'cs_low',    band: { csMax: 3.7 },                 hit: d => d.cs != null && d.cs < 3.7 },
    { dim: 'cs_mid',    band: { csMin: 3.7, csMax: 4.3 },     hit: d => d.cs != null && d.cs >= 3.7 && d.cs <= 4.3 },
    { dim: 'cs_high',   band: { csMin: 4.3 },                 hit: d => d.cs != null && d.cs > 4.3 },
    // stream/jump — needsRatio: only considered when the top plays have
    // been enriched with a speedRatio (via osu-pp, behind the 精算
    // checkbox). The farm query uses only a BPM proxy — srMin/srMax would
    // hard-drop every map the crawler hasn't recomputed with aim/speed yet
    // (currently ~all of them). srRange refines the candidates client-side
    // for the ones that do carry a speedRatio, sharpening as recrawls land.
    { dim: 'sr_jump',   needsRatio: true, srRange: [0, 0.42],    band: { bpmMax: 190 }, hit: d => d.speedRatio != null && d.speedRatio < 0.42 },
    { dim: 'sr_bal',    needsRatio: true, srRange: [0.42, 0.55], band: {},              hit: d => d.speedRatio != null && d.speedRatio >= 0.42 && d.speedRatio <= 0.55 },
    { dim: 'sr_stream', needsRatio: true, srRange: [0.55, 1],    band: { bpmMin: 170 }, hit: d => d.speedRatio != null && d.speedRatio > 0.55 },
];

/* Pick the weak spot: the bucket with the lowest share *within its own
   dimension group* (len / bpm / ar / cs / sr), tie-broken by lowest
   average pp. Share, not raw count, so groups with different classified-
   play coverage (sr only has what osu-pp could enrich) compare fairly. A
   group needs >= 8 classified plays to be judged at all. */
function practicePickWeakestBucket(top, includeRatio) {
    const buckets = PRACTICE_WEAK_BUCKETS.filter(b => includeRatio || !b.needsRatio);
    const stats = buckets.map(b => {
        let count = 0, ppSum = 0;
        top.scores.forEach((s, i) => {
            const d = top.detailByBeatmap.get(parseInt(s.beatmap_id));
            if (d && b.hit(d)) { count++; ppSum += top.ppList[i] || parseFloat(s.pp) || 0; }
        });
        return { ...b, group: b.dim.split('_')[0], count, avgPp: count ? ppSum / count : 0 };
    });
    const groupTotal = {};
    stats.forEach(b => { groupTotal[b.group] = (groupTotal[b.group] || 0) + b.count; });
    const scored = stats
        .filter(b => groupTotal[b.group] >= 8)
        .map(b => ({ ...b, share: b.count / groupTotal[b.group] }));
    if (!scored.length) return null;
    scored.sort((a, b) => a.share - b.share || a.avgPp - b.avgPp);
    return scored[0];
}

/* ~100 osu-pp calls to tag each top play with speedRatio = speed / (aim +
   speed) difficulty. Slow — only run for 弱項 when 精算 is checked.
   Mutates top.detailByBeatmap. */
async function practiceEnrichStrainRatios(top, mods, onProgress) {
    const ids = [...top.detailByBeatmap.keys()].filter(Boolean);
    const CH = 6;
    for (let i = 0; i < ids.length; i += CH) {
        onProgress(t('practice_enrich_strain', { done: i, total: ids.length }));
        await Promise.all(ids.slice(i, i + CH).map(async bid => {
            try {
                const qs = new URLSearchParams({ id: String(bid), acc: '100' });
                if (mods && mods !== 'NM') qs.set('mods', mods);
                const r = await fetch(`/.netlify/functions/osu-pp?${qs}`).then(x => x.json());
                if (r && r.aim != null && r.speed != null && r.aim + r.speed > 0) {
                    const d = top.detailByBeatmap.get(bid);
                    if (d) d.speedRatio = r.speed / (r.aim + r.speed);
                }
            } catch { /* leave speedRatio unset */ }
        }));
    }
}

/* get_user_best has pp but no star rating, set id or mapper, so this joins
   each top-100 play with its get_beatmap details (batched like
   generateCollectionFor('best')). Returns everything the four kinds need:
   pp band edges, star median / P90 / IQR, weighted mean accuracy, the set
   of beatmap_ids already FC'd, and the per-play detail map. */
async function practiceFetchTopPlays(uid, mode, onProgress) {
    const scores = await osuFetch(`best=${uid}&limit=100&m=${mode}`) || [];
    if (!scores.length) return null;
    const ppList = scores.map(s => parseFloat(s.pp)).filter(Number.isFinite).sort((a, b) => b - a);

    const detailByBeatmap = new Map();
    await practiceResolveMissingDetails(
        scores.map(s => parseInt(s.beatmap_id)), detailByBeatmap, onProgress,
    );

    const stars = [...detailByBeatmap.values()].map(d => d.stars).filter(Number.isFinite);

    // weighted mean accuracy of the top plays (same 0.95^rank weighting as pp)
    let accW = 0, wSum = 0;
    scores.forEach((s, i) => {
        const w = Math.pow(0.95, i);
        accW += parseFloat(calcOsuAccuracy(s, mode)) * w;
        wSum += w;
    });

    return {
        scores,
        ppList,
        p100: ppList.length ? ppList[Math.min(99, ppList.length - 1)] : 0,
        starMedian: practiceMedian(stars),
        star90: practicePercentile(stars, 90),
        starP25: practicePercentile(stars, 25),
        starP75: practicePercentile(stars, 75),
        avgAccWeighted: wSum ? accW / wSum : 100,
        goodScoreBeatmapIds: new Set(
            scores.filter(s => parseFloat(calcOsuAccuracy(s, mode)) >= PRACTICE_GOOD_ACC)
                  .map(s => parseInt(s.beatmap_id)),
        ),
        playedBeatmapIds: new Set(scores.map(s => parseInt(s.beatmap_id))),
        detailByBeatmap,
    };
}

/* 低準度重練 — beatmaps you've played but under your own weighted-mean acc,
   worst first. No farm dataset, no star floor: works at any rank. */
async function practiceCandidatesLowAcc(uid, mode, top, onProgress) {
    onProgress(t('practice_reading_recent'));
    const recent = (await osuFetch(`recent=${uid}&limit=50&m=${mode}`).catch(() => [])) || [];
    const passed = (s) => s.rank && s.rank.toUpperCase() !== 'F';

    const accByBeatmap = new Map();
    const consider = (s, isRecent) => {
        if (isRecent && !passed(s)) return;
        const bid = parseInt(s.beatmap_id);
        const a = parseFloat(calcOsuAccuracy(s, mode));
        if (!accByBeatmap.has(bid) || a < accByBeatmap.get(bid)) accByBeatmap.set(bid, a);
    };
    top.scores.forEach(s => consider(s, false));
    recent.forEach(s => consider(s, true));

    let thr = top.avgAccWeighted - 1.5;
    let low = [...accByBeatmap].filter(([, a]) => a < thr);
    if (low.length < PRACTICE_N_MIN) low = [...accByBeatmap].filter(([, a]) => a < 97); // widen
    low.sort((a, b) => a[1] - b[1]); // worst acc first

    await practiceResolveMissingDetails(low.map(([bid]) => bid), top.detailByBeatmap, onProgress);
    // Unlike push/goal/taste this does NOT drop maps already in the
    // collection — a curator's weak plays are almost all already collected,
    // and the value here is the focused re-grind category, not new adds.
    // applyImportedCollections() still files an existing set under the new
    // category name.
    const seen = new Set();
    const entries = [];
    for (const [bid] of low) {
        const d = top.detailByBeatmap.get(bid);
        if (!d || !d.setId || seen.has(d.setId)) continue;
        seen.add(d.setId);
        entries.push({ setId: d.setId, beatmapId: bid });
        if (entries.length >= PRACTICE_N_MAX) break;
    }
    return entries;
}

/* 沒打過的相似圖 — ranked maps by the mappers behind your top plays, star
   rating inside your top-play IQR, that you have no top-100 score on;
   closest to your median difficulty first. No farm dataset, no star floor. */
async function practiceCandidatesTaste(uid, mode, top, onProgress) {
    const count = new Map();
    for (const bid of top.playedBeatmapIds) {
        const c = top.detailByBeatmap.get(bid) && top.detailByBeatmap.get(bid).creator;
        if (c) count.set(c, (count.get(c) || 0) + 1);
    }
    let mappers = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([m]) => m);
    if (mappers.length < 3) mappers = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
    mappers = mappers.slice(0, 6);
    if (!mappers.length) return [];

    const sMin = top.starP25, sMax = top.starP75;
    const RANKED = new Set(['1', '2', '4']);
    const have = practiceExistingSetIds();
    const seen = new Set();
    const scored = [];
    for (let i = 0; i < mappers.length; i++) {
        onProgress(t('practice_scanning_mapper', { done: i, total: mappers.length }));
        const rows = (await osuFetch(`mapper=${encodeURIComponent(mappers[i])}&mapper_type=string`).catch(() => [])) || [];
        for (const r of rows) {
            if (!RANKED.has(String(r.approved))) continue;
            const st = parseFloat(r.difficultyrating);
            if (!(st >= sMin && st <= sMax)) continue;
            const bid = parseInt(r.beatmap_id), sid = parseInt(r.beatmapset_id);
            if (!sid || top.playedBeatmapIds.has(bid) || have.has(sid) || seen.has(sid)) continue;
            seen.add(sid);
            scored.push({ setId: sid, beatmapId: bid, dist: Math.abs(st - top.starMedian) });
        }
    }
    scored.sort((a, b) => a.dist - b.dist);
    return scored.slice(0, PRACTICE_N_MAX).map(x => ({ setId: x.setId, beatmapId: x.beatmapId }));
}

/* Page farm-maps-list within a pp/star band, collecting up to `want` rows.
   `total` and `coverage` come from page 0 so the caller can run the
   coverage gate before committing to the rest of the pages. */
async function practiceCollectFarmBand(band, want, onProgress) {
    const qs = new URLSearchParams({
        mode: PRACTICE_MODE_NAME,
        mods: band.mods,
        // No farmOnly: that flag keeps only the ~700 maps the crawler tags as
        // active DT-abuse farm, which is far too narrow to fill a pp/star
        // band. "Break into your top 100" just needs any ranked 5.5*+ map in
        // range you haven't done — the whole computed dataset (~70k) is fair
        // game. (A "prefer farm maps" toggle could come back later.)
        starMin: band.starMin.toFixed(2),
        starMax: band.starMax.toFixed(2),
        sort: band.sort,
    });
    // pp band: push/goal set it, 弱項 doesn't (it filters on bpm/length/ar/cs)
    if (band.ppMin != null) qs.set('ppMin', band.ppMin.toFixed(1));
    if (band.ppMax != null) qs.set('ppMax', band.ppMax.toFixed(1));
    for (const k of ['bpmMin', 'bpmMax', 'lengthMin', 'lengthMax', 'arMin', 'arMax', 'csMin', 'csMax']) {
        if (band[k] != null) qs.set(k, String(band[k]));
    }
    const get = (page) => fetch(`/.netlify/functions/farm-maps-list?${qs}&page=${page}`).then(r => r.json());

    const first = await get(0);
    const total = first.total || 0;
    const coverage = first.coverage || {};
    const items = [...(first.items || [])];
    const pageSize = first.pageSize || 20;
    const pages = Math.ceil(total / pageSize);
    for (let p = 1; p < pages && items.length < want; p++) {
        if (onProgress) onProgress(t('practice_scanning_farm', { done: items.length, total: Math.min(total, want) }));
        const res = await get(p);
        items.push(...(res.items || []));
    }
    return { items, total, coverage };
}

/* Gate: not enough maps in this pp/star band to build a real collection.
   `coverage.totalKnown` turned out to be a stale/capped field so the old
   ratio check was meaningless — the honest signal is just how many rows the
   band actually matched. */
function practiceCoverageBlocked(total) {
    return total < PRACTICE_N_MIN;
}

function practiceExistingSetIds() {
    const col = getOsuCollection();
    return new Set(OSU_MODES.flatMap(m => col[m].map(s => s.beatmapset_id)));
}

function practiceCatName(kind, opts = {}) {
    if (kind === 'goal') return t('practice_cat_goal', { target: Math.round(opts.target).toLocaleString() });
    if (kind === 'lowacc') return t('practice_cat_lowacc');
    if (kind === 'taste') return t('practice_cat_taste');
    if (kind === 'weak') return t('practice_cat_weak', { dim: t('practice_dim_' + opts.dim) });
    return t('practice_cat_push');
}

async function generatePracticeCollection(kind) {
    if (!await verifyOsuPassword()) return;
    const status = document.getElementById('ctools-practice-status');
    const setS = (m, c) => { status.innerText = m; status.style.color = c || '#c8a2e0'; };
    const user = getLoggedInOsuUser();
    if (!user || !user.id) { setS(t('osu_profile_need_login'), '#ff5252'); return; }

    const mods = (document.getElementById('ctools-practice-mods') || {}).value || 'NM';

    // 目標圖池 needs the target from the PP panel before any fetching
    let target = null;
    if (kind === 'goal') {
        target = parseFloat((document.getElementById('pp-goal-target') || {}).value);
        if (!Number.isFinite(target) || target <= 0) { setS(t('practice_goal_need_target'), '#f59e0b'); return; }
    }

    setS(t('practice_reading_top', { done: 0, total: '…' }));
    let top;
    try {
        top = await practiceFetchTopPlays(user.id, PRACTICE_MODE, setS);
    } catch (e) {
        console.error('practice: top plays fetch failed:', e);
        setS(t('osu_profile_import_fail'), '#ff5252');
        return;
    }
    if (!top || top.ppList.length < 10) { setS(t('practice_need_more_plays'), '#f59e0b'); return; }

    // Current total pp — the baseline the progress loop diffs against later,
    // and what 目標圖池 measures the target against. One fetch for all kinds.
    let currentTotalPp = null;
    try {
        const me = await osuFetch(`u=${user.id}&m=${PRACTICE_MODE}`);
        if (me && me[0] && me[0].pp_raw != null) currentTotalPp = parseFloat(me[0].pp_raw);
    } catch { /* progress baseline just won't be recorded */ }
    const recOpts = { ppAtCreation: currentTotalPp, userId: user.id };

    // Score-driven kinds: no farm dataset, no star floor — any rank.
    if (kind === 'lowacc' || kind === 'taste') {
        let entries;
        try {
            entries = kind === 'lowacc'
                ? await practiceCandidatesLowAcc(user.id, PRACTICE_MODE, top, setS)
                : await practiceCandidatesTaste(user.id, PRACTICE_MODE, top, setS);
        } catch (e) {
            console.error(`practice: ${kind} failed:`, e);
            setS(t('osu_profile_import_fail'), '#ff5252');
            return;
        }
        if (kind === 'lowacc' && !entries.length) { setS(t('practice_acc_stable'), '#34d399'); return; }
        if (kind === 'taste' && entries.length < 10) { setS(t('practice_taste_thin'), '#f59e0b'); return; }
        return practiceApplyAndReport(kind, recOpts, entries, setS);
    }

    const precise = !!(document.getElementById('ctools-practice-precise') || {}).checked;
    let band, weakDim = null, needed = null, weakSrRange = null;
    if (kind === 'push') {
        band = {
            mods,
            ppMin: top.p100,
            ppMax: top.p100 * 1.3,
            starMin: Math.max(0, top.starMedian - 0.7),
            starMax: top.starMedian + 0.7,
            sort: 'pp_desc',
        };
    } else if (kind === 'weak') {
        // 精算 unlocks the stream/jump dimension — needs ~100 osu-pp calls
        // to tag the top plays with an aim/speed ratio first.
        if (precise) {
            setS(t('practice_enrich_strain', { done: 0, total: '…' }));
            await practiceEnrichStrainRatios(top, mods, setS);
        }
        const bucket = practicePickWeakestBucket(top, precise);
        if (!bucket) { setS(t('practice_weak_none'), '#34d399'); return; }
        weakDim = bucket.dim;
        weakSrRange = bucket.srRange || null;
        band = {
            mods,
            ...bucket.band,   // bpm/length/ar/cs/sr range for this bucket
            // Cap length so a high-BPM bucket doesn't fill up with 10-minute
            // marathon compilations — not a practice target.
            lengthMax: Math.min(bucket.band.lengthMax || Infinity, PRACTICE_WEAK_LENGTH_CAP),
            starMin: Math.max(0, top.starMedian - 0.7),
            starMax: top.starMedian + 0.7,
            sort: 'pp_desc',
        };
    } else {
        // goal — recompute `needed` against the LOGGED-IN user's own top 100
        // (the PP panel's own calc runs against whatever profile was last
        // looked up).
        const actualTotal = currentTotalPp || 0;
        if (actualTotal && actualTotal >= target) { setS(t('practice_goal_reached'), '#34d399'); return; }
        const bonusPp = Math.max(0, actualTotal - weightedPpSum(top.ppList));
        needed = ppNeededForTarget(top.ppList, bonusPp, target);
        const starMax = top.star90 + 0.3;
        band = {
            mods,
            ppMin: needed * 0.9,
            ppMax: needed * 1.6,
            starMin: Math.max(0, starMax - 1.5),
            starMax,
            sort: 'star_asc',
        };
    }

    setS(t('practice_scanning_farm', { done: 0, total: PRACTICE_N_MAX }));
    let farm;
    try {
        farm = await practiceCollectFarmBand(band, PRACTICE_N_MAX * 3, setS);
    } catch (e) {
        console.error('practice: farm-maps-list failed:', e);
        setS(t('osu_profile_import_fail'), '#ff5252');
        return;
    }
    if (practiceCoverageBlocked(farm.total)) { setS(t('practice_low_coverage'), '#f59e0b'); return; }

    const have = practiceExistingSetIds();
    const seenSet = new Set();
    const candidates = [];
    for (const r of farm.items) {
        const sid = parseInt(r.beatmapset_id);
        if (!sid || have.has(sid) || seenSet.has(sid)) continue;
        if (top.goodScoreBeatmapIds.has(parseInt(r.beatmap_id))) continue;
        seenSet.add(sid);
        candidates.push({
            setId: sid,
            beatmapId: parseInt(r.beatmap_id) || null,
            farmPp: parseFloat(r.pp) || 0,
            speedRatio: r.speedRatio != null ? r.speedRatio : null,
        });
        if (candidates.length >= PRACTICE_N_MAX * 2) break;
    }
    if (candidates.length < PRACTICE_N_MIN) { setS(t('practice_low_coverage'), '#f59e0b'); return; }

    // 弱項 stream/jump: tighten to candidates whose speedRatio matches the
    // weak lean; ones the farm hasn't computed yet pass on the BPM proxy
    // already applied in the query. Only if that still leaves a full set.
    if (weakSrRange) {
        const refined = candidates.filter(c => c.speedRatio == null
            || (c.speedRatio >= weakSrRange[0] && c.speedRatio <= weakSrRange[1]));
        if (refined.length >= PRACTICE_N_MIN) { candidates.length = 0; candidates.push(...refined); }
    }

    let ranked = candidates;
    if (precise && (kind === 'push' || kind === 'goal')) {
        const reranked = await practicePrecisePpRerank(kind, candidates, { mods, p100: top.p100, needed }, setS);
        if (reranked.length >= PRACTICE_N_MIN) ranked = reranked; // else keep the farm-pp order
    }
    const entries = ranked.slice(0, PRACTICE_N_MAX).map(c => ({ setId: c.setId, beatmapId: c.beatmapId }));
    if (entries.length < PRACTICE_N_MIN) { setS(t('practice_low_coverage'), '#f59e0b'); return; }

    return practiceApplyAndReport(kind, { ...recOpts, target, dim: weakDim }, entries, setS);
}

/* Optional accurate pass for push/goal: re-score up to 2×N_MAX candidates
   with rosu-pp (the osu-pp function, FC/100% pp) instead of trusting the
   farm dataset's precomputed pp, then re-rank —
   push by the biggest jump, goal by closeness to the pp still needed.
   One function call per candidate, so it's behind a checkbox. */
async function practicePrecisePpRerank(kind, candidates, ctx, setS) {
    const pool = candidates.slice(0, PRACTICE_N_MAX * 2);
    const CH = 6;
    for (let i = 0; i < pool.length; i += CH) {
        setS(t('practice_precise_pp', { done: i, total: pool.length }));
        await Promise.all(pool.slice(i, i + CH).map(async c => {
            if (!c.beatmapId) return;
            try {
                const qs = new URLSearchParams({ id: String(c.beatmapId), acc: '100' });
                if (ctx.mods && ctx.mods !== 'NM') qs.set('mods', ctx.mods);
                const r = await fetch(`/.netlify/functions/osu-pp?${qs}`).then(x => x.json());
                if (r && r.pp && r.pp['100'] != null) c.accPp = r.pp['100'];
            } catch { /* leave c.accPp unset → dropped below */ }
        }));
    }
    const scored = pool.filter(c => c.accPp != null);
    if (scored.length < PRACTICE_N_MIN) return [];
    if (kind === 'push') {
        return scored.filter(c => c.accPp > ctx.p100).sort((a, b) => b.accPp - a.accPp);
    }
    return scored.filter(c => c.accPp >= (ctx.needed || 0) * 0.9)
                 .sort((a, b) => Math.abs(a.accPp - ctx.needed) - Math.abs(b.accPp - ctx.needed));
}

/* Shared tail: hand the picked set ids to the normal import pipeline (set
   resolution, category creation, progress, .db/.osdb export all free),
   record the set for the progress loop, and report. */
async function practiceApplyAndReport(kind, opts, entries, setS) {
    const name = practiceCatName(kind, opts);
    const report = await applyImportedCollections([{ name, entries }], m => setS(m));

    const cat = getOsuCategories().find(c => c.name === name);
    if (cat) {
        const store = getPracticeSets();
        store[String(cat.id)] = {
            kind,
            dim: opts.dim || null,
            target: opts.target || null,
            createdAt: new Date().toISOString(),
            ppAtCreation: opts.ppAtCreation != null ? opts.ppAtCreation : null,
            userId: opts.userId || null,
            memberSetIds: entries.map(e => e.setId),
            // the one difficulty per set this kind actually picked — used to
            // narrow the .db / .osdb export so a 60-set practice collection
            // stays 60 maps in-game instead of ~300.
            memberBeatmapIds: entries.map(e => e.beatmapId).filter(Boolean),
        };
        savePracticeSets(store);
    }

    setS(t('collection_io_import_done', {
        sets: report.addedSets, cats: report.touchedCats, missed: report.unresolved,
    }), '#34d399');
}

/* ===== Practice-set progress loop =====
   Records each practice category at creation (kind, date, total pp then,
   its member set ids). renderPracticeProgress() diffs live: current total
   pp vs then, and how many of the set's maps now sit in the user's top
   100. Shown in the ✨ modal only when there's at least one tracked set. */
const PRACTICE_SETS_KEY = 'osu_practice_sets';
function getPracticeSets() {
    try { return JSON.parse(localStorage.getItem(PRACTICE_SETS_KEY)) || {}; }
    catch { return {}; }
}
function savePracticeSets(m) {
    localStorage.setItem(PRACTICE_SETS_KEY, JSON.stringify(m));
}

/* If `catId` is a tracked practice category, the Set of beatmap_ids it
   should export (its picked difficulties); null for any normal category
   (= export every difficulty, the default). */
function practiceDiffFilter(catId) {
    const rec = getPracticeSets()[String(catId)];
    if (!rec || !Array.isArray(rec.memberBeatmapIds) || !rec.memberBeatmapIds.length) return null;
    return new Set(rec.memberBeatmapIds.map(Number));
}

async function renderPracticeProgress() {
    const el = document.getElementById('ctools-practice-progress');
    if (!el) return;

    const store = getPracticeSets();
    const catById = new Map(getOsuCategories().map(c => [String(c.id), c]));
    let pruned = false;
    for (const id of Object.keys(store)) {
        if (!catById.has(id)) { delete store[id]; pruned = true; }
    }
    if (pruned) savePracticeSets(store);

    const ids = Object.keys(store);
    if (!ids.length) { el.innerHTML = ''; return; }

    el.innerHTML = `<div class="ctools-practice-progress-title">${escHtml(t('practice_progress_title'))}</div>`
        + `<div class="status">${escHtml(t('practice_progress_loading'))}</div>`;

    const user = getLoggedInOsuUser();
    let curPp = null;
    const topBids = new Set();
    if (user && user.id) {
        try {
            const [me, best] = await Promise.all([
                osuFetch(`u=${user.id}&m=${PRACTICE_MODE}`),
                osuFetch(`best=${user.id}&limit=100&m=${PRACTICE_MODE}`),
            ]);
            if (me && me[0] && me[0].pp_raw != null) curPp = parseFloat(me[0].pp_raw);
            (best || []).forEach(s => topBids.add(parseInt(s.beatmap_id)));
        } catch { /* show what we can without the live numbers */ }
    }

    const beatmapsBySet = new Map();
    const col = getOsuCollection();
    OSU_MODES.forEach(m => col[m].forEach(s =>
        beatmapsBySet.set(s.beatmapset_id, (s.beatmaps || []).map(b => parseInt(b.beatmap_id))),
    ));

    const rows = ids.map(id => {
        const p = store[id];
        const cat = catById.get(id);
        const dPp = (curPp != null && p.ppAtCreation != null) ? Math.round(curPp - p.ppAtCreation) : null;
        const hits = (p.memberSetIds || []).reduce(
            (n, sid) => n + ((beatmapsBySet.get(sid) || []).some(b => topBids.has(b)) ? 1 : 0), 0,
        );
        const parts = [escHtml(cat.name), (p.createdAt || '').slice(0, 10)];
        if (dPp != null) parts.push(t('practice_progress_dpp', { d: (dPp >= 0 ? '+' : '') + dPp.toLocaleString() }));
        parts.push(t('practice_progress_hits', { n: hits, total: (p.memberSetIds || []).length }));
        return `<div class="ctools-practice-progress-row">${parts.join(' · ')}</div>`;
    });

    el.innerHTML = `<div class="ctools-practice-progress-title">${escHtml(t('practice_progress_title'))}</div>` + rows.join('');
}

/* ===== 「為你更新」digest =====
   A compact strip at the top of the collection page so a returning visitor
   lands on "something happened", not the same static grid. Aggregates data
   that already exists — PP history, the notification store, practice-set
   progress. Renders nothing (no empty "nothing new" box) when there's
   nothing to say; a soft feature-discovery prompt when logged out. */
const DIGEST_LAST_VISIT_KEY = 'osu_last_visit_at';
const DIGEST_PP_CHECK_KEY = 'osu_digest_pp_checked_at';
const DIGEST_PROMPT_DISMISSED_KEY = 'osu_digest_prompt_dismissed';
const DIGEST_PP_CHECK_MS = 6 * 60 * 60 * 1000;

/* Jumps to the collection tab pre-filtered by a title/artist string. Takes
   the query URI-encoded (with `'` additionally escaped to %27, since
   encodeURIComponent alone doesn't touch it — see chatEncodeForOnclick in
   js/chat.js for the same fix) rather than embedding raw beatmap text
   straight into an inline onclick="" attribute, because titles can contain
   quotes that would otherwise break the attribute or need fragile escaping. */
function jumpToCollectionSearch(encodedQuery) {
    const query = decodeURIComponent(encodedQuery);
    switchTab('collection');
    const input = document.getElementById('osu-search-input');
    if (input) input.value = query;
    filterOsuCollection(query);
}

/* "On this day" — surfaces a set added on this exact month/day in a past
   year, using the addedAt timestamps already saved per-set (same field the
   growth chart in the stats dashboard reads). Picks the oldest matching
   anniversary (most years back) when more than one set qualifies, since
   that's the more nostalgic one. Returns null (no row) on any day with no
   match — there's no sensible "closest" fallback for a feature that's
   specifically about the actual date. */
function digestOnThisDayRow() {
    const col = getOsuCollection();
    const seen = new Set();
    const allSets = OSU_MODES.flatMap(m => col[m]).filter(s => {
        if (!s.addedAt || seen.has(s.beatmapset_id)) return false;
        seen.add(s.beatmapset_id);
        return true;
    });
    const today = new Date();
    const mmdd = `${today.getMonth()}-${today.getDate()}`;
    const matches = allSets
        .map(s => ({ s, added: new Date(s.addedAt) }))
        .filter(({ added }) => added.getFullYear() !== today.getFullYear() && `${added.getMonth()}-${added.getDate()}` === mmdd)
        .sort((a, b) => a.added - b.added);
    if (!matches.length) return null;

    const { s: set, added } = matches[0];
    const years = today.getFullYear() - added.getFullYear();
    const query = set.title || set.artist || '';
    return {
        icon: 'calendar',
        text: t('digest_on_this_day', { years, title: query }),
        action: `jumpToCollectionSearch('${encodeURIComponent(query).replace(/'/g, '%27')}')`,
    };
}

function dismissDigestPrompt() {
    try { localStorage.setItem(DIGEST_PROMPT_DISMISSED_KEY, '1'); } catch {}
    const el = document.getElementById('collection-digest');
    if (el) el.innerHTML = '';
}

async function digestPracticeRow(user) {
    const store = getPracticeSets();
    const ids = Object.keys(store);
    if (!ids.length) return null;
    const catById = new Map(getOsuCategories().map(c => [String(c.id), c]));
    const live = ids.filter(id => catById.has(id));
    if (!live.length) return null;

    let curPp = null;
    const topBids = new Set();
    try {
        const [me, best] = await Promise.all([
            osuFetch(`u=${user.id}&m=${PRACTICE_MODE}`),
            osuFetch(`best=${user.id}&limit=100&m=${PRACTICE_MODE}`),
        ]);
        if (me && me[0] && me[0].pp_raw != null) curPp = parseFloat(me[0].pp_raw);
        (best || []).forEach(s => topBids.add(parseInt(s.beatmap_id)));
    } catch { return null; }

    const bmBySet = new Map();
    const col = getOsuCollection();
    OSU_MODES.forEach(m => col[m].forEach(s => bmBySet.set(s.beatmapset_id, (s.beatmaps || []).map(b => parseInt(b.beatmap_id)))));

    let best = null;
    for (const id of live) {
        const p = store[id];
        const dPp = (curPp != null && p.ppAtCreation != null) ? Math.round(curPp - p.ppAtCreation) : 0;
        const hits = (p.memberSetIds || []).reduce((n, sid) => n + ((bmBySet.get(sid) || []).some(b => topBids.has(b)) ? 1 : 0), 0);
        if (!best || hits > best.hits || (hits === best.hits && dPp > best.dPp)) {
            best = { name: catById.get(id).name, dPp, hits, total: (p.memberSetIds || []).length };
        }
    }
    if (!best || (best.hits === 0 && best.dPp <= 0)) return null;
    return {
        icon: 'target',
        text: t('digest_practice', {
            name: best.name, d: (best.dPp >= 0 ? '+' : '') + best.dPp.toLocaleString(),
            hits: best.hits, total: best.total,
        }),
        action: "switchTab('collection')",
    };
}

async function renderCollectionDigest() {
    const el = document.getElementById('collection-digest');
    if (!el) return;
    const nowIso = new Date().toISOString();
    const lastVisit = (() => { try { return localStorage.getItem(DIGEST_LAST_VISIT_KEY); } catch { return null; } })();
    const stamp = () => { try { localStorage.setItem(DIGEST_LAST_VISIT_KEY, nowIso); } catch {} };

    const user = getLoggedInOsuUser();
    if (!user || !user.id) {
        // The empty-collection state already leads with a login CTA (hero +
        // the grid button). This prompt is for the *returning* logged-out
        // visitor who has a collection — "you're missing the personalised
        // stuff" — so only show it once there's a collection to speak of.
        const emptyCol = OSU_MODES.every(m => getOsuCollection()[m].length === 0);
        let dismissed; try { dismissed = localStorage.getItem(DIGEST_PROMPT_DISMISSED_KEY) === '1'; } catch { dismissed = false; }
        el.innerHTML = (dismissed || emptyCol) ? '' : `<div class="digest-strip digest-prompt">
            <span>${escHtml(t('digest_logged_out'))}</span>
            <a class="digest-cta" href="/.netlify/functions/osu-login">${escHtml(t('osu_login_btn'))}</a>
            <button class="digest-dismiss" onclick="dismissDigestPrompt()" aria-label="dismiss">${icon('x', { size: '0.85em' })}</button>
        </div>`;
        stamp();
        return;
    }

    const rows = [];

    // PP since last visit — refresh at most every 6h, otherwise use cache
    let history = getPpHistory(ppHistoryKeyFor(user.id));
    const ppStale = !history.length ||
        (Date.now() - (parseInt((() => { try { return localStorage.getItem(DIGEST_PP_CHECK_KEY); } catch { return 0; } })(), 10) || 0) > DIGEST_PP_CHECK_MS);
    if (ppStale && typeof fetchPlayerTotalPpAndHistory === 'function') {
        try {
            const res = await fetchPlayerTotalPpAndHistory(user.id, false);
            if (res) {
                history = res.history || getPpHistory(ppHistoryKeyFor(user.id));
                try { localStorage.setItem(DIGEST_PP_CHECK_KEY, String(Date.now())); } catch {}
            }
        } catch { /* keep cache */ }
    }
    if (lastVisit && history.length >= 2) {
        const cutoff = lastVisit.slice(0, 10);
        const base = [...history].reverse().find(h => h.date <= cutoff) || history[0];
        const latest = history[history.length - 1];
        const d = latest.pp - base.pp;
        if (d !== 0 && base.date !== latest.date) {
            rows.push({
                icon: 'trendingUp',
                text: t('digest_pp', { d: (d > 0 ? '+' : '') + d.toLocaleString(), from: formatPpChartDate(base.date) }),
                action: "switchTab('lookup')",
            });
        }
    }

    // improvement streak — consecutive most-recent days where pp went up
    if (history.length >= 3) {
        let streak = 0;
        for (let i = history.length - 1; i > 0; i--) {
            if (history[i].pp > history[i - 1].pp) streak++;
            else break;
        }
        if (streak >= 2) rows.push({ icon: 'trendingUp', text: t('digest_streak', { n: streak }), action: "switchTab('lookup')" });
    }

    // personal PP goal progress (target lives in the PP panel's #pp-goal-target)
    let goalHtml = '';
    const curPp = history.length ? history[history.length - 1].pp : null;
    const goalTarget = parseFloat((document.getElementById('pp-goal-target') || {}).value);
    if (curPp != null && Number.isFinite(goalTarget) && goalTarget > 0) {
        if (curPp >= goalTarget) {
            goalHtml = `<div class="digest-strip digest-goal"><span>${escHtml(t('digest_goal_done', { target: Math.round(goalTarget).toLocaleString() }))}</span></div>`;
        } else {
            const pct = Math.max(2, Math.min(99, Math.round(curPp / goalTarget * 100)));
            goalHtml = `<div class="digest-strip digest-goal" role="button" tabindex="0" onclick="switchTab('lookup')">
                <span>${escHtml(t('digest_goal', { target: Math.round(goalTarget).toLocaleString(), remaining: Math.round(goalTarget - curPp).toLocaleString(), pct }))}</span>
                <span class="digest-goal-bar"><span style="width:${pct}%"></span></span>
            </div>`;
        }
    }

    // notifications since last visit
    if (lastVisit && typeof getNotifications === 'function') {
        const fresh = getNotifications().filter(n => n.createdAt && n.createdAt > lastVisit);
        if (fresh.length) rows.push({ icon: 'bell', text: t('digest_notifs', { n: fresh.length }), action: 'toggleNotifDropdown(true)' });
    }

    // best-performing practice collection
    try {
        const pr = await digestPracticeRow(user);
        if (pr) rows.push(pr);
    } catch { /* skip */ }

    // "on this day" anniversary
    try {
        const otd = digestOnThisDayRow();
        if (otd) rows.push(otd);
    } catch { /* skip */ }

    stamp();

    // One-time welcome after first login — confirms self-tracking is on and,
    // if the collection is still empty, offers the one-tap profile import.
    let welcomed; try { welcomed = localStorage.getItem('osu_welcomed') === '1'; } catch { welcomed = true; }
    let welcomeHtml = '';
    if (!welcomed) {
        try { localStorage.setItem('osu_welcomed', '1'); } catch {}
        const emptyCol = OSU_MODES.every(m => getOsuCollection()[m].length === 0);
        welcomeHtml = `<div class="digest-strip digest-welcome">
            <span>${escHtml(t('digest_welcome', { name: user.username || ('#' + user.id) }))}</span>
            ${emptyCol ? `<button class="digest-cta" onclick="importFromOsuProfile()">${escHtml(t('digest_welcome_import'))}</button>` : ''}
            <button class="digest-dismiss" onclick="document.querySelector('.digest-welcome').remove()" aria-label="dismiss">${icon('x', { size: '0.85em' })}</button>
        </div>`;
    }

    if (!welcomeHtml && !goalHtml && !rows.length) { el.innerHTML = ''; return; }
    el.innerHTML = welcomeHtml + goalHtml + (rows.length ? `<div class="digest-strip">
        <span class="digest-label">${escHtml(t('digest_title'))}</span>
        ${rows.map(r => `<span class="digest-item" role="button" tabindex="0" onclick="${r.action}" onkeydown="if(event.key==='Enter'){${r.action}}">${icon(r.icon, { extraClass: 'icon-label-gap' })}${escHtml(r.text)}</span>`).join('')}
    </div>` : '');
}

/* Remove several sets at once, cleaning their category memberships too
   (removeOsuSet only touches the mode arrays). */
async function removeOsuSetsByIds(ids) {
    if (!ids.length || !await verifyOsuPassword()) return;
    const drop = new Set(ids);
    const col = getOsuCollection();
    OSU_MODES.forEach(m => { col[m] = col[m].filter(s => !drop.has(s.beatmapset_id)); });
    saveOsuCollection(col);
    const members = getOsuCategoryMembers();
    for (const k of Object.keys(members)) members[k] = (members[k] || []).filter(id => !drop.has(id));
    saveOsuCategoryMembers(members);
    saveOsuFavorites(getOsuFavorites().filter(id => !drop.has(id)));
    renderOsuCollection();
}

/* Keep the first occurrence of each beatmapset_id (scanning standard→mania),
   drop the rest. */
async function dedupeOsuCollection() {
    if (!await verifyOsuPassword()) return;
    const col = getOsuCollection();
    const seen = new Set();
    let removed = 0;
    for (const m of OSU_MODES) {
        col[m] = col[m].filter(s => {
            if (seen.has(s.beatmapset_id)) { removed++; return false; }
            seen.add(s.beatmapset_id);
            return true;
        });
    }
    saveOsuCollection(col);
    renderOsuCollection();
    const status = document.getElementById('ctools-gen-status');
    if (status) { status.innerText = t('ctools_dedupe_done', { n: removed }); status.style.color = '#34d399'; }
    runCollectionHealthCheck();
}

/* Scans the collection: duplicate set ids (client-side), then a bounded
   re-fetch pass flagging sets that no longer exist on osu!, are no longer
   ranked/approved/loved, or whose difficulty count has changed. */
async function runCollectionHealthCheck() {
    if (!await verifyOsuPassword()) return;
    const out = document.getElementById('ctools-health-results');
    const col = getOsuCollection();
    const allSets = OSU_MODES.flatMap(m => col[m]);
    if (!allSets.length) { out.innerHTML = `<p class="status">${escHtml(t('collection_db_empty'))}</p>`; return; }

    const seen = new Set();
    const dupIds = new Set();
    for (const s of allSets) {
        if (seen.has(s.beatmapset_id)) dupIds.add(s.beatmapset_id);
        else seen.add(s.beatmapset_id);
    }
    const storedById = new Map(allSets.map(s => [s.beatmapset_id, s]));
    const ids = [...seen];

    out.innerHTML = `<p class="status" style="color:#c8a2e0" id="ctools-health-progress"></p>`;
    const prog = document.getElementById('ctools-health-progress');
    const dead = [], nonRanked = [], diffChanged = [];
    const CH = 6;
    for (let i = 0; i < ids.length; i += CH) {
        if (prog) prog.textContent = t('ctools_health_scanning', { done: i, total: ids.length });
        const chunk = ids.slice(i, i + CH);
        const rs = await Promise.all(chunk.map(id => osuFetch(`s=${id}`).catch(() => null)));
        rs.forEach((r, k) => {
            const id = chunk[k];
            const stored = storedById.get(id);
            if (!r || r.length === 0) { dead.push(id); return; }
            if (!['1', '2', '4'].includes(String(r[0].approved))) nonRanked.push(id);
            if (stored && stored.beatmaps && r.length !== stored.beatmaps.length) diffChanged.push(id);
        });
    }

    const dupArr = [...dupIds];
    const rows = [];
    const line = (labelKey, arr, action) => {
        if (!arr.length) return;
        rows.push(`<div class="ctools-health-row">
            <span>${escHtml(t(labelKey, { n: arr.length }))}</span>
            ${action || ''}
        </div>`);
    };
    line('ctools_health_dupes', dupArr,
        dupArr.length ? `<button class="btn btn-sm" onclick="dedupeOsuCollection()">${escHtml(t('ctools_health_dedupe_btn'))}</button>` : '');
    line('ctools_health_dead', dead,
        dead.length ? `<button class="btn btn-sm" onclick="removeOsuSetsByIds([${dead.join(',')}]).then(runCollectionHealthCheck)">${escHtml(t('ctools_health_remove_btn'))}</button>` : '');
    line('ctools_health_diffchanged', diffChanged,
        diffChanged.length ? `<button class="btn btn-sm" onclick="refreshAllOsuSets().then(runCollectionHealthCheck)">${escHtml(t('ctools_health_refresh_btn'))}</button>` : '');
    line('ctools_health_nonranked', nonRanked, '');

    out.innerHTML = rows.length
        ? rows.join('')
        : `<p class="status" style="color:#34d399">${escHtml(t('ctools_health_ok'))}</p>`;
}

/* ===== Shareable collection link =====
   Encodes the collection as gzip+base64url into a URL hash fragment (never
   sent to any server, so there's no size limit imposed by a backend) —
   anyone who opens the link gets prompted to merge those beatmaps into
   their own collection, skipping ones they already have. */
function base64UrlEncode(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function compressToBase64Url(obj) {
    const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    return base64UrlEncode(new Uint8Array(buf));
}

async function decompressFromBase64Url(encoded) {
    const stream = new Blob([base64UrlDecode(encoded)]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
}

async function shareOsuCollectionLink() {
    const col = getOsuCollection();
    const totalSets = OSU_MODES.reduce((sum, m) => sum + col[m].length, 0);
    if (totalSets === 0) {
        showShareToast(t('osu_share_link_empty'));
        return;
    }
    try {
        // Categories/categoryMembers ride along too now (previously
        // share-link-only synced the raw collection, so a beatmap crossing
        // devices this way would silently lose which category/tab it was
        // filed under — the JSON file export/import already carried these,
        // this just brings the share-link path to parity with it).
        const encoded = await compressToBase64Url({
            collection: col,
            categories: getOsuCategories(),
            categoryMembers: getOsuCategoryMembers(),
        });
        const url = `${location.origin}${location.pathname}#import=${encoded}`;
        await navigator.clipboard.writeText(url);
        showShareToast(t('osu_share_link_done'));
    } catch (e) {
        console.error('Share link generation failed:', e);
        showShareToast(t('osu_share_link_fail'));
    }
}

/* Merges an incoming collection (from a share link or, later, a public
   gallery download) into the visitor's own — never overwrites, only adds
   beatmapsets they don't already have. Returns how many were added. */
function mergeIncomingCollection(incoming) {
    const col = getOsuCollection();
    let added = 0;
    for (const mode of OSU_MODES) {
        const existingIds = new Set(col[mode].map(s => s.beatmapset_id));
        for (const set of (incoming[mode] || [])) {
            if (!existingIds.has(set.beatmapset_id)) {
                col[mode].push(set);
                existingIds.add(set.beatmapset_id);
                added++;
            }
        }
    }
    saveOsuCollection(col);
    return added;
}

/* Merges incoming categories into the visitor's own, matching by name
   (category ids are per-device crypto.randomUUID()s — see
   addOsuCategoryFromModal — so two devices' categories never share an id
   even when they're "the same" category by the user's own reckoning,
   making name the only sensible merge key). A name match reuses the local
   id and unions its members; an unmatched incoming category is created
   locally with a fresh id. Members are filtered to beatmapset ids that
   actually exist in the (already-merged) local collection, same defensive
   reasoning as sanitizeImportedCategoryData for the file-import path. */
function mergeIncomingCategories(incomingCategories, incomingCategoryMembers) {
    if (!Array.isArray(incomingCategories) || incomingCategories.length === 0) return 0;
    const col = getOsuCollection();
    const validSetIds = new Set(OSU_MODES.flatMap(m => col[m].map(s => s.beatmapset_id)));

    const localCategories = getOsuCategories();
    const localMembers = getOsuCategoryMembers();
    const nameToLocalId = new Map(localCategories.map(c => [c.name, c.id]));
    let touched = 0;

    for (const inCat of incomingCategories) {
        if (!inCat || typeof inCat.id !== 'string' || typeof inCat.name !== 'string') continue;
        let localId = nameToLocalId.get(inCat.name);
        if (!localId) {
            localId = crypto.randomUUID();
            localCategories.push({ id: localId, name: inCat.name });
            nameToLocalId.set(inCat.name, localId);
        }
        const incomingIds = (incomingCategoryMembers && Array.isArray(incomingCategoryMembers[inCat.id]))
            ? incomingCategoryMembers[inCat.id] : [];
        const merged = new Set(localMembers[localId] || []);
        for (const id of incomingIds) if (validSetIds.has(id)) merged.add(id);
        if (merged.size) { localMembers[localId] = [...merged]; touched++; }
    }

    saveOsuCategories(localCategories);
    saveOsuCategoryMembers(localMembers);
    return touched;
}

async function checkImportFromHash() {
    const hash = location.hash;
    if (!hash.startsWith('#import=')) return;
    const encoded = hash.slice('#import='.length);
    history.replaceState(null, '', location.pathname + location.search);

    try {
        const data = await decompressFromBase64Url(encoded);
        if (!data.collection || !OSU_MODES.every(m => Array.isArray(data.collection[m]))) throw new Error('invalid format');

        const incomingCount = OSU_MODES.reduce((sum, m) => sum + data.collection[m].length, 0);
        if (!confirm(t('osu_share_link_import_confirm', { n: incomingCount }))) return;

        const added = mergeIncomingCollection(data.collection);
        // Older share links (generated before categories were included)
        // simply won't have this field — mergeIncomingCategories no-ops on
        // an empty/missing array, so this stays backward compatible.
        mergeIncomingCategories(data.categories, data.categoryMembers);
        renderOsuCollection();
        showShareToast(t('osu_share_link_imported', { n: added }));
    } catch (e) {
        console.error('Import from link failed:', e);
        showShareToast(t('osu_share_link_import_fail'));
    }
}

function parseOsuInput(input) {
    const urlMatch = input.match(/osu\.ppy\.sh\/(?:beatmaps?|beatmapsets?)\/(\d+)/);
    if (urlMatch) return { type: 'url', id: urlMatch[1], isSet: input.includes('beatmapsets') };
    if (/^\d+$/.test(input.trim())) return { type: 'id', id: input.trim(), isSet: false };
    return null;
}

async function osuFetch(params, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(`/.netlify/functions/osu?${params}`, { signal: controller.signal });
    } catch (e) {
        if (e.name === 'AbortError') throw new Error(`請求逾時（${timeoutMs / 1000}秒）`);
        throw e;
    } finally {
        clearTimeout(timer);
    }
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { throw new Error(`Function 回傳非 JSON (HTTP ${res.status}): ${text.substring(0, 200)}`); }
}

async function addOsuBeatmap(explicitId) {
    if (!await verifyOsuPassword()) return;
    const input = document.getElementById('osuInput');
    const status = document.getElementById('osu-status');
    const raw = explicitId !== undefined ? String(explicitId).trim() : input.value.trim();
    if (!raw) return;

    const parsed = parseOsuInput(raw);
    if (!parsed) {
        status.innerText = t('osu_input_error');
        status.style.color = '#ff5252';
        return;
    }

    status.innerText = t('osu_searching');
    status.style.color = '#c8a2e0';

    try {
        let beatmaps = [];

        if (parsed.isSet || parsed.type === 'url' && raw.includes('beatmapsets')) {
            beatmaps = await osuFetch(`s=${parsed.id}`);
        }

        if (beatmaps.length === 0) {
            const byMap = await osuFetch(`b=${parsed.id}`);
            if (byMap.length > 0) {
                beatmaps = await osuFetch(`s=${byMap[0].beatmapset_id}`);
            }
        }

        if (beatmaps.length === 0 && !parsed.isSet) {
            beatmaps = await osuFetch(`s=${parsed.id}`);
        }

        if (beatmaps.length === 0) {
            status.innerText = t('osu_not_found');
            status.style.color = '#ff5252';
            return;
        }

        const modeNum = parseInt(beatmaps[0].mode);
        const modeKey = OSU_MODE_NAMES[modeNum];
        const col = getOsuCollection();

        const alreadyExists = col[modeKey].some(s => s.beatmapset_id === parseInt(beatmaps[0].beatmapset_id));
        if (alreadyExists) {
            const msg = t('osu_already_exists', { n: `${beatmaps[0].artist} - ${beatmaps[0].title}` });
            status.innerText = msg;
            status.style.color = '#f59e0b';
            if (explicitId !== undefined && typeof showShareToast === 'function') showShareToast(msg);
            return;
        }

        const setInfo = {
            beatmapset_id: parseInt(beatmaps[0].beatmapset_id),
            title: beatmaps[0].title,
            artist: beatmaps[0].artist,
            creator: beatmaps[0].creator,
            mode: modeNum,
            addedAt: new Date().toISOString(),
            beatmaps: beatmaps.map(b => ({
                beatmap_id: parseInt(b.beatmap_id),
                version: b.version,
                difficulty_rating: parseFloat(b.difficultyrating),
                hit_length: parseInt(b.hit_length),
                total_length: parseInt(b.total_length),
                bpm: parseFloat(b.bpm),
                key_count: parseFloat(b.diff_size),
                mode_int: parseInt(b.mode)
            })).sort((a, b) => a.difficulty_rating - b.difficulty_rating)
        };

        // Language/genre come from API v2 (the v1 fetch above only has a
        // coarse language_id) — non-blocking-ish: one extra ~300ms call,
        // and the add still succeeds if it fails (backfill will retry).
        const meta = await fetchOsuSetMeta(setInfo.beatmapset_id);
        if (meta) { setInfo.language = meta.language; setInfo.genre = meta.genre; setInfo.source = meta.source; }

        col[modeKey].unshift(setInfo);
        saveOsuCollection(col);

        status.innerText = t('osu_added', { n: `${setInfo.artist} - ${setInfo.title}`, m: OSU_MODE_LABELS[modeNum], k: setInfo.beatmaps.length });
        status.style.color = '#34d399';
        if (explicitId === undefined) input.value = '';
        else if (typeof showShareToast === 'function') showShareToast(t('osu_added', { n: `${setInfo.artist} - ${setInfo.title}`, m: OSU_MODE_LABELS[modeNum], k: setInfo.beatmaps.length }));

        osuCurrentTab = modeKey;
        osuPage = 0;
        clearAllOsuTabActive();
        const targetTab = document.querySelector(`#osu-collection-tabs [data-mode="${modeKey}"]`);
        if (targetTab) targetTab.classList.add('active');
        renderOsuCollection();
    } catch (e) {
        console.error('osu! fetch error:', e);
        status.innerText = `連線失敗: ${e.message}`;
        status.style.color = '#ff5252';
    }
}

/* .osu-collection-tabs (Favorites/modes) and #osu-category-tabs-row (custom
   categories) are two separate rows but only one tab across both should
   ever be active at once — this clears both before applying the new one. */
function clearAllOsuTabActive() {
    document.getElementById('osu-collection-tabs')?.querySelectorAll('.osu-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('osu-category-tabs-row')?.querySelectorAll('.osu-tab').forEach(t => t.classList.remove('active'));
}

function switchOsuTab(mode, btn) {
    clearAllOsuTabActive();
    btn.classList.add('active');
    osuCurrentTab = mode;
    osuPage = 0;
    renderOsuCollection();
}

async function removeOsuSet(setId) {
    if (!await verifyOsuPassword()) return;
    const col = getOsuCollection();
    OSU_MODES.forEach(m => { col[m] = col[m].filter(s => s.beatmapset_id !== setId); });
    saveOsuCollection(col);
    renderOsuCollection();
}

async function refreshAllOsuSets() {
    if (!await verifyOsuPassword()) return;
    const btn = document.querySelector('.osu-refresh-all');
    const status = document.getElementById('osu-status');
    btn.classList.add('spinning');
    status.innerText = t('osu_refreshing');
    status.style.color = '#c8a2e0';

    const col = getOsuCollection();
    const allIds = [...new Set(OSU_MODES.flatMap(mode => col[mode].map(s => s.beatmapset_id)))];
    const REFRESH_CONCURRENCY = 6;
    osuMetaBackfillRunning = true;   // keep the page-load backfill out of the way

    try {
        for (let i = 0; i < allIds.length; i += REFRESH_CONCURRENCY) {
            const batch = allIds.slice(i, i + REFRESH_CONCURRENCY);
            const results = await Promise.all(batch.map(setId =>
                Promise.all([
                    osuFetch(`s=${setId}`).catch(() => []),
                    fetchOsuSetMeta(setId),
                ]).then(([beatmaps, meta]) => ({ setId, beatmaps, meta }))
            ));
            for (const { setId, beatmaps, meta } of results) {
                for (const mode of OSU_MODES) {
                    const idx = col[mode].findIndex(s => s.beatmapset_id === setId);
                    if (idx < 0) continue;
                    if (beatmaps.length > 0) {
                        col[mode][idx].beatmaps = beatmaps.map(b => ({
                            beatmap_id: parseInt(b.beatmap_id),
                            version: b.version,
                            difficulty_rating: parseFloat(b.difficultyrating),
                            hit_length: parseInt(b.hit_length),
                            total_length: parseInt(b.total_length),
                            bpm: parseFloat(b.bpm),
                            key_count: parseFloat(b.diff_size),
                            mode_int: parseInt(b.mode)
                        })).sort((a, b) => a.difficulty_rating - b.difficulty_rating);
                    }
                    if (meta) { col[mode][idx].language = meta.language; col[mode][idx].genre = meta.genre; col[mode][idx].source = meta.source; }
                    break;
                }
            }
        }
        saveOsuCollection(col);
        renderOsuCollection();
        status.innerText = t('osu_refresh_done', { n: allIds.length });
        status.style.color = '#34d399';
    } catch (e) {
        console.error('Refresh all failed:', e);
        status.innerText = t('osu_refresh_fail');
        status.style.color = '#ff5252';
    } finally {
        btn.classList.remove('spinning');
        osuMetaBackfillRunning = false;
    }
}

/* ===== Collection overview stats (total sets / favorites / star range) —
   purely derived from localStorage, no API calls needed. ===== */
function renderOsuStats() {
    const el = document.getElementById('osu-stats-panel');
    if (!el) return;
    const col = getOsuCollection();
    const seen = new Set();
    const allSets = OSU_MODES.flatMap(m => col[m]).filter(s => {
        if (seen.has(s.beatmapset_id)) return false;
        seen.add(s.beatmapset_id);
        return true;
    });

    if (allSets.length === 0) {
        el.style.display = 'none';
        return;
    }
    el.style.display = '';

    const allRatings = allSets.flatMap(s => s.beatmaps.map(b => b.difficulty_rating)).filter(r => r > 0);
    const avgRating = allRatings.length ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;
    const maxRating = allRatings.length ? Math.max(...allRatings) : 0;
    const favCount = getOsuFavorites().filter(id => allSets.some(s => s.beatmapset_id === id)).length;

    el.innerHTML = `
        <div class="osu-stat">
            <div class="osu-stat-value">${allSets.length}</div>
            <div class="osu-stat-label">${t('osu_stats_total')}</div>
        </div>
        <div class="osu-stat">
            <div class="osu-stat-value">${favCount}</div>
            <div class="osu-stat-label">${t('osu_fav')}</div>
        </div>
        <div class="osu-stat">
            <div class="osu-stat-value">${avgRating.toFixed(2)}⭐</div>
            <div class="osu-stat-label">${t('osu_stats_avg_rating')}</div>
        </div>
        <div class="osu-stat">
            <div class="osu-stat-value">${maxRating.toFixed(2)}⭐</div>
            <div class="osu-stat-label">${t('osu_stats_max_rating')}</div>
        </div>
    `;
}

/* ===== Collection achievements — a small set of milestone badges, all
   computable synchronously from data already in localStorage (collection,
   favorites, tags, practice sets, the last-published flag) so this never
   needs its own network call. Shown inside the stats dashboard modal
   rather than as a separate page — it's a footnote to "how's my collection
   doing", not a standalone feature. `check` takes the same `{allSets,
   col, favs}` context computeUnlockedAchievements() builds once. */
const COLLECTION_ACHIEVEMENTS = [
    { id: 'starter', icon: 'play', check: ({ allSets }) => allSets.length >= 1 },
    { id: 'collector_200', icon: 'star', check: ({ allSets }) => allSets.length >= 200 },
    { id: 'collector_500', icon: 'trophy', check: ({ allSets }) => allSets.length >= 500 },
    { id: 'all_modes', icon: 'sparkles', check: ({ col }) => OSU_MODES.every(m => col[m].length > 0) },
    { id: 'favorites_10', icon: 'heart', check: ({ favs }) => favs.length >= 10 },
    { id: 'polyglot', icon: 'globe', check: ({ allSets }) => new Set(allSets.map(s => s.language && s.language.id).filter(Boolean)).size >= 5 },
    { id: 'practice', icon: 'target', check: () => Object.keys(getPracticeSets()).length >= 1 },
    { id: 'sharer', icon: 'cloudUpload', check: () => !!getLastPublishedAt() },
];

function computeUnlockedAchievements() {
    const col = getOsuCollection();
    const seen = new Set();
    const allSets = OSU_MODES.flatMap(m => col[m]).filter(s => {
        if (seen.has(s.beatmapset_id)) return false;
        seen.add(s.beatmapset_id);
        return true;
    });
    const favs = getOsuFavorites();
    const ctx = { allSets, col, favs };
    return COLLECTION_ACHIEVEMENTS.map(a => {
        let unlocked = false;
        try { unlocked = !!a.check(ctx); } catch { /* treat as locked */ }
        return { ...a, unlocked };
    });
}

function renderAchievementsSection() {
    const list = computeUnlockedAchievements();
    const unlockedCount = list.filter(a => a.unlocked).length;
    return `
        <div class="stats-dashboard-card achievements-card">
            <div class="pp-calc-section-label">${t('achievements_title')} (${unlockedCount}/${list.length})</div>
            <div class="achievements-grid">
                ${list.map(a => `
                    <div class="achievement-badge ${a.unlocked ? 'unlocked' : 'locked'}" title="${escHtml(t('ach_' + a.id + '_desc'))}">
                        <div class="achievement-icon">${icon(a.icon)}</div>
                        <div class="achievement-name">${escHtml(t('ach_' + a.id + '_name'))}</div>
                    </div>`).join('')}
            </div>
        </div>`;
}

/* ===== Collection stats dashboard — richer charts than the flat tiles
   above, all derived from data already in localStorage (no API calls).
   The growth chart is the one exception worth a note: sets added before
   `addedAt` existed (see addOsuBeatmap) have no timestamp, so they're
   bucketed into a single "already had these" starting point rather than
   guessing when they were actually added. ===== */
let statsDashboardCharts = [];

function openStatsDashboardModal() {
    const col = getOsuCollection();
    const seen = new Set();
    const allSets = OSU_MODES.flatMap(m => col[m]).filter(s => {
        if (seen.has(s.beatmapset_id)) return false;
        seen.add(s.beatmapset_id);
        return true;
    });
    const body = document.getElementById('stats-dashboard-body');
    document.getElementById('stats-dashboard-modal').style.display = 'flex';

    if (allSets.length === 0) {
        body.innerHTML = `<p class="osu-empty">${t('stats_dashboard_empty')}</p>`;
        return;
    }

    body.innerHTML = `
        ${renderAchievementsSection()}
        <div class="stats-dashboard-grid">
            <div class="stats-dashboard-card">
                <div class="pp-calc-section-label">${t('stats_dashboard_stars_title')}</div>
                <div class="trend-chart-wrap"><canvas id="stats-chart-stars"></canvas></div>
            </div>
            <div class="stats-dashboard-card">
                <div class="pp-calc-section-label">${t('stats_dashboard_modes_title')}</div>
                <div class="trend-chart-wrap"><canvas id="stats-chart-modes"></canvas></div>
            </div>
            <div class="stats-dashboard-card">
                <div class="pp-calc-section-label">${t('stats_dashboard_mappers_title')}</div>
                <div class="trend-chart-wrap"><canvas id="stats-chart-mappers"></canvas></div>
            </div>
            <div class="stats-dashboard-card">
                <div class="pp-calc-section-label">${t('stats_dashboard_langs_title')}</div>
                <div class="trend-chart-wrap"><canvas id="stats-chart-langs"></canvas></div>
            </div>
            <div class="stats-dashboard-card">
                <div class="pp-calc-section-label">${t('stats_dashboard_genre_title')}</div>
                <div class="trend-chart-wrap"><canvas id="stats-chart-genre"></canvas></div>
            </div>
            <div class="stats-dashboard-card">
                <div class="pp-calc-section-label">${t('stats_dashboard_bpm_title')}</div>
                <div class="trend-chart-wrap"><canvas id="stats-chart-bpm"></canvas></div>
            </div>
            <div class="stats-dashboard-card">
                <div class="pp-calc-section-label">${t('stats_dashboard_length_title')}</div>
                <div class="trend-chart-wrap"><canvas id="stats-chart-length"></canvas></div>
            </div>
            <div class="stats-dashboard-card">
                <div class="pp-calc-section-label">${t('stats_dashboard_growth_title')}</div>
                <div class="trend-chart-wrap"><canvas id="stats-chart-growth"></canvas></div>
            </div>
        </div>
    `;
    // Canvases need real layout dimensions before Chart.js measures them.
    requestAnimationFrame(() => renderStatsDashboardCharts(col, allSets));
}

function closeStatsDashboardModal() {
    document.getElementById('stats-dashboard-modal').style.display = 'none';
    statsDashboardCharts.forEach(c => c.destroy());
    statsDashboardCharts = [];
}

async function renderStatsDashboardCharts(col, allSets) {
    if (typeof Chart === 'undefined') { try { await ensureCharts(); } catch (e) { return; } }
    const colors = ppChartColors();
    const purple = getComputedStyle(document.documentElement).getPropertyValue('--accent-purple').trim() || '#a855f7';
    statsDashboardCharts.forEach(c => c.destroy());
    statsDashboardCharts = [];

    const starBuckets = new Array(9).fill(0);
    allSets.forEach(s => s.beatmaps.forEach(b => {
        starBuckets[Math.min(8, Math.max(0, Math.floor(b.difficulty_rating || 0)))]++;
    }));
    statsDashboardCharts.push(new Chart(document.getElementById('stats-chart-stars'), {
        type: 'bar',
        data: {
            labels: starBuckets.map((_, i) => i === 8 ? '8+' : `${i}-${i + 1}`),
            datasets: [{ data: starBuckets, backgroundColor: colors.accent, borderRadius: 4 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: colors.label, font: { size: 10 } } },
                y: { grid: { color: colors.grid }, ticks: { color: colors.label, font: { size: 10 }, precision: 0 } },
            },
        },
    }));

    statsDashboardCharts.push(new Chart(document.getElementById('stats-chart-modes'), {
        type: 'doughnut',
        data: {
            labels: OSU_MODE_LABELS,
            datasets: [{ data: OSU_MODES.map(m => col[m].length), backgroundColor: [colors.accent, purple, '#34d399', '#f59e0b'] }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: colors.text, font: { size: 10 }, boxWidth: 10 } } },
        },
    }));

    // Language mix — tally by v2 language id, missing -> "unlabeled" bucket.
    const langTally = new Map();
    allSets.forEach(s => {
        const key = s.language && s.language.id ? s.language.id : 'unknown';
        langTally.set(key, (langTally.get(key) || 0) + 1);
    });
    const langEntries = [...langTally.entries()].sort((a, b) => b[1] - a[1]);
    const langPalette = ['#f472b6', '#a855f7', '#c084fc', '#22d3ee', '#34d399', '#f59e0b', '#60a5fa', '#f87171', '#818cf8', '#fbbf24', '#4ade80', '#e879f9', '#2dd4bf', '#fb7185'];
    statsDashboardCharts.push(new Chart(document.getElementById('stats-chart-langs'), {
        type: 'doughnut',
        data: {
            labels: langEntries.map(([k]) => k === 'unknown'
                ? t('lang_unknown')
                : (OSU_LANGUAGES[k] ? `${OSU_LANGUAGES[k].flag} ${t(OSU_LANGUAGES[k].key)}` : String(k))),
            datasets: [{ data: langEntries.map(([, n]) => n), backgroundColor: langEntries.map((_, i) => langPalette[i % langPalette.length]) }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: colors.text, font: { size: 10 }, boxWidth: 10 } } },
        },
    }));

    const mapperCounts = new Map();
    allSets.forEach(s => { if (s.creator) mapperCounts.set(s.creator, (mapperCounts.get(s.creator) || 0) + 1); });
    const topMappers = [...mapperCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    statsDashboardCharts.push(new Chart(document.getElementById('stats-chart-mappers'), {
        type: 'bar',
        data: { labels: topMappers.map(m => m[0]), datasets: [{ data: topMappers.map(m => m[1]), backgroundColor: purple, borderRadius: 4 }] },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: colors.grid }, ticks: { color: colors.label, font: { size: 10 }, precision: 0 } },
                y: { grid: { display: false }, ticks: { color: colors.label, font: { size: 10 } } },
            },
        },
    }));

    // Genre mix — set-level v2 genre id, missing -> "unspecified" bucket.
    const genreTally = new Map();
    allSets.forEach(s => {
        const key = s.genre && s.genre.id ? s.genre.id : 'unknown';
        genreTally.set(key, (genreTally.get(key) || 0) + 1);
    });
    const genreEntries = [...genreTally.entries()].sort((a, b) => b[1] - a[1]);
    const genrePalette = ['#a855f7', '#22d3ee', '#f472b6', '#34d399', '#f59e0b', '#60a5fa', '#f87171', '#c084fc', '#4ade80', '#fbbf24', '#e879f9', '#2dd4bf'];
    statsDashboardCharts.push(new Chart(document.getElementById('stats-chart-genre'), {
        type: 'doughnut',
        data: {
            labels: genreEntries.map(([k]) => k === 'unknown'
                ? t('genre_unspecified')
                : (OSU_GENRES[k] ? t(OSU_GENRES[k]) : String(k))),
            datasets: [{ data: genreEntries.map(([, n]) => n), backgroundColor: genreEntries.map((_, i) => genrePalette[i % genrePalette.length]) }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: colors.text, font: { size: 10 }, boxWidth: 10 } } },
        },
    }));

    // BPM spread — one tally per difficulty (a set can span multiple BPMs).
    const bpmEdges = [120, 150, 170, 190, 210, 240];
    const bpmLabels = ['<120', '120-150', '150-170', '170-190', '190-210', '210-240', '240+'];
    const bpmBuckets = new Array(bpmLabels.length).fill(0);
    allSets.forEach(s => s.beatmaps.forEach(b => {
        const v = b.bpm || 0;
        let idx = bpmEdges.findIndex(e => v < e);
        if (idx === -1) idx = bpmLabels.length - 1;
        bpmBuckets[idx]++;
    }));
    statsDashboardCharts.push(new Chart(document.getElementById('stats-chart-bpm'), {
        type: 'bar',
        data: { labels: bpmLabels, datasets: [{ data: bpmBuckets, backgroundColor: colors.accent, borderRadius: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: colors.label, font: { size: 9 }, maxRotation: 0, autoSkip: false } },
                y: { grid: { color: colors.grid }, ticks: { color: colors.label, font: { size: 10 }, precision: 0 } },
            },
        },
    }));

    // Drain-length spread — total_length (seconds) per difficulty.
    const lenEdges = [90, 150, 210, 300];
    const lenLabels = ['<1:30', '1:30-2:30', '2:30-3:30', '3:30-5:00', '5:00+'];
    const lenBuckets = new Array(lenLabels.length).fill(0);
    allSets.forEach(s => s.beatmaps.forEach(b => {
        const v = b.total_length || 0;
        let idx = lenEdges.findIndex(e => v < e);
        if (idx === -1) idx = lenLabels.length - 1;
        lenBuckets[idx]++;
    }));
    statsDashboardCharts.push(new Chart(document.getElementById('stats-chart-length'), {
        type: 'bar',
        data: { labels: lenLabels, datasets: [{ data: lenBuckets, backgroundColor: purple, borderRadius: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: colors.label, font: { size: 9 }, maxRotation: 0, autoSkip: false } },
                y: { grid: { color: colors.grid }, ticks: { color: colors.label, font: { size: 10 }, precision: 0 } },
            },
        },
    }));

    const dated = allSets.filter(s => s.addedAt).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    const undatedCount = allSets.length - dated.length;
    const growthLabels = [];
    const growthData = [];
    let running = undatedCount;
    if (undatedCount > 0) { growthLabels.push(t('stats_dashboard_growth_baseline')); growthData.push(running); }
    const byDay = new Map();
    dated.forEach(s => { const day = s.addedAt.slice(0, 10); byDay.set(day, (byDay.get(day) || 0) + 1); });
    [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([day, count]) => {
        running += count;
        growthLabels.push(formatPpChartDate(day));
        growthData.push(running);
    });
    statsDashboardCharts.push(new Chart(document.getElementById('stats-chart-growth'), {
        type: 'line',
        data: {
            labels: growthLabels,
            datasets: [{
                data: growthData, borderColor: colors.accent, backgroundColor: colors.accent + '2a',
                pointRadius: 2.5, pointBackgroundColor: colors.accent, borderWidth: 2, tension: 0.25, fill: true,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: colors.grid }, ticks: { color: colors.label, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                y: { grid: { color: colors.grid }, ticks: { color: colors.label, font: { size: 10 }, precision: 0 } },
            },
        },
    }));
}

/* ===== Today's featured beatmap: a deterministic daily pick from the whole
   collection (all modes combined), so today's pick is the same across tabs/
   reloads but changes once a day — same pattern as the pjsekai/wuwa sibling
   sites' "featured character of the day". ===== */
function renderFeaturedBeatmap() {
    const el = document.getElementById('featured-beatmap-banner');
    if (!el) return;
    const col = getOsuCollection();
    const seen = new Set();
    const allSets = OSU_MODES.flatMap(m => col[m].map(s => ({ ...s, __mode: m }))).filter(s => {
        if (seen.has(s.beatmapset_id)) return false;
        seen.add(s.beatmapset_id);
        return true;
    });

    if (allSets.length === 0) {
        el.style.display = 'none';
        return;
    }

    const dayIndex = Math.floor(Date.now() / 86400000) % allSets.length;
    const set = allSets[dayIndex];
    const coverUrl = `https://assets.ppy.sh/beatmaps/${set.beatmapset_id}/covers/cover.jpg`;

    el.style.display = 'flex';
    el.onclick = () => window.open(`https://osu.ppy.sh/beatmapsets/${set.beatmapset_id}`, '_blank');
    el.innerHTML = `
        <div class="featured-beatmap-bg" style="background-image:url('${coverUrl}')"></div>
        <div class="featured-beatmap-overlay"></div>
        <button class="osu-play-btn featured-beatmap-play" onclick="playOsuPreview(${set.beatmapset_id}, event)" title="${t('mappools_preview')}" aria-label="${t('mappools_preview')}">${playBtnIcon()}</button>
        <div class="featured-beatmap-info">
            <div class="featured-beatmap-label">${t('featured_beatmap_label')}</div>
            <div class="featured-beatmap-title">${modeIconSvg(set.__mode)} ${set.title}</div>
            <div class="featured-beatmap-artist">${set.artist} · ${t('mapped_by', { n: set.creator })}</div>
        </div>
    `;
}

/* ===== Landing hero (empty-collection state) =====
   A first-time visitor with nothing collected lands on an empty grid — this
   panel above it pitches what the site does and shows a couple of live
   numbers. Hidden the moment the collection has anything in it. */
let collectionHeroInit = false;

function updateCollectionHeroVisibility() {
    const hero = document.getElementById('collection-hero');
    if (!hero) return;
    const col = getOsuCollection();
    const empty = OSU_MODES.every(m => col[m].length === 0);
    hero.hidden = !empty;
    if (empty && !collectionHeroInit) initCollectionHero();
}

function initCollectionHero() {
    collectionHeroInit = true;
    const cta = document.getElementById('collection-hero-cta');
    if (cta) cta.hidden = !!getLoggedInOsuUser();

    const statsEl = document.getElementById('collection-hero-stats');
    if (!statsEl) return;
    Promise.allSettled([
        // The published-collection count is tiny while the gallery is young
        // and reads as "nobody uses this" — lead instead with the farm
        // dataset the crawler has actually built (tens of thousands of maps).
        fetch('/.netlify/functions/farm-maps-list?mode=osu&mods=NM&page=0').then(r => (r.ok ? r.json() : null)),
        fetch('/.netlify/functions/site-likes').then(r => (r.ok ? r.json() : null)),
    ]).then(([a, b]) => {
        const computed = a.status === 'fulfilled' && a.value && a.value.coverage && typeof a.value.coverage.computedCount === 'number'
            ? a.value.coverage.computedCount : null;
        const likes = b.status === 'fulfilled' && b.value && typeof b.value.likes === 'number' ? b.value.likes : null;
        const parts = [];
        if (computed != null && computed > 1000) {
            parts.push(t('hero_stat_farm', { n: (Math.floor(computed / 1000) * 1000).toLocaleString() }));
        }
        if (likes != null) parts.push(t('hero_stat_likes', { n: likes.toLocaleString() }));
        statsEl.textContent = parts.join('   ·   ');
    });
}

/* Redesign: framed cover-art hero at the top of the collection page
   (docs/visual-redesign-spec.md §7.4). Two stacked layers cross-fade
   through the visitor's own covers — but only on a real pointer with
   motion allowed, and only while on-screen + tab visible (the old
   full-page carousel was killed for heating phones; this one is a small
   contained element, opacity-only, and pauses aggressively). Touch /
   reduced-motion / single cover -> one static cover. */
const heroCover = { urls: [], idx: 0, timer: null, io: null };

function heroCoverAllowed() {
    return heroCover.urls.length > 1
        && window.matchMedia('(hover: hover)').matches
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function stopHeroCover() {
    clearTimeout(heroCover.timer);
    heroCover.timer = null;
    if (heroCover.io) { heroCover.io.disconnect(); heroCover.io = null; }
}

function heroCoverTick(layers) {
    heroCover.timer = setTimeout(() => {
        const curI = layers[0].classList.contains('active') ? 0 : 1;
        const nxtI = curI ? 0 : 1;
        heroCover.idx = (heroCover.idx + 1) % heroCover.urls.length;
        const url = heroCover.urls[heroCover.idx];
        const pre = new Image();
        pre.onload = () => {
            layers[nxtI].style.backgroundImage = `url("${url}")`;
            layers[nxtI].classList.add('active');
            layers[curI].classList.remove('active');
        };
        pre.src = url;
        heroCoverTick(layers);
    }, 7000);
}

function heroOnScreen(el) {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

function armHeroCover(hero, layers) {
    if (heroCover.io) return;   // already armed
    heroCover.io = new IntersectionObserver(es => {
        const onScreen = es[es.length - 1].isIntersecting && !document.hidden;
        if (onScreen) { if (!heroCover.timer) heroCoverTick(layers); }
        else { clearTimeout(heroCover.timer); heroCover.timer = null; }
    }, { threshold: 0.1 });
    heroCover.io.observe(hero);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { clearTimeout(heroCover.timer); heroCover.timer = null; }
        else if (!heroCover.timer && heroOnScreen(hero)) heroCoverTick(layers);
    });
    // IO's first callback can miss a display:none -> block transition, so
    // start it here if the hero is already visible.
    if (!heroCover.timer && heroOnScreen(hero) && !document.hidden) heroCoverTick(layers);
}

function updateCollectionHeroV2() {
    const hero = document.getElementById('collection-hero-v2');
    if (!hero) return;
    const col = getOsuCollection();
    const seen = new Set();
    const sets = OSU_MODES.flatMap(m => col[m]).filter(s => !seen.has(s.beatmapset_id) && seen.add(s.beatmapset_id));
    const cats = typeof getOsuCategories === 'function' ? getOsuCategories().length : 0;
    const statEl = document.getElementById('collection-hero-v2-stat');
    if (statEl) statEl.textContent = sets.length ? t('hero_v2_stat', { n: sets.length.toLocaleString(), c: cats }) : '';

    const layers = hero.querySelectorAll('.hero-cover');
    if (!sets.length) {
        // Empty collection: the #collection-hero pitch box is the hero
        // instead (updateCollectionHeroVisibility shows it) — don't stack a
        // second one.
        hero.hidden = true;
        hero.classList.remove('has-cover');
        stopHeroCover();
        heroCover.urls = [];
        layers.forEach(l => { l.style.backgroundImage = ''; l.classList.remove('active'); });
        return;
    }
    hero.hidden = false;
    hero.classList.add('has-cover');

    if (heroCover.urls.length !== sets.length) {
        const ids = sets.map(s => s.beatmapset_id);
        for (let i = ids.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [ids[i], ids[j]] = [ids[j], ids[i]]; }
        heroCover.urls = ids.map(id => `https://assets.ppy.sh/beatmaps/${id}/covers/cover@2x.jpg`);
        heroCover.idx = 0;
        stopHeroCover();
        if (layers[0]) {
            layers[0].style.backgroundImage = `url("${heroCover.urls[0]}")`;
            layers[0].classList.add('active');
            if (layers[1]) layers[1].classList.remove('active');
        }
    }
    if (heroCoverAllowed()) armHeroCover(hero, layers);
}

function renderOsuCollection() {
    const container = document.getElementById('osu-collection');
    const paginationEl = document.getElementById('osu-pagination');
    if (!container || !paginationEl) return;
    updateCollectionHeroVisibility();
    updateCollectionHeroV2();
    renderOsuStats();
    renderFeaturedBeatmap();
    renderOsuCategoryTabsRow();
    const col = getOsuCollection();
    let sets;

    if (osuCurrentTab === 'all') {
        // Every set across all four mode arrays, deduped — one flat list so
        // you don't have to click through Standard/Taiko/Catch/Mania to see
        // the whole collection. Difficulties aren't filtered by mode here.
        const seen = new Set();
        sets = OSU_MODES.flatMap(m => col[m].map(s => ({ ...s, __mode: m })))
            .filter(s => !seen.has(s.beatmapset_id) && seen.add(s.beatmapset_id));
    } else if (!OSU_MODES.includes(osuCurrentTab)) {
        const memberIds = osuCurrentTab === 'favorites' ? getOsuFavorites() : getCategoryMemberIds(osuCurrentTab);
        const allSets = OSU_MODES.flatMap(m => col[m].map(s => ({ ...s, __mode: m })));
        const seen = new Set();
        sets = allSets.filter(s => {
            if (memberIds.includes(s.beatmapset_id) && !seen.has(s.beatmapset_id)) {
                seen.add(s.beatmapset_id);
                return true;
            }
            return false;
        });
    } else {
        // A set is stored under exactly one mode array (whichever the API
        // reported for its first difficulty at add-time), but a crossover
        // set can still have individual difficulties in *other* modes — so
        // a mode tab must search every array for sets with a matching diff,
        // not just the array the set happens to be filed under. The current
        // tab's own array goes first so its natural newest-added-first order
        // (unshift on add) isn't pushed down by other arrays' entries ahead
        // of it — those only matter here as a fallback for crossover sets.
        const seen = new Set();
        const orderedModes = [osuCurrentTab, ...OSU_MODES.filter(m => m !== osuCurrentTab)];
        const allSets = orderedModes.flatMap(m => col[m].map(s => ({ ...s, __homeMode: m })));
        sets = allSets.filter(s => {
            if (seen.has(s.beatmapset_id)) return false;
            const hasTabMode = s.beatmaps.some(b => (OSU_MODE_NAMES[b.mode_int] || s.__homeMode) === osuCurrentTab);
            if (!hasTabMode) return false;
            seen.add(s.beatmapset_id);
            return true;
        }).map(s => ({ ...s, __mode: osuCurrentTab }));
    }

    if (osuSearchQuery) {
        const q = osuSearchQuery.toLowerCase();
        sets = sets.filter(s =>
            s.title.toLowerCase().includes(q) ||
            s.artist.toLowerCase().includes(q) ||
            s.creator.toLowerCase().includes(q)
        );
    }

    // Filter dropdowns track whatever's actually in this tab's sets; build
    // all three from the same snapshot before any of them narrows `sets`, so
    // each dropdown still lists every option regardless of the others.
    renderOsuLangFilterOptions(sets);
    renderOsuGenreFilterOptions(sets);
    renderOsuSourceFilterOptions(sets);
    renderOsuArtistFilterOptions(sets);
    if (osuLangFilter === 'unknown') {
        sets = sets.filter(s => !s.language);
    } else if (osuLangFilter !== 'all') {
        sets = sets.filter(s => s.language && String(s.language.id) === osuLangFilter);
    }
    if (osuGenreFilter === 'unknown') {
        sets = sets.filter(s => !s.genre);
    } else if (osuGenreFilter !== 'all') {
        sets = sets.filter(s => s.genre && String(s.genre.id) === osuGenreFilter);
    }
    if (osuSourceFilter === 'none') {
        sets = sets.filter(s => !(s.source || '').trim());
    } else if (osuSourceFilter !== 'all') {
        sets = sets.filter(s => (s.source || '').trim() === osuSourceFilter);
    }
    if (osuArtistFilter !== 'all') {
        sets = sets.filter(s => artistKeys(s.artist).includes(osuArtistFilter));
    }

    sets = sortOsuSets(sets);
    osuCurrentViewSets = sets;

    if (sets.length === 0) {
        const msg = osuSearchQuery
            ? t('osu_search_empty')
            : osuCurrentTab === 'favorites'
                ? `${t('osu_empty_fav')}<br><span>${t('osu_empty_fav_hint')}</span>`
                : (osuCurrentTab !== 'all' && !OSU_MODES.includes(osuCurrentTab))
                    ? t('osu_empty_category')
                    : `${t('osu_empty_collection')}<br><span>${t('osu_empty_hint')}</span><br><span class="osu-empty-sub">${t('osu_empty_banner_hint')}</span>`;
        container.innerHTML = smartCategoryBannerHtml() + `<div class="osu-empty">${msg}</div>`;
        paginationEl.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(sets.length / OSU_PAGE_SIZE);
    if (osuPage >= totalPages) osuPage = totalPages - 1;
    if (osuPage < 0) osuPage = 0;
    const pageSets = sets.slice(osuPage * OSU_PAGE_SIZE, (osuPage + 1) * OSU_PAGE_SIZE);

    // Repopulated on every render so "checkCollectionPlayedStatus()" (the
    // 已遊玩 button) always checks exactly the sets currently on screen —
    // representative of each set by its hardest visible difficulty, so the
    // check stays bounded to one API call per card instead of one per
    // difficulty (a set can have a dozen).
    osuPageCheckTargets = [];

    container.innerHTML = pageSets.map(set => {
        const coverUrl = `https://assets.ppy.sh/beatmaps/${set.beatmapset_id}/covers/card.jpg`;
        const isFav = isOsuFavorited(set.beatmapset_id);
        const isLocalDl = typeof isLocalDbMatched === 'function' && isLocalDbMatched(set.beatmapset_id);
        // A beatmapset can mix rulesets (e.g. a taiko+mania crossover set) —
        // each difficulty may belong to a different mode than the set's own
        // collection category, so prefer each beatmap's own mode_int (added
        // via refresh) over set.__mode, falling back for un-refreshed data.
        const diffMode = (b) => OSU_MODE_NAMES[b.mode_int] || set.__mode;
        // On a mode tab (Standard/Taiko/Catch/Mania), only show this set's
        // difficulties that actually belong to that mode — a crossover set
        // shows its mania diffs under Mania and its taiko diffs under Taiko,
        // not all of them mixed together everywhere it's listed.
        const tabBeatmaps = OSU_MODES.includes(osuCurrentTab) ? set.beatmaps.filter(b => diffMode(b) === osuCurrentTab) : set.beatmaps;
        const diffBeatmaps = tabBeatmaps.length > 0 ? tabBeatmaps : set.beatmaps;
        const starsMin = Math.min(...diffBeatmaps.map(b => b.difficulty_rating));
        const starsMax = Math.max(...diffBeatmaps.map(b => b.difficulty_rating));
        const hardestDiff = diffBeatmaps.find(b => b.difficulty_rating === starsMax) || diffBeatmaps[diffBeatmaps.length - 1];
        const diffUrl = (beatmapId, mode) => `https://osu.ppy.sh/beatmapsets/${set.beatmapset_id}#${OSU_API_MODE[mode] || 'osu'}/${beatmapId}`;
        // Mania beatmapsets often mix key counts (4K/7K/etc, from CS) across
        // difficulties of the same set — surface that in the hover label.
        const diffLabel = (b) => (diffMode(b) === 'mania' && b.key_count) ? `${b.version} [${Math.round(b.key_count)}K]` : b.version;
        const diffIconsRow = `<div class="osu-card-diff-row">${diffBeatmaps.map(b => modeDiffIcon(diffMode(b), b.difficulty_rating, diffLabel(b), diffUrl(b.beatmap_id, diffMode(b)))).join('')}</div>`;
        osuPageCheckTargets.push({ setId: set.beatmapset_id, beatmapId: hardestDiff.beatmap_id, mode: OSU_MODES.indexOf(diffMode(hardestDiff)) });
        // Language badge (API v2, via backfill / add / refresh). A set that
        // hasn't been backfilled yet shows 🌐 未標記 until it fills in.
        const langLabel = osuLangName(set) || t('lang_unknown');
        const langBadge = `<span class="osu-lang-badge" data-tip="${escHtml(langLabel)}">${set.language ? osuLangFlag(set) : '🌐'} ${escHtml(langLabel)}</span>`;
        return `
        <div class="osu-card" data-set-id="${set.beatmapset_id}" onclick="window.open('https://osu.ppy.sh/beatmapsets/${set.beatmapset_id}','_blank')">
            <div class="osu-card-bg" style="background-image:url('${coverUrl}')"></div>
            <div class="osu-card-overlay"></div>
            <button class="osu-play-btn" onclick="playOsuPreview(${set.beatmapset_id}, event)" title="${t('mappools_preview')}" aria-label="${t('mappools_preview')}"${osuPreviewBeatStyle(hardestDiff.bpm)}>${playBtnIcon()}</button>
            <div class="osu-card-actions">
                <button class="osu-fav-btn ${isFav ? 'active' : ''}" onclick="toggleOsuFavorite(${set.beatmapset_id}, event)" title="${isFav ? t('osu_unfav_btn_title') : t('osu_fav_btn_title')}" aria-label="${isFav ? t('osu_unfav_btn_title') : t('osu_fav_btn_title')}">${icon('heart', { filled: isFav })}</button>
                <button class="osu-category-btn" onclick="toggleCategoryPicker(${set.beatmapset_id}, event)" title="${t('osu_category_btn_title')}" aria-label="${t('osu_category_btn_title')}">${icon('tag')}</button>
                <button class="osu-ppcalc-btn" onclick="openPpCalcModal(${set.beatmapset_id}, event)" title="${t('pp_calc_btn_title')}" aria-label="${t('pp_calc_btn_title')}">${icon('barChart3')}</button>
                <span class="osu-card-actions-sep" aria-hidden="true"></span>
                <button class="osu-copy-btn" onclick="copyBeatmapId(${set.beatmapset_id}, event)" title="${t('mappools_copy_id')}" aria-label="${t('mappools_copy_id')}">${icon('copy')}</button>
                <button class="osu-mp-btn" onclick="copyMpMap(${set.beatmapset_id}, event)" title="${t('mplist_mp_hint')}" aria-label="${t('mplist_mp_hint')}">${icon('swords')}</button>
                <button class="osu-download-btn ${isLocalDl ? 'db-matched' : ''}" onclick="downloadBeatmapset(${set.beatmapset_id}, event)" title="${isLocalDl ? t('local_db_matched_title') : t('osu_download_btn_title')}" aria-label="${isLocalDl ? t('local_db_matched_title') : t('osu_download_btn_title')}">${icon('download')}</button>
                <span class="osu-card-actions-sep" aria-hidden="true"></span>
                <button class="osu-delete-btn" onclick="event.stopPropagation();removeOsuSet(${set.beatmapset_id})" title="${t('osu_delete_btn_title')}" aria-label="${t('osu_delete_btn_title')}">${icon('x')}</button>
            </div>
            <div class="osu-card-lang-corner">${langBadge}</div>
            <div class="osu-card-mode-badge"><span class="mode-diff-icon" title="${escHtml((starsMin === starsMax ? `${starsMax.toFixed(2)} ⭐` : `${starsMin.toFixed(2)}~${starsMax.toFixed(2)} ⭐`) + (diffMode(hardestDiff) === 'mania' && hardestDiff.key_count ? ` [${Math.round(hardestDiff.key_count)}K]` : ''))}" onclick="event.stopPropagation();window.open('${diffUrl(hardestDiff.beatmap_id, diffMode(hardestDiff))}','_blank')" style="cursor:pointer">${modeIconSvg(diffMode(hardestDiff), starRatingColor(starsMax))}</span></div>
            <div class="osu-play-status" id="play-status-${set.beatmapset_id}" style="display:none;"></div>
            <div class="osu-card-info">
                <div class="osu-card-title">${set.title}</div>
                ${diffIconsRow}
                <div class="osu-card-artist">${set.artist}</div>
                <div class="osu-card-mapper">${t('mapped_by', { n: set.creator })}</div>
            </div>
        </div>`;
    }).join('');

    const smartBanner = smartCategoryBannerHtml();
    if (smartBanner) container.insertAdjacentHTML('afterbegin', smartBanner);

    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
    } else {
        let pages = '';
        pages += `<button class="osu-page-btn" onclick="osuPage=0;renderOsuCollection()" ${osuPage===0?'disabled':''}>«</button>`;
        pages += `<button class="osu-page-btn" onclick="osuPage=Math.max(0,osuPage-1);renderOsuCollection()" ${osuPage===0?'disabled':''}>‹</button>`;
        pages += buildPaginationPageButtons(osuPage, totalPages, (i) => `osuPage=${i};renderOsuCollection()`);
        pages += `<button class="osu-page-btn" onclick="osuPage=Math.min(${totalPages-1},osuPage+1);renderOsuCollection()" ${osuPage>=totalPages-1?'disabled':''}>›</button>`;
        pages += `<button class="osu-page-btn" onclick="osuPage=${totalPages-1};renderOsuCollection()" ${osuPage>=totalPages-1?'disabled':''}>»</button>`;
        paginationEl.innerHTML = pages;
    }
}

/* ===== 收藏 vs 已遊玩比對 — cross-references the current page's collected
   sets against the logged-in osu! account's actual scores, via get_scores'
   own `u` filter (added as netlify/functions/osu.js's `scoreBeatmap`
   branch). Bounded to one score lookup per *set* (its hardest visible
   difficulty, from osuPageCheckTargets — see renderOsuCollection()) rather
   than per difficulty, and only for the visible page, rather than the
   whole collection, so a click here stays a handful of parallel requests
   instead of potentially hundreds. ===== */
async function checkCollectionPlayedStatus() {
    const user = getLoggedInOsuUser();
    const btn = document.getElementById('osu-check-played-btn');
    if (!user || osuPageCheckTargets.length === 0) return;

    if (btn) { btn.disabled = true; btn.classList.add('checking'); }
    try {
        await Promise.all(osuPageCheckTargets.map(async ({ setId, beatmapId, mode }) => {
            const el = document.getElementById(`play-status-${setId}`);
            if (!el || mode < 0) return;
            try {
                const scores = await osuFetch(`scoreBeatmap=${beatmapId}&scoreUser=${user.id}&m=${mode}`);
                const score = Array.isArray(scores) ? scores[0] : null;
                if (!score) {
                    el.className = 'osu-play-status unplayed';
                    el.title = t('play_status_unplayed_title');
                    el.textContent = '–';
                } else {
                    const rankClass = OSU_RANK_CLASS[score.rank] || 'f';
                    const isFc = (parseInt(score.countmiss) || 0) === 0;
                    el.className = `osu-play-status rank-${rankClass}`;
                    el.title = t(isFc ? 'play_status_fc_title' : 'play_status_played_title', { rank: score.rank || '?' });
                    el.textContent = score.rank || '?';
                }
                el.style.display = 'flex';
                // Reserves room in .osu-card-info's left padding so the badge
                // doesn't sit on top of the title/artist text below it — only
                // applied once a card is actually checked, so cards nobody's
                // checked yet keep their original (un-padded) layout.
                el.closest('.osu-card')?.classList.add('has-play-status');
            } catch (e) {
                console.error('Played-status check failed for beatmap', beatmapId, e);
            }
        }));
    } finally {
        if (btn) { btn.disabled = false; btn.classList.remove('checking'); }
    }
}

const COUNTRY_NAMES = {
    TW: 'Taiwan', JP: 'Japan', KR: 'South Korea', US: 'United States',
    CN: 'China', HK: 'Hong Kong', RU: 'Russia', FR: 'France',
    DE: 'Germany', GB: 'United Kingdom', BR: 'Brazil', PH: 'Philippines',
    ID: 'Indonesia', TH: 'Thailand', PL: 'Poland', AU: 'Australia',
    CA: 'Canada', MX: 'Mexico', AR: 'Argentina', CL: 'Chile',
};

function calcOsuAccuracy(r, mode) {
    const c300 = parseInt(r.count300) || 0;
    const c100 = parseInt(r.count100) || 0;
    const c50 = parseInt(r.count50) || 0;
    const cmiss = parseInt(r.countmiss) || 0;
    const cgeki = parseInt(r.countgeki) || 0;
    const ckatu = parseInt(r.countkatu) || 0;
    let acc = 0;
    if (mode === 1) {
        const total = c300 + c100 + cmiss;
        acc = total > 0 ? (c300 + c100 * 0.5) / total : 0;
    } else if (mode === 2) {
        const total = c300 + c100 + c50 + cmiss + ckatu;
        acc = total > 0 ? (c300 + c100 + c50) / total : 0;
    } else if (mode === 3) {
        const total = cgeki + c300 + ckatu + c100 + c50 + cmiss;
        acc = total > 0 ? (cgeki * 300 + c300 * 300 + ckatu * 200 + c100 * 100 + c50 * 50) / (total * 300) : 0;
    } else {
        const total = c300 + c100 + c50 + cmiss;
        acc = total > 0 ? (c300 * 300 + c100 * 100 + c50 * 50) / (total * 300) : 0;
    }
    return (acc * 100).toFixed(2);
}

const OSU_RANK_CLASS = { XH: 'ss', X: 'ss', SH: 's', S: 's', A: 'a', B: 'b', C: 'c', D: 'd', F: 'f' };

function decodeOsuMods(bitmask) {
    bitmask = parseInt(bitmask) || 0;
    if (!bitmask) return [];
    const hasNC = !!(bitmask & 512);
    const hasPF = !!(bitmask & 16384);
    const table = [
        [1, 'NF'], [2, 'EZ'], [8, 'HD'], [16, 'HR'],
        [32, hasPF ? null : 'SD'], [64, hasNC ? null : 'DT'],
        [128, 'RX'], [256, 'HT'], [512, 'NC'], [1024, 'FL'],
        [4096, 'SO'], [8192, 'AP'], [16384, 'PF']
    ];
    return table.filter(([bit, name]) => name && (bitmask & bit)).map(([, name]) => name);
}

/* Handles both "最近遊玩" (get_user_recent) and "最佳成績" (get_user_best) —
   same response shape from the v1 API (score objects keyed by beatmap_id),
   the only real difference is which endpoint/limit to use and that best-play
   entries carry a `pp` field worth showing. See switchVisitorPlaysType(). */
/* Shimmering stand-ins for .osu-recent-item rows, shown in the list
   container while its fetch is in flight (see renderOsuPlaysList below). */
function playsListSkeletonHTML(count) {
    return Array.from({ length: count }, () => '<div class="osu-recent-item skeleton" aria-hidden="true"></div>').join('');
}

/* One .osu-recent-item card's markup — pulled out of renderOsuPlaysList so
   the two-player Top Play comparison (loadPpCompareTopPlays below) can
   build the exact same card for each side without duplicating this. */
function osuPlayItemHtml(r, mode, bm, type) {
    const title = bm ? `${bm.title} [${bm.version}]` : `Beatmap #${r.beatmap_id}`;
    const coverUrl = bm ? `https://assets.ppy.sh/beatmaps/${bm.beatmapset_id}/covers/card.jpg` : '';
    const acc = calcOsuAccuracy(r, mode);
    const rankClass = OSU_RANK_CLASS[r.rank] || 'f';
    const mods = decodeOsuMods(r.enabled_mods);
    const modsStr = mods.length > 0 ? ' · ' + mods.join(',') : '';
    const d = new Date(String(r.date).replace(' ', 'T') + 'Z');
    const dateStr = isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const ppStr = type === 'best' && r.pp != null ? `${Math.round(parseFloat(r.pp)).toLocaleString()}pp · ` : '';
    // rosu-pp-js (the FC-simulation backend) doesn't factor NF/SO
    // into difficulty/pp at all, so they're dropped from the mods
    // string sent to it — same convention netlify/functions/
    // replay-analyze.js already uses.
    const fcMods = mods.filter(m => m !== 'NF' && m !== 'SO').join('');
    return `<a class="osu-recent-item" href="https://osu.ppy.sh/b/${r.beatmap_id}" target="_blank" rel="noopener noreferrer">
        <div class="osu-recent-bg" style="background-image:url('${coverUrl}')"></div>
        <div class="osu-recent-overlay"></div>
        <span class="osu-recent-rank rank-${rankClass}">${r.rank || '—'}</span>
        <div class="osu-recent-info">
            <div class="osu-recent-song">${escHtml(title)}</div>
            <div class="osu-recent-meta">${ppStr}${acc}% · ${r.maxcombo}x${modsStr} · ${dateStr}</div>
            <button class="fc-sim-btn" onclick="toggleFcSim(event, ${r.beatmap_id}, '${fcMods}')" title="${escHtml(t('fc_sim_btn_title'))}">${icon('trendingUp')}<span>${t('fc_sim_btn')}</span></button>
        </div>
    </a>`;
}

/* Shared by renderOsuPlaysList (single-player recent/best list) and
   loadPpCompareTopPlays (two-player Top10 comparison, see comparePlayers
   below): fetch `best`/`recent` scores for one user+mode, batch-fetch the
   beatmap details each score references, and return the rendered card
   list HTML — '' on no scores or any failure, never throws, so a caller
   comparing two players never has one side's failure take down the other. */
async function fetchOsuPlaysHtml(userId, mode, type, limit) {
    try {
        const query = type === 'best' ? `best=${userId}&limit=${limit}&m=${mode}` : `recent=${userId}&limit=${limit}&m=${mode}`;
        const plays = await osuFetch(query);
        if (!plays || plays.length === 0) return '';
        const beatmapIds = [...new Set(plays.map(r => r.beatmap_id))];
        const beatmapResults = await Promise.all(beatmapIds.map(id => osuFetch(`b=${id}`)));
        const beatmapMap = {};
        beatmapIds.forEach((id, i) => {
            const bm = beatmapResults[i] && beatmapResults[i][0];
            if (bm) beatmapMap[id] = bm;
        });
        return plays.map(r => osuPlayItemHtml(r, mode, beatmapMap[r.beatmap_id], type)).join('');
    } catch (e) {
        console.error('Plays list fetch failed:', e);
        return '';
    }
}

async function renderOsuPlaysList(userId, mode, type, listId, wrapId) {
    const container = document.getElementById(listId);
    const wrap = document.getElementById(wrapId);
    if (!container || !wrap) return;
    container.innerHTML = playsListSkeletonHTML(type === 'best' ? 5 : 3);
    wrap.style.display = 'block';
    const html = await fetchOsuPlaysHtml(userId, mode, type, type === 'best' ? 10 : 5);
    // An empty recent/best list (e.g. no plays in the last 24h) used to hide
    // this whole wrap — which also contains the goal/medals/grade-history
    // tabs, making them unreachable whenever the *default* recent tab
    // happened to be empty. Show an empty state inside the list instead so
    // the tab bar and the other tabs stay reachable.
    container.innerHTML = html || `<p class="osu-empty">${t(type === 'best' ? 'osu_plays_empty_best' : 'osu_plays_empty_recent')}</p>`;
    wrap.style.display = 'block';
}

/* ===== "PP if FC" simulator — a single document.body-level popover (same
   lazy-singleton pattern as #osu-category-picker above: .osu-recent-item
   has overflow:hidden for its aspect-ratio background image, which would
   clip an inline result panel, and the list's innerHTML gets replaced
   wholesale on every re-render). Lazy-loaded per click rather than for
   every row up front, since each calculation downloads the raw .osu file
   server-side; results are cached in memory per beatmap+mods pair since
   the same map can appear more than once across the recent/best lists. ===== */
function ensureFcSimPopoverEl() {
    let el = document.getElementById('fc-sim-popover');
    if (!el) {
        el = document.createElement('div');
        el.id = 'fc-sim-popover';
        el.className = 'fc-sim-popover';
        document.body.appendChild(el);
    }
    return el;
}

let fcSimPopoverKey = null;
const fcSimCache = {};

async function toggleFcSim(event, beatmapId, mods) {
    // The row itself is an <a> to the beatmap page — without these, this
    // click would both open the popover AND navigate away.
    event.preventDefault();
    event.stopPropagation();
    const key = `${beatmapId}:${mods}`;
    const el = ensureFcSimPopoverEl();
    if (fcSimPopoverKey === key && el.classList.contains('open')) {
        closeFcSimPopover();
        return;
    }
    fcSimPopoverKey = key;
    const r = event.currentTarget.getBoundingClientRect();
    el.style.top = `${r.bottom + 6}px`;
    el.style.left = `${Math.min(r.left, window.innerWidth - 200)}px`;
    el.classList.add('open');
    document.addEventListener('click', onFcSimPopoverOutsideClick);
    document.addEventListener('keydown', onFcSimPopoverEscape);

    if (fcSimCache[key]) { el.innerHTML = fcSimCache[key]; return; }
    el.innerHTML = `<div class="fc-sim-loading">${t('fc_sim_loading')}</div>`;
    try {
        const res = await fetch(`/.netlify/functions/osu-pp?id=${beatmapId}&mods=${encodeURIComponent(mods)}`);
        const data = await res.json();
        if (!res.ok || data.error || !data.pp) throw new Error(data.error || 'bad response');
        const html = `<div class="fc-sim-title">${t('fc_sim_popover_title')}</div>` + Object.entries(data.pp)
            .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
            .map(([acc, pp]) => `<div class="fc-sim-row"><span>${parseFloat(acc)}%</span><b>${Math.round(pp).toLocaleString()}pp</b></div>`)
            .join('');
        fcSimCache[key] = html;
        if (fcSimPopoverKey === key) el.innerHTML = html;
    } catch (e) {
        console.error('FC simulation failed:', e);
        if (fcSimPopoverKey === key) el.innerHTML = `<div class="fc-sim-error">${t('fc_sim_error')}</div>`;
    }
}
function closeFcSimPopover() {
    const el = document.getElementById('fc-sim-popover');
    if (el) el.classList.remove('open');
    fcSimPopoverKey = null;
    document.removeEventListener('click', onFcSimPopoverOutsideClick);
    document.removeEventListener('keydown', onFcSimPopoverEscape);
}
function onFcSimPopoverOutsideClick(e) {
    if (!e.target.closest('#fc-sim-popover') && !e.target.closest('.fc-sim-btn')) closeFcSimPopover();
}
function onFcSimPopoverEscape(e) {
    if (e.key === 'Escape') closeFcSimPopover();
}

/* ===== PP growth trend: daily localStorage snapshots of total PP, rendered
   as a small SVG line chart. There's no historical PP endpoint on the osu!
   v1 API, so this alone only accumulates data from whenever a visitor first
   loads the site forward. To backfill actual past progress, fetchOsuTrackHistory()
   below pulls per-mode history from the osu!Track API (github.com/Ameobea/osutrack-api,
   proxied through netlify/functions/osu-pp-history.js) and merges it in. ===== */
const OSU_PP_HISTORY_MAX_DAYS = 90;

/* Each looked-up/logged-in visitor gets their own PP history bucket in
   localStorage, keyed by osu! user id, so the functions below all take the
   storage key as a parameter (see loadVisitorProfileById). */
function ppHistoryKeyFor(userId) {
    return `osu_pp_history_${userId}`;
}

function getPpHistory(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
}

function savePpHistory(history, key) {
    localStorage.setItem(key, JSON.stringify(history));
}

function recordPpSnapshot(totalPP, key) {
    const today = new Date().toISOString().slice(0, 10);
    const value = Math.round(totalPP);
    const history = getPpHistory(key);
    const last = history[history.length - 1];
    if (last && last.date === today && last.pp === value) return;
    if (last && last.date === today) history[history.length - 1] = { date: today, pp: value };
    else history.push({ date: today, pp: value });
    savePpHistory(history.length > OSU_PP_HISTORY_MAX_DAYS ? history.slice(-OSU_PP_HISTORY_MAX_DAYS) : history, key);
}

function formatPpChartDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* Reads theme colors fresh each render/redraw since Chart.js bakes them
   into canvas pixels rather than resolving CSS var() live like the old SVG
   version did — see the theme-toggle listener below renderPpHistoryChart. */
function ppChartColors() {
    const css = getComputedStyle(document.documentElement);
    const pick = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    return {
        accent: pick('--accent-pink', '#f472b6'),
        grid: pick('--border-light', 'rgba(255,255,255,0.15)'),
        label: pick('--text-label', 'rgba(255,255,255,0.6)'),
        text: pick('--text', '#fff'),
        tooltipBg: pick('--bg-card', 'rgba(25,15,45,0.95)'),
    };
}

/* Fetches per-mode stats_history from osu!Track for the given user and
   collapses it to one daily total-PP point per day: each mode's history is
   bucketed to its last value per calendar day, then summed across modes with
   forward-fill (a mode with no update that day keeps its last known value)
   so a day only shown for e.g. taiko still counts the visitor's standard pp. */
async function fetchOsuTrackHistory(userId) {
    const perMode = await Promise.all([0, 1, 2, 3].map(async mode => {
        try {
            const res = await fetch(`/.netlify/functions/osu-pp-history?user=${userId}&mode=${mode}`);
            if (!res.ok) return new Map();
            const data = await res.json();
            const entries = (Array.isArray(data) ? data : [])
                .filter(e => e.pp_raw != null && e.timestamp)
                .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
            const byDay = new Map();
            for (const e of entries) byDay.set(e.timestamp.slice(0, 10), parseFloat(e.pp_raw));
            return byDay;
        } catch { return new Map(); }
    }));

    const allDates = [...new Set(perMode.flatMap(m => [...m.keys()]))].sort();
    const lastKnown = [null, null, null, null];
    const totals = [];
    for (const date of allDates) {
        let sum = 0, hasAny = false;
        for (let i = 0; i < 4; i++) {
            if (perMode[i].has(date)) lastKnown[i] = perMode[i].get(date);
            if (lastKnown[i] != null) { sum += lastKnown[i]; hasAny = true; }
        }
        if (hasAny) totals.push({ date, pp: Math.round(sum) });
    }
    return totals;
}

function mergePpHistory(remote, local) {
    const byDate = new Map(remote.map(p => [p.date, p.pp]));
    for (const p of local) byDate.set(p.date, p.pp);
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, pp]) => ({ date, pp }));
}

/* Single shared Chart.js instance — only one pp-history panel (the visitor
   lookup card) is ever on screen at a time, so each render destroys the
   previous chart before creating the next rather than tracking one per
   panelId. */
let ppHistoryChart = null;
let ppHistoryChartArgs = null;

async function renderPpHistoryChart(historyOverride, key, panelId) {
    const el = document.getElementById(panelId);
    if (!el) return;
    if (typeof Chart === 'undefined') { try { await ensureCharts(); } catch (e) { return; } }
    const history = historyOverride || getPpHistory(key);

    if (ppHistoryChart) { ppHistoryChart.destroy(); ppHistoryChart = null; }

    if (history.length < 2) {
        ppHistoryChartArgs = null;
        el.innerHTML = `
            <div class="trend-chart-label">${t('pp_history_title')}</div>
            <p class="osu-empty">${t('pp_history_empty')}</p>
        `;
        return;
    }

    ppHistoryChartArgs = [historyOverride, key, panelId];
    el.innerHTML = `
        <div class="trend-chart-label">${t('pp_history_title')}</div>
        <div class="trend-chart-wrap"><canvas></canvas></div>
    `;
    const canvas = el.querySelector('canvas');
    const colors = ppChartColors();

    ppHistoryChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: history.map(p => formatPpChartDate(p.date)),
            datasets: [{
                data: history.map(p => p.pp),
                borderColor: colors.accent,
                backgroundColor: colors.accent + '2a',
                pointBackgroundColor: colors.accent,
                pointBorderColor: colors.accent,
                pointRadius: 2.5,
                pointHoverRadius: 5,
                borderWidth: 2,
                tension: 0.25,
                fill: true,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.text,
                    bodyColor: colors.accent,
                    borderColor: colors.grid,
                    borderWidth: 1,
                    padding: 8,
                    displayColors: false,
                    callbacks: { label: ctx => `${ctx.parsed.y.toLocaleString()}pp` },
                },
            },
            scales: {
                x: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.label, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.label, font: { size: 10 }, callback: v => v.toLocaleString() },
                },
            },
        },
    });
}

/* ===== Two-player PP comparison — reuses the exact same history sources as
   the single-player panel above (local daily snapshots + osu!Track via
   osu-pp-history.js), just fetched for two ids and rendered as two Chart.js
   datasets sharing a merged date axis instead of one. No new backend. ===== */
async function fetchPlayerTotalPpAndHistory(input, isUsername) {
    const param = isUsername ? `u=${encodeURIComponent(input)}&type=string` : `u=${input}`;
    const results = await Promise.all([0, 1, 2, 3].map(m => osuFetch(`${param}&m=${m}`)));
    const modeData = results.map(r => (r && r.length > 0) ? r[0] : null);
    const u = modeData[0];
    if (!u) return null;

    const totalPP = modeData.reduce((sum, m) => sum + (m && m.pp_raw != null ? parseFloat(m.pp_raw) : 0), 0);
    const key = ppHistoryKeyFor(u.user_id);
    if (totalPP > 0) recordPpSnapshot(totalPP, key);
    const remote = await fetchOsuTrackHistory(u.user_id);
    const history = mergePpHistory(remote, getPpHistory(key));
    return { id: u.user_id, username: u.username, country: u.country, totalPP, history };
}

/* flagcdn.com serves flags keyed by lowercase ISO 3166-1 alpha-2 — exactly
   what osu!'s `country` field already is, no lookup table needed. */
function flagUrl(countryCode) {
    return countryCode ? `https://flagcdn.com/24x18/${countryCode.toLowerCase()}.png` : '';
}

function renderPpCompareSide(elId, player) {
    const el = document.getElementById(elId);
    if (!el) return;
    const flag = flagUrl(player.country);
    el.innerHTML = `
        <div class="avatar-with-flag">
            <img class="osu-avatar pp-compare-avatar" src="${osuAvatarUrl(player.id)}" alt="" onerror="this.style.visibility='hidden';">
            ${flag ? `<img class="avatar-flag-badge" src="${flag}" alt="" onerror="this.style.display='none';">` : ''}
        </div>
        <div class="pp-compare-side-name">${escHtml(player.username)}</div>
        <div class="pp-compare-side-pp">${Math.round(player.totalPP).toLocaleString()}pp</div>
    `;
}

let ppCompareChart = null;
let ppCompareChartArgs = null;

async function renderPpCompareChart(playerA, playerB, panelId) {
    const el = document.getElementById(panelId);
    if (!el) return;
    if (typeof Chart === 'undefined') { try { await ensureCharts(); } catch (e) { return; } }
    if (ppCompareChart) { ppCompareChart.destroy(); ppCompareChart = null; }

    const dates = [...new Set([...playerA.history.map(p => p.date), ...playerB.history.map(p => p.date)])].sort();
    if (dates.length < 2) {
        ppCompareChartArgs = null;
        el.innerHTML = `
            <div class="trend-chart-label">${t('pp_history_title')}</div>
            <p class="osu-empty">${t('pp_history_empty')}</p>
        `;
        return;
    }

    ppCompareChartArgs = [playerA, playerB, panelId];
    el.innerHTML = `
        <div class="trend-chart-label">${t('pp_history_title')}</div>
        <div class="trend-chart-wrap"><canvas></canvas></div>
    `;
    const canvas = el.querySelector('canvas');
    const colors = ppChartColors();
    const purple = getComputedStyle(document.documentElement).getPropertyValue('--accent-purple').trim() || '#a855f7';
    const seriesFor = (history) => {
        const byDate = new Map(history.map(p => [p.date, p.pp]));
        return dates.map(d => byDate.has(d) ? byDate.get(d) : null);
    };

    ppCompareChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: dates.map(formatPpChartDate),
            datasets: [
                {
                    label: playerA.username, data: seriesFor(playerA.history),
                    borderColor: colors.accent, backgroundColor: colors.accent + '2a',
                    pointBackgroundColor: colors.accent, pointBorderColor: colors.accent,
                    pointRadius: 2.5, pointHoverRadius: 5, borderWidth: 2, tension: 0.25, fill: false, spanGaps: true,
                },
                {
                    label: playerB.username, data: seriesFor(playerB.history),
                    borderColor: purple, backgroundColor: purple + '2a',
                    pointBackgroundColor: purple, pointBorderColor: purple,
                    pointRadius: 2.5, pointHoverRadius: 5, borderWidth: 2, tension: 0.25, fill: false, spanGaps: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: true, labels: { color: colors.text, font: { size: 11 }, boxWidth: 12 } },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.text,
                    borderColor: colors.grid,
                    borderWidth: 1,
                    padding: 8,
                    callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toLocaleString() : '—'}pp` },
                },
            },
            scales: {
                x: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.label, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.label, font: { size: 10 }, callback: v => v.toLocaleString() },
                },
            },
        },
    });
}

/* ===== Tracked-players "PP race" chart — same merged-date-axis approach as
   renderPpCompareChart() above, generalized from 2 fixed sides to however
   many players openTrackedLeaderboard() fetched. Colors cycle through a
   fixed palette (covers the pink/purple accents used everywhere else on
   the site first) and fall back to evenly-spaced HSL hues past that, so an
   arbitrarily long tracked-players list still gets visually distinct
   lines instead of repeating or clashing colors. ===== */
let ppRaceChart = null;
let ppRaceChartArgs = null;

function ppRaceColor(i, accent, purple) {
    const palette = [accent, purple, '#34d399', '#fbbf24', '#60a5fa', '#f87171', '#f472b6', '#94a3b8'];
    if (i < palette.length) return palette[i];
    return `hsl(${(i * 47) % 360}, 70%, 60%)`;
}

async function renderPpRaceChart(players, panelId) {
    const el = document.getElementById(panelId);
    if (!el) return;
    if (typeof Chart === 'undefined') { try { await ensureCharts(); } catch (e) { return; } }
    if (ppRaceChart) { ppRaceChart.destroy(); ppRaceChart = null; }

    const dates = [...new Set(players.flatMap(p => p.history.map(h => h.date)))].sort();
    if (dates.length < 2) {
        ppRaceChartArgs = null;
        el.innerHTML = `
            <div class="trend-chart-label">${t('pp_race_title')}</div>
            <p class="osu-empty">${t('pp_history_empty')}</p>
        `;
        return;
    }

    ppRaceChartArgs = [players, panelId];
    el.innerHTML = `
        <div class="trend-chart-label">${t('pp_race_title')}</div>
        <div class="trend-chart-wrap"><canvas></canvas></div>
    `;
    const canvas = el.querySelector('canvas');
    const colors = ppChartColors();
    const purple = getComputedStyle(document.documentElement).getPropertyValue('--accent-purple').trim() || '#a855f7';
    const seriesFor = (history) => {
        const byDate = new Map(history.map(p => [p.date, p.pp]));
        return dates.map(d => byDate.has(d) ? byDate.get(d) : null);
    };

    ppRaceChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: dates.map(formatPpChartDate),
            datasets: players.map((p, i) => {
                const c = ppRaceColor(i, colors.accent, purple);
                return {
                    label: p.username, data: seriesFor(p.history),
                    borderColor: c, backgroundColor: c + '2a',
                    pointBackgroundColor: c, pointBorderColor: c,
                    pointRadius: 2, pointHoverRadius: 4, borderWidth: 2, tension: 0.25, fill: false, spanGaps: true,
                };
            }),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: true, labels: { color: colors.text, font: { size: 11 }, boxWidth: 12 } },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.text,
                    borderColor: colors.grid,
                    borderWidth: 1,
                    padding: 8,
                    callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toLocaleString() : '—'}pp` },
                },
            },
            scales: {
                x: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.label, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.label, font: { size: 10 }, callback: v => v.toLocaleString() },
                },
            },
        },
    });
}

/* Hides any previously-shown compare result so a blank player field never
   leaves stale comparison data on screen (mirrors clearVisitorLookupResult). */
function clearPpCompareResult() {
    const status = document.getElementById('pp-compare-status');
    const result = document.getElementById('pp-compare-result');
    const skeleton = document.getElementById('pp-compare-skeleton');
    if (status) status.innerText = '';
    if (result) result.style.display = 'none';
    if (skeleton) skeleton.style.display = 'none';
    ppCompareTopPlaysData = null;
    const topplaysWrap = document.getElementById('pp-compare-topplays');
    if (topplaysWrap) topplaysWrap.style.display = 'none';
}

function onPpCompareInputChange() {
    const inputA = document.getElementById('pp-compare-input-a').value.trim();
    const inputB = document.getElementById('pp-compare-input-b').value.trim();
    if (!inputA || !inputB) clearPpCompareResult();
}

/* 個人查詢 / 雙人對比 live in one card as two modes now (was two competing
   cards). Pure show/hide — each mode keeps its own element ids and JS. */
function switchLookupMode(mode, btn) {
    const single = document.getElementById('lookup-mode-single');
    const compare = document.getElementById('lookup-mode-compare');
    if (!single || !compare) return;
    const toCompare = mode === 'compare';
    single.hidden = toCompare;
    compare.hidden = !toCompare;
    const btns = btn && btn.parentElement ? btn.parentElement.querySelectorAll('.lookup-mode-btn') : [];
    btns.forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const focus = (toCompare ? compare : single).querySelector('input');
    if (focus) focus.focus();
}

async function comparePlayers() {
    const inputA = document.getElementById('pp-compare-input-a').value.trim();
    const inputB = document.getElementById('pp-compare-input-b').value.trim();
    const status = document.getElementById('pp-compare-status');
    const result = document.getElementById('pp-compare-result');
    const skeleton = document.getElementById('pp-compare-skeleton');
    if (!inputA || !inputB) { clearPpCompareResult(); return; }
    if (!status || !result) return;

    status.innerText = '';
    if (skeleton) skeleton.style.display = '';
    result.style.display = 'none';

    try {
        const [a, b] = await Promise.all([
            fetchPlayerTotalPpAndHistory(inputA, !/^\d+$/.test(inputA)),
            fetchPlayerTotalPpAndHistory(inputB, !/^\d+$/.test(inputB)),
        ]);
        if (skeleton) skeleton.style.display = 'none';
        if (!a || !b) { status.innerText = t('osu_not_found') || 'Not found'; status.style.color = '#ff5252'; return; }

        status.innerText = '';
        renderPpCompareSide('pp-compare-side-a', a);
        renderPpCompareSide('pp-compare-side-b', b);
        renderPpCompareChart(a, b, 'pp-compare-chart-panel');
        result.style.display = 'block';
        loadPpCompareTopPlays(a.id, b.id);
    } catch (e) {
        console.error('PP compare failed:', e);
        if (skeleton) skeleton.style.display = 'none';
        status.innerText = 'Error';
        status.style.color = '#ff5252';
    }
}

/* ===== Two-player Top Play comparison =====
   All 4 modes × both players (8 osuFetch('best=...') calls, each with its
   own beatmap-detail batch — see fetchOsuPlaysHtml) are fetched together
   up front rather than per-tab-click, so switching modes afterward is
   instant and a slow mode for one player doesn't block the others from
   appearing. Keyed by mode name (not the numeric index fetchOsuPlaysHtml
   itself needs) so switchPpCompareTopPlaysMode can just look results up by
   the same 'standard'/'taiko'/'catch'/'mania' ids the mode tabs use. */
let ppCompareTopPlaysData = null;
let ppCompareTopPlaysMode = 'standard';
let ppCompareTopPlaysRequestKey = null;

async function loadPpCompareTopPlays(idA, idB) {
    const wrap = document.getElementById('pp-compare-topplays');
    const listA = document.getElementById('pp-compare-topplays-a');
    const listB = document.getElementById('pp-compare-topplays-b');
    if (!wrap || !listA || !listB) return;

    ppCompareTopPlaysData = null;
    ppCompareTopPlaysMode = 'standard';
    document.querySelectorAll('#pp-compare-topplays-tabs .osu-mode-tab').forEach((btn, i) => btn.classList.toggle('active', i === 0));
    wrap.style.display = 'block';
    listA.innerHTML = playsListSkeletonHTML(5);
    listB.innerHTML = playsListSkeletonHTML(5);

    // Snapshot which pair this fetch is for — if the visitor re-compares a
    // different pair before this resolves, the stale response just gets
    // dropped instead of clobbering the newer one's list.
    const requestKey = `${idA}:${idB}`;
    ppCompareTopPlaysRequestKey = requestKey;

    const perMode = await Promise.all(OSU_MODES.map((mode, i) => Promise.all([
        fetchOsuPlaysHtml(idA, i, 'best', 10),
        fetchOsuPlaysHtml(idB, i, 'best', 10),
    ])));
    if (ppCompareTopPlaysRequestKey !== requestKey) return;

    ppCompareTopPlaysData = {};
    OSU_MODES.forEach((mode, i) => { ppCompareTopPlaysData[mode] = { a: perMode[i][0], b: perMode[i][1] }; });
    renderPpCompareTopPlays();
}

function switchPpCompareTopPlaysMode(mode, el) {
    ppCompareTopPlaysMode = mode;
    document.querySelectorAll('#pp-compare-topplays-tabs .osu-mode-tab').forEach(btn => btn.classList.remove('active'));
    if (el) el.classList.add('active');
    renderPpCompareTopPlays();
}

function renderPpCompareTopPlays() {
    if (!ppCompareTopPlaysData) return;
    const data = ppCompareTopPlaysData[ppCompareTopPlaysMode];
    const listA = document.getElementById('pp-compare-topplays-a');
    const listB = document.getElementById('pp-compare-topplays-b');
    const emptyHtml = `<div class="osu-empty">${t('pp_compare_topplays_empty')}</div>`;
    if (listA) listA.innerHTML = data.a || emptyHtml;
    if (listB) listB.innerHTML = data.b || emptyHtml;
}

/* Re-render with fresh colors on theme toggle so the chart doesn't keep
   its old-theme palette baked into the canvas (unlike the previous SVG
   version, which resolved CSS var() live and needed no such hook). */
(function () {
    const themeBtn = document.getElementById('theme-toggle');
    if (!themeBtn) return;
    themeBtn.addEventListener('click', () => setTimeout(() => {
        if (ppHistoryChartArgs) renderPpHistoryChart(...ppHistoryChartArgs);
        if (ppCompareChartArgs) renderPpCompareChart(...ppCompareChartArgs);
        if (ppRaceChartArgs) renderPpRaceChart(...ppRaceChartArgs);
    }, 0));
})();

/* ===== Visitor Profile Lookup ===== */
let visitorLookupUserId = null;
let visitorLookupUsername = '';
let visitorLookupCountry = '';
let visitorLookupTotalPp = 0;
let visitorPlaysType = 'recent';
let visitorModeData = [];
let visitorCurrentMode = 0;

function switchVisitorRecentMode(mode, el) {
    document.querySelectorAll('#visitor-recent-mode-tabs .osu-mode-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    visitorCurrentMode = mode;
    if (!visitorLookupUserId) return;
    if (visitorPlaysType === 'goal') renderPpGoalPlannerUI();
    else if (visitorPlaysType === 'gradehistory') ensureGradeHistoryLoaded();
    else renderOsuPlaysList(visitorLookupUserId, mode, visitorPlaysType, 'visitor-recent-list', 'visitor-recent-plays');
}

function switchVisitorPlaysType(type, el) {
    visitorPlaysType = type;
    document.querySelectorAll('.osu-plays-type-tabs .osu-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    const listEl = document.getElementById('visitor-recent-list');
    const goalEl = document.getElementById('pp-goal-planner');
    const medalsEl = document.getElementById('medals-gallery');
    const gradeHistoryEl = document.getElementById('grade-history-panel');
    listEl.style.display = type === 'recent' || type === 'best' ? '' : 'none';
    goalEl.style.display = type === 'goal' ? '' : 'none';
    medalsEl.style.display = type === 'medals' ? '' : 'none';
    gradeHistoryEl.style.display = type === 'gradehistory' ? '' : 'none';
    if (type === 'goal') {
        renderPpGoalPlannerUI();
    } else if (type === 'medals') {
        ensureMedalsGalleryLoaded();
    } else if (type === 'gradehistory') {
        ensureGradeHistoryLoaded();
    } else if (visitorLookupUserId) {
        renderOsuPlaysList(visitorLookupUserId, visitorCurrentMode, type, 'visitor-recent-list', 'visitor-recent-plays');
    }
}

/* ===== Medal gallery — cross-references osekai.net's public medal database
   (name/icon/description/rarity, keyed by the same achievement id osu!'s
   own API uses) against the looked-up player's earned achievement ids, since
   osu!'s API only ever exposes bare ids (see osu-user-achievements.js and
   osekai-medals.js's header comments for why). The medal list itself is
   the same for everyone and rarely changes, so it's fetched once per page
   load and cached in osekaiMedalsPromise; only the "which ids does this
   player have" half changes per lookup. */
let osekaiMedalsPromise = null;
let allOsekaiMedals = [];
let visitorMedalIds = new Set();
let medalsLoadedForUserId = null;
let medalsFilterState = 'all';
let medalsSearchQuery = '';

function fetchOsekaiMedals() {
    if (!osekaiMedalsPromise) {
        osekaiMedalsPromise = fetch('/.netlify/functions/osekai-medals')
            .then(res => { if (!res.ok) throw new Error('bad response'); return res.json(); })
            .then(data => data.medals || [])
            .catch(e => { osekaiMedalsPromise = null; throw e; });
    }
    return osekaiMedalsPromise;
}

async function ensureMedalsGalleryLoaded() {
    const el = document.getElementById('medals-gallery');
    if (!el) return;
    if (!visitorLookupUserId) {
        el.innerHTML = `<p class="osu-empty">${t('medals_need_lookup')}</p>`;
        return;
    }
    if (medalsLoadedForUserId === visitorLookupUserId && allOsekaiMedals.length) {
        renderMedalsGallery();
        return;
    }
    el.innerHTML = `<p class="osu-empty">${t('medals_loading')}</p>`;
    try {
        const [medals, achRes] = await Promise.all([
            fetchOsekaiMedals(),
            fetch(`/.netlify/functions/osu-user-achievements?id=${visitorLookupUserId}`),
        ]);
        const achData = achRes.ok ? await achRes.json() : { achievements: [] };
        allOsekaiMedals = medals;
        visitorMedalIds = new Set(achData.achievements || []);
        medalsLoadedForUserId = visitorLookupUserId;
        renderMedalsGallery();
    } catch (e) {
        console.error('Medal gallery load failed:', e);
        el.innerHTML = `<p class="osu-empty">${t('medals_load_fail')}</p>`;
    }
}

function renderMedalsGallery() {
    const el = document.getElementById('medals-gallery');
    if (!el) return;
    medalsFilterState = 'all';
    medalsSearchQuery = '';
    const earnedCount = allOsekaiMedals.filter(m => visitorMedalIds.has(m.id)).length;
    el.innerHTML = `
        <div class="medals-gallery-header">
            <span class="medals-earned-count">${t('medals_earned_label', { n: earnedCount, total: allOsekaiMedals.length })}</span>
            <input type="text" class="medals-search-input guestbook-input" autocomplete="off" data-i18n-placeholder="medals_search_placeholder" placeholder="${t('medals_search_placeholder')}" oninput="medalsSearchGallery(this.value)">
        </div>
        <div class="osu-mode-tabs medals-filter-tabs">
            <button class="osu-tab active" onclick="medalsFilterGallery('all', this)">${t('medals_filter_all')}</button>
            <button class="osu-tab" onclick="medalsFilterGallery('earned', this)">${t('medals_filter_earned')}</button>
            <button class="osu-tab" onclick="medalsFilterGallery('missing', this)">${t('medals_filter_missing')}</button>
        </div>
        <div class="medals-grid" id="medals-grid"></div>
    `;
    renderMedalsList();
}

function medalsFilterGallery(filter, el) {
    medalsFilterState = filter;
    document.querySelectorAll('#medals-gallery .medals-filter-tabs .osu-tab').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    renderMedalsList();
}

function medalsSearchGallery(value) {
    medalsSearchQuery = value.trim().toLowerCase();
    renderMedalsList();
}

function renderMedalsList() {
    const grid = document.getElementById('medals-grid');
    if (!grid) return;

    let list = allOsekaiMedals;
    if (medalsFilterState === 'earned') list = list.filter(m => visitorMedalIds.has(m.id));
    else if (medalsFilterState === 'missing') list = list.filter(m => !visitorMedalIds.has(m.id));
    if (medalsSearchQuery) list = list.filter(m => (m.name || '').toLowerCase().includes(medalsSearchQuery));

    if (list.length === 0) {
        grid.innerHTML = `<p class="osu-empty">${t('medals_empty')}</p>`;
        return;
    }

    // Grouped by osekai's own category field so related medals (e.g. all
    // "Beatmap Spotlights") sit together instead of one flat alphabetical wall.
    const groups = new Map();
    for (const m of list) {
        const g = m.grouping || '';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(m);
    }

    grid.innerHTML = [...groups.entries()].map(([group, medals]) => `
        <div class="medals-group">
            ${group ? `<div class="medals-group-title">${escapeHtmlOsu(group)}</div>` : ''}
            <div class="medals-group-grid">
                ${medals.map(m => {
                    const earned = visitorMedalIds.has(m.id);
                    return `
                    <div class="medal-item${earned ? ' earned' : ' missing'}" title="${escapeHtmlOsu(m.description || '')}">
                        <img class="medal-icon" src="${m.icon}" alt="${escapeHtmlOsu(m.name || '')}" loading="lazy" onerror="this.style.visibility='hidden'">
                        <div class="medal-name">${escapeHtmlOsu(m.name || '')}</div>
                        ${m.rarity != null ? `<div class="medal-rarity">${t('medals_rarity', { p: m.rarity.toFixed(1) })}</div>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>
    `).join('');
}

/* ===== Grade history — "show me every score I've gotten, grouped by rank"
   (SS/S/A/B/C/D), a feature request that's structurally impossible to answer
   from osu!'s own API (v1/v2 only ever expose best-100-by-pp and last-50-
   recent, never a full history). osu!Track (the same service behind
   osu!stats) has been polling most active players' hiscores for years and
   keeps every one it ever recorded, so netlify/functions/osu-score-history.js
   proxies its /hiscores endpoint instead. Coverage still isn't complete —
   see the header comment there — hence the caveat line in the empty/loaded
   states below. ===== */
let gradeHistoryRaw = [];
let gradeHistoryLoadedKey = null;
let gradeHistoryFilter = 'all';

const GRADE_HISTORY_GROUPS = {
    ss: r => r.rank === 'X' || r.rank === 'XH',
    s: r => r.rank === 'S' || r.rank === 'SH',
    a: r => r.rank === 'A',
    b: r => r.rank === 'B',
    c: r => r.rank === 'C',
    d: r => r.rank === 'D',
};

async function ensureGradeHistoryLoaded() {
    const el = document.getElementById('grade-history-panel');
    if (!el) return;
    if (!visitorLookupUserId) { el.innerHTML = `<p class="osu-empty">${t('grade_history_need_lookup')}</p>`; return; }
    const key = `${visitorLookupUserId}:${visitorCurrentMode}`;
    if (gradeHistoryLoadedKey === key) { renderGradeHistoryGallery(); return; }
    el.innerHTML = `<p class="osu-empty">${t('grade_history_loading')}</p>`;
    try {
        const res = await fetch(`/.netlify/functions/osu-score-history?user=${visitorLookupUserId}&mode=${visitorCurrentMode}`);
        const data = res.ok ? await res.json() : [];
        gradeHistoryRaw = Array.isArray(data) ? data : [];
        gradeHistoryLoadedKey = key;
        renderGradeHistoryGallery();
    } catch (e) {
        console.error('Grade history load failed:', e);
        el.innerHTML = `<p class="osu-empty">${t('grade_history_load_fail')}</p>`;
    }
}

function gradeHistoryFilterGallery(filter, el) {
    gradeHistoryFilter = filter;
    document.querySelectorAll('#grade-history-panel .grade-history-filter-tabs .osu-tab').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    renderGradeHistoryList();
}

function renderGradeHistoryGallery() {
    const el = document.getElementById('grade-history-panel');
    if (!el) return;
    const counts = { ss: 0, s: 0, a: 0, b: 0, c: 0, d: 0 };
    for (const r of gradeHistoryRaw) {
        for (const g in GRADE_HISTORY_GROUPS) if (GRADE_HISTORY_GROUPS[g](r)) counts[g]++;
    }
    if (gradeHistoryRaw.length === 0) {
        el.innerHTML = `
            <div class="grade-history-note">${t('grade_history_note')}</div>
            <p class="osu-empty">${t('grade_history_empty')}</p>`;
        return;
    }
    gradeHistoryFilter = 'all';
    el.innerHTML = `
        <div class="grade-history-note">${t('grade_history_note')}</div>
        <div class="osu-mode-tabs grade-history-filter-tabs">
            <button class="osu-tab active" onclick="gradeHistoryFilterGallery('all', this)">${t('grade_history_filter_all')} (${gradeHistoryRaw.length})</button>
            <button class="osu-tab" onclick="gradeHistoryFilterGallery('ss', this)">SS (${counts.ss})</button>
            <button class="osu-tab" onclick="gradeHistoryFilterGallery('s', this)">S (${counts.s})</button>
            <button class="osu-tab" onclick="gradeHistoryFilterGallery('a', this)">A (${counts.a})</button>
            <button class="osu-tab" onclick="gradeHistoryFilterGallery('b', this)">B (${counts.b})</button>
            <button class="osu-tab" onclick="gradeHistoryFilterGallery('c', this)">C (${counts.c})</button>
            <button class="osu-tab" onclick="gradeHistoryFilterGallery('d', this)">D (${counts.d})</button>
        </div>
        <div class="osu-recent-list" id="grade-history-list"></div>`;
    renderGradeHistoryList();
}

const GRADE_HISTORY_MAX_SHOWN = 200;

async function renderGradeHistoryList() {
    const listEl = document.getElementById('grade-history-list');
    if (!listEl) return;
    const filtered = gradeHistoryFilter === 'all' ? gradeHistoryRaw : gradeHistoryRaw.filter(GRADE_HISTORY_GROUPS[gradeHistoryFilter]);
    if (!filtered.length) { listEl.innerHTML = `<p class="osu-empty">${t('grade_history_filter_empty')}</p>`; return; }
    const sorted = [...filtered].sort((a, b) => new Date(b.score_time) - new Date(a.score_time));
    const capped = sorted.slice(0, GRADE_HISTORY_MAX_SHOWN);
    listEl.innerHTML = playsListSkeletonHTML(Math.min(capped.length, 5));
    const beatmapIds = [...new Set(capped.map(r => r.beatmap_id))];
    const beatmapResults = await Promise.all(beatmapIds.map(id => osuFetch(`b=${id}`)));
    const beatmapMap = {};
    beatmapIds.forEach((id, i) => {
        const bm = beatmapResults[i] && beatmapResults[i][0];
        if (bm) beatmapMap[id] = bm;
    });
    const truncNote = sorted.length > GRADE_HISTORY_MAX_SHOWN
        ? `<div class="grade-history-truncated">${t('grade_history_truncated', { n: GRADE_HISTORY_MAX_SHOWN, total: sorted.length })}</div>` : '';
    listEl.innerHTML = capped.map(r => gradeHistoryItemHtml(r, beatmapMap[r.beatmap_id])).join('') + truncNote;
}

function gradeHistoryItemHtml(r, bm) {
    const title = bm ? `${bm.title} [${bm.version}]` : `Beatmap #${r.beatmap_id}`;
    const coverUrl = bm ? `https://assets.ppy.sh/beatmaps/${bm.beatmapset_id}/covers/card.jpg` : '';
    const rankClass = OSU_RANK_CLASS[r.rank] || 'f';
    const mods = decodeOsuMods(r.mods);
    const modsStr = mods.length > 0 ? ' · ' + mods.join(',') : '';
    const d = new Date(r.score_time);
    const dateStr = isNaN(d) ? '' : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    const ppStr = r.pp != null ? `${Math.round(parseFloat(r.pp)).toLocaleString()}pp · ` : '';
    return `<a class="osu-recent-item" href="https://osu.ppy.sh/b/${r.beatmap_id}" target="_blank" rel="noopener noreferrer">
        <div class="osu-recent-bg" style="background-image:url('${coverUrl}')"></div>
        <div class="osu-recent-overlay"></div>
        <span class="osu-recent-rank rank-${rankClass}">${r.rank || '—'}</span>
        <div class="osu-recent-info">
            <div class="osu-recent-song">${escHtml(title)}</div>
            <div class="osu-recent-meta">${ppStr}${Number(r.score || 0).toLocaleString()}${modsStr} · ${dateStr}</div>
        </div>
    </a>`;
}

/* ===== PP goal planner — "what pp does one new play need to reach a target
   total on this mode?" Reuses the same get_user_best endpoint as the Top
   Plays tab (fetched separately here at limit=100, osu!'s actual weighted-
   scoring window, vs. the tab's lighter limit=10 for browsing). The weighted
   formula (pp * 0.95^rank) is public (osu! wiki, "Performance points/
   Weighting system"); "bonus pp" (score-count based, ~400pp max) isn't
   reverse-engineered from its real formula — instead it's derived as
   actualTotalPP - weightedTop100Sum using data already on screen, which is
   exact rather than an approximation. */
function weightedPpSum(sortedDescPp) {
    return sortedDescPp.reduce((sum, pp, i) => sum + pp * Math.pow(0.95, i), 0);
}

function ppNeededForTarget(sortedDescPp, bonusPp, targetTotal) {
    let lo = 0, hi = 2000;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const merged = [...sortedDescPp, mid].sort((a, b) => b - a).slice(0, 100);
        if (weightedPpSum(merged) + bonusPp < targetTotal) lo = mid; else hi = mid;
    }
    return hi;
}

function renderPpGoalPlannerUI() {
    const el = document.getElementById('pp-goal-planner');
    if (!el) return;
    const modeData = visitorModeData[visitorCurrentMode];
    const currentPp = modeData && modeData.pp_raw != null ? Math.round(parseFloat(modeData.pp_raw)) : 0;
    el.innerHTML = `
        <p class="pp-goal-hint">${t('pp_goal_hint', { current: currentPp.toLocaleString(), mode: OSU_MODE_LABELS[visitorCurrentMode] })}</p>
        <div class="pp-goal-input-row">
            <input type="number" id="pp-goal-target" min="0" step="1" data-i18n-placeholder="pp_goal_placeholder" placeholder="目標總 PP">
            <button class="btn" onclick="calculatePpGoal()">${t('pp_goal_btn')}</button>
        </div>
        <div id="pp-goal-status" class="status"></div>
        <div id="pp-goal-result" class="pp-goal-result" style="display:none;"></div>
    `;
}

async function calculatePpGoal() {
    const target = parseFloat(document.getElementById('pp-goal-target').value);
    const status = document.getElementById('pp-goal-status');
    const resultEl = document.getElementById('pp-goal-result');
    resultEl.style.display = 'none';

    if (!Number.isFinite(target) || target <= 0) {
        status.innerText = t('pp_goal_invalid');
        status.style.color = '#ff5252';
        return;
    }

    status.innerText = t('osu_searching');
    status.style.color = '#f9a8d4';

    try {
        const top100 = await osuFetch(`best=${visitorLookupUserId}&limit=100&m=${visitorCurrentMode}`);
        const ppList = (top100 || []).map(s => parseFloat(s.pp)).filter(n => Number.isFinite(n)).sort((a, b) => b - a);
        const modeData = visitorModeData[visitorCurrentMode];
        const actualTotal = modeData && modeData.pp_raw != null ? parseFloat(modeData.pp_raw) : 0;
        const bonusPp = Math.max(0, actualTotal - weightedPpSum(ppList));

        status.innerText = '';
        if (actualTotal >= target) {
            resultEl.innerHTML = `<p class="pp-goal-achieved">${t('pp_goal_achieved')}</p>`;
        } else {
            const needed = ppNeededForTarget(ppList, bonusPp, target);
            resultEl.innerHTML = `
                <div class="osu-stat"><div class="osu-stat-value">${Math.round(needed).toLocaleString()}pp</div><div class="osu-stat-label">${t('pp_goal_result_label')}</div></div>
            `;
        }
        resultEl.style.display = 'block';
    } catch (e) {
        console.error('PP goal calc failed:', e);
        status.innerText = `${t('pp_calc_error')}${e.message ? ' (' + e.message + ')' : ''}`;
        status.style.color = '#ff5252';
    }
}

async function loadVisitorProfileById(input, isUsername) {
    const status = document.getElementById('visitor-lookup-status');
    const result = document.getElementById('visitor-lookup-result');
    const skeleton = document.getElementById('visitor-lookup-skeleton');
    status.innerText = '';
    if (skeleton) skeleton.style.display = '';
    result.style.display = 'none';

    const param = isUsername ? `u=${encodeURIComponent(input)}&type=string` : `u=${input}`;

    try {
        const results = await Promise.all([0,1,2,3].map(m => osuFetch(`${param}&m=${m}`)));
        if (skeleton) skeleton.style.display = 'none';
        const modeData = results.map(r => (r && r.length > 0) ? r[0] : null);
        visitorModeData = modeData;
        visitorCurrentMode = 0;
        const u = modeData[0];
        if (!u) { status.innerText = t('osu_not_found') || 'Not found'; status.style.color = '#ff5252'; return; }

        status.innerText = '';
        document.getElementById('visitor-avatar').src = osuAvatarUrl(u.user_id);
        document.getElementById('visitor-result-name').textContent = u.username;
        document.getElementById('visitor-result-country').textContent = COUNTRY_NAMES[u.country] || u.country;
        const flagEl = document.getElementById('visitor-flag');
        if (u.country) {
            flagEl.src = flagUrl(u.country);
            flagEl.alt = COUNTRY_NAMES[u.country] || u.country;
            flagEl.style.display = '';
        } else {
            flagEl.style.display = 'none';
        }

        const grid = document.getElementById('visitor-modes-grid');
        grid.innerHTML = modeData.map((m, i) => {
            const label = `${modeIconSvg(OSU_MODES[i])} ${OSU_MODE_LABELS[i]}`;
            if (!m || m.pp_raw == null) return `<div class="visitor-mode-mini"><div class="visitor-mode-name">${label}</div><div class="visitor-mode-pp">—</div></div>`;
            return `<div class="visitor-mode-mini"><div class="visitor-mode-name">${label}</div><div class="visitor-mode-pp">${Math.round(parseFloat(m.pp_raw)).toLocaleString()}</div></div>`;
        }).join('');

        const totalPP = modeData.reduce((sum, m) => sum + (m && m.pp_raw != null ? parseFloat(m.pp_raw) : 0), 0);
        document.getElementById('visitor-total-pp-value').textContent = Math.round(totalPP).toLocaleString();
        result.style.display = 'block';

        visitorLookupUserId = u.user_id;
        visitorLookupUsername = u.username;
        visitorLookupCountry = u.country;
        visitorLookupTotalPp = totalPP;
        renderTrackButtonState();
        document.querySelectorAll('#visitor-recent-mode-tabs .osu-mode-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('#visitor-recent-mode-tabs .osu-mode-tab[data-mode="0"]').classList.add('active');
        visitorPlaysType = 'recent';
        document.querySelectorAll('.osu-plays-type-tabs .osu-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        document.getElementById('visitor-recent-list').style.display = '';
        document.getElementById('pp-goal-planner').style.display = 'none';
        renderOsuPlaysList(u.user_id, 0, 'recent', 'visitor-recent-list', 'visitor-recent-plays');

        if (totalPP > 0) {
            const key = ppHistoryKeyFor(u.user_id);
            recordPpSnapshot(totalPP, key);
            renderPpHistoryChart(null, key, 'visitor-pp-history-panel');
            fetchOsuTrackHistory(u.user_id).then(remote => {
                if (remote.length) renderPpHistoryChart(mergePpHistory(remote, getPpHistory(key)), key, 'visitor-pp-history-panel');
            });
        }
    } catch (e) {
        console.error('Visitor lookup failed:', e);
        if (skeleton) skeleton.style.display = 'none';
        status.innerText = 'Error';
        status.style.color = '#ff5252';
    }
}

async function lookupVisitorProfile() {
    const input = document.getElementById('visitor-lookup-input').value.trim();
    if (!input) { clearVisitorLookupResult(); return; }
    loadVisitorProfileById(input, !/^\d+$/.test(input));
}

/* Hides any previously-shown lookup result and status message so a blank
   search box never displays stale player data. */
function clearVisitorLookupResult() {
    const status = document.getElementById('visitor-lookup-status');
    const result = document.getElementById('visitor-lookup-result');
    const skeleton = document.getElementById('visitor-lookup-skeleton');
    if (status) { status.innerText = ''; }
    if (result) result.style.display = 'none';
    if (skeleton) skeleton.style.display = 'none';
}

function onVisitorLookupInputChange() {
    if (!document.getElementById('visitor-lookup-input').value.trim()) clearVisitorLookupResult();
}

/* ===== Tracked players — lightweight "watch this player's PP" list, purely
   localStorage-backed (no login required, unlike the public-collections
   like/publish flow). js/notifications.js periodically re-fetches each
   tracked player's total PP and diffs it against the `lastPp` stored here
   to decide whether to surface a notification; this file only owns the
   list itself and the lookup-page UI for managing it. ===== */
const TRACKED_PLAYERS_KEY = 'osu_tracked_players';

function getTrackedPlayers() {
    try { return JSON.parse(localStorage.getItem(TRACKED_PLAYERS_KEY)) || []; }
    catch { return []; }
}

function saveTrackedPlayers(list) {
    localStorage.setItem(TRACKED_PLAYERS_KEY, JSON.stringify(list));
}

function isPlayerTracked(id) {
    return getTrackedPlayers().some(p => String(p.id) === String(id));
}

async function toggleTrackVisitorPlayer() {
    if (!visitorLookupUserId) return;
    const list = getTrackedPlayers();
    const idx = list.findIndex(p => String(p.id) === String(visitorLookupUserId));
    if (idx >= 0) {
        list.splice(idx, 1);
        showShareToast(t('untrack_done'));
    } else {
        const entry = { id: visitorLookupUserId, username: visitorLookupUsername || `#${visitorLookupUserId}`, country: visitorLookupCountry, lastPp: visitorLookupTotalPp || 0 };
        // Seed the achievement baseline the same way lastPp above is already
        // seeded from a real value — otherwise the first periodic check
        // (js/notifications.js's checkTrackedPlayers()) would
        // have to establish it anyway, but silently, one check cycle later.
        // Best-effort: if this fails, just leave the field unset so that
        // later check still recognizes it needs to baseline first rather
        // than treating "no field" as "zero achievements known".
        try {
            const res = await fetch(`/.netlify/functions/osu-user-achievements?id=${visitorLookupUserId}`);
            if (res.ok) entry.knownAchievementIds = (await res.json()).achievements || [];
        } catch (e) { /* left unset, notifications.js will baseline it later */ }
        list.push(entry);
        showShareToast(t('track_done'));
    }
    saveTrackedPlayers(list);
    renderTrackButtonState();
    renderTrackedPlayersList();
    if (typeof syncPushPlayers === 'function') syncPushPlayers();
}

/* Add a player to the tracked list without going through the lookup panel
   (toggleTrackVisitorPlayer needs visitorLookupUserId set). Used to
   auto-track the logged-in visitor themselves on first login. */
async function trackPlayerById(id, username, country, pp) {
    if (!id || isPlayerTracked(id)) return false;
    const entry = { id: String(id), username: username || `#${id}`, country: country || null, lastPp: pp || 0 };
    try {
        const res = await fetch(`/.netlify/functions/osu-user-achievements?id=${id}`);
        if (res.ok) entry.knownAchievementIds = (await res.json()).achievements || [];
    } catch { /* notifications.js baselines it on the first check instead */ }
    const list = getTrackedPlayers();
    list.push(entry);
    saveTrackedPlayers(list);
    if (typeof renderTrackedPlayersList === 'function') renderTrackedPlayersList();
    if (typeof syncPushPlayers === 'function') syncPushPlayers();
    return true;
}

const SELF_TRACK_DONE_KEY = 'osu_self_track_done';

/* First time we see a logged-in visitor: track themselves so PP-change
   notifications actually fire (the notification system's whole point), and
   seed today's PP snapshot for the digest. Silent — surfaced in the digest
   welcome line, undoable from the tracked-players panel. The flag means a
   visitor who deliberately untracks themselves isn't re-added every load. */
async function maybeAutoTrackSelf() {
    const user = getLoggedInOsuUser();
    if (!user || !user.id) return;
    let done; try { done = localStorage.getItem(SELF_TRACK_DONE_KEY) === '1'; } catch { done = false; }
    if (done || isPlayerTracked(user.id)) { try { localStorage.setItem(SELF_TRACK_DONE_KEY, '1'); } catch {} return; }
    try {
        const res = typeof fetchPlayerTotalPpAndHistory === 'function'
            ? await fetchPlayerTotalPpAndHistory(user.id, false) : null;
        if (res) await trackPlayerById(res.id, res.username, res.country, res.totalPP);
        else await trackPlayerById(user.id, user.username, null, 0);
    } catch {
        await trackPlayerById(user.id, user.username, null, 0);
    }
    try { localStorage.setItem(SELF_TRACK_DONE_KEY, '1'); } catch {}
}

function untrackPlayerById(id) {
    saveTrackedPlayers(getTrackedPlayers().filter(p => String(p.id) !== String(id)));
    if (String(visitorLookupUserId) === String(id)) renderTrackButtonState();
    renderTrackedPlayersList();
    if (typeof syncPushPlayers === 'function') syncPushPlayers();
}

function renderTrackButtonState() {
    const btn = document.getElementById('visitor-track-btn');
    if (!btn) return;
    if (!visitorLookupUserId) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    const tracked = isPlayerTracked(visitorLookupUserId);
    btn.textContent = tracked ? t('untrack_player_btn') : t('track_player_btn');
    btn.classList.toggle('tracked', tracked);
}

function renderTrackedPlayersList() {
    const panel = document.getElementById('tracked-players-panel');
    if (!panel) return;
    const list = getTrackedPlayers();
    if (list.length === 0) {
        panel.innerHTML = `<div class="tracked-players-empty">${t('tracked_players_empty')}</div>`;
        return;
    }
    const leaderboardBtn = list.length >= 2
        ? `<button class="tracked-leaderboard-btn" onclick="openTrackedLeaderboard()">${icon('trophy', { extraClass: 'icon-label-gap' })}${t('leaderboard_btn')}</button>` : '';
    panel.innerHTML = `
        <div class="tracked-players-title">${t('tracked_players_title')}${leaderboardBtn}</div>
        <div class="tracked-players-list">${list.map(p => `
            <div class="tracked-player-card" onclick="loadVisitorProfileById('${p.id}', false)">
                <div class="avatar-with-flag">
                    <img class="tracked-player-avatar" src="${osuAvatarUrl(p.id)}" alt="" onerror="this.style.visibility='hidden';">
                    ${p.country ? `<img class="avatar-flag-badge" src="${flagUrl(p.country)}" alt="" onerror="this.style.display='none';">` : ''}
                </div>
                <span class="tracked-player-name">${escapeHtmlOsu(p.username || ('#' + p.id))}</span>
                <span class="tracked-player-pp">${Math.round(p.lastPp || 0).toLocaleString()}pp</span>
                <button class="tracked-player-remove" onclick="event.stopPropagation();untrackPlayerById('${p.id}')" title="${t('untrack_player_btn')}">${icon('x')}</button>
            </div>`).join('')}
        </div>`;
}

/* ===== Tracked-players leaderboard — reuses fetchPlayerTotalPpAndHistory()
   (built for the two-player compare chart) across every tracked player in
   parallel rather than adding a separate fetch path. ===== */
async function openTrackedLeaderboard() {
    const players = getTrackedPlayers();
    if (players.length === 0) return;
    const listEl = document.getElementById('leaderboard-list');
    listEl.innerHTML = `<p class="osu-empty">${t('osu_searching')}</p>`;
    document.getElementById('leaderboard-modal').style.display = 'flex';

    try {
        const results = await Promise.all(players.map(p => fetchPlayerTotalPpAndHistory(String(p.id), false).catch(() => null)));
        const ranked = results.filter(Boolean).sort((a, b) => b.totalPP - a.totalPP);
        if (ranked.length === 0) {
            listEl.innerHTML = `<p class="osu-empty">${t('pp_calc_error')}</p>`;
            return;
        }
        listEl.innerHTML = ranked.map((p, i) => `
            <div class="leaderboard-row" onclick="closeTrackedLeaderboard();loadVisitorProfileById('${p.id}', false)">
                <span class="leaderboard-rank">#${i + 1}</span>
                <div class="avatar-with-flag">
                    <img class="leaderboard-avatar" src="${osuAvatarUrl(p.id)}" alt="" onerror="this.style.visibility='hidden';">
                    ${p.country ? `<img class="avatar-flag-badge" src="${flagUrl(p.country)}" alt="" onerror="this.style.display='none';">` : ''}
                </div>
                <span class="leaderboard-name">${escHtml(p.username)}</span>
                <span class="leaderboard-pp">${Math.round(p.totalPP).toLocaleString()}pp</span>
            </div>
        `).join('');
        renderPpRaceChart(ranked, 'tracked-leaderboard-chart');
    } catch (e) {
        console.error('Leaderboard load failed:', e);
        listEl.innerHTML = `<p class="osu-empty">${t('pp_calc_error')}</p>`;
    }
}
function closeTrackedLeaderboard() {
    document.getElementById('leaderboard-modal').style.display = 'none';
}

/* ===== osu! OAuth login =====
   netlify/functions/osu-login.js + osu-callback.js run the authorization-code
   flow and redirect back here with ?osu_login=<id>&osu_login_name=<name> (or
   ?osu_login_error=1 on failure) — the access token itself is never handed to
   the client or stored anywhere, since the id is all loadVisitorProfileById()
   needs to personalize the Lookup tab the same way a manual search does. */
const OSU_LOGIN_STORAGE_KEY = 'osu_logged_in_user';

function getLoggedInOsuUser() {
    try { return JSON.parse(localStorage.getItem(OSU_LOGIN_STORAGE_KEY)); }
    catch { return null; }
}

function logoutOsuUser() {
    localStorage.removeItem(OSU_LOGIN_STORAGE_KEY);
    applyLoggedInOsuUser();
}

function applyLoggedInOsuUser() {
    const user = getLoggedInOsuUser();
    const loginBtn = document.getElementById('osu-login-btn');
    const pill = document.getElementById('osu-logged-in-pill');
    if (!loginBtn || !pill) return;

    loginBtn.style.display = user ? 'none' : '';
    pill.style.display = user ? '' : 'none';
    const checkPlayedBtn = document.getElementById('osu-check-played-btn');
    if (checkPlayedBtn) checkPlayedBtn.style.display = user ? '' : 'none';
    const profileImportBtn = document.getElementById('osu-import-profile-btn');
    if (profileImportBtn) profileImportBtn.style.display = user ? '' : 'none';
    const heroCta = document.getElementById('collection-hero-cta');
    if (heroCta) heroCta.hidden = !!user;
    if (typeof renderCloudSkinsList === 'function') renderCloudSkinsList();
    if (typeof updateChatLoginUI === 'function') updateChatLoginUI();
    if (typeof updateDmLoginUI === 'function') updateDmLoginUI();
    if (!user) return;

    document.getElementById('osu-logged-in-name').textContent = user.username || `#${user.id}`;
    document.getElementById('osu-logged-in-avatar').src = osuAvatarUrl(user.id);

    const input = document.getElementById('visitor-lookup-input');
    if (input) input.value = user.id;
    loadVisitorProfileById(user.id, false);
}

function checkOsuLoginFromUrl() {
    const params = new URLSearchParams(location.search);
    const id = params.get('osu_login');
    const loginFailed = params.get('osu_login_error');

    if (id) {
        localStorage.setItem(OSU_LOGIN_STORAGE_KEY, JSON.stringify({
            id,
            username: params.get('osu_login_name') || '',
            token: params.get('osu_login_token') || null,
        }));
    }
    if (id || loginFailed) {
        params.delete('osu_login');
        params.delete('osu_login_name');
        params.delete('osu_login_token');
        params.delete('osu_login_error');
        const qs = params.toString();
        history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
        if (loginFailed) showShareToast(t('osu_login_fail'));
    }

    applyLoggedInOsuUser();

    // Track yourself once, so PP-change notifications work from session one.
    if (getLoggedInOsuUser()) setTimeout(() => { if (typeof maybeAutoTrackSelf === 'function') maybeAutoTrackSelf(); }, 1500);

    // First successful login on this device: if the collection is still empty,
    // offer to seed it from the visitor's own osu! profile (favourites +
    // most-played). Asked once — the toolbar button covers it after that.
    if (id && !localStorage.getItem('osu_profile_import_prompted')) {
        localStorage.setItem('osu_profile_import_prompted', '1');
        const col = getOsuCollection();
        if (OSU_MODES.every(m => col[m].length === 0)) {
            setTimeout(() => { if (confirm(t('osu_profile_import_confirm'))) importFromOsuProfile(); }, 500);
        }
    }
}

/* Signed proof of identity for the currently logged-in osu! user (see
   netlify/functions/_auth-token.js) — null for visitors who logged in before
   this existed, until they log in again. Only needed for actions that write
   public data under the visitor's name (collections-publish/unpublish). */
function getOsuAuthToken() {
    const user = getLoggedInOsuUser();
    return user && user.token ? user.token : null;
}

/* The signed auth token (netlify/functions/_auth-token.js) has a 30-day TTL,
   but the display login state (osu_logged_in_user) never expires — so a
   long-lived visitor still looks "logged in" while publish/unpublish 401.
   Decode the exp client-side so those flows can offer a re-login instead of
   a dead-end error. Malformed / missing -> treat as expired. */
function isOsuAuthTokenExpired() {
    const tok = getOsuAuthToken();
    if (!tok || tok.indexOf('.') < 0) return true;
    try {
        const b64 = tok.slice(0, tok.indexOf('.')).replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(b64));
        return !payload.exp || Date.now() > payload.exp;
    } catch { return true; }
}

function osuReloginPrompt() {
    if (confirm(t('publish_relogin_prompt'))) {
        window.location.href = '/.netlify/functions/osu-login';
    }
}

/* ===== PP calculator + strain graph =====
   Recomputes stars/PP for arbitrary mods/accuracy and renders a difficulty-
   over-time curve, via the osu-pp function (rosu-pp-js parsing the raw .osu
   file server-side — the v1 API used elsewhere in this file has no mod-aware
   recalculation or strain data). */
function findOsuSetById(setId) {
    const col = getOsuCollection();
    for (const mode of OSU_MODES) {
        const found = col[mode].find(s => s.beatmapset_id === setId);
        if (found) return found;
    }
    return null;
}

const PP_MOD_GROUPS = {
    DT: ['DT', 'NC', 'HT'], NC: ['DT', 'NC', 'HT'], HT: ['DT', 'NC', 'HT'],
    EZ: ['EZ', 'HR'], HR: ['EZ', 'HR'],
    SD: ['SD', 'PF'], PF: ['SD', 'PF'],
};
const PP_MOD_LIST = ['EZ', 'HR', 'HD', 'HT', 'DT', 'NC', 'FL', 'SD', 'PF', 'NF'];

let ppCalcState = null;

function openPpCalcModal(setId, event) {
    if (event) event.stopPropagation();
    const set = findOsuSetById(setId);
    if (!set || !set.beatmaps.length) return;

    const hardest = set.beatmaps[set.beatmaps.length - 1];
    ppCalcState = { setId, beatmapId: hardest.beatmap_id, mods: new Set() };

    document.getElementById('pp-calc-title').textContent = `${set.artist} - ${set.title}`;
    document.getElementById('pp-calc-diff-select').innerHTML = set.beatmaps.map(b =>
        `<option value="${b.beatmap_id}" ${b.beatmap_id === hardest.beatmap_id ? 'selected' : ''}>${escHtml(b.version)} (${b.difficulty_rating.toFixed(2)}★)</option>`
    ).join('');

    document.getElementById('pp-calc-acc').value = 100;
    document.getElementById('pp-calc-combo').value = '';
    document.getElementById('pp-calc-miss').value = 0;
    document.getElementById('pp-calc-status').innerText = '';
    document.getElementById('pp-calc-result').style.display = 'none';
    document.getElementById('pp-calc-graph-wrap').style.display = 'none';
    document.getElementById('pp-calc-radar-wrap').style.display = 'none';
    document.getElementById('pp-calc-combo-label').style.display = 'none';
    renderPpCalcMods();

    document.getElementById('pp-calc-modal').style.display = 'flex';
}

function closePpCalcModal() {
    document.getElementById('pp-calc-modal').style.display = 'none';
}

function selectPpCalcDiff(beatmapIdStr) {
    if (!ppCalcState) return;
    ppCalcState.beatmapId = parseInt(beatmapIdStr);
    document.getElementById('pp-calc-status').innerText = '';
    document.getElementById('pp-calc-result').style.display = 'none';
    document.getElementById('pp-calc-graph-wrap').style.display = 'none';
    document.getElementById('pp-calc-radar-wrap').style.display = 'none';
    document.getElementById('pp-calc-combo-label').style.display = 'none';
}

function togglePpCalcMod(mod) {
    if (!ppCalcState) return;
    const group = PP_MOD_GROUPS[mod];
    if (ppCalcState.mods.has(mod)) {
        ppCalcState.mods.delete(mod);
    } else {
        if (group) group.forEach(m => ppCalcState.mods.delete(m));
        ppCalcState.mods.add(mod);
    }
    renderPpCalcMods();
    document.getElementById('pp-calc-result').style.display = 'none';
    document.getElementById('pp-calc-graph-wrap').style.display = 'none';
    document.getElementById('pp-calc-radar-wrap').style.display = 'none';
    document.getElementById('pp-calc-combo-label').style.display = 'none';
}

function renderPpCalcMods() {
    document.getElementById('pp-calc-mods-row').innerHTML = PP_MOD_LIST.map(mod =>
        `<button type="button" class="pp-calc-mod-chip ${ppCalcState.mods.has(mod) ? 'active' : ''}" onclick="togglePpCalcMod('${mod}')">${mod}</button>`
    ).join('');
}

async function osuPpFetch(beatmapId, mods, accList, combo, misses, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const params = new URLSearchParams({ id: beatmapId, mods, acc: accList.join(',') });
    if (combo !== undefined) params.set('combo', combo);
    if (misses !== undefined) params.set('misses', misses);
    let res;
    try {
        res = await fetch(`/.netlify/functions/osu-pp?${params.toString()}`, { signal: controller.signal });
    } catch (e) {
        if (e.name === 'AbortError') throw new Error(`${timeoutMs / 1000}s timeout`);
        throw e;
    } finally {
        clearTimeout(timer);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
    return data;
}

async function runPpCalc() {
    if (!ppCalcState) return;
    const acc = parseFloat(document.getElementById('pp-calc-acc').value);
    const comboRaw = document.getElementById('pp-calc-combo').value.trim();
    const missRaw = document.getElementById('pp-calc-miss').value.trim();
    const status = document.getElementById('pp-calc-status');
    document.getElementById('pp-calc-result').style.display = 'none';
    document.getElementById('pp-calc-graph-wrap').style.display = 'none';
    document.getElementById('pp-calc-radar-wrap').style.display = 'none';
    document.getElementById('pp-calc-combo-label').style.display = 'none';

    if (!Number.isFinite(acc) || acc < 0 || acc > 100) {
        status.innerText = t('pp_calc_acc_invalid');
        status.style.color = '#ff5252';
        return;
    }
    const combo = comboRaw === '' ? undefined : parseInt(comboRaw, 10);
    const misses = missRaw === '' ? 0 : parseInt(missRaw, 10);
    if ((combo !== undefined && (!Number.isInteger(combo) || combo < 0)) || !Number.isInteger(misses) || misses < 0) {
        status.innerText = t('pp_calc_combo_invalid');
        status.style.color = '#ff5252';
        return;
    }

    status.innerText = t('pp_calc_calculating');
    status.style.color = '#c8a2e0';

    const accList = [...new Set([acc, 95, 98, 100])].sort((a, b) => a - b);
    const modsStr = [...ppCalcState.mods].join('');

    try {
        const data = await osuPpFetch(ppCalcState.beatmapId, modsStr, accList, combo, misses);
        status.innerText = '';
        renderPpCalcResult(data, combo, misses);
    } catch (e) {
        console.error('PP calc failed:', e);
        status.innerText = `${t('pp_calc_error')}${e.message ? ' (' + e.message + ')' : ''}`;
        status.style.color = '#ff5252';
    }
}

function strainChartSvg(values, sectionLengthMs) {
    const width = 600, height = 140;
    const padL = 6, padR = 6, padT = 10, padB = 20;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const n = values.length;
    const maxV = Math.max(1, ...values);

    const xPos = i => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
    const yPos = v => padT + innerH - (v / maxV) * innerH;

    const pts = values.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ');
    const areaPts = `${padL},${padT + innerH} ${pts} ${padL + innerW},${padT + innerH}`;

    const totalSec = Math.round((n * sectionLengthMs) / 1000);
    const fmtTime = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    const baseline = `<line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" class="trend-chart-grid" />`;
    const xLabels = `<text x="${padL}" y="${height - 4}" text-anchor="start" class="trend-chart-axis-label">0:00</text>
        <text x="${padL + innerW}" y="${height - 4}" text-anchor="end" class="trend-chart-axis-label">${fmtTime(totalSec)}</text>`;

    return `<svg viewBox="0 0 ${width} ${height}" class="strain-chart-svg" preserveAspectRatio="none">
        <polygon points="${areaPts}" class="strain-chart-fill" />
        <polyline points="${pts}" class="strain-chart-line" />
        ${baseline}${xLabels}
    </svg>`;
}

/* Five-axis radar/spider chart (AR/OD/CS/HP + ★) — same hand-rolled-SVG
   approach as strainChartSvg/hitErrorChartSvg above rather than pulling in
   a charting library for one shape. AR/OD/CS/HP are normalized against 11
   (the practical ceiling once HR/mod stacking pushes a stat past its
   nominal 0-10 range) and ★ against 10 (a generous top-difficulty
   reference) — an axis maxing out at the outer ring just means "at or
   past that reference", which is expected and fine for a handful of
   extreme maps rather than something the chart needs to accommodate
   exactly. */
function difficultyRadarSvg(attrs, stars) {
    const width = 260, height = 250;
    const cx = width / 2, cy = height / 2 - 4;
    const R = 82;
    const axes = [
        { label: 'AR', value: attrs.ar, max: 11 },
        { label: 'OD', value: attrs.od, max: 11 },
        { label: 'CS', value: attrs.cs, max: 11 },
        { label: 'HP', value: attrs.hp, max: 11 },
        { label: '★', value: stars, max: 10 },
    ];
    const n = axes.length;
    const angleFor = i => -Math.PI / 2 + (i / n) * Math.PI * 2;
    const pointFor = (i, frac) => [
        (cx + Math.cos(angleFor(i)) * R * frac).toFixed(2),
        (cy + Math.sin(angleFor(i)) * R * frac).toFixed(2),
    ];

    const rings = [0.25, 0.5, 0.75, 1].map(frac =>
        `<polygon points="${axes.map((_, i) => pointFor(i, frac).join(',')).join(' ')}" class="radar-ring" />`
    ).join('');
    const axisLines = axes.map((_, i) => {
        const [x, y] = pointFor(i, 1);
        return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-axis-line" />`;
    }).join('');
    const valuePts = axes.map((ax, i) => pointFor(i, Math.max(0, Math.min(1, ax.value / ax.max))).join(',')).join(' ');
    const labels = axes.map((ax, i) => {
        const [x, y] = pointFor(i, 1.24);
        return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="radar-axis-label">${ax.label} ${ax.value.toFixed(1)}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${width} ${height}" class="difficulty-radar-svg">
        ${rings}${axisLines}
        <polygon points="${valuePts}" class="radar-value-fill" />
        ${labels}
    </svg>`;
}

function renderPpCalcResult(data, combo, misses) {
    const resultEl = document.getElementById('pp-calc-result');
    const comboLabel = document.getElementById('pp-calc-combo-label');
    if (comboLabel) {
        const comboStr = combo !== undefined ? `${Math.min(combo, data.maxCombo).toLocaleString()}x/${data.maxCombo.toLocaleString()}x` : t('pp_calc_combo_full', { max: data.maxCombo.toLocaleString() });
        const missStr = misses ? t('pp_calc_combo_misses', { n: misses }) : '';
        comboLabel.textContent = `${comboStr}${missStr}`;
        comboLabel.style.display = '';
    }

    const boxes = [`<div class="osu-stat"><div class="osu-stat-value">${data.stars.toFixed(2)}⭐</div><div class="osu-stat-label">${t('pp_calc_stars_label')}</div></div>`];
    Object.keys(data.pp).map(Number).sort((a, b) => a - b).forEach(acc => {
        boxes.push(`<div class="osu-stat"><div class="osu-stat-value">${Math.round(data.pp[acc])}pp</div><div class="osu-stat-label">${acc}%</div></div>`);
    });
    resultEl.innerHTML = boxes.join('');
    resultEl.style.display = 'grid';

    const graphWrap = document.getElementById('pp-calc-graph-wrap');
    if (data.strains && data.strains.values && data.strains.values.length) {
        graphWrap.innerHTML = `<div class="pp-calc-section-label">${t('pp_calc_strain_title')}</div>
            <div class="trend-chart-wrap">${strainChartSvg(data.strains.values, data.strains.sectionLength)}</div>`;
    } else {
        graphWrap.innerHTML = `<p class="osu-empty">${t('pp_calc_strain_unsupported')}</p>`;
    }
    graphWrap.style.display = 'block';

    const radarWrap = document.getElementById('pp-calc-radar-wrap');
    if (radarWrap && data.attrs) {
        radarWrap.innerHTML = `<div class="pp-calc-section-label">${t('pp_calc_radar_title')}</div>
            <div class="difficulty-radar-wrap">${difficultyRadarSvg(data.attrs, data.stars)}</div>`;
        radarWrap.style.display = 'block';
    }
}

/* ===== Shareable PNG cards =====
   Builds a themed card off-screen as real DOM/CSS (see .share-card in
   css/osu.css), rasterizes it with html-to-image, then downloads it as a
   PNG. Using real DOM instead of hand-rolled canvas drawing means the card
   markup can be restyled with plain CSS. Colors are fixed rather than
   theme-token-driven so an exported image looks the same regardless of the
   viewer's dark/light mode. */
function buildStatTile(value, label) {
    const tile = document.createElement('div');
    tile.className = 'osu-stat';
    const v = document.createElement('div');
    v.className = 'osu-stat-value';
    v.textContent = value;
    const l = document.createElement('div');
    l.className = 'osu-stat-label';
    l.textContent = label;
    tile.append(v, l);
    return tile;
}

function buildShareCard({ title, avatarUrl, name, sub, stats }) {
    const card = document.createElement('div');
    card.className = 'share-card';

    if (title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'share-card-title';
        titleEl.textContent = title;
        card.appendChild(titleEl);
    }

    if (name) {
        const header = document.createElement('div');
        header.className = 'share-card-header';
        if (avatarUrl) {
            const img = document.createElement('img');
            img.className = 'share-card-avatar';
            img.src = avatarUrl;
            header.appendChild(img);
        }
        const info = document.createElement('div');
        const nameEl = document.createElement('div');
        nameEl.className = 'share-card-name';
        nameEl.textContent = name;
        info.appendChild(nameEl);
        if (sub) {
            const subEl = document.createElement('div');
            subEl.className = 'share-card-sub';
            subEl.textContent = sub;
            info.appendChild(subEl);
        }
        header.appendChild(info);
        card.appendChild(header);
    }

    const grid = document.createElement('div');
    grid.className = 'share-card-stats';
    stats.forEach(([label, value]) => grid.appendChild(buildStatTile(value, label)));
    card.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'share-card-footer';
    footer.textContent = location.host;
    card.appendChild(footer);

    return card;
}

async function downloadShareCardPng(card, filename, doneMsg, failMsg) {
    document.body.appendChild(card);
    try {
        if (typeof htmlToImage === 'undefined') await ensureHtmlToImage();
        const dataUrl = await htmlToImage.toPng(card, { pixelRatio: 2, cacheBust: true });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        a.click();
        showShareToast(doneMsg);
    } catch (e) {
        console.error('Share card generation failed:', e);
        showShareToast(failMsg);
    } finally {
        card.remove();
    }
}

async function downloadStatsCardFor(u, mode) {
    if (!u) return;
    const card = buildShareCard({
        avatarUrl: osuAvatarUrl(u.user_id),
        name: u.username,
        sub: `${COUNTRY_NAMES[u.country] || u.country} · ${OSU_MODE_LABELS[mode]}`,
        stats: [
            [t('osu_stat_global'), u.pp_rank != null ? '#' + parseInt(u.pp_rank).toLocaleString() : '—'],
            ['PP', u.pp_raw != null ? Math.round(parseFloat(u.pp_raw)).toLocaleString() : '—'],
            [t('osu_stat_accuracy'), u.accuracy != null ? parseFloat(u.accuracy).toFixed(2) + '%' : '—'],
            [t('osu_stat_playcount'), u.playcount != null ? parseInt(u.playcount).toLocaleString() : '—'],
        ],
    });
    await downloadShareCardPng(card, `osu-stats-${u.username}-${OSU_MODE_LABELS[mode]}.png`, t('stats_card_done'), t('stats_card_fail'));
}

function downloadVisitorStatsCard() {
    downloadStatsCardFor(visitorModeData[visitorCurrentMode], visitorCurrentMode);
}

/* ===== Shareable collection card =====
   Same off-screen html-to-image approach as the PP stats card above, but
   summarizing the local Beatmap collection instead of an osu! profile —
   purely derived from localStorage, no API calls needed. */
async function downloadCollectionShareCard() {
    const col = getOsuCollection();
    const seen = new Set();
    const allSets = OSU_MODES.flatMap(m => col[m]).filter(s => {
        if (seen.has(s.beatmapset_id)) return false;
        seen.add(s.beatmapset_id);
        return true;
    });
    if (allSets.length === 0) {
        showShareToast(t('osu_share_link_empty'));
        return;
    }

    const allRatings = allSets.flatMap(s => s.beatmaps.map(b => b.difficulty_rating)).filter(r => r > 0);
    const avgRating = allRatings.length ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;
    const maxRating = allRatings.length ? Math.max(...allRatings) : 0;
    const favCount = getOsuFavorites().filter(id => allSets.some(s => s.beatmapset_id === id)).length;

    const card = buildShareCard({
        title: t('collection_card_title'),
        stats: [
            [t('osu_stats_total'), allSets.length],
            [t('osu_fav'), favCount],
            [t('osu_stats_avg_rating'), avgRating.toFixed(2) + '⭐'],
            [t('osu_stats_max_rating'), maxRating.toFixed(2) + '⭐'],
        ],
    });
    await downloadShareCardPng(card, `osu-collection-${Date.now()}.png`, t('collection_card_done'), t('collection_card_fail'));
}
