/* Maps catalog — ported from catch-tracker's own (later-stage) render-maps.js:
   BPM/length range sliders alongside the star slider, a download button
   (via the same open CORS mirror the main site's batch-download feature
   uses), an audio-preview button + floating mini-player, and favourite-
   count/play-count sort options — catch-tracker's own follow-up polish to
   the same page this site's own maps.html started from. */
let _page = 0;
let _status = '';
let _q = '';
let _searchDebounce = null;

const MAX_DIFF_ICONS = 8;
const PAGE_SIZE = 16; // 4x4 grid
const STAR_SLIDER_MAX = 10; // the max thumb sitting at its rightmost = "10+", unbounded
const BPM_SLIDER_MAX = 400;
const LENGTH_SLIDER_MAX = 600; // seconds (10:00)

function osuLinkBtn(beatmapsetId) {
    if (!beatmapsetId) return '';
    return `<a class="cover-link-btn" href="https://osu.ppy.sh/beatmapsets/${beatmapsetId}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="Open on osu!">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    </a>`;
}

// Direct .osz via mirror.hinamizawa.ai — same CORS-open, no-login mirror the
// main site's own batch-download feature uses, ?no_video=true keeps the
// file small like that feature does too.
function downloadBtn(beatmapsetId) {
    if (!beatmapsetId) return '';
    return `<a class="cover-link-btn cover-link-btn--left" href="https://mirror.hinamizawa.ai/d/${beatmapsetId}?no_video=true&redirect=true" onclick="event.stopPropagation()" title="${escapeHtml(t('download_osz'))}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11m0 0l-4-4m4 4l4-4"/><path d="M4 20h16"/></svg>
    </a>`;
}

function mapCard(set) {
    const cover = coverArtUrlCard(set.beatmapset_id);
    const style = cover ? ` style="background-image:url('${cover.replace(/'/g, '%27')}')"` : '';
    const starLabel = set.star_min != null && set.star_max != null
        ? (set.star_min === set.star_max ? set.star_min.toFixed(2) + '★' : `${set.star_min.toFixed(2)}–${set.star_max.toFixed(2)}★`)
        : '';
    const shown = set.diffs.slice(0, MAX_DIFF_ICONS);
    const overflow = set.diffs.length - shown.length;
    const diffRow = shown.map(d => diffIcon(d.beatmap_id, d.difficulty_rating, d.version)).join('')
        + (overflow > 0 ? `<span class="diff-icon-more">+${overflow}</span>` : '');
    const target = set.primary_beatmap_id ?? (set.diffs[0] && set.diffs[0].beatmap_id);
    // Forward-only backfill — a set the crawler hasn't re-touched since
    // play_count capture shipped just omits the play-count text, not a "0".
    const playCount = set.play_count != null
        ? `<span class="map-card-playcount"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>${set.play_count.toLocaleString()}</span>`
        : '';
    const favCount = set.favourite_count != null
        ? `<span class="map-card-playcount"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.6-10-9.2C-.3 7.9 2 4 5.8 4 8 4 10 5.2 12 7.6 14 5.2 16 4 18.2 4 22 4 24.3 7.9 22 11.8 19 16.4 12 21 12 21z"/></svg>${set.favourite_count.toLocaleString()}</span>`
        : '';

    return `<div class="map-card" onclick="location.href='map.html?id=${encodeURIComponent(target)}'">
        <div class="map-card-cover"${style}>
${statusBadge(set.status)}
            ${starLabel ? `<span class="map-star">${escapeHtml(starLabel)}</span>` : ''}
            ${previewButton(set.beatmapset_id, set.bpm, set.title, set.artist, cover)}
            ${downloadBtn(set.beatmapset_id)}
            ${osuLinkBtn(set.beatmapset_id)}
        </div>
        <div class="map-card-body">
            <div class="map-title">${escapeHtml(set.title || '')}</div>
            <div class="map-artist">${escapeHtml(set.artist || '')}</div>
            <div class="diff-icon-row">${diffRow}<span class="diff-count-label">${set.diffs.length}${escapeHtml(t('diff_count_suffix'))}</span></div>
            <div class="map-meta">${set.bpm != null ? Math.round(set.bpm) + ' BPM · ' : ''}${fmtLength(set.total_length)}${playCount ? ' · ' + playCount : ''}${favCount ? ' · ' + favCount : ''}</div>
        </div>
    </div>`;
}

/* ---------- range sliders (star / BPM / length) ----------
   One reusable two-thumb range widget (see .star-range* in style.css,
   reused as-is for BPM/length via the .star-range--plain modifier) instead
   of three near-identical copies of the same drag/fill/label logic. */
function makeRangeSlider({ prefix, max, gap, formatLabel }) {
    const minInput = document.getElementById(`${prefix}-min`);
    const maxInput = document.getElementById(`${prefix}-max`);
    const fill = document.getElementById(`${prefix}-range-fill`);
    const label = document.getElementById(`${prefix}-range-label`);
    let debounce = null;

    function update(triggerLoad) {
        let minVal = parseFloat(minInput.value);
        let maxVal = parseFloat(maxInput.value);
        // Keep a minimum gap so the two thumbs never cross/overlap exactly.
        if (minVal > maxVal - gap) {
            if (document.activeElement === minInput) { minVal = Math.max(0, maxVal - gap); minInput.value = minVal; }
            else { maxVal = Math.min(max, minVal + gap); maxInput.value = maxVal; }
        }

        const minPct = (minVal / max) * 100;
        const maxPct = (maxVal / max) * 100;
        fill.style.left = minPct + '%';
        fill.style.width = Math.max(0, maxPct - minPct) + '%';

        // Whichever thumb sits further from the middle gets input priority
        // so it stays grabbable when the two are close together.
        minInput.style.zIndex = minVal > (max - maxVal) ? 3 : 2;
        maxInput.style.zIndex = minVal > (max - maxVal) ? 2 : 3;

        label.textContent = formatLabel(minVal, maxVal);

        if (triggerLoad) {
            clearTimeout(debounce);
            debounce = setTimeout(() => { _page = 0; loadMaps(); }, 300);
        }
    }

    [minInput, maxInput].forEach(el => el.addEventListener('input', () => update(true)));
    update(false);
    return {
        // undefined (not the raw slider value) once a thumb sits at its
        // resting edge, so a filter param the viewer never touched isn't
        // sent at all.
        min: () => { const v = parseFloat(minInput.value); return v > 0 ? v : undefined; },
        max: () => { const v = parseFloat(maxInput.value); return v < max ? v : undefined; },
    };
}

const starSlider = makeRangeSlider({
    prefix: 'star', max: STAR_SLIDER_MAX, gap: 0.2,
    formatLabel: (minVal, maxVal) => (minVal <= 0 && maxVal >= STAR_SLIDER_MAX)
        ? t('star_any')
        : `${minVal.toFixed(1)}–${maxVal >= STAR_SLIDER_MAX ? maxVal.toFixed(0) + '+' : maxVal.toFixed(1)}★`,
});
const bpmSlider = makeRangeSlider({
    prefix: 'bpm', max: BPM_SLIDER_MAX, gap: 10,
    formatLabel: (minVal, maxVal) => (minVal <= 0 && maxVal >= BPM_SLIDER_MAX)
        ? t('bpm_any')
        : `${Math.round(minVal)}–${maxVal >= BPM_SLIDER_MAX ? Math.round(maxVal) + '+' : Math.round(maxVal)} BPM`,
});
const lengthSlider = makeRangeSlider({
    prefix: 'length', max: LENGTH_SLIDER_MAX, gap: 20,
    formatLabel: (minVal, maxVal) => (minVal <= 0 && maxVal >= LENGTH_SLIDER_MAX)
        ? t('length_any')
        : `${fmtLength(minVal)}–${maxVal >= LENGTH_SLIDER_MAX ? fmtLength(maxVal) + '+' : fmtLength(maxVal)}`,
});

function currentFilterParams() {
    return {
        status: _status || undefined,
        q: _q || undefined,
        starMin: starSlider.min(), starMax: starSlider.max(),
        bpmMin: bpmSlider.min(), bpmMax: bpmSlider.max(),
        lengthMin: lengthSlider.min(), lengthMax: lengthSlider.max(),
    };
}

async function loadMaps() {
    const grid = document.getElementById('maps-grid');
    const note = document.getElementById('coverage-note');
    try {
        const data = await apiGet('maps-list', {
            page: _page, limit: PAGE_SIZE,
            sort: document.getElementById('maps-sort').value,
            ...currentFilterParams(),
        });

        // A page/filter/sort change is about to replace the whole grid —
        // any currently-playing preview's card is going away, and the
        // preview queue (see common.js's previewButton()) needs to start
        // fresh so its indices match the new cards about to be rendered.
        stopPreview();
        resetPreviewQueue();

        grid.innerHTML = data.items.length
            ? data.items.map(mapCard).join('')
            : `<p class="empty-state">${t('empty_maps')}</p>`;

        const c = data.coverage || {};
        const counts = c.countsByStatus || {};
        note.textContent = t('coverage_maps', { n: c.datasetSize || 0, ranked: counts.ranked || 0, loved: counts.loved || 0 });

        document.getElementById('page-label').textContent = t('page_label', { n: _page + 1 });
        document.getElementById('prev-page').disabled = _page === 0;
        document.getElementById('next-page').disabled = (_page + 1) * PAGE_SIZE >= data.total;
    } catch (err) {
        note.textContent = t('failed_maps');
    }
}

document.getElementById('prev-page').addEventListener('click', () => { if (_page > 0) { _page--; loadMaps(); } });
document.getElementById('next-page').addEventListener('click', () => { _page++; loadMaps(); });
document.getElementById('maps-sort').addEventListener('change', () => { _page = 0; loadMaps(); });

document.querySelectorAll('#status-filter .pill').forEach(btn => {
    btn.addEventListener('click', () => {
        _status = btn.getAttribute('data-status');
        _page = 0;
        document.querySelectorAll('#status-filter .pill').forEach(b => b.classList.toggle('active', b === btn));
        loadMaps();
    });
});

document.getElementById('maps-search').addEventListener('input', (e) => {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => { _q = e.target.value.trim(); _page = 0; loadMaps(); }, 300);
});

// "隨機" — picks one random set from the CURRENTLY filtered pool (server
// applies the same status/search/star/BPM/length filters this page has
// active, see maps-list.js's random=1 branch) rather than the whole
// catalog, so it still respects whatever the viewer was just browsing.
document.getElementById('random-map-btn').addEventListener('click', async () => {
    const btn = document.getElementById('random-map-btn');
    btn.disabled = true;
    try {
        const data = await apiGet('maps-list', { ...currentFilterParams(), random: '1' });
        const set = data.item;
        const target = set && (set.primary_beatmap_id ?? (set.diffs[0] && set.diffs[0].beatmap_id));
        if (target) location.href = `map.html?id=${encodeURIComponent(target)}`;
    } finally {
        btn.disabled = false;
    }
});

loadMaps();
