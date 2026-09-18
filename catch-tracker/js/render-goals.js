/* Personal goal tracking — see netlify/functions/goals.js for the scoped-
   down (total-pp-only, for now) backend this drives. */

function loginGateHtml() {
    return `
        <div class="card" style="max-width:480px;margin:40px auto;text-align:center;padding:32px">
            <p style="margin-top:0">${escapeHtml(t('goals_login_prompt'))}</p>
            <a class="ct-login-btn" href="${ctLoginUrl()}" style="display:inline-flex">${escapeHtml(t('login_with_osu'))}</a>
        </div>
    `;
}

// api.js's apiPost() is POST-only; goal deletion needs DELETE, so this
// mirrors its same signed-token attach rather than adding a generic
// verb-parameterized version of apiPost for the sake of this one call.
async function apiDelete(fn, body) {
    const token = getCtAuthToken();
    const res = await fetch(`/.netlify/functions/${fn}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'x-ct-auth-token': token } : {}) },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
    return res.json();
}

function goalCard(goal, currentPp) {
    const pct = currentPp != null ? Math.min(100, Math.max(0, (currentPp / goal.target) * 100)) : 0;
    const achieved = goal.achieved;
    return `<div class="goal-card">
        <div class="goal-card-head">
            <div class="goal-card-title">
                ${escapeHtml(t('goals_total_pp_label'))} <span class="goal-target">${goal.target.toLocaleString()}pp</span>
                ${achieved ? `<span class="goal-achieved-badge">✓ ${escapeHtml(t('goals_achieved'))}</span>` : ''}
            </div>
            <button type="button" class="goal-remove-btn" data-id="${escapeHtml(goal.id)}" title="${escapeHtml(t('goals_remove'))}">✕</button>
        </div>
        <div class="goal-progress-track">
            <div class="goal-progress-fill${achieved ? ' goal-progress-fill--achieved' : ''}" style="width:${pct}%"></div>
        </div>
        <div class="goal-card-meta">
            <span>${currentPp != null ? t('goals_current_progress', { pp: Math.round(currentPp).toLocaleString() }) : '—'}</span>
            <span>${Math.round(pct)}%</span>
        </div>
    </div>`;
}

function renderGoalsUI(user, data) {
    const content = document.getElementById('goals-content');
    const goals = (data.goals || []).slice().sort((a, b) => a.target - b.target);
    const currentPp = data.currentPp;

    content.innerHTML = `
        <div class="goal-create-form">
            <span class="goal-create-label">${escapeHtml(t('goals_current_total_pp', { pp: currentPp != null ? Math.round(currentPp).toLocaleString() : '—' }))}</span>
            <input type="number" id="goal-target-input" class="search-input" style="width:140px" min="1" step="10" placeholder="pp">
            <button type="button" class="pill toggle" id="goal-create-btn">${escapeHtml(t('goals_set_new'))}</button>
            <span id="goal-create-status" style="font-size:0.82rem;color:var(--danger)"></span>
        </div>
        ${goals.length
            ? goals.map(g => goalCard(g, currentPp)).join('')
            : `<p class="empty-state">${escapeHtml(t('goals_empty'))}</p>`}
    `;

    document.getElementById('goal-create-btn').addEventListener('click', async () => {
        const input = document.getElementById('goal-target-input');
        const status = document.getElementById('goal-create-status');
        const target = parseFloat(input.value);
        if (!Number.isFinite(target) || target <= 0) {
            status.textContent = t('goals_invalid_target');
            return;
        }
        status.textContent = '';
        try {
            await apiPost('goals', { user_id: user.id, target });
            input.value = '';
            await loadGoals(user);
        } catch (err) {
            status.textContent = t('goals_save_failed');
        }
    });

    content.querySelectorAll('.goal-remove-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                await apiDelete('goals', { user_id: user.id, id: btn.getAttribute('data-id') });
                await loadGoals(user);
            } catch {
                btn.disabled = false;
            }
        });
    });
}

async function loadGoals(user) {
    const content = document.getElementById('goals-content');
    try {
        const data = await apiGet('goals', { user_id: user.id });
        renderGoalsUI(user, data);
    } catch {
        content.innerHTML = `<p class="empty-state">${escapeHtml(t('goals_load_failed'))}</p>`;
    }
}

function run() {
    const user = typeof getCtLoggedInUser === 'function' ? getCtLoggedInUser() : null;
    if (!user) {
        document.getElementById('goals-content').innerHTML = loginGateHtml();
        return;
    }
    document.getElementById('goals-content').innerHTML = `<p class="empty-state">${escapeHtml(t('loading'))}</p>`;
    loadGoals(user);
}

run();
