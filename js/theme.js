/* ===== 🎨 Accent colour picker =====
   Replaced the old dark/light #theme-toggle switch 2026-09-13 — the site
   is dark-only now, and a visitor recolours it themselves instead (same
   idea as catch-tracker/js/settings-panel.js's ctApplyAccent(): color-mix()
   the chosen colour into the existing near-black surfaces so it retints the
   whole background wash, not just links/buttons). */
const ACCENT_KEY = 'osu_accent_color';
const ACCENT_SWATCHES = [
    '#f472b6', '#fb7185', '#fb923c', '#facc15', '#84cc16', '#34d399',
    '#22d3ee', '#38bdf8', '#818cf8', '#a78bfa', '#e879f9', '#94a3b8',
];

// The literal hex/rgba values from css/theme.css's :root block — color-mix()
// blends the chosen accent into these, it never replaces them outright, so
// the shell stays dark regardless of how bright a colour is picked.
const ACCENT_BG_BASE = {
    '--bg': '#0b0b10',
    '--bg-body-1': '#0b0b10',
    '--bg-body-2': '#0b0b10',
    '--bg-body-3': '#0c0c12',
    '--bg-card': '#17141c',
    '--bg-input': '#1c1922',
    '--border': 'rgba(255,255,255,0.08)',
    '--border-card': 'rgba(255,255,255,0.11)',
};
// Full-strength accent tokens — set straight to the picked colour rather
// than color-mixed, same as ctApplyAccent()'s --accent/--primary.
const ACCENT_DIRECT_PROPS = ['--pink', '--pink-bright', '--text-pink', '--accent-pink', '--accent-purple'];

function hexToRgbString(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '244, 114, 182';
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function getAccentColor() {
    try { return localStorage.getItem(ACCENT_KEY); } catch { return null; }
}

function applyAccent(color) {
    const root = document.documentElement.style;
    if (!color) {
        Object.keys(ACCENT_BG_BASE).forEach(p => root.removeProperty(p));
        ACCENT_DIRECT_PROPS.forEach(p => root.removeProperty(p));
        root.removeProperty('--accent-light-purple');
        root.removeProperty('--pink-rgb');
        root.removeProperty('--accent-pink-rgb');
        root.removeProperty('--accent-purple-rgb');
        return;
    }
    const rgb = hexToRgbString(color);
    ACCENT_DIRECT_PROPS.forEach(p => root.setProperty(p, color));
    root.setProperty('--accent-light-purple', `color-mix(in srgb, ${color} 65%, white)`);
    root.setProperty('--pink-rgb', rgb);
    root.setProperty('--accent-pink-rgb', rgb);
    root.setProperty('--accent-purple-rgb', rgb);
    Object.entries(ACCENT_BG_BASE).forEach(([prop, base]) => {
        root.setProperty(prop, `color-mix(in srgb, ${color} 12%, ${base})`);
    });
}
applyAccent(getAccentColor()); // run immediately (deferred script, but still pre-paint) to minimise flash-of-default-colour

function setAccentColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    try { localStorage.setItem(ACCENT_KEY, color); } catch { /* per-browser convenience only */ }
    applyAccent(color);
    renderAccentPickerState();
}
function resetAccentColor() {
    try { localStorage.removeItem(ACCENT_KEY); } catch { /* ignore */ }
    applyAccent(null);
    renderAccentPickerState();
}
function renderAccentPickerState() {
    const current = getAccentColor();
    document.querySelectorAll('.accent-swatch').forEach(s => s.classList.toggle('active', s.getAttribute('data-color') === current));
    const customInput = document.getElementById('accent-picker-custom');
    if (customInput && /^#[0-9a-f]{6}$/i.test(current || '')) customInput.value = current;
}

/* ===== Accent picker dropdown ===== (same open/outside-click/Escape
   pattern as the language/contact dropdowns in js/main.js) */
function toggleAccentPicker(forceOpen) {
    const wrap = document.getElementById('accent-picker');
    const btn = document.getElementById('accent-picker-btn');
    const header = document.querySelector('.site-header');
    if (!wrap || !btn) return;
    const open = typeof forceOpen === 'boolean' ? forceOpen : !wrap.classList.contains('open');
    wrap.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (header) header.classList.toggle('accent-picker-open', open);
    if (open) {
        renderAccentPickerState();
        document.addEventListener('click', onAccentPickerOutsideClick);
        document.addEventListener('keydown', onAccentPickerEscape);
    } else {
        document.removeEventListener('click', onAccentPickerOutsideClick);
        document.removeEventListener('keydown', onAccentPickerEscape);
    }
}
function onAccentPickerOutsideClick(e) {
    if (!e.target.closest('#accent-picker')) toggleAccentPicker(false);
}
function onAccentPickerEscape(e) {
    if (e.key === 'Escape') toggleAccentPicker(false);
}
