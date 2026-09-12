/* Small shared helpers: grade badge rendering, mod formatting, relative
   time, HTML escaping, and a tiny two-language (zh-Hant / en) i18n layer.
   This is a plain-HTML companion site (see the implementation plan for why
   it doesn't reuse the main site's full 8-locale i18n machinery) — just a
   flat string table. Originally Taiwan-only (hence zh as the default
   language); expanded 2026-09 to global rankings, but the owner/primary
   audience is still Taiwan-based, so zh stays the default — en is the
   fallback for everyone else. */

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

/* ---------- i18n ---------- */

const LANG_STRINGS = {
    zh: {
        nav_rankings: '排行榜', nav_feed: '即時動態',
        loading: '載入中…',
        title_rankings: 'Catch Tracker — osu!catch 全球排名',
        title_feed: 'Catch Tracker — 即時動態',
        h1_rankings: 'osu!catch 排名',
        th_rank: '#', th_player: '玩家', th_pp: 'PP', th_accuracy: '準度', th_playcount: '遊玩次數',
        coverage_rankings: '追蹤 {n} 位 catch 玩家 — 上次更新 {time}',
        coverage_rankings_pending: '追蹤 {n} 位 catch 玩家 — 尚未更新',
        empty_rankings: '目前還沒有已追蹤的 catch 玩家 — 可能第一次排名掃描尚未完成。',
        failed_rankings: '排行榜載入失敗。',
        filter_all_countries: '所有國家',
        prev: '← 上一頁', next: '下一頁 →', page_label: '第 {n} 頁',
        login_with_osu: '使用 osu! 登入',
        logout: '登出',
        login_failed: '登入失敗，請再試一次',

        h1_feed: '即時分數動態',
        filter_any_grade: '任何評級', filter_fc_only: '僅 FC', filter_choke_only: '僅撞/失敗',
        grade_f_fail: 'F（失敗）',
        th_map: '圖譜', th_mods: 'Mods', th_grade: '評級', th_acc: '準度', th_pp: 'PP', th_when: '時間',
        coverage_feed: '追蹤 {n} 位玩家 — 上次輪詢 {time}（本輪 {done}/{total}）',
        coverage_feed_pending: '追蹤 {n} 位玩家 — 尚未輪詢',
        empty_feed: '目前還沒有任何成績 — 每 5 分鐘會自動輪詢一次。',
        currently_active: '正在遊玩',
        failed_feed: '動態載入失敗。',
        footer_feed: '每 45 秒自動更新一次。Catch Tracker — osu-collection-hanabi 的姊妹站。',

        player_no_id: '未提供玩家 ID。',
        player_not_found: '找不到這位玩家。',
        best_plays: '最佳成績',
        recent_plays: '近期成績（本站已觀測到的）',
        no_best_plays: '尚無可顯示的最佳成績。',
        no_recent_plays: '本站尚未觀測到這位玩家的近期成績。',
        stat_country: '{code} #{n}', stat_global: '全球 #{n}', stat_acc: '準度 {acc}', stat_plays: '{n} 次遊玩',

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

        footer_main: 'Catch Tracker — osu-collection-hanabi 的姊妹站。資料來自官方 osu! API。',
        footer_changelog: '更新日誌', footer_feedback: '意見回饋',

        nav_farm_helper: '刷圖助手',
        farm_helper_view: '查看刷圖建議',
        farm_helper_title: '刷圖助手',
        farm_helper_category_new: '未打過',
        farm_helper_category_improve: '可提升',
        farm_helper_ref: '參考成績',
        farm_helper_gain: '預估 PP',
        th_category: '分類',
        farm_helper_coverage: '同儕資料涵蓋 {n}/{total} 位鄰近玩家',
        farm_helper_not_ranked: '這位玩家尚未在追蹤的排行榜中，無法計算同儕比較。',
        farm_helper_disclaimer: '推薦依據是附近排名玩家的真實成績，不是難度試算；同儕資料仍在陸續建立中，涵蓋越完整、推薦越準確。只比對雙方的最佳 100 筆成績，可能遺漏你打過但分數不夠高的圖。',
        farm_helper_no_data: '目前還沒有推薦——可能同儕資料還在建立中，或你已經超前附近的玩家了。',
        farm_helper_no_id: '未提供玩家 ID。',
        farm_helper_failed: '刷圖助手載入失敗。',
        farm_helper_landing_title: '值得刷的圖譜',
        farm_helper_my_own: '查看我（{username}）的刷圖建議 →',
        farm_helper_landing_for: '為',
        farm_helper_recent: '最近查看',
        farm_helper_explainer_title: '依據附近 pp 玩家的成績，推薦：',
        farm_helper_desc_new: '附近玩家很熱門，你還沒打過的圖',
        farm_helper_desc_improve: '你有成績，但附近玩家的分數更高',
        farm_helper_category_achieved: '已達成',
        farm_helper_desc_achieved: '附近玩家也在打，你已經達到水準',
        farm_helper_tab_foryou: '為你推薦',
        farm_helper_tab_popular: '熱門',
        farm_helper_sort_gain: '排序：pp 提升',
        farm_helper_sort_popularity: '排序：熱門程度',
        farm_helper_popularity_col: '熱門度',
        farm_helper_filter_placeholder: '篩選圖譜…',
        farm_helper_peer_count: '{n} 位同儕在打',
        farm_helper_coverage_suffix: '涵蓋',
        farm_helper_panel_title: '你在跟誰比較',
        farm_helper_panel_sample: '樣本：附近 {n} 位玩家（已涵蓋 {covered} 位）',
        farm_helper_panel_hint: '點選左側的圖譜，查看詳細分析',
        farm_helper_target_median: '同儕目標 {pp}pp',
        farm_helper_target_yours: '你的成績 {pp}pp',
        farm_helper_target_progress: '{pct}% 的鄰近玩家已打過這張',
        farm_helper_too_hard: '太難了',
        farm_helper_too_hard_desc: '超出你的水平，會從推薦中隱藏，直到你打出成績',
        farm_helper_too_easy: '太簡單',
        farm_helper_too_easy_desc: '低於你的水平，目標分會定得更高',
        farm_helper_who_competing: '誰在爭這張',
        farm_helper_full_analysis: '完整分析 →',
        farm_helper_no_results_filtered: '沒有符合篩選條件的圖譜',
        farm_helper_feedback_saved: '已更新推薦偏好',
        farm_helper_feedback_failed: '更新失敗，請再試一次',
        remove: '移除',

        rel_sec: '{n} 秒前', rel_min: '{n} 分鐘前', rel_hr: '{n} 小時前', rel_day: '{n} 天前',

        search_placeholder: '搜尋玩家…',
        search_no_results: '沒有符合的玩家',
        highlight_best_plays: '近期最佳成績',
        stat_joined: '註冊於 {date}',
        stat_playtime: '遊玩時長 {h} 小時',
        grade_tally: '評級累計',
        most_used_mod: '常用 Mod',
        newest_best: '最新的最佳成績',
        oldest_best: '最舊的最佳成績',
        view_all: '查看全部 →',
        tab_about: '關于', tab_activity: '活躍度',
        rank_global: '全球排名', rank_country: '國家/地區排名', total_pp: '總表現分',
        rank_delta_days: '{n}天內',
        stat_sr_distribution: '星數分布', stat_bpm_median: 'BPM 中位數', stat_pp_range: 'PP 區間',
        osu_profile_link: 'osu! 主頁', last_seen_online: '線上中', last_seen_offline: '最後上線 {when}',
        about_empty: '這位玩家還沒有寫個人簡介。',
        activity_empty: '沒有可顯示的活動資料。',
        activity_hint: '依 osu! 官方每月遊玩次數紀錄繪製；本站自己觀測到的每日紀錄從 2026 年 9 月才開始累積，之後會愈來愈準。',
        activity_month_count: '{month}：{n} 次遊玩',
        no_best_plays_filtered: '沒有符合篩選條件的成績。',
        filter_any_mod: '任何 Mod', sort_pp: '依 PP', sort_time: '依時間',

        nav_maps: '圖譜庫',
        h1_maps: 'osu!catch 圖譜庫',
        maps_search_placeholder: '搜尋標題、藝術家、作者…',
        status_any: '全部狀態', status_ranked: 'Ranked', status_loved: 'Loved',
        sort_star_desc: '星數 高→低', sort_star_asc: '星數 低→高',
        sort_bpm_desc: 'BPM 高→低', sort_length_desc: '長度 長→短', sort_newest: '最新上榜',
        coverage_maps: '已收錄 {n} 張圖譜（Ranked {ranked}／Loved {loved}）',
        empty_maps: '沒有符合條件的圖譜。',
        failed_maps: '圖譜庫載入失敗。',
        diff_count_suffix: '譜',
        star_any: '任何星數',

        nav_skins: '皮膚',
        h1_skins: 'osu! 皮膚',
        coverage_skins: '已收錄 {n} 個皮膚',
        skins_upload_toggle: '上傳皮膚',
        skins_upload_title: '上傳皮膚',
        skins_upload_note: '任何人都能上傳，不需要登入。請只上傳你有權分享的皮膚。',
        skins_name_placeholder: '皮膚名稱',
        skins_uploader_placeholder: '你的名字（選填）',
        skins_file_label: '.osk 檔案（最大 3MB）',
        skins_preview_label: '預覽圖片（選填，JPEG/PNG，最大 1.5MB）',
        skins_submit: '送出',
        skins_uploading: '上傳中…',
        skins_upload_success: '上傳成功！',
        skins_upload_failed: '上傳失敗：{msg}',
        skins_missing_name: '請輸入皮膚名稱',
        skins_missing_file: '請選擇 .osk 檔案',
        skins_file_too_large: '檔案超過 {mb}MB 上限',
        skins_search_placeholder: '搜尋皮膚或上傳者…',
        sort_downloads: '下載次數',
        sort_size: '檔案大小', skins_filter_mine: '我的上傳',
        skins_by: '由 {name} 上傳',
        skins_downloads_count: '{n} 次下載',
        skins_download_btn: '下載',
        empty_skins: '目前還沒有任何皮膚，當第一個上傳的人吧！',
        failed_skins: '皮膚列表載入失敗。',
    },
    en: {
        nav_rankings: 'Rankings', nav_feed: 'Live Feed',
        loading: 'Loading…',
        title_rankings: 'Catch Tracker — Global osu!catch Rankings',
        title_feed: 'Catch Tracker — Live Feed',
        h1_rankings: 'osu!catch Rankings',
        th_rank: '#', th_player: 'Player', th_pp: 'pp', th_accuracy: 'Accuracy', th_playcount: 'Play Count',
        coverage_rankings: 'Tracking {n} catch players — last refreshed {time}',
        coverage_rankings_pending: 'Tracking {n} catch players — not yet refreshed',
        empty_rankings: 'No ranked catch players tracked yet — the first rankings sweep may not have run.',
        failed_rankings: 'Failed to load rankings.',
        filter_all_countries: 'All countries',
        prev: '← Prev', next: 'Next →', page_label: 'Page {n}',
        login_with_osu: 'Login with osu!',
        logout: 'Logout',
        login_failed: 'Login failed, please try again',

        h1_feed: 'Live Score Feed',
        filter_any_grade: 'Any grade', filter_fc_only: 'FC only', filter_choke_only: 'Choke/fail only',
        grade_f_fail: 'F (fail)',
        th_map: 'Map', th_mods: 'Mods', th_grade: 'Grade', th_acc: 'Acc', th_pp: 'pp', th_when: 'When',
        coverage_feed: 'Tracking {n} players — last poll {time} ({done}/{total} this sweep)',
        coverage_feed_pending: 'Tracking {n} players — not yet polled',
        empty_feed: 'No scores in the feed yet — the score-poll cron runs every 5 minutes.',
        currently_active: 'Currently playing',
        failed_feed: 'Failed to load feed.',
        footer_feed: 'Auto-refreshes every 45s. Catch Tracker — a companion site for osu-collection-hanabi.',

        player_no_id: 'No player id given.',
        player_not_found: 'Player not found.',
        best_plays: 'Best Plays',
        recent_plays: 'Recent Plays (seen by this tracker)',
        no_best_plays: 'No best plays available.',
        no_recent_plays: 'No recent plays observed yet by this tracker.',
        stat_country: '#{n} {code}', stat_global: '#{n} global', stat_acc: '{acc} acc', stat_plays: '{n} plays',

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

        footer_main: 'Catch Tracker — a companion site for osu-collection-hanabi. Data via the official osu! API.',
        footer_changelog: 'Changelog', footer_feedback: 'Feedback',

        nav_farm_helper: 'Farm Helper',
        farm_helper_view: 'View farm recommendations',
        farm_helper_title: 'Farm Helper',
        farm_helper_category_new: 'New',
        farm_helper_category_improve: 'Improve',
        farm_helper_ref: 'Reference score',
        farm_helper_gain: 'Est. PP',
        th_category: 'Category',
        farm_helper_coverage: 'Peer data covers {n}/{total} nearby players',
        farm_helper_not_ranked: 'This player isn’t in the tracked rankings yet, so peer comparison isn’t available.',
        farm_helper_disclaimer: 'Recommendations use nearby-ranked players’ real scores, not a difficulty estimate; peer data is still being built up, so coverage (and accuracy) improves over time. Only compares each side’s top 100 scores, so a map you’ve played but scored low on can be missed.',
        farm_helper_no_data: 'No recommendations yet — peer data may still be building, or you’re already ahead of nearby players.',
        farm_helper_no_id: 'No player id given.',
        farm_helper_failed: 'Failed to load the farm helper.',
        farm_helper_landing_title: 'Maps worth farming',
        farm_helper_my_own: 'View my ({username}) farm recommendations →',
        farm_helper_landing_for: 'for',
        farm_helper_recent: 'Recent',
        farm_helper_explainer_title: 'Based on what nearby-pp players are scoring:',
        farm_helper_desc_new: 'Popular among nearby players, you haven’t played it',
        farm_helper_desc_improve: 'You have a score, but nearby players are scoring higher',
        farm_helper_category_achieved: 'Achieved',
        farm_helper_desc_achieved: 'Nearby players are playing this too — you’re already there',
        farm_helper_tab_foryou: 'For You',
        farm_helper_tab_popular: 'Popular',
        farm_helper_sort_gain: 'Sort: pp gain',
        farm_helper_sort_popularity: 'Sort: popularity',
        farm_helper_popularity_col: 'Popularity',
        farm_helper_filter_placeholder: 'Filter maps…',
        farm_helper_peer_count: '{n} peers playing',
        farm_helper_coverage_suffix: 'coverage',
        farm_helper_panel_title: 'Who you’re compared against',
        farm_helper_panel_sample: 'Sample: {n} nearby players ({covered} covered)',
        farm_helper_panel_hint: 'Click a map on the left for a detailed breakdown',
        farm_helper_target_median: 'Peer target {pp}pp',
        farm_helper_target_yours: 'Your score {pp}pp',
        farm_helper_target_progress: '{pct}% of nearby players have this',
        farm_helper_too_hard: 'Too hard',
        farm_helper_too_hard_desc: 'Beyond your level — hidden from recommendations until you score on it',
        farm_helper_too_easy: 'Too easy',
        farm_helper_too_easy_desc: 'Below your level — its target score will be raised',
        farm_helper_who_competing: 'Who’s competing for this',
        farm_helper_full_analysis: 'Full analysis →',
        farm_helper_no_results_filtered: 'No maps match these filters',
        farm_helper_feedback_saved: 'Recommendation preference updated',
        farm_helper_feedback_failed: 'Failed to update, please try again',
        remove: 'Remove',

        rel_sec: '{n}s ago', rel_min: '{n}m ago', rel_hr: '{n}h ago', rel_day: '{n}d ago',

        search_placeholder: 'Search players…',
        search_no_results: 'No matching players',
        highlight_best_plays: 'Recent Best Plays',
        stat_joined: 'Joined {date}',
        stat_playtime: '{h}h play time',
        grade_tally: 'Grade Tally',
        most_used_mod: 'Most-used Mod',
        newest_best: 'Newest Best Play',
        oldest_best: 'Oldest Best Play',
        view_all: 'View all →',
        tab_about: 'About', tab_activity: 'Activity',
        rank_global: 'Global Rank', rank_country: 'Country Rank', total_pp: 'Total PP',
        rank_delta_days: 'last {n}d',
        stat_sr_distribution: 'SR Distribution', stat_bpm_median: 'BPM Median', stat_pp_range: 'PP Range',
        osu_profile_link: 'osu! profile', last_seen_online: 'Online now', last_seen_offline: 'Last seen {when}',
        about_empty: "This player hasn't written a bio yet.",
        activity_empty: 'No activity data to show.',
        activity_hint: "Drawn from osu!'s own official monthly playcount history; our own day-level tracking only started September 2026, so it'll get more precise over time.",
        activity_month_count: '{month}: {n} plays',
        no_best_plays_filtered: 'No best plays match this filter.',
        filter_any_mod: 'Any mod', sort_pp: 'By PP', sort_time: 'By time',

        nav_maps: 'Maps',
        h1_maps: 'osu!catch Map Catalog',
        maps_search_placeholder: 'Search title, artist, creator…',
        status_any: 'Any status', status_ranked: 'Ranked', status_loved: 'Loved',
        sort_star_desc: 'Stars high→low', sort_star_asc: 'Stars low→high',
        sort_bpm_desc: 'BPM high→low', sort_length_desc: 'Length long→short', sort_newest: 'Newest',
        coverage_maps: '{n} maps indexed (Ranked {ranked} / Loved {loved})',
        empty_maps: 'No maps match these filters.',
        failed_maps: 'Failed to load the map catalog.',
        diff_count_suffix: ' diffs',
        star_any: 'Any star',

        nav_skins: 'Skins',
        h1_skins: 'osu! Skins',
        coverage_skins: '{n} skins in the catalog',
        skins_upload_toggle: 'Upload a skin',
        skins_upload_title: 'Upload a skin',
        skins_upload_note: 'Anyone can upload — no login required. Please only upload skins you have the right to share.',
        skins_name_placeholder: 'Skin name',
        skins_uploader_placeholder: 'Your name (optional)',
        skins_file_label: '.osk file (max 3MB)',
        skins_preview_label: 'Preview image (optional, JPEG/PNG, max 1.5MB)',
        skins_submit: 'Submit',
        skins_uploading: 'Uploading…',
        skins_upload_success: 'Uploaded!',
        skins_upload_failed: 'Upload failed: {msg}',
        skins_missing_name: 'Please enter a skin name',
        skins_missing_file: 'Please choose a .osk file',
        skins_file_too_large: 'File exceeds the {mb}MB limit',
        skins_search_placeholder: 'Search skins or uploaders…',
        sort_downloads: 'Most downloaded',
        sort_size: 'Largest file', skins_filter_mine: 'My uploads',
        skins_by: 'by {name}',
        skins_downloads_count: '{n} downloads',
        skins_download_btn: 'Download',
        empty_skins: 'No skins uploaded yet — be the first!',
        failed_skins: 'Failed to load skins.',
    },
};

function getLang() {
    try {
        const saved = localStorage.getItem('ct_lang');
        if (saved === 'zh' || saved === 'en') return saved;
    } catch { /* ignore */ }
    return 'zh';
}

function setLang(lang) {
    try { localStorage.setItem('ct_lang', lang); } catch { /* ignore */ }
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

/* ---------- osu! OAuth login (general site login) ----------
   netlify/functions/osu-replay-login.js + osu-replay-callback.js run the
   authorization-code flow and redirect back here with
   ?ct_login=<id>&ct_login_name=<name>&ct_login_token=<signed token> (or
   ?ct_login_error=<stage> on failure). The real osu! access token is
   never sent to the client — it stays encrypted server-side (see
   _user-auth.js) so a login-gated feature can reuse it on a later visit
   without asking the user to re-login every time. (Originally built
   Watch-Replay-only; removed with that feature, rebuilt as general login
   2026-09 — route filenames kept as osu-replay-* since that's what's
   registered on osu!'s own OAuth app settings, not because this is
   replay-specific anymore.) */
const CT_LOGIN_STORAGE_KEY = 'ct_logged_in_user';

function getCtLoggedInUser() {
    try { return JSON.parse(localStorage.getItem(CT_LOGIN_STORAGE_KEY)); }
    catch { return null; }
}

function getCtAuthToken() {
    const user = getCtLoggedInUser();
    return user && user.token ? user.token : null;
}

function logoutCtUser() {
    localStorage.removeItem(CT_LOGIN_STORAGE_KEY);
    applyCtLoggedInUser();
}

function ctLoginUrl() {
    const returnTo = location.pathname + location.search;
    return `/.netlify/functions/osu-replay-login?${new URLSearchParams({ return_to: returnTo })}`;
}

function applyCtLoggedInUser() {
    const user = getCtLoggedInUser();
    const loginBtn = document.getElementById('ct-login-btn');
    const pill = document.getElementById('ct-logged-in-pill');
    if (loginBtn) {
        loginBtn.style.display = user ? 'none' : '';
        loginBtn.href = ctLoginUrl();
    }
    if (pill) pill.style.display = user ? '' : 'none';
    if (!user) return;
    const nameEl = document.getElementById('ct-logged-in-name');
    const avatarEl = document.getElementById('ct-logged-in-avatar');
    if (nameEl) nameEl.textContent = user.username || `#${user.id}`;
    if (avatarEl) avatarEl.src = `https://a.ppy.sh/${user.id}`;
}

function showCtLoginMsg(msg) {
    const el = document.getElementById('ct-login-msg');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 6000);
}

function checkCtLoginFromUrl() {
    const params = new URLSearchParams(location.search);
    const id = params.get('ct_login');
    const loginFailed = params.get('ct_login_error');

    if (id) {
        localStorage.setItem(CT_LOGIN_STORAGE_KEY, JSON.stringify({
            id,
            username: params.get('ct_login_name') || '',
            token: params.get('ct_login_token') || null,
        }));
    }
    if (id || loginFailed) {
        params.delete('ct_login');
        params.delete('ct_login_name');
        params.delete('ct_login_token');
        params.delete('ct_login_error');
        const qs = params.toString();
        history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
        if (loginFailed) showCtLoginMsg(t('login_failed'));
    }

    applyCtLoggedInUser();
    const logoutBtn = document.getElementById('ct-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logoutCtUser);
}

/* ---------- grade badges / mods / relative time ---------- */

/* A small hue ladder built from the site's own palette (violet primary,
   rose accent) rather than osu!'s literal rank colors — used only for the
   grade FILTER pills (feed.html), which stay plain colored text/pills;
   kept separate from gradeBadge() below now that score-row grade badges
   render osu!'s own official icons instead. */
const GRADE_COLORS = {
    XH: '#e2e2f0', X: '#facc15', SH: '#e2e2f0', S: '#facc15',
    A: '#34d399', B: '#38bdf8', C: '#fb923c', D: '#fb5a8c', F: '#f6584f',
};

// Official osu! rank badge SVGs, self-hosted (not hotlinked) — pulled 2026-09
// straight from osu.ppy.sh's own site CSS (app.*.css's .score-rank--{grade}
// background-image rules), same artwork osu! itself uses for score grades.
// Self-hosted rather than hotlinked from osu.ppy.sh/assets/images/ because
// those filenames carry a webpack content hash that changes on osu!'s own
// redeploys — a stale cached URL would silently start 404ing. assets/grades/
// has one file per VALID_GRADES entry (_catch-constants.js): XH X SH S A B
// C D F, no separate icon for "?"/unknown (falls back to plain text).
function gradeBadge(grade) {
    const g = grade || '?';
    if (!/^(XH|X|SH|S|A|B|C|D|F)$/.test(g)) return `<span class="grade-badge grade-badge--text">${escapeHtml(g)}</span>`;
    return `<img class="grade-badge" src="assets/grades/${g}.svg" alt="${escapeHtml(g)}">`;
}

function fcTag(isFc) {
    return isFc ? '<span class="fc-tag">FC</span>' : '';
}

function formatMods(mods) {
    if (!mods || mods.length === 0) return 'NM';
    return mods.join(',');
}

// Real osu! mod-select hexagon artwork — self-hosted from ppy's own
// osu-wiki repo (wiki/Skinning/Interface/img/selection-mod-*.png, the
// asset set the game's official skinning wiki page itself uses to
// illustrate these exact icons), not hotlinked, same reasoning as
// gradeBadge()'s self-hosted SVGs above. No selection-mod-nomod.png
// exists in-game either — NM (and anything not in this set) falls back
// to a flat text chip instead of a missing image.
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

// osu!'s stable beatmapset-cover CDN pattern — no extra API call needed,
// every feed/score record already carries beatmapset_id.
function coverArtUrl(beatmapsetId) {
    return beatmapsetId ? `https://assets.ppy.sh/beatmaps/${beatmapsetId}/covers/cover.jpg` : '';
}

// osu!'s "card" cover variant — purpose-cropped to a ~2.8:1 banner (279x100
// measured live off mania-tracker.com/maps, which uses this exact variant
// for its catalog grid), rather than forcing the wider `cover.jpg` hero
// crop into a narrow box via background-size:cover and losing more of the
// image than necessary.
function coverArtUrlCard(beatmapsetId) {
    return beatmapsetId ? `https://assets.ppy.sh/beatmaps/${beatmapsetId}/covers/card.jpg` : '';
}

/* ---------- country flags (post global-expansion) ----------
   HatScripts/circle-flags (github.com/HatScripts/circle-flags, MIT license,
   ISO 3166-1 alpha-2 filenames) via jsDelivr's GitHub-raw proxy — round
   icon-style flags rather than flagcdn.com's rectangular photo-style ones
   (swapped 2026-09 per request), no auth/attribution required, same
   hotlink-safe CDN category as flagcdn. Wrapping the existing .avatar
   element in a positioned span (rather than adding a sibling element) means
   the badge overlays the avatar without needing any per-call-site layout
   changes — the wrapper is display:inline-flex so it takes on the avatar's
   own box size and margin. */
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

/* ---------- audio preview button + floating mini-player ----------
   Plain <audio> playback needs no CORS at all (that's only a Web Audio
   API/AnalyserNode requirement) — the main site's preview waveform feature
   needed a CORS proxy specifically because it reads real frequency data;
   the in-card bars here are a decorative simulated equalizer (per
   request), not driven by actual audio analysis, so this stays a plain
   <audio> element with zero backend involvement.

   A page that renders preview buttons (currently just render-maps.js)
   calls resetPreviewQueue() once before rendering a batch of cards, then
   previewButton() for each card — each call appends {beatmapsetId, title,
   artist, cover} to _previewQueue and bakes that item's queue index into
   the button's onclick. This is what lets the floating mini-player's
   prev/next step through "whatever's currently on screen" without the
   page needing its own separate queue logic. Only one preview plays at a
   time; starting a new one stops whichever was already playing. */
let _previewAudio = null;
let _previewIndex = -1;
let _previewQueue = [];
let _previewVolume = (() => {
    try { const v = parseFloat(localStorage.getItem('ct_preview_volume')); return Number.isFinite(v) ? v : 0.6; }
    catch { return 0.6; }
})();
let _previewLoop = false;

function resetPreviewQueue() {
    _previewQueue = [];
}

function previewButtons() {
    return document.querySelectorAll('.preview-btn');
}

function stopPreview() {
    if (_previewAudio) _previewAudio.pause();
    const btn = previewButtons()[_previewIndex];
    if (btn) btn.classList.remove('playing', 'paused');
    _previewAudio = null;
    _previewIndex = -1;
    hideMiniPlayer();
}

function startPreviewAt(index) {
    const item = _previewQueue[index];
    if (!item) return;
    const prevBtn = previewButtons()[_previewIndex];
    if (prevBtn) prevBtn.classList.remove('playing', 'paused');
    if (_previewAudio) _previewAudio.pause();

    const audio = new Audio(`https://b.ppy.sh/preview/${item.beatmapsetId}.mp3`);
    audio.volume = _previewVolume;
    audio.loop = _previewLoop;
    audio.addEventListener('ended', nextPreview);
    audio.addEventListener('error', stopPreview);
    audio.addEventListener('timeupdate', updateMiniPlayerProgress);
    audio.addEventListener('loadedmetadata', updateMiniPlayerProgress);
    audio.addEventListener('play', updateMiniPlayerPlayState);
    audio.addEventListener('pause', updateMiniPlayerPlayState);
    audio.play().catch(stopPreview);

    const btn = previewButtons()[index];
    if (btn) btn.classList.add('playing');
    _previewAudio = audio;
    _previewIndex = index;
    showMiniPlayer(item);
}

function togglePreviewAt(index) {
    if (_previewIndex === index) { stopPreview(); return; }
    startPreviewAt(index);
}

function nextPreview() {
    if (!_previewQueue.length) return stopPreview();
    startPreviewAt((_previewIndex + 1 + _previewQueue.length) % _previewQueue.length);
}
function prevPreview() {
    if (!_previewQueue.length) return stopPreview();
    startPreviewAt((_previewIndex - 1 + _previewQueue.length) % _previewQueue.length);
}
function togglePlayPause() {
    if (!_previewAudio) return;
    if (_previewAudio.paused) _previewAudio.play().catch(stopPreview); else _previewAudio.pause();
}
function toggleLoop() {
    _previewLoop = !_previewLoop;
    if (_previewAudio) _previewAudio.loop = _previewLoop;
    const btn = document.getElementById('mini-player-loop');
    if (btn) btn.classList.toggle('active', _previewLoop);
}

function fmtPreviewTime(s) {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

const MINI_PLAYER_PLAY_ICON = '<path d="M8 5v14l11-7z"/>';
const MINI_PLAYER_PAUSE_ICON = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';

function updateMiniPlayerPlayState() {
    if (!_previewAudio) return;
    const playBtn = document.getElementById('mini-player-playpause');
    if (playBtn) playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${_previewAudio.paused ? MINI_PLAYER_PLAY_ICON : MINI_PLAYER_PAUSE_ICON}</svg>`;
    const activeBtn = previewButtons()[_previewIndex];
    if (activeBtn) activeBtn.classList.toggle('paused', _previewAudio.paused);
}

function updateMiniPlayerProgress() {
    if (!_previewAudio) return;
    const seek = document.getElementById('mini-player-seek');
    const time = document.getElementById('mini-player-time');
    if (!seek || !time) return;
    const duration = _previewAudio.duration || 0;
    const current = _previewAudio.currentTime || 0;
    if (document.activeElement !== seek) seek.value = duration ? String(current / duration) : '0';
    time.textContent = `${fmtPreviewTime(current)} / ${fmtPreviewTime(duration)}`;
}

function ensureMiniPlayer() {
    if (document.getElementById('mini-player')) return;
    const el = document.createElement('div');
    el.id = 'mini-player';
    el.className = 'mini-player';
    el.hidden = true;
    el.innerHTML = `
        <div class="mini-player-top">
            <img class="mini-player-cover" id="mini-player-cover" alt="">
            <div class="mini-player-info">
                <div class="mini-player-title" id="mini-player-title"></div>
                <div class="mini-player-artist" id="mini-player-artist"></div>
            </div>
            <svg class="mini-player-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>
            <input type="range" id="mini-player-volume" min="0" max="1" step="0.01" title="Volume">
            <button type="button" class="mini-player-icon-btn" id="mini-player-close" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg></button>
        </div>
        <div class="mini-player-controls">
            <button type="button" class="mini-player-icon-btn" id="mini-player-prev" title="Previous"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14l-11-7z"/></svg></button>
            <button type="button" class="mini-player-icon-btn" id="mini-player-playpause" title="Play/Pause"><svg viewBox="0 0 24 24" fill="currentColor">${MINI_PLAYER_PAUSE_ICON}</svg></button>
            <button type="button" class="mini-player-icon-btn" id="mini-player-next" title="Next"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg></button>
            <button type="button" class="mini-player-icon-btn" id="mini-player-loop" title="Loop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></button>
            <input type="range" id="mini-player-seek" min="0" max="1" step="0.001">
            <span class="mini-player-time" id="mini-player-time">0:00 / 0:00</span>
        </div>`;
    document.body.appendChild(el);

    document.getElementById('mini-player-close').addEventListener('click', stopPreview);
    document.getElementById('mini-player-playpause').addEventListener('click', togglePlayPause);
    document.getElementById('mini-player-prev').addEventListener('click', prevPreview);
    document.getElementById('mini-player-next').addEventListener('click', nextPreview);
    document.getElementById('mini-player-loop').addEventListener('click', toggleLoop);
    document.getElementById('mini-player-volume').addEventListener('input', (e) => {
        _previewVolume = parseFloat(e.target.value);
        if (_previewAudio) _previewAudio.volume = _previewVolume;
        try { localStorage.setItem('ct_preview_volume', String(_previewVolume)); } catch { /* private mode etc. — just skip persisting */ }
    });
    document.getElementById('mini-player-seek').addEventListener('input', (e) => {
        if (_previewAudio && _previewAudio.duration) _previewAudio.currentTime = parseFloat(e.target.value) * _previewAudio.duration;
    });
}

function showMiniPlayer(item) {
    ensureMiniPlayer();
    document.getElementById('mini-player').hidden = false;
    document.getElementById('mini-player-cover').src = item.cover || '';
    document.getElementById('mini-player-title').textContent = item.title || '';
    document.getElementById('mini-player-artist').textContent = item.artist || '';
    document.getElementById('mini-player-volume').value = String(_previewVolume);
    document.getElementById('mini-player-seek').value = '0';
    document.getElementById('mini-player-time').textContent = '0:00 / 0:00';
    updateMiniPlayerPlayState();
}

function hideMiniPlayer() {
    const el = document.getElementById('mini-player');
    if (el) el.hidden = true;
}

function previewButton(beatmapsetId, bpm, title, artist, cover) {
    if (!beatmapsetId) return '';
    const index = _previewQueue.length;
    _previewQueue.push({ beatmapsetId, title: title || '', artist: artist || '', cover: cover || '' });
    // 12 bars — see the CSS's .icon-eq span:nth-child(1..12) for the
    // hand-tuned per-bar height/duration/delay that gives the full-width
    // playing-state visualizer its wave look. Each bar's animation-duration
    // is `calc(var(--beat-s) * <per-bar multiplier>)` rather than a fixed
    // length, so the whole visualizer's bounce rate actually tracks this
    // specific map's tempo — --beat-s (one beat's length in seconds,
    // 60/bpm) is set inline here per card since bpm varies per map.
    //
    // Plain 60/bpm is technically tempo-accurate but reads as barely
    // different card-to-card — a linear relationship means, say, a 2x BPM
    // difference only ever gives a 2x speed difference, and two bars a
    // human is glancing at for a second don't read as "2x faster" very
    // clearly. Per request, exaggerate it: raise the BPM ratio (relative
    // to a 150 BPM reference, chosen so a roughly-average-tempo map's
    // speed is unchanged from before) to a >1 power so fast maps bounce
    // noticeably faster and slow maps noticeably slower than tempo-
    // accurate scaling alone would give — still monotonic in the real BPM
    // (faster song = faster bounce, always), just a more perceptible curve.
    // The exponent alone was still too subtle at 1.3 (per live feedback) —
    // raised to 1.5, with an explicit floor/ceiling clamp on the result so
    // a real outlier BPM (this catalog goes up to ~350+) can't push the
    // exponent's effect into an uncomfortably fast flicker (rough seizure-
    // risk territory) or a barely-moving crawl at the other end — the clamp
    // bounds the extremes directly instead of leaning on a conservative
    // exponent to do that job too.
    const REFERENCE_BPM = 150, BEAT_EXPONENT = 1.5;
    const MIN_BEAT_S = 0.12, MAX_BEAT_S = 0.9;
    const beatSeconds = bpm && bpm > 0
        ? Math.min(MAX_BEAT_S, Math.max(MIN_BEAT_S, 0.4 * Math.pow(REFERENCE_BPM / bpm, BEAT_EXPONENT)))
        : 0.4;
    const bars = '<span></span>'.repeat(12);
    return `<button type="button" class="preview-btn" style="--beat-s:${beatSeconds.toFixed(4)}s" onclick="event.stopPropagation();togglePreviewAt(${index})" title="Preview">
        <svg class="icon-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        <span class="icon-eq">${bars}</span>
    </button>`;
}

// Small inline-SVG status badges matching osu!'s own iconography (blue
// double-chevron for ranked, pink heart for loved) instead of a plain
// text pill — see the reference screenshot in conversation.
const STATUS_ICONS = {
    ranked: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 14 12 8 18 14"></polyline><polyline points="6 20 12 14 18 20"></polyline></svg>',
    loved: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-6.716-4.35-9.428-8.014C.29 9.86 1.1 6.2 4.2 4.9c2.1-.88 4.42-.1 5.8 1.62C11.38 4.8 13.7 4.02 15.8 4.9c3.1 1.3 3.91 4.96 1.63 8.086C18.716 16.65 12 21 12 21z"/></svg>',
};
function statusIcon(status) {
    const svg = STATUS_ICONS[status];
    return svg ? `<span class="status-icon ${status}" title="${escapeHtml(status)}">${svg}</span>` : '';
}

// Label text + icon to its right, e.g. "RANKED [chevrons]" / "LOVED [heart]".
/* Star-rating colour scale + catch-mode icon shape, ported verbatim from
   the main osu-collection site's js/osu.js (same STAR_COLOR_STOPS table,
   same liftForContrast() dark-card-background fix, same catch glyph) so
   Catch Tracker's difficulty icons read as visually "the same language"
   as the main site's own beatmap cards, per request. */
const CATCH_ICON_PATH = '<circle cx="50" cy="50" r="41"/><circle cx="50" cy="38" r="7" fill="currentColor" stroke="none"/><circle cx="38" cy="60" r="5.5" fill="currentColor" stroke="none"/><circle cx="62" cy="60" r="5.5" fill="currentColor" stroke="none"/>';
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
            const t = (stars - s0) / (s1 - s0);
            return rgbHex(liftForContrast(c0.map((v, idx) => v + (c1[idx] - v) * t)));
        }
    }
    return rgbHex(liftForContrast(stops[stops.length - 1][1]));
}
function diffIcon(beatmapId, stars, label) {
    const color = starRatingColor(stars);
    const starsStr = (Number(stars) || 0).toFixed(2);
    const title = label ? `${label} ${starsStr} ★` : `${starsStr} ★`;
    return `<a class="diff-icon" href="map.html?id=${encodeURIComponent(beatmapId)}" title="${escapeHtml(title)}" onclick="event.stopPropagation()" style="color:${color}">
        <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6">${CATCH_ICON_PATH}</svg>
    </a>`;
}

// `.map-status-badge` is absolutely positioned by default (pinned to a
// cover thumbnail's top-left corner — see maps.html's cards), so any call
// site that isn't sitting inside a positioned cover container needs
// `inline: true` or the badge floats out of flow and overlaps whatever
// text happens to be nearby (found live on map.html's title card once it
// grew its own cover banner — the badge had been silently mispositioned
// there even before that, just less noticeably against a plain background).
function statusBadge(status, inline) {
    if (!STATUS_ICONS[status]) return '';
    const label = status === 'ranked' ? t('status_ranked') : t('status_loved');
    return `<span class="map-status-badge${inline ? ' map-status-badge--inline' : ''} ${status}">${escapeHtml(label)}${statusIcon(status)}</span>`;
}

function highlightCard(s) {
    const cover = coverArtUrl(s.beatmapset_id);
    const style = cover ? ` style="background-image:url('${cover.replace(/'/g, '%27')}')"` : '';
    return `<a class="highlight-card" href="map.html?id=${encodeURIComponent(s.beatmap_id)}"${style}>
        <div class="highlight-pp">${fmtPP(s.pp)}</div>
        <div class="highlight-player">${escapeHtml(s.username || '')}</div>
        <div class="highlight-map">${escapeHtml(s.title || '')} [${escapeHtml(s.version || '')}]</div>
        <div class="highlight-when">${relTime(s.created_at)}</div>
    </a>`;
}

/* ---------- header player search (every page) ---------- */

/* Injected into the header rather than hand-added to all 4 HTML files —
   searches the already-cached rankings:global dataset server-side
   (rankings-list.js's `q` param), so this needs no new dataset of its own. */
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

/* ---------- decorative background: falling bananas ----------
   osu!catch's default skin uses a banana for the spinner — a light,
   purely decorative nod to that. Desktop-only and skipped under
   prefers-reduced-motion, matching the main site's own restraint around
   background animation (it stripped a heavier particle effect for mobile
   thermal reasons — see project memory). transform-only keyframe (no
   layout properties), a handful of elements, no blur/shadow. */
function initBananaRain() {
    if (window.matchMedia('(max-width: 700px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const container = document.createElement('div');
    container.className = 'banana-rain';
    container.setAttribute('aria-hidden', 'true');
    const COUNT = 7;
    for (let i = 0; i < COUNT; i++) {
        const span = document.createElement('span');
        span.textContent = '🍌';
        span.style.left = `${(i / COUNT) * 100 + Math.random() * (100 / COUNT) * 0.6}%`;
        span.style.fontSize = `${16 + Math.random() * 14}px`;
        span.style.opacity = (0.14 + Math.random() * 0.18).toFixed(2);
        span.style.animationDuration = `${16 + Math.random() * 12}s`;
        span.style.animationDelay = `${-Math.random() * 25}s`;
        container.appendChild(span);
    }
    document.body.prepend(container);
}
initBananaRain();
// common.js is loaded at the end of <body>, after the header markup, so the
// DOM is already parsed — no need to wait for DOMContentLoaded here.
initPlayerSearch();
checkCtLoginFromUrl();
