/* Dedicated "best scores across everyone" page — mania-tracker.com's own
   /top-plays, with 24h/3d/7d/30d range tabs. Distinct from the Live Feed
   page (chronological, every grade) and the home page's 3-card teaser
   (fixed to a handful of recent bests, no paging/range control): this is
   the full, paginated, always-pp-sorted view. Reuses feed-list.js's
   existing sort=pp path plus its new sinceHours param — no new backend
   dataset. */

let _page = 0;
let _hours = 168; // default tab: 7d, matching mania-tracker's own default
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
    loadTopPlays();
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

document.querySelectorAll('#filter-range-group .pill').forEach(btn => {
    btn.addEventListener('click', () => {
        _hours = parseInt(btn.getAttribute('data-hours'), 10);
        _page = 0;
        document.querySelectorAll('#filter-range-group .pill').forEach(b => b.classList.toggle('active', b === btn));
        loadTopPlays();
    });
});

async function loadTopPlays() {
    const body = document.getElementById('feed-body');
    const note = document.getElementById('coverage-note');
    try {
        const data = await apiGet('feed-list', {
            page: _page, limit: 30, sort: 'pp',
            sinceHours: _hours || undefined,
            country: _country || undefined,
        });

        const items = data.items.filter(s => !window.isPlayerHidden || !window.isPlayerHidden(s.username));

        body.innerHTML = items.length
            ? items.map(s => `
                <tr>
                    <td>${avatarWithFlagHtml(s.avatar_url, s.country_code)} ${playerLink(s.user_id, s.username)}</td>
                    <td>${mapLink(s.beatmap_id, `${s.artist || ''} - ${s.title || ''} [${s.version || ''}]`)}</td>
                    <td>${modsTag(s.mods)}</td>
                    <td>${gradeBadge(s.rank)}${fcTag(s.is_fc)}</td>
                    <td>${fmtAccuracy(s.accuracy)}</td>
                    <td>${fmtPP(s.pp)}</td>
                    <td>${relTime(s.created_at)}</td>
                    <td>${replayLink(s)}</td>
                </tr>`).join('')
            : `<tr><td colspan="8" class="empty-state">${t('empty_feed')}</td></tr>`;

        populateCountryFilter(data.countries);

        const c = data.coverage || {};
        note.textContent = c.lastOkAt
            ? t('coverage_feed', { n: c.totalPlayers || 0, time: relTime(c.lastOkAt), done: c.playersPolledThisSweep || 0, total: c.totalPlayers || 0 })
            : t('coverage_feed_pending', { n: c.totalPlayers || 0 });

        document.getElementById('page-label').textContent = t('page_label', { n: _page + 1 });
        document.getElementById('prev-page').disabled = _page === 0;
        document.getElementById('next-page').disabled = (_page + 1) * 30 >= data.total;
    } catch (err) {
        note.textContent = t('failed_feed');
    }
}

document.getElementById('prev-page').addEventListener('click', () => { if (_page > 0) { _page--; loadTopPlays(); } });
document.getElementById('next-page').addEventListener('click', () => { _page++; loadTopPlays(); });

loadTopPlays();
