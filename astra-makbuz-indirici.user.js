// ==UserScript==
// @name         Astra Makbuz İndirici (yardımcı)
// @namespace    astra-sade-tema
// @version      1.1
// @description  "Astra - Sade & Pro Tema" scriptinin makbuz indirme düğmeleri için yardımcı: makbuzu başka sunucudan alıp ana scripte verir
// @match        https://astra.anadolusigorta.com.tr/*
// @run-at       document-start
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      document.anadolusigorta.com.tr
// ==/UserScript==

(function () {
    'use strict';
    const root = document.documentElement;
    const OK_URL = /^https:\/\/document\.anadolusigorta\.com\.tr\//i;
    root.setAttribute('data-astra-helper', '1.1');

    // Makbuzu doğrudan indir (eski yol)
    window.addEventListener('astra-makbuz-indir', function () {
        let d = null;
        try { d = JSON.parse(root.getAttribute('data-astra-dl') || 'null'); } catch (e) {}
        if (!d || !OK_URL.test(d.url || '')) { root.setAttribute('data-astra-dl-ack', 'err'); return; }
        try {
            GM_download({
                url: d.url,
                name: String(d.name || 'makbuz.pdf').replace(/[\\\/:*?"<>|]+/g, ' '),
                saveAs: false,
                onload: function () { root.setAttribute('data-astra-dl-ack', 'ok'); },
                onerror: function () { root.setAttribute('data-astra-dl-ack', 'err'); },
                ontimeout: function () { root.setAttribute('data-astra-dl-ack', 'err'); }
            });
        } catch (e) { root.setAttribute('data-astra-dl-ack', 'err'); }
    }, false);

    // Makbuzun baytlarını getir (ana script klasöre kaydedebilsin / adını verebilsin)
    window.addEventListener('astra-makbuz-getir', function () {
        let d = null;
        try { d = JSON.parse(root.getAttribute('data-astra-get') || 'null'); } catch (e) {}
        if (!d || !OK_URL.test(d.url || '')) { root.setAttribute('data-astra-dl-ack', 'err'); return; }
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: d.url,
                responseType: 'arraybuffer',
                onload: function (r) {
                    if (r.status !== 200 || !r.response) { root.setAttribute('data-astra-dl-ack', 'err'); return; }
                    const u8 = new Uint8Array(r.response);
                    let bin = '';
                    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
                    root.setAttribute('data-astra-b64', btoa(bin));
                    root.setAttribute('data-astra-dl-ack', 'ok');
                },
                onerror: function () { root.setAttribute('data-astra-dl-ack', 'err'); },
                ontimeout: function () { root.setAttribute('data-astra-dl-ack', 'err'); }
            });
        } catch (e) { root.setAttribute('data-astra-dl-ack', 'err'); }
    }, false);
})();
