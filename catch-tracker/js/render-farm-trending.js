/* mania-tracker's own global "刷圖熱門" — every recent score in
   feed:recent grouped by map (see netlify/functions/farm-trending.js),
   distinct from the personalized per-player Farm Helper at
   farm-helper.html. */

let _page = 0;

function playersStackHtml(players, total) {
    const shown = (players || []).map(p => `
        <a class="feed-active-avatar" href="player.html?id=${encodeURIComponent(p.user_id)}" title="${escapeHtml(p.username || '')}">
            ${avatarWithFlagHtml(p.avatar_url, p.country_code)}
        </a>`).join('');
    const overflow = (total || 0) - (players || []).length;
    return `<div class="feed-active-avatars">${shown}</div>${overflow > 0 ? `<span class="diff-count-label">+${overflow}</span>` : ''}`;
}

function farmRow(m) {
    const diffLabel = m.difficulty_rating != null ? ` <span class="rank-num">★${m.difficulty_rating.toFixed(2)}</span>` : '';
    return `<tr>
        ${mapBannerCell(m.beatmapset_id, mapLink(m.beatmap_id, `${m.artist || ''} - ${m.title || ''} [${m.version || ''}]`) + diffLabel)}
        <td>${m.playCount}</td>
        <td>${m.avgPp != null ? fmtPP(m.avgPp) : '—'}</td>
        <td>${m.maxPp != null ? fmtPP(m.maxPp) : '—'}</td>
        <td>${playersStackHtml(m.recentPlayers, m.recentPlayerCount)}</td>
        <td>${relTime(m.latestAt)}</td>
    </tr>`;
}

async function loadFarmTrending() {
    const body = document.getElementById('farm-trending-body');
    const note = document.getElementById('coverage-note');
    try {
        const minPpInput = document.getElementById('farm-trending-minpp').value;
        const data = await apiGet('farm-trending', {
            page: _page, limit: 20,
            sort: document.getElementById('farm-trending-sort').value,
            minPp: minPpInput !== '' ? minPpInput : undefined,
        });

        body.innerHTML = data.items.length
            ? data.items.map(farmRow).join('')
            : `<tr><td colspan="6" class="empty-state">${t('empty_feed')}</td></tr>`;

        const c = data.coverage || {};
        note.textContent = c.lastOkAt
            ? t('coverage_farm_trending', { maps: c.mapCount || 0, time: relTime(c.lastOkAt) })
            : t('coverage_feed_pending', { n: 0 });

        document.getElementById('page-label').textContent = t('page_label', { n: _page + 1 });
        document.getElementById('prev-page').disabled = _page === 0;
        document.getElementById('next-page').disabled = (_page + 1) * 20 >= data.total;
    } catch (err) {
        note.textContent = t('failed_feed');
    }
}

document.getElementById('prev-page').addEventListener('click', () => { if (_page > 0) { _page--; loadFarmTrending(); } });
document.getElementById('next-page').addEventListener('click', () => { _page++; loadFarmTrending(); });
document.getElementById('farm-trending-sort').addEventListener('change', () => { _page = 0; loadFarmTrending(); });

let _minPpDebounce = null;
document.getElementById('farm-trending-minpp').addEventListener('input', () => {
    clearTimeout(_minPpDebounce);
    _minPpDebounce = setTimeout(() => { _page = 0; loadFarmTrending(); }, 300);
});

loadFarmTrending();
