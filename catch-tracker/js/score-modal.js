/* Shared score-detail modal (mania-tracker parity, Phase 3) — clicking a
   score row on the player page's best/recent lists or a map page's
   tracked-scores list opens this instead of navigating straight to the
   map page. The map-page link/navigation is kept too (as an explicit link
   inside the modal), just not the only way to get there anymore.

   Rows register their full score object here (registerScoreForModal) at
   render time, keyed by score_id, and ONE delegated document-level click
   listener (not a per-row listener re-wired on every re-render) opens the
   modal for whichever row was clicked — skips real <a> clicks (map link,
   player link, watch-replay link) so those still navigate normally. */

const _scoreModalRegistry = new Map();

function registerScoreForModal(s) {
    // Some feed records carry score_id: 0 (a real, pre-existing gap — not
    // every osu! API score payload includes a usable id) rather than null/
    // undefined; treat that as "no id" too, or every such row collides on
    // the same "0" registry key and the modal shows whichever was
    // registered last instead of the row actually clicked.
    if (s && s.score_id) _scoreModalRegistry.set(String(s.score_id), s);
}

function judgementStatHtml(value, label, colorVar) {
    return `<div class="score-modal-stat"><span class="score-modal-stat-value"${colorVar ? ` style="color:${colorVar}"` : ''}>${value != null ? value.toLocaleString() : '—'}</span><label>${escapeHtml(label)}</label></div>`;
}

function scoreModalHtml(s) {
    const cover = s.beatmapset_id ? coverArtUrlCard(s.beatmapset_id) : '';
    const stats = s.statistics || {};
    const mapTitle = [s.artist, s.title].filter(Boolean).join(' - ');
    return `
    <div class="score-modal-overlay" id="score-modal-overlay">
        <div class="score-modal" role="dialog" aria-modal="true">
            <button type="button" class="score-modal-close" id="score-modal-close" aria-label="${escapeHtml(t('score_modal_close'))}">✕</button>
            <div class="score-modal-cover"${cover ? ` style="background-image:url('${cover.replace(/'/g, '%27')}')"` : ''}></div>
            <div class="score-modal-body">
                <div class="score-modal-title-row">
                    <div>
                        <div class="score-modal-title">${escapeHtml(mapTitle || '—')}</div>
                        <div class="score-modal-sub">
                            ${s.version ? `[${escapeHtml(s.version)}]` : ''}
                            ${s.creator ? `· ${t('mapped_by', { creator: escapeHtml(s.creator) })}` : ''}
                            ${s.difficulty_rating != null ? `· ${s.difficulty_rating.toFixed(2)}★` : ''}
                            ${s.bpm != null ? `· ${Math.round(s.bpm)}bpm` : ''}
                        </div>
                    </div>
                    ${modsTag(s.mods)}
                </div>
                <div class="score-modal-main">
                    ${gradeBadge(s.rank)}
                    <div class="score-modal-acc">${fmtAccuracy(s.accuracy)}</div>
                    <div class="score-modal-pp">${fmtPP(s.pp)}<span>pp</span></div>
                </div>
                <div class="score-modal-stats">
                    ${judgementStatHtml(s.max_combo, `${t('score_modal_combo')}${s.is_fc ? ' (FC)' : ''}`)}
                    ${judgementStatHtml(stats.count_300, '300')}
                    ${judgementStatHtml(stats.count_100, '100')}
                    ${judgementStatHtml(stats.count_50, '50')}
                    ${judgementStatHtml(stats.count_miss, t('score_modal_miss'), stats.count_miss ? 'var(--danger)' : null)}
                </div>
                <div class="score-modal-footer">
                    <span class="score-modal-time">${s.created_at ? relTime(s.created_at) : ''}</span>
                    <div class="score-modal-links">
                        ${s.beatmap_id ? `<a href="map.html?id=${encodeURIComponent(s.beatmap_id)}">${escapeHtml(t('score_modal_view_map'))}</a>` : ''}
                        ${s.score_id ? `<a href="https://osu.ppy.sh/scores/${encodeURIComponent(s.score_id)}" target="_blank" rel="noopener">${escapeHtml(t('score_modal_view_osu'))}</a>` : ''}
                        ${replayLink(s)}
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

function closeScoreModal() {
    const el = document.getElementById('score-modal-overlay');
    if (el) el.remove();
}

function openScoreModal(s) {
    closeScoreModal();
    document.body.insertAdjacentHTML('beforeend', scoreModalHtml(s));
    const overlay = document.getElementById('score-modal-overlay');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeScoreModal(); });
    document.getElementById('score-modal-close').addEventListener('click', closeScoreModal);
    document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape') { closeScoreModal(); document.removeEventListener('keydown', onEsc); }
    });
}

document.addEventListener('click', (e) => {
    if (e.target.closest('a')) return; // let real links (map/player/replay/osu) navigate normally
    const row = e.target.closest('tr[data-score-id]');
    if (!row) return;
    const s = _scoreModalRegistry.get(row.getAttribute('data-score-id'));
    if (s) openScoreModal(s);
});
