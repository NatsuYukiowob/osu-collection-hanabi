const GRADE_COUNT_FIELDS = [
    ['x', 'ss'], ['xh', 'ssh'], ['s', 's'], ['sh', 'sh'], ['a', 'a'],
];

const SR_BUCKETS = [
    { label: '<4★', max: 4, color: '#60a5fa' },
    { label: '4-6★', max: 6, color: '#8b5cf6' },
    { label: '6-8★', max: 8, color: '#fb5a8c' },
    { label: '8★+', max: Infinity, color: '#fbbf24' },
];

function fmtNum(n) {
    return n != null ? n.toLocaleString() : '—';
}

// Set once per loadPlayer() call — scoreRow() needs the profile's own
// username/id for replayLink() (score records don't carry either, since
// they're always this same player's own scores).
let _currentPlayer = { id: null, username: '' };

function scoreRow(s) {
    // score-modal.js's delegated click listener opens the detail modal for
    // any row with data-score-id — registered here so it has the full
    // score object (map link/mods/grade cells keep their own <a> targets
    // navigating normally; the listener skips real link clicks).
    registerScoreForModal(s);
    return `<tr${s.score_id ? ` data-score-id="${s.score_id}"` : ''}>
        <td>${mapLink(s.beatmap_id, `${s.artist || ''} - ${s.title || ''} [${s.version || ''}]`)}</td>
        <td>${modsTag(s.mods)}</td>
        <td>${gradeBadge(s.rank)}${fcTag(s.is_fc)}</td>
        <td>${fmtAccuracy(s.accuracy)}</td>
        <td>${fmtPP(s.pp)}</td>
        <td>${relTime(s.created_at)}</td>
        <td>${replayLink(s, _currentPlayer.username, _currentPlayer.id)}</td>
    </tr>`;
}

function scoreTable(scores, emptyMsg) {
    if (!scores.length) return `<p class="empty-state">${emptyMsg}</p>`;
    return `<div class="table-wrap"><table>
        <thead><tr><th>${t('th_map')}</th><th>${t('th_mods')}</th><th>${t('th_grade')}</th><th>${t('th_acc')}</th><th>${t('th_pp')}</th><th>${t('th_when')}</th><th></th></tr></thead>
        <tbody>${scores.map(s => scoreRow(s)).join('')}</tbody>
    </table></div>`;
}

function gradeTallyHtml(gradeCounts) {
    if (!gradeCounts) return '';
    const items = GRADE_COUNT_FIELDS
        .map(([grade, field]) => ({ grade: grade.toUpperCase(), n: gradeCounts[field] }))
        .filter(g => g.n != null);
    if (!items.length) return '';
    return `<div class="grade-tally">${items.map(g => `
        <div class="grade-tally-item">${gradeBadge(g.grade)}<span class="count">${g.n}</span></div>
    `).join('')}</div>`;
}

function fmtJoinDate(iso) {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleDateString(getLang() === 'zh' ? 'zh-TW' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return null;
    }
}

/* ---------- header rank badges + derived stat cards ---------- */

// value's sign is already "positive = improved" from the API (player-get.js
// flips the raw rank-number diff so a lower rank number reads as a gain,
// same direction as a pp gain) — this just renders it.
function rankDeltaHtml(value, days, suffix) {
    if (value == null || !days || value === 0) return '';
    const up = value > 0;
    const shown = `${Math.abs(value).toLocaleString()}${suffix || ''}`;
    return `<span class="player-rank-badge-delta player-rank-badge-delta--${up ? 'up' : 'down'}">${up ? '▲' : '▼'}${shown} · ${t('rank_delta_days', { n: days })}</span>`;
}

function rankBadgesHtml(p) {
    const d = p.rank_delta;
    return `<div class="player-rank-badges">
        <div class="player-rank-badge player-rank-badge--accent">
            <span class="player-rank-badge-label">${t('rank_global')}</span>
            <span class="player-rank-badge-value">#${fmtNum(p.global_rank)}</span>
            ${d ? rankDeltaHtml(d.global, d.days) : ''}
        </div>
        <div class="player-rank-badge">
            <span class="player-rank-badge-label">${t('rank_country')}${p.country_code ? ` (${escapeHtml(p.country_code)})` : ''}</span>
            <span class="player-rank-badge-value">#${fmtNum(p.country_rank)}</span>
            ${d ? rankDeltaHtml(d.country, d.days) : ''}
        </div>
        <div class="player-rank-badge player-rank-badge--pp">
            <span class="player-rank-badge-label">${t('total_pp')}</span>
            <span class="player-rank-badge-value">${fmtPP(p.pp)}</span>
            ${d ? rankDeltaHtml(d.pp, d.days, 'pp') : ''}
        </div>
    </div>`;
}

function median(nums) {
    const sorted = nums.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function computeSrDistribution(bestPlays) {
    const withSr = bestPlays.filter(s => s.difficulty_rating != null);
    if (!withSr.length) return null;
    const counts = SR_BUCKETS.map(() => 0);
    withSr.forEach(s => {
        let idx = SR_BUCKETS.findIndex(b => s.difficulty_rating < b.max);
        if (idx === -1) idx = SR_BUCKETS.length - 1;
        counts[idx]++;
    });
    return SR_BUCKETS
        .map((b, i) => ({ ...b, count: counts[i], pct: Math.round((counts[i] / withSr.length) * 100) }))
        .filter(b => b.count > 0);
}

function statCardsHtml(bestPlays, mostUsedMod) {
    const sr = computeSrDistribution(bestPlays);
    const bpms = bestPlays.map(s => s.bpm).filter(b => b != null);
    const bpmMedian = bpms.length ? median(bpms) : null;
    const pps = bestPlays.map(s => s.pp).filter(p => p != null);
    const ppRange = pps.length ? { max: Math.round(Math.max(...pps)), min: Math.round(Math.min(...pps)) } : null;

    const cards = [];
    if (sr) {
        cards.push(`<div class="player-stat-card">
            <div class="player-stat-card-title">${t('stat_sr_distribution')}</div>
            <div class="player-sr-bar">${sr.map(b => `<span style="width:${b.pct}%;background:${b.color}" title="${escapeHtml(b.label)} ${b.pct}%"></span>`).join('')}</div>
            <div class="player-sr-legend">${sr.map(b => `<span><i style="background:${b.color}"></i>${b.pct}% ${escapeHtml(b.label)}</span>`).join('')}</div>
        </div>`);
    }
    if (mostUsedMod) {
        const pct = Math.round((mostUsedMod.count / mostUsedMod.total) * 100);
        cards.push(`<div class="player-stat-card">
            <div class="player-stat-card-title">${t('most_used_mod')}</div>
            <div class="player-stat-card-big">${modComboHexHtml(mostUsedMod.mod)} ${pct}%</div>
            <div class="farm-helper-target-bar"><div class="farm-helper-target-bar-fill" style="width:${pct}%"></div></div>
        </div>`);
    }
    if (bpmMedian != null) {
        cards.push(`<div class="player-stat-card">
            <div class="player-stat-card-title">${t('stat_bpm_median')}</div>
            <div class="player-stat-card-big">${bpmMedian} BPM</div>
        </div>`);
    }
    if (ppRange) {
        cards.push(`<div class="player-stat-card">
            <div class="player-stat-card-title">${t('stat_pp_range')}</div>
            <div class="player-stat-card-big">${ppRange.max}<span class="player-stat-card-dim"> – ${ppRange.min}</span></div>
        </div>`);
    }
    return cards.length ? `<div class="player-stat-cards">${cards.join('')}</div>` : '';
}

/* ---------- 最佳成績: mod filter + sort ---------- */

let _bestPlaysAll = [];
let _bestModFilter = '';
let _bestSort = 'pp';

function bestPlaysFiltered() {
    let list = _bestPlaysAll;
    if (_bestModFilter) {
        list = list.filter(s => (s.mods && s.mods.length ? s.mods : ['NM']).includes(_bestModFilter));
    }
    return list.slice().sort((a, b) => _bestSort === 'time'
        ? new Date(b.created_at || 0) - new Date(a.created_at || 0)
        : (b.pp ?? -1) - (a.pp ?? -1));
}

function renderBestPlaysTable() {
    const el = document.getElementById('best-plays-table');
    if (el) el.innerHTML = scoreTable(bestPlaysFiltered(), t('no_best_plays_filtered'));
}

function bestPlaysToolbarHtml(bestPlays) {
    const mods = Array.from(new Set(bestPlays.flatMap(s => (s.mods && s.mods.length ? s.mods : ['NM']))));
    if (!mods.length) return '';
    return `<div class="player-best-toolbar">
        <div class="player-mod-filter">
            <button type="button" class="mod-filter-btn${_bestModFilter === '' ? ' active' : ''}" data-mod="">${t('filter_any_mod')}</button>
            ${mods.map(m => `<button type="button" class="mod-filter-btn${_bestModFilter === m ? ' active' : ''}" data-mod="${escapeHtml(m)}">${modHexHtml(m)}</button>`).join('')}
        </div>
        <select id="best-sort-select">
            <option value="pp"${_bestSort === 'pp' ? ' selected' : ''}>${t('sort_pp')}</option>
            <option value="time"${_bestSort === 'time' ? ' selected' : ''}>${t('sort_time')}</option>
        </select>
    </div>`;
}

function wireBestPlaysToolbar() {
    document.querySelectorAll('.mod-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _bestModFilter = btn.getAttribute('data-mod');
            document.querySelectorAll('.mod-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
            renderBestPlaysTable();
        });
    });
    const sortSelect = document.getElementById('best-sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            _bestSort = e.target.value;
            renderBestPlaysTable();
        });
    }
}

/* ---------- 關于 / 活躍度 tabs ---------- */

function aboutTabHtml(pageRaw) {
    if (!pageRaw || !pageRaw.trim()) return `<p class="empty-state">${t('about_empty')}</p>`;
    return `<div class="player-about-body">${typeof renderBBCode === 'function' ? renderBBCode(pageRaw) : escapeHtml(pageRaw)}</div>`;
}

function activityTabHtml(monthly) {
    if (!monthly || !monthly.length) return `<p class="empty-state">${t('activity_empty')}</p>`;
    const max = Math.max(...monthly.map(m => m.count || 0), 1);
    const lang = getLang() === 'zh' ? 'zh-TW' : 'en-US';
    const bars = monthly.map(m => {
        const d = new Date(m.start_date);
        const label = isNaN(d) ? m.start_date : d.toLocaleDateString(lang, { year: 'numeric', month: 'short' });
        const h = Math.max(2, Math.round((m.count / max) * 100));
        return `<div class="player-activity-bar" style="height:${h}%" title="${escapeHtml(t('activity_month_count', { month: label, n: m.count }))}"></div>`;
    }).join('');
    return `<p class="coverage-note">${t('activity_hint')}</p><div class="player-activity-chart">${bars}</div>`;
}

function switchPlayerTab(tab) {
    document.querySelectorAll('.player-tabs .pill').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    document.querySelectorAll('.player-tab-panel').forEach(p => { p.hidden = p.id !== `player-tab-${tab}`; });
}

function wirePlayerTabs() {
    document.querySelectorAll('.player-tabs .pill').forEach(btn => {
        btn.addEventListener('click', () => switchPlayerTab(btn.getAttribute('data-tab')));
    });
}

async function loadPlayer() {
    const main = document.getElementById('player-main');
    const params = new URLSearchParams(location.search);
    const userId = params.get('id');
    if (!userId) {
        main.innerHTML = `<p class="empty-state">${t('player_no_id')}</p>`;
        return;
    }

    try {
        const data = await apiGet('player-get', { user_id: userId });
        const p = data.profile;
        document.title = `Catch Tracker — ${p.username || userId}`;
        _currentPlayer = { id: userId, username: p.username || '' };

        const extraStats = [];
        const joinDate = fmtJoinDate(p.join_date);
        if (joinDate) extraStats.push(`<span>${t('stat_joined', { date: joinDate })}</span>`);
        if (p.play_time_seconds != null) extraStats.push(`<span>${t('stat_playtime', { h: Math.round(p.play_time_seconds / 3600).toLocaleString() })}</span>`);

        const coverStyle = p.cover_url ? ` style="background-image:url('${p.cover_url.replace(/'/g, '%27')}')"` : '';
        const bestPlays = data.bestPlays || [];
        _bestPlaysAll = bestPlays;
        _bestModFilter = '';
        _bestSort = 'pp';
        const sortedByDate = bestPlays.filter(s => s.created_at).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const newest = sortedByDate[0];
        const oldest = sortedByDate[sortedByDate.length - 1];
        const mostUsedMod = data.mostUsedMod;
        const lastSeen = p.is_online ? t('last_seen_online') : (p.last_visit ? t('last_seen_offline', { when: relTime(p.last_visit) }) : null);

        main.innerHTML = `
            <div class="card profile-header${p.cover_url ? ' has-cover' : ''}"${coverStyle}>
                ${avatarWithFlagHtml(p.avatar_url, p.country_code)}
                <div>
                    <h1 style="margin:0">${escapeHtml(p.username || userId)}</h1>
                    <div class="profile-stats">
                        <a class="pill player-osu-link" href="https://osu.ppy.sh/users/${encodeURIComponent(userId)}/fruits" target="_blank" rel="noopener noreferrer">${escapeHtml(t('osu_profile_link'))} ↗</a>
                        ${lastSeen ? `<span>${escapeHtml(lastSeen)}</span>` : ''}
                    </div>
                </div>
                <a class="pill farm-helper-link" href="farm-helper.html?id=${encodeURIComponent(userId)}">${escapeHtml(t('farm_helper_view'))}</a>
            </div>

            ${rankBadgesHtml(p)}

            <div class="profile-stats" style="margin:-6px 0 18px">
                <span>${t('stat_acc', { acc: fmtAccuracy(p.accuracy) })}</span>
                <span>${t('stat_plays', { n: fmtNum(p.play_count) })}</span>
                ${extraStats.join('')}
            </div>

            ${statCardsHtml(bestPlays, mostUsedMod)}

            ${p.grade_counts ? `
            <div class="card">
                <h2 style="margin-top:0">${t('grade_tally')}</h2>
                ${gradeTallyHtml(p.grade_counts)}
            </div>` : ''}

            ${newest || oldest ? `
            <div class="highlight-strip">
                ${newest ? highlightCard({ ...newest, username: p.username }).replace('highlight-card"', `highlight-card" data-label="${escapeHtml(t('newest_best'))}"`) : ''}
                ${oldest && oldest !== newest ? highlightCard({ ...oldest, username: p.username }).replace('highlight-card"', `highlight-card" data-label="${escapeHtml(t('oldest_best'))}"`) : ''}
            </div>` : ''}

            <div class="player-tabs pill-group">
                <button type="button" class="pill active" data-tab="best">${t('best_plays')}</button>
                <button type="button" class="pill" data-tab="recent">${t('recent_plays')}</button>
                <button type="button" class="pill" data-tab="about">${t('tab_about')}</button>
                <button type="button" class="pill" data-tab="activity">${t('tab_activity')}</button>
            </div>
            <div class="player-tab-panel" id="player-tab-best">
                ${bestPlaysToolbarHtml(bestPlays)}
                <div id="best-plays-table">${scoreTable(bestPlaysFiltered(), t('no_best_plays'))}</div>
            </div>
            <div class="player-tab-panel" id="player-tab-recent" hidden>${scoreTable(data.recentPlays || [], t('no_recent_plays'))}</div>
            <div class="player-tab-panel" id="player-tab-about" hidden>${aboutTabHtml(p.page_raw)}</div>
            <div class="player-tab-panel" id="player-tab-activity" hidden>${activityTabHtml(p.monthly_playcounts)}</div>
        `;

        wirePlayerTabs();
        wireBestPlaysToolbar();
    } catch (err) {
        main.innerHTML = `<p class="empty-state">${t('player_not_found')}</p>`;
    }
}

loadPlayer();
