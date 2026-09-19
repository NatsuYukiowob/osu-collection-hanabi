/* Small shared helpers: grade badge rendering, mod formatting, relative
   time, HTML escaping, and a tiny two-language (zh-Hant / en) i18n layer.
   Ported from catch-tracker's own common.js, trimmed down to what this
   site's v1 pages (Home/Rankings/Feed/Player/Map) actually use — no login,
   replay viewer, Farm Helper, Maps catalog, Skins, Goals, or Discord
   directory yet (see README.md for the full "not built yet" list). Global
   from day one, so unlike catch-tracker's own history there's no
   "originally single-country" caveat here. */

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

/* ---------- i18n ---------- */

const LANG_STRINGS = {
    zh: {
        nav_home: '首頁', nav_rankings: '排行榜', nav_feed: '即時動態',
        loading: '載入中…',
        title_rankings: 'Std Tracker — osu! 全球排名',
        title_feed: 'Std Tracker — 即時動態',
        h1_rankings: 'osu! 排名',
        th_rank: '#', th_player: '玩家', th_pp: 'PP', th_accuracy: '準度', th_playcount: '遊玩次數',
        th_ss: 'SS', th_s: 'S', th_a: 'A',
        settings_title: '設定', theme_title: '主題色',
        settings_hide_players: '隱藏玩家',
        settings_hide_players_hint: '被隱藏的玩家會從全站的排行榜和動態消息中過濾掉，此列表只存在你目前的瀏覽器中。',
        settings_hide_search_placeholder: '輸入玩家名稱後按 Enter',
        settings_no_hidden: '沒有隱藏的玩家。',
        settings_appearance: '外觀',
        settings_custom_cursor: '自訂游標',
        settings_custom_cursor_hint: '在全站將滑鼠游標換成 osu! 風格光標。',
        theme_reset: '重設為預設色',
        coverage_rankings: '追蹤 {n} 位玩家 — 上次更新 {time}',
        coverage_rankings_pending: '追蹤 {n} 位玩家 — 尚未更新',
        empty_rankings: '目前還沒有已追蹤的玩家 — 可能第一次排名掃描尚未完成。',
        failed_rankings: '排行榜載入失敗。',
        filter_all_countries: '所有國家',
        prev: '← 上一頁', next: '下一頁 →', page_label: '第 {n} 頁',

        h1_feed: '即時分數動態',
        filter_any_grade: '任何評級', filter_fc_only: '僅 FC', filter_choke_only: '僅撞/失敗',
        grade_f_fail: 'F（失敗）',
        th_map: '圖譜', th_mods: 'Mods', th_grade: '評級', th_acc: '準度', th_when: '時間',
        coverage_feed: '追蹤 {n} 位玩家 — 上次輪詢 {time}（本輪 {done}/{total}）',
        coverage_feed_pending: '追蹤 {n} 位玩家 — 尚未輪詢',
        empty_feed: '目前還沒有任何成績 — 每 5 分鐘會自動輪詢一次。',
        currently_active: '正在遊玩',
        failed_feed: '動態載入失敗。',
        footer_feed: '每 45 秒自動更新一次。Std Tracker — osu-collection-hanabi 的姊妹站。',

        player_no_id: '未提供玩家 ID。',
        player_not_found: '找不到這位玩家。',
        best_plays: '最佳成績',
        recent_plays: '近期成績（本站已觀測到的）',
        no_best_plays: '尚無可顯示的最佳成績。',
        no_recent_plays: '本站尚未觀測到這位玩家的近期成績。',
        stat_acc: '準度 {acc}', stat_plays: '{n} 次遊玩',

        map_no_id: '未提供圖譜 ID。',
        map_no_scores: '本站尚未在追蹤玩家中觀測到這張圖譜的成績。',
        map_failed: '圖譜統計載入失敗。',
        mapped_by: '圖作者 {creator}',
        grade_distribution: '評級分布',
        mod_usage: 'Mod 使用率',
        tracked_scores: '已追蹤的成績',
        no_data: '尚無資料',
        map_coverage: '僅統計本站在追蹤玩家中觀測到的成績，非完整資料。樣本數 {n}，FC 率 {fc}%。',
        no_scores_short: '無成績資料',

        footer_main: 'Std Tracker — osu-collection-hanabi 的姊妹站。資料來自官方 osu! API。',
        footer_changelog: '更新日誌', footer_feedback: '意見回饋',

        rel_sec: '{n} 秒前', rel_min: '{n} 分鐘前', rel_hr: '{n} 小時前', rel_day: '{n} 天前',

        search_placeholder: '搜尋玩家…',
        search_no_results: '沒有符合的玩家',
        home_tagline: '追蹤全球 osu! 玩家的排名與即時成績。',
        home_top_players: '頂尖玩家',
        home_recent_scores: '最近成績',
        home_played: '遊玩了',
        view_all: '查看全部 →',

        stat_joined: '註冊於 {date}',
        stat_playtime: '遊玩時長 {h} 小時',
        grade_tally: '評級累計',
        most_used_mod: '常用 Mod',
        tab_best: '最佳成績', tab_recent: '近期成績', tab_activity: '活躍度',
        rank_global: '全球排名', rank_country: '國家/地區排名', total_pp: '總表現分',
        stat_sr_distribution: '星數分布', stat_bpm_median: 'BPM 中位數', stat_pp_range: 'PP 區間',
        osu_profile_link: 'osu! 主頁', last_seen_online: '線上中', last_seen_offline: '最後上線 {when}',
        activity_empty: '沒有可顯示的活動資料。',
        activity_hint: '依 osu! 官方每月遊玩次數紀錄繪製；本站自己觀測到的每日紀錄從網站上線才開始累積，之後會愈來愈準。',
        activity_month_count: '{month}：{n} 次遊玩',
        no_best_plays_filtered: '沒有符合篩選條件的成績。',
        filter_any_mod: '任何 Mod', sort_pp: '依 PP', sort_time: '依時間',

        nav_maps: '圖譜庫',
        h1_maps: 'osu! 圖譜庫',
        maps_search_placeholder: '搜尋標題、藝術家、作者…',
        status_any: '全部狀態', status_ranked: 'Ranked', status_loved: 'Loved',
        sort_star_desc: '星數 高→低', sort_star_asc: '星數 低→高',
        sort_bpm_desc: 'BPM 高→低', sort_length_desc: '長度 長→短', sort_newest: '最新上榜',
        coverage_maps: '已收錄 {n} 張圖譜（Ranked {ranked}／Loved {loved}）',
        empty_maps: '沒有符合條件的圖譜。',
        failed_maps: '圖譜庫載入失敗。',
        diff_count_suffix: '譜',
    },
    en: {
        nav_home: 'Home', nav_rankings: 'Rankings', nav_feed: 'Live Feed',
        loading: 'Loading…',
        title_rankings: 'Std Tracker — Global osu! Rankings',
        title_feed: 'Std Tracker — Live Feed',
        h1_rankings: 'osu! Rankings',
        th_rank: '#', th_player: 'Player', th_pp: 'pp', th_accuracy: 'Accuracy', th_playcount: 'Play Count',
        th_ss: 'SS', th_s: 'S', th_a: 'A',
        settings_title: 'Settings', theme_title: 'Theme colour',
        settings_hide_players: 'Hidden players',
        settings_hide_players_hint: 'Hidden players are filtered out of rankings and the live feed everywhere on the site. This list only lives in your own browser.',
        settings_hide_search_placeholder: 'Type a username, press Enter',
        settings_no_hidden: 'No hidden players.',
        settings_appearance: 'Appearance',
        settings_custom_cursor: 'Custom cursor',
        settings_custom_cursor_hint: 'Swap the mouse cursor for an osu!-style ring, site-wide.',
        theme_reset: 'Reset to default',
        coverage_rankings: 'Tracking {n} players — last refreshed {time}',
        coverage_rankings_pending: 'Tracking {n} players — not yet refreshed',
        empty_rankings: 'No ranked players tracked yet — the first rankings sweep may not have run.',
        failed_rankings: 'Failed to load rankings.',
        filter_all_countries: 'All countries',
        prev: '← Prev', next: 'Next →', page_label: 'Page {n}',

        h1_feed: 'Live Score Feed',
        filter_any_grade: 'Any grade', filter_fc_only: 'FC only', filter_choke_only: 'Choke/fail only',
        grade_f_fail: 'F (fail)',
        th_map: 'Map', th_mods: 'Mods', th_grade: 'Grade', th_acc: 'Acc', th_when: 'When',
        coverage_feed: 'Tracking {n} players — last poll {time} ({done}/{total} this sweep)',
        coverage_feed_pending: 'Tracking {n} players — not yet polled',
        empty_feed: 'No scores in the feed yet — the score-poll cron runs every 5 minutes.',
        currently_active: 'Currently playing',
        failed_feed: 'Failed to load feed.',
        footer_feed: 'Auto-refreshes every 45s. Std Tracker — a companion site for osu-collection-hanabi.',

        player_no_id: 'No player id given.',
        player_not_found: 'Player not found.',
        best_plays: 'Best Plays',
        recent_plays: 'Recent Plays (seen by this tracker)',
        no_best_plays: 'No best plays available.',
        no_recent_plays: 'No recent plays observed yet by this tracker.',
        stat_acc: '{acc} acc', stat_plays: '{n} plays',

        map_no_id: 'No map id given.',
        map_no_scores: 'No scores observed yet for this map among tracked players.',
        map_failed: 'Failed to load map stats.',
        mapped_by: 'mapped by {creator}',
        grade_distribution: 'Grade distribution',
        mod_usage: 'Mod usage',
        tracked_scores: 'Tracked scores',
        no_data: 'No data',
        map_coverage: 'Aggregated only from scores observed among tracked players — not exhaustive. Sample size {n}, FC rate {fc}%.',
        no_scores_short: 'No scores',

        footer_main: 'Std Tracker — a companion site for osu-collection-hanabi. Data via the official osu! API.',
        footer_changelog: 'Changelog', footer_feedback: 'Feedback',

        rel_sec: '{n}s ago', rel_min: '{n}m ago', rel_hr: '{n}h ago', rel_day: '{n}d ago',

        search_placeholder: 'Search players…',
        search_no_results: 'No matching players',
        home_tagline: 'Tracking osu! players worldwide — rankings and live scores.',
        home_top_players: 'Top Players',
        home_recent_scores: 'Recent Scores',
        home_played: 'played',
        view_all: 'View all →',

        stat_joined: 'Joined {date}',
        stat_playtime: '{h}h play time',
        grade_tally: 'Grade Tally',
        most_used_mod: 'Most-used Mod',
        tab_best: 'Best Plays', tab_recent: 'Recent Plays', tab_activity: 'Activity',
        rank_global: 'Global Rank', rank_country: 'Country Rank', total_pp: 'Total PP',
        stat_sr_distribution: 'SR Distribution', stat_bpm_median: 'BPM Median', stat_pp_range: 'PP Range',
        osu_profile_link: 'osu! profile', last_seen_online: 'Online now', last_seen_offline: 'Last seen {when}',
        activity_empty: 'No activity data to show.',
        activity_hint: "Drawn from osu!'s own official monthly playcount history; our own day-level tracking only started from this site's launch, so it'll get more precise over time.",
        activity_month_count: '{month}: {n} plays',
        no_best_plays_filtered: 'No best plays match this filter.',
        filter_any_mod: 'Any mod', sort_pp: 'By PP', sort_time: 'By time',

        nav_maps: 'Maps',
        h1_maps: 'osu! Map Catalog',
        maps_search_placeholder: 'Search title, artist, creator…',
        status_any: 'Any status', status_ranked: 'Ranked', status_loved: 'Loved',
        sort_star_desc: 'Stars high→low', sort_star_asc: 'Stars low→high',
        sort_bpm_desc: 'BPM high→low', sort_length_desc: 'Length long→short', sort_newest: 'Newest',
        coverage_maps: '{n} maps indexed (Ranked {ranked} / Loved {loved})',
        empty_maps: 'No maps match these filters.',
        failed_maps: 'Failed to load the map catalog.',
        diff_count_suffix: ' diffs',
    },
};

function getLang() {
    try {
        const saved = localStorage.getItem('st_lang');
        if (saved === 'zh' || saved === 'en') return saved;
    } catch { /* ignore */ }
    return 'zh';
}

function setLang(lang) {
    try { localStorage.setItem('st_lang', lang); } catch { /* ignore */ }
    location.reload();
}

function t(key, vars) {
    const lang = getLang();
    let str = (LANG_STRINGS[lang] && LANG_STRINGS[lang][key]) ?? LANG_STRINGS.en[key] ?? key;
    if (vars) for (const k in vars) str = str.replace(`{${k}}`, vars[k]);
    return str;
}

/* Applies every [data-i18n] element's textContent from the string table —
   called once on page load after common.js/api.js are loaded but before
   the page's own render-*.js populates dynamic content. */
function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    const toggle = document.getElementById('lang-toggle');
    if (toggle) {
        const lang = getLang();
        toggle.textContent = lang === 'zh' ? 'EN' : '中文';
        toggle.addEventListener('click', () => setLang(lang === 'zh' ? 'en' : 'zh'));
    }
    document.documentElement.lang = getLang() === 'zh' ? 'zh-Hant' : 'en';
}
applyStaticI18n();

/* ---------- grade badges / mods / relative time ---------- */

// A small hue ladder used only for the grade FILTER pills (feed.html), which
// stay plain colored text/pills; kept separate from gradeBadge() below,
// which renders osu!'s own official icons instead.
const GRADE_COLORS = {
    XH: '#e2e2f0', X: '#facc15', SH: '#e2e2f0', S: '#facc15',
    A: '#34d399', B: '#38bdf8', C: '#fb923c', D: '#fb5a8c', F: '#f6584f',
};

// Official osu! rank badge SVGs, self-hosted (not hotlinked) — same
// artwork/rationale as catch-tracker's own gradeBadge(): pulled straight
// from osu.ppy.sh's own site CSS, one file per VALID_GRADES entry
// (_std-constants.js): XH X SH S A B C D F.
function gradeBadge(grade) {
    const g = grade || '?';
    if (!/^(XH|X|SH|S|A|B|C|D|F)$/.test(g)) return `<span class="grade-badge grade-badge--text">${escapeHtml(g)}</span>`;
    return `<img class="grade-badge" src="assets/grades/${g}.svg" alt="${escapeHtml(g)}">`;
}

function fcTag(isFc) {
    return isFc ? '<span class="fc-tag">FC</span>' : '';
}

// Real osu! mod-select hexagon artwork, self-hosted — same asset set as
// catch-tracker's own modHexHtml(). No selection-mod-nomod.png exists
// in-game either — NM (and anything not in this set) falls back to a flat
// text chip instead of a missing image.
const MOD_ICON_FILES = new Set([
    'EZ', 'NF', 'HT', 'DC', 'HR', 'SD', 'PF', 'HD', 'FL', 'DT', 'NC',
    'RX', 'AP', 'AT', 'CN', 'SO', 'MR', 'RD', 'SV2', 'TP',
]);

function modHexHtml(acronym) {
    if (MOD_ICON_FILES.has(acronym)) {
        return `<img class="mod-icon" src="assets/mods/${acronym}.png" alt="${escapeHtml(acronym)}" title="${escapeHtml(acronym)}" loading="lazy">`;
    }
    return `<span class="mod-hex" title="${escapeHtml(acronym)}">${escapeHtml(acronym)}</span>`;
}

function modsTag(mods) {
    const list = mods && mods.length ? mods : ['NM'];
    return `<span class="mods-tag-group">${list.map(modHexHtml).join('')}</span>`;
}

// mostUsedMod.mod (see player-get.js) is a run-together combo like "DTHD"
// (mods.sort().join('') with no separator) — split back into 2-char
// acronyms so each still gets its own hex chip.
function modComboHexHtml(combo) {
    if (!combo) return modHexHtml('NM');
    const parts = combo.match(/.{1,2}/g) || [combo];
    return `<span class="mods-tag-group">${parts.map(modHexHtml).join('')}</span>`;
}

function relTime(iso) {
    if (!iso) return '—';
    const diffMs = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diffMs)) return '—';
    const sec = Math.max(0, Math.floor(diffMs / 1000));
    if (sec < 60) return t('rel_sec', { n: sec });
    const min = Math.floor(sec / 60);
    if (min < 60) return t('rel_min', { n: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t('rel_hr', { n: hr });
    const day = Math.floor(hr / 24);
    return t('rel_day', { n: day });
}

function fmtPP(pp) {
    return pp != null ? `${Math.round(pp)}pp` : '—';
}

function fmtAccuracy(acc) {
    return acc != null ? `${(acc * 100).toFixed(2)}%` : '—';
}

function fmtLength(seconds) {
    if (seconds == null) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function playerLink(userId, username) {
    return `<a class="player-link" href="player.html?id=${encodeURIComponent(userId)}">${escapeHtml(username || userId)}</a>`;
}

function mapLink(beatmapId, label) {
    return `<a class="map-link" href="map.html?id=${encodeURIComponent(beatmapId)}">${escapeHtml(label)}</a>`;
}

// A table's map-column <td> with the beatmap's own cover art fading in as a
// banner behind the cell content (see .map-banner-cell in style.css) —
// ported from catch-tracker's own mapBannerCell(). innerHtml is usually a
// mapLink() call.
function mapBannerCell(beatmapsetId, innerHtml) {
    const cover = coverArtUrlCard(beatmapsetId);
    const style = cover ? ` style="background-image:url('${cover.replace(/'/g, '%27')}')"` : '';
    return `<td class="map-banner-cell"${style}><div class="map-banner-cell-inner">${innerHtml}</div></td>`;
}

// osu!'s stable beatmapset-cover CDN pattern — no extra API call needed,
// every feed/score record already carries beatmapset_id.
function coverArtUrl(beatmapsetId) {
    return beatmapsetId ? `https://assets.ppy.sh/beatmaps/${beatmapsetId}/covers/cover.jpg` : '';
}

// osu!'s "card" cover variant — purpose-cropped to a ~2.8:1 banner, used for
// the map-banner-cell background above.
function coverArtUrlCard(beatmapsetId) {
    return beatmapsetId ? `https://assets.ppy.sh/beatmaps/${beatmapsetId}/covers/card.jpg` : '';
}

/* ---------- map catalog: status badge + per-diff icon ----------
   Ported from catch-tracker's own common.js. Small inline-SVG status
   badges matching osu!'s own iconography (blue double-chevron for ranked,
   pink heart for loved) instead of a plain text pill. */
const STATUS_ICONS = {
    ranked: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 14 12 8 18 14"></polyline><polyline points="6 20 12 14 18 20"></polyline></svg>',
    loved: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-6.716-4.35-9.428-8.014C.29 9.86 1.1 6.2 4.2 4.9c2.1-.88 4.42-.1 5.8 1.62C11.38 4.8 13.7 4.02 15.8 4.9c3.1 1.3 3.91 4.96 1.63 8.086C18.716 16.65 12 21 12 21z"/></svg>',
};
function statusIcon(status) {
    const svg = STATUS_ICONS[status];
    return svg ? `<span class="status-icon ${status}" title="${escapeHtml(status)}">${svg}</span>` : '';
}
// `.map-status-badge` is absolutely positioned by default (pinned to a
// cover thumbnail's top-left corner), so any call site that isn't sitting
// inside a positioned cover container needs `inline: true`.
function statusBadge(status, inline) {
    if (!STATUS_ICONS[status]) return '';
    const label = status === 'ranked' ? t('status_ranked') : t('status_loved');
    return `<span class="map-status-badge${inline ? ' map-status-badge--inline' : ''} ${status}">${escapeHtml(label)}${statusIcon(status)}</span>`;
}

// Star-rating colour scale, ported verbatim from catch-tracker's own
// common.js (itself from the main site's js/osu.js) so difficulty icons
// read as visually "the same language" across sites.
const STD_ICON_PATH = '<circle cx="50" cy="50" r="41"/><circle cx="50" cy="50" r="20" fill="currentColor" stroke="none"/>';
const STAR_COLOR_STOPS = [
    [0.1, [79, 192, 255]],
    [1.25, [79, 192, 255]],
    [2.0, [79, 255, 213]],
    [2.5, [124, 255, 79]],
    [3.3, [246, 240, 92]],
    [4.2, [255, 128, 104]],
    [4.9, [255, 78, 111]],
    [5.8, [198, 69, 184]],
    [6.7, [101, 99, 222]],
    [7.7, [24, 21, 142]],
    [9.0, [0, 0, 0]],
];
function liftForContrast(rgb, minLum = 92) {
    const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    if (lum >= minLum) return rgb;
    const r = (minLum - lum) / (255 - lum);
    return rgb.map(v => v + (255 - v) * r);
}
function rgbHex(rgb) {
    return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function starRatingColor(stars) {
    stars = Number(stars) || 0;
    const stops = STAR_COLOR_STOPS;
    if (stars <= 0) return '#888';
    if (stars <= stops[0][0]) return rgbHex(liftForContrast(stops[0][1]));
    for (let i = 1; i < stops.length; i++) {
        if (stars <= stops[i][0]) {
            const [s0, c0] = stops[i - 1];
            const [s1, c1] = stops[i];
            const frac = (stars - s0) / (s1 - s0);
            return rgbHex(liftForContrast(c0.map((v, idx) => v + (c1[idx] - v) * frac)));
        }
    }
    return rgbHex(liftForContrast(stops[stops.length - 1][1]));
}
function diffIcon(beatmapId, stars, label) {
    const color = starRatingColor(stars);
    const starsStr = (Number(stars) || 0).toFixed(2);
    const title = label ? `${label} ${starsStr} ★` : `${starsStr} ★`;
    return `<a class="diff-icon" href="map.html?id=${encodeURIComponent(beatmapId)}" title="${escapeHtml(title)}" onclick="event.stopPropagation()" style="color:${color}">
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6">${STD_ICON_PATH}</svg>
    </a>`;
}

/* ---------- country flags ----------
   HatScripts/circle-flags (github.com/HatScripts/circle-flags, MIT license,
   ISO 3166-1 alpha-2 filenames) via jsDelivr's GitHub-raw proxy — same CDN
   catch-tracker uses. */
function flagUrl(countryCode) {
    return countryCode ? `https://cdn.jsdelivr.net/gh/HatScripts/circle-flags/flags/${countryCode.toLowerCase()}.svg` : '';
}

function avatarWithFlagHtml(avatarUrl, countryCode, avatarClass) {
    const flag = flagUrl(countryCode);
    const cls = avatarClass ? `avatar ${avatarClass}` : 'avatar';
    return `<span class="avatar-with-flag">
        <img class="${cls}" src="${escapeHtml(avatarUrl || '')}" alt="">
        ${flag ? `<img class="avatar-flag-badge" src="${flag}" alt="${escapeHtml(countryCode)}" onerror="this.style.display='none';">` : ''}
    </span>`;
}

/* ---------- header player search ---------- */

function initPlayerSearch() {
    const toggle = document.getElementById('lang-toggle');
    if (!toggle || !toggle.parentElement) return;

    const wrap = document.createElement('div');
    wrap.className = 'search-wrap';
    wrap.innerHTML = `
        <input type="text" id="player-search-input" class="search-input" placeholder="${escapeHtml(t('search_placeholder'))}" autocomplete="off">
        <div class="search-results" id="player-search-results" hidden></div>
    `;
    toggle.parentElement.insertBefore(wrap, toggle);

    const input = wrap.querySelector('#player-search-input');
    const results = wrap.querySelector('#player-search-results');
    let debounceTimer = null;

    async function runSearch(q) {
        try {
            const data = await apiGet('rankings-list', { q, limit: 8 });
            if (!data.items.length) {
                results.innerHTML = `<div class="search-empty">${escapeHtml(t('search_no_results'))}</div>`;
            } else {
                results.innerHTML = data.items.map(r => `
                    <a class="search-result-row" href="player.html?id=${encodeURIComponent(r.user_id)}">
                        ${avatarWithFlagHtml(r.avatar_url, r.country_code)}
                        <span>${escapeHtml(r.username)}</span>
                        <span class="search-result-pp">${fmtPP(r.pp)}</span>
                    </a>`).join('');
            }
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
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) results.hidden = true; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { results.hidden = true; input.blur(); } });
}
// common.js is loaded at the end of <body>, after the header markup, so the
// DOM is already parsed — no need to wait for DOMContentLoaded here.
initPlayerSearch();
