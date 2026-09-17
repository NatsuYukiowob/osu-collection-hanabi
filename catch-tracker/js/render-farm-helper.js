/* Farm helper (刷圖助手) page — see netlify/functions/farm-helper.js for
   the recommendation logic and netlify/functions/farm-helper-prefs.js for
   the 太難了/太簡單 feedback store. Modeled closely on mania-tracker.com's
   own farm-helper (explored live, every control clicked, per request):
   - Landing (no ?id=): search/recent/explainer + the 3D peer graph,
     centered on the viewer's own logged-in account (see renderLanding()).
   - Results (?id=): 為你推薦/熱門 tabs (which candidate SET is shown, not
     just a filter — see fhFilteredSorted()) + star/text/sort filters, a
     row list, and a persistent right-side detail panel (methodology
     explainer by default, a per-map breakdown once a row is clicked).
   4K/7K/不限 key-mode filters from the reference are skipped — catch is a
   single ruleset, they don't apply. */

const FARM_HELPER_RECENT_KEY = 'ct_farm_helper_recent';
const FARM_HELPER_RECENT_MAX = 5;
const FH_STAR_MAX = 10;

function loadRecentFarmHelper() {
    try {
        const raw = JSON.parse(localStorage.getItem(FARM_HELPER_RECENT_KEY));
        return Array.isArray(raw) ? raw.filter(r => r && r.id && r.username) : [];
    } catch { return []; }
}

function pushRecentFarmHelper(id, username) {
    if (!id || !username) return;
    try {
        const list = loadRecentFarmHelper().filter(r => String(r.id) !== String(id));
        list.unshift({ id: String(id), username });
        localStorage.setItem(FARM_HELPER_RECENT_KEY, JSON.stringify(list.slice(0, FARM_HELPER_RECENT_MAX)));
    } catch { /* private mode etc. — recent list just won't persist */ }
}

function removeRecentFarmHelper(id) {
    try {
        const list = loadRecentFarmHelper().filter(r => String(r.id) !== String(id));
        localStorage.setItem(FARM_HELPER_RECENT_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
}

function categoryLabel(category) {
    if (category === 'new') return t('farm_helper_category_new');
    if (category === 'improve') return t('farm_helper_category_improve');
    return t('farm_helper_category_achieved');
}

function refScoreHtml(item) {
    const mods = item.ref_mods && item.ref_mods.length ? modsTag(item.ref_mods) : modsTag([]);
    const acc = item.ref_accuracy != null ? fmtAccuracy(item.ref_accuracy) : '—';
    return `${gradeBadge(item.ref_rank)} ${mods} ${acc}`;
}

// Local copy of render-maps.js's osuLinkBtn — the two render-*.js files are
// never loaded on the same page, so there's no runtime name collision, and
// duplicating this one small function avoids adding a cross-page dependency
// for a single helper.
function osuLinkBtn(beatmapsetId) {
    if (!beatmapsetId) return '';
    return `<a class="cover-link-btn" href="https://osu.ppy.sh/beatmapsets/${beatmapsetId}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="Open on osu!">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    </a>`;
}

const FARM_HELPER_CATEGORY_ICONS = {
    new: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>',
    improve: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 6"/><polyline points="15 6 21 6 21 12"/></svg>',
    achieved: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
};

function categoryExplainerRows() {
    return `
        <div class="farm-helper-landing-cat">
            <span class="farm-helper-landing-cat-icon farm-helper-cat--new">${FARM_HELPER_CATEGORY_ICONS.new}</span>
            <div><strong>${t('farm_helper_category_new')}</strong><span>${t('farm_helper_desc_new')}</span></div>
        </div>
        <div class="farm-helper-landing-cat">
            <span class="farm-helper-landing-cat-icon farm-helper-cat--improve">${FARM_HELPER_CATEGORY_ICONS.improve}</span>
            <div><strong>${t('farm_helper_category_improve')}</strong><span>${t('farm_helper_desc_improve')}</span></div>
        </div>
        <div class="farm-helper-landing-cat">
            <span class="farm-helper-landing-cat-icon farm-helper-cat--achieved">${FARM_HELPER_CATEGORY_ICONS.achieved}</span>
            <div><strong>${t('farm_helper_category_achieved')}</strong><span>${t('farm_helper_desc_achieved')}</span></div>
        </div>`;
}

function renderLanding(main) {
    const recent = loadRecentFarmHelper();
    const loggedInUser = getCtLoggedInUser();
    main.innerHTML = `
        <div class="farm-helper-landing${loggedInUser ? ' farm-helper-landing--with-graph' : ''}">
            <div class="farm-helper-landing-main">
                <h1>${t('farm_helper_landing_title')}</h1>
                ${loggedInUser ? `
                <a class="pill farm-helper-landing-self-link" href="farm-helper.html?id=${encodeURIComponent(loggedInUser.id)}">
                    ${escapeHtml(t('farm_helper_my_own', { username: loggedInUser.username || `#${loggedInUser.id}` }))}
                </a>` : ''}
                <div class="farm-helper-landing-search">
                    <span class="farm-helper-landing-for">${t('farm_helper_landing_for')}</span>
                    <div class="search-wrap farm-helper-search-wrap">
                        <input type="text" id="farm-helper-search-input" class="search-input" placeholder="${escapeHtml(t('search_placeholder'))}" autocomplete="off">
                        <div class="search-results" id="farm-helper-search-results" hidden></div>
                    </div>
                </div>
                ${recent.length ? `
                <div class="farm-helper-recent">
                    <span class="farm-helper-recent-label">${t('farm_helper_recent')}</span>
                    <div class="farm-helper-recent-chips" id="farm-helper-recent-chips">
                        ${recent.map(r => `
                            <span class="farm-helper-recent-chip">
                                <a href="farm-helper.html?id=${encodeURIComponent(r.id)}">${escapeHtml(r.username)}</a>
                                <button type="button" class="farm-helper-recent-remove" data-id="${escapeHtml(r.id)}" title="${escapeHtml(t('remove'))}">&times;</button>
                            </span>`).join('')}
                    </div>
                </div>` : ''}
                <div class="farm-helper-landing-explainer">
                    <p class="farm-helper-landing-explainer-title">${t('farm_helper_explainer_title')}</p>
                    ${categoryExplainerRows()}
                </div>
            </div>
            ${loggedInUser ? `<div class="farm-helper-graph-card"><canvas id="farm-helper-graph" class="farm-helper-graph"></canvas></div>` : ''}
        </div>`;

    const input = document.getElementById('farm-helper-search-input');
    const results = document.getElementById('farm-helper-search-results');
    let debounceTimer = null;

    async function runSearch(q) {
        try {
            const data = await apiGet('rankings-list', { q, limit: 8 });
            results.innerHTML = data.items.length
                ? data.items.map(r => `
                    <a class="search-result-row" href="farm-helper.html?id=${encodeURIComponent(r.user_id)}">
                        ${avatarWithFlagHtml(r.avatar_url, r.country_code)}
                        <span>${escapeHtml(r.username)}</span>
                        <span class="search-result-pp">${fmtPP(r.pp)}</span>
                    </a>`).join('')
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
    input.addEventListener('focus', () => { if (input.value.trim() && results.innerHTML) results.hidden = false; });
    document.addEventListener('click', (e) => {
        if (!input.parentElement.contains(e.target)) results.hidden = true;
    });

    document.getElementById('farm-helper-recent-chips')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.farm-helper-recent-remove');
        if (!btn) return;
        e.preventDefault();
        removeRecentFarmHelper(btn.getAttribute('data-id'));
        renderLanding(main);
    });

    // The graph is centered on the VIEWER's own account (matching the
    // reference), so it needs its own farm-helper fetch here rather than
    // reusing anything from a results-page load.
    if (loggedInUser) {
        apiGet('farm-helper', { user_id: loggedInUser.id }).then(data => {
            const peers = data.peers || [];
            if (!peers.length) { document.querySelector('.farm-helper-graph-card')?.remove(); return; }
            initPeerGraph(
                document.getElementById('farm-helper-graph'),
                { avatar_url: loggedInUser.avatar_url || `https://a.ppy.sh/${loggedInUser.id}`, username: loggedInUser.username || `#${loggedInUser.id}` },
                peers
            );
        }).catch(() => { document.querySelector('.farm-helper-graph-card')?.remove(); });
    }
}

/* Decorative rotating peer-network graph, per request — modeled on
   mania-tracker.com/farm-helper's own version. Checked live and it's a
   genuine 3D sphere, not a flat rotating ring: peer nodes clearly vary in
   size/brightness and occlude each other as they move (near = bigger/
   brighter/drawn on top, far = smaller/dimmer/drawn behind), and dragging
   moves nodes along curved paths consistent with rotating a globe, not a
   flat disc. Reimplemented here as that: peers are points on a unit
   sphere (Fibonacci-sphere distribution — evenly spaced, no pole
   clustering), rotated each frame by 3D rotation matrices (Y-axis for
   idle auto-spin + horizontal drag, X-axis for vertical drag — a
   standard trackball/globe interaction), then rendered with simple
   orthographic projection (screen x/y = the rotated point's x/y directly)
   plus depth-based size/opacity scaling from the rotated z, painter's-
   algorithm sorted (far-to-near) so near nodes correctly draw over far
   ones. No 3D library — it's ~10 lines of matrix math per point, plain
   Canvas 2D for the actual drawing. Pointer Events (not mouse-specific)
   so drag-to-spin works on touch too. */
function initPeerGraph(canvas, center, peers) {
    if (!canvas || !peers.length) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function loadImg(url) {
        const img = new Image();
        img.decoding = 'async';
        img.src = url || '';
        return img;
    }
    const centerImg = loadImg(center.avatar_url);

    // Fibonacci sphere: N points spread evenly over a unit sphere's
    // surface using the golden angle — no clustering at the poles the way
    // a naive lat/long grid would have.
    const N = peers.length;
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    const nodes = peers.map((p, i) => {
        const y = 1 - (i / Math.max(1, N - 1)) * 2; // 1 .. -1
        const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = i * GOLDEN_ANGLE;
        return {
            img: loadImg(p.avatar_url),
            peer: p,
            // Unit-sphere coordinates — rotated fresh each frame, never
            // mutated in place.
            ux: Math.cos(theta) * radiusAtY,
            uy: y,
            uz: Math.sin(theta) * radiusAtY,
        };
    });

    // A tooltip + click target for each node (matching mania-tracker.com's
    // own graph — every peer node is hoverable/clickable there, linking to
    // that player's page). Canvas has no per-shape hit-testing, so this
    // keeps the current frame's on-screen circles (rebuilt every draw())
    // to test pointer position against.
    let lastFrameNodes = [];
    const tooltip = document.createElement('div');
    tooltip.className = 'farm-helper-graph-tooltip';
    tooltip.hidden = true;
    canvas.parentElement.appendChild(tooltip);

    function nodeAt(x, y) {
        // Iterate back-to-front (last drawn = nearest/topmost) so an
        // overlap resolves to whichever node is actually on top.
        for (let i = lastFrameNodes.length - 1; i >= 0; i--) {
            const n = lastFrameNodes[i];
            const dx = x - n.x, dy = y - n.y;
            if (dx * dx + dy * dy <= n.r * n.r) return n;
        }
        return null;
    }

    const dust = Array.from({ length: 24 }, () => ({
        x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.3,
    }));

    const IDLE_YAW_SPEED = 0.00022; // rad/ms
    let yaw = Math.random() * Math.PI * 2;
    let pitch = -0.25; // slight tilt so the sphere doesn't read as a flat edge-on ring at rest
    let yawVelocity = reduceMotion ? 0 : IDLE_YAW_SPEED;
    let pitchVelocity = 0;
    let dragging = false;
    let lastX = 0, lastY = 0;
    let downX = 0, downY = 0;
    let lastTime = performance.now();

    canvas.addEventListener('pointerdown', (e) => {
        dragging = true;
        yawVelocity = 0;
        pitchVelocity = 0;
        lastX = e.clientX;
        lastY = e.clientY;
        downX = e.clientX;
        downY = e.clientY;
        canvas.style.cursor = ''; // let the .dragging class's grabbing cursor take over
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add('dragging');
        tooltip.hidden = true;
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!dragging) {
            // Not rotating — treat this as hovering, and surface which
            // node (if any) is under the pointer: a tooltip + pointer
            // cursor, and a real click target (see the pointerup handler).
            const rect = canvas.getBoundingClientRect();
            const node = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (node && node.peer) {
                canvas.style.cursor = 'pointer';
                tooltip.hidden = false;
                tooltip.style.left = `${node.x}px`;
                tooltip.style.top = `${node.y - node.r}px`;
                tooltip.textContent = node.peer.pp != null
                    ? `${node.peer.username} · ${Math.round(node.peer.pp)}pp`
                    : node.peer.username || '';
            } else {
                canvas.style.cursor = '';
                tooltip.hidden = true;
            }
            return;
        }
        tooltip.hidden = true;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        const dYaw = reduceMotion ? 0 : dx * 0.012;
        const dPitch = reduceMotion ? 0 : dy * 0.012;
        yaw += dYaw;
        pitch = Math.max(-1.4, Math.min(1.4, pitch + dPitch));
        yawVelocity = dYaw * 3.5; // seeds momentum from the last drag step's speed
        pitchVelocity = dPitch * 3.5;
        lastX = e.clientX;
        lastY = e.clientY;
    });
    function endDrag() { dragging = false; canvas.classList.remove('dragging'); }
    canvas.addEventListener('pointerup', (e) => {
        endDrag();
        // A drag that barely moved reads as a tap/click — open that node's
        // player page. A real rotate-drag (bigger movement) never triggers
        // navigation, so spinning the sphere still works as before.
        if (Math.abs(e.clientX - downX) < 6 && Math.abs(e.clientY - downY) < 6) {
            const rect = canvas.getBoundingClientRect();
            const node = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (node && node.peer && node.peer.user_id != null) {
                location.href = `player.html?id=${encodeURIComponent(node.peer.user_id)}`;
            }
        }
    });
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', () => { endDrag(); tooltip.hidden = true; canvas.style.cursor = ''; });

    function drawAvatar(img, x, y, r, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        if (img.complete && img.naturalWidth) {
            ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
        } else {
            ctx.fillStyle = '#2a2a4a';
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.restore();
    }

    let stopped = false;
    function draw(now) {
        if (stopped) return;
        const dt = Math.min(64, now - lastTime);
        lastTime = now;

        if (!dragging) {
            // Momentum decays back toward the idle baseline (yaw keeps
            // auto-spinning; pitch settles back to 0 rather than to
            // wherever a drag left it, so the sphere doesn't end up stuck
            // looking at its own pole) rather than to a hard stop.
            yawVelocity += (IDLE_YAW_SPEED - yawVelocity) * Math.min(1, dt / 900);
            pitchVelocity += (0 - pitchVelocity) * Math.min(1, dt / 900);
            pitch += (0 - pitch) * Math.min(1, dt / 4000);
            yaw += yawVelocity * dt;
            pitch += pitchVelocity * dt * 0.002;
        }
        const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
        const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);

        const rect = canvas.getBoundingClientRect();
        const w = rect.width, h = rect.height;
        if (w === 0 || h === 0) { requestAnimationFrame(draw); return; }
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;
        const R = Math.min(w, h) * 0.4;

        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        for (const d of dust) {
            ctx.beginPath();
            ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Rotate each unit-sphere point by yaw (around Y) then pitch
        // (around X), scale to R, project orthographically (screen x/y =
        // rotated x/y, z only drives depth-based size/opacity/order).
        const projected = nodes.map(n => {
            const x1 = n.ux * cosYaw - n.uz * sinYaw;
            const z1 = n.ux * sinYaw + n.uz * cosYaw;
            const y2 = n.uy * cosPitch - z1 * sinPitch;
            const z2 = n.uy * sinPitch + z1 * cosPitch;
            return { img: n.img, peer: n.peer, x: cx + x1 * R, y: cy + y2 * R, z: z2 };
        });
        projected.sort((a, b) => a.z - b.z); // far first (painter's algorithm)

        const nodeR = Math.max(8, R * 0.11);
        for (const p of projected) {
            const depth = (p.z + 1) / 2; // 0 (far) .. 1 (near)
            const size = nodeR * (0.55 + 0.55 * depth);
            p.r = size; // recorded for this frame's hover/click hit-testing
            const alpha = 0.35 + 0.65 * depth;
            ctx.globalAlpha = alpha * 0.5;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            drawAvatar(p.img, p.x, p.y, size, alpha);
        }
        ctx.globalAlpha = 1;
        lastFrameNodes = projected;

        const centerR = nodeR * 1.7;
        drawAvatar(centerImg, cx, cy, centerR, 1);
        ctx.beginPath();
        ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
        ctx.strokeStyle = '#fb5a8c';
        ctx.lineWidth = 3;
        ctx.stroke();

        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    // If this canvas gets torn out of the DOM (page navigation via the SPA-
    // style history API isn't used here, but a future re-render of #farm-
    // helper-main would orphan the old rAF loop otherwise), stop drawing
    // once it's no longer attached rather than looping forever unseen.
    const observer = new MutationObserver(() => {
        if (!document.body.contains(canvas)) { stopped = true; observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

/* ---------- results page: tabs / filters / list / detail panel ---------- */

let _fhItems = [];
let _fhUserId = null;
let _fhCoverage = {};
let _fhTab = 'foryou'; // 'foryou' | 'popular'
let _fhSort = null; // null = tab default; 'gain' | 'popularity'
let _fhQuery = '';
let _fhStarMin = 0;
let _fhStarMax = FH_STAR_MAX;
let _fhSelectedId = null;
let _fhFilterDebounce = null;
let _fhPage = 0;
const FH_PAGE_SIZE = 20;

function fhFilteredSorted() {
    const pool = _fhTab === 'popular' ? _fhItems : _fhItems.filter(i => i.category !== 'achieved');
    const q = _fhQuery.trim().toLowerCase();
    let filtered = pool.filter(i => {
        if (i.difficulty_rating != null) {
            if (_fhStarMin > 0 && i.difficulty_rating < _fhStarMin) return false;
            if (_fhStarMax < FH_STAR_MAX && i.difficulty_rating > _fhStarMax) return false;
        }
        if (q) {
            const hay = `${i.title || ''} ${i.artist || ''} ${i.version || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    const sort = _fhSort || (_fhTab === 'popular' ? 'popularity' : 'gain');
    filtered = filtered.slice().sort((a, b) => sort === 'popularity'
        ? b.peer_count - a.peer_count
        : (b.gain ?? -1) - (a.gain ?? -1));
    return filtered;
}

function farmHelperRowRefHtml(item) {
    if (item.category === 'achieved') {
        return `<span class="mods-tag">${escapeHtml(t('farm_helper_peer_count', { n: item.peer_count }))}</span>`;
    }
    return refScoreHtml(item);
}

function farmHelperRowMetricHtml(item) {
    if (item.category === 'achieved') {
        return `<span class="farm-helper-coverage-badge">${item.coverage_pct}% ${escapeHtml(t('farm_helper_coverage_suffix'))}</span>`;
    }
    return `<span class="farm-helper-gain">+${item.gain}pp</span>`;
}

function renderFarmHelperList() {
    const listEl = document.getElementById('farm-helper-list-body');
    if (!listEl) return;
    if (!_fhItems.length) {
        listEl.innerHTML = `<tr><td colspan="4" class="empty-state">${t('farm_helper_no_data')}</td></tr>`;
        updateFhPagination(0);
        return;
    }
    const filtered = fhFilteredSorted();
    const maxPage = Math.max(0, Math.ceil(filtered.length / FH_PAGE_SIZE) - 1);
    if (_fhPage > maxPage) _fhPage = maxPage;
    const start = _fhPage * FH_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + FH_PAGE_SIZE);
    listEl.innerHTML = pageItems.length
        ? pageItems.map(item => `
            <tr class="farm-helper-row farm-helper-row--${item.category}${String(item.beatmap_id) === String(_fhSelectedId) ? ' active' : ''}" onclick="selectFarmHelperItem(${item.beatmap_id})">
                <td><span class="farm-helper-cat farm-helper-cat--${item.category}">${categoryLabel(item.category)}</span></td>
                <td><span class="map-link">${escapeHtml(`${item.artist || ''} - ${item.title || ''} [${item.version || ''}]`)}</span>${item.difficulty_rating != null ? ` <span class="mods-tag">${item.difficulty_rating.toFixed(2)}★</span>` : ''}</td>
                <td>${farmHelperRowRefHtml(item)}</td>
                <td>${farmHelperRowMetricHtml(item)}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" class="empty-state">${t('farm_helper_no_results_filtered')}</td></tr>`;
    updateFhPagination(filtered.length);
}

// Client-side pagination (mania-tracker/rankings-style fixed bottom bar —
// see .pagination in style.css) — this list is fetched/filtered entirely
// client-side (unlike rankings' server paging), so page slicing happens
// here on the already-filtered array rather than a new API call.
function updateFhPagination(totalCount) {
    const pag = document.getElementById('fh-pagination');
    if (!pag) return;
    const maxPage = Math.max(0, Math.ceil(totalCount / FH_PAGE_SIZE) - 1);
    pag.hidden = totalCount <= FH_PAGE_SIZE;
    document.getElementById('fh-page-label').textContent = t('page_label', { n: _fhPage + 1 });
    document.getElementById('fh-prev-page').disabled = _fhPage === 0;
    document.getElementById('fh-next-page').disabled = _fhPage >= maxPage;
}

function targetBoxHtml(item) {
    if (item.category === 'achieved') {
        return `
        <div class="farm-helper-target-box farm-helper-target-box--achieved">
            <div class="farm-helper-target-value">${item.coverage_pct}%</div>
            <div class="farm-helper-target-bar"><div class="farm-helper-target-bar-fill" style="width:100%"></div></div>
            <div class="farm-helper-target-label">${escapeHtml(t('farm_helper_target_progress', { pct: item.coverage_pct }))}</div>
        </div>`;
    }
    const ownPp = item.own_pp || 0;
    const pct = item.peer_pp ? Math.max(0, Math.min(100, Math.round((ownPp / item.peer_pp) * 100))) : 0;
    return `
    <div class="farm-helper-target-box">
        <div class="farm-helper-target-value">+${item.gain}pp</div>
        <div class="farm-helper-target-bar"><div class="farm-helper-target-bar-fill" style="width:${pct}%"></div></div>
        <div class="farm-helper-target-label">${escapeHtml(t('farm_helper_target_median', { pp: item.peer_pp }))}${item.own_pp != null ? ` · ${escapeHtml(t('farm_helper_target_yours', { pp: item.own_pp }))}` : ''}</div>
    </div>`;
}

function competingPeersHtml(item) {
    if (!item.top_peers || !item.top_peers.length) return '';
    return `<div class="farm-helper-peer-list">
        <div class="farm-helper-peer-list-title">${t('farm_helper_who_competing')}</div>
        ${item.top_peers.map(p => `
            <div class="farm-helper-peer-row">
                ${avatarWithFlagHtml(p.avatar_url, null)}
                ${playerLink(p.user_id, p.username)}
                ${gradeBadge(p.rank)}
                <span class="farm-helper-peer-pp">${fmtPP(p.pp)}</span>
            </div>`).join('')}
    </div>`;
}

function feedbackButtonsHtml(item) {
    const loggedInUser = getCtLoggedInUser();
    if (!loggedInUser || String(loggedInUser.id) !== String(_fhUserId) || item.category === 'achieved') return '';
    return `<div class="farm-helper-feedback">
        <button type="button" class="farm-helper-feedback-btn" data-action="hide" data-beatmap="${item.beatmap_id}">
            <strong>${t('farm_helper_too_hard')}</strong><span>${t('farm_helper_too_hard_desc')}</span>
        </button>
        <button type="button" class="farm-helper-feedback-btn${item._easyMarked ? ' active' : ''}" data-action="easy" data-beatmap="${item.beatmap_id}"${item._easyMarked ? ' disabled' : ''}>
            <strong>${t('farm_helper_too_easy')}</strong><span>${t('farm_helper_too_easy_desc')}</span>
        </button>
    </div>`;
}

function renderFarmHelperPanel() {
    const panel = document.getElementById('farm-helper-panel');
    if (!panel) return;
    const item = _fhItems.find(i => String(i.beatmap_id) === String(_fhSelectedId));

    if (!item) {
        panel.innerHTML = `
            <h2 class="farm-helper-panel-title">${t('farm_helper_panel_title')}</h2>
            <p class="farm-helper-panel-sample">${escapeHtml(t('farm_helper_panel_sample', { n: _fhCoverage.peerWindowSize ?? 0, covered: _fhCoverage.peersCovered ?? 0 }))}</p>
            ${categoryExplainerRows()}
            <p class="farm-helper-panel-hint">${t('farm_helper_panel_hint')}</p>
        `;
        return;
    }

    const cover = coverArtUrlCard(item.beatmapset_id);
    panel.innerHTML = `
        <div class="farm-helper-detail-cover"${cover ? ` style="background-image:url('${cover.replace(/'/g, '%27')}')"` : ''}>
            ${osuLinkBtn(item.beatmapset_id)}
        </div>
        <div class="farm-helper-detail-title">${escapeHtml(item.title || '')}</div>
        <div class="farm-helper-detail-artist">${escapeHtml(item.artist || '')} · ${escapeHtml(item.version || '')}</div>
        <div class="farm-helper-detail-stats">
            <span class="farm-helper-cat farm-helper-cat--${item.category}">${categoryLabel(item.category)}</span>
            ${item.difficulty_rating != null ? ` <span class="mods-tag">${item.difficulty_rating.toFixed(2)}★</span>` : ''}
        </div>
        ${targetBoxHtml(item)}
        ${feedbackButtonsHtml(item)}
        ${competingPeersHtml(item)}
        <div class="farm-helper-detail-actions">
            <a class="pill" href="map.html?id=${encodeURIComponent(item.beatmap_id)}">${t('farm_helper_full_analysis')}</a>
        </div>
    `;

    panel.querySelectorAll('.farm-helper-feedback-btn').forEach(btn => {
        btn.addEventListener('click', () => handleFarmHelperFeedback(btn.dataset.beatmap, btn.dataset.action));
    });
}

function selectFarmHelperItem(beatmapId) {
    _fhSelectedId = beatmapId;
    renderFarmHelperList();
    renderFarmHelperPanel();
}

function showFarmHelperToast(msg) {
    let el = document.getElementById('farm-helper-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'farm-helper-toast';
        el.className = 'farm-helper-toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

async function handleFarmHelperFeedback(beatmapId, action) {
    try {
        await apiPost('farm-helper-prefs', { user_id: _fhUserId, beatmap_id: beatmapId, action });
        if (action === 'hide') {
            _fhItems = _fhItems.filter(i => String(i.beatmap_id) !== String(beatmapId));
            if (String(_fhSelectedId) === String(beatmapId)) _fhSelectedId = null;
        } else if (action === 'easy') {
            const item = _fhItems.find(i => String(i.beatmap_id) === String(beatmapId));
            if (item) item._easyMarked = true;
        }
        renderFarmHelperList();
        renderFarmHelperPanel();
        showFarmHelperToast(t('farm_helper_feedback_saved'));
    } catch {
        showFarmHelperToast(t('farm_helper_feedback_failed'));
    }
}

function updateFhStarRangeUI(triggerFilter) {
    const minInput = document.getElementById('fh-star-min');
    const maxInput = document.getElementById('fh-star-max');
    const fill = document.getElementById('fh-star-range-fill');
    const label = document.getElementById('fh-star-range-label');

    let minVal = parseFloat(minInput.value);
    let maxVal = parseFloat(maxInput.value);
    if (minVal > maxVal - 0.2) {
        if (document.activeElement === minInput) { minVal = Math.max(0, maxVal - 0.2); minInput.value = minVal; }
        else { maxVal = Math.min(FH_STAR_MAX, minVal + 0.2); maxInput.value = maxVal; }
    }

    const minPct = (minVal / FH_STAR_MAX) * 100;
    const maxPct = (maxVal / FH_STAR_MAX) * 100;
    fill.style.left = minPct + '%';
    fill.style.width = Math.max(0, maxPct - minPct) + '%';
    minInput.style.zIndex = minVal > (FH_STAR_MAX - maxVal) ? 3 : 2;
    maxInput.style.zIndex = minVal > (FH_STAR_MAX - maxVal) ? 2 : 3;

    label.textContent = (minVal <= 0 && maxVal >= FH_STAR_MAX)
        ? t('star_any')
        : `${minVal.toFixed(1)}–${maxVal >= FH_STAR_MAX ? maxVal.toFixed(0) + '+' : maxVal.toFixed(1)}★`;

    _fhStarMin = minVal;
    _fhStarMax = maxVal;
    if (triggerFilter) { _fhPage = 0; renderFarmHelperList(); }
}

function wireFarmHelperToolbar() {
    document.querySelectorAll('.farm-helper-tabs .pill').forEach(btn => {
        btn.addEventListener('click', () => {
            _fhTab = btn.getAttribute('data-tab');
            _fhPage = 0;
            document.querySelectorAll('.farm-helper-tabs .pill').forEach(b => b.classList.toggle('active', b === btn));
            const metricHeader = document.getElementById('fh-metric-header');
            if (metricHeader) metricHeader.textContent = _fhTab === 'popular' ? t('farm_helper_popularity_col') : t('farm_helper_gain');
            renderFarmHelperList();
        });
    });
    document.getElementById('fh-filter-input').addEventListener('input', (e) => {
        clearTimeout(_fhFilterDebounce);
        _fhFilterDebounce = setTimeout(() => { _fhQuery = e.target.value; _fhPage = 0; renderFarmHelperList(); }, 200);
    });
    document.getElementById('fh-sort-select').addEventListener('change', (e) => {
        _fhSort = e.target.value;
        _fhPage = 0;
        renderFarmHelperList();
    });
    ['fh-star-min', 'fh-star-max'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => updateFhStarRangeUI(true));
    });
    document.getElementById('fh-prev-page').addEventListener('click', () => {
        if (_fhPage > 0) { _fhPage--; renderFarmHelperList(); }
    });
    document.getElementById('fh-next-page').addEventListener('click', () => {
        _fhPage++; renderFarmHelperList();
    });
    updateFhStarRangeUI(false);
}

async function loadFarmHelper() {
    const main = document.getElementById('farm-helper-main');
    const params = new URLSearchParams(location.search);
    const userId = params.get('id');
    if (!userId) {
        document.title = `Catch Tracker — ${t('farm_helper_title')}`;
        renderLanding(main);
        return;
    }

    try {
        const [playerData, farmData] = await Promise.all([
            apiGet('player-get', { user_id: userId }),
            apiGet('farm-helper', { user_id: userId }),
        ]);
        const p = playerData.profile;
        document.title = `Catch Tracker — ${t('farm_helper_title')}: ${p.username || userId}`;
        pushRecentFarmHelper(userId, p.username || userId);

        _fhItems = farmData.items || [];
        _fhUserId = userId;
        _fhCoverage = farmData.coverage || {};
        _fhTab = 'foryou';
        _fhSort = null;
        _fhQuery = '';
        _fhStarMin = 0;
        _fhStarMax = FH_STAR_MAX;
        _fhSelectedId = null;
        _fhPage = 0;

        main.innerHTML = `
            <div class="card profile-header${p.cover_url ? ' has-cover' : ''}"${p.cover_url ? ` style="background-image:url('${p.cover_url.replace(/'/g, '%27')}')"` : ''}>
                ${avatarWithFlagHtml(p.avatar_url, p.country_code)}
                <div>
                    <h1 style="margin:0">${t('farm_helper_title')}</h1>
                    <div class="profile-stats"><span>${escapeHtml(p.username || userId)}</span><span>${fmtPP(p.pp)}</span></div>
                </div>
            </div>
            <p class="coverage-note">${_fhCoverage.inRankings
                ? t('farm_helper_coverage', { n: _fhCoverage.peersCovered ?? 0, total: _fhCoverage.peerWindowSize ?? 0 })
                : t('farm_helper_not_ranked')}</p>
            <p class="farm-helper-disclaimer">${t('farm_helper_disclaimer')}</p>
            <div class="farm-helper-tabs pill-group">
                <button type="button" class="pill active" data-tab="foryou">${t('farm_helper_tab_foryou')}</button>
                <button type="button" class="pill" data-tab="popular">${t('farm_helper_tab_popular')}</button>
            </div>
            <div class="filters">
                <input type="text" id="fh-filter-input" class="search-input" style="width:220px" placeholder="${escapeHtml(t('farm_helper_filter_placeholder'))}">
                <select id="fh-sort-select">
                    <option value="gain">${t('farm_helper_sort_gain')}</option>
                    <option value="popularity">${t('farm_helper_sort_popularity')}</option>
                </select>
                <div class="star-range" id="fh-star-range">
                    <svg class="star-range-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.98 6.04 6.67.97-4.83 4.7 1.14 6.65L12 17.77l-5.96 3.13 1.14-6.65-4.83-4.7 6.67-.97L12 2.5z"/></svg>
                    <span class="star-range-label" id="fh-star-range-label">${t('star_any')}</span>
                    <div class="star-range-track">
                        <div class="star-range-fill" id="fh-star-range-fill"></div>
                        <input type="range" id="fh-star-min" class="star-range-input" min="0" max="${FH_STAR_MAX}" step="0.1" value="0" aria-label="Minimum star rating">
                        <input type="range" id="fh-star-max" class="star-range-input" min="0" max="${FH_STAR_MAX}" step="0.1" value="${FH_STAR_MAX}" aria-label="Maximum star rating">
                    </div>
                </div>
            </div>
            <div class="farm-helper-layout">
                <div class="farm-helper-list-col">
                    <div class="table-wrap">
                        <table>
                            <thead><tr><th>${t('th_category')}</th><th>${t('th_map')}</th><th>${t('farm_helper_ref')}</th><th id="fh-metric-header">${t('farm_helper_gain')}</th></tr></thead>
                            <tbody id="farm-helper-list-body"></tbody>
                        </table>
                    </div>
                </div>
                <div class="farm-helper-panel card" id="farm-helper-panel"></div>
            </div>
            <div class="pagination" id="fh-pagination" hidden>
                <button type="button" id="fh-prev-page">${t('prev')}</button>
                <span id="fh-page-label"></span>
                <button type="button" id="fh-next-page">${t('next')}</button>
            </div>
        `;

        wireFarmHelperToolbar();
        renderFarmHelperList();
        renderFarmHelperPanel();
    } catch (err) {
        main.innerHTML = `<p class="empty-state">${t('farm_helper_failed')}</p>`;
    }
}

loadFarmHelper();
