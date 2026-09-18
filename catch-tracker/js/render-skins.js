let _page = 0;
let _q = '';
let _mineOnly = false;
let _hasPreviewOnly = false;
let _searchDebounce = null;

const MAX_OSK_BYTES = 3 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 1.5 * 1024 * 1024;

function fmtBytes(n) {
    if (n == null) return '—';
    if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
    return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function skinCard(item) {
    const cover = item.hasPreview ? `/.netlify/functions/skins-image?id=${encodeURIComponent(item.id)}` : null;
    const style = cover ? ` style="background-image:url('${cover}')"` : '';
    const placeholder = cover ? '' : `<svg class="skin-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3l-4 3v3h3v12h10V9h3V6l-4-3"/><path d="M9 3a3 3 0 0 0 6 0"/></svg>`;
    return `<div class="map-card skin-card">
        <div class="map-card-cover"${style}>${placeholder}</div>
        <div class="map-card-body">
            <div class="map-title">${escapeHtml(item.name || '')}</div>
            <div class="map-artist">${escapeHtml(t('skins_by', { name: item.uploaderName || 'Anonymous' }))}</div>
            <div class="map-meta">${fmtBytes(item.fileSize)} · ${escapeHtml(t('skins_downloads_count', { n: item.downloadCount || 0 }))} · ${relTime(item.uploadedAt)}</div>
            <a class="pill toggle skin-download-btn" href="/.netlify/functions/skins-download?id=${encodeURIComponent(item.id)}">${escapeHtml(t('skins_download_btn'))}</a>
        </div>
    </div>`;
}

async function loadSkins() {
    const grid = document.getElementById('skins-grid');
    const note = document.getElementById('coverage-note');
    try {
        const loggedInUser = typeof getCtLoggedInUser === 'function' ? getCtLoggedInUser() : null;
        const data = await apiGet('skins-list', {
            page: _page, limit: 16,
            q: _q || undefined,
            uploader: (_mineOnly && loggedInUser) ? loggedInUser.username : undefined,
            hasPreview: _hasPreviewOnly ? '1' : undefined,
            sort: document.getElementById('skins-sort').value,
        });

        grid.innerHTML = data.items.length
            ? data.items.map(skinCard).join('')
            : `<p class="empty-state">${t('empty_skins')}</p>`;

        note.textContent = t('coverage_skins', { n: data.total });

        document.getElementById('page-label').textContent = t('page_label', { n: _page + 1 });
        document.getElementById('prev-page').disabled = _page === 0;
        document.getElementById('next-page').disabled = (_page + 1) * 16 >= data.total;
    } catch (err) {
        note.textContent = t('failed_skins');
    }
}

document.getElementById('prev-page').addEventListener('click', () => { if (_page > 0) { _page--; loadSkins(); } });
document.getElementById('next-page').addEventListener('click', () => { _page++; loadSkins(); });
document.getElementById('skins-sort').addEventListener('change', () => { _page = 0; loadSkins(); });
document.getElementById('skins-search').addEventListener('input', (e) => {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => { _q = e.target.value.trim(); _page = 0; loadSkins(); }, 300);
});

// "我的上傳" only makes sense once logged in — uploaderName is a free-text
// field (no account-tied ownership), so this filters on an exact match
// against your osu! username rather than anything stronger.
const mineBtn = document.getElementById('filter-mine');
const loggedInUser = typeof getCtLoggedInUser === 'function' ? getCtLoggedInUser() : null;
if (loggedInUser) {
    mineBtn.hidden = false;
    const uploaderInput = document.getElementById('skin-uploader');
    if (uploaderInput && !uploaderInput.value) uploaderInput.value = loggedInUser.username || '';
}
mineBtn.addEventListener('click', () => {
    _mineOnly = !_mineOnly;
    mineBtn.classList.toggle('active', _mineOnly);
    _page = 0;
    loadSkins();
});

document.getElementById('filter-has-preview').addEventListener('click', (e) => {
    _hasPreviewOnly = !_hasPreviewOnly;
    e.currentTarget.classList.toggle('active', _hasPreviewOnly);
    _page = 0;
    loadSkins();
});

/* ---------- upload form ---------- */

document.getElementById('toggle-upload').addEventListener('click', () => {
    const form = document.getElementById('upload-form');
    form.hidden = !form.hidden;
});

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

document.getElementById('submit-upload').addEventListener('click', async () => {
    const status = document.getElementById('upload-status');
    const name = document.getElementById('skin-name').value.trim();
    const uploaderName = document.getElementById('skin-uploader').value.trim();
    const fileInput = document.getElementById('skin-file');
    const previewInput = document.getElementById('skin-preview');
    const oskFile = fileInput.files[0];
    const previewFile = previewInput.files[0];

    if (!name) { status.textContent = t('skins_missing_name'); status.style.color = 'var(--danger)'; return; }
    if (!oskFile) { status.textContent = t('skins_missing_file'); status.style.color = 'var(--danger)'; return; }
    if (oskFile.size > MAX_OSK_BYTES) { status.textContent = t('skins_file_too_large', { mb: 3 }); status.style.color = 'var(--danger)'; return; }
    if (previewFile && previewFile.size > MAX_PREVIEW_BYTES) { status.textContent = t('skins_file_too_large', { mb: 1.5 }); status.style.color = 'var(--danger)'; return; }

    status.style.color = 'var(--text-dim)';
    status.textContent = t('skins_uploading');

    try {
        const oskBase64 = await fileToBase64(oskFile);
        const previewBase64 = previewFile ? await fileToBase64(previewFile) : undefined;

        const res = await fetch('/.netlify/functions/skins-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, uploaderName, oskBase64, previewBase64 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.status);

        status.style.color = 'var(--success)';
        status.textContent = t('skins_upload_success');
        document.getElementById('skin-name').value = '';
        document.getElementById('skin-uploader').value = '';
        fileInput.value = '';
        previewInput.value = '';
        _page = 0;
        loadSkins();
    } catch (err) {
        status.style.color = 'var(--danger)';
        status.textContent = t('skins_upload_failed', { msg: err.message });
    }
});

loadSkins();
