        </div><!-- #pjax-content -->
    </main>
</div>

<script>
/**
 * PJAX — instant page navigation with background prefetch.
 *
 * How it works:
 * 1. First page loads normally (full HTML).
 * 2. After page is idle, ALL sidebar pages are quietly fetched in the background.
 * 3. When user clicks a tab, the content is served from memory → INSTANT swap.
 * 4. If cache miss (new link, expired), falls back to live fetch with loading bar.
 * 5. After any navigation, the NEW page's sidebar links are prefetched too.
 *
 * Result: first click might take ~1s. Every click after that is instant.
 */
(function(){
    const bar = document.getElementById('pjax-bar');
    const content = document.getElementById('pjax-content');
    if (!bar || !content) return;

    let currentXHR = null;

    // ── Page cache ──────────────────────────────────
    const cache = new Map();         // url → { html, title, time }
    const CACHE_TTL = 120000;        // 2 minutes — data stays fresh enough
    const prefetching = new Set();   // URLs currently being fetched

    function cacheGet(url) {
        const entry = cache.get(url);
        if (!entry) return null;
        if (Date.now() - entry.time > CACHE_TTL) { cache.delete(url); return null; }
        return entry;
    }
    function cacheSet(url, html, title) {
        cache.set(url, { html, title, time: Date.now() });
    }

    // ── Loading bar helpers ─────────────────────────
    function barStart() {
        bar.style.width = '0%';
        bar.offsetWidth;
        bar.classList.add('loading');
        bar.style.width = '30%';
        setTimeout(() => { if (bar.classList.contains('loading')) bar.style.width = '60%'; }, 200);
        setTimeout(() => { if (bar.classList.contains('loading')) bar.style.width = '85%'; }, 600);
    }
    function barFinish() {
        bar.style.width = '100%';
        bar.classList.remove('loading');
        setTimeout(() => { bar.style.opacity = '0'; setTimeout(() => { bar.style.width = '0%'; bar.style.opacity = ''; }, 150); }, 200);
    }
    function barError() {
        bar.style.background = '#ef4444';
        bar.style.width = '100%';
        bar.classList.remove('loading');
        setTimeout(() => { bar.style.opacity = '0'; setTimeout(() => { bar.style.width = '0%'; bar.style.opacity = ''; bar.style.background = ''; }, 150); }, 800);
    }

    // ── Update sidebar active state ─────────────────
    function updateSidebar(url) {
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.classList.remove('bg-emerald-50', 'text-emerald-700', 'font-semibold');
            link.classList.add('text-gray-600', 'hover:bg-gray-50');
            if (link.href === url || url.startsWith(link.href + '?') || url.startsWith(link.href + '/')) {
                link.classList.add('bg-emerald-50', 'text-emerald-700', 'font-semibold');
                link.classList.remove('text-gray-600', 'hover:bg-gray-50');
            }
        });
        // Keep the collapsible group that holds the active link expanded.
        document.querySelectorAll('.nav-group').forEach(g => {
            if (g.querySelector('.sidebar-link.bg-emerald-50')) g.classList.add('open');
        });
    }

    // ── Extract content from fetched HTML ───────────
    function extractContent(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newContent = doc.getElementById('pjax-content');
        const newTitle = doc.querySelector('title');
        return {
            html: newContent ? newContent.innerHTML : null,
            title: newTitle ? newTitle.textContent : document.title
        };
    }

    // ── Execute inline scripts in new content ───────
    //
    // The original implementation replaced the inert <script> with a fresh
    // one in place (replaceChild). In practice that was unreliable — Chrome
    // sometimes treated the new node as already-started and never executed
    // it, leaving function declarations (editExpense, editGroup, …) missing
    // on every page that put helpers in a bottom <script>.
    //
    // Appending to document.head is the well-known robust pattern: a fresh
    // script element added to <head> always executes, and its function
    // declarations land on window as expected.
    function runScripts(container) {
        container.querySelectorAll('script').forEach(old => {
            try {
                const s = document.createElement('script');
                // Carry over type/async/defer/etc. so external scripts behave.
                for (const attr of old.attributes) {
                    s.setAttribute(attr.name, attr.value);
                }
                if (!old.src) {
                    s.textContent = old.textContent || '';
                }
                document.head.appendChild(s);
                if (old.parentNode) old.parentNode.removeChild(old);
            } catch (err) {
                console.error('PJAX runScripts error:', err);
            }
        });
    }

    // ── Swap content into page ──────────────────────
    function applyContent(extracted, url, pushState) {
        if (!extracted.html) {
            window.location.href = url;
            return;
        }
        content.innerHTML = extracted.html;
        document.title = extracted.title;
        runScripts(content);
        if (pushState !== false) {
            history.pushState({ pjax: true }, '', url);
        }
        content.classList.remove('loading');
        barFinish();
        currentXHR = null;
        window.scrollTo({ top: 0 });
    }

    // ── Core PJAX navigation ────────────────────────
    function navigate(url, pushState) {
        if (currentXHR) currentXHR.abort();

        // Immediately update sidebar
        updateSidebar(url);

        // Check cache first — if hit, swap INSTANTLY (no loading bar)
        const cached = cacheGet(url);
        if (cached) {
            content.innerHTML = cached.html;
            document.title = cached.title;
            runScripts(content);
            if (pushState !== false) {
                history.pushState({ pjax: true }, '', url);
            }
            // CRITICAL: clear any loading state left by an aborted in-flight
            // navigation. Without this, "click slow page → click cached page"
            // left the content faded at pointer-events:none — a frozen page.
            content.classList.remove('loading');
            barFinish();
            window.scrollTo({ top: 0 });
            // Refresh this page's cache in background for next time
            prefetchUrl(url);
            return;
        }

        // Cache miss — show loading bar and fetch live
        barStart();
        content.classList.add('loading');

        const controller = new AbortController();
        currentXHR = controller;

        // Watchdog: flaky mobile connections can stall a fetch for minutes
        // with no error, leaving the page frozen in its loading state. After
        // 20s we abort and fall back to a normal full navigation — which the
        // browser can always recover from.
        let timedOut = false;
        const watchdog = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);

        fetch(url, {
            signal: controller.signal,
            headers: { 'X-PJAX': '1' },
            credentials: 'same-origin'
        })
        .then(r => {
            clearTimeout(watchdog);
            if (!r.ok) throw new Error(r.status);
            if (r.redirected) { window.location.href = r.url; return null; }
            return r.text();
        })
        .then(html => {
            if (html === null) return;
            const extracted = extractContent(html);
            if (extracted.html) {
                cacheSet(url, extracted.html, extracted.title);
            }
            applyContent(extracted, url, pushState);
        })
        .catch(err => {
            clearTimeout(watchdog);
            // Superseded by a newer click — the newer navigation owns the UI.
            if (err.name === 'AbortError' && !timedOut) return;
            barError();
            content.classList.remove('loading');
            window.location.href = url;
        });
    }

    // ── Last-resort valve ───────────────────────────
    // If the loading state somehow persists for ~25s (any failure path we
    // haven't imagined), recover with a plain reload instead of leaving the
    // user staring at a frozen, unclickable page.
    let stuckTicks = 0;
    setInterval(() => {
        if (content.classList.contains('loading')) {
            if (++stuckTicks >= 5) { stuckTicks = 0; window.location.reload(); }
        } else {
            stuckTicks = 0;
        }
    }, 5000);

    // ── Background prefetch ─────────────────────────
    function prefetchUrl(url) {
        if (prefetching.has(url)) return;
        prefetching.add(url);

        fetch(url, { credentials: 'same-origin', headers: { 'X-PJAX': '1' } })
        .then(r => r.ok && !r.redirected ? r.text() : null)
        .then(html => {
            prefetching.delete(url);
            if (!html) return;
            const extracted = extractContent(html);
            if (extracted.html) {
                cacheSet(url, extracted.html, extracted.title);
            }
        })
        .catch(() => prefetching.delete(url));
    }

    function prefetchAllSidebar() {
        const links = document.querySelectorAll('.sidebar-link');
        const currentUrl = window.location.href;
        let delay = 0;

        links.forEach(link => {
            const url = link.href;
            if (!url || url === currentUrl || cache.has(url)) return;
            if (link.origin !== window.location.origin) return;
            if (url.includes('logout')) return;

            // Stagger prefetches so we don't slam the server
            delay += 300;
            setTimeout(() => prefetchUrl(url), delay);
        });
    }

    // Start prefetching after page is idle
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => prefetchAllSidebar(), { timeout: 3000 });
    } else {
        setTimeout(prefetchAllSidebar, 2000);
    }

    // Also prefetch after every PJAX navigation
    // (cache refreshes for data pages that may have changed)
    function scheduleRefresh() {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => prefetchAllSidebar(), { timeout: 5000 });
        } else {
            setTimeout(prefetchAllSidebar, 3000);
        }
    }

    // ── Hover prefetch (for non-sidebar links) ──────
    let hoverTimer = null;
    document.addEventListener('mouseover', function(e) {
        const link = e.target.closest('a');
        if (!link || link.origin !== window.location.origin) return;
        if (link.getAttribute('href', '').includes('logout')) return;
        if (cache.has(link.href)) return;

        hoverTimer = setTimeout(() => prefetchUrl(link.href), 80);
    });
    document.addEventListener('mouseout', function(e) {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    });

    // ── Intercept clicks on internal links ──────────
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (!link) return;

        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        if (link.target && link.target !== '_self') return;
        if (link.hasAttribute('download')) return;
        if ((link.getAttribute('href') || '').startsWith('#')) return;
        if (link.origin !== window.location.origin) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
        if (href.includes('logout')) return;

        e.preventDefault();
        if (link.href === window.location.href) return;
        navigate(link.href, true);

        // After navigation, refresh caches in background
        scheduleRefresh();
    });

    // ── Handle browser back/forward ─────────────────
    window.addEventListener('popstate', function(e) {
        navigate(window.location.href, false);
    });

    // ── Invalidate cache after form submissions ─────
    // If a form is submitted (POST), clear cache so next navigation gets fresh data
    document.addEventListener('submit', function() {
        cache.clear();
    });

    // Mark initial page load in history
    history.replaceState({ pjax: true }, '', window.location.href);

    // Cache the current page too
    cacheSet(window.location.href, content.innerHTML, document.title);

})();
</script>

<script>
/* Retractable sidebar groups — remember open/closed state, auto-open the active group.
   Lives outside the PJAX IIFE because the sidebar persists across PJAX swaps; this runs
   once on full page load. toggleNavGroup is global for the header buttons' onclick. */
(function(){
    const KEY = 'tuta_nav_groups_open';
    function load(){ try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch(e){ return new Set(); } }
    function save(set){ try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch(e){} }

    window.toggleNavGroup = function(btn){
        const group = btn.closest('.nav-group');
        if (!group) return;
        const open = group.classList.toggle('open');
        const set = load();
        const key = group.getAttribute('data-group');
        if (open) set.add(key); else set.delete(key);
        save(set);
    };

    function init(){
        const set = load();
        document.querySelectorAll('.nav-group').forEach(group => {
            const key = group.getAttribute('data-group');
            const active = group.querySelector('.sidebar-link.bg-emerald-50');
            if (active || set.has(key)) {
                group.classList.add('open');
                if (active) set.add(key);
            }
        });
        save(set);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
</script>

</body>
</html>
