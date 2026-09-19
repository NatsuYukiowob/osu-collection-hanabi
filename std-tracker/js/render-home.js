/* Home landing page — ported from catch-tracker's own render-home.js, minus
   its "Recent Best Plays" highlight strip (highlightCard() is a decorative
   component from catch-tracker's feature set this site doesn't carry over
   for v1; the full sortable table lives on rankings.html). */

async function loadTopPlayers() {
    const list = document.getElementById('home-top-list');
    try {
        const data = await apiGet('rankings-list', { page: 0, limit: 10 });
        const items = data.items.filter(r => !window.isPlayerHidden || !window.isPlayerHidden(r.username));
        list.innerHTML = items.length
            ? items.map((r, i) => `
                <a class="home-top-row" href="player.html?id=${encodeURIComponent(r.user_id)}">
                    <span class="home-top-rank">#${i + 1}</span>
                    ${avatarWithFlagHtml(r.avatar_url, r.country_code)}
                    <span class="home-top-name">${escapeHtml(r.username)}</span>
                    <span class="home-top-pp">${fmtPP(r.pp)}</span>
                </a>`).join('')
            : `<p class="empty-state">${t('no_data')}</p>`;
    } catch {
        list.innerHTML = `<p class="empty-state">${t('no_data')}</p>`;
    }
}

async function loadRecentScores() {
    const list = document.getElementById('home-recent-list');
    try {
        const data = await apiGet('feed-list', { limit: 6 });
        const items = data.items.filter(s => !window.isPlayerHidden || !window.isPlayerHidden(s.username));
        list.innerHTML = items.length
            ? items.map(s => `
                <div class="home-recent-row">
                    <div class="home-recent-who">
                        ${avatarWithFlagHtml(s.avatar_url, s.country_code)}
                        <span class="home-recent-text">
                            ${playerLink(s.user_id, s.username)}
                            <span class="home-recent-verb">${escapeHtml(t('home_played'))}</span>
                            ${mapLink(s.beatmap_id, `${s.title || ''} [${s.version || ''}]`)}
                        </span>
                    </div>
                    <div class="home-recent-stats">
                        ${gradeBadge(s.rank)}${fcTag(s.is_fc)}
                        <span class="home-recent-pp">${fmtPP(s.pp)}</span>
                        <span class="home-recent-time">${relTime(s.created_at)}</span>
                    </div>
                </div>`).join('')
            : `<p class="empty-state">${t('no_data')}</p>`;
    } catch {
        list.innerHTML = `<p class="empty-state">${t('no_data')}</p>`;
    }
}

loadTopPlayers();
loadRecentScores();
