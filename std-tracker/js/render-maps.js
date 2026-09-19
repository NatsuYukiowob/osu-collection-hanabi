/* Maps catalog — ported from an earlier, simpler stage of catch-tracker's
   own render-maps.js (before its audio-preview button, download button,
   favourite-count sort, and BPM/length range sliders were added — those
   are follow-up steps, not this one). Cards are grouped by beatmapSET
   (maps-list.js), each showing a row of per-difficulty icons rather than
   one card per difficulty. */
let _page = 0;
let _status = '';
let _q = '';
let _searchDebounce = null;

const MAX_DIFF_ICONS = 8;
const PAGE_SIZE = 24;

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

    return `<div class="map-card" onclick="location.href='map.html?id=${encodeURIComponent(target)}'">
        <div class="map-card-cover"${style}>
${statusBadge(set.status)}
            ${starLabel ? `<span class="map-star">${escapeHtml(starLabel)}</span>` : ''}
        </div>
        <div class="map-card-body">
            <div class="map-title">${escapeHtml(set.title || '')}</div>
            <div class="map-artist">${escapeHtml(set.artist || '')}</div>
            <div class="diff-icon-row">${diffRow}<span class="diff-count-label">${set.diffs.length}${escapeHtml(t('diff_count_suffix'))}</span></div>
            <div class="map-meta">${set.bpm != null ? Math.round(set.bpm) + ' BPM · ' : ''}${fmtLength(set.total_length)}</div>
        </div>
    </div>`;
}

function currentFilterParams() {
    return {
        status: _status || undefined,
        q: _q || undefined,
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

loadMaps();
