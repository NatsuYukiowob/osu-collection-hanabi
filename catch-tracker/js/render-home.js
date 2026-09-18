/* Home landing page — mania-tracker.com parity (its "?country=GLOBAL" home
   view: centered wordmark + a top-10 mini leaderboard card + recent-best-
   plays cards + a recent-scores feed strip). The full sortable/paginated
   table lives on rankings.html now; this page is a teaser into it, same
   split mania-tracker itself uses (home vs. its own /rankings route). */

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

async function loadHighlights() {
    const strip = document.getElementById('highlight-strip');
    try {
        const data = await apiGet('feed-list', { sort: 'pp', limit: 3 });
        strip.innerHTML = data.items.map(highlightCard).join('') || `<p class="empty-state">${t('no_data')}</p>`;
    } catch {
        strip.hidden = true;
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
loadHighlights();
loadRecentScores();
