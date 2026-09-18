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

/* ---------- mode tabs (single replay vs side-by-side compare) ---------- */

function wireModeTabs() {
    document.getElementById('replays-mode-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.pill');
        if (!btn) return;
        const mode = btn.getAttribute('data-mode');
        document.querySelectorAll('#replays-mode-tabs .pill').forEach(b => b.classList.toggle('active', b === btn));
        document.getElementById('replays-single-tab').hidden = mode !== 'single';
        document.getElementById('replays-compare-tab').hidden = mode !== 'compare';
    });
}

/* ---------- side-by-side compare picker ----------
   Mirrors mania-tracker.com's own "並排對比" tab (live-explored, per
   request): two slots for the SAME beatmap's scores, filled either by
   pasting a score id/link or — once slot A picks a beatmap — by clicking a
   row straight out of that beatmap's own leaderboard (reuses
   beatmap-leaderboard.js, already built for the single replay page's
   live-climbing leaderboard panel). Both paths resolve through
   score-lookup.js so every slot ends up with the same full metadata
   (mods/rank/pp/accuracy/has_replay) regardless of how it was picked. */

let _compareSlots = { a: null, b: null };
let _activeCompareSlot = 'a';

function compareSlotFilledHtml(entry, slot) {
    const cover = entry.beatmapset_id ? coverArtUrlCard(entry.beatmapset_id) : '';
    return `
        <div class="compare-slot-filled"${cover ? ` style="background-image:url('${cover.replace(/'/g, '%27')}')"` : ''}>
            <button type="button" class="compare-slot-remove" data-slot="${slot}" aria-label="${escapeHtml(t('remove'))}">✕</button>
            ${avatarWithFlagHtml(entry.avatar_url, entry.country_code)}
            <div class="compare-slot-body">
                <div class="compare-slot-name">${escapeHtml(entry.username || '')}</div>
                <div class="compare-slot-stats">
                    ${gradeBadge(entry.rank)}${modsTag(entry.mods)}
                    ${entry.accuracy != null ? `<span>${fmtAccuracy(entry.accuracy)}</span>` : ''}
                    ${entry.pp != null ? `<span>${fmtPP(entry.pp)}</span>` : ''}
                </div>
                <div class="compare-slot-map">${escapeHtml(`${entry.artist || ''} - ${entry.title || ''} [${entry.version || ''}]`)}</div>
            </div>
        </div>`;
}

function renderCompareSlot(slot) {
    const el = document.getElementById(`compare-slot-${slot}`);
    const entry = _compareSlots[slot];
    el.innerHTML = entry
        ? compareSlotFilledHtml(entry, slot)
        : `<button type="button" class="compare-slot-add" data-slot-btn="${slot}">+ ${escapeHtml(t(slot === 'a' ? 'replays_compare_add_a' : 'replays_compare_add_b'))}</button>`;
    el.classList.toggle('filled', !!entry);
}

function updateCompareGoButton() {
    document.getElementById('compare-go-btn').disabled = !(_compareSlots.a && _compareSlots.b);
}

function showCompareError(msg) {
    const el = document.getElementById('compare-error');
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg;
    el.hidden = false;
}

async function loadCompareLeaderboard(beatmapId) {
    const section = document.getElementById('compare-leaderboard-section');
    const list = document.getElementById('compare-leaderboard-list');
    try {
        const data = await apiGet('beatmap-leaderboard', { beatmap_id: beatmapId });
        const scores = data.scores || [];
        list.innerHTML = scores.map(s => `
            <button type="button" class="replays-score-row compare-leaderboard-row" data-score-id="${s.score_id}">
                ${avatarWithFlagHtml(s.avatar_url, null)}
                <span class="compare-lb-name">${escapeHtml(s.username || '')}</span>
                ${gradeBadge(s.rank)}
                <span>${fmtAccuracy(s.accuracy)}</span>
                <span>${(s.total_score || 0).toLocaleString()}</span>
            </button>`).join('');
        section.hidden = !scores.length;
    } catch {
        section.hidden = true;
    }
}

async function resolveScoreForCompare(scoreId) {
    const res = await fetch(`${API_BASE}/score-lookup?score_id=${encodeURIComponent(scoreId)}`);
    const data = await res.json();
    if (!res.ok) {
        const key = data.error === 'not_found' ? 'replays_id_not_found'
            : data.error === 'wrong_mode' ? 'replays_id_wrong_mode' : 'replays_id_error';
        throw new Error(t(key));
    }
    if (!data.has_replay) throw new Error(t('replays_none_watchable'));
    return data;
}

// Returns whether the slot was actually set — callers use this to decide
// whether to clear the paste input / auto-advance to the other slot.
async function setCompareSlot(slot, entry) {
    const other = slot === 'a' ? _compareSlots.b : _compareSlots.a;
    if (other && String(other.beatmap_id) !== String(entry.beatmap_id)) {
        showCompareError(t('replays_compare_mismatch'));
        return false;
    }
    showCompareError(null);
    _compareSlots[slot] = entry;
    renderCompareSlot(slot);
    updateCompareGoButton();
    if (slot === 'a') loadCompareLeaderboard(entry.beatmap_id);
    return true;
}

function clearCompareSlot(slot) {
    _compareSlots[slot] = null;
    renderCompareSlot(slot);
    if (slot === 'a') {
        document.getElementById('compare-leaderboard-section').hidden = true;
        // Clearing A also invalidates any beatmap-match guarantee for B —
        // simplest correct behaviour is to drop B too rather than leave a
        // stale pairing the now-gone leaderboard no longer reflects.
        _compareSlots.b = null;
        renderCompareSlot('b');
    }
    updateCompareGoButton();
}

function compareRecentCardHtml(r) {
    const cover = r.beatmapsetId ? coverArtUrlCard(r.beatmapsetId) : '';
    const params = new URLSearchParams({ score_a: r.scoreA, score_b: r.scoreB });
    return `
        <a class="replays-recent-card" href="replay-compare.html?${params.toString()}"${cover ? ` style="background-image:url('${cover.replace(/'/g, '%27')}')"` : ''}>
            <div class="replays-recent-card-body">
                <div class="replays-recent-card-title">${escapeHtml(r.title || '')}</div>
                <div class="replays-recent-card-sub">${escapeHtml(r.usernameA || '')} vs ${escapeHtml(r.usernameB || '')}</div>
            </div>
        </a>`;
}

function renderCompareRecent() {
    const section = document.getElementById('compare-recent-section');
    const strip = document.getElementById('compare-recent-strip');
    const items = loadRecentCompares();
    if (!items.length) { section.hidden = true; return; }
    strip.innerHTML = items.map(compareRecentCardHtml).join('');
    section.hidden = false;
}

function wireComparePicker() {
    renderCompareSlot('a');
    renderCompareSlot('b');
    renderCompareRecent();

    document.getElementById('replays-compare-tab').addEventListener('click', async (e) => {
        const addBtn = e.target.closest('[data-slot-btn]');
        if (addBtn) {
            _activeCompareSlot = addBtn.getAttribute('data-slot-btn');
            document.getElementById('compare-id-input').focus();
            return;
        }
        const removeBtn = e.target.closest('.compare-slot-remove');
        if (removeBtn) {
            clearCompareSlot(removeBtn.getAttribute('data-slot'));
            return;
        }
        const lbRow = e.target.closest('.compare-leaderboard-row');
        if (lbRow) {
            lbRow.disabled = true;
            try {
                const entry = await resolveScoreForCompare(lbRow.getAttribute('data-score-id'));
                await setCompareSlot('b', entry);
            } catch (err) {
                showCompareError(err.message);
            } finally {
                lbRow.disabled = false;
            }
        }
    });

    const idInput = document.getElementById('compare-id-input');
    const idGo = document.getElementById('compare-id-go');
    async function go() {
        const scoreId = extractScoreId(idInput.value);
        if (!scoreId) { showCompareError(t('replays_id_invalid')); return; }
        idGo.disabled = true;
        try {
            const entry = await resolveScoreForCompare(scoreId);
            const targetSlot = _activeCompareSlot;
            const ok = await setCompareSlot(targetSlot, entry);
            if (ok) {
                idInput.value = '';
                // Auto-advance to the other slot if it's still empty, so
                // pasting two links back to back "just works" without
                // re-clicking a slot's own + button in between.
                const otherSlot = targetSlot === 'a' ? 'b' : 'a';
                if (!_compareSlots[otherSlot]) _activeCompareSlot = otherSlot;
            }
        } catch (err) {
            showCompareError(err.message);
        } finally {
            idGo.disabled = false;
        }
    }
    idGo.addEventListener('click', go);
    idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

    document.getElementById('compare-go-btn').addEventListener('click', () => {
        if (!_compareSlots.a || !_compareSlots.b) return;
        const params = new URLSearchParams({ score_a: _compareSlots.a.score_id, score_b: _compareSlots.b.score_id });
        location.href = `replay-compare.html?${params.toString()}`;
    });
}

wirePlayerSearch();
wireScoreIdLookup();
renderRecentReplays();
wireModeTabs();
wireComparePicker();
