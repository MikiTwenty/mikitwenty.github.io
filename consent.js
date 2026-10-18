/*
 * Cookie consent + analytics loader.
 * Nothing from Google is requested until the visitor opts in.
 * Two independent choices: statistics (GA4) and Google signals (cross-device
 * demographics/interests).
 */
(function () {
    'use strict';

    var CFG = {
        GA_ID: 'G-0HH1J3YDPG',
        KEY: 'mv_consent_v1',
        PRESELECT: false,                            // true = options ticked by default: NOT valid consent in the EU (CJEU Planet49, Garante 2021)
        POLICY: '2026-10-18',                        // bump when privacy.html changes materially: re-asks everyone
        MAX_AGE_MS: 182 * 24 * 60 * 60 * 1000        // ask again after ~6 months (Garante guidelines)
    };

    var TEXT = {
        it: {
            title: 'Cookie e statistiche',
            body: 'Uso strumenti di terze parti per capire come viene usato il sito. Nulla parte prima della tua scelta e puoi cambiarla in ogni momento. ',
            policy: 'Informativa privacy e cookie',
            reject: 'Rifiuta tutto',
            custom: 'Cambia preferenze',
            save: 'Salva scelte',
            accept: 'Accetta tutto',
            necessary: 'Necessari',
            necessaryDesc: 'Ricorda questa scelta sul tuo dispositivo. Sempre attivi.',
            stats: 'Statistiche (Google Analytics 4)',
            statsDesc: 'Pagine viste, provenienza, dispositivo, tempo di permanenza, scroll e click.',
            signals: 'Segnali Google',
            signalsDesc: 'Dati demografici, interessi e collegamento tra dispositivi. Richiede le statistiche.'
        },
        en: {
            title: 'Cookies and analytics',
            body: 'I use third-party tools to understand how this site is used. Nothing loads before your choice, and you can change it at any time. ',
            policy: 'Privacy and cookie policy',
            reject: 'Reject all',
            custom: 'Change preferences',
            save: 'Save choices',
            accept: 'Accept all',
            necessary: 'Necessary',
            necessaryDesc: 'Remembers this choice on your device. Always on.',
            stats: 'Statistics (Google Analytics 4)',
            statsDesc: 'Page views, referrer, device, time on page, scroll and clicks.',
            signals: 'Google signals',
            signalsDesc: 'Demographics, interests and cross-device linking. Requires statistics.'
        }
    };

    var lang = (navigator.language || 'en').toLowerCase().indexOf('it') === 0 ? 'it' : 'en';
    var t = TEXT[lang];

    // Global Privacy Control: a browser-level opt-out of profiling, honoured regardless of the banner.
    var GPC = navigator.globalPrivacyControl === true;

    var applied = null;                 // consent actually applied on this page load
    var loaded = { ga: false };
    var banner = null;

    /* ---------- storage ---------- */

    function read() {
        try {
            var s = JSON.parse(localStorage.getItem(CFG.KEY));
            if (s && s.v === 1 && s.policy === CFG.POLICY && Date.now() - s.ts < CFG.MAX_AGE_MS) return s;
        } catch (e) { /* storage blocked: banner shows on every visit */ }
        return null;
    }

    function write(s) {
        try { localStorage.setItem(CFG.KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    }

    function clearCookies() {
        var host = location.hostname;
        var domains = [host, '.' + host, '.' + host.split('.').slice(-2).join('.')];
        document.cookie.split(';').forEach(function (c) {
            var name = c.split('=')[0].trim();
            if (!/^(_ga|_gid|_gat|_gcl)/.test(name)) return;
            domains.forEach(function (d) {
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + d;
            });
            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        });
    }

    /* ---------- providers ---------- */

    function loadGA(s) {
        var granted = s.signals ? 'granted' : 'denied';
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        gtag('consent', 'default', {
            analytics_storage: 'granted',
            ad_storage: granted,
            ad_user_data: granted,
            ad_personalization: granted
        });
        gtag('js', new Date());
        gtag('set', 'user_properties', {
            ui_language: lang,
            color_scheme: window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        });
        gtag('config', CFG.GA_ID, {
            allow_google_signals: !!s.signals,
            allow_ad_personalization_signals: !!s.signals
        });
        var el = document.createElement('script');
        el.async = true;
        el.src = 'https://www.googletagmanager.com/gtag/js?id=' + CFG.GA_ID;
        document.head.appendChild(el);
        loaded.ga = true;
    }

    function apply(s) {
        applied = s;
        if (s.stats) loadGA(s);
        if (s.stats) document.dispatchEvent(new CustomEvent('consent:applied', { detail: s }));
    }

    /* Visitor/device attributes as GA4 user properties. */
    window.trackContext = function (props) {
        if (loaded.ga && window.gtag) window.gtag('set', 'user_properties', props);
    };

    /* Event helper used by script.js; silent no-op without consent. */
    window.track = function (name, params) {
        if (loaded.ga && window.gtag) window.gtag('event', name, params || {});
    };

    /* ---------- decisions ---------- */

    function normalise(s) {
        return { v: 1, policy: CFG.POLICY, ts: Date.now(), stats: !!s.stats, signals: !!(s.stats && s.signals && !GPC) };
    }

    function save(raw) {
        var s = normalise(raw);
        var changed = applied && (applied.stats !== s.stats || applied.signals !== s.signals);
        write(s);
        hide();
        if (changed) {
            clearCookies();
            location.reload();           // provider scripts cannot be unloaded cleanly
        } else if (!applied) {
            apply(s);
        }
    }

    /* ---------- banner ---------- */

    function el(tag, attrs, text) {
        var n = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
        if (text) n.textContent = text;
        return n;
    }

    function option(id, label, desc, checked, disabled) {
        var wrap = el('label', { 'class': 'cc-opt', 'for': id });
        var box = el('input', { type: 'checkbox', id: id });
        box.checked = checked;
        box.disabled = !!disabled;
        var txt = el('span');
        txt.appendChild(el('strong', {}, label));
        txt.appendChild(el('small', {}, desc));
        wrap.appendChild(box);
        wrap.appendChild(txt);
        return wrap;
    }

    function build(current) {
        var all = CFG.PRESELECT;
        var c = current || { stats: all, signals: all };
        var root = el('div', { id: 'cc', role: 'dialog', 'aria-labelledby': 'cc-title', 'aria-describedby': 'cc-text', lang: lang });

        root.appendChild(el('h2', { id: 'cc-title' }, t.title));
        var p = el('p', { id: 'cc-text' }, t.body);
        p.appendChild(el('a', { href: 'privacy.html' }, t.policy));
        root.appendChild(p);

        // Reject and accept carry the same weight (Garante guidelines, EDPB).
        var actions = el('div', { 'class': 'cc-actions' });
        var reject = el('button', { type: 'button' }, t.reject);
        var accept = el('button', { type: 'button' }, t.accept);
        actions.appendChild(reject);
        actions.appendChild(accept);
        root.appendChild(actions);

        var prefs = el('button', { type: 'button', 'class': 'cc-link' }, t.custom);
        root.appendChild(prefs);

        var opts = el('div', { 'class': 'cc-opts', hidden: '' });
        opts.appendChild(option('cc-necessary', t.necessary, t.necessaryDesc, true, true));
        opts.appendChild(option('cc-stats', t.stats, t.statsDesc, c.stats));
        opts.appendChild(option('cc-signals', t.signals, t.signalsDesc, c.signals));
        var saveBtn = el('button', { type: 'button', 'class': 'cc-save' }, t.save);
        opts.appendChild(saveBtn);
        root.appendChild(opts);

        var stats = opts.querySelector('#cc-stats');
        var signals = opts.querySelector('#cc-signals');
        function syncSignals() {
            signals.disabled = !stats.checked || GPC;
            if (!stats.checked || GPC) signals.checked = false;
        }
        stats.addEventListener('change', syncSignals);
        syncSignals();

        function openPrefs() {
            opts.removeAttribute('hidden');
            prefs.setAttribute('hidden', '');
        }

        reject.addEventListener('click', function () { save({}); });
        accept.addEventListener('click', function () { save({ stats: true, signals: true }); });
        prefs.addEventListener('click', openPrefs);
        saveBtn.addEventListener('click', function () {
            save({ stats: stats.checked, signals: signals.checked });
        });

        return { root: root, open: openPrefs };
    }

    function show(current, expanded) {
        hide();
        var b = build(current);
        if (expanded) b.open();
        banner = b.root;
        document.body.appendChild(banner);
        b.root.querySelector('button').focus({ preventScroll: true });
    }

    function hide() {
        if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
        banner = null;
    }

    window.siteConsent = { open: function () { show(read() || applied, true); } };

    document.addEventListener('DOMContentLoaded', function () {
        var s = read();
        if (s) apply(s); else show(null, false);
        document.querySelectorAll('[data-cc-open]').forEach(function (b) {
            b.addEventListener('click', window.siteConsent.open);
        });
    });
}());
