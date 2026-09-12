let _page = 0;
let _grade = '';
let _country = '';
let _countriesPopulated = false;
let _countries = [];

const GRADE_FILTER_OPTIONS = ['', 'XH', 'X', 'SH', 'S', 'A', 'B', 'C', 'D', 'F'];

// Populated once from the first response's `countries` list (every country
// currently present in the feed, with counts) rather than rebuilt on every
// poll — rebuilding the panel out from under an open dropdown/mid-choice
// would be a bad experience for no benefit (the list barely changes tick to
// tick).
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
    loadFeed();
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

let _activePlayersRendered = false;

// Rendered once from the first response, same reasoning as the country
// filter above — this list barely changes tick to tick and re-rendering it
// out from under a viewer's mouse would be a bad hover experience.
function renderActivePlayers(players) {
    if (_activePlayersRendered || !players || !players.length) return;
    const row = document.getElementById('feed-active-row');
    const wrap = document.getElementById('feed-active-avatars');
    wrap.innerHTML = players.map(p => `
        <a class="feed-active-avatar" href="player.html?id=${encodeURIComponent(p.user_id)}" title="${escapeHtml(p.username || '')}">
            ${avatarWithFlagHtml(p.avatar_url, p.country_code)}
        </a>`).join('');
    row.hidden = false;
    _activePlayersRendered = true;
}

function buildGradeFilter() {
    const group = document.getElementById('filter-grade-group');
    group.innerHTML = GRADE_FILTER_OPTIONS.map(g => {
        const color = g ? (GRADE_COLORS[g] || '#9691b8') : null;
        const style = color ? ` style="--grade-color:${color}"` : '';
        const label = g ? (g === 'F' ? t('grade_f_fail') : g) : t('filter_any_grade');
        return `<button type="button" class="pill${g === _grade ? ' active' : ''}" data-grade="${g}"${style}>${escapeHtml(label)}</button>`;
    }).join('');
    group.querySelectorAll('.pill').forEach(btn => {
        btn.addEventListener('click', () => {
            _grade = btn.getAttribute('data-grade');
            _page = 0;
            group.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b === btn));
            loadFeed();
        });
    });
}

function currentFilters() {
    return {
        page: _page,
        limit: 30,
        grade: _grade || undefined,
        fcOnly: document.getElementById('filter-fc').classList.contains('active') ? '1' : undefined,
        chokeOnly: document.getElementById('filter-choke').classList.contains('active') ? '1' : undefined,
        country: _country || undefined,
    };
}

async function loadFeed() {
    const body = document.getElementById('feed-body');
    const note = document.getElementById('coverage-note');
    try {
        const params = Object.fromEntries(Object.entries(currentFilters()).filter(([, v]) => v !== undefined));
        const data = await apiGet('feed-list', params);

        body.innerHTML = data.items.length
            ? data.items.map(s => `
                <tr>
                    <td>${avatarWithFlagHtml(s.avatar_url, s.country_code)} ${playerLink(s.user_id, s.username)}</td>
                    <td>${mapLink(s.beatmap_id, `${s.artist || ''} - ${s.title || ''} [${s.version || ''}]`)}</td>
                    <td>${modsTag(s.mods)}</td>
                    <td>${gradeBadge(s.rank)}${fcTag(s.is_fc)}</td>
                    <td>${fmtAccuracy(s.accuracy)}</td>
                    <td>${fmtPP(s.pp)}</td>
                    <td>${relTime(s.created_at)}</td>
                </tr>`).join('')
            : `<tr><td colspan="7" class="empty-state">${t('empty_feed')}</td></tr>`;

        populateCountryFilter(data.countries);
        renderActivePlayers(data.activePlayers);

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

document.getElementById('prev-page').addEventListener('click', () => { if (_page > 0) { _page--; loadFeed(); } });
document.getElementById('next-page').addEventListener('click', () => { _page++; loadFeed(); });
['filter-fc', 'filter-choke'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
        e.currentTarget.classList.toggle('active');
        _page = 0;
        loadFeed();
    });
});
buildGradeFilter();
loadFeed();
setInterval(loadFeed, 45000);
