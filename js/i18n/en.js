I18N.en = {
    title: 'osu! Collection', site_title: 'osu! Collection', site_tagline: 'Build your very own song collection',
    site_like_label: 'Like', site_like_title: 'Like this site if you enjoy it!', site_share_label: 'Share', site_share_title: 'Share this site with friends', site_share_copied: 'Site link copied!', site_share_text: 'Build your very own osu! song collection!',
    pwa_install_btn_title: 'Add to home screen (works offline)',
    site_update_btn_title: 'An update is available, click to update', site_update_available: 'A new version of the site is available — click to reload and get the latest version',
    maintenance_banner_text: 'This site is currently being updated — if you run into any questions or bugs, please get in touch!',
    page_refresh_btn_title: 'Refresh page',
    volume_fab_title: 'Adjust preview volume',
    nav_chat: 'Chat Room',
    nav_dm: 'Direct Messages',
    chat_page_title: 'Chat Room',
    chat_page_hint: "Chat with other players, look for teammates, share maps — paste an osu! beatmap link and it turns into a card you can add to your collection with one click.",
    chat_empty: 'Nobody has said anything yet — be the first!', chat_load_fail: 'Failed to load the chat room, try again later',
    chat_input_placeholder: 'Type a message...', chat_send_btn: 'Send',
    chat_emoji_btn_title: 'Emoji', chat_emoji_recent: 'Recent',
    chat_edit_btn_title: 'Edit', chat_edited_marker: '(edited)',
    chat_edit_save: 'Save', chat_edit_cancel: 'Cancel', chat_edit_fail: 'Edit failed, try again',
    chat_attach_btn_title: 'Attach image / GIF', chat_media_remove_title: 'Remove image',
    chat_media_too_big: 'Image is too large (max 4 MB)', chat_media_bad_type: 'Only PNG, JPEG, GIF or WebP images',
    chat_media_upload_fail: 'Image upload failed, try again', chat_media_disabled: 'Image uploads are currently disabled',
    chat_login_required: 'Log in with osu! to chat',
    chat_reply_btn_title: 'Reply to this message', chat_reply_cancel_title: 'Cancel reply',
    chat_view_profile_title: "View this player's osu! profile",
    chat_translate_btn_title: 'Translate this message', chat_translate_hide_title: 'Hide translation',
    chat_translate_loading: 'Translating...', chat_translate_fail: 'Translation failed, try again later',
    chat_replying_to: 'Replying to {name}: {content}',
    chat_delete_btn_title: 'Delete this message', chat_delete_confirm: 'Delete this message?', chat_delete_fail: 'Delete failed',
    chat_add_to_collection_btn: 'Add to collection',
    chat_rate_limited: "You're sending messages too fast, slow down", chat_send_fail: 'Failed to send, try again later',

    dm_page_title: 'Direct Messages', dm_page_hint: 'One-on-one chat with other players.',
    dm_new_username_placeholder: 'Enter a username to start a conversation...', dm_start_btn: 'Start conversation',
    dm_login_required: 'Log in with osu! to use direct messages',
    dm_empty: 'No conversations yet — enter a username to send your first message!',
    dm_thread_empty: 'No messages yet — say hi!',
    dm_back_btn: 'Back',
    dm_self_error: "You can't message yourself",

    site_howto_title: 'What every page and button does', site_howto_label: 'User Guide',
    nav_howto: 'User Guide',
    howto_page_title: 'User Guide', howto_page_hint: 'Grouped the same way as the site menu — what every page and button does, and how to use it.',
    howto_group_global: 'Site-wide',
    howto_manual_body: `
        <div class="howto-group" id="howto-global">
            <h3 class="howto-group-title">Site-wide</h3>
            <p class="howto-tab-desc">Controls available from any page, mostly clustered in the header's two corners.</p>
            <div class="howto-feat"><b>Light / dark toggle</b><span>Top-left. Click the moon/sun icon to switch — your choice is remembered on future visits.</span></div>
            <div class="howto-feat"><b>Add to home screen</b><span>Top-left, only shown where the browser supports it. Installs the site as an app icon with a basic offline screen.</span></div>
            <div class="howto-feat"><b>Site update available</b><span>Top-left / a floating bar at the bottom, only appears when a new version is detected — click it to reload.</span></div>
            <div class="howto-feat"><b>Global search</b><span>Top-right magnifier, or press <b>/</b> or <b>Ctrl+K</b>. Searches your collection, the catalog, and World Cup mappools at once — clicking a result jumps to that tab with the search prefilled.</span></div>
            <div class="howto-feat"><b>Notification bell</b><span>Top-right. Tracked players' PP changes, tracked mappers' new maps, unread DMs, etc. show up here — with push notifications on, you'll get them even with the site closed.</span></div>
            <div class="howto-feat"><b>osu! login</b><span>Top-right. Sign in with your osu! account — chatting, DMs, publishing to the gallery, cloud skin backup, and one-click favorites/most-played import all need this first.</span></div>
            <div class="howto-feat"><b>Language switch</b><span>Top-right globe icon — 9 languages supported, remembered after you pick one.</span></div>
            <div class="howto-feat"><b>☰ Menu</b><span>Top-right, the main nav on mobile, listing every tab. On a wide desktop screen the common tabs show directly, no need to open it.</span></div>
            <div class="howto-feat"><b>Volume</b><span>Bottom-right speaker — controls the preview-playback volume on collection cards.</span></div>
            <div class="howto-feat"><b>Refresh</b><span>Bottom-right — reloads the whole page.</span></div>
            <div class="howto-feat"><b>Like / User Guide / Share</b><span>Three buttons right under the site title: Like adds to the site's like count; User Guide is this page; Share copies a link to send to friends.</span></div>
        </div>

        <div class="howto-group" id="howto-core">
            <h3 class="howto-group-title">Core features</h3>

            <div class="howto-tab">
                <div class="howto-tab-title">Collection <small>default home page</small></div>
                <p class="howto-tab-desc">Manage your own osu! library: add, categorize, export back to the game, or diff against an old backup.</p>
                <div class="howto-feat"><b>Add a beatmap</b><span>Paste the map's ID or osu! URL (beatmapsets/... or /b/... both work) and click Add.</span></div>
                <div class="howto-feat"><b>Import/export (6 buttons)</b><span>Left to right: Export JSON backup → Import JSON to restore → Copy a share link → Download a preview PNG card → Export as collection.db to drop straight into osu! → ⚔ Diff, upload an old backup to see what was added/removed.</span></div>
                <div class="howto-feat"><b>Tools & settings (7 buttons)</b><span>Refresh all maps' data → 📊 Stats dashboard (with 8 collection achievement badges) → ✨ Collection wizard (see below) → Mark as played / one-click import favorites & most-played (login required) → 📁 Upload your osu!.db to mark which maps you already have (osu! stable only) → 🔒 Set a password, required for later edit/publish actions.</span></div>
                <div class="howto-feat"><b>Search / filter / sort</b><span>Search by title or artist; filter by language, genre, source, or artist; sort by star rating.</span></div>
                <div class="howto-feat"><b>Batch-download this list's files</b><span>Downloads every map in the current tab/search/filter view (every page, not just the visible one) as .osz, one at a time, via a no-login mirror — no app to install. The same button pauses/resumes mid-run without cutting off whatever's downloading. Once done, select them all in your file manager and drag the lot into osu! to import.</span></div>
                <div class="howto-feat"><b>Copy !mp map</b><span>Every card has a ⚔ button that copies that map as an <code>!mp map</code> line — be the host in an osu! multiplayer lobby and paste it to set the map. <code>/map</code> in the Discord bot shows the same line.</span></div>
                <div class="howto-feat"><b>Category tabs</b><span>Besides the fixed Favorites/All Songs/Standard/Taiko/Catch/Mania tabs, the gear icon opens "Manage categories" to add your own.</span></div>
                <div class="howto-feat"><b>Explore more</b><span>7 shortcut cards at the bottom, jumping to other common tabs.</span></div>
                <div class="howto-feat"><b>✨ Collection wizard</b><span>Actually three tools in one: ① generate categories from your account (favorites/most-played/best/recent/a specific mapper) ② generate practice collections from your scores (push, goal pool, low-acc redo, similar untried maps, weak points) ③ health check (finds duplicates, deleted, unranked, or difficulty-count-changed maps). All three only merge in, never overwrite your existing collection.</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">Public Gallery</div>
                <p class="howto-tab-desc">Publish your organized collection publicly, or browse others' and import them directly. Each osu! account can publish only one.</p>
                <div class="howto-feat"><b>Publish / unpublish</b><span>Login required. Publishing sends your current collection to the gallery; publishing again overwrites the old one instead of creating a second entry.</span></div>
                <div class="howto-feat"><b>Search / sort / filter</b><span>Search by player name or tag; sort by recent/❤ most liked/set count/highest rating; or show only ones you've liked.</span></div>
                <div class="howto-feat"><b>Collection detail</b><span>Click a card to open it: browse by mode/category tab, one-click import, copy a share link — once logged in, also "Overlay my scores" (marks your own grade + a grade breakdown on every map) and "Copy embed code" for an iframe to paste into a forum/blog post. A comments section sits below — anyone logged in can comment, and deletion is allowed for the commenter or that collection's publisher.</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">Skin Gallery</div>
                <p class="howto-tab-desc">Share real in-game skin screenshots so others can see how a skin actually looks before picking it.</p>
                <div class="howto-feat"><b>Share my skin screenshot</b><span>Fill in a name and author (optional), provide a download link or .osk file (at least one), pick the mode, upload a screenshot, and publish.</span></div>
                <div class="howto-feat"><b>Browse / filter</b><span>Search by name or author, filter by mode, sort by recent or most liked, or show only ones you liked or uploaded.</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">Chat Room</div>
                <p class="howto-tab-desc">A public chat room shared by every visitor.</p>
                <div class="howto-feat"><b>Posting</b><span>Login required. Paste an osu! beatmap link and it automatically becomes a card with a one-click "add to collection" button.</span></div>
                <div class="howto-feat"><b>Per-message actions</b><span>Click the avatar/name to open that player's osu! profile, see their country flag, tap 🌐 to translate into your current interface language, reply to a message, or delete (your own messages, or any if you're the site owner).</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">Direct Messages</div>
                <p class="howto-tab-desc">A private 1:1 conversation with one player, invisible to everyone else.</p>
                <div class="howto-feat"><b>Start a conversation</b><span>Login required. Enter their osu! username and click "Start conversation".</span></div>
                <div class="howto-feat"><b>Conversation list / unread</b><span>Unread counts also show as a badge next to "DM" in the ☰ menu. Opening a conversation shows the thread; "Back" returns to the list.</span></div>
            </div>
        </div>

        <div class="howto-group" id="howto-tools">
            <h3 class="howto-group-title">Toolbox</h3>

            <div class="howto-tab">
                <div class="howto-tab-title">Farm Maps</div>
                <p class="howto-tab-desc">A list of high-PP-efficiency ranked maps — the PP numbers are actually calculated by this site from SS scores, not estimated.</p>
                <div class="howto-feat"><b>Mode / mod tabs</b><span>Standard/Taiko/Catch/Mania, each paired with NM/DT/HD/HDDT/HR/HDHR mod combinations.</span></div>
                <div class="howto-feat"><b>🔥 Farm maps only</b><span>On by default. For osu!/taiko: ≥70% of Top 50 scores are DT; for catch/mania: ≥70% are 100% acc (both require ≥500 plays).</span></div>
                <div class="howto-feat"><b>Range filters</b><span>PP, star rating, BPM, and length all support a min~max range, plus search and several sort options.</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">Catalog</div>
                <p class="howto-tab-desc">A browser for the entire ranked catalog, sliced by artist/language/genre/source/feat.</p>
                <div class="howto-feat"><b>Filter combos</b><span>The four dropdowns can be combined, plus a mode filter and an "include 18+ tagged" toggle, with four sort options.</span></div>
                <div class="howto-feat"><b>➕ Create a collection from this filter</b><span>Only enables once your filters return results — one click turns the whole filtered result into a new category in your collection; check "Make it a dynamic category" to later pull in newly-ranked maps matching the same filter with one click.</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">World Cup Mappools</div>
                <p class="howto-tab-desc">Official mappools from every OWC/TWC/MWC (4K・7K)/CWC.</p>
                <div class="howto-feat"><b>Pick an edition / round</b><span>Mode tab → edition list → pick one to browse by round, each map labeled with its mod.</span></div>
                <div class="howto-feat"><b>➕ Add to collection</b><span>Add the whole edition, or just one round — no need to take the whole thing.</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">PP Lookup</div>
                <p class="howto-tab-desc">Look up any player's (including your own) PP, or compare two side by side.</p>
                <div class="howto-feat"><b>Look up your osu! PP</b><span>Enter a username or ID and search. Results include all-mode stats, a PP history chart, a track button, and "Generate stats card"; tabs below: recent plays / top plays / PP goal / medals / grade history.</span></div>
                <div class="howto-feat"><b>⚔ Two-player comparison</b><span>Fill in two usernames/IDs and click Compare: see an overview and overlaid PP charts first, then "Top play comparison" lists both players' best scores side by side below.</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">Replay Analysis</div>
                <p class="howto-tab-desc">Upload an .osr file to see score details — parsed entirely server-side, no video conversion or third-party service involved.</p>
                <div class="howto-feat"><b>Upload</b><span>Drag and drop, or click "Choose .osr file" — shows a score summary and a hit-timing distribution chart afterward.</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">🎨 Track Mappers</div>
                <p class="howto-tab-desc">Get notified the moment a mapper you like ranks a new map.</p>
                <div class="howto-feat"><b>Track</b><span>Enter the mapper's osu! username and click Track; the list shows on the same page and can be untracked anytime.</span></div>
            </div>
        </div>

        <div class="howto-group" id="howto-resources">
            <h3 class="howto-group-title">Resources</h3>

            <div class="howto-tab">
                <div class="howto-tab-title">My Skins <small>a different tab from "Skin Gallery"</small></div>
                <p class="howto-tab-desc">Your private skin storage, not shown publicly — use "Skin Gallery" for that instead.</p>
                <div class="howto-feat"><b>Upload / download</b><span>Uploaded .osk files live in this browser only — switching devices or clearing browser data loses them; download anytime to get them back.</span></div>
                <div class="howto-feat"><b>☁️ Cloud backup</b><span>Only appears when logged in. Up to 30 files, 4MB each; "Restore locally" adds it back to the list above.</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">News</div>
                <p class="howto-tab-desc">A list of official osu! changelog posts — browse only, no actions needed.</p>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">Tournaments</div>
                <p class="howto-tab-desc">Combines the official forum's Tournaments section with wyBin's community listings (unofficial events — confirm the organizer's own rules before signing up).</p>
                <div class="howto-feat"><b>Mode filter</b><span>Mode is auto-detected from the title's keywords; posts it can't recognize only show up under "All".</span></div>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">Resources</div>
                <p class="howto-tab-desc">A list of recommended community tools that didn't need rebuilding here — browse only.</p>
            </div>

            <div class="howto-tab">
                <div class="howto-tab-title">Feedback</div>
                <p class="howto-tab-desc">A feedback form. Write your thoughts and submit — only the site owner sees it, other visitors never do.</p>
            </div>
        </div>
    `,

    global_search_title: 'Search everything', global_search_placeholder: 'Search songs, mappools, my collection...', select_language: 'Select language',
    global_search_section_collection: 'My Collection', global_search_section_catalog: 'Catalog', global_search_section_mappools: 'World Cup Mappools',
    global_search_empty: 'No matching results',
    track_player_btn: '+ Track', untrack_player_btn: 'Untrack',
    track_done: "Added to your watchlist — we'll notify you when their PP changes", untrack_done: 'Removed from your watchlist',
    push_enable: 'Enable push notifications', push_disable: 'Disable push notifications', push_on: "Push on — we'll notify you when a tracked player's PP changes, even with the site closed", push_off: 'Push notifications turned off', push_blocked: 'Your browser has blocked notifications — enable them in its settings', push_fail: 'Could not subscribe to push — try again later',
    tracked_players_title: 'Tracked players', tracked_players_empty: "You're not tracking anyone yet — look someone up and hit \"Track\" to get notified when their PP changes",
    notif_bell_title: 'Notifications', notif_clear_btn: 'Clear all', notif_empty: 'No notifications yet',
    contact_info_title: 'Contact info',
    notif_pp_changed_detail: '{sign}{delta}pp (now {pp}pp)', notif_tournament_new_title: 'New tournament post',
    back_to_main: 'Back to Hanabiの小天地',
    nav_collection: 'Collection', nav_lookup: 'PP Lookup', nav_skins: 'Skins', nav_updates: 'News', nav_mapper_tracking: 'Tracked Mappers', nav_tournaments: 'Tournaments', nav_resources: 'Resources', nav_bbcode: 'BBCode', nav_feedback: 'Suggestions', nav_menu_open: 'Open menu', nav_more: 'More', nav_menu_title: 'Menu', nav_group_core: 'Core', nav_group_tools: 'Tools', nav_group_resources: 'Resources',
    lang_unspecified: 'Unspecified', lang_english: 'English', lang_japanese: 'Japanese', lang_chinese: 'Chinese', lang_instrumental: 'Instrumental', lang_korean: 'Korean', lang_french: 'French', lang_german: 'German', lang_swedish: 'Swedish', lang_spanish: 'Spanish', lang_italian: 'Italian', lang_russian: 'Russian', lang_polish: 'Polish', lang_other: 'Other', lang_unknown: 'Unlabeled', osu_lang_filter_all: 'All languages', stats_dashboard_langs_title: 'Language mix',
    osu_genre_filter_all: 'All genres', osu_source_filter_all: 'All sources', osu_source_filter_none: '(No source)', genre_unspecified: 'Unspecified', genre_video_game: 'Video Game', genre_anime: 'Anime', genre_rock: 'Rock', genre_pop: 'Pop', genre_other: 'Other', genre_novelty: 'Novelty', genre_hiphop: 'Hip Hop', genre_electronic: 'Electronic', genre_metal: 'Metal', genre_classical: 'Classical', genre_folk: 'Folk', genre_jazz: 'Jazz',
    osu_artist_filter_all: 'All artists',
    updates_title: 'News', updates_loading: 'Loading news...', updates_empty: 'No news right now', updates_load_fail: 'Failed to load news, please try again later',
    tournaments_title: 'Tournaments', tournaments_hint: "Community tournaments from the official \"Tournaments\" subforum and the wyBin platform — these aren't official events, so check each organizer's rules before signing up.", tournaments_filter_hint: 'Gamemode is guessed from the title — threads that don\'t match a mode only show under "All".', osu_filter_all: 'All', tournament_source_forum: 'Forum', tournament_rank_label: 'Eligible rank', tournament_rank_all: 'All ranks', tournament_rank_open: 'Open rank', tournament_rank_worldcup: 'World Cup', tournament_rank_digit: '{n}-digit', tournament_rank_unknown: 'Unstated',
    feedback_title: 'Suggestions & Improvements', feedback_hint: "Think something on this site could be better? Let me know here — only I can see your message, other visitors can't.", feedback_placeholder: 'Write your suggestion...', feedback_submit: 'Send', feedback_success: 'Your message has been sent — thank you for the feedback!',
    skins_title: 'My Skins', skins_hint: "Upload osu! skin files (.osk) you want to keep, and download them again anytime. Files are stored only in this browser, never uploaded to any server by default — switching devices or clearing browser data will lose them. Log in with osu! to optionally back up skins under 4MB to the cloud.", skins_list_title: 'Saved Skins',
    skins_backup_btn: 'Back up to cloud', skins_backup_title: 'Cloud Backup',
    skins_backup_hint: 'Just for you — up to 30 skins, each under 4MB. "Restore to device" adds it back to the list above.',
    skins_backup_login_required: 'Log in with osu! to use cloud backup', skins_backup_too_large: 'This skin exceeds {limit}MB, so it can only stay on this device',
    skins_backup_done: 'Backed up to the cloud', skins_backup_fail: 'Cloud backup failed, please try again later', skins_backup_empty: 'No skins backed up to the cloud yet',
    skins_backup_restore: 'Restore to device', skins_backup_restored: 'Restored to this device', skins_by_author: 'by {author}',
    skins_empty: 'No skins saved yet', skins_download: 'Download', skins_delete: 'Delete', skins_delete_confirm: 'Delete this skin file?',
    skins_upload_done: 'Added {n} file(s)', skins_upload_fail: 'Failed to upload "{n}"', skins_load_fail: 'Failed to load the skins list — check that your browser allows local storage',

    osu_title: 'Add Beatmap', osu_placeholder: 'Enter ID or paste osu! URL', osu_add: 'Add',
    osu_password: 'Set a collection password\nPublishing to the gallery and importing / exporting will then ask for it',
    osu_refresh_all_title: 'Re-fetch the latest data for every map (star rating, status)',
    tools_group_io: 'Import / export', tools_group_tools: 'Tools & settings',
    howto_summary: 'How does this work?',
    howto_db: '<ol><li>Sort your maps into categories first (the tabs on the right, or auto-generate them in Collection Tools)</li><li>Optional — to keep the collections already on your PC: pick your osu! folder’s collection.db under “Merge existing collection.db” below</li><li>Click “Export collection.db” to download</li><li>Close osu!, then copy the downloaded collection.db into your osu! install folder (replacing the old one)</li><li>Open osu! — your collections are in the game’s Collections list</li></ol><p>.osdb carries beatmap IDs for Collection Manager / osu!Stats, so it needs no per-map hashes.</p>',
    howto_ctools: '<ol><li>Log in with osu! first (top right)</li><li>Generate categories from your account: favourites / most-played / top plays / recent / a specific mapper</li><li>Practice collections: build “what to practise” sets from your scores (push for pp, goal pool, weak spot…); tick “Accurate pp” for a sharper but slower result</li><li>Health check: find duplicates, deleted, non-ranked and diff-count-changed maps</li><li>Everything merges into your collection — then use “Export to osu! Collection” to take it back to the game</li></ol>',
    osu_all_songs: 'All songs', osu_fav: 'Favorites', osu_empty_collection: 'No beatmaps yet', osu_empty_hint: 'Enter a Beatmap ID above to start!', osu_empty_banner_hint: 'Once you collect some, the header banner and page background turn into your beatmap covers.',
    hero_pitch: 'One place to organise your osu! collection: import from the game, auto-build categories from your scores, export straight back to the game.',
    hero_feat_import: "Import the game's collection.db / .osdb", hero_feat_generate: 'Build categories from your osu! account', hero_feat_share: 'Share collections (with preview cards)',
    hero_stat_collections: '{n} public collections', hero_stat_likes: '❤ {n}',
    hero_stat_farm: '{n}+ maps in the farm database',
    hero_v2_stat: '{n} sets · {c} categories',
    hero_login_cta: 'Log in with osu! to pull in your favourites',
    digest_title: 'Since you were away', digest_pp: 'PP {d} (since {from})', digest_notifs: '{n} new updates',
    digest_practice: '{name} {d}pp · {hits}/{total} in your top 100',
    digest_on_this_day: '{years} year(s) ago today, you added "{title}"',
    digest_logged_out: 'Log in and this shows your PP changes, tracked player / mapper activity, and practice-collection results',
    digest_welcome: 'Welcome, {name}! You’re now tracking yourself — we’ll notify you when your PP changes',
    digest_welcome_import: 'Import favourites / most-played',
    digest_streak: '{n}-day improvement streak 🔥',
    digest_goal: 'Goal {target}pp — {remaining} to go ({pct}%)',
    digest_goal_done: '🎉 Goal reached: {target}pp!',
    explore_title: 'Explore more',
    trending_title: 'Trending new songs',
    explore_lookup_d: 'Your total PP, a daily progress curve, compare with friends',
    explore_farm_d: 'A high-pp farm-map list tuned to your bracket',
    explore_gallery_d: 'Browse public collections, import one with a click',
    explore_mapper_d: 'Get notified when a mapper you like ranks a new map',
    explore_replay_d: 'Upload a replay for UR, per-section stats, pp',
    explore_tourney_d: 'Community tournaments from the forum + wyBin',
    osu_empty_fav: 'No favorites yet', osu_empty_fav_hint: 'Click ♥ on beatmaps to add favorites!',
    osu_category_add_prompt: 'Enter new category name:', osu_category_rename_prompt: 'Rename category:',
    osu_category_delete_confirm: 'Delete this category? (Beatmaps stay in your collection — only the tag is removed.)',
    osu_category_add_title: 'Add category', osu_category_rename_title: 'Rename', osu_category_delete_title: 'Delete category',
    osu_category_btn_title: 'Assign to categories...', osu_category_picker_title: 'Choose categories',
    osu_fav_btn_title: 'Add to favorites', osu_unfav_btn_title: 'Remove from favorites', osu_delete_btn_title: 'Remove',
    osu_category_picker_empty: 'No categories yet — click + to add one!', osu_empty_category: 'No beatmaps in this category yet',
    osu_category_manage_title: 'Manage Categories',
    osu_searching: 'Searching...', osu_not_found: 'Beatmap not found. Please check the ID or URL.',
    osu_input_error: 'Enter a Beatmap ID, Set ID, or osu! URL',
    osu_already_exists: '"{n}" is already in your collection', osu_added: 'Added "{n}" to {m} ({k} difficulties)',
    osu_refreshing: 'Refreshing...', osu_refresh_done: 'Updated {n} beatmaps', osu_refresh_fail: 'Refresh failed',
    osu_password_prompt: 'Enter password to modify:', osu_password_wrong: 'Wrong password!',
    osu_set_password: 'Set osu! collection password (leave empty for no protection):',
    osu_confirm_password: 'Confirm password:', osu_password_mismatch: 'Passwords do not match. Cancelled.',
    osu_password_set: 'Password set successfully!',
    osu_copied: 'Copied!', mapped_by: 'mapped by {n}',
    osu_page_title: 'osu! Song Collection + Total PP Lookup', lookup_mode_single: 'Personal lookup', lookup_mode_compare: 'Compare two', visitor_lookup_title: 'Look Up Your osu! PP', visitor_lookup_placeholder: 'Enter osu! username or ID', visitor_lookup_btn: 'Search', osu_login_btn: 'Login with osu!', osu_logout_btn: 'Log out', osu_login_fail: 'osu! login failed, please try again',
    osu_profile_import_confirm: 'Found your osu! account. Import your favourite beatmaps plus your 50 most-played into your collection? (Nothing existing is overwritten.)',
    osu_profile_import_btn_title: 'Pull favourites / most-played from your osu! account\nNeeds login; only adds maps you don’t have, never overwrites',
    osu_profile_importing: 'Importing from your osu! profile... {done}/{total}',
    osu_profile_import_fail: "Couldn't read your osu! profile, please try again later",
    osu_profile_import_empty: 'Your osu! profile has no favourites or most-played sets to import',
    osu_profile_need_login: 'Log in with osu! first',
    osu_profile_cat_favourites: 'Favourites', osu_profile_cat_mostplayed: 'Most played',
    ctools_btn_title: 'Generate categories & practice collections from your scores, plus a health check', ctools_title: 'Collection Tools',
    ctools_gen_hint: 'Generate categories from your osu! account (login required). Everything merges — nothing existing is overwritten.',
    ctools_gen_fav: 'Favourites', ctools_gen_mostplayed: 'Most played 50', ctools_gen_best: 'Top plays 100', ctools_gen_recent: 'Recently played', ctools_gen_mapper: 'Generate',
    ctools_mapper_ph: 'Mapper name or ID',
    ctools_cat_best: 'My top plays', ctools_cat_recent: 'Recently played', ctools_cat_mapper: 'Mapper: {name}',
    ctools_mapper_none: 'No ranked maps found for that mapper', ctools_dedupe_done: 'Removed {n} duplicate(s)',
    practice_hint: 'Build a practice collection from your own scores (login required). Push / Goal use the farm dataset (5.5★+); Accuracy / Similar use your own plays and work at any rank.',
    practice_gen_push: 'Push for pp', practice_gen_goal: 'Goal pool',
    practice_gen_lowacc: 'Accuracy grind', practice_gen_taste: 'More like your top plays', practice_gen_weak: 'Weak spot',
    practice_cat_push: '🎯 Push for pp', practice_cat_goal: '🎯 Goal {target}pp',
    practice_cat_lowacc: '🎯 Accuracy grind', practice_cat_taste: '🎯 Like your top plays', practice_cat_weak: '🎯 Weak spot: {dim}',
    practice_dim_len_short: 'short (<90s)', practice_dim_len_mid: 'mid length (90–150s)', practice_dim_len_long: 'long (>150s)',
    practice_dim_bpm_low: 'low BPM (<160)', practice_dim_bpm_mid: 'mid BPM (160–200)', practice_dim_bpm_high: 'high BPM (>200)',
    practice_dim_ar_low: 'low AR (<8.3)', practice_dim_ar_mid: 'mid AR (8.3–9.3)', practice_dim_ar_high: 'high AR (>9.3)',
    practice_dim_cs_low: 'low CS (<3.7)', practice_dim_cs_mid: 'mid CS (3.7–4.3)', practice_dim_cs_high: 'high CS (>4.3)',
    practice_dim_sr_jump: 'jump (aim-heavy)', practice_dim_sr_bal: 'aim/stream balanced', practice_dim_sr_stream: 'stream (speed-heavy)',
    practice_enrich_strain: 'Analysing your aim/stream lean… ({done}/{total})',
    practice_weak_none: 'Your top plays are evenly spread across length / BPM — no clear weak spot',
    practice_progress_title: 'Practice progress',
    practice_progress_loading: 'Loading practice progress…',
    practice_progress_dpp: 'total pp {d}',
    practice_progress_hits: '{n}/{total} now in your top 100',
    practice_precise_label: 'Accurate pp (slower)', practice_precise_pp: 'Computing pp… ({done}/{total})',
    practice_reading_top: 'Reading your top plays… ({done}/{total})',
    practice_reading_recent: 'Reading recent plays…',
    practice_scanning_farm: 'Scanning the farm pool… ({done}/{total})',
    practice_scanning_mapper: "Scanning a mapper's maps… ({done}/{total})",
    practice_need_more_plays: 'Too few top plays — this needs at least 10',
    practice_goal_need_target: 'Set a target total pp in the PP panel first',
    practice_goal_reached: "You've already hit that target",
    practice_low_coverage: "The farm dataset doesn't cover this difficulty / pp range well enough for a reliable practice collection yet — try again later",
    practice_acc_stable: 'Your top plays are all clean — nothing obvious to grind',
    practice_taste_thin: "Not enough matches — your top plays' mappers may be too spread out",
    ctools_health_hint: 'Scan the collection for duplicates, deleted maps, non-ranked sets, and difficulty-count changes.', ctools_health_scan: 'Scan collection',
    ctools_health_scanning: 'Scanning... {done}/{total}',
    ctools_health_dupes: 'Duplicate sets: {n}', ctools_health_dead: 'Removed from osu!: {n}', ctools_health_diffchanged: 'Difficulty count changed: {n}', ctools_health_nonranked: 'Not ranked (graveyard/pending/etc.): {n}',
    ctools_health_dedupe_btn: 'Remove duplicates', ctools_health_remove_btn: 'Remove', ctools_health_refresh_btn: 'Refresh', ctools_health_ok: 'Collection looks healthy ✓',
    osu_stat_global: 'Global Rank', osu_stat_accuracy: 'Accuracy', osu_stat_playcount: 'Play Count', osu_total_pp: 'Total PP (All Modes)',
    osu_recent_title: 'Recent Plays', osu_top_title: 'Top Plays',
    osu_plays_empty_recent: 'No plays in the last 24 hours', osu_plays_empty_best: 'No top-play data',
    pp_compare_title: 'Compare Two Players', pp_compare_placeholder_a: 'Player A: username or ID', pp_compare_placeholder_b: 'Player B: username or ID', pp_compare_btn: 'Compare', pp_compare_topplays_title: 'Top Play Comparison', pp_compare_topplays_empty: 'No scores in this mode',
    osu_search_placeholder: 'Search by title or artist...', osu_search_empty: 'No matching beatmaps found',
    osu_sort_default: 'Default Order', osu_sort_rating_desc: 'Star Rating (High to Low)', osu_sort_rating_asc: 'Star Rating (Low to High)',
    pp_history_title: 'PP Growth', pp_history_empty: 'Not enough history yet — visit again later to build up the trend.',
    osu_stats_total: 'Total Collected', osu_stats_avg_rating: 'Avg Rating', osu_stats_max_rating: 'Max Rating',
    featured_beatmap_label: 'Featured Today',
    osu_export: 'Download your collection as a JSON backup', osu_import: 'Restore a collection from a JSON backup\nPick a .json you downloaded earlier with Export — adds its maps and categories',
    osu_export_done: 'Collection exported!', osu_import_done: 'Collection imported!', osu_import_fail: 'Import failed. Please check the file format.',
    osu_import_fail_json: 'Import failed: this file is not valid JSON.', osu_import_fail_format: 'Import failed: the file is missing collection data (the "collection" field).',

    osu_download_btn_title: 'Direct download (no-login mirror)',
    mplist_mp_hint: 'Copy this map as an !mp map line for a multiplayer lobby', mplist_mp_copied: 'Copied — paste it in your lobby',
    batch_dl_btn: 'Batch-download this list\'s files', batch_dl_empty: 'This list is empty — nothing to download',
    batch_dl_confirm: 'Download all {n} beatmapsets in this list? This triggers {n} browser downloads one after another — it\'ll take a while, so keep this tab open',
    batch_dl_progress: 'Downloading... {done}/{total}',
    batch_dl_pause_btn: 'Pause download', batch_dl_resume_btn: 'Resume download', batch_dl_paused: 'Paused, {done}/{total}',
    batch_dl_done: 'Done! {done} files saved to your Downloads folder',
    batch_dl_done_errors: 'Done: {done} files, {failed} failed (maybe removed from osu! or a connection issue)',
    batch_dl_hint: 'Downloading several files usually makes the browser show a "allow this site to download multiple files" prompt — click Allow, or every file after the first gets blocked.',
    pp_calc_btn_title: 'PP Calculator & Strain Graph', pp_calc_mods_label: 'Mods', pp_calc_acc_label: 'Accuracy', pp_calc_run: 'Calculate',
    pp_calc_calculating: 'Calculating...', pp_calc_error: 'Calculation failed, please try again later', pp_calc_stars_label: 'Stars',
    pp_calc_strain_title: 'Difficulty Curve', pp_calc_strain_unsupported: 'No strain data available for this beatmap', pp_calc_acc_invalid: 'Enter an accuracy between 0 and 100',
    pp_calc_radar_title: 'Difficulty Radar (with Mods)',
    pp_calc_hint: 'Pick a difficulty, toggle mods, enter an accuracy, then hit "Calculate" to recompute stars and PP, plus see this map\'s difficulty curve below.',
    pp_calc_combo_label: 'Combo', pp_calc_combo_placeholder: 'Full combo', pp_calc_miss_label: 'Misses',
    pp_calc_combo_invalid: 'Please enter a valid combo / miss count', pp_calc_combo_full: 'Full combo ({max}x)', pp_calc_combo_misses: ' · {n} miss(es)',

    osu_share_link_btn: 'Copy a shareable link to your collection', osu_share_link_done: 'Link copied! Share it with friends — opening it lets them import with one click.',
    osu_share_link_fail: 'Failed to generate share link', osu_share_link_empty: 'Your collection is empty — add some beatmaps first',
    osu_share_link_import_confirm: "This link contains {n} beatmap(s). Import them into your collection? (Won't overwrite anything — only adds ones you don't already have.)",
    osu_share_link_imported: 'Imported {n} new beatmap(s)!', osu_share_link_import_fail: 'Failed to import from link — it may be corrupted',
    stats_card_btn: 'Generate Stats Card', stats_card_done: 'Stats card downloaded!', stats_card_fail: 'Failed to generate stats card',
    collection_card_btn: 'Download a PNG preview card of your collection', collection_card_title: 'My osu! Collection', collection_card_done: 'Collection card downloaded!', collection_card_fail: 'Failed to generate collection card',

    nav_public_collections: 'Gallery', gallery_page_title: 'Player Collection Gallery',
    publish_btn: 'Publish My Collection', publish_update_btn: 'Update My Published Collection', publish_login_required: 'Log in with osu! first to publish your collection',
    publish_relogin_prompt: 'Your osu! login has expired (it needs re-verifying every 30 days). Log in again now?',
    publish_confirm: 'Publish your collection ({n} beatmaps) publicly? You can republish or unpublish anytime',
    publish_done: 'Your collection has been published!', publish_fail: 'Failed to publish, please try again later', publish_too_large: 'Your collection is too large to publish. Trim some maps or split it up.',
    unpublish_btn: 'Unpublish', unpublish_confirm: 'Remove your collection from the gallery?', unpublish_done: 'Unpublished',
    gallery_loading: 'Loading gallery...', gallery_load_fail: 'Failed to load the gallery, please try again later',
    gallery_empty: 'No one has published a collection yet — be the first!', gallery_new_badge: 'NEW',
    gallery_sort_recent: 'Recently published', gallery_sort_sets: 'Most beatmaps', gallery_sort_rating: 'Highest star rating',
    gallery_import_confirm: "This is {name}'s collection with {n} beatmaps. Import into your collection? (Won't overwrite existing entries, only adds ones you don't have)",
    gallery_download_btn_title: 'Import this collection', gallery_share_btn: 'Share link', gallery_share_copied: 'Share link copied!', gallery_view_btn_title: 'View beatmap list',
    gallery_scores_btn: 'Overlay my scores', gallery_scores_checking: 'Checking {done}/{total}', gallery_scores_summary: 'You have {have}/{total}',
    gallery_scores_truncated: '(first {n} of {all})', gallery_embed_btn: 'Copy embed code', gallery_embed_copied: 'Embed code copied!',
    gallery_comments_title: 'Comments', gallery_comments_loading: 'Loading comments...', gallery_comments_load_fail: 'Failed to load comments',
    gallery_comments_empty: 'No comments yet — be the first!', gallery_comments_placeholder: 'Write a comment...',
    gallery_comments_send: 'Send', gallery_comments_send_fail: 'Failed to post comment, please try again later',
    gallery_search_placeholder: 'Search by player name or tag...', gallery_sort_likes: '❤ Most liked',
    gallery_liked_only: 'Liked by me only', gallery_like_btn_title: 'Like',
    gallery_like_login_required: 'Log in with osu! to like collections', gallery_like_fail: 'Failed to like, please try again later',
    gallery_no_results: 'No collections match your search — try a different keyword or tag', gallery_tag_filter_clear_title: 'Clear tag filter',

    nav_farm_maps: 'Farm Maps', farm_page_title: 'Farm Maps',
    farm_hint: 'Filter the ranked map pool by PP / star rating / BPM / mods. PP is computed by this site itself (not estimated, assuming an SS play) — the dataset is still growing and may not cover every ranked map yet.',
    farm_search_placeholder: 'Search title or artist...',
    farm_sort_pp_desc: 'PP: high to low', farm_sort_pp_asc: 'PP: low to high',
    farm_sort_star_desc: 'Stars: high to low', farm_sort_star_asc: 'Stars: low to high',
    farm_sort_bpm_desc: 'BPM: high to low', farm_sort_length_desc: 'Length: long to short', farm_sort_new_desc: 'Newest added',
    farm_filter_length: 'sec', farm_add_btn_title: 'Add to collection', farm_in_collection: 'Already in your collection',
    farm_load_fail: 'Failed to load Farm Maps, try again later', farm_empty: 'No maps match these filters — try loosening them',
    farm_coverage_pending: 'The dataset is still being built, check back soon',
    farm_coverage: '{n} maps indexed · last updated {t} (dataset still growing, not yet covering every ranked map)',
    farm_only_toggle: '🔥 Farm maps only',
    farm_only_toggle_title: 'Farm call from the Top 50 board by share of easy/pp-cheese clears — DT for osu!/taiko, DT & HR for catch, DT & non-SS full combos for mania; the bar loosens as star rating rises (needs ≥ 500 plays)',
    farm_coverage_farm: '({n} classified as farm maps out of {c} scored so far)',

    cdn_lib_fail: 'A required component failed to load — check your connection and retry',
    nav_catalog: 'Catalog', explore_catalog_d: 'Browse the whole ranked catalog by artist / language / genre — one click to a collection',
    catalog_page_title: 'Catalog',
    catalog_hint: 'Browse the entire ranked catalog by artist / language / genre / source / feat. Pick one facet and turn it into a collection category in one click. The index is built by this site\'s background crawler and does not cover every ranked map yet.',
    catalog_search_placeholder: 'Search title / artist / source...',
    catalog_sort_ranked_desc: 'Ranked date: newest', catalog_sort_ranked_asc: 'Ranked date: oldest',
    catalog_sort_title_asc: 'Title A→Z', catalog_sort_artist_asc: 'Artist A→Z',
    catalog_mode_all: 'All modes', catalog_nsfw_toggle: 'Include 18+',
    catalog_coverage: '{n} beatmapsets indexed · last updated {t} · {m} match the current filter (dataset still growing, not yet every ranked map)',
    catalog_coverage_pending: 'The dataset is still being prepared — check back soon',
    catalog_empty: 'No beatmapsets match — try a different filter',
    catalog_load_fail: 'Failed to load the catalog, try again later',
    catalog_combo_no_match: 'No matching results', catalog_combo_more_hint: '{n} more results — keep typing to narrow it down',
    catalog_create_collection_btn: '➕ Make a collection from this facet',
    catalog_smart_toggle: 'Make it a dynamic category', smart_cat_badge: 'Dynamic', smart_cat_last_sync: 'Last synced {d}', smart_cat_refresh_btn: 'Pull in newly ranked maps', smart_cat_detach: 'Make static', smart_cat_detach_confirm: 'Stop keeping this category in sync? (collected maps stay)', smart_cat_no_new: 'No new matching maps', smart_cat_synced: 'Added {n} new maps',
    catalog_create_collection_hint: 'Pick one artist / language / genre / source first to build a matching collection category',
    catalog_create_collection_confirm: 'Add the {n} beatmapsets of "{name}" to your collection and create a category with that name?',
    catalog_create_collection_done: 'Added "{name}" to your collection: {n} new beatmapsets, {cat} categories',
    catalog_completion_have: '"{name}" — you\'ve collected {have} / {total}',
    catalog_completion_meta_note: 'Source / genre / language are judged from your collection\'s metadata, which may undercount until it finishes filling in',
    catalog_complete_btn: '➕ Fill the gap ({n} left)',
    catalog_complete_done: 'All collected ✓',
    catalog_meta_backfill_btn: 'Fill in {n}',

    nav_mappools: 'World Cup Pools',
    nav_cmpool: 'Community mappools',
    nav_games: 'Mini-games',
    games_back: 'Back',
    games_daily_prompt: '{n} tries left',
    games_quiz_title: 'Genre Rush',
    games_quiz_blurb: 'A map appears, tap its genre. 60 seconds, score as many as you can.',
    games_quiz_prompt: 'Which genre is this?',
    games_quiz_time: '{n}s',
    games_quiz_score: '{n} correct',
    games_quiz_over: 'Time! {n} correct.',
    games_quiz_best: 'Best {n}',
    games_quiz_again: 'Play again',
    games_quiz_correct_was: 'It was {name}',
    games_quiz_no_data: 'Not enough map data yet, try later.',
    games_page_title: 'Mini-games',
    games_hint: 'Small games built on the site’s own catalog and Farm data. Maps you like can be added to your collection — it always asks first.',
    games_daily_title: 'Daily Guess',
    games_daily_blurb: 'One ranked set a day — name it from a blurry cover, with a hint per wrong guess.',
    games_hilo_title: 'Higher or Lower',
    games_hilo_blurb: 'Two Farm maps — pick which one scores higher. Endless, streak-based.',
    games_daily_not_ready: 'Today’s puzzle isn’t ready yet, try again in a minute.',
    games_daily_input_ph: 'Song or map title…',
    games_daily_guess_btn: 'Guess',
    games_daily_win: 'Got it in {n}!',
    games_daily_lose: 'Out of guesses.',
    games_daily_share: 'Copy result',
    games_daily_copied: 'Result copied to clipboard',
    games_daily_streak: '{n}-day streak',
    games_daily_clip: 'Play {s}s',
    games_hint_genre: 'Genre',
    games_hint_lang: 'Language',
    games_hint_year: 'Ranked',
    games_hint_sr: 'Star rating',
    games_hint_mapper: 'Mapper',
    games_hilo_ask: 'Higher {stat}?',
    games_hilo_higher: 'Higher',
    games_hilo_lower: 'Lower',
    games_hilo_next: 'Next',
    games_hilo_again: 'Play again',
    games_hilo_over: 'Streak ended at {n}.',
    games_hilo_best: 'Best {n}',
    games_hilo_streak: 'Streak {n}',
    games_hilo_no_data: 'Not enough map data yet, try later.',
    games_stat_sr: 'star rating',
    games_stat_bpm: 'BPM',
    games_stat_len: 'length',
    games_stat_pp: 'farm PP',
    games_stat_plays: 'play count',
    games_save_btn: 'Add to collection',
    games_save_confirm: 'Add this beatmapset to your collection?',
    games_board_title: 'Leaderboard',
    games_board_empty: 'No scores yet — be the first!',
    games_board_login: 'Log in and your scores go on the board',
    games_save_category: 'From mini-games',
    games_save_done: 'Added {n} set(s) to your collection',
    mappools_page_title: 'World Cup Mappools',
    mappools_hint: 'Official mappools from every osu! World Cup (OWC / TWC / MWC 4K & 7K / CWC), pulled from the osu! wiki. Pick an edition, then turn a whole event — or a single round — into a collection category in one click.',
    cmpool_page_title: 'Community Mappools',
    cmpool_hint: 'Community-filled tournament mappools — pick a tournament you played, add rounds and mod brackets, drop in beatmap ids and the site pulls the metadata. Sign in to edit.',
    cmpool_pick_from_list: 'Pick a tournament from the list…',
    cmpool_source_label: 'Source', cmpool_mode_label: 'Mode', cmpool_mode_all: 'All modes',
    cmpool_source_wybin: 'wyBin', cmpool_source_forum: 'Forum', cmpool_source_custom: 'Custom',
    cmpool_importing: 'Importing the pool from wyBin…',
    cmpool_imported_n: 'Imported {n} maps from wyBin',
    cmpool_import_none: 'wyBin has no pool data for this tournament — fill it in by hand',
    cmpool_search_ph: 'Search existing tournament pools…',
    cmpool_new_btn: '＋ New / join a tournament',
    cmpool_create_name_ph: 'Tournament name (pick from the list, or type your own)',
    cmpool_create_go: 'Create',
    cmpool_create_cancel: 'Cancel',
    cmpool_need_name: 'Enter a tournament name',
    cmpool_empty: 'No tournament pools yet — be the first to start one.',
    cmpool_no_match: 'No pool matches that search.',
    cmpool_row_meta: '{r} rounds · {n} maps', cmpool_card_rounds: '{n} rounds', cmpool_card_maps: '{n} maps',
    cmpool_back: 'All tournaments',
    cmpool_contributors: '{n} contributors',
    cmpool_open_tournament: 'Tournament page',
    cmpool_delete_pool: 'Delete pool',
    cmpool_reset_wybin: 'Re-sync from wyBin', cmpool_reset_wybin_hint: 'Re-import from wyBin and let the crawler maintain this pool again', cmpool_reset_wybin_confirm: 'Re-import this pool from wyBin? Any manual edits to it are discarded and the crawler takes over again.',
    cmpool_delete_confirm: 'Delete this whole tournament pool? This cannot be undone.',
    cmpool_login_to_fill: 'Sign in to add rounds and maps.',
    cmpool_add_round: 'Add round:',
    cmpool_custom_round_ph: 'custom round…',
    cmpool_add_bracket: 'Add mod:',
    cmpool_custom_bracket_ph: 'custom mod…',
    cmpool_add_map_ph: 'Paste a beatmap difficulty link or id',
    cmpool_bulk_hint: 'Paste many beatmap links or ids at once',
    cmpool_bulk_ph: 'Paste beatmap difficulty links or ids — one per line. Prefixes like "NM1:" are fine.',
    cmpool_bulk_add: 'Add all',
    cmpool_bulk_working: 'Working…',
    cmpool_bulk_added: '{n} added',
    cmpool_bulk_dupes: '{n} already here',
    cmpool_bulk_unresolved: '{n} not recognised',
    cmpool_bulk_overflow: '{n} over the limit',
    cmpool_remove_map: 'Remove this map',
    cmpool_remove_bracket: 'Remove this mod bracket',
    cmpool_remove_round: 'Remove this round',
    mappools_add_event_btn: '➕ Add whole event',
    mappools_round_add_btn: '➕ This round',
    mappools_add_confirm: 'Add the {n} beatmap sets from "{name}" to your collection and create a category with that name?',
    mappools_add_done: 'Added "{name}" to your collection: {n} new sets, {cat} categories',
    mappools_mappack: 'Mappack',
    mappools_showcase: 'Showcase',
    mappools_empty: 'No mappool to show for this edition yet',
    mappools_load_fail: 'Failed to load the mappool, try again later',
    mappools_coverage: '{e} World Cup editions indexed · {n} maps · updated {t}',
    mappools_stats: '{r} rounds · {n} maps',
    mappools_copy_id: 'Copy ID',
    mappools_preview: 'Preview',

    pp_goal_tab: 'PP Goal', pp_goal_hint: 'Current {mode} total PP: {current}pp. Enter a target to see the minimum PP a new play needs.',
    pp_goal_placeholder: 'Target total PP', pp_goal_btn: 'Calculate', pp_goal_invalid: 'Please enter a valid target PP',
    pp_goal_achieved: '🎉 Already there!', pp_goal_result_label: 'New play needs at least',

    collection_db_btn_title: 'Export a collection.db to drop straight into osu!', collection_db_title: '📦 Export to osu! Collection',
    collection_compare_btn_title: 'Upload an old JSON backup to see what changed since then', collection_compare_title: 'Collection Diff',
    collection_compare_hint: 'Upload an old backup from the "Download collection as JSON" button to see what was added or removed compared to your current collection — this only compares, it never touches your current collection.',
    collection_compare_no_diff: 'Both collections are identical — no differences',
    collection_io_title: 'osu! Game Collections (import / export)',
    collection_io_import_hint: "Import from the game's collection.db (in your osu! folder) or a shared .osdb. Only adds sets you don't already have, and creates a category per collection name — nothing you already have is overwritten.",
    collection_io_import_btn: 'Choose a .db / .osdb file to import', collection_io_osdb_btn: 'Export .osdb',
    collection_io_osdb_done: '.osdb exported! Import it in-game with Collection Manager or osu!Stats',
    collection_io_importing: 'Importing beatmaps... {done}/{total}',
    collection_io_import_done: 'Import done: +{sets} sets, {cats} categories ({missed} couldn\'t be matched)',
    collection_io_bad_file: "Couldn't read that file — it isn't a valid collection.db or .osdb",
    collection_io_osdb_unsupported: 'That .osdb version isn\'t supported — re-export it from a newer Collection Manager',
    collection_db_hint: "Builds a collection.db your osu! client can read straight from your categories (including Favorites) — download it and drop it into your osu! folder. This replaces your existing collection.db, so if you want to keep what's already there, upload it below to merge first (same-named collections get overwritten, everything else stays untouched).",
    collection_db_merge_label: 'Merge with existing collection.db (optional)', collection_db_export_btn: 'Export collection.db',
    collection_db_empty: 'Your collection is empty — nothing to export', collection_db_fetching: 'Fetching beatmap info... {done}/{total}',
    collection_db_all_name: 'osu! Collection', collection_db_done: 'Export complete! Copy collection.db into your osu! folder',

    stats_dashboard_btn_title: 'See star / mode / mapper breakdown charts', stats_dashboard_title: 'Collection Stats Dashboard',
    stats_dashboard_empty: 'Your collection is empty — nothing to show yet', stats_dashboard_stars_title: 'Star rating distribution',
    stats_dashboard_modes_title: 'Mode split', stats_dashboard_mappers_title: 'Top 10 mappers',
    stats_dashboard_growth_title: 'Collection growth', stats_dashboard_growth_baseline: 'Already had',
    stats_dashboard_genre_title: 'Genre mix', stats_dashboard_bpm_title: 'BPM spread', stats_dashboard_length_title: 'Length spread',
    achievements_title: 'Achievements',
    ach_starter_name: 'Getting Started', ach_starter_desc: 'Add your first beatmap',
    ach_collector_200_name: 'Collector', ach_collector_200_desc: 'Reach 200 beatmaps',
    ach_collector_500_name: 'Master Collector', ach_collector_500_desc: 'Reach 500 beatmaps',
    ach_all_modes_name: 'All-Rounder', ach_all_modes_desc: 'Have at least one map in every mode',
    ach_favorites_10_name: 'Favorite Fan', ach_favorites_10_desc: 'Favorite 10 beatmaps',
    ach_polyglot_name: 'Polyglot', ach_polyglot_desc: 'Collect maps in 5+ languages',
    ach_practice_name: 'Practice Nerd', ach_practice_desc: 'Create a practice collection',
    ach_sharer_name: 'Sharer', ach_sharer_desc: 'Publish to the gallery',

    leaderboard_btn: 'Leaderboard', leaderboard_title: 'Tracked Players Leaderboard',

    tracked_mappers_title: 'Tracked Mappers', tracked_mappers_hint: "Enter a mapper's osu! username — you'll be notified when they rank a new map.",
    mapper_track_placeholder: "Enter mapper's username...", mapper_track_btn: 'Track',
    mapper_already_tracked: "You're already tracking this mapper", mapper_track_done: "Tracking added — you'll be notified about new maps",
    mapper_not_found: "Couldn't find that osu! player — check the username",
    tracked_mappers_empty: "You're not tracking any mappers yet", notif_mapper_new_title: '{name} ranked a new map',
    notif_achievement_new_title: '{n} earned a new medal', notif_achievement_detail: '{count} new medal(s) — click to view',
    notif_mapper_graveyard_title: '{name} has a new graveyard map', notif_mapper_loved_title: "{name}'s map got Loved!",
    resources_title: 'More osu! Resources', resources_hint: "A few community tools worth knowing about — no need to reinvent them here:",
    h1_bbcode: 'BBCode Editor', bbcode_note: 'Runs entirely in your browser — nothing is sent anywhere. Copy the result into your osu! profile/forum post editor.', bbcode_source: 'BBCode', bbcode_preview: 'Preview', bbcode_copy: 'Copy BBCode', bbcode_clear: 'Clear', bbcode_placeholder: 'Write your BBCode here…', bbcode_copied: 'Copied!',
    resource_group_find: 'Finding maps', resource_group_stats: 'Stats & tracking', resource_group_make: 'Skins & mapping',
    resource_osusearch_desc: 'Advanced beatmap search by star rating, BPM, length, and more', resource_osupps_desc: 'Another farm-map tracker — a good point of comparison',
    resource_maniatracker_desc: 'osu!mania rankings, score tracking and a dan-level estimator',
    resource_catchtracker_desc: 'Taiwan osu!catch rankings, a live score feed, and per-map stats',
    resource_osutrack_desc: 'Long-term stat history — pp, rank and accuracy graphed over time',
    resource_osudaily_desc: 'Rank ↔ pp lookups and long-term rank history for every mode',
    resource_osekai_desc: 'Medal solutions and alternative rankings (badges, ranked maps, and more)',
    resource_osustats_desc: 'Counts your leaderboard placements — how many top-50s / top-100s you hold',
    resource_collectionmanager_desc: "Desktop collection editor, compatible with this site's collection.db export", resource_osuskinner_desc: 'Online skin builder',
    resource_mappersguild_desc: 'Guild system encouraging mapping of featured artists', resource_osuskills_desc: 'Unofficial per-skill player rating (aim / speed / acc)',
    nav_medals: 'Medals', medals_title: 'Medal Gallery',
    medals_hint: "After looking up a player, every osu! medal shows up here with theirs marked as earned (data from osekai.net)",
    medals_loading: 'Loading medal data...', medals_load_fail: 'Failed to load medal data, try again later',
    medals_earned_label: '{n} / {total} earned', medals_filter_all: 'All', medals_filter_earned: 'Earned', medals_filter_missing: 'Missing',
    medals_search_placeholder: 'Search medal names...', medals_empty: 'No matching medals', medals_rarity: '{p}% rarity',
    medals_need_lookup: 'Look up a player on the PP Lookup page first',
    grade_history_tab: 'Grade History', grade_history_need_lookup: 'Look up a player on the PP Lookup page first',
    grade_history_loading: 'Loading grade history...', grade_history_load_fail: 'Failed to load grade history, try again later',
    grade_history_note: "Data comes from the third-party tracker osu!Track — it can only show scores it happened to record, and isn't guaranteed to be complete (osu!'s own API has no full score history).",
    grade_history_empty: 'osu!Track has no records for this player in this mode',
    grade_history_filter_empty: 'No records match this grade',
    grade_history_filter_all: 'All',
    grade_history_truncated: 'Showing the latest {n} of {total}',
    nav_replay_analyze: 'Replay Analyzer', replay_analyze_title: 'Replay Analyzer',
    replay_analyze_hint: 'Upload a .osr file to see a score summary and hit-timing chart. Parsed entirely on the server from the file itself — no video rendering, no third-party render service.',
    replay_upload_btn: 'Choose .osr file', replay_upload_drag_hint: 'or drop a file here',
    replay_analyzing: 'Analyzing...', replay_analyze_fail: 'Analysis failed — make sure the file is a valid .osr',
    replay_no_beatmap_match: "Couldn't find this beatmap in osu!'s database — it may be unranked or a custom map",
    replay_score_summary_title: 'Score Summary', replay_recalculated_pp_label: 'Recalculated PP',
    replay_hit_error_title: 'Hit timing distribution (approximate)', replay_hit_error_unsupported: 'Hit-timing analysis isn\'t supported for this mode or replay',
    replay_stat_accuracy: 'Accuracy', replay_stat_combo: 'Max Combo', replay_stat_misses: 'Misses',
    replay_stat_mods: 'Mods', replay_stat_rank: 'Rank', replay_stat_player: 'Player',
    replay_approx_note: "Hit timing is estimated by matching key presses to nearby beatmap notes — it's not a full judgement replay, just a reference.",

    fc_sim_btn: 'FC sim', fc_sim_btn_title: 'Estimate PP if this map were FC\'d',
    fc_sim_popover_title: 'PP if FC', fc_sim_loading: 'Calculating...', fc_sim_error: 'Calculation failed, please try again later',

    check_played_btn_title: "Mark which maps on this page you've played\nNeeds osu! login; checks your best score on each map", play_status_unplayed_title: "You haven't played this map yet (hardest difficulty)",

    play_status_played_title: 'You\'ve played this map, rank {rank}', play_status_fc_title: "You've FC'd this map, rank {rank}",

    local_db_btn_title: "Upload your osu!.db to mark which maps you already have\nosu! stable only, usually at %localappdata%\\osu!\\osu!.db",
    local_db_copy_path_title: "Copy the osu!.db path — paste it into the file picker's filename field to jump straight there\n%localappdata%\\osu!\\osu!.db",
    local_db_path_copied: "Path copied — paste it into the file picker's filename field",
    local_db_fail: "Couldn't read that file — make sure it's osu! stable's osu!.db",
    local_db_none: 'No beatmaps found in that file',
    local_db_done: 'Matched against your local database: {n} beatmapsets found',
    local_db_matched_title: 'Already in your local osu!.db',

    pp_race_title: 'PP Race',

    nav_skin_screenshots: 'Skin Plaza',
    ssc_page_title: 'Skin Screenshot Plaza',
    ssc_page_hint: "Share real in-game screenshots of skins for others to browse — provide a download link or upload the .osk file (at least one) so others can actually get the skin.",
    ssc_upload_title: 'Share My Skin Screenshot',
    ssc_upload_name_placeholder: 'Skin name', ssc_upload_author_placeholder: 'Author (optional)', ssc_upload_url_placeholder: 'Download link',
    ssc_upload_link_or_file_hint: "Provide a download link, or upload the .osk file directly — at least one is required so others can get the skin (.osk capped at 2.5MB; use a link instead for larger skins).",
    ssc_osk_selected: 'Selected: {name}', ssc_osk_too_large: '.osk file exceeds the {limit}MB limit — use a download link instead',
    ssc_upload_btn: 'Publish Screenshot',
    ssc_search_placeholder: 'Search by skin name or author...',
    ssc_filter_all: 'All',
    ssc_mine_only: 'Only mine',
    ssc_login_required: 'Please log in with osu! first',
    ssc_name_required: 'Enter a skin name', ssc_image_required: 'Choose a screenshot', ssc_url_invalid: 'Download link must start with http:// or https://',
    ssc_link_or_file_required: 'Provide a download link or upload the .osk file (at least one)',
    ssc_uploading: 'Uploading...', ssc_upload_done: 'Screenshot published!', ssc_upload_fail: 'Upload failed',
    ssc_loading: 'Loading screenshot plaza...', ssc_load_fail: 'Failed to load screenshot plaza, please try again later',
    ssc_no_results: 'No screenshots match', ssc_empty: 'No one has shared a skin screenshot yet — be the first!',
    ssc_by_author: 'by {author}',
    ssc_download_link_title: 'Get skin', ssc_download_file_title: 'Download .osk',
    ssc_delete_btn_title: 'Delete this screenshot', ssc_delete_confirm: 'Delete this screenshot?', ssc_delete_done: 'Deleted', ssc_delete_fail: 'Delete failed',
};
