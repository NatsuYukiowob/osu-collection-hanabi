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
        nav_home: '首頁', nav_rankings: '排行榜', nav_feed: '即時動態', nav_goals: '目標', nav_discord: 'Discord',
        nav_top_plays: '最佳成績', nav_farm_trending: '刷分熱門', nav_farm_helper: '刷圖助手',
        remove: '移除', th_category: '分類',
        loading: '載入中…',
        title_rankings: 'Std Tracker — osu! 全球排名',
        title_feed: 'Std Tracker — 即時動態',
        h1_rankings: 'osu! 排名',
        th_rank: '#', th_player: '玩家', th_pp: 'PP', th_accuracy: '準度', th_playcount: '遊玩次數',
        th_delta_global: '全球Δ', th_delta_country: '國內Δ', th_ss: 'SS', th_s: 'S', th_a: 'A',
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
        login_with_osu: '使用 osu! 登入',
        logout: '登出',
        login_failed: '登入失敗，請再試一次',

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
        rank_delta_days: '{n}天內',
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
        sort_playcount_desc: '遊玩次數最多', sort_favourites_desc: '收藏數最多',
        star_any: '任何星數', bpm_any: '任何 BPM', length_any: '任何長度',
        random_map: '🎲 隨機',
        download_osz: '下載 .osz',

        h1_goals: '目標',
        goals_hint: '設定總PP目標，網站會在你每次來訪時，用你最新的 osu! 資料自動幫你檢查進度。',
        goals_login_prompt: '請先登入 osu! 帳號才能設定與追蹤目標。',
        goals_total_pp_label: '總PP達到',
        goals_achieved: '已達成',
        goals_remove: '刪除目標',
        goals_current_progress: '目前 {pp}pp',
        goals_current_total_pp: '你目前的總PP是 {pp}',
        goals_set_new: '設定目標',
        goals_empty: '還沒有設定任何目標 — 在上面輸入一個PP數字開始追蹤吧。',
        goals_invalid_target: '請輸入有效的PP數字。',
        goals_save_failed: '儲存失敗，請再試一次。',
        goals_load_failed: '目標載入失敗。',

        h1_discord: 'Discord 伺服器',
        discord_submit_toggle: '發布你的伺服器',
        discord_search_placeholder: '搜尋伺服器或標籤…',
        discord_empty: '還沒有任何伺服器 — 當第一個發布的人吧！',
        discord_coverage: '共 {n} 個社群 Discord 伺服器',
        discord_failed: '載入失敗。',
        discord_join: '加入',
        discord_submitted_by: '發布者：{name}',
        discord_remove: '下架',
        discord_login_prompt: '請先登入 osu! 帳號才能發布伺服器。',
        discord_name_placeholder: '伺服器名稱',
        discord_invite_placeholder: 'https://discord.gg/...',
        discord_icon_placeholder: '圖示圖片網址（選填）',
        discord_desc_placeholder: '簡短描述（選填）',
        discord_tags_placeholder: '標籤，用逗號分隔（選填）',
        discord_submit: '發布',
        discord_missing_name: '請輸入伺服器名稱。',
        discord_missing_invite: '請輸入邀請連結。',
        discord_submitting: '發布中…',
        discord_submit_success: '發布成功！',
        discord_submit_failed: '發布失敗，請確認邀請連結格式是否正確（discord.gg 或 discord.com/invite）。',

        h1_top_plays: '最佳成績',
        filter_range_24h: '24小時', filter_range_3d: '3天', filter_range_7d: '7天', filter_range_30d: '30天',
        h1_farm_trending: '刷分熱門地圖',
        farm_trending_hint: '追蹤名單最近實際在刷的圖 — 不是累計總次數，只看最近的活動量。',
        sort_farm_playcount: '最近遊玩次數', sort_farm_avgpp: '平均PP最高',
        sort_farm_maxpp: '單次PP最高', sort_farm_recent: '最近遊玩時間',
        filter_min_avg_pp: '最低平均PP',
        th_avg_pp: '平均PP', th_max_pp: '最高PP', th_recent_players: '最近遊玩者',
        coverage_farm_trending: '共 {maps} 張圖有近期活動 — 上次更新 {time}',

        farm_helper_view: '查看刷圖建議',
        farm_helper_title: '刷圖助手',
        farm_helper_category_new: '未打過',
        farm_helper_category_improve: '可提升',
        farm_helper_ref: '參考成績',
        farm_helper_gain: '預估 PP',
        farm_helper_coverage: '同儕資料涵蓋 {n}/{total} 位鄰近玩家',
        farm_helper_not_ranked: '這位玩家尚未在追蹤的排行榜中，無法計算同儕比較。',
        farm_helper_disclaimer: '推薦依據是附近排名玩家的真實成績，不是難度試算；同儕資料仍在陸續建立中，涵蓋越完整、推薦越準確。只比對雙方的最佳 100 筆成績，可能遺漏你打過但分數不夠高的圖。',
        farm_helper_no_data: '目前還沒有推薦——可能同儕資料還在建立中，或你已經超前附近的玩家了。',
        farm_helper_no_id: '未提供玩家 ID。',
        farm_helper_failed: '刷圖助手載入失敗。',
        farm_helper_landing_title: '值得刷的圖譜',
        farm_helper_my_own: '查看我（{username}）的刷圖建議 →',
        farm_helper_landing_for: '為',
        farm_helper_ladder_title: '附近玩家的 pp 排行',
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
    },
    en: {
        nav_home: 'Home', nav_rankings: 'Rankings', nav_feed: 'Live Feed', nav_goals: 'Goals', nav_discord: 'Discord',
        nav_top_plays: 'Top Plays', nav_farm_trending: 'Trending Farm', nav_farm_helper: 'Farm Helper',
        remove: 'Remove', th_category: 'Category',
        loading: 'Loading…',
        title_rankings: 'Std Tracker — Global osu! Rankings',
        title_feed: 'Std Tracker — Live Feed',
        h1_rankings: 'osu! Rankings',
        th_rank: '#', th_player: 'Player', th_pp: 'pp', th_accuracy: 'Accuracy', th_playcount: 'Play Count',
        th_delta_global: 'Global Δ', th_delta_country: 'Country Δ', th_ss: 'SS', th_s: 'S', th_a: 'A',
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
        login_with_osu: 'Login with osu!',
        logout: 'Logout',
        login_failed: 'Login failed, please try again',

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
        rank_delta_days: 'last {n}d',
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
        sort_playcount_desc: 'Most played', sort_favourites_desc: 'Most favourited',
        star_any: 'Any star', bpm_any: 'Any BPM', length_any: 'Any length',
        random_map: '🎲 Random',
        download_osz: 'Download .osz',

        h1_goals: 'Goals',
        goals_hint: 'Set a total-pp target and this page checks your progress automatically against your latest osu! stats every time you visit.',
        goals_login_prompt: 'Login with your osu! account to set and track goals.',
        goals_total_pp_label: 'Total pp reaches',
        goals_achieved: 'Achieved',
        goals_remove: 'Remove goal',
        goals_current_progress: 'Currently {pp}pp',
        goals_current_total_pp: 'Your current total pp is {pp}',
        goals_set_new: 'Set goal',
        goals_empty: 'No goals yet — enter a pp target above to start tracking.',
        goals_invalid_target: 'Enter a valid pp number.',
        goals_save_failed: 'Failed to save, please try again.',
        goals_load_failed: 'Failed to load goals.',

        h1_discord: 'Discord Servers',
        discord_submit_toggle: 'Submit your server',
        discord_search_placeholder: 'Search servers or tags…',
        discord_empty: 'No servers yet — be the first to submit one!',
        discord_coverage: '{n} community Discord servers',
        discord_failed: 'Failed to load.',
        discord_join: 'Join',
        discord_submitted_by: 'Submitted by {name}',
        discord_remove: 'Remove',
        discord_login_prompt: 'Login with your osu! account to submit a server.',
        discord_name_placeholder: 'Server name',
        discord_invite_placeholder: 'https://discord.gg/...',
        discord_icon_placeholder: 'Icon image URL (optional)',
        discord_desc_placeholder: 'Short description (optional)',
        discord_tags_placeholder: 'Tags, comma-separated (optional)',
        discord_submit: 'Submit',
        discord_missing_name: 'Enter a server name.',
        discord_missing_invite: 'Enter an invite link.',
        discord_submitting: 'Submitting…',
        discord_submit_success: 'Submitted!',
        discord_submit_failed: 'Failed to submit — check the invite link is a discord.gg or discord.com/invite URL.',

        h1_top_plays: 'Top Plays',
        filter_range_24h: '24h', filter_range_3d: '3d', filter_range_7d: '7d', filter_range_30d: '30d',
        h1_farm_trending: 'Trending Farm Maps',
        farm_trending_hint: "What the tracked pool has actually been grinding lately — not a lifetime total, just recent activity.",
        sort_farm_playcount: 'Most recent plays', sort_farm_avgpp: 'Highest avg pp',
        sort_farm_maxpp: 'Highest single pp', sort_farm_recent: 'Most recently played',
        filter_min_avg_pp: 'Min avg pp',
        th_avg_pp: 'Avg pp', th_max_pp: 'Max pp', th_recent_players: 'Recent Players',
        coverage_farm_trending: '{maps} maps with recent activity — last updated {time}',

        farm_helper_view: 'View farm recommendations',
        farm_helper_title: 'Farm Helper',
        farm_helper_category_new: 'New',
        farm_helper_category_improve: 'Improve',
        farm_helper_ref: 'Reference score',
        farm_helper_gain: 'Est. PP',
        farm_helper_coverage: 'Peer data covers {n}/{total} nearby players',
        farm_helper_not_ranked: 'This player isn’t in the tracked rankings yet, so peer comparison isn’t available.',
        farm_helper_disclaimer: 'Recommendations use nearby-ranked players’ real scores, not a difficulty estimate; peer data is still being built up, so coverage (and accuracy) improves over time. Only compares each side’s top 100 scores, so a map you’ve played but scored low on can be missed.',
        farm_helper_no_data: 'No recommendations yet — peer data may still be building, or you’re already ahead of nearby players.',
        farm_helper_no_id: 'No player id given.',
        farm_helper_failed: 'Failed to load the farm helper.',
        farm_helper_landing_title: 'Maps worth farming',
        farm_helper_my_own: 'View my ({username}) farm recommendations →',
        farm_helper_landing_for: 'for',
        farm_helper_ladder_title: 'Nearby players by pp',
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

/* ---------- osu! OAuth login ----------
   netlify/functions/osu-login.js + osu-callback.js run the
   authorization-code flow and redirect back here with
   ?st_login=<id>&st_login_name=<name>&st_login_token=<signed token> (or
   ?st_login_error=<stage> on failure). The real osu! access token is
   never sent to the client — it stays encrypted server-side (see
   _user-auth.js) so a login-gated feature can reuse it on a later visit
   without asking the user to re-login every time. Ported from
   catch-tracker's own common.js (its own login was originally Watch-
   Replay-only, later rebuilt as general login — this site never had that
   history, so it's named plainly from the start). */
const ST_LOGIN_STORAGE_KEY = 'st_logged_in_user';

function getStLoggedInUser() {
    try { return JSON.parse(localStorage.getItem(ST_LOGIN_STORAGE_KEY)); }
    catch { return null; }
}

function getStAuthToken() {
    const user = getStLoggedInUser();
    return user && user.token ? user.token : null;
}

function logoutStUser() {
    localStorage.removeItem(ST_LOGIN_STORAGE_KEY);
    applyStLoggedInUser();
}

function stLoginUrl() {
    const returnTo = location.pathname + location.search;
    return `/.netlify/functions/osu-login?${new URLSearchParams({ return_to: returnTo })}`;
}

function applyStLoggedInUser() {
    const user = getStLoggedInUser();
    const loginBtn = document.getElementById('st-login-btn');
    const pill = document.getElementById('st-logged-in-pill');
    if (loginBtn) {
        loginBtn.style.display = user ? 'none' : '';
        loginBtn.href = stLoginUrl();
    }
    if (pill) pill.style.display = user ? '' : 'none';
    if (!user) return;
    const nameEl = document.getElementById('st-logged-in-name');
    const avatarEl = document.getElementById('st-logged-in-avatar');
    if (nameEl) nameEl.textContent = user.username || `#${user.id}`;
    if (avatarEl) avatarEl.src = `https://a.ppy.sh/${user.id}`;
}

function showStLoginMsg(msg) {
    const el = document.getElementById('st-login-msg');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 6000);
}

function checkStLoginFromUrl() {
    const params = new URLSearchParams(location.search);
    const id = params.get('st_login');
    const loginFailed = params.get('st_login_error');

    if (id) {
        localStorage.setItem(ST_LOGIN_STORAGE_KEY, JSON.stringify({
            id,
            username: params.get('st_login_name') || '',
            token: params.get('st_login_token') || null,
        }));
    }
    if (id || loginFailed) {
        params.delete('st_login');
        params.delete('st_login_name');
        params.delete('st_login_token');
        params.delete('st_login_error');
        const qs = params.toString();
        history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
        if (loginFailed) showStLoginMsg(t('login_failed'));
    }

    applyStLoggedInUser();
    const logoutBtn = document.getElementById('st-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logoutStUser);
}
checkStLoginFromUrl();

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

/* ---------- audio preview button + floating mini-player ----------
   Ported from catch-tracker's own common.js. Plain <audio> playback needs
   no CORS at all (that's only a Web Audio API/AnalyserNode requirement) —
   the in-card bars are a decorative simulated equalizer, not driven by
   actual audio analysis, so this stays a plain <audio> element with zero
   backend involvement.

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
    try { const v = parseFloat(localStorage.getItem('st_preview_volume')); return Number.isFinite(v) ? v : 0.6; }
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
        try { localStorage.setItem('st_preview_volume', String(_previewVolume)); } catch { /* private mode etc. — just skip persisting */ }
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
/* ---------- decorative background: falling hit circles ----------
   std-tracker's own equivalent of catch-tracker's falling-banana
   background — a plain ring ("hit circle") instead of a fruit, since
   that's this ruleset's own signature shape (same glyph the site header
   icon already uses). Desktop-only and skipped under
   prefers-reduced-motion, matching catch-tracker's own restraint around
   background animation (and the main site's, for mobile thermal reasons —
   see project memory). transform-only keyframe (no layout properties), a
   handful of elements, no blur/shadow. */
function initCircleRain() {
    if (window.matchMedia('(max-width: 700px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const container = document.createElement('div');
    container.className = 'circle-rain';
    container.setAttribute('aria-hidden', 'true');
    // A clear mix of big/small circles (not just one narrow size band) —
    // small ones drift lighter/faster, big ones sit heavier/slower.
    const COUNT = 16;
    for (let i = 0; i < COUNT; i++) {
        const span = document.createElement('span');
        const big = i % 2 === 0;
        const size = big ? 26 + Math.random() * 30 : 8 + Math.random() * 10;
        span.style.left = `${(i / COUNT) * 100 + Math.random() * (100 / COUNT) * 0.6}%`;
        span.style.width = `${size}px`;
        span.style.height = `${size}px`;
        span.style.opacity = (big ? 0.10 + Math.random() * 0.12 : 0.16 + Math.random() * 0.18).toFixed(2);
        span.style.animationDuration = big ? `${22 + Math.random() * 14}s` : `${13 + Math.random() * 10}s`;
        span.style.animationDelay = `${-Math.random() * 30}s`;
        container.appendChild(span);
    }
    document.body.prepend(container);
}
initCircleRain();
// common.js is loaded at the end of <body>, after the header markup, so the
// DOM is already parsed — no need to wait for DOMContentLoaded here.
initPlayerSearch();
