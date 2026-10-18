/*
 * Behavioural metrics. Every call goes through window.track / window.trackContext
 * (consent.js), which are silent no-ops until the visitor has opted in.
 */
(function () {
    'use strict';

    var VISITS_KEY = 'mv_visits_v1';
    var state = { clicks: 0, hiddenCount: 0, maxScroll: 0, seconds: 0, firstClickMs: null, vitalsSent: false, errors: 0 };
    var vitals = { lcp: null, cls: 0, fid: null };

    function clean(obj) {
        Object.keys(obj).forEach(function (k) {
            if (obj[k] === null || obj[k] === undefined || obj[k] !== obj[k]) delete obj[k];
        });
        return obj;
    }

    function hostOf(url) {
        try { return new URL(url, location.href).hostname; } catch (e) { return ''; }
    }

    /* ---------- performance (Core Web Vitals + navigation timing) ---------- */

    function observe(type, cb) {
        try {
            new PerformanceObserver(function (list) { list.getEntries().forEach(cb); }).observe({ type: type, buffered: true });
        } catch (e) { /* unsupported entry type */ }
    }

    observe('largest-contentful-paint', function (e) { vitals.lcp = Math.round(e.renderTime || e.loadTime || e.startTime); });
    observe('layout-shift', function (e) { if (!e.hadRecentInput) vitals.cls += e.value; });
    observe('first-input', function (e) { vitals.fid = Math.round(e.processingStart - e.startTime); });

    function navTiming() {
        var n = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        if (!n) return {};
        return {
            ttfb_ms: Math.round(n.responseStart),
            dcl_ms: Math.round(n.domContentLoadedEventEnd),
            load_ms: n.loadEventEnd ? Math.round(n.loadEventEnd) : null
        };
    }

    /* ---------- visit context, sent once consent is applied ---------- */

    function visitCounters() {
        try {
            var now = Date.now();
            var v = JSON.parse(localStorage.getItem(VISITS_KEY)) || { n: 0, first: now, last: 0 };
            // A new visit = more than 30 minutes since the previous page view, so reloads do not inflate it.
            if (now - (v.last || 0) > 30 * 60 * 1000) v.n += 1;
            v.last = now;
            localStorage.setItem(VISITS_KEY, JSON.stringify(v));
            return { visit_count: v.n, returning_visitor: v.n > 1 ? 'yes' : 'no', days_since_first_visit: Math.floor((Date.now() - v.first) / 86400000) };
        } catch (e) { return {}; }
    }

    function mq(q) { return !!(window.matchMedia && matchMedia(q).matches); }

    function sendContext() {
        var c = navigator.connection || {};
        var ctx = clean({
            screen_size: screen.width + 'x' + screen.height,
            viewport_size: window.innerWidth + 'x' + window.innerHeight,
            pixel_ratio: window.devicePixelRatio,
            touch_device: navigator.maxTouchPoints > 0 ? 'yes' : 'no',
            connection_type: c.effectiveType,
            save_data: c.saveData ? 'yes' : 'no',
            timezone: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone,
            languages: (navigator.languages || [navigator.language]).slice(0, 3).join(','),
            prefers_dark: mq('(prefers-color-scheme: dark)') ? 'yes' : 'no',
            prefers_reduced_motion: mq('(prefers-reduced-motion: reduce)') ? 'yes' : 'no',
            display_standalone: mq('(display-mode: standalone)') ? 'yes' : 'no',
            referrer_host: hostOf(document.referrer) || 'direct',
            hardware_threads: navigator.hardwareConcurrency,
            gpc: navigator.globalPrivacyControl ? 'yes' : 'no'
        });
        var visits = visitCounters();
        Object.keys(visits).forEach(function (k) { ctx[k] = visits[k]; });
        window.trackContext(ctx);
        window.track('visit_context', ctx);
    }

    document.addEventListener('consent:applied', sendContext);

    /* ---------- exit report ---------- */

    function sendVitals() {
        if (state.vitalsSent) return;
        state.vitalsSent = true;
        var p = clean({ lcp_ms: vitals.lcp, cls: Math.round(vitals.cls * 1000) / 1000, fid_ms: vitals.fid });
        var n = navTiming();
        Object.keys(n).forEach(function (k) { p[k] = n[k]; });
        window.track('web_vitals', clean(p));
    }

    function onHide() {
        if (!document.hidden) return;
        state.hiddenCount += 1;
        sendVitals();
        window.track('page_exit', clean({
            engaged_seconds: state.seconds,
            max_scroll_percent: Math.round(state.maxScroll),
            click_count: state.clicks,
            time_to_first_click_ms: state.firstClickMs,
            hidden_count: state.hiddenCount
        }));
    }

    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', function () { if (!state.vitalsSent) { sendVitals(); } });

    /* ---------- errors ---------- */

    function reportError(message, source) {
        if (state.errors >= 5) return;
        state.errors += 1;
        window.track('js_error', { message: String(message).slice(0, 100), source: String(source || '').split('/').pop().slice(0, 60) });
    }

    window.addEventListener('error', function (e) { reportError(e.message, e.filename); });
    window.addEventListener('unhandledrejection', function (e) { reportError(e.reason && e.reason.message || e.reason, 'promise'); });

    /* ---------- interactions ---------- */

    document.addEventListener('DOMContentLoaded', function () {
        var t0 = performance.now();
        document.body.classList.add('loaded');

        document.querySelectorAll('.link-button').forEach(function (link, index) {
            link.addEventListener('click', function () {
                window.track('link_click', {
                    link_url: link.href,
                    link_domain: hostOf(link.href),
                    link_text: link.textContent.trim(),
                    link_position: index + 1
                });
            });
        });

        document.querySelectorAll('.social-icon.active').forEach(function (icon) {
            icon.addEventListener('click', function () {
                window.track('social_click', {
                    platform: icon.getAttribute('title') || 'Social',
                    link_url: icon.href,
                    link_domain: hostOf(icon.href)
                });
            });
        });

        // Hover intent: pointer rests on a link for 400 ms or more.
        document.querySelectorAll('.link-button, .social-icon').forEach(function (a) {
            var timer = null;
            a.addEventListener('mouseenter', function () {
                timer = setTimeout(function () {
                    window.track('link_hover', { link_url: a.href, link_text: (a.getAttribute('title') || a.textContent).trim() });
                }, 400);
            });
            a.addEventListener('mouseleave', function () { clearTimeout(timer); });
        });

        var avatar = document.querySelector('.profile-image');
        if (avatar) avatar.addEventListener('click', function () { window.track('avatar_click'); });

        var footerLinks = document.querySelectorAll('.site-footer a');
        footerLinks.forEach(function (a) {
            a.addEventListener('click', function () { window.track('footer_click', { link_text: a.textContent.trim() }); });
        });

        // Any click: counts and time to first one.
        document.addEventListener('click', function () {
            state.clicks += 1;
            if (state.firstClickMs === null) state.firstClickMs = Math.round(performance.now() - t0);
        }, true);

        // First keyboard navigation.
        var keyboardSeen = false;
        document.addEventListener('keydown', function (e) {
            if (keyboardSeen || e.key !== 'Tab') return;
            keyboardSeen = true;
            window.track('keyboard_navigation');
        });

        document.addEventListener('contextmenu', function () { window.track('context_menu'); });
        window.addEventListener('beforeprint', function () { window.track('print'); });
        document.addEventListener('copy', function () { window.track('text_copy'); });
        window.addEventListener('resize', (function () {
            var timer = null, sent = false;
            return function () {
                if (sent) return;
                clearTimeout(timer);
                timer = setTimeout(function () { sent = true; window.track('viewport_resize', { viewport_size: innerWidth + 'x' + innerHeight }); }, 600);
            };
        }()));

        // Scroll depth, once per threshold.
        var thresholds = [25, 50, 75, 100];
        window.addEventListener('scroll', function () {
            var scrollable = document.documentElement.scrollHeight - window.innerHeight;
            if (scrollable <= 0) return;
            var pct = (window.scrollY / scrollable) * 100;
            if (pct > state.maxScroll) state.maxScroll = pct;
            while (thresholds.length && pct >= thresholds[0]) {
                window.track('scroll_depth', { percent: thresholds.shift() });
            }
        }, { passive: true });

        // Engaged time: visible-tab seconds.
        var marks = [5, 15, 30, 60, 120, 300];
        setInterval(function () {
            if (document.hidden) return;
            state.seconds += 1;
            if (state.seconds === marks[0]) window.track('engaged_time', { seconds: marks.shift() });
        }, 1000);
    });
}());
