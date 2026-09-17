/* Site-wide ⚙️ settings drawer + 🎨 accent theme picker (mania-tracker's
   header icons — see catch-tracker-mania-parity-2026-09 Phase 4). Injected
   into every page's header by this one script (loaded after common.js on
   every .html file) rather than hand-duplicating the markup per page,
   matching how the login pill/lang-toggle already work.

   Covers only what has a real catch-tracker equivalent: a per-browser
   "hide this player" blocklist (mania's own 篩選 tab) applied to rankings/
   feed, a custom-cursor toggle (mania's 外觀 tab), and the accent colour
   picker (mania's separate 🎨 icon). Mania's note-shape/scroll-direction/
   scroll-speed settings have no catch equivalent and are skipped; replay
   playback settings (volume/rate/background dim/blur) already live in
   replay.html's own always-visible top bar and settings drawer — kept
   there rather than duplicated here, since they're only meaningful mid-
   replay anyway. */

const CT_HIDDEN_KEY = 'ct_hidden_players';
const CT_ACCENT_KEY = 'ct_accent_color';
const CT_CURSOR_KEY = 'ct_custom_cursor';

const CT_THEME_SWATCHES = [
    '#fb5a8c', '#f6584f', '#fb923c', '#f7c948', '#84cc16', '#34d399',
    '#22d3ee', '#38bdf8', '#8b5cf6', '#a855f7', '#ec4899', '#94a3b8',
];

function ctLoadHiddenPlayers() {
    try { return JSON.parse(localStorage.getItem(CT_HIDDEN_KEY)) || []; } catch { return []; }
}
function ctSaveHiddenPlayers(list) {
    try { localStorage.setItem(CT_HIDDEN_KEY, JSON.stringify(list)); } catch { /* per-browser convenience only */ }
}
// Exposed for render-rankings.js / render-feed.js to filter rows against.
function isPlayerHidden(username) {
    if (!username) return false;
    const lower = username.toLowerCase();
    return ctLoadHiddenPlayers().some(u => u.toLowerCase() === lower);
}
window.isPlayerHidden = isPlayerHidden;

// Confirmed live against mania-tracker.com's own 主題色 picker: picking a
// swatch retints the whole dark background wash (nav bar, page background,
// cards), not just small text/link accents — its default reddish-maroon
// background IS just its own accent hue tinting these same dark surfaces.
// Reproduced the same way: color-mix() the chosen colour into each of our
// existing near-black surface tones (light percentage, so it stays dark —
// this recolours, it doesn't lighten).
const CT_BG_BASE = {
    '--bg': '#07070f',
    '--bg-elevated': '#0c0c1c',
    '--bg-card': '#121224',
    '--bg-card-hover': '#17172c',
    '--border': '#23234a',
};
// A handful of buttons paint solid `var(--accent)` as their OWN background
// (not just a soft tint) with a hardcoded white icon/text on top — e.g. the
// replay page's ▶ play button and pp badge. A light custom accent (a real
// bug report: "背景顏色是變白色時，有些按鈕是會變全白而看不到該按鈕的功能")
// then puts white-on-near-white, making the icon unreadable. Rather than
// pick per-button fallback colours, compute ONE contrasting foreground here
// (simple relative-luminance threshold — good enough for a UI pick, not a
// WCAG-precise calculation) and expose it as `--accent-fg` for any of those
// buttons to use instead of a hardcoded `#fff`.
function ctContrastingFg(color) {
    const m = /^#([0-9a-f]{6})$/i.exec(color);
    if (!m) return '#fff';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.6 ? '#12121c' : '#fff';
}
function ctApplyAccent() {
    try {
        const color = localStorage.getItem(CT_ACCENT_KEY);
        const root = document.documentElement.style;
        if (color) {
            root.setProperty('--accent', color);
            root.setProperty('--primary', color);
            root.setProperty('--accent-fg', ctContrastingFg(color));
            root.setProperty('--bg', `color-mix(in srgb, ${color} 12%, ${CT_BG_BASE['--bg']})`);
            root.setProperty('--bg-elevated', `color-mix(in srgb, ${color} 14%, ${CT_BG_BASE['--bg-elevated']})`);
            root.setProperty('--bg-card', `color-mix(in srgb, ${color} 12%, ${CT_BG_BASE['--bg-card']})`);
            root.setProperty('--bg-card-hover', `color-mix(in srgb, ${color} 14%, ${CT_BG_BASE['--bg-card-hover']})`);
            root.setProperty('--border', `color-mix(in srgb, ${color} 20%, ${CT_BG_BASE['--border']})`);
        }
    } catch { /* ignore */ }
}
function ctResetAccent() {
    const root = document.documentElement.style;
    ['--accent', '--primary', '--accent-fg', '--bg', '--bg-elevated', '--bg-card', '--bg-card-hover', '--border'].forEach(p => root.removeProperty(p));
}
ctApplyAccent(); // run immediately (not just after injectUI) to minimise flash-of-default-colour

function ctApplyCursor() {
    try {
        document.documentElement.classList.toggle('ct-custom-cursor', localStorage.getItem(CT_CURSOR_KEY) === '1');
    } catch { /* ignore */ }
}
ctApplyCursor();

function ctRenderHiddenList() {
    const list = document.getElementById('ct-hidden-list');
    if (!list) return;
    const hidden = ctLoadHiddenPlayers();
    list.innerHTML = hidden.length
        ? hidden.map(name => `
            <div class="ct-hidden-row">
                <span>${escapeHtml(name)}</span>
                <button type="button" class="ct-hidden-remove" data-name="${escapeHtml(name)}" aria-label="remove">✕</button>
            </div>`).join('')
        : `<p class="ct-settings-hint">${t('settings_no_hidden')}</p>`;
}

function ctInjectPanels() {
    const overlay = document.createElement('div');
    overlay.className = 'ct-settings-overlay';
    overlay.id = 'ct-settings-overlay';
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'ct-settings-panel';
    panel.id = 'ct-settings-panel';
    panel.hidden = true;
    panel.innerHTML = `
        <div class="ct-settings-header">
            <h2>${t('settings_title')}</h2>
            <button type="button" class="ct-settings-close" id="ct-settings-close" aria-label="close">✕</button>
        </div>
        <div class="ct-settings-section">
            <h3>${t('settings_hide_players')}</h3>
            <input type="text" class="ct-hidden-search" id="ct-hidden-search" placeholder="${escapeHtml(t('settings_hide_search_placeholder'))}">
            <p class="ct-settings-hint">${t('settings_hide_players_hint')}</p>
            <div class="ct-hidden-list" id="ct-hidden-list"></div>
        </div>
        <div class="ct-settings-section">
            <h3>${t('settings_appearance')}</h3>
            <div class="ct-settings-toggle-row">
                <div>
                    <div>${t('settings_custom_cursor')}</div>
                    <p class="ct-settings-hint">${t('settings_custom_cursor_hint')}</p>
                </div>
                <input type="checkbox" id="ct-cursor-toggle">
            </div>
        </div>
    `;

    const themePopover = document.createElement('div');
    themePopover.className = 'ct-theme-popover';
    themePopover.id = 'ct-theme-popover';
    themePopover.hidden = true;
    themePopover.innerHTML = `
        <div class="ct-theme-swatches">
            ${CT_THEME_SWATCHES.map(c => `<button type="button" class="ct-theme-swatch" style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join('')}
        </div>
        <div class="ct-theme-custom-row">
            <input type="color" id="ct-theme-custom">
            <span>${t('theme_title')}</span>
        </div>
        <button type="button" class="ct-theme-reset" id="ct-theme-reset">${t('theme_reset')}</button>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    document.body.appendChild(themePopover);

    document.getElementById('ct-hidden-search').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const val = e.target.value.trim();
        if (!val) return;
        const hidden = ctLoadHiddenPlayers();
        if (!hidden.some(u => u.toLowerCase() === val.toLowerCase())) {
            hidden.push(val);
            ctSaveHiddenPlayers(hidden);
            ctRenderHiddenList();
        }
        e.target.value = '';
    });
    document.getElementById('ct-hidden-list').addEventListener('click', (e) => {
        const btn = e.target.closest('.ct-hidden-remove');
        if (!btn) return;
        const name = btn.getAttribute('data-name');
        ctSaveHiddenPlayers(ctLoadHiddenPlayers().filter(u => u !== name));
        ctRenderHiddenList();
    });

    const cursorToggle = document.getElementById('ct-cursor-toggle');
    cursorToggle.checked = localStorage.getItem(CT_CURSOR_KEY) === '1';
    cursorToggle.addEventListener('change', () => {
        try { localStorage.setItem(CT_CURSOR_KEY, cursorToggle.checked ? '1' : '0'); } catch { /* ignore */ }
        ctApplyCursor();
    });

    function closeSettings() { overlay.hidden = true; panel.hidden = true; }
    overlay.addEventListener('click', closeSettings);
    document.getElementById('ct-settings-close').addEventListener('click', closeSettings);

    function setAccent(color) {
        try { localStorage.setItem(CT_ACCENT_KEY, color); } catch { /* ignore */ }
        ctApplyAccent();
        themePopover.querySelectorAll('.ct-theme-swatch').forEach(s => s.classList.toggle('active', s.getAttribute('data-color') === color));
    }
    themePopover.querySelector('.ct-theme-swatches').addEventListener('click', (e) => {
        const btn = e.target.closest('.ct-theme-swatch');
        if (btn) setAccent(btn.getAttribute('data-color'));
    });
    const customInput = document.getElementById('ct-theme-custom');
    customInput.addEventListener('input', () => setAccent(customInput.value));
    document.getElementById('ct-theme-reset').addEventListener('click', () => {
        try { localStorage.removeItem(CT_ACCENT_KEY); } catch { /* ignore */ }
        ctResetAccent();
        themePopover.querySelectorAll('.ct-theme-swatch').forEach(s => s.classList.remove('active'));
    });

    const savedAccent = (() => { try { return localStorage.getItem(CT_ACCENT_KEY); } catch { return null; } })();
    if (savedAccent) {
        customInput.value = /^#[0-9a-f]{6}$/i.test(savedAccent) ? savedAccent : '#fb5a8c';
        themePopover.querySelectorAll('.ct-theme-swatch').forEach(s => s.classList.toggle('active', s.getAttribute('data-color') === savedAccent));
    }

    ctRenderHiddenList();

    return { overlay, panel, themePopover };
}

function ctInjectHeaderButtons(refs) {
    const header = document.querySelector('header.site-header');
    if (!header) return;
    const anchor = document.getElementById('lang-toggle') || header.querySelector('nav');
    if (!anchor) return;

    const wrap = document.createElement('div');
    wrap.className = 'ct-header-tools';
    wrap.innerHTML = `
        <button type="button" class="ct-icon-btn" id="ct-settings-open" title="${escapeHtml(t('settings_title'))}">⚙️</button>
        <button type="button" class="ct-icon-btn" id="ct-theme-open" title="${escapeHtml(t('theme_title'))}">🎨</button>
    `;
    anchor.parentNode.insertBefore(wrap, anchor);

    document.getElementById('ct-settings-open').addEventListener('click', () => {
        refs.overlay.hidden = false;
        refs.panel.hidden = false;
        ctRenderHiddenList();
    });
    document.getElementById('ct-theme-open').addEventListener('click', () => {
        refs.themePopover.hidden = !refs.themePopover.hidden;
    });
    document.addEventListener('click', (e) => {
        if (refs.themePopover.hidden) return;
        if (e.target.closest('#ct-theme-popover') || e.target.closest('#ct-theme-open')) return;
        refs.themePopover.hidden = true;
    });
    wrap.querySelector('#ct-theme-open').insertAdjacentElement('afterend', refs.themePopover);
}

(function ctInitSettingsPanel() {
    if (!document.querySelector('header.site-header')) return; // e.g. replay.html has its own header-less theater
    const refs = ctInjectPanels();
    ctInjectHeaderButtons(refs);
})();
