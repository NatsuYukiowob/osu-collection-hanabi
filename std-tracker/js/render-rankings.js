/* Ported from catch-tracker's own render-rankings.js, including its
   rank-delta columns now that a daily rank-snapshot cron exists here too. */
let _page = 0;
let _country = '';
let _countriesPopulated = false;
let _countries = [];

function renderCountryOptions() {
    const panel = document.getElementById('filter-country-panel');
    panel.innerHTML = `
        <button type="button" class="flag-select-option${_country === '' ? ' active' : ''}" data-code="" role="option">
            <span>${escapeHtml(t('filter_all_countries'))}</span>
        </button>` +
        _countries.map(c => `
            <button type="button" class="flag-select-option${_country === c.code ? ' active' : ''}" data-code="${escapeHtml(c.code)}" role="option">
                <img src="${flagUrl(c.code)}" alt="" onerror="this.remove();">
                <span>${escapeHtml(c.code)}</span>
                <span class="flag-select-count">${c.count}</span>
            </button>`).join('');
}

function updateCountryButton() {
    const flagImg = document.getElementById('filter-country-flag');
    const label = document.getElementById('filter-country-label');
    if (_country) {
        flagImg.src = flagUrl(_country);
        flagImg.hidden = false;
        label.textContent = _country;
    } else {
        flagImg.hidden = true;
        label.textContent = t('filter_all_countries');
    }
}

function populateCountryFilter(countries) {
    if (_countriesPopulated || !countries || !countries.length) return;
    _countries = countries;
    renderCountryOptions();
    _countriesPopulated = true;
}

function setCountryFilter(code) {
    _country = code;
    _page = 0;
    updateCountryButton();
    renderCountryOptions();
    closeCountryPanel();
    loadRankings();
}

function closeCountryPanel() {
    document.getElementById('filter-country-panel').hidden = true;
    document.getElementById('filter-country-btn').setAttribute('aria-expanded', 'false');
}

document.getElementById('filter-country-btn').addEventListener('click', () => {
    const panel = document.getElementById('filter-country-panel');
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    document.getElementById('filter-country-btn').setAttribute('aria-expanded', String(willOpen));
});
document.getElementById('filter-country-panel').addEventListener('click', (e) => {
    const btn = e.target.closest('.flag-select-option');
    if (btn) setCountryFilter(btn.getAttribute('data-code'));
});
document.addEventListener('click', (e) => {
    if (!document.getElementById('filter-country-combo').contains(e.target)) closeCountryPanel();
});

// Compact table-cell rank-delta — a plain colour-coded "+N"/"-N" (no arrow
// glyph, that's reserved for the player page's bigger badge — see
// rankDeltaHtml() in render-player.js), "—" when flat/unknown. Title
// attribute carries the real (non-fixed, growing) day count from
// rankings-list.js rather than the header pretending it's always a fixed
// window.
function rankDeltaCellHtml(value, days) {
    if (value == null || value === 0) return '<span class="rankings-delta rankings-delta--flat">—</span>';
    const up = value > 0;
    const title = days ? ` title="${escapeHtml(t('rank_delta_days', { n: days }))}"` : '';
    return `<span class="rankings-delta rankings-delta--${up ? 'up' : 'down'}"${title}>${up ? '+' : ''}${value.toLocaleString()}</span>`;
}

function gradeCellHtml(n) {
    return `<td class="rankings-grade-cell">${n ? n.toLocaleString() : '—'}</td>`;
}

async function loadRankings() {
    const body = document.getElementById('rankings-body');
    const note = document.getElementById('coverage-note');
    try {
        const data = await apiGet('rankings-list', { page: _page, limit: 50, country: _country || undefined });
        const startRank = _page * 50 + 1;
        // Per-browser hide-list (settings-panel.js) — filtered client-side
        // after the page loads rather than server-side, since it's a
        // local-only preference, not something the API needs to know
        // about. Row numbers stay tied to each item's real global rank
        // (startRank + its ORIGINAL index, captured before filtering)
        // rather than re-numbering, so a hidden player doesn't shift
        // everyone else's rank number.
        const items = data.items
            .map((r, i) => ({ r, rank: startRank + i }))
            .filter(({ r }) => !window.isPlayerHidden || !window.isPlayerHidden(r.username));
        body.innerHTML = items.length
            ? items.map(({ r, rank }) => {
                const d = r.rank_delta;
                const gc = r.grade_counts;
                return `
                <tr>
                    <td class="rank-num">${rank}</td>
                    <td>${avatarWithFlagHtml(r.avatar_url, r.country_code)} ${playerLink(r.user_id, r.username)}</td>
                    <td>${rankDeltaCellHtml(d && d.global, d && d.days)}</td>
                    <td>${rankDeltaCellHtml(d && d.country, d && d.days)}</td>
                    <td>${fmtAccuracy(r.accuracy)}</td>
                    <td>${r.play_count ?? '—'}</td>
                    <td>${fmtPP(r.pp)}</td>
                    ${gradeCellHtml(gc && gc.ss)}
                    ${gradeCellHtml(gc && gc.s)}
                    ${gradeCellHtml(gc && gc.a)}
                </tr>`;
            }).join('')
            : `<tr><td colspan="10" class="empty-state">${t('empty_rankings')}</td></tr>`;

        populateCountryFilter(data.countries);

        const c = data.coverage || {};
        note.textContent = c.lastOkAt
            ? t('coverage_rankings', { n: data.total, time: relTime(c.lastOkAt) })
            : t('coverage_rankings_pending', { n: data.total });

        document.getElementById('page-label').textContent = t('page_label', { n: _page + 1 });
        document.getElementById('prev-page').disabled = _page === 0;
        document.getElementById('next-page').disabled = (_page + 1) * 50 >= data.total;
    } catch (err) {
        note.textContent = t('failed_rankings');
    }
}

document.getElementById('prev-page').addEventListener('click', () => { if (_page > 0) { _page--; loadRankings(); } });
document.getElementById('next-page').addEventListener('click', () => { _page++; loadRankings(); });

loadRankings();
