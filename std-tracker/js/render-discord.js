/* Community-submitted Discord server directory — ported from catch-tracker's
   own render-discord.js. See netlify/functions/communities.js for the
   backend this drives. */

let _searchDebounce = null;

async function apiDelete(fn, body) {
    const token = getStAuthToken();
    const res = await fetch(`/.netlify/functions/${fn}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'x-st-auth-token': token } : {}) },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
    return res.json();
}

function communityCard(c, user) {
    const icon = c.iconUrl
        ? `<img class="community-card-icon" src="${escapeHtml(c.iconUrl)}" alt="" onerror="this.remove();">`
        : `<span class="community-card-icon community-card-icon--placeholder">🎮</span>`;
    const tags = (c.tags || []).map(t => `<span class="community-card-tag">#${escapeHtml(t)}</span>`).join('');
    const mine = user && String(user.id) === String(c.submittedById);
    return `<div class="community-card">
        <div class="community-card-head">
            ${icon}
            <span class="community-card-name">${escapeHtml(c.name)}</span>
            <a class="pill toggle community-card-join" href="${escapeHtml(c.inviteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('discord_join'))}</a>
        </div>
        ${c.description ? `<p class="community-card-desc">${escapeHtml(c.description)}</p>` : ''}
        <div class="community-card-footer">
            <div class="community-card-tags">${tags}</div>
            <span class="community-card-meta">${escapeHtml(t('discord_submitted_by', { name: c.submittedByName || '?' }))}</span>
        </div>
        ${mine ? `<button type="button" class="community-card-remove" data-id="${escapeHtml(c.id)}">${escapeHtml(t('discord_remove'))}</button>` : ''}
    </div>`;
}

async function loadCommunities(q) {
    const grid = document.getElementById('discord-grid');
    const note = document.getElementById('coverage-note');
    const user = typeof getStLoggedInUser === 'function' ? getStLoggedInUser() : null;
    try {
        const data = await apiGet('communities', { q: q || undefined });
        grid.innerHTML = data.items.length
            ? data.items.map(c => communityCard(c, user)).join('')
            : `<p class="empty-state">${escapeHtml(t('discord_empty'))}</p>`;
        note.textContent = t('discord_coverage', { n: data.total });

        grid.querySelectorAll('.community-card-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                try {
                    await apiDelete('communities', { id: btn.getAttribute('data-id') });
                    loadCommunities(document.getElementById('discord-search').value.trim());
                } catch {
                    btn.disabled = false;
                }
            });
        });
    } catch {
        note.textContent = t('discord_failed');
    }
}

document.getElementById('discord-search').addEventListener('input', (e) => {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => loadCommunities(e.target.value.trim()), 300);
});

/* ---------- submit form ---------- */

function loginGateHtml() {
    return `
        <div class="card" style="max-width:420px;text-align:center;padding:24px;margin-bottom:16px">
            <p style="margin-top:0">${escapeHtml(t('discord_login_prompt'))}</p>
            <a class="ct-login-btn" href="${stLoginUrl()}" style="display:inline-flex">${escapeHtml(t('login_with_osu'))}</a>
        </div>
    `;
}

function submitFormHtml() {
    return `
        <div class="card" style="max-width:480px;margin-bottom:16px">
            <div style="display:flex;flex-direction:column;gap:10px">
                <input type="text" id="discord-name" class="search-input" style="width:100%" data-i18n-placeholder="discord_name_placeholder" placeholder="Server name">
                <input type="text" id="discord-invite" class="search-input" style="width:100%" data-i18n-placeholder="discord_invite_placeholder" placeholder="https://discord.gg/...">
                <input type="text" id="discord-icon" class="search-input" style="width:100%" data-i18n-placeholder="discord_icon_placeholder" placeholder="Icon image URL (optional)">
                <textarea id="discord-desc" class="search-input" style="width:100%;min-height:70px;resize:vertical" data-i18n-placeholder="discord_desc_placeholder" placeholder="Short description (optional)"></textarea>
                <input type="text" id="discord-tags" class="search-input" style="width:100%" data-i18n-placeholder="discord_tags_placeholder" placeholder="Tags, comma-separated (optional)">
                <button type="button" class="pill toggle" id="discord-submit-btn">${escapeHtml(t('discord_submit'))}</button>
                <p id="discord-submit-status" style="font-size:0.82rem;min-height:1.2em"></p>
            </div>
        </div>
    `;
}

document.getElementById('toggle-submit').addEventListener('click', () => {
    const wrap = document.getElementById('submit-form-wrap');
    if (!wrap.hidden) { wrap.hidden = true; return; }

    const user = typeof getStLoggedInUser === 'function' ? getStLoggedInUser() : null;
    wrap.innerHTML = user ? submitFormHtml() : loginGateHtml();
    wrap.hidden = false;
    // Scoped to this newly-injected form only — calling the page-wide
    // applyStaticI18n() here would re-run over the WHOLE document and
    // clobber #coverage-note back to its static "loading" placeholder
    // text (a real bug caught live-testing catch-tracker's own version).
    wrap.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    if (!user) return;

    document.getElementById('discord-submit-btn').addEventListener('click', async () => {
        const status = document.getElementById('discord-submit-status');
        const name = document.getElementById('discord-name').value.trim();
        const inviteUrl = document.getElementById('discord-invite').value.trim();
        const iconUrl = document.getElementById('discord-icon').value.trim();
        const description = document.getElementById('discord-desc').value.trim();
        const tags = document.getElementById('discord-tags').value.split(',').map(t => t.trim()).filter(Boolean);

        if (!name) { status.style.color = 'var(--danger)'; status.textContent = t('discord_missing_name'); return; }
        if (!inviteUrl) { status.style.color = 'var(--danger)'; status.textContent = t('discord_missing_invite'); return; }

        status.style.color = 'var(--text-dim)';
        status.textContent = t('discord_submitting');
        try {
            await apiPost('communities', { name, inviteUrl, iconUrl, description, tags });
            status.style.color = 'var(--success)';
            status.textContent = t('discord_submit_success');
            wrap.hidden = true;
            loadCommunities(document.getElementById('discord-search').value.trim());
        } catch (err) {
            status.style.color = 'var(--danger)';
            status.textContent = t('discord_submit_failed');
        }
    });
});

loadCommunities();
