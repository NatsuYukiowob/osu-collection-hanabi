/* Site-wide ⚙️ settings drawer + 🎨 accent theme picker. Ported from
   catch-tracker's own settings-panel.js (mania-tracker parity feature) —
   injected into every page's header by this one script rather than
   hand-duplicating the markup per page, matching how the search box/
   lang-toggle already work.

   Covers a per-browser "hide this player" blocklist applied to rankings/
   feed, a custom-cursor toggle, and the accent colour picker. */

const ST_HIDDEN_KEY = 'st_hidden_players';
const ST_ACCENT_KEY = 'st_accent_color';
const ST_CURSOR_KEY = 'st_custom_cursor';

const ST_THEME_SWATCHES = [
    '#fb5a8c', '#f6584f', '#fb923c', '#f7c948', '#84cc16', '#34d399',
    '#22d3ee', '#38bdf8', '#8b5cf6', '#a855f7', '#ec4899', '#94a3b8',
];

function stLoadHiddenPlayers() {
    try { return JSON.parse(localStorage.getItem(ST_HIDDEN_KEY)) || []; } catch { return []; }
}
function stSaveHiddenPlayers(list) {
    try { localStorage.setItem(ST_HIDDEN_KEY, JSON.stringify(list)); } catch { /* per-browser convenience only */ }
}
// Exposed for render-rankings.js / render-feed.js to filter rows against.
function isPlayerHidden(username) {
    if (!username) return false;
    const lower = username.toLowerCase();
    return stLoadHiddenPlayers().some(u => u.toLowerCase() === lower);
}
window.isPlayerHidden = isPlayerHidden;

// Picking a swatch retints the whole dark background wash (nav bar, page
// background, cards), not just small text/link accents — color-mix() the
// chosen colour into each existing near-black surface tone (light
// percentage, so it stays dark — this recolours, it doesn't lighten).
const ST_BG_BASE = {
    '--bg': '#07070f',
    '--bg-elevated': '#0c0c1c',
    '--bg-card': '#121224',
    '--bg-card-hover': '#17172c',
    '--border': '#23234a',
};
// A handful of buttons paint solid `var(--accent)` as their OWN background
// with a hardcoded white icon/text on top. A light custom accent then puts
// white-on-near-white, making the icon unreadable. Rather than pick
// per-button fallback colours, compute ONE contrasting foreground here
// (simple relative-luminance threshold) and expose it as `--accent-fg` for
// any of those buttons to use instead of a hardcoded `#fff`.
function stContrastingFg(color) {
    const m = /^#([0-9a-f]{6})$/i.exec(color);
    if (!m) return '#fff';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.6 ? '#12121c' : '#fff';
}
// `--accent`/`--primary` aren't just a button fill — plenty of rules across
// style.css also paint TEXT, icons, and borders directly in this colour
// against the site's own near-black background. A dark custom pick then
// goes dark-text-on-dark-bg and reads as fully invisible. Nudge the colour
// toward white in steps, preserving its hue, until it clears a legible
// luminance floor against the dark UI; only used to derive what actually
// gets applied below, never mutates the raw pick shown back in the
// swatch/`<input>`.
function stReadableAccent(color) {
    const m = /^#([0-9a-f]{6})$/i.exec(color);
    if (!m) return color;
    const n = parseInt(m[1], 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const luminanceOf = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    let guard = 0;
    while (luminanceOf(r, g, b) < 0.32 && guard++ < 12) {
        r += (255 - r) * 0.15;
        g += (255 - g) * 0.15;
        b += (255 - b) * 0.15;
    }
    const clamp = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
    return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}
function stApplyAccent() {
    try {
        const color = localStorage.getItem(ST_ACCENT_KEY);
        const root = document.documentElement.style;
        if (color) {
            const readable = stReadableAccent(color);
            root.setProperty('--accent', readable);
            root.setProperty('--primary', readable);
            root.setProperty('--accent-fg', stContrastingFg(readable));
            // Background tints stay keyed off the RAW pick (mixed at only
            // 12-20% into an already-dark base, so a dark hue's own
            // darkness never hurts legibility here — only the text/icon
            // colour above needed the floor).
            root.setProperty('--bg', `color-mix(in srgb, ${color} 12%, ${ST_BG_BASE['--bg']})`);
            root.setProperty('--bg-elevated', `color-mix(in srgb, ${color} 14%, ${ST_BG_BASE['--bg-elevated']})`);
            root.setProperty('--bg-card', `color-mix(in srgb, ${color} 12%, ${ST_BG_BASE['--bg-card']})`);
            root.setProperty('--bg-card-hover', `color-mix(in srgb, ${color} 14%, ${ST_BG_BASE['--bg-card-hover']})`);
            root.setProperty('--border', `color-mix(in srgb, ${color} 20%, ${ST_BG_BASE['--border']})`);
        }
    } catch { /* ignore */ }
}
function stResetAccent() {
    const root = document.documentElement.style;
    ['--accent', '--primary', '--accent-fg', '--bg', '--bg-elevated', '--bg-card', '--bg-card-hover', '--border'].forEach(p => root.removeProperty(p));
}
stApplyAccent(); // run immediately (not just after injectUI) to minimise flash-of-default-colour

function stApplyCursor() {
    try {
        document.documentElement.classList.toggle('ct-custom-cursor', localStorage.getItem(ST_CURSOR_KEY) === '1');
    } catch { /* ignore */ }
}
stApplyCursor();

function stRenderHiddenList() {
    const list = document.getElementById('st-hidden-list');
    if (!list) return;
    const hidden = stLoadHiddenPlayers();
    list.innerHTML = hidden.length
        ? hidden.map(name => `
            <div class="ct-hidden-row">
                <span>${escapeHtml(name)}</span>
                <button type="button" class="ct-hidden-remove" data-name="${escapeHtml(name)}" aria-label="remove">✕</button>
            </div>`).join('')
        : `<p class="ct-settings-hint">${t('settings_no_hidden')}</p>`;
}

function stInjectPanels() {
    const overlay = document.createElement('div');
    overlay.className = 'ct-settings-overlay';
    overlay.id = 'st-settings-overlay';
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'ct-settings-panel';
    panel.id = 'st-settings-panel';
    panel.hidden = true;
    panel.innerHTML = `
        <div class="ct-settings-header">
            <h2>${t('settings_title')}</h2>
            <button type="button" class="ct-settings-close" id="st-settings-close" aria-label="close">✕</button>
        </div>
        <div class="ct-settings-section">
            <h3>${t('settings_hide_players')}</h3>
            <input type="text" class="ct-hidden-search" id="st-hidden-search" placeholder="${escapeHtml(t('settings_hide_search_placeholder'))}">
            <p class="ct-settings-hint">${t('settings_hide_players_hint')}</p>
            <div class="ct-hidden-list" id="st-hidden-list"></div>
        </div>
        <div class="ct-settings-section">
            <h3>${t('settings_appearance')}</h3>
            <div class="ct-settings-toggle-row">
                <div>
                    <div>${t('settings_custom_cursor')}</div>
                    <p class="ct-settings-hint">${t('settings_custom_cursor_hint')}</p>
                </div>
                <input type="checkbox" id="st-cursor-toggle">
            </div>
        </div>
    `;

    const themePopover = document.createElement('div');
    themePopover.className = 'ct-theme-popover';
    themePopover.id = 'st-theme-popover';
    themePopover.hidden = true;
    themePopover.innerHTML = `
        <div class="ct-theme-swatches">
            ${ST_THEME_SWATCHES.map(c => `<button type="button" class="ct-theme-swatch" style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join('')}
        </div>
        <div class="ct-theme-custom-row">
            <input type="color" id="st-theme-custom">
            <span>${t('theme_title')}</span>
        </div>
        <button type="button" class="ct-theme-reset" id="st-theme-reset">${t('theme_reset')}</button>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    document.body.appendChild(themePopover);

    document.getElementById('st-hidden-search').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const val = e.target.value.trim();
        if (!val) return;
        const hidden = stLoadHiddenPlayers();
        if (!hidden.some(u => u.toLowerCase() === val.toLowerCase())) {
            hidden.push(val);
            stSaveHiddenPlayers(hidden);
            stRenderHiddenList();
        }
        e.target.value = '';
    });
    document.getElementById('st-hidden-list').addEventListener('click', (e) => {
        const btn = e.target.closest('.ct-hidden-remove');
        if (!btn) return;
        const name = btn.getAttribute('data-name');
        stSaveHiddenPlayers(stLoadHiddenPlayers().filter(u => u !== name));
        stRenderHiddenList();
    });

    const cursorToggle = document.getElementById('st-cursor-toggle');
    cursorToggle.checked = localStorage.getItem(ST_CURSOR_KEY) === '1';
    cursorToggle.addEventListener('change', () => {
        try { localStorage.setItem(ST_CURSOR_KEY, cursorToggle.checked ? '1' : '0'); } catch { /* ignore */ }
        stApplyCursor();
    });

    function closeSettings() { overlay.hidden = true; panel.hidden = true; }
    overlay.addEventListener('click', closeSettings);
    document.getElementById('st-settings-close').addEventListener('click', closeSettings);

    function setAccent(color) {
        try { localStorage.setItem(ST_ACCENT_KEY, color); } catch { /* ignore */ }
        stApplyAccent();
        themePopover.querySelectorAll('.ct-theme-swatch').forEach(s => s.classList.toggle('active', s.getAttribute('data-color') === color));
    }
    themePopover.querySelector('.ct-theme-swatches').addEventListener('click', (e) => {
        const btn = e.target.closest('.ct-theme-swatch');
        if (btn) setAccent(btn.getAttribute('data-color'));
    });
    const customInput = document.getElementById('st-theme-custom');
    customInput.addEventListener('input', () => setAccent(customInput.value));
    document.getElementById('st-theme-reset').addEventListener('click', () => {
        try { localStorage.removeItem(ST_ACCENT_KEY); } catch { /* ignore */ }
        stResetAccent();
        themePopover.querySelectorAll('.ct-theme-swatch').forEach(s => s.classList.remove('active'));
    });

    const savedAccent = (() => { try { return localStorage.getItem(ST_ACCENT_KEY); } catch { return null; } })();
    if (savedAccent) {
        customInput.value = /^#[0-9a-f]{6}$/i.test(savedAccent) ? savedAccent : '#fb5a8c';
        themePopover.querySelectorAll('.ct-theme-swatch').forEach(s => s.classList.toggle('active', s.getAttribute('data-color') === savedAccent));
    }

    stRenderHiddenList();

    return { overlay, panel, themePopover };
}

function stInjectHeaderButtons(refs) {
    const header = document.querySelector('header.site-header');
    if (!header) return;
    const anchor = document.getElementById('lang-toggle') || header.querySelector('nav');
    if (!anchor) return;

    const wrap = document.createElement('div');
    wrap.className = 'ct-header-tools';
    wrap.innerHTML = `
        <button type="button" class="ct-icon-btn" id="st-settings-open" title="${escapeHtml(t('settings_title'))}">⚙️</button>
        <button type="button" class="ct-icon-btn" id="st-theme-open" title="${escapeHtml(t('theme_title'))}">🎨</button>
    `;
    anchor.parentNode.insertBefore(wrap, anchor);

    document.getElementById('st-settings-open').addEventListener('click', () => {
        refs.overlay.hidden = false;
        refs.panel.hidden = false;
        stRenderHiddenList();
    });
    document.getElementById('st-theme-open').addEventListener('click', () => {
        refs.themePopover.hidden = !refs.themePopover.hidden;
    });
    document.addEventListener('click', (e) => {
        if (refs.themePopover.hidden) return;
        if (e.target.closest('#st-theme-popover') || e.target.closest('#st-theme-open')) return;
        refs.themePopover.hidden = true;
    });
    wrap.querySelector('#st-theme-open').insertAdjacentElement('afterend', refs.themePopover);
}

(function stInitSettingsPanel() {
    if (!document.querySelector('header.site-header')) return;
    const refs = stInjectPanels();
    stInjectHeaderButtons(refs);
})();
