/* Side-by-side replay comparison (mania-tracker.com's "並排對比" tab —
   live-explored at /replay?tab=side-by-side and /replay?compareA=...&
   compareB=..., per request). Rather than re-writing the whole 2400+ line
   single-replay canvas engine (js/render-replay.js) into a multi-instance
   form, this loads that SAME page twice inside iframes with ?embed=compare
   (see render-replay.js's own `embed` branch), and drives both off one
   shared transport bar through a small postMessage bridge — every actual
   rendering/judging/skin/hyperdash/plate-stack behaviour is 100% reused,
   completely untouched. See that file's `embed` comment for the other
   half of this bridge.

   Loaded as a <script type="module"> purely for consistency with
   render-replay.js (this file has no ESM imports of its own) — common.js/
   api.js are loaded first as classic scripts and expose their top-level
   functions as globals, same as everywhere else on this site. */

function errorHtml(msg) {
    return `<p class="coverage-note">${escapeHtml(msg)}</p>`;
}

function loginGateHtml() {
    return `
        <div class="card" style="max-width:480px;margin:60px auto;text-align:center;padding:32px">
            <p style="margin-top:0">${escapeHtml(t('replay_login_prompt'))}</p>
            <a class="ct-login-btn" href="${ctLoginUrl()}" style="display:inline-flex">${escapeHtml(t('login_with_osu'))}</a>
        </div>
    `;
}

function iframeSrcFor(entry) {
    const params = new URLSearchParams({
        score_id: entry.score_id, beatmap_id: entry.beatmap_id, beatmapset_id: entry.beatmapset_id || '',
        user_id: entry.user_id || '', username: entry.username || '', title: entry.title || '',
        artist: entry.artist || '', version: entry.version || '', rank: entry.rank || '',
        mods: (entry.mods || []).join(','), pp: entry.pp != null ? Math.round(entry.pp) : '',
        embed: 'compare',
    });
    return `replay.html?${params.toString()}`;
}

function sideHeaderHtml(entry, side) {
    return `
        <div class="compare-side-header compare-side-header--${side}">
            ${avatarWithFlagHtml(entry.avatar_url, entry.country_code)}
            <div class="compare-side-identity">
                <div class="compare-side-name">${playerLink(entry.user_id, entry.username)}</div>
                <div class="compare-side-when">${relTime(entry.created_at)}</div>
            </div>
            ${gradeBadge(entry.rank)}
            ${modsTag(entry.mods)}
        </div>`;
}

function statsRowHtml(labelKey, a, b, fmt) {
    return `
        <div class="compare-stat-row">
            <strong class="compare-stat-a">${fmt(a)}</strong>
            <span class="compare-stat-label">${escapeHtml(t(labelKey))}</span>
            <strong class="compare-stat-b">${fmt(b)}</strong>
        </div>`;
}

function renderStatsPanel(statsA, statsB, ppA, ppB) {
    const panel = document.getElementById('compare-stats-panel');
    if (!panel) return;
    const pct = v => v != null ? `${(v * 100).toFixed(2)}%` : '—';
    const num = v => v != null ? String(v) : '—';
    const pp = v => v != null ? fmtPP(v) : '—';
    panel.innerHTML = [
        statsRowHtml('replay_stat_accuracy', statsA && statsA.accuracy, statsB && statsB.accuracy, pct),
        statsRowHtml('replay_stat_combo', statsA && statsA.combo, statsB && statsB.combo, num),
        statsRowHtml('replay_stat_maxcombo', statsA && statsA.maxCombo, statsB && statsB.maxCombo, num),
        statsRowHtml('replay_stat_caught', statsA && statsA.caught, statsB && statsB.caught, num),
        statsRowHtml('replay_stat_miss', statsA && statsA.miss, statsB && statsB.miss, num),
        statsRowHtml('th_pp', ppA, ppB, pp),
    ].join('');
}

/* ---------- transport + postMessage bridge ---------- */

let _iframeA = null, _iframeB = null;
let _stateA = { ready: false, frac: 0, durationMs: 0, stats: null, pp: null };
let _stateB = { ready: false, frac: 0, durationMs: 0, stats: null, pp: null };
let _playing = false;
let _scrubDragging = false;

function postToBoth(msg) {
    const payload = { ctCompare: true, ...msg };
    if (_iframeA && _iframeA.contentWindow) _iframeA.contentWindow.postMessage(payload, location.origin);
    if (_iframeB && _iframeB.contentWindow) _iframeB.contentWindow.postMessage(payload, location.origin);
}

function fmtCompareClock(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60), s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

// Side A drives the visible scrub/time readout. Both sides are driven by
// the exact same play/pause/seek/rate commands, so in practice they track
// each other closely; they can only drift apart at all when the two
// scores carry different DT/HT-family mods, and there's no single
// "correct" shared clock in that case anyway — seeks are sent as a
// FRACTION of each side's own duration (not a raw ms) specifically so a
// scrub still lands both sides at the same relative point in the map even
// then. See render-replay.js's embed message handler for the other half.
function updateTransportProgress() {
    const primary = _stateA.ready ? _stateA : _stateB;
    if (!primary.ready) return;
    const scrub = document.getElementById('compare-scrub');
    const timeEl = document.getElementById('compare-time');
    if (!scrub || !timeEl) return;
    if (!_scrubDragging) scrub.value = String(Math.round((primary.frac || 0) * 1000));
    timeEl.textContent = `${fmtCompareClock((primary.frac || 0) * primary.durationMs)} / ${fmtCompareClock(primary.durationMs)}`;
}

function updatePlayButton() {
    const btn = document.getElementById('compare-play-btn');
    if (btn) btn.textContent = _playing ? '⏸' : '▶';
}

function onCompareMessage(e) {
    if (e.origin !== location.origin) return;
    if (!e.data || e.data.ctCompare !== true) return;
    const state = e.source === (_iframeA && _iframeA.contentWindow) ? _stateA
        : e.source === (_iframeB && _iframeB.contentWindow) ? _stateB : null;
    if (!state) return;
    if (e.data.type === 'ready') {
        state.ready = true;
        state.durationMs = e.data.durationMs || 0;
        // A play click that landed before this side finished loading was
        // silently dropped (nothing was listening for it yet) — catch this
        // side up to the transport's actual state now that it can hear us,
        // instead of leaving it paused while the shared play button shows ⏸.
        if (_playing) e.source.postMessage({ ctCompare: true, type: 'play' }, location.origin);
    } else if (e.data.type === 'tick') {
        state.frac = e.data.frac;
        state.stats = e.data.stats;
        state.pp = e.data.pp;
        renderStatsPanel(_stateA.stats, _stateB.stats, _stateA.pp, _stateB.pp);
        updateTransportProgress();
    }
}

function wireCompareTransport() {
    document.getElementById('compare-play-btn').addEventListener('click', () => {
        _playing = !_playing;
        postToBoth({ type: _playing ? 'play' : 'pause' });
        updatePlayButton();
    });
    const scrub = document.getElementById('compare-scrub');
    scrub.addEventListener('input', () => {
        _scrubDragging = true;
        if (_playing) { _playing = false; updatePlayButton(); }
        postToBoth({ type: 'pause' });
        postToBoth({ type: 'seek', frac: Number(scrub.value) / 1000 });
    });
    scrub.addEventListener('change', () => { _scrubDragging = false; });
    document.getElementById('compare-rate-group').addEventListener('click', (e) => {
        const btn = e.target.closest('.compare-rate-btn');
        if (!btn) return;
        document.querySelectorAll('.compare-rate-btn').forEach(b => b.classList.toggle('active', b === btn));
        postToBoth({ type: 'rate', rate: Number(btn.getAttribute('data-rate')) });
    });
    document.getElementById('compare-fullscreen-btn').addEventListener('click', () => {
        if (document.fullscreenElement) { document.exitFullscreen(); return; }
        const el = document.querySelector('.compare-panes');
        if (el && el.requestFullscreen) el.requestFullscreen().catch(() => { /* not fatal */ });
    });
}

function renderCompareLayout(entryA, entryB) {
    const main = document.getElementById('compare-main');
    main.innerHTML = `
        <div class="compare-vs-bar">
            ${sideHeaderHtml(entryA, 'a')}
            <div class="compare-vs-center">
                <div class="compare-vs-map">${escapeHtml(`${entryA.artist || ''} - ${entryA.title || ''}`)}</div>
                <div class="compare-vs-version">[${escapeHtml(entryA.version || '')}]</div>
            </div>
            ${sideHeaderHtml(entryB, 'b')}
        </div>
        <div class="compare-panes">
            <div class="compare-pane"><iframe id="compare-iframe-a" class="compare-iframe" src="${iframeSrcFor(entryA)}"></iframe></div>
            <div class="compare-stats card" id="compare-stats-panel"></div>
            <div class="compare-pane"><iframe id="compare-iframe-b" class="compare-iframe" src="${iframeSrcFor(entryB)}"></iframe></div>
        </div>
        <div class="compare-transport">
            <button type="button" class="compare-play-btn" id="compare-play-btn">▶</button>
            <input type="range" id="compare-scrub" class="replay-scrub-full" min="0" max="1000" value="0">
            <span class="compare-time" id="compare-time">0:00 / 0:00</span>
            <div class="compare-rate-group" id="compare-rate-group">
                ${[0.5, 0.75, 1, 1.5, 2].map(r => `<button type="button" class="compare-rate-btn${r === 1 ? ' active' : ''}" data-rate="${r}">${r}x</button>`).join('')}
            </div>
            <button type="button" class="compare-fullscreen-btn" id="compare-fullscreen-btn" title="Fullscreen">⤢</button>
        </div>
    `;

    _iframeA = document.getElementById('compare-iframe-a');
    _iframeB = document.getElementById('compare-iframe-b');
    _stateA = { ready: false, frac: 0, durationMs: 0, stats: null, pp: null };
    _stateB = { ready: false, frac: 0, durationMs: 0, stats: null, pp: null };
    _playing = false;
    renderStatsPanel(null, null, null, null);
    updatePlayButton();
    wireCompareTransport();
}

window.addEventListener('message', onCompareMessage);

async function run() {
    const main = document.getElementById('compare-main');
    const params = new URLSearchParams(location.search);
    const scoreA = params.get('score_a');
    const scoreB = params.get('score_b');
    document.title = `Catch Tracker — ${t('replay_compare_h1')}`;

    if (!scoreA || !scoreB) {
        main.innerHTML = errorHtml(t('replay_compare_not_found'));
        return;
    }
    if (!getCtLoggedInUser()) {
        main.innerHTML = loginGateHtml();
        return;
    }

    main.innerHTML = errorHtml(t('replay_compare_loading'));

    let entryA, entryB;
    try {
        [entryA, entryB] = await Promise.all([
            fetch(`${API_BASE}/score-lookup?score_id=${encodeURIComponent(scoreA)}`).then(r => r.json()),
            fetch(`${API_BASE}/score-lookup?score_id=${encodeURIComponent(scoreB)}`).then(r => r.json()),
        ]);
    } catch {
        main.innerHTML = errorHtml(t('replay_compare_not_found'));
        return;
    }
    if (entryA.error || entryB.error || !entryA.has_replay || !entryB.has_replay) {
        main.innerHTML = errorHtml(t('replay_compare_not_found'));
        return;
    }
    if (String(entryA.beatmap_id) !== String(entryB.beatmap_id)) {
        main.innerHTML = errorHtml(t('replays_compare_mismatch'));
        return;
    }

    recordRecentCompare({
        scoreA, scoreB, title: entryA.title, artist: entryA.artist, version: entryA.version,
        beatmapsetId: entryA.beatmapset_id, usernameA: entryA.username, usernameB: entryB.username,
    });

    renderCompareLayout(entryA, entryB);
}

run();
