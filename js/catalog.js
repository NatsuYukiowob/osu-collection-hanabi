/* ===== Catalog tab: browse the whole ranked beatmap catalog by artist /
   language / genre / source / feat. name. Backed by this site's own
   metadata index (netlify/functions/catalog-list.js, fed by the
   catalog-crawl-cron.js background crawler — no star floor, no PP, one lean
   record per beatmapSET). The dataset is partial/growing, never implied
   complete — see renderCatalogCoverage(). =====

   Reuses osu.js helpers: OSU_GENRES / OSU_LANGUAGES (id -> localized name),
   escHtml, icon, buildPaginationPageButtons, addOsuBeatmap,
   applyImportedCollections. Frontend mode keys ('standard'/…) bridge to the
   API's ruleset ints via CATALOG_MODE_INT. */
const CATALOG_MODE_INT = { standard: 0, taiko: 1, catch: 2, mania: 3 };
// 3-column grid, 4 rows per page (see #catalog-list in css/osu.css). The
// server takes this as a `pageSize` override.
const CATALOG_PAGE_SIZE = 12;

let catalogLoaded = false;
let catalogPage = 0;
let catalogQuery = '';
let catalogSort = 'ranked_desc';
let catalogMode = '';        // '' = all rulesets, else 'standard'|'taiko'|'catch'|'mania'
let catalogLang = 'all';     // 'all' | 'unknown' | '<language id>'
let catalogGenre = 'all';    // 'all' | 'unknown' | '<genre id>'
let catalogSource = 'all';   // 'all' | 'none' | '<source string>'
let catalogArtist = 'all';   // 'all' | '<artist key>'
// Star-rating range filter — 0..CATALOG_STAR_SLIDER_MAX, matching osu!'s own
// difficulty colour ramp (see catalogStarGradient() / js/osu.js's
// STAR_COLOR_STOPS). catalogStarMax sitting at the slider's own max means
// "no upper bound" (a set with a 12★ meme diff still matches "10+"),
// mirrored by catalogBuildParams() only sending starMax when it's below it.
const CATALOG_STAR_SLIDER_MAX = 10;
let catalogStarMin = 0;
let catalogStarMax = CATALOG_STAR_SLIDER_MAX;
let catalogStarDebounce = null;
let catalogNsfw = false;
let catalogItems = [];
let catalogTotal = 0;
let catalogCoverage = null;
let catalogFacets = null;
let catalogSearchDebounce = null;

// The source/artist facets are unbounded (see catalog-list.js), so instead
// of a plain <select> they're a searchable combobox: a text input that
// filters catalogFacets.topSources/topArtists client-side. Rendered list is
// still capped at CATALOG_COMBO_MAX_RESULTS to keep the dropdown DOM small
// when the query is empty/broad — narrower typing shrinks it below the cap.
const CATALOG_COMBO_MAX_RESULTS = 200;
const catalogComboState = {
    source: { query: '', open: false },
    artist: { query: '', open: false },
};

function ensureCatalogLoaded() {
    if (!catalogLoaded) loadCatalogPage(0);
    initCatalogStarSlider();
}

function catalogActiveFacet() {
    /* The single active metadata facet, or null when zero or more than one
       are set — the "build a collection" button only makes sense for one. */
    const active = [];
    if (catalogLang !== 'all') active.push(['language', catalogLang]);
    if (catalogGenre !== 'all') active.push(['genre', catalogGenre]);
    if (catalogSource !== 'all') active.push(['source', catalogSource]);
    if (catalogArtist !== 'all') active.push(['artist', catalogArtist]);
    return active.length === 1 ? { type: active[0][0], value: active[0][1] } : null;
}

function catalogFacetLabel(facet) {
    if (!facet) return '';
    if (facet.type === 'artist') return facet.value;
    if (facet.type === 'source') return facet.value === 'none' ? t('osu_source_filter_none') : facet.value;
    if (facet.type === 'language') {
        if (facet.value === 'unknown') return t('lang_unknown');
        const e = OSU_LANGUAGES[facet.value];
        return e ? t(e.key) : String(facet.value);
    }
    if (facet.type === 'genre') {
        if (facet.value === 'unknown') return t('genre_unspecified');
        return OSU_GENRES[facet.value] ? t(OSU_GENRES[facet.value]) : String(facet.value);
    }
    return '';
}

function catalogBuildParams(extra) {
    const params = new URLSearchParams({ sort: catalogSort });
    if (catalogQuery) params.set('q', catalogQuery);
    if (catalogMode) params.set('mode', String(CATALOG_MODE_INT[catalogMode]));
    if (catalogLang !== 'all') params.set('language', catalogLang);
    if (catalogGenre !== 'all') params.set('genre', catalogGenre);
    if (catalogSource !== 'all') params.set('source', catalogSource);
    if (catalogArtist !== 'all') params.set('artist', catalogArtist);
    if (catalogStarMin > 0) params.set('starMin', String(catalogStarMin));
    if (catalogStarMax < CATALOG_STAR_SLIDER_MAX) params.set('starMax', String(catalogStarMax));
    if (catalogNsfw) params.set('includeNsfw', '1');
    for (const [k, v] of Object.entries(extra || {})) params.set(k, String(v));
    return params;
}

function switchCatalogMode(v) { catalogMode = v; loadCatalogPage(0); }
function switchCatalogSort(v) { catalogSort = v; loadCatalogPage(0); }
function switchCatalogLang(v) { catalogLang = v; loadCatalogPage(0); }
function switchCatalogGenre(v) { catalogGenre = v; loadCatalogPage(0); }
function switchCatalogSource(v) { catalogSource = v; loadCatalogPage(0); }
function switchCatalogArtist(v) { catalogArtist = v; loadCatalogPage(0); }
function toggleCatalogNsfw(checked) { catalogNsfw = checked; loadCatalogPage(0); }

/* ===== ⭐ Star-rating range slider =====
   Two overlapping native <input type="range"> (the standard dual-thumb-
   slider trick: both track/thumbs transparent by CSS except the thumb
   itself, which is where pointer-events stay enabled — see
   .catalog-star-input in css/osu.css). Track gradient is generated here
   from starRatingColor() (js/osu.js) rather than hand-picked colours, so it
   always matches the exact difficulty colour used on every mode-diff-icon
   elsewhere on the site. */
function catalogStarGradient() {
    if (typeof starRatingColor !== 'function') return '';
    const stops = [];
    for (let s = 0; s <= CATALOG_STAR_SLIDER_MAX; s += 0.25) {
        stops.push(`${starRatingColor(s)} ${(s / CATALOG_STAR_SLIDER_MAX * 100).toFixed(1)}%`);
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
}

let catalogStarSliderInited = false;
function initCatalogStarSlider() {
    if (!catalogStarSliderInited) {
        const track = document.getElementById('catalog-star-track');
        if (track) track.style.background = catalogStarGradient();
        // Whichever thumb was last grabbed renders on top, so the min thumb
        // can still be dragged back down after the two meet/cross — plain
        // static z-index would let one thumb permanently shadow the other.
        const minEl = document.getElementById('catalog-star-min');
        const maxEl = document.getElementById('catalog-star-max');
        if (minEl) minEl.addEventListener('pointerdown', () => { minEl.style.zIndex = 2; if (maxEl) maxEl.style.zIndex = 1; });
        if (maxEl) maxEl.addEventListener('pointerdown', () => { maxEl.style.zIndex = 2; if (minEl) minEl.style.zIndex = 1; });
        catalogStarSliderInited = true;
    }
    renderCatalogStarUI();
}

function onCatalogStarInput() {
    const minEl = document.getElementById('catalog-star-min');
    const maxEl = document.getElementById('catalog-star-max');
    if (!minEl || !maxEl) return;
    let minV = parseFloat(minEl.value);
    let maxV = parseFloat(maxEl.value);
    // Don't let the two thumbs cross — push whichever one wasn't just
    // dragged along instead, so the range always stays non-inverted.
    if (minV > maxV) {
        if (document.activeElement === minEl) { maxV = minV; maxEl.value = String(maxV); }
        else { minV = maxV; minEl.value = String(minV); }
    }
    catalogStarMin = minV;
    catalogStarMax = maxV;
    renderCatalogStarUI();
    clearTimeout(catalogStarDebounce);
    catalogStarDebounce = setTimeout(() => loadCatalogPage(0), 300);
}

function renderCatalogStarUI() {
    const minEl = document.getElementById('catalog-star-min');
    const maxEl = document.getElementById('catalog-star-max');
    if (minEl) minEl.value = String(catalogStarMin);
    if (maxEl) maxEl.value = String(catalogStarMax);
    const minPct = catalogStarMin / CATALOG_STAR_SLIDER_MAX * 100;
    const maxPct = catalogStarMax / CATALOG_STAR_SLIDER_MAX * 100;
    const before = document.getElementById('catalog-star-dim-before');
    const after = document.getElementById('catalog-star-dim-after');
    if (before) before.style.width = minPct + '%';
    if (after) after.style.width = (100 - maxPct) + '%';
    const label = document.getElementById('catalog-star-filter-value');
    if (label) {
        const maxText = catalogStarMax >= CATALOG_STAR_SLIDER_MAX ? `${CATALOG_STAR_SLIDER_MAX.toFixed(1)}+` : catalogStarMax.toFixed(1);
        label.textContent = `${catalogStarMin.toFixed(1)} - ${maxText} ⭐`;
    }
}

function searchCatalog(value) {
    catalogQuery = value.trim();
    clearTimeout(catalogSearchDebounce);
    catalogSearchDebounce = setTimeout(() => loadCatalogPage(0), 350);
}

async function loadCatalogPage(page) {
    catalogLoaded = true;
    const listEl = document.getElementById('catalog-list');
    const pageEl = document.getElementById('catalog-pagination');
    if (!listEl) return;

    listEl.innerHTML = `<p class="osu-empty">${t('gallery_loading')}</p>`;
    if (pageEl) pageEl.innerHTML = '';

    try {
        const params = catalogBuildParams({ page, pageSize: CATALOG_PAGE_SIZE });
        const res = await fetch(`/.netlify/functions/catalog-list?${params}`);
        if (!res.ok) throw new Error('bad response');
        const data = await res.json();
        catalogPage = data.page || 0;
        catalogTotal = data.total || 0;
        catalogItems = data.items || [];
        catalogCoverage = data.coverage || null;
        catalogFacets = data.facets || null;
        rebuildCatalogFacetSelects();
        renderCatalogList();
    } catch (e) {
        console.error('Catalog list failed:', e);
        listEl.innerHTML = `<p class="osu-empty">${t('catalog_load_fail')}</p>`;
    }
}

/* Rebuild the language/genre <select>s and the source/artist comboboxes
   from the facet counts the server returned, keeping the current selection
   valid even if it fell out of the facet response. */
function rebuildCatalogFacetSelects() {
    if (!catalogFacets) return;
    const f = catalogFacets;

    const langSel = document.getElementById('catalog-lang-filter');
    if (langSel) {
        let html = `<option value="all">${t('osu_lang_filter_all')}</option>`;
        for (const { id, count } of (f.languages || [])) {
            if (id === 'unknown') { html += `<option value="unknown">🌐 ${t('lang_unknown')} (${count})</option>`; continue; }
            const e = OSU_LANGUAGES[id];
            const name = e ? t(e.key) : String(id);
            const flag = e ? e.flag : '🌐';
            html += `<option value="${id}">${flag} ${escHtml(name)} (${count})</option>`;
        }
        langSel.innerHTML = html;
        langSel.value = [...langSel.options].some(o => o.value === catalogLang) ? catalogLang : (catalogLang = 'all');
    }

    const genreSel = document.getElementById('catalog-genre-filter');
    if (genreSel) {
        let html = `<option value="all">${t('osu_genre_filter_all')}</option>`;
        for (const { id, count } of (f.genres || [])) {
            if (id === 'unknown') { html += `<option value="unknown">${t('genre_unspecified')} (${count})</option>`; continue; }
            const name = OSU_GENRES[id] ? t(OSU_GENRES[id]) : String(id);
            html += `<option value="${id}">${escHtml(name)} (${count})</option>`;
        }
        genreSel.innerHTML = html;
        genreSel.value = [...genreSel.options].some(o => o.value === catalogGenre) ? catalogGenre : (catalogGenre = 'all');
    }

    // Source/artist are unbounded lists (no top-N cap server-side, see
    // catalog-list.js), so they're a searchable combobox instead of a plain
    // <select> — see catalogCombo* below.
    catalogComboSyncValue('source');
    catalogComboSyncValue('artist');
}

/* Every option for a combo kind, current facet counts plus a fallback entry
   for the active selection if it's since dropped below the >30 cutoff (so
   the active filter still has a matching row). Source's "none" bucket is
   pinned first, ahead of the alphabetically-sorted names from the server. */
function catalogComboOptions(kind) {
    if (!catalogFacets) return [];
    if (kind === 'source') {
        const opts = [];
        if (catalogFacets.noSourceCount) opts.push({ value: 'none', label: t('osu_source_filter_none'), count: catalogFacets.noSourceCount });
        for (const { name, count } of (catalogFacets.topSources || [])) opts.push({ value: name, label: name, count });
        if (catalogSource !== 'all' && catalogSource !== 'none' && !opts.some(o => o.value === catalogSource)) {
            opts.push({ value: catalogSource, label: catalogSource, count: '·' });
        }
        return opts;
    }
    const opts = (catalogFacets.topArtists || []).map(({ key, count }) => ({ value: key, label: key, count }));
    if (catalogArtist !== 'all' && !opts.some(o => o.value === catalogArtist)) {
        opts.push({ value: catalogArtist, label: catalogArtist, count: '·' });
    }
    return opts;
}

/* Reset an out-of-range selection back to 'all' (facets can shrink as
   filters change) and refresh what the combo's input box displays. */
function catalogComboSyncValue(kind) {
    const opts = catalogComboOptions(kind);
    if (kind === 'source') {
        if (catalogSource !== 'all' && catalogSource !== 'none' && !opts.some(o => o.value === catalogSource)) catalogSource = 'all';
    } else if (catalogArtist !== 'all' && !opts.some(o => o.value === catalogArtist)) {
        catalogArtist = 'all';
    }
    const inputEl = document.getElementById(`catalog-${kind}-combo-input`);
    if (!inputEl) return;
    const current = kind === 'source' ? catalogSource : catalogArtist;
    if (current === 'all') inputEl.value = '';
    else if (current === 'none') inputEl.value = t('osu_source_filter_none');
    else inputEl.value = current;
    if (catalogComboState[kind].open) catalogComboRender(kind);
}

/* Rebuild the dropdown panel's contents: an "all" row, then every option
   whose label contains the typed query (case-insensitive substring, so it
   also matches mid-word — good enough without per-language reading data),
   capped at CATALOG_COMBO_MAX_RESULTS with a "N more, keep typing" hint. */
function catalogComboRender(kind) {
    const listEl = document.getElementById(`catalog-${kind}-combo-list`);
    if (!listEl) return;
    const current = kind === 'source' ? catalogSource : catalogArtist;
    const q = catalogComboState[kind].query.trim().toLowerCase();
    const opts = catalogComboOptions(kind);
    const matches = q ? opts.filter(o => o.label.toLowerCase().includes(q)) : opts;
    const shown = matches.slice(0, CATALOG_COMBO_MAX_RESULTS);

    const allLabel = t(kind === 'source' ? 'osu_source_filter_all' : 'osu_artist_filter_all');
    let html = `<div class="catalog-combo-option${current === 'all' ? ' active' : ''}" data-combo-kind="${kind}" data-combo-value="all">${escHtml(allLabel)}</div>`;
    if (!shown.length) {
        html += `<div class="catalog-combo-empty">${t('catalog_combo_no_match')}</div>`;
    } else {
        for (const o of shown) {
            html += `<div class="catalog-combo-option${o.value === current ? ' active' : ''}" data-combo-kind="${kind}" data-combo-value="${escHtml(o.value)}">${escHtml(o.label)} (${o.count})</div>`;
        }
        if (matches.length > shown.length) {
            html += `<div class="catalog-combo-more">${t('catalog_combo_more_hint', { n: matches.length - shown.length })}</div>`;
        }
    }
    listEl.innerHTML = html;
}

function catalogComboOpen(kind) {
    catalogComboClose(kind === 'source' ? 'artist' : 'source');
    catalogComboState[kind].open = true;
    catalogComboRender(kind);
    const listEl = document.getElementById(`catalog-${kind}-combo-list`);
    if (listEl) listEl.hidden = false;
}

function catalogComboFilter(kind, value) {
    catalogComboState[kind].query = value;
    catalogComboOpen(kind);
}

function catalogComboClose(kind) {
    if (!catalogComboState[kind].open) return;
    catalogComboState[kind].open = false;
    catalogComboState[kind].query = '';
    const listEl = document.getElementById(`catalog-${kind}-combo-list`);
    if (listEl) listEl.hidden = true;
    // Closing without picking anything (Escape / click away) would otherwise
    // leave whatever the visitor typed sitting in the box instead of the
    // actually-active filter — snap the displayed text back in sync.
    catalogComboSyncValue(kind);
}

function catalogComboPick(kind, value) {
    if (kind === 'source') switchCatalogSource(value);
    else switchCatalogArtist(value);
    catalogComboClose(kind);
}

/* Delegated rather than inline onclick with dynamic strings, since artist/
   source names can contain quotes/unicode that would need fragile escaping
   into a JS string literal embedded in an HTML attribute (see the same
   rationale in global-search.js). */
document.addEventListener('click', (e) => {
    const opt = e.target.closest('.catalog-combo-option');
    if (opt) {
        catalogComboPick(opt.dataset.comboKind, opt.dataset.comboValue);
        return;
    }
    if (!e.target.closest('#catalog-source-combo')) catalogComboClose('source');
    if (!e.target.closest('#catalog-artist-combo')) catalogComboClose('artist');
});
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    catalogComboClose('source');
    catalogComboClose('artist');
});

/* How many sets in the visitor's own collection match the active facet.
   artist uses the same artistKeys() split as the crawler; source/genre/
   language read the per-set metadata that backfillOsuLanguages() tops up
   (so those can undercount until the backfill catches a set — surfaced in
   the UI note, not hidden). */
function catalogCollectionMatchCount(facet) {
    if (!facet) return 0;
    const sets = OSU_MODES.flatMap(m => getOsuCollection()[m] || []);
    let n = 0;
    for (const s of sets) {
        let hit = false;
        if (facet.type === 'artist') {
            hit = artistKeys(s.artist).includes(facet.value);
        } else if (facet.type === 'source') {
            hit = facet.value === 'none' ? !s.source : (s.source || '') === facet.value;
        } else if (facet.type === 'language') {
            hit = facet.value === 'unknown' ? !(s.language && s.language.id) : (s.language && s.language.id) === Number(facet.value);
        } else if (facet.type === 'genre') {
            hit = facet.value === 'unknown' ? !(s.genre && s.genre.id) : (s.genre && s.genre.id) === Number(facet.value);
        }
        if (hit) n++;
    }
    return n;
}

/* The "➕ build / 補完" button's state, driven by the active facet and how
   much of it the visitor already owns. Called from renderCatalogCompletion(). */
function updateCatalogCreateBtn(facet, have, total) {
    const btn = document.getElementById('catalog-create-collection-btn');
    if (!btn) return;
    if (!facet) {
        btn.disabled = true;
        btn.textContent = t('catalog_create_collection_btn');
        btn.title = t('catalog_create_collection_hint');
        return;
    }
    const label = catalogFacetLabel(facet);
    if (have >= total && total > 0) {
        btn.disabled = true;
        btn.textContent = t('catalog_complete_done');
        btn.title = label;
    } else if (have > 0) {
        btn.disabled = false;
        btn.textContent = t('catalog_complete_btn', { n: total - have });
        btn.title = t('catalog_create_collection_btn') + '：' + label;
    } else {
        btn.disabled = false;
        btn.textContent = t('catalog_create_collection_btn');
        btn.title = t('catalog_create_collection_btn') + '：' + label;
    }
}

/* 「補完度」panel between the coverage line and the grid: when exactly one
   facet is active, how much of that artist / source / genre / language the
   visitor has already collected, of what this site has indexed. */
function renderCatalogCompletion() {
    const el = document.getElementById('catalog-completion');
    if (!el) return;
    const facet = catalogActiveFacet();
    if (!facet) {
        el.hidden = true;
        updateCatalogCreateBtn(null);
        return;
    }
    const total = catalogTotal;
    const have = catalogCollectionMatchCount(facet);
    const pct = total > 0 ? Math.min(100, Math.round((have / total) * 100)) : 0;
    let note = '';
    if (facet.type !== 'artist') {
        const pending = typeof osuMetaPendingCount === 'function' ? osuMetaPendingCount() : 0;
        const fill = pending > 0
            ? ` <button class="catalog-meta-backfill-btn" onclick="catalogRunMetaBurst()">${t('catalog_meta_backfill_btn', { n: pending })}</button>`
            : '';
        note = `<div class="catalog-completion-note">${t('catalog_completion_meta_note')}${fill}</div>`;
    }
    el.innerHTML = `
        <div class="catalog-completion-row">
            <span class="catalog-completion-text">${t('catalog_completion_have', {
                name: escHtml(catalogFacetLabel(facet)),
                have: have.toLocaleString(),
                total: total.toLocaleString(),
            })}</span>
            <div class="catalog-completion-bar"><span style="width:${pct}%"></span></div>
        </div>${note}`;
    el.hidden = false;
    updateCatalogCreateBtn(facet, have, total);
}

function renderCatalogList() {
    const listEl = document.getElementById('catalog-list');
    const pageEl = document.getElementById('catalog-pagination');
    if (!listEl || !catalogLoaded) return;

    renderCatalogCoverage();
    renderCatalogCompletion();

    if (catalogItems.length === 0) {
        listEl.innerHTML = `<p class="osu-empty">${t('catalog_empty')}</p>`;
        if (pageEl) pageEl.innerHTML = '';
        return;
    }

    const collectionSet = new Set(
        OSU_MODES.flatMap(m => (getOsuCollection()[m] || []).map(s => s.beatmapset_id))
    );

    listEl.innerHTML = catalogItems.map(item => {
        const coverUrl = `https://assets.ppy.sh/beatmaps/${item.id}/covers/card.jpg`;
        const inCollection = collectionSet.has(item.id);
        const langEntry = item.language_id != null ? OSU_LANGUAGES[item.language_id] : null;
        const langBadge = langEntry ? `<span title="${escHtml(t(langEntry.key))}">${langEntry.flag} ${escHtml(t(langEntry.key))}</span>` : '';
        const genreBadge = item.genre_id && OSU_GENRES[item.genre_id] ? `<span>${escHtml(t(OSU_GENRES[item.genre_id]))}</span>` : '';
        const sourceBadge = item.source ? `<span class="catalog-source-badge" title="${escHtml(item.source)}">${escHtml(item.source)}</span>` : '';
        const stars = (item.star_min != null && item.star_max != null)
            ? (item.star_min === item.star_max ? item.star_min.toFixed(2) : `${item.star_min.toFixed(2)}–${item.star_max.toFixed(2)}`)
            : '';
        return `
        <div class="osu-card" onclick="window.open('https://osu.ppy.sh/beatmapsets/${item.id}','_blank')">
            <div class="osu-card-bg" style="background-image:url('${coverUrl}')"></div>
            <div class="osu-card-overlay"></div>
            <button class="farm-add-btn${inCollection ? ' in-collection' : ''}" ${inCollection ? 'disabled' : `onclick="addCatalogToCollection(${item.id}, event)"`} title="${inCollection ? t('farm_in_collection') : t('farm_add_btn_title')}">${icon(inCollection ? 'check' : 'plus')}</button>
            <button class="osu-copy-btn" onclick="copyBeatmapId(${item.id}, event)" title="${t('mappools_copy_id')}">${icon('copy')}</button>
            <button class="osu-download-btn" onclick="downloadBeatmapset(${item.id}, event)" title="${t('osu_download_btn_title')}">${icon('download')}</button>
            <button class="osu-play-btn" onclick="playOsuPreview(${item.id}, event)" title="${t('mappools_preview')}">${playBtnIcon()}</button>
            <div class="osu-card-info">
                <div class="osu-card-title">${escHtml(item.title || '')}</div>
                <div class="osu-card-artist">${escHtml(item.artist || '')}</div>
                <div class="osu-card-mapper">${t('mapped_by', { n: escHtml(item.creator || '') })}</div>
                <div class="catalog-card-meta">
                    ${stars ? `<span>${stars}★ · ${item.diff_count}譜</span>` : ''}
                    ${langBadge}${genreBadge}${sourceBadge}
                </div>
            </div>
        </div>`;
    }).join('');

    if (!pageEl) return;
    const totalPages = Math.max(1, Math.ceil(catalogTotal / CATALOG_PAGE_SIZE));
    if (totalPages <= 1) { pageEl.innerHTML = ''; return; }
    let pages = '';
    pages += `<button class="osu-page-btn" onclick="loadCatalogPage(0)" ${catalogPage === 0 ? 'disabled' : ''}>«</button>`;
    pages += `<button class="osu-page-btn" onclick="loadCatalogPage(Math.max(0,${catalogPage}-1))" ${catalogPage === 0 ? 'disabled' : ''}>‹</button>`;
    pages += buildPaginationPageButtons(catalogPage, totalPages, (i) => `loadCatalogPage(${i})`);
    pages += `<button class="osu-page-btn" onclick="loadCatalogPage(Math.min(${totalPages - 1},${catalogPage}+1))" ${catalogPage >= totalPages - 1 ? 'disabled' : ''}>›</button>`;
    pages += `<button class="osu-page-btn" onclick="loadCatalogPage(${totalPages - 1})" ${catalogPage >= totalPages - 1 ? 'disabled' : ''}>»</button>`;
    pageEl.innerHTML = pages;
}

function renderCatalogCoverage() {
    const el = document.getElementById('catalog-coverage');
    if (!el) return;
    if (!catalogCoverage || !catalogCoverage.lastRunAt) {
        el.textContent = t('catalog_coverage_pending');
        return;
    }
    const updated = new Date(catalogCoverage.lastRunAt).toLocaleString();
    let text = t('catalog_coverage', {
        n: (catalogCoverage.datasetSize || 0).toLocaleString(),
        t: updated,
        m: catalogTotal.toLocaleString(),
    });
    // Crawler self-check — see renderFarmCoverage() in js/farm-maps.js.
    if ((catalogCoverage.consecutiveWriteFails || 0) > 2) {
        console.warn(`[catalog crawler] dataset write failing (x${catalogCoverage.consecutiveWriteFails}); last ok ${catalogCoverage.lastOkAt || 'never'} — ${catalogCoverage.lastError || 'unknown'}`);
        text += ' ⚠';
        el.title = `Catalog crawler: dataset write has been failing since ${catalogCoverage.lastOkAt || 'the last successful run'} (${catalogCoverage.lastError || 'unknown error'}). Counts are stale.`;
    } else {
        el.removeAttribute('title');
    }
    el.textContent = text;
}

/* Called from refreshDynamicContent() on a site-language switch — the facet
   <select>s are built in JS (data-i18n can't reach their <option>s) so they
   and the cards need an explicit re-localize. */
function refreshCatalogLocalized() {
    if (!catalogLoaded) return;
    rebuildCatalogFacetSelects();
    renderCatalogList();
}

/* One-click burst of the language/genre/source backfill, from the completion
   panel's note — the default on-load pass only does 24/visit, so source/
   genre/language completion undercounts for a while. Runs a bigger, faster
   batch, then re-renders the panel with the improved count. */
async function catalogRunMetaBurst() {
    if (typeof backfillOsuLanguages !== 'function') return;
    const btn = document.querySelector('.catalog-meta-backfill-btn');
    if (btn) { btn.disabled = true; btn.textContent = t('gallery_loading'); }
    try {
        await backfillOsuLanguages({
            max: 250, chunk: 6, pauseMs: 350,
            onProgress: (done, tot) => { if (btn) btn.textContent = `${done} / ${tot}`; },
        });
    } catch (e) {
        console.error('catalog meta burst failed:', e);
    }
    renderCatalogCompletion();
}

async function addCatalogToCollection(setId, event) {
    if (event) event.stopPropagation();
    await addOsuBeatmap(String(setId));
    renderCatalogList();
}

/* Pull every set id matching the one active facet (capped server-side at
   300) and file them under a new category named after that facet, reusing
   the collection-import tail. */
async function catalogCreateCollectionFromFacet() {
    const facet = catalogActiveFacet();
    if (!facet) return;
    const label = catalogFacetLabel(facet);
    const btn = document.getElementById('catalog-create-collection-btn');

    let ids = [];
    try {
        if (btn) { btn.disabled = true; btn.textContent = t('gallery_loading'); }
        const params = catalogBuildParams({ limit: 300 });
        const res = await fetch(`/.netlify/functions/catalog-list?${params}`);
        if (!res.ok) throw new Error('bad response');
        const data = await res.json();
        ids = (data.items || []).map(x => x.id).filter(Boolean);
    } catch (e) {
        console.error('Catalog facet fetch failed:', e);
        alert(t('catalog_load_fail'));
        renderCatalogCompletion();
        return;
    }

    if (ids.length === 0) {
        alert(t('catalog_empty'));
        renderCatalogCompletion();
        return;
    }
    if (!confirm(t('catalog_create_collection_confirm', { name: label, n: ids.length }))) {
        renderCatalogCompletion();
        return;
    }

    const named = [{ name: label, entries: ids.map(id => ({ setId: id })) }];
    try {
        const report = await applyImportedCollections(named, (msg) => { if (btn) btn.textContent = msg; });
        // Remember the facet on the category so it can pull in newly-ranked
        // matches later (see refreshSmartCategory in osu.js).
        const smartChk = document.getElementById('catalog-smart-checkbox');
        if (smartChk && smartChk.checked && typeof setSmartCategory === 'function') {
            const cat = getOsuCategories().find(c => c.name === label);
            if (cat) setSmartCategory(cat.id, {
                facet: { type: facet.type, value: String(facet.value) },
                mode: catalogMode ? String(CATALOG_MODE_INT[catalogMode]) : '',
                label,
                lastSyncAt: new Date().toISOString(),
                lastCount: ids.length,
            });
        }
        alert(t('catalog_create_collection_done', { name: label, n: report.addedSets, cat: report.touchedCats }));
    } catch (e) {
        console.error('Catalog import failed:', e);
        alert(t('catalog_load_fail'));
    } finally {
        renderCatalogCompletion();
    }
}
