/* 回放 hub page (mania-tracker parity: "更多 > 觀看回放") — two ways in,
   search a player then pick from their replay-eligible scores, or paste
   a score id/URL directly and jump straight to replay.html. Also shows a
   per-browser "recently viewed" strip (see recordRecentlyViewedReplay(),
   called from render-replay.js on a successful load). */

const RECENT_REPLAYS_KEY = 'ct_recent_replays';
const RECENT_REPLAYS_MAX = 12;

function loadRecentReplays() {
    try { return JSON.parse(localStorage.getItem(RECENT_REPLAYS_KEY)) || []; } catch { return []; }
}

function recentReplayCardHtml(r) {
    const cover = r.beatmapset_id ? coverArtUrlCard(r.beatmapset_id) : '';
    const params = new URLSearchParams({
        score_id: r.score_id, beatmap_id: r.beatmap_id, beatmapset_id: r.beatmapset_id || '',
        user_id: r.user_id || '', username: r.username || '', title: r.title || '',
        artist: r.artist || '', version: r.version || '', rank: r.rank || '',
        mods: (r.mods || []).join(','),
    });
    return `
        <a class="replays-recent-card" href="replay.html?${params.toString()}"${cover ? ` style="background-image:url('${cover.replace(/'/g, '%27')}')"` : ''}>
            <div class="replays-recent-card-body">
                <div class="replays-recent-card-title">${escapeHtml(r.title || '')}</div>
                <div class="replays-recent-card-sub">${escapeHtml(r.username || '')} · [${escapeHtml(r.version || '')}]</div>
            </div>
        </a>`;
}

function renderRecentReplays() {
    const section = document.getElementById('replays-recent-section');
    const strip = document.getElementById('replays-recent-strip');
    const items = loadRecentReplays();
    if (!items.length) { section.hidden = true; return; }
    strip.innerHTML = items.map(recentReplayCardHtml).join('');
    section.hidden = false;
}

/* ---------- player search ---------- */

function wirePlayerSearch() {
    const input = document.getElementById('replays-player-search');
    const results = document.getElementById('replays-player-results');
    let debounceTimer = null;

    async function runSearch(q) {
        try {
            const data = await apiGet('rankings-list', { q, limit: 8 });
            results.innerHTML = data.items.length
                ? data.items.map(r => `
                    <button type="button" class="search-result-row" data-user-id="${r.user_id}" data-username="${escapeHtml(r.username)}">
                        ${avatarWithFlagHtml(r.avatar_url, r.country_code)}
                        <span>${escapeHtml(r.username)}</span>
                        <span class="search-result-pp">${fmtPP(r.pp)}</span>
                    </button>`).join('')
                : `<div class="search-empty">${escapeHtml(t('search_no_results'))}</div>`;
            results.hidden = false;
        } catch {
            results.hidden = true;
        }
    }

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (!q) { results.hidden = true; return; }
        debounceTimer = setTimeout(() => runSearch(q), 250);
    });
    results.addEventListener('click', (e) => {
        const btn = e.target.closest('.search-result-row');
        if (!btn) return;
        results.hidden = true;
        input.value = btn.getAttribute('data-username');
        selectPlayer(btn.getAttribute('data-user-id'), btn.getAttribute('data-username'));
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#replays-player-search') && !e.target.closest('#replays-player-results')) results.hidden = true;
    });
}

/* ---------- selected player's replay-eligible scores ---------- */

let _playerScores = { best: [], recent: [] };
let _playerCtx = { id: null, username: '' };

function replayScoreRow(s) {
    return `<div class="replays-score-row">
        <div class="replays-score-map">${mapLink(s.beatmap_id, `${s.artist || ''} - ${s.title || ''} [${s.version || ''}]`)}</div>
        ${modsTag(s.mods)}
        ${gradeBadge(s.rank)}${fcTag(s.is_fc)}
        <span>${fmtAccuracy(s.accuracy)}</span>
        <span>${fmtPP(s.pp)}</span>
        <span class="replays-score-when">${relTime(s.created_at)}</span>
        ${replayLink(s, _playerCtx.username, _playerCtx.id)}
    </div>`;
}

function renderPlayerTab(tab) {
    const list = document.getElementById('replays-player-list');
    const scores = _playerScores[tab] || [];
    list.innerHTML = scores.length
        ? scores.map(replayScoreRow).join('')
        : `<p class="empty-state">${escapeHtml(t('replays_none_watchable'))}</p>`;
}

async function selectPlayer(userId, username) {
    const section = document.getElementById('replays-player-section');
    const heading = document.getElementById('replays-player-heading');
    heading.textContent = t('replays_scores_for', { name: username });
    section.hidden = false;
    document.getElementById('replays-player-list').innerHTML = `<p class="coverage-note">${t('loading')}</p>`;
    _playerCtx = { id: userId, username };

    try {
        const data = await apiGet('player-get', { user_id: userId });
        _playerScores = {
            best: (data.bestPlays || []).filter(s => s.has_replay),
            recent: (data.recentPlays || []).filter(s => s.has_replay),
        };
        const activeTab = document.querySelector('#replays-player-tabs .pill.active').getAttribute('data-tab');
        renderPlayerTab(activeTab);
    } catch {
        document.getElementById('replays-player-list').innerHTML = `<p class="empty-state">${escapeHtml(t('failed_rankings'))}</p>`;
    }
}

document.getElementById('replays-player-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    document.querySelectorAll('#replays-player-tabs .pill').forEach(b => b.classList.toggle('active', b === btn));
    renderPlayerTab(btn.getAttribute('data-tab'));
});

/* ---------- paste a score id / URL ---------- */

function extractScoreId(raw) {
    const trimmed = raw.trim();
    const urlMatch = trimmed.match(/scores\/(?:fruits\/)?(\d+)/i);
    if (urlMatch) return urlMatch[1];
    return /^\d+$/.test(trimmed) ? trimmed : null;
}

function wireScoreIdLookup() {
    const input = document.getElementById('replays-id-input');
    const btn = document.getElementById('replays-id-go');
    const errorEl = document.getElementById('replays-id-error');

    async function go() {
        errorEl.hidden = true;
        const scoreId = extractScoreId(input.value);
        if (!scoreId) {
            errorEl.textContent = t('replays_id_invalid');
            errorEl.hidden = false;
            return;
        }
        btn.disabled = true;
        try {
            const res = await fetch(`${API_BASE}/score-lookup?score_id=${encodeURIComponent(scoreId)}`);
            const data = await res.json();
            if (!res.ok) {
                errorEl.textContent = data.error === 'not_found' ? t('replays_id_not_found')
                    : data.error === 'wrong_mode' ? t('replays_id_wrong_mode')
                    : t('replays_id_error');
                errorEl.hidden = false;
                return;
            }
            const params = new URLSearchParams({
                score_id: data.score_id, beatmap_id: data.beatmap_id, beatmapset_id: data.beatmapset_id || '',
                user_id: data.user_id || '', username: data.username || '', title: data.title || '',
                artist: data.artist || '', version: data.version || '', rank: data.rank || '',
                mods: (data.mods || []).join(','),
            });
            location.href = `replay.html?${params.toString()}`;
        } catch {
            errorEl.textContent = t('replays_id_error');
            errorEl.hidden = false;
        } finally {
            btn.disabled = false;
        }
    }

    btn.addEventListener('click', go);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

wirePlayerSearch();
wireScoreIdLookup();
renderRecentReplays();
