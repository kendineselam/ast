// ==UserScript==
// @name         Astra WhatsApp Köprüsü
// @namespace    astra-sade-tema
// @version      1.6
// @description  Astra'daki poliçe / makbuz / teklif PDF'lerini WhatsApp Web'de seçtiğin kişiye göndermek için köprü
// @match        https://astra.anadolusigorta.com.tr/*
// @match        https://web.whatsapp.com/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_addValueChangeListener
// ==/UserScript==

(function () {
    'use strict';

    const KEY = 'astraWaPayload';     // Astra'dan gelen dosyalar
    const ALIVE = 'astraWaAlive';     // WhatsApp sekmesi açık mı (kalp atışı)
    const OTO_GONDER_ONAYLI = true;   // onay penceresinde EVET denince WhatsApp'ın GÖNDER'ine de kendisi basar (false = sen basarsın)

    if (location.hostname === 'web.whatsapp.com') waTarafi();
    else astraTarafi();

    // ------------------------------------------------------------------ ASTRA TARAFI
    function astraTarafi() {
        const root = document.documentElement;
        root.setAttribute('data-astra-wa-kopru', '1');
        window.addEventListener('astra-whatsapp-gonder', () => {
            let sonuc = 'err';
            try {
                const p = JSON.parse(root.getAttribute('data-astra-wa') || 'null');
                if (p && p.files && p.files.length) {
                    GM_setValue(KEY, JSON.stringify({ files: p.files, t: Date.now() }));
                    const canli = Date.now() - (Number(GM_getValue(ALIVE, 0)) || 0) < 150000;
                    if (!canli) GM_openInTab('https://web.whatsapp.com/', { active: true, insert: true });
                    sonuc = canli ? 'ready' : 'opened';
                }
            } catch (e) { /* sonuc err kalır */ }
            root.setAttribute('data-astra-wa-ack', sonuc);
        });
    }

    // ------------------------------------------------------------------ WHATSAPP TARAFI
    function waTarafi() {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const kalp = () => { try { GM_setValue(ALIVE, Date.now()); } catch (e) {} };
        kalp(); setInterval(kalp, 2000);
        window.addEventListener('pagehide', () => { try { GM_setValue(ALIVE, 0); } catch (e) {} });

        let panel = null, durumEl = null, flashT = 0;
        const baslik0 = document.title;

        function oku() {
            try {
                const j = JSON.parse(GM_getValue(KEY, 'null') || 'null');
                if (j && j.files && j.files.length && Date.now() - j.t < 3600000) return j;
            } catch (e) { /* bozuk veri */ }
            return null;
        }
        function durum(t, hata) { if (durumEl) { durumEl.textContent = t; durumEl.style.color = hata ? '#fca5a5' : '#86efac'; } }
        function kapat() { if (panel) { panel.remove(); panel = null; durumEl = null; } if (flashT) { clearInterval(flashT); flashT = 0; document.title = baslik0; } }
        function temizle() { try { GM_deleteValue(KEY); } catch (e) {} kapat(); }
        function dikkat() {
            if (!document.hidden || flashT) return;
            let n = 0;
            flashT = setInterval(() => {
                document.title = (n++ % 2 === 0) ? '📎 Astra dosyaları geldi!' : baslik0;
                if (!document.hidden || n > 20) { clearInterval(flashT); flashT = 0; document.title = baslik0; }
            }, 1000);
        }

        const composer = () =>
            document.querySelector('#main footer div[contenteditable="true"]') ||
            document.querySelector('footer div[contenteditable="true"]') ||
            document.querySelector('#main [contenteditable="true"][data-tab="10"]');
        // Önizleme (dosya gönderme ekranı) açık mı? WhatsApp ikon adlarını değiştirebildiği için geniş arıyoruz
        const gonderIkonu = () =>
            document.querySelector('[data-icon="send"], [data-icon*="send"], [data-icon="wds-ic-send-filled"]');
        function gonderDugmesi() {
            const ic = gonderIkonu();
            if (ic) return ic.closest('[role="button"]') || ic.closest('button') || ic;
            return document.querySelector('[aria-label="Gönder"], [aria-label="Send"], button[aria-label*="önder"]');
        }
        const onizlemeVar = () => !!gonderDugmesi();
        function sohbetAdi() {
            const h = document.querySelector('#main header span[title], #main header span[dir="auto"]');
            return h ? (h.getAttribute('title') || h.textContent || '').trim() : '';
        }

        async function dosyalariEkle(p) {
            const comp = composer();
            if (!comp) return 'sohbet';
            const dosyalar = p.files.map(f => {
                const bin = atob(f.b64), u8 = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
                return new File([u8], f.name, { type: 'application/pdf' });
            });
            const dt = new DataTransfer();
            dosyalar.forEach(f => dt.items.add(f));
            comp.focus();
            comp.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
            for (let i = 0; i < 8 && !onizlemeVar(); i++) await sleep(300);
            if (!onizlemeVar()) {   // yapıştırma tutmadıysa sürükle-bırak dene
                const hedef = document.querySelector('#main') || comp;
                for (const t of ['dragenter', 'dragover', 'drop']) {
                    hedef.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
                }
                for (let i = 0; i < 8 && !onizlemeVar(); i++) await sleep(300);
            }
            return onizlemeVar() ? 'ok' : 'yok';
        }

        function el(tag, css, text) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
        function btn(text, bg, fg, border) {
            return el('button', 'padding:8px 12px;border-radius:8px;border:' + (border || '0') + ';background:' + bg + ';color:' + fg + ';font:700 12.5px Segoe UI,system-ui,Arial,sans-serif;cursor:pointer;white-space:nowrap;', text);
        }
        const F = 'font-family:Segoe UI,system-ui,Arial,sans-serif;';

        // ---- Onay ekranı: kişi seçilince açılır; "EVET" demeden hiçbir şey gönderilmez ----
        const tur = n => /MAKBUZ/i.test(n) ? ['Makbuz', '#0f766e', '#ccfbf1'] : (/TEKL[İI]F/i.test(n) ? ['Teklif', '#b45309', '#fef3c7'] : ['Poliçe', '#1d4ed8', '#dbeafe']);
        const kb = f => Math.max(1, Math.round((f.b64.length * 0.75) / 1024)) + ' KB';
        let mesgul = false, soruyor = false, sonSorulan = '', gorulen = 0, adayAd = '', otoSor = true;
        const kapatEk = () => { const o = document.getElementById('astra-wa-onay'); if (o) o.remove(); };

        async function gonder() {
            if (mesgul || soruyor) return;
            const p = oku();
            if (!p) { durum('Dosya bulunamadı. Astra\'dan tekrar gönder.', true); return; }
            if (!composer()) { durum('Önce soldan göndereceğin sohbeti aç', true); return; }
            const kisi = sohbetAdi();
            soruyor = true;
            kapatEk();
            const ort = el('div', 'position:fixed;inset:0;z-index:2147483600;background:rgba(2,6,23,.72);display:flex;align-items:center;justify-content:center;' + F);
            ort.id = 'astra-wa-onay';
            const kutu = el('div', 'width:540px;max-width:94vw;max-height:92vh;overflow:auto;background:#fff;border-radius:20px;box-shadow:0 30px 80px rgba(0,0,0,.55);color:#0f172a;');
            // üst şerit
            const ust = el('div', 'background:linear-gradient(135deg,#128c4a,#25d366);color:#fff;padding:18px 22px;border-radius:20px 20px 0 0;');
            ust.appendChild(el('div', 'font-weight:800;font-size:19px;', '💬 WhatsApp\'a gönderilecek'));
            ust.appendChild(el('div', 'font-weight:600;font-size:13px;opacity:.92;margin-top:2px;', 'Astra\'dan seçtiğiniz ' + p.files.length + ' dosya aşağıdaki sohbete gönderilecek'));
            kutu.appendChild(ust);
            const ic = el('div', 'padding:20px 22px 22px;');
            // alıcı kartı
            ic.appendChild(el('div', 'font-weight:700;font-size:11.5px;letter-spacing:.08em;color:#64748b;margin-bottom:6px;', 'ALICI SOHBET'));
            const alici = el('div', 'display:flex;align-items:center;gap:12px;background:#f0fdf4;border:2px solid #86efac;border-radius:14px;padding:12px 14px;margin-bottom:18px;');
            alici.appendChild(el('div', 'width:44px;height:44px;border-radius:50%;background:#25d366;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;flex-shrink:0;', (kisi || '?').trim().charAt(0).toLocaleUpperCase('tr')));
            alici.appendChild(el('div', 'font-weight:800;font-size:19px;color:#14532d;overflow-wrap:anywhere;', kisi || '(sohbet adı okunamadı)'));
            ic.appendChild(alici);
            // dosyalar
            ic.appendChild(el('div', 'font-weight:700;font-size:11.5px;letter-spacing:.08em;color:#64748b;margin-bottom:6px;', 'GÖNDERİLECEK DOSYALAR'));
            p.files.forEach(f => {
                const t = tur(f.name);
                const sat = el('div', 'display:flex;align-items:center;gap:10px;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin-bottom:8px;');
                sat.appendChild(el('div', 'background:' + t[2] + ';color:' + t[1] + ';font-weight:800;font-size:11.5px;padding:4px 9px;border-radius:999px;flex-shrink:0;', t[0].toUpperCase()));
                sat.appendChild(el('div', 'flex:1;min-width:0;font-weight:700;font-size:13.5px;overflow-wrap:anywhere;color:#1e293b;', f.name.replace(/\.pdf$/i, '')));
                sat.appendChild(el('div', 'font-weight:600;font-size:12px;color:#64748b;flex-shrink:0;', 'PDF · ' + kb(f)));
                ic.appendChild(sat);
            });
            // soru
            const soru = el('div', 'font-weight:800;font-size:15px;margin:16px 0 14px;color:#0f172a;', 'Bu dosyaları "' + (kisi || 'bu sohbet') + '" kişisine göndermek istediğinizden emin misiniz?');
            ic.appendChild(soru);
            const durumK = el('div', 'font-weight:700;font-size:13.5px;color:#0f766e;min-height:20px;margin-bottom:6px;display:none;');
            ic.appendChild(durumK);
            const dugmeler = el('div', 'display:flex;gap:10px;');
            const hayir = btn('VAZGEÇ', '#fff', '#475569', '1px solid #cbd5e1'); hayir.style.cssText += 'flex:1;padding:13px;font-size:14px;';
            const evet = btn('✔ EVET, GÖNDER', '#25d366', '#fff'); evet.style.cssText += 'flex:2;padding:13px;font-size:14.5px;';
            dugmeler.appendChild(hayir); dugmeler.appendChild(evet);
            ic.appendChild(dugmeler);
            kutu.appendChild(ic); ort.appendChild(kutu); document.body.appendChild(ort);

            const bitir = () => { soruyor = false; kapatEk(); };
            hayir.addEventListener('click', () => { bitir(); durum('Vazgeçildi. Başka kişi seçebilirsin.'); });
            ort.addEventListener('mousedown', e => { if (e.target === ort && !mesgul) { bitir(); durum('Vazgeçildi. Başka kişi seçebilirsin.'); } });
            const dur = (t, hata) => { durumK.style.display = ''; durumK.textContent = t; durumK.style.color = hata ? '#b91c1c' : '#0f766e'; };
            evet.addEventListener('click', () => {
                if (mesgul) return;
                mesgul = true;
                otoSor = false;   // EVET denince bu dosyalar için başka sohbette tekrar sorma
                try { GM_deleteValue(KEY); } catch (e) {}   // sağ üstteki hap da hemen kalkar
                dugmeler.style.display = 'none'; soru.style.display = 'none';
                dur('✔ Gönderiliyor... Bu pencere 2 saniye sonra kapanır.');
                setTimeout(bitir, 2000);
                (async () => {
                    try {
                        const s = await dosyalariEkle(p);
                        if (s === 'sohbet') { bildir('Sohbet kapanmış, kişiyi tekrar seçip dene.', true); return; }
                        const d = gonderDugmesi();
                        if (s !== 'ok' || !d) { bildir('Dosyalar eklenmiş olabilir. WhatsApp\'taki yeşil GÖNDER düğmesine kendin bas.', true); return; }
                        if (!OTO_GONDER_ONAYLI) { bildir('Dosyalar eklendi, WhatsApp\'ın GÖNDER düğmesine bas.'); return; }
                        await sleep(500);
                        d.click();
                        for (let i = 0; i < 10 && onizlemeVar(); i++) await sleep(400);
                        if (onizlemeVar()) { bildir('Gönder düğmesine basılamadı. WhatsApp\'taki yeşil GÖNDER\'e kendin bas.', true); return; }
                        bildir('✔ Gönderildi: ' + (kisi || 'sohbet'));
                    } finally { mesgul = false; }
                })();
            });
        }

        // kısa süreli küçük bildirim (sağ üst)
        function bildir(t, hata) {
            const eski = document.getElementById('astra-wa-bildir'); if (eski) eski.remove();
            const n = el('div', 'position:fixed;right:16px;top:70px;z-index:2147483600;max-width:320px;padding:11px 16px;border-radius:12px;color:#fff;font-weight:700;font-size:13px;line-height:1.4;box-shadow:0 10px 28px rgba(0,0,0,.4);background:' + (hata ? '#dc2626' : '#16a34a') + ';' + F, t);
            n.id = 'astra-wa-bildir';
            document.body.appendChild(n);
            setTimeout(() => n.remove(), hata ? 9000 : 3000);
        }

        // ---- Küçük hap: dosyalar hazır, kişiyi seç ----
        function goster() {
            const p = oku();
            if (!p) { kapat(); return; }
            if (panel) panel.remove();
            sonSorulan = sohbetAdi(); gorulen = 0; otoSor = true;   // şu an açık sohbet için sorma; sonradan seçilen sohbette sor
            panel = el('div', 'position:fixed;right:16px;top:70px;z-index:2147483000;display:flex;align-items:center;gap:8px;background:#0f172a;color:#fff;border-radius:999px;padding:8px 8px 8px 14px;box-shadow:0 10px 28px rgba(0,0,0,.4);' + F);
            const metin = el('div', 'font-weight:700;font-size:12.5px;line-height:1.3;max-width:230px;');
            durumEl = metin;
            metin.textContent = '📎 ' + p.files.length + ' dosya hazır — soldan kişiyi seç';
            panel.title = p.files.map(f => f.name).join('\n');
            const bu = btn('Açık sohbete gönder', '#25d366', '#fff'); bu.style.cssText += 'padding:6px 10px;border-radius:999px;font-size:11.5px;';
            bu.title = 'Şu an açık olan sohbete göndermek için'; bu.addEventListener('click', gonder);
            const x = btn('✕', 'transparent', '#fca5a5', '1px solid #475569'); x.style.cssText += 'padding:5px 9px;border-radius:999px;';
            x.title = 'Dosyaları unut ve kapat'; x.addEventListener('click', temizle);
            panel.appendChild(metin); panel.appendChild(bu); panel.appendChild(x);
            document.body.appendChild(panel);
        }

        // Kişi seçilince (sohbet değişince) onay penceresi kendiliğinden açılır
        setInterval(() => {
            if (!panel || mesgul || soruyor || !otoSor) return;
            const ad = sohbetAdi();
            if (!ad || ad === sonSorulan) { adayAd = ''; gorulen = 0; return; }
            if (ad !== adayAd) { adayAd = ad; gorulen = 1; return; }   // sohbet tam yüklensin diye iki kontrol bekle
            if (++gorulen < 2) return;
            sonSorulan = ad; adayAd = ''; gorulen = 0;
            gonder();
        }, 700);
        try { GM_addValueChangeListener(KEY, (n, o, yeni) => { if (yeni) { goster(); dikkat(); } else kapat(); }); } catch (e) {}
        // WhatsApp arayüzü yüklenene kadar bekle, sonra bekleyen dosya varsa paneli göster
        (async () => { for (let i = 0; i < 60 && !document.body; i++) await sleep(250); goster(); })();
    }
})();