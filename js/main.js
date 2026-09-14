/* ===== Maintenance banner =====
   Manual on/off switch for a site-wide "we're mid-change" notice — flip
   MAINTENANCE_BANNER_ENABLED to true and redeploy to show it, flip back to
   false when done. A visitor who closes it won't see it again (tracked in
   localStorage, not sessionStorage — the point is not re-nagging them on
   their next visit, not just for the rest of this tab). The key has a
   version suffix so a *new* maintenance notice later can reset everyone's
   dismissal just by bumping it, without needing new code elsewhere. */
const MAINTENANCE_BANNER_ENABLED = false;
const MAINTENANCE_BANNER_DISMISSED_KEY = 'maintenance_banner_dismissed_v1';

function initMaintenanceBanner() {
    if (!MAINTENANCE_BANNER_ENABLED) return;
    if (localStorage.getItem(MAINTENANCE_BANNER_DISMISSED_KEY) === '1') return;
    const banner = document.getElementById('maintenance-banner');
    if (banner) banner.style.display = 'flex';
}

function dismissMaintenanceBanner() {
    localStorage.setItem(MAINTENANCE_BANNER_DISMISSED_KEY, '1');
    const banner = document.getElementById('maintenance-banner');
    if (banner) banner.style.display = 'none';
}

/* ===== Tab switching ===== */
function switchTab(tab, el) {
    document.querySelectorAll('.site-page').forEach(p => p.style.display = 'none');
    const page = document.getElementById('page-' + tab);
    page.style.display = 'block';
    // Force a reflow so removing+re-adding the class restarts the CSS
    // animation even when switching back to a tab that already has it.
    page.classList.remove('page-fade-in');
    void page.offsetWidth;
    page.classList.add('page-fade-in');
    document.querySelectorAll('.site-nav-btn').forEach(b => b.classList.remove('active'));
    if (el) {
        el.classList.add('active');
        if (!el.classList.contains('site-topnav-btn')) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
    // Keep the persistent desktop top-nav highlight in sync however the tab
    // was switched (drawer button, explore card, deep link, …).
    document.querySelectorAll('#site-topnav [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'skins' && typeof renderSkinsList === 'function') renderSkinsList();
    if (tab === 'skins' && typeof renderCloudSkinsList === 'function') renderCloudSkinsList();
    if (tab === 'updates') ensureUpdatesLoaded();
    if (tab === 'mapper-tracking' && typeof renderTrackedMappersList === 'function') renderTrackedMappersList();
    if (tab === 'tournaments') ensureTournamentsLoaded();
    if (tab === 'public-collections') ensurePublicCollectionsLoaded();
    if (tab === 'farm-maps') ensureFarmMapsLoaded();
    if (tab === 'catalog') ensureCatalogLoaded();
    if (tab === 'mappools' && typeof ensureMappoolsLoaded === 'function') ensureMappoolsLoaded();
    if (tab === 'cmpool' && typeof ensureCmpoolLoaded === 'function') ensureCmpoolLoaded();
    if (tab === 'games' && typeof ensureGamesLoaded === 'function') ensureGamesLoaded();
    if (tab === 'skin-screenshots') ensureSkinScreenshotsLoaded();
    // Chat polls on a timer only while its own tab is visible — started/
    // stopped here on every tab switch (not just the lazy first-load other
    // ensureXLoaded() calls do) since leaving and returning to the tab
    // should resume polling, not just load once per session.
    if (tab === 'chat' && typeof ensureChatLoaded === 'function') ensureChatLoaded();
    if (tab !== 'chat' && typeof stopChatPolling === 'function') stopChatPolling();
    // Same start/stop-on-tab-switch reasoning as chat above — dm.js decides
    // internally whether that means polling the conversation list or an
    // open thread.
    if (tab === 'dm' && typeof ensureDmLoaded === 'function') ensureDmLoaded();
    if (tab !== 'dm' && typeof stopDmPolling === 'function') stopDmPolling();
    // Tab buttons now live in the slide-in drawer — picking one should also
    // dismiss it.
    if (typeof closeNavDrawer === 'function') closeNavDrawer();
}

/* ===== ☰ Navigation drawer =====
   The 12 tab buttons moved out of the old horizontal .site-nav bar into a
   right-side slide-in drawer (#nav-drawer + #nav-drawer-scrim in
   index.html, styling in css/base.css). Open/close mirror the language
   dropdown's outside-click / Escape pattern below; the panel starts
   [hidden] (display:none) and the .open class drives the CSS transform
   transition, so the class add has to land a frame after `hidden` is
   cleared or there's nothing to animate from. On close we wait for the
   slide-out transition before re-hiding (with a timeout backstop for
   prefers-reduced-motion, where the transition is suppressed and
   `transitionend` never fires). */
function openNavDrawer() {
    const drawer = document.getElementById('nav-drawer');
    const scrim = document.getElementById('nav-drawer-scrim');
    const btn = document.getElementById('nav-menu-btn');
    if (!drawer || !scrim) return;
    drawer.hidden = false;
    scrim.hidden = false;
    requestAnimationFrame(() => {
        drawer.classList.add('open');
        scrim.classList.add('open');
    });
    if (btn) btn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onNavDrawerEscape);
    drawer.querySelector('.site-nav-btn')?.focus();
}
function closeNavDrawer() {
    const drawer = document.getElementById('nav-drawer');
    const scrim = document.getElementById('nav-drawer-scrim');
    const btn = document.getElementById('nav-menu-btn');
    if (!drawer || !scrim || drawer.hidden) return;
    drawer.classList.remove('open');
    scrim.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onNavDrawerEscape);
    let done = false;
    const hide = () => {
        if (done) return;
        done = true;
        drawer.hidden = true;
        scrim.hidden = true;
        drawer.removeEventListener('transitionend', hide);
    };
    drawer.addEventListener('transitionend', hide);
    setTimeout(hide, 400);
    if (btn) btn.focus();
}
function onNavDrawerEscape(e) {
    if (e.key === 'Escape') closeNavDrawer();
}

/* ===== 🌐 Language Dropdown ===== */
function toggleLangMenu(forceOpen) {
    const wrap = document.getElementById('lang-globe');
    const btn = document.getElementById('lang-globe-btn');
    const header = document.querySelector('.site-header');
    if (!wrap || !btn) return;
    const open = typeof forceOpen === 'boolean' ? forceOpen : !wrap.classList.contains('open');
    wrap.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (header) header.classList.toggle('lang-menu-open', open);
    if (open) {
        document.addEventListener('click', onLangMenuOutsideClick);
        document.addEventListener('keydown', onLangMenuEscape);
    } else {
        document.removeEventListener('click', onLangMenuOutsideClick);
        document.removeEventListener('keydown', onLangMenuEscape);
    }
}
function onLangMenuOutsideClick(e) {
    if (!e.target.closest('#lang-globe')) toggleLangMenu(false);
}
function onLangMenuEscape(e) {
    if (e.key === 'Escape') toggleLangMenu(false);
}

/* ===== ✉️ Contact info dropdown ===== (same open/outside-click/Escape
   pattern as the language dropdown above) */
function toggleContactMenu(forceOpen) {
    const wrap = document.getElementById('contact-info');
    const btn = document.getElementById('contact-info-btn');
    const header = document.querySelector('.site-header');
    if (!wrap || !btn) return;
    const open = typeof forceOpen === 'boolean' ? forceOpen : !wrap.classList.contains('open');
    wrap.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (header) header.classList.toggle('contact-menu-open', open);
    if (open) {
        document.addEventListener('click', onContactMenuOutsideClick);
        document.addEventListener('keydown', onContactMenuEscape);
    } else {
        document.removeEventListener('click', onContactMenuOutsideClick);
        document.removeEventListener('keydown', onContactMenuEscape);
    }
}
function onContactMenuOutsideClick(e) {
    if (!e.target.closest('#contact-info')) toggleContactMenu(false);
}
function onContactMenuEscape(e) {
    if (e.key === 'Escape') toggleContactMenu(false);
}

/* ===== ✨ Changelog dropdown ===== (same open/outside-click/Escape pattern
   as the language/contact dropdowns above). Content is the manually
   maintained SITE_CHANGELOG list — see js/site-changelog-data.js. */
function toggleChangelogMenu(forceOpen) {
    const wrap = document.getElementById('site-changelog');
    const btn = document.getElementById('site-changelog-btn');
    const header = document.querySelector('.site-header');
    if (!wrap || !btn) return;
    const open = typeof forceOpen === 'boolean' ? forceOpen : !wrap.classList.contains('open');
    wrap.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (header) header.classList.toggle('changelog-menu-open', open);
    if (open) {
        document.addEventListener('click', onChangelogMenuOutsideClick);
        document.addEventListener('keydown', onChangelogMenuEscape);
    } else {
        document.removeEventListener('click', onChangelogMenuOutsideClick);
        document.removeEventListener('keydown', onChangelogMenuEscape);
    }
}
function onChangelogMenuOutsideClick(e) {
    if (!e.target.closest('#site-changelog')) toggleChangelogMenu(false);
}
function onChangelogMenuEscape(e) {
    if (e.key === 'Escape') toggleChangelogMenu(false);
}
function renderChangelogMenu() {
    const menu = document.getElementById('site-changelog-menu');
    if (!menu) return;
    const entries = typeof SITE_CHANGELOG !== 'undefined' ? SITE_CHANGELOG : [];
    if (!entries.length) {
        menu.innerHTML = `<div class="changelog-empty">${escHtml(t('site_changelog_title'))}</div>`;
        return;
    }
    menu.innerHTML = entries.map(entry => `
        <div class="changelog-entry">
            <div class="changelog-entry-date">${escHtml(entry.date)}</div>
            <ul class="changelog-entry-list">
                ${entry.items.map(item => `<li>${escHtml(item)}</li>`).join('')}
            </ul>
        </div>`).join('');
}

/* ===== Re-render already-rendered dynamic content after a language switch =====
   The collection grid bakes t()-driven strings (mapped_by, empty-state text)
   into its innerHTML at render time, so a language switch needs a re-render
   to pick up the new strings — same reasoning as the main site's
   refreshDynamicContent() for quiz content. */
function refreshDynamicContent() {
    renderOsuCollection();
    if (visitorLookupUserId) renderPpHistoryChart(null, ppHistoryKeyFor(visitorLookupUserId), 'visitor-pp-history-panel');
    if (typeof renderSkinsList === 'function') renderSkinsList();
    if (typeof renderPublicCollectionsList === 'function') renderPublicCollectionsList();
    if (typeof updatePublishButtonLabel === 'function') updatePublishButtonLabel();
    if (typeof renderTrackButtonState === 'function') renderTrackButtonState();
    if (typeof renderTrackedPlayersList === 'function') renderTrackedPlayersList();
    if (typeof renderTrackedMappersList === 'function') renderTrackedMappersList();
    if (typeof renderResourcesList === 'function') renderResourcesList();
    if (typeof renderNotificationBell === 'function') renderNotificationBell();
    if (typeof renderFarmMapsList === 'function') renderFarmMapsList();
    if (typeof refreshCatalogLocalized === 'function') refreshCatalogLocalized();
    if (typeof refreshMappoolsLocalized === 'function') refreshMappoolsLocalized();
    if (typeof refreshGamesLocalized === 'function') refreshGamesLocalized();
    if (typeof refreshTrendingLocalized === 'function') refreshTrendingLocalized();
}

/* ===== Keyboard shortcuts =====
   `/` or Ctrl/Cmd+K opens the global search (js/global-search.js) from
   anywhere, like GitHub/Slack/Notion's own search shortcut — a plain
   document-level keydown listener, since there's nothing else on the page
   competing for either binding. Ignored while typing in any input/
   textarea/select/contenteditable (so `/` still types a literal slash in,
   say, a chat message or the collection search box) and while a modal is
   already open (its own Escape handler already owns the keyboard then). */
function onGlobalShortcutKeydown(e) {
    const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
    const isCtrlK = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey;
    if (!isSlash && !isCtrlK) return;

    const target = e.target;
    const tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
    if (document.querySelector('.pp-calc-modal-overlay[style*="flex"]')) return;

    e.preventDefault();
    if (typeof openGlobalSearch === 'function') openGlobalSearch();
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', onGlobalShortcutKeydown);
    if (typeof renderStaticIcons === 'function') renderStaticIcons();
    if (typeof wireModalHowto === 'function') wireModalHowto();
    if (typeof renderChangelogMenu === 'function') renderChangelogMenu();
    applyLang(siteLang);
    initMaintenanceBanner();
    // Top up language/genre for collection sets saved before that feature —
    // capped + paced inside; delayed so it yields to first paint.
    setTimeout(() => { if (typeof backfillOsuLanguages === 'function') backfillOsuLanguages(); }, 3000);
    checkImportFromHash();
    checkOsuLoginFromUrl();
    if (typeof checkGalleryDeepLink === 'function') checkGalleryDeepLink();
    if (typeof checkCmpoolDeepLink === 'function') checkCmpoolDeepLink();
    if (typeof checkGamesDeepLink === 'function') checkGamesDeepLink();
    if (typeof renderTrackedPlayersList === 'function') renderTrackedPlayersList();
    if (typeof initNotifications === 'function') initNotifications();
    // "為你更新" digest — runs after notifications so it can count what just
    // landed; its own network calls are gated (PP at most every 6h).
    setTimeout(() => { if (typeof renderCollectionDigest === 'function') renderCollectionDigest(); }, 1200);
    // 熱門新曲 — a discovery nice-to-have, yields to everything above it.
    setTimeout(() => { if (typeof loadTrendingSongs === 'function') loadTrendingSongs(); }, 1500);
});
