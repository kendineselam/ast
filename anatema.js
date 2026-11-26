// ==UserScript==
// @name         Astr
// @namespace    astra-sade-tema
// @version      3.9
// @description  Anadolu Sigorta Astra arayüzünü sadeleştirir, modern ve profesyonel bir görünüm verir
// @match        https://astra.anadolusigorta.com.tr/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =====================================================================
    // HIZLANDIRMA (tarayıcı tarafı): animasyonlar kapalı, bağlantı önden kurulur
    // =====================================================================
    const TIMER_CARPAN = 1;   // 1 = kapalı (güvenli). Site içi beklemeleri kısaltmak için 0.5 veya 0.3 dene; sorun çıkarsa 1 yap
    const HOP_AKTIF = true;   // false yaparsan otomatik makbuz geçişi tamamen kapanır
    // İndirilen dosya adındaki ürün kısa adı: kod -> ad. Listede yoksa aşağıdaki kurallara bakılır.
    const URUN_KISA_AD = { '439': 'TIBBİ' };
    // Ürün adında bu kelimeler geçerse kısa ad kullanılır (yukarıdan aşağıya ilk eşleşen kazanır)
    const URUN_KISA_KURAL = [
        [/HEK[İI]M/, 'HEKİM SOR'],
        [/MESLEK/, 'MESLEKİ SOR'],
        [/TIBB[İI]/, 'TIBBİ']
    ];
    function kisaUrun(tam) {
        if (!tam || tam === '-') return '';
        const U = tam.toLocaleUpperCase('tr');
        for (const [re, ad] of URUN_KISA_KURAL) if (re.test(U)) return ad;
        return U.replace(/\s+S[İI]GORTA(SI)?\s*$/, '').replace(/SORUMLULU[KĞ]U?/g, 'SOR').trim();
    }
    const PDF_ARAC_CUBUGU_GIZLE = true;   // true: pencerede tarayıcının kendi PDF araç çubuğu (kodlu adla indiren indirme düğmesi) gizlenir, sadece bizim İNDİR kullanılır
    const FX_KAPAT = true;    // false yaparsan jQuery animasyonları site gibi kalır
    (function turbo() {
        try {
            const host = 'https://astra-api.anadolusigorta.com.tr';
            const add = (rel, cors) => {
                const l = document.createElement('link');
                l.rel = rel; l.href = host; if (cors) l.crossOrigin = 'anonymous';
                (document.head || document.documentElement).appendChild(l);
            };
            add('dns-prefetch'); add('preconnect'); add('preconnect', true);
        } catch (e) { /* sessizce geç */ }
        if (TIMER_CARPAN < 1) {
            const st = window.setTimeout;
            window.setTimeout = function (fn, d) {
                const rest = Array.prototype.slice.call(arguments, 2);
                if (typeof d === 'number' && d >= 50) d = Math.round(d * TIMER_CARPAN);
                return st.apply(this, [fn, d].concat(rest));
            };
        }
        // jQuery animasyonları ve Bootstrap geçişleri anında olsun
        let n = 0;
        const t = setInterval(() => {
            try {
                if (FX_KAPAT && window.jQuery) {
                    window.jQuery.fx.off = true;
                    if (window.jQuery.support) window.jQuery.support.transition = false;
                }
            } catch (e) { /* sessizce geç */ }
            if (++n > 60) clearInterval(t);
        }, 500);
    })();

    // =====================================================================
    // PDF ÖNİZLEME: Çıktı/Evrak kartına tıklayınca indirmek yerine pencerede aç
    // =====================================================================
    let wantUntil = 0;
    let lastThumbLabel = '';
    const wantView = () => Date.now() < wantUntil;
    const consumeView = () => { wantUntil = 0; };

    // ---- Dosya adı: MÜŞTERİ ÜRÜN POL/MAKBUZ YIL  |  TEKLİF NO ÜRÜN TEKLİF YIL ----
    const infoByPol = {};   // sorgu bitince etiketler boşalsa da ad/ürün kalsın
    const okTxt = t => !!t && t !== '-';
    function readDonem() {   // lbl_BaslamaTarih (24/11/2026) -> "2026"
        const m = txtOf(document.getElementById('lbl_BaslamaTarih')).match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
        return (m && +m[2] >= 1 && +m[2] <= 12) ? m[3] : '';
    }
    function readInfo() {
        let ad = txtOf(document.getElementById('lbl_SIGORTA_ETTIREN'));
        if (!okTxt(ad)) ad = txtOf(document.getElementById('lbl_SIGORTALI'));
        const ur = txtOf(document.getElementById('lbl_URUN_AD'));
        if (!okTxt(ad) && !okTxt(ur)) return null;
        const m = ur.match(/^\s*(\d+)\s*-\s*(.*)$/);
        const kod = m ? m[1] : '';
        const tam = (m ? m[2] : ur).trim();
        // önce koda göre kısa ad, yoksa ürün adındaki kelimelere göre kısa ad
        const urun = URUN_KISA_AD[kod] || kisaUrun(tam);
        const durum = txtOf(document.getElementById('lbl_DURUM')).toLocaleLowerCase('tr');
        const tur = (labelPol() && !/teklif/.test(durum)) ? 'POLİÇE' : 'TEKLİF';
        return { ad: okTxt(ad) ? ad : '', urun, tur, donem: readDonem() };
    }
    const infoKeys = () => [curPol, curTek, labelPol(), txtOf(document.getElementById('lbl_TeklifNo'))].filter(k => okTxt(k));
    function getInfo() {
        for (const k of infoKeys()) if (infoByPol[k] && infoByPol[k].ad) return infoByPol[k];
        return readInfo();
    }
    function snapInfo() {
        if (!labelPol() && !okTxt(txtOf(document.getElementById('lbl_TeklifNo')))) return;
        const i = readInfo(); if (!i || !i.ad) return;
        infoKeys().forEach(k => { infoByPol[k] = { ad: i.ad, urun: i.urun || (infoByPol[k] && infoByPol[k].urun) || '', tur: i.tur || '', donem: i.donem || (infoByPol[k] && infoByPol[k].donem) || '' }; });
    }
    function adlandir(tur, idx, toplam) {
        const i = getInfo();
        if (!i || !i.ad) return '';
        let kisi;
        if (tur === 'TEKLİF') {
            // teklifte müşteri adı yerine teklif no
            const tn = [curTek, txtOf(document.getElementById('lbl_TeklifNo'))].find(okTxt) || '';
            kisi = tn || (/\*/.test(i.ad) ? (polNo() || '') : i.ad);
        } else {
            // site müşteri adını maskelemişse (Y***N D***L) poliçe/teklif numarasını kullan
            kisi = /\*/.test(i.ad) ? (polNo() || curTek || '') : i.ad;
        }
        if (!kisi) return '';
        const etiket = tur === 'POLİÇE' ? 'POL' : tur;
        const yil = i.donem || String(new Date().getFullYear());
        const parca = [kisi, i.urun, etiket + (toplam > 1 ? ' ' + (idx + 1) : ''), yil].filter(Boolean).join(' ');
        return parca.toLocaleUpperCase('tr').replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
    }

    // ---- Sekmeli PDF penceresi: Poliçe | Makbuz ----
    const V = { ov: null, tabs: [], act: 0, waitingPolicy: false, blobs: [] };
    const vKey = e => { if (e.key === 'Escape') vClose(); };
    function vClose() {
        if (V.ov) V.ov.remove();
        V.ov = null; V.tabs = []; V.act = 0; V.waitingPolicy = false; V.mode = '';
        document.removeEventListener('keydown', vKey, true);
        const bl = V.blobs; V.blobs = [];
        setTimeout(() => bl.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} }), 60000);
    }
    function vOpen() {
        if (V.ov) return;
        const ov = document.createElement('div');
        ov.id = 'astra-pdf-viewer';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;';
        ov.innerHTML =
            '<div style="position:relative;width:min(1100px,94vw);height:92vh;background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;font-family:Segoe UI,system-ui,Arial,sans-serif;">' +
            '<div data-notify style="white-space:pre-line;display:none;position:absolute;left:50%;bottom:26px;transform:translateX(-50%);z-index:5;max-width:88%;padding:14px 22px;border-radius:12px;font:700 15px/1.4 Segoe UI,system-ui,Arial,sans-serif;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35);text-align:center;"></div>' +
            '<div data-tabs style="display:flex;gap:6px;padding:10px 12px 0;background:#f8fafc;overflow:auto;flex-shrink:0;"></div>' +
            '<div style="display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid #e8ecf3;background:#f8fafc;flex-shrink:0;">' +
            '<button type="button" data-gun style="padding:7px 10px;border-radius:8px;background:#fff7ed;color:#9a3412;font-weight:700;font-size:12.5px;border:1px solid #fed7aa;cursor:pointer;white-space:nowrap;" title="Seçtiğin klasörün içine bugünün tarihli Poliçeler ve Teklifler klasörlerini oluşturur">📅 BUGÜN</button>' +
            '<button type="button" data-folder style="padding:7px 10px;border-radius:8px;background:#fff;color:#334155;font-weight:700;font-size:12.5px;border:1px solid #d5dbe6;cursor:pointer;white-space:nowrap;max-width:170px;overflow:hidden;text-overflow:ellipsis;" title="PDF\'lerin kaydedileceği klasörü seç"></button>' +
            '<button type="button" data-folderoff style="padding:7px 9px;border-radius:8px;background:#fff;color:#b91c1c;font-weight:700;font-size:12.5px;border:1px solid #fecaca;cursor:pointer;" title="Klasör seçimini kaldır (normal indirme)">✕</button>' +
            '<a data-open target="_blank" rel="noopener" style="padding:7px 10px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-weight:700;font-size:12.5px;text-decoration:none;border:1px solid #bfdbfe;white-space:nowrap;">YENİ SEKMEDE AÇ</a>' +
            '<div style="flex:1;"></div>' +
            '<button type="button" data-all style="padding:7px 14px;border-radius:8px;background:#0f172a;color:#fff;font-weight:700;font-size:12.5px;border:0;cursor:pointer;white-space:nowrap;">İKİSİNİ DE İNDİR</button>' +
            '<a data-dl style="padding:7px 14px;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;font-size:12.5px;text-decoration:none;white-space:nowrap;">İNDİR</a>' +
            '<button type="button" data-wa style="padding:7px 14px;border-radius:8px;background:#25d366;color:#fff;font-weight:700;font-size:12.5px;border:0;cursor:pointer;white-space:nowrap;" title="PDF\'leri WhatsApp Web\'de seçeceğin kişiye gönder">💬 WHATSAPP</button>' +
            '<div style="position:relative;"><button type="button" data-set style="padding:7px 10px;border-radius:8px;background:#fff;color:#334155;font-weight:700;font-size:14px;border:1px solid #d5dbe6;cursor:pointer;line-height:1;" title="Ayarlar">⚙</button>' +
            '<div data-setbox style="display:none;position:absolute;right:0;top:calc(100% + 6px);z-index:20;width:290px;flex-direction:column;gap:8px;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.25);">' +
            '<div style="font-weight:800;font-size:13px;color:#0f172a;">İNDİR\'e basınca</div>' +
            '<button type="button" data-otopol style="padding:9px 10px;border-radius:8px;font-weight:700;font-size:12.5px;cursor:pointer;text-align:left;"></button>' +
            '<button type="button" data-ototek style="padding:9px 10px;border-radius:8px;font-weight:700;font-size:12.5px;cursor:pointer;text-align:left;"></button>' +
            '<div style="font-weight:600;font-size:11.5px;color:#64748b;line-height:1.4;">Açık: sormadan hazır isimle iner.<br>Kapalı: hangi isimle kaydedileceğini sorar.</div>' +
            '</div></div>' +
            '<button type="button" data-print style="padding:7px 14px;border-radius:8px;background:#fff;color:#334155;font-weight:700;font-size:12.5px;border:1px solid #d5dbe6;cursor:pointer;white-space:nowrap;">YAZDIR</button>' +
            '<button type="button" data-close style="padding:7px 12px;border-radius:8px;background:#fff;color:#334155;font-weight:700;font-size:12.5px;border:1px solid #d5dbe6;cursor:pointer;white-space:nowrap;" title="Kapat">✕</button>' +
            '</div><div data-body style="flex:1;display:flex;background:#e5e7eb;"></div></div>';
        ov.querySelector('[data-close]').addEventListener('click', vClose);
        const sb = ov.querySelector('[data-set]'), sx = ov.querySelector('[data-setbox]');
        sb.addEventListener('click', e => { e.stopPropagation(); sx.style.display = sx.style.display === 'none' ? 'flex' : 'none'; });
        ov.addEventListener('click', e => { if (!e.target.closest('[data-setbox],[data-set]')) sx.style.display = 'none'; });
        ov.querySelector('[data-otopol]').addEventListener('click', async () => { otoPol = !otoPol; try { await idbSet('otoPol', otoPol); } catch (e) {} vRender(); });
        ov.querySelector('[data-ototek]').addEventListener('click', async () => { otoTek = !otoTek; try { await idbSet('otoTek', otoTek); } catch (e) {} vRender(); });
        ov.addEventListener('mousedown', e => { if (e.target === ov) vClose(); });
        document.addEventListener('keydown', vKey, true);
        document.body.appendChild(ov);
        V.ov = ov;
    }
    function vRender() {
        if (!V.ov) return;
        const tabsEl = V.ov.querySelector('[data-tabs]');
        tabsEl.textContent = '';
        V.tabs.forEach((t, i) => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = t.label;
            const on = i === V.act;
            b.style.cssText = 'padding:7px 16px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;border:1px solid ' + (on ? '#2563eb' : '#d5dbe6') + ';background:' + (on ? '#2563eb' : '#fff') + ';color:' + (on ? '#fff' : '#334155') + ';';
            b.addEventListener('click', () => { V.act = i; vRender(); });
            tabsEl.appendChild(b);
        });
        const t = V.tabs[V.act];
        const fb = V.ov.querySelector('[data-folder]'), fo = V.ov.querySelector('[data-folderoff]'), ab = V.ov.querySelector('[data-all]');
        fb.textContent = dirHandle ? '📁 ' + dirHandle.name : '📁 KLASÖR SEÇ';
        fb.onclick = pickDir;
        const stil = (b, acik, ad) => {
            b.textContent = (acik ? '✔ ' : '✖ ') + ad + (acik ? ': otomatik indir' : ': isim sor');
            b.style.background = acik ? '#dcfce7' : '#fee2e2';
            b.style.color = acik ? '#166534' : '#991b1b';
            b.style.border = '1px solid ' + (acik ? '#86efac' : '#fecaca');
        };
        stil(V.ov.querySelector('[data-otopol]'), otoPol, 'Poliçe / Makbuz');
        stil(V.ov.querySelector('[data-ototek]'), otoTek, 'Teklif');
        const gb = V.ov.querySelector('[data-gun]');
        gb.textContent = masa ? '📅 MASAÜSTÜ: ' + gunStr() : (gunluk && dirHandle ? '📅 BUGÜN: ' + gunAd('Poliçeler') : '📅 BUGÜN');
        gb.onclick = gunlukKur;
        fo.style.display = (dirHandle || masa) ? '' : 'none';
        fo.onclick = async () => { dirHandle = null; gunluk = false; masa = false; try { await idbSet('dir', null); await idbSet('gunluk', false); await idbSet('masa', false); } catch (e) {} vRender(); };
        ab.style.display = V.tabs.filter(x => x.url).length >= 2 ? '' : 'none';
        ab.onclick = () => tumunuIndir();
        const wb = V.ov.querySelector('[data-wa]');
        wb.style.display = V.tabs.some(x => x.url) ? '' : 'none';
        wb.onclick = whatsappGonder;
        const body = V.ov.querySelector('[data-body]');
        const open = V.ov.querySelector('[data-open]'), dl = V.ov.querySelector('[data-dl]');
        body.textContent = '';
        if (t && t.url) {
            open.href = t.url; dl.href = t.url;
            dl.setAttribute('download', t.name || 'belge.pdf');
            dl.onclick = async e => { e.preventDefault(); await kaydetTab(t, false, true); };
            open.style.display = dl.style.display = '';
            const f = document.createElement('iframe');
            f.style.cssText = 'flex:1;border:0;width:100%;background:#e5e7eb;';
            f.src = PDF_ARAC_CUBUGU_GIZLE ? t.url + '#toolbar=0&navpanes=0' : t.url;
            body.appendChild(f);
            const pr = V.ov.querySelector('[data-print]');
            pr.style.display = '';
            pr.onclick = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(t.url, '_blank'); } };
        } else {
            open.style.display = dl.style.display = 'none';
            V.ov.querySelector('[data-print]').style.display = 'none';
            const m = document.createElement('div');
            m.style.cssText = 'margin:auto;font:700 16px Segoe UI,system-ui,Arial,sans-serif;color:#334155;text-align:center;padding:20px;';
            m.textContent = (t && t.msg) || 'Hazırlanıyor...';
            body.appendChild(m);
        }
    }
    // Yardımcı script (Tampermonkey, GM_download) ile makbuz indirme: sayfa <-> yardımcı iletişimi DOM üzerinden
    async function helperDownload(url, name) {
        const root = document.documentElement;
        try {
            root.removeAttribute('data-astra-dl-ack');
            root.setAttribute('data-astra-dl', JSON.stringify({ url, name, t: Date.now() }));
            window.dispatchEvent(new CustomEvent('astra-makbuz-indir'));
            const ack = await waitFor(() => root.getAttribute('data-astra-dl-ack'), 8000);
            return ack === 'ok';
        } catch (e) { return false; }
    }
    // ---- Klasöre kaydetme (File System Access API) ve indirme yardımcıları ----
    let dirHandle = null, gunluk = false, masa = false;
    let otoPol = true, otoTek = false;   // ⚙ Ayarlar: true = İNDİR'e basınca sormadan hazır isimle indir, false = isim sor
    const helperSurum = () => parseFloat(document.documentElement.getAttribute('data-astra-helper') || '0');
    const gunStr = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear(); };
    const gunAd = tur => gunStr() + ' ' + tur;                       // örn. 24.11.2026 Poliçeler
    const turAd = ad => /TEKLİF( \d+)? \d{4}\.pdf$/i.test(ad || '') ? 'Teklifler' : 'Poliçeler';   // makbuz da poliçelerle gider
    const idbOpen = () => new Promise((res, rej) => { const r = indexedDB.open('astra-tema', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    async function idbGet(k) { const db = await idbOpen(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
    async function idbSet(k, v) { const db = await idbOpen(); return new Promise((res, rej) => { const q = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); }
    function loadDir() { try { idbGet('dir').then(h => { if (h) { dirHandle = h; vRender(); } }).catch(() => {}); idbGet('gunluk').then(g => { gunluk = !!g; vRender(); }).catch(() => {}); idbGet('masa').then(m => { masa = !!m; vRender(); }).catch(() => {}); idbGet('otoPol').then(v => { if (typeof v === 'boolean') { otoPol = v; vRender(); } }).catch(() => {}); idbGet('otoTek').then(v => { if (typeof v === 'boolean') { otoTek = v; vRender(); } }).catch(() => {}); } catch (e) {} }
    // Seçili klasörün içinde bugünün klasörünü bul/oluştur. {dir, yeni}
    async function gunDir(tur) {
        const ad = gunAd(tur);
        let yeni = false;
        try { await dirHandle.getDirectoryHandle(ad); } catch (e) { yeni = true; }
        const dir = await dirHandle.getDirectoryHandle(ad, { create: true });
        return { dir, yeni, ad };
    }
    async function helperKaydet(name, blob, tip) {
        const root = document.documentElement;
        try {
            const u8 = new Uint8Array(await blob.arrayBuffer());
            let bin = '';
            for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
            root.removeAttribute('data-astra-save-ack');
            root.setAttribute('data-astra-save', JSON.stringify({ name, tip: tip || 'application/pdf', t: Date.now() }));
            root.setAttribute('data-astra-save-b64', btoa(bin));
            window.dispatchEvent(new CustomEvent('astra-dosya-kaydet'));
            const ack = await waitFor(() => root.getAttribute('data-astra-save-ack'), 15000);
            return ack === 'ok';
        } catch (e) { return false; }
    }
    async function gunlukKur() {
        if (helperSurum() >= 1.2 && !dirHandle) {          // masaüstü modu: bugünün klasörlerini hemen oluştur
            if (!masa) { masa = true; try { await idbSet('masa', true); } catch (e) {} }
            let son = ''; try { son = localStorage.getItem('astraMasaGun') || ''; } catch (e) {}
            if (son === gunStr()) { vNotify('Bugün için klasörler zaten var\n📁 ' + gunAd('Poliçeler') + '\n📁 ' + gunAd('Teklifler'), 'ok', 6000); vRender(); return; }
            vNotify('Klasörler oluşturuluyor...', 'busy');
            const not = new Blob(['Bu dosyayı silebilirsin; klasörü oluşturmak için bırakıldı.'], { type: 'text/plain' });
            const o1 = await helperKaydet(gunAd('Poliçeler') + '/klasör.txt', not, 'text/plain');
            const o2 = await helperKaydet(gunAd('Teklifler') + '/klasör.txt', not, 'text/plain');
            if (o1 && o2) { try { localStorage.setItem('astraMasaGun', gunStr()); } catch (e) {} vNotify('✔ Masaüstünde oluşturuldu\n📁 ' + gunAd('Poliçeler') + '\n📁 ' + gunAd('Teklifler'), 'ok', 7000); }
            else vNotify('Klasör oluşturulamadı. Tampermonkey Download Mode "Browser API" ve Chrome indirme konumu Masaüstü olmalı', 'err', 8000);
            vRender(); return;
        }
        if (!window.showDirectoryPicker) return;
        if (!dirHandle) {
            vNotify('Masaüstünde bir klasör seç (ör. "Astra"). Bugünün klasörleri onun içine açılır.', 'busy', 4000);
            await pickDir();
            if (!dirHandle) return;
        }
        if (!(await ensureDirPerm())) { vNotify('Klasör izni verilmedi', 'err'); return; }
        try {
            const a = await gunDir('Poliçeler'), b = await gunDir('Teklifler');
            gunluk = true; await idbSet('gunluk', true);
            if (!a.yeni && !b.yeni) vNotify('Bugün için klasörler zaten var\n📁 ' + a.ad + '\n📁 ' + b.ad, 'ok', 6000);
            else vNotify('✔ Klasörler hazır  (' + dirHandle.name + ')\n📁 ' + a.ad + (a.yeni ? '  (yeni)' : '') + '\n📁 ' + b.ad + (b.yeni ? '  (yeni)' : ''), 'ok', 6500);
        } catch (e) { vNotify('Klasör oluşturulamadı: ' + String(e && e.message || e).slice(0, 80), 'err'); }
        vRender();
    }
    async function pickDir() {
        if (!window.showDirectoryPicker) return;
        try {
            const h = await window.showDirectoryPicker({ id: 'astra-pdf', mode: 'readwrite', startIn: 'desktop' });
            dirHandle = h; await idbSet('dir', h);
        } catch (e) { /* iptal edildi ya da klasör reddedildi */ }
        vRender();
    }
    async function ensureDirPerm() {
        if (!dirHandle) return false;
        try {
            let p = await dirHandle.queryPermission({ mode: 'readwrite' });
            if (p !== 'granted') p = await dirHandle.requestPermission({ mode: 'readwrite' });
            return p === 'granted';
        } catch (e) { return false; }
    }
    // Seçili klasörde (sırayla: kendisi, içindekiler, bir alt seviye) adı "poliç..." ile başlayan klasörü bulur.
    // Büyük/küçük harf, İ/ı, Ç/C ve birleşik/ayrık Türkçe karakter farkı önemli değil: POLİÇELER, Poliçeler, POLICELER...
    const polAdi = ad => ad.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ç/g, 'c').trim();
    const polMu = ad => /^polic/.test(polAdi(ad));
    async function policeKlasoru() {
        if (!dirHandle) return null;
        try {
            if (polMu(dirHandle.name)) return dirHandle;
            const alt = [];
            for await (const [ad, h] of dirHandle.entries()) {
                if (h.kind !== 'directory') continue;
                if (polMu(ad)) return h;
                alt.push(h);
            }
            for (const h of alt.slice(0, 60)) {
                try { for await (const [ad, h2] of h.entries()) { if (h2.kind === 'directory' && polMu(ad)) return h2; } } catch (e) { /* okunamadı */ }
            }
        } catch (e) { /* klasör okunamadı */ }
        return null;
    }
    // Klasöre yazar; aynı ad varsa " (1)", " (2)" ... ekler (içerik aynı olsa bile). Son adı döndürür.
    async function saveToDir(name, blob, hedef) {
        const D = hedef || dirHandle;
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
        for (let n = 0; n < 500; n++) {
            const ad = n ? base + ' (' + n + ')' + ext : name;
            let fh = null;
            try { fh = await D.getFileHandle(ad); } catch (e) { fh = null; }   // yoksa hata verir
            if (!fh) {
                fh = await D.getFileHandle(ad, { create: true });
                const w = await fh.createWritable(); await w.write(blob); await w.close();
                return ad;
            }
            // aynı ad var (içerik aynı olsa da): sıradaki numarayı dene
        }
        throw new Error('uygun dosya adı bulunamadı');
    }
    // Pencerenin altında büyük, net bildirim şeridi (tarih bazlı kapanır)
    let notifyUntil = 0, notifyTimer = 0;
    function vNotify(msg, kind, ms) {
        if (!V.ov) return;
        const n = V.ov.querySelector('[data-notify]'); if (!n) return;
        n.textContent = msg;
        n.style.background = kind === 'ok' ? '#16a34a' : (kind === 'err' ? '#dc2626' : '#2563eb');
        n.style.display = '';
        notifyUntil = kind === 'busy' ? Date.now() + 60000 : Date.now() + (ms || 5000);
        if (!notifyTimer) notifyTimer = setInterval(() => {
            if (Date.now() < notifyUntil) return;
            clearInterval(notifyTimer); notifyTimer = 0;
            const el = V.ov && V.ov.querySelector('[data-notify]'); if (el) el.style.display = 'none';
        }, 300);
    }
    // makbuz baytlarını yardımcı script (v1.1+) ile al: sayfa makbuz sunucusunu doğrudan okuyamaz
    async function helperBytes(url) {
        const root = document.documentElement;
        if (parseFloat(root.getAttribute('data-astra-helper') || '0') < 1.1) return null;
        try {
            root.removeAttribute('data-astra-dl-ack'); root.removeAttribute('data-astra-b64');
            root.setAttribute('data-astra-get', JSON.stringify({ url, t: Date.now() }));
            window.dispatchEvent(new CustomEvent('astra-makbuz-getir'));
            const ack = await waitFor(() => root.getAttribute('data-astra-dl-ack'), 12000);
            if (ack !== 'ok') return null;
            const bin = atob(root.getAttribute('data-astra-b64') || '');
            root.removeAttribute('data-astra-b64');
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: 'application/pdf' });
        } catch (e) { return null; }
    }
    async function getBlobForTab(t) {
        if (t.blob) return t.blob;
        try {
            const r = await origFetch.call(window, t.url);
            if (r.ok) { t.blob = new Blob([await r.blob()], { type: 'application/pdf' }); return t.blob; }
        } catch (e) { /* makbuz sunucusu izin vermiyor: yardımcıya geç */ }
        if (!/^blob:/i.test(t.url)) { const b = await helperBytes(t.url); if (b) { t.blob = b; return b; } }
        return null;
    }
    // dönüş: { yer, ad } (ad: kaydedilen son dosya adı), olmadıysa null
    async function kaydetTab(t, quiet, sor) {
        if (!t || !t.url) return null;
        let ad = t.name || 'belge.pdf';
        let fh = null;
        // ⚙ Ayarlar: otomatik indirme kapalıysa (teklif / poliçe-makbuz ayrı ayrı) İNDİR'e basınca hangi adla kaydedileceği sorulur
        if (sor && (V.mode === 'teklif' ? !otoTek : !otoPol)) {
            let sorulduPicker = false;
            if (window.showSaveFilePicker) {
                try {
                    const opts = { suggestedName: ad, id: 'astra-pdf-kayit', types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] };
                    if (dirHandle) opts.startIn = dirHandle;
                    fh = await window.showSaveFilePicker(opts);
                    ad = fh.name; sorulduPicker = true;
                } catch (e) {
                    if (e && e.name === 'AbortError') return null;   // vazgeçti
                    fh = null;
                }
            }
            if (!sorulduPicker) {
                const n = window.prompt('Dosya hangi adla kaydedilsin?', ad);
                if (n === null) return null;
                const temiz = n.replace(/[\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
                if (temiz) ad = /\.pdf$/i.test(temiz) ? temiz : temiz + '.pdf';
            }
        }
        if (!quiet) vNotify('İndiriliyor...  ' + ad, 'busy');
        try {
            const blob = await getBlobForTab(t);
            if (blob) {
                if (fh) {
                    const w = await fh.createWritable(); await w.write(blob); await w.close();
                    if (!quiet) vNotify('✔ Kaydedildi\n' + ad, 'ok');
                    return { yer: 'seçilen konum', ad };
                }
                if (masa && helperSurum() >= 1.2) {
                    const yol = gunAd(turAd(ad)) + '/' + ad;
                    if (await helperKaydet(yol, blob)) {
                        if (!quiet) vNotify('✔ İndirildi  →  📁 ' + gunAd(turAd(ad)) + '\n' + ad, 'ok');
                        return { yer: gunAd(turAd(ad)), ad };
                    }
                }
                if (dirHandle && await ensureDirPerm()) {
                    let hedef = dirHandle, yer = dirHandle.name, yok = false;
                    if (gunluk) { const g = await gunDir(turAd(ad)); hedef = g.dir; yer = g.ad; }
                    else if (V.mode === 'police') {   // poliçe/makbuz: seçili klasördeki POLİÇELER klasörüne
                        const pk = await policeKlasoru();
                        if (pk) { hedef = pk; yer = pk.name; } else yok = true;
                    }
                    const son = await saveToDir(ad, blob, hedef);
                    if (!quiet) vNotify('✔ İndirildi  →  📁 ' + yer + '\n' + son + (yok ? '\n(POLİÇELER klasörü bulunamadı, seçili klasöre kaydedildi)' : ''), yok ? 'err' : 'ok');
                    return { yer, ad: son };
                }
                const u = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = u; a.download = ad; a.dataset.astraReal = '1';
                document.body.appendChild(a); origAClick.call(a); a.remove();
                setTimeout(() => URL.revokeObjectURL(u), 60000);
                if (!quiet) vNotify('✔ İndirildi\n' + ad, 'ok');
                return { yer: 'indirilenler', ad };
            }
            // baytlar alınamadı (yardımcı yok/eski): eski yol
            if (fh) { try { if (fh.remove) await fh.remove(); } catch (e) {} }
            const ok = await helperDownload(t.url, ad);
            if (ok) { if (!quiet) vNotify('✔ İndirildi\n' + ad, 'ok'); return { yer: 'indirilenler', ad }; }
            window.open(t.url, '_blank');
            if (!quiet) vNotify('İndirilemedi, makbuz yeni sekmede açıldı', 'err');
            return null;
        } catch (e) {
            try { window.open(t.url, '_blank'); } catch (e2) {}
            if (!quiet) vNotify('İndirilemedi: ' + String(e && e.message || e).slice(0, 80), 'err');
            return null;
        }
    }
    async function tumunuIndir() {
        if (dirHandle) await ensureDirPerm();   // izin sorusu tıklama anında çıksın
        const liste = V.tabs.filter(x => x.url);
        const adlar = []; let yer = '';
        for (let i = 0; i < liste.length; i++) {
            vNotify('İndiriliyor ' + (i + 1) + '/' + liste.length + '...  ' + (liste[i].name || ''), 'busy');
            const r = await kaydetTab(liste[i], true, true);
            if (r) { adlar.push(r.ad); yer = r.yer; }
        }
        if (adlar.length === liste.length) vNotify('✔ ' + adlar.length + ' dosya indirildi' + (yer && yer !== 'indirilenler' ? '  →  📁 ' + yer : '') + '\n' + adlar.join('\n'), 'ok', 6500);
        else vNotify('Bazı dosyalar indirilemedi (' + adlar.length + '/' + liste.length + ')', 'err', 6500);
    }
    // ---- WhatsApp'a gönder: PDF'leri "Astra WhatsApp Köprüsü" scriptine verir, o da WhatsApp Web'e iletir ----
    const blobB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
    async function whatsappGonder() {
        const liste = V.tabs.filter(x => x.url);
        if (!liste.length) { vNotify('Gönderilecek belge henüz hazır değil', 'err'); return; }
        const root = document.documentElement;
        if (!root.getAttribute('data-astra-wa-kopru')) {
            vNotify('WhatsApp köprüsü yüklü değil.\nTampermonkey\'e "Astra WhatsApp Köprüsü" scriptini ekle, sayfayı yenile', 'err', 8000);
            return;
        }
        vNotify('WhatsApp için hazırlanıyor...', 'busy');
        try {
            const files = [];
            for (const t of liste) {
                const blob = await getBlobForTab(t);
                if (blob) files.push({ name: t.name || 'belge.pdf', b64: await blobB64(blob) });
            }
            if (!files.length) { vNotify('Dosyalar alınamadı', 'err'); return; }
            root.removeAttribute('data-astra-wa-ack');
            root.setAttribute('data-astra-wa', JSON.stringify({ files, t: Date.now() }));
            window.dispatchEvent(new CustomEvent('astra-whatsapp-gonder'));
            const ack = await waitFor(() => root.getAttribute('data-astra-wa-ack'), 10000);
            root.removeAttribute('data-astra-wa');
            const eksik = files.length < liste.length ? '\n(' + files.length + '/' + liste.length + ' dosya alınabildi)' : '';
            if (ack === 'opened' || ack === 'ready') { const n = V.ov && V.ov.querySelector('[data-notify]'); if (n) n.style.display = 'none'; waTalimat(files, ack === 'opened', eksik); }
            else vNotify('Köprü yanıt vermedi. "Astra WhatsApp Köprüsü" scripti açık mı?', 'err', 7000);
        } catch (e) {
            try { root.removeAttribute('data-astra-wa'); } catch (e2) {}
            vNotify('WhatsApp için hazırlanamadı: ' + String(e && e.message || e).slice(0, 80), 'err');
        }
    }
    function waTalimat(files, acildi, eksik) {
        const ort = document.createElement('div');
        ort.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;font-family:Segoe UI,system-ui,Arial,sans-serif;';
        const k = document.createElement('div');
        k.style.cssText = 'width:440px;max-width:92vw;background:#fff;border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.45);color:#0f172a;';
        const el = (css, t) => { const e = document.createElement('div'); e.style.cssText = css; e.textContent = t; return e; };
        k.appendChild(el('font-weight:800;font-size:17px;margin-bottom:6px;', '✔ ' + files.length + ' dosya WhatsApp\'a hazır' + (eksik ? ' ' + eksik.trim() : '')));
        k.appendChild(el('font-weight:700;font-size:13.5px;color:#128c4a;background:#ecfdf3;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px;margin-bottom:12px;', acildi ? 'WhatsApp Web yeni sekmede açıldı, o sekmeye geç.' : 'WhatsApp Web zaten açık, onun sekmesine geç.'));
        ['1. WhatsApp Web sekmesine bak (sağ üstte "Astra\'dan gelenler" kutusu çıkar).', '2. Soldan dosyayı göndereceğin kişinin sohbetini aç.', '3. Kişiyi seçince onay penceresi kendiliğinden çıkar.', '4. Kişiyi ve dosyaları kontrol et, "EVET, GÖNDER"e bas.']
            .forEach(t => k.appendChild(el('font-weight:600;font-size:13.5px;line-height:1.5;padding:3px 0;color:#334155;', t)));
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = 'ANLADIM';
        b.style.cssText = 'margin-top:16px;width:100%;padding:11px;border:0;border-radius:10px;background:#25d366;color:#fff;font-weight:800;font-size:14px;cursor:pointer;';
        b.addEventListener('click', () => ort.remove());
        k.appendChild(b); ort.appendChild(k);
        ort.addEventListener('mousedown', e => { if (e.target === ort) ort.remove(); });
        document.body.appendChild(ort);
    }
    function vSet(id, label, url, name, msg) {
        let t = V.tabs.find(x => x.id === id);
        if (!t) { t = { id }; V.tabs.push(t); }
        t.label = label; t.url = url || null; t.name = name || ''; t.msg = msg || '';
    }
    function vMakbuzTabs(rows) {
        (rows || []).forEach((r, i) => vSet('m' + i, rows.length > 1 ? 'Makbuz ' + (i + 1) : 'Makbuz', r.url, adlandir('MAKBUZ', i, rows.length) || ((r.title || 'Makbuz') + '.pdf')));
    }

    function showPdf(blob, name, directUrl) {
        consumeView();
        const title = (name || 'PDF önizleme').toString();
        const fname = /\.pdf$/i.test(title) ? title : title + '.pdf';
        const mkUrl = () => {
            const b = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
            const u = URL.createObjectURL(b); V.blobs.push(u); return u;
        };
        // "Poliçe + Makbuz" düğmesi pencereyi açıp poliçeyi bekliyorsa: gelen PDF poliçe sekmesine girer
        if (V.ov && V.waitingPolicy && !directUrl) {
            V.waitingPolicy = false;
            vSet('police', V.waitLabel || 'Poliçe', mkUrl(), adlandir(V.waitTur || 'POLİÇE') || fname);
            V.act = V.tabs.findIndex(t => t.id === 'police');
            vRender();
            return;
        }
        vClose(); vOpen();
        if (directUrl) {
            V.mode = 'police';
            vSet('doc', 'Makbuz', directUrl, adlandir('MAKBUZ', 0, 1) || fname);
        } else {
            const lb = lastThumbLabel || title;
            // Sadece kart etiketi TAM "TEKLİF" veya "POLİÇE" ise teklif/poliçe say (ÜRÜN KARTI, BİLGİLENDİRME vb. türsüz kalır)
            const lbN = lb.trim().toLocaleUpperCase('tr');
            const tur = lastThumbLabel
                ? (lbN === 'TEKLİF' ? 'TEKLİF' : (lbN === 'POLİÇE' ? 'POLİÇE' : ''))
                : (/tekl/i.test(title) ? 'TEKLİF' : (/pol/i.test(title) ? 'POLİÇE' : ''));
            V.mode = tur === 'TEKLİF' ? 'teklif' : (tur === 'POLİÇE' ? 'police' : '');
            vSet('doc', title, mkUrl(), (tur && adlandir(tur)) || fname);
            lastThumbLabel = '';
            if (makbuzCache.length && isPolicy()) vMakbuzTabs(makbuzCache);
        }
        V.act = 0;
        vRender();
    }

    // Sol alttaki düğme: poliçeyi ve makbuzu tek pencerede göster
    const tekKart = () => okTxt(txtOf(document.getElementById('lbl_TeklifNo')));
    async function polisVeMakbuz() {
        const polis = isPolicy();
        if (!polis && !tekKart()) return;
        const tur = polis ? 'POLİÇE' : 'TEKLİF', etiket = polis ? 'Poliçe' : 'Teklif';
        vClose(); vOpen();
        V.waitingPolicy = true; V.waitTur = tur; V.waitLabel = etiket;
        vSet('police', etiket, null, '', etiket + ' hazırlanıyor, lütfen bekle...');
        V.act = 0; V.mode = polis ? 'police' : 'teklif'; vRender();
        const pol = polNo();
        // makbuz paralel gelsin; yoksa sadece poliçe sekmesi kalır
        const cur = V.ov;
        if (polis) Promise.resolve(fetchMakbuzRows(pol)).then(rows => {
            if (V.ov !== cur) return;
            const r = (rows && rows.length) ? rows : makbuzCache;
            if (r && r.length) { vMakbuzTabs(r); vRender(); }
        });
        try {
            // Site belgeyi hemen hazırlamayabilir: hazır olana kadar (en fazla ~60 sn) otomatik tekrar dener
            const bitis = Date.now() + 60000;
            let deneme = 0, bulundu = false;
            while (V.ov === cur && V.waitingPolicy && Date.now() < bitis) {
                deneme++;
                if (deneme > 1) { vSet('police', etiket, null, '', etiket + ' henüz hazır değil, tekrar deneniyor (' + deneme + ')...'); vRender(); }
                await waitFor(() => !hopBusy && (deneme > 1 || pending === 0), deneme === 1 ? 6000 : 2000);
                if (V.ov !== cur) return;
                if (!ulVisible()) {   // Çıktı/Evrak listesi açık değilse aç
                    document.body.classList.add('astra-hop');
                    const c = cardByText(/çıktı/) || cardByText(/evrak/);
                    if (c) await pressCard(c, () => !!ulVisible());
                    if (!ulVisible()) { try { window.CreatePolicyView.Actions.GetView('Production/PolicyDocument2', true); } catch (e) {} await waitFor(ulVisible, 3000); }
                }
                // eski (orijinal) tasarımda da bulunsun: önce işaretli kart, yoksa etiket yazısından (tüm slaytlarda) ara
                const bulKart = () => document.querySelector('#carouselImages li.' + (polis ? 'astra-doc-police' : 'astra-doc-teklif')) ||
                    Array.from(document.querySelectorAll('#carouselImages li')).find(x => {
                        if (x.classList.contains('astra-makbuz-card')) return false;
                        const lb = x.querySelector('a label'); const n = ((lb && lb.textContent) || '').trim().toLocaleUpperCase('tr');
                        return n === tur;
                    });
                const li = await waitFor(bulKart, 6000);
                if (V.ov !== cur) return;
                const a = li && li.querySelector('.thumbnail > a');
                if (!a) { await sleep(1500); continue; }   // belge kartı henüz gelmedi: biraz bekle, tekrar dene
                bulundu = true;
                wantUntil = Date.now() + 20000;
                wrapPdfMake();
                a.click();
                await waitFor(() => !V.waitingPolicy || V.ov !== cur, 14000);   // PDF gelmezse döngü yeniden basar
            }
            document.body.classList.remove('astra-hop');
            if (V.ov === cur && V.waitingPolicy) {
                V.waitingPolicy = false;
                vSet('police', etiket, null, '', bulundu
                    ? etiket + ' PDF\'i alınamadı. Birazdan düğmeye tekrar bas veya Çıktı/Evrak listesinden ' + tur + ' kartına elle bas.'
                    : etiket + ' belgesi hazırlanamadı. Sistem henüz oluşturmamış olabilir; birazdan düğmeye tekrar bas.');
                vRender();
            }
        } finally {
            document.body.classList.remove('astra-hop');
        }
    }

    function fab() {
        let b = document.getElementById('astra-fab');
        const pol = !!labelPol() && isPolicy();
        const tek = !pol && !isPolicy() && tekKart();
        const show = pol || tek;
        if (show) {
            if (!b) {
                b = document.createElement('button');
                b.id = 'astra-fab'; b.type = 'button';
                b.addEventListener('click', polisVeMakbuz);
                document.body.appendChild(b);
            }
            const yeni = pol ? '📄 Poliçe + Makbuz' : '📄 Teklif';
            if (b.textContent !== yeni) b.textContent = yeni;
            b.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:99999;padding:11px 18px;border:0;border-radius:12px;background:' + (pol ? '#16a34a' : '#ea580c') + ';color:#fff;font:700 13.5px Segoe UI,system-ui,Arial,sans-serif;cursor:pointer;box-shadow:0 6px 18px ' + (pol ? 'rgba(22,163,74,.4)' : 'rgba(234,88,12,.4)') + ';';
        } else if (b) {
            b.remove();
        }
    }

    // Yol 1: pdfMake kullanılıyorsa download() yerine önizleme göster
    function wrapPdfMake() {
        const pm = window.pdfMake;
        if (!pm || pm.__astraWrapped || typeof pm.createPdf !== 'function') return;
        const orig = pm.createPdf;
        pm.createPdf = function () {
            const doc = orig.apply(this, arguments);
            try {
                if (doc && typeof doc.download === 'function' && typeof doc.getBlob === 'function') {
                    const od = doc.download.bind(doc);
                    doc.download = function (name, cb) {
                        if (!wantView()) return od(renameDl(name) || name, cb);
                        doc.getBlob(function (blob) { showPdf(blob, name); if (typeof cb === 'function') cb(); });
                    };
                }
            } catch (e) { /* sessizce geç */ }
            return doc;
        };
        pm.__astraWrapped = true;
    }

    // Yol 2: gizli <a download> ile indirme yapılıyorsa yakala (FileSaver vb.)
    const origAClick = HTMLAnchorElement.prototype.click;
    function renameDl(name) {
        const n = String(name || '');
        // Sadece adı TAM "POLİÇE" / "TEKLİF" olanlar yeniden adlandırılır (ÜRÜN KARTI, BİLGİLENDİRME vb. kendi adıyla iner)
        const nn = n.replace(/\.pdf$/i, '').trim().toLocaleUpperCase('tr');
        const kind = nn === 'POLİÇE' ? 'POLİÇE' : (nn === 'TEKLİF' ? 'TEKLİF' : '');
        return kind ? adlandir(kind) : '';
    }
    function tryIntercept(a) {
        try {
            if (a && a.hasAttribute && a.hasAttribute('download') && !(a.dataset && a.dataset.astraReal)) {
                const h = a.href || '';
                if (/^(blob|data):/i.test(h) || h.indexOf(location.origin) === 0) {
                    const nn = renameDl(a.getAttribute('download'));
                    if (nn) a.setAttribute('download', nn);
                }
            }
        } catch (e) { /* sessizce geç */ }
        if (!wantView() || !a || (a.dataset && a.dataset.astraReal)) return false;
        if (!a.hasAttribute('download')) return false;
        const href = a.href || '';
        if (!/^(blob|data):/i.test(href)) return false;
        fetch(href).then(r => r.blob()).then(b => {
            if (/pdf/i.test(b.type) || /\.pdf$/i.test(a.getAttribute('download') || '')) {
                showPdf(b, a.getAttribute('download'));
            } else {
                a.dataset.astraReal = '1';
                origAClick.call(a);
            }
        }).catch(() => { a.dataset.astraReal = '1'; origAClick.call(a); });
        return true;
    }
    HTMLAnchorElement.prototype.click = function () {
        if (tryIntercept(this)) return;
        return origAClick.apply(this, arguments);
    };
    const origDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (ev) {
        if (ev && ev.type === 'click' && this instanceof HTMLAnchorElement && tryIntercept(this)) return true;
        return origDispatch.apply(this, arguments);
    };

    // Karta tıklanınca "önizleme istendi" işareti koy (20 sn geçerli)
    document.addEventListener('click', e => {
        const a = e.target && e.target.closest && e.target.closest('#carouselImages .thumbnail > a');
        if (!a || a.closest('.astra-makbuz-card')) return;
        wantUntil = Date.now() + 20000;
        lastThumbLabel = txtOf(a.querySelector('label'));
        wrapPdfMake();
    }, true);

    // =====================================================================
    // MAKBUZ İSTEĞİNİ SESSİZCE İZLE
    // =====================================================================
    const API_URL = 'https://astra-api.anadolusigorta.com.tr/WebInsurance.API/payment/afsDocumentList';
    let lastApi = null;   // sitenin kendi API isteğinden öğrenilen başlıklar / alanlar
    let curPol = '', curTyp = '', curTek = '';   // en son sorgulanan poliçe (istek gövdesinden); sayfa etiketleri sıfırlansa da kalır
    let lastAuth = '';    // sitenin API isteklerinden öğrenilen authorization başlığı
    let pending = 0;      // devam eden istek sayısı (geçişten önce sitenin işi bitsin)

    // Yanıttan (JSON ya da HTML) makbuz linklerini çıkar
    function parseMakbuzText(text) {
        const out = [];
        const clean = u => String(u).replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');
        const add = (title, url) => {
            url = clean(url);
            if (!/Makbuz_/i.test(url)) return;
            if (out.some(x => pathKey(x.url) === pathKey(url))) return;
            out.push({ title: String(title || 'Tahsilat Makbuzu').trim(), url });
        };
        try {
            const walk = o => {
                if (Array.isArray(o)) return o.forEach(walk);
                if (o && typeof o === 'object') {
                    const title = o.title || o.name || o.documentName || o.baslik || o.description || o.aciklama;
                    Object.keys(o).forEach(k => {
                        const v = o[k];
                        if (typeof v === 'string' && /^https?:\/\//i.test(v)) add(title, v); else walk(v);
                    });
                }
            };
            walk(JSON.parse(text));
        } catch (e) { /* JSON değil */ }
        if (!out.length) {
            const re = /<a[^>]*?(?:title="([^"]*)")?[^>]*?href="([^"]*Makbuz_[^"]*)"/gi;
            let m;
            while ((m = re.exec(text))) add(m[1], m[2]);
        }
        if (!out.length) {
            const re2 = /https?:\/\/[^"'\s<>]*Makbuz_[^"'\s<>]*/gi;
            let m;
            while ((m = re2.exec(text))) add('', m[0]);
        }
        return out;
    }

    // Resim, PDF, script, büyük dosya gibi cevapları okuma (hız için)
    const SKIP_URL = /\.(js|css|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|map|pdf|mp4|webp)(\?|#|$)/i;
    function worthSniff(url, ct, len) {
        if (SKIP_URL.test(String(url))) return false;
        if (ct && !/json|html|text|xml/i.test(ct)) return false;
        if (len && +len > 1500000) return false;
        return true;
    }

    function sniffMakbuz(method, url, body, text) {
        if (!text || !/Makbuz_|CNPolicyPaymentsDocumentsTable/.test(text)) return;
        try { console.info('[ASTRA-MAKBUZ]', method, url, typeof body === 'string' ? body.slice(0, 500) : body); } catch (e) {}
        const found = parseMakbuzText(text);
        if (!found.length) {
            try { console.info('[ASTRA-MAKBUZ-RESP]', text.slice(0, 700).replace(/X-Amz-Signature=[0-9a-f]+/gi, 'X-Amz-Signature=...')); } catch (e) {}
            return;
        }
        makbuzSig = policySig();
        makbuzCache = found;
        schedule();
    }
    const xhrOpen = XMLHttpRequest.prototype.open, xhrSend = XMLHttpRequest.prototype.send, xhrSet = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (m, u) { this.__am = [m, u]; return xhrOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) { (this.__ah = this.__ah || {})[k] = v; if (/^authorization$/i.test(k) && v) lastAuth = v; return xhrSet.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) {
        try {
            if (this.__am && /astra-api\.anadolusigorta\.com\.tr/.test(String(this.__am[1]))) {
                const params = {};
                if (typeof b === 'string') new URLSearchParams(b).forEach((v, k) => { params[k] = v; });
                lastApi = { headers: Object.assign({}, this.__ah), params };
                if (/GetPolicViewData/i.test(String(this.__am[1]))) {
                    curPol = (params['POLICE_GORUNTULEME_SORGU[POLICE_NO]'] || '').trim();
                    curTyp = params['POLICE_GORUNTULEME_SORGU[ARAMA_TIPI]'] || '';
                    curTek = (params['POLICE_GORUNTULEME_SORGU[TEKLIF_NO]'] || '').trim();
                }
                if (params.agentCode) { try { localStorage.setItem('astraAgentCode', params.agentCode); } catch (e) {} }
            }
        } catch (e) { /* sessizce geç */ }
        this.addEventListener('load', () => {
            try {
                if (this.__am && /GetPolicViewData/i.test(String(this.__am[1]))) {
                    // gerçek poliçe no yanıttan gelir (teklif numarasıyla aratsan bile)
                    try {
                        const j = JSON.parse(this.responseText);
                        const ab = j && j.Data && j.Data.Anabilgiler;
                        const pn0 = ab && ab.PoliceNo != null ? String(ab.PoliceNo).trim() : '';
                        if (pn0 && pn0 !== '0' && pn0 !== '-') curPol = pn0;   // yalnız geçerliyse üzerine yaz
                    } catch (e) { /* yanıt okunamadı: istekteki değer kalır */ }
                    if (curPol) { const pn = curPol; setTimeout(() => onceden(pn), 0); }
                }
            } catch (e) { /* sessizce geç */ }
            try {
                if (!this.__am || !(this.responseType === '' || this.responseType === 'text')) return;
                if (!worthSniff(this.__am[1], this.getResponseHeader('content-type'), this.getResponseHeader('content-length'))) return;
                sniffMakbuz(this.__am[0], this.__am[1], b, this.responseText);
            } catch (e) { /* sessizce geç */ }
        });
        pending++;
        this.addEventListener('loadend', () => { pending = Math.max(0, pending - 1); });
        return xhrSend.apply(this, arguments);
    };
    const origFetch = window.fetch;
    if (origFetch) window.fetch = function (input, init) {
        const p = origFetch.apply(this, arguments);
        pending++;
        p.then(() => { pending = Math.max(0, pending - 1); }, () => { pending = Math.max(0, pending - 1); });
        try {
            const u = typeof input === 'string' ? input : (input && input.url) || '';
            if (!/^(blob|data):/i.test(u)) {
                p.then(r => {
                    const h = r && r.headers;
                    if (!worthSniff(u, h && h.get('content-type'), h && h.get('content-length'))) return;
                    return r.clone().text().then(t => sniffMakbuz((init && init.method) || 'GET', u, init && init.body, t)).catch(() => {});
                }).catch(() => {});
            }
        } catch (e) { /* sessizce geç */ }
        return p;
    };

    const CSS = `
    :root {
        --bg: #f3f5f9;
        --card: #ffffff;
        --text: #0f172a;
        --muted: #334155;
        --line: #e8ecf3;
        --primary: #2563eb;
        --primary-soft: #eff4ff;
        --side: #0f172a;
        --side-2: #111c33;
        --radius: 12px;
        --shadow: 0 1px 2px rgba(15,23,42,.04), 0 4px 14px rgba(15,23,42,.05);
    }

    body, .content-wrapper, .right-side, .main-footer {
        background: var(--bg) !important;
        font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif !important;
        color: var(--text);
    }
    .main-footer { display: none !important; }
    .content-wrapper { padding-top: 6px; }
    .content { padding: 14px 20px; }
    .content-header { padding: 16px 20px 0; }
    .content-header > h1 { font-size: 20px; font-weight: 700; color: var(--text); }

    /* ---------- ÜST BAR ---------- */
    .main-header { box-shadow: 0 1px 0 var(--line); }
    .main-header .navbar,
    .main-header .logo,
    .skin-green-light .main-header .navbar,
    .skin-green-light .main-header .logo {
        background: #fff !important;
        color: var(--text) !important;
        border: 0 !important;
    }
    .main-header .logo { border-right: 1px solid var(--line) !important; }
    .main-header .navbar .nav > li > a,
    .main-header .navbar .sidebar-toggle { color: var(--muted) !important; }
    .main-header .navbar .nav > li > a:hover,
    .main-header .navbar .sidebar-toggle:hover { background: var(--primary-soft) !important; color: var(--primary) !important; }
    /* logo animasyonunu durdur, sadece Astra logosu kalsın */
    #asigortaLogo { display: none !important; }
    #astraLogo { animation: none !important; opacity: 1 !important; transform: none !important; }

    /* ---------- SOL MENÜ ---------- */
    .main-sidebar, .skin-green-light .main-sidebar { background: var(--side) !important; border: 0 !important; }
    .skin-green-light .sidebar a, .sidebar-menu > li > a { color: #e2e8f0 !important; }
    .sidebar-menu > li > a { padding: 11px 16px; border-left: 3px solid transparent; font-weight: 500; }
    .sidebar-menu > li:hover > a,
    .sidebar-menu > li.active > a,
    .sidebar-menu > li.menu-open > a {
        background: var(--side-2) !important; color: #fff !important; border-left-color: var(--primary);
    }
    .sidebar-menu .treeview-menu, .skin-green-light .treeview-menu { background: #0b1324 !important; padding: 4px 0; }
    .sidebar-menu .treeview-menu > li > a { color: #cbd5e1 !important; padding: 8px 12px 8px 30px; font-size: 13px; }
    .sidebar-menu .treeview-menu > li > a:hover { color: #fff !important; background: transparent !important; }
    .user-panel .info > p, .user-panel > .info { color: #e2e8f0 !important; font-weight: 600; font-size: 13px; }
    .sidebar-form { border: 0 !important; background: transparent !important; margin: 8px 12px; }
    .sidebar-form .form-control, .sidebar-form select {
        background: var(--side-2) !important; color: #e2e8f0 !important;
        border: 1px solid #1f2d4a !important; border-radius: 8px !important; height: 36px;
    }

    /* ---------- KUTULAR ---------- */
    .box, .box.box-default {
        background: var(--card) !important; border: 0 !important; border-top: 0 !important;
        border-radius: var(--radius) !important; box-shadow: var(--shadow) !important; margin-bottom: 16px;
    }
    .box-header, .box-header.with-border { border-bottom: 1px solid var(--line) !important; padding: 14px 18px; }
    .box-title { font-size: 14px !important; font-weight: 700; color: var(--text); letter-spacing: .2px; }
    .box-body { padding: 14px 18px; }

    /* ---------- DETAY BİLGİLERİ (başlık / değer) ---------- */
    #boxOthers .row > div { padding: 10px 14px !important; border-bottom: 1px solid var(--line); }
    #boxOthers .row > div > div > label,
    #boxSummary .row > div > div > label {
        font-size: 11.5px; font-weight: 700; color: #334155 !important;
        text-transform: uppercase; letter-spacing: .4px; margin-bottom: 2px;
    }
    label[style*="color:red"], label[style*="color: red"], span[style*="color:red"] {
        color: var(--text) !important; font-weight: 600 !important; font-size: 13.5px;
    }

    /* ---------- DURUM ROZETİ ---------- */
    .astra-badge {
        display: inline-block; padding: 2px 10px; border-radius: 999px;
        font-size: 12px !important; font-weight: 600; background: #e2e8f0; color: #334155 !important;
    }
    .astra-badge.ok { background: #dcfce7; color: #166534 !important; }
    .astra-badge.warn { background: #fef3c7; color: #92400e !important; }
    .astra-badge.bad { background: #fee2e2; color: #991b1b !important; }

    /* ---------- SAĞDAKİ RENKLİ KARTLAR -> sade kartlar ---------- */
    .small-box, .small-box[style] {
        background: #fff !important; color: var(--text) !important;
        border-radius: 10px !important; border: 1px solid var(--line);
        border-left: 4px solid var(--primary); box-shadow: none !important;
        margin-bottom: 10px; transition: box-shadow .15s ease, border-color .15s ease; min-height: 0;
    }
    .small-box:hover { transform: translateY(-1px); box-shadow: var(--shadow) !important; border-color: var(--primary); }
    .small-box .icon { display: none !important; }
    .small-box .inner, .small-box .inner[style] { color: var(--text) !important; padding: 10px 12px; }
    .small-box .inner h3 { margin: 0 !important; font-size: 14px; }
    .small-box .inner h3 sup { font-size: 14px !important; top: 0; font-weight: 700; line-height: 1.25 !important; color: var(--text); }
    .small-box .inner p { margin: 0; font-size: 12px; color: var(--muted) !important; }
    .small-box.bg-orange    { border-left-color: #f59e0b; }
    .small-box.bg-green     { border-left-color: #10b981; }
    .small-box.bg-red       { border-left-color: #ef4444; }
    .small-box.bg-turquois  { border-left-color: #14b8a6; }
    .small-box.bg-purple    { border-left-color: #8b5cf6; }
    .small-box.bg-blue      { border-left-color: #3b82f6; }
    .small-box.bg-info      { border-left-color: #06b6d4; }
    .small-box.bg-fuchsia   { border-left-color: #d946ef; }
    .small-box.bg-danger    { border-left-color: #f43f5e; }
    .small-box.bg-gray      { border-left-color: #94a3b8; }
    .small-box.bg-yellow    { border-left-color: #eab308; }
    .small-box.bg-light-blue{ border-left-color: #0ea5e9; }

    /* ---------- FORM & BUTONLAR ---------- */
    .form-control, select.form-control {
        border: 1px solid #d5dbe6 !important; border-radius: 8px !important;
        box-shadow: none !important; height: 34px; background: #fff;
    }
    .form-control:focus { border-color: var(--primary) !important; box-shadow: 0 0 0 3px rgba(37,99,235,.15) !important; }
    .control-label { color: var(--muted); font-weight: 600; font-size: 12.5px; }
    .required-field { color: #ef4444; }
    .btn { border-radius: 8px !important; font-weight: 600; border-width: 1px; box-shadow: none !important; }
    .btn-success { background: #16a34a !important; border-color: #16a34a !important; }
    .btn-primary { background: var(--primary) !important; border-color: var(--primary) !important; }
    .btn-info    { background: #0ea5e9 !important; border-color: #0ea5e9 !important; }
    .btn-default { background: #fff !important; border-color: #d5dbe6 !important; color: #334155 !important; }

    /* ---------- TABLOLAR ---------- */
    table.dataTable, .table { border: 0 !important; }
    .table > thead > tr > th, table.dataTable thead th {
        background: #f8fafc !important; color: var(--muted); font-size: 11.5px; font-weight: 700;
        text-transform: uppercase; letter-spacing: .4px; border-bottom: 1px solid var(--line) !important; border-top: 0 !important;
    }
    .table > tbody > tr > td { border-top: 1px solid var(--line) !important; font-size: 13px; vertical-align: middle; }
    .table-striped > tbody > tr:nth-of-type(odd) { background: #fff !important; }
    .table-striped > tbody > tr:nth-of-type(even) { background: #fbfcfe !important; }
    .table > tbody > tr:hover { background: var(--primary-soft) !important; }
    .table-bordered, .table-bordered > thead > tr > th, .table-bordered > tbody > tr > td { border-left: 0 !important; border-right: 0 !important; }
    .dataTables_filter input { border-radius: 8px !important; }
    .dataTables_wrapper a { color: var(--primary); font-weight: 600; }

    /* ---------- YENİ DÜZEN: kartlar üstte yatay şerit, içerik tam genişlik ---------- */
    section.content > .row { display: flex !important; flex-wrap: wrap; margin: 0 !important; }
    section.content > .row > .outer-frame,
    section.content > .row > .col-lg-4 {
        float: none !important; width: 100% !important; flex: 0 0 100%; max-width: 100%;
        padding-left: 0 !important; padding-right: 0 !important;
    }
    section.content > .row > .col-lg-4 { order: -1; }
    section.content > .row > .col-lg-4 > .box { margin-bottom: 14px; }
    section.content > .row > .col-lg-4 > .box > .box-body {
        display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px;
    }
    section.content > .row > .col-lg-4 .box-body > div[class*="col-"] {
        float: none !important; width: auto !important; flex: 0 0 auto;
        padding: 0 !important; margin: 0 !important;
    }
    section.content > .row > .col-lg-4 .box-body > div[class*="col-"] > a { display: block; }

    /* kartlar -> kompakt sekme butonları */
    section.content > .row > .col-lg-4 .small-box {
        margin: 0 !important; border-left-width: 4px;
        border-radius: 8px !important; white-space: nowrap;
    }
    section.content > .row > .col-lg-4 .small-box .inner,
    section.content > .row > .col-lg-4 .small-box .inner[style] {
        padding: 8px 14px !important; display: flex; align-items: baseline; gap: 5px;
    }
    section.content > .row > .col-lg-4 .small-box .inner h3,
    section.content > .row > .col-lg-4 .small-box .inner h3[style] { margin: 0 !important; display: inline !important; }
    section.content > .row > .col-lg-4 .small-box .inner h3 sup,
    section.content > .row > .col-lg-4 .small-box .inner h3 sup[style] {
        display: inline !important; font-size: 13.5px !important; font-weight: 700 !important;
        line-height: 1.2 !important; color: var(--text) !important; position: static; vertical-align: baseline;
    }
    section.content > .row > .col-lg-4 .small-box .inner h3 sup span { display: inline !important; }
    section.content > .row > .col-lg-4 .small-box .inner p {
        display: inline !important; font-size: 13.5px !important; font-weight: 600;
        color: var(--text) !important; margin: 0 !important;
    }

    /* ---------- TAŞMA ÖNLEME ---------- */
    .content-wrapper, .content, .box { max-width: 100%; }
    .dataTables_wrapper { overflow-x: auto; }
    .box label[style*="color:red"], .box label[style*="color: red"] { word-break: break-word; overflow-wrap: anywhere; }
    #boxOthers .row { margin: 0 !important; }

    /* ---------- OKUNURLUK: silik yazı yok ---------- */
    .control-label, .table > thead > tr > th, table.dataTable thead th { color: #334155 !important; }
    .form-control::placeholder { color: #64748b; opacity: 1; }
    .content-header > h1, .box-title { color: #0f172a !important; }

    /* ---------- ÇIKTI / EVRAK: PDF'ler tek grid'de, ayrı ayrı kartlar ---------- */
    #carouselImages .carousel-inner {
        display: grid !important; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
        gap: 10px; overflow: visible !important; position: static !important; width: 100%;
    }
    #carouselImages .carousel-inner > .item {
        display: contents !important; transform: none !important; transition: none !important;
    }
    #carouselImages ul.thumbnails { display: contents !important; list-style: none; margin: 0; padding: 0; }
    #carouselImages ul.thumbnails > li,
    #carouselImages ul.thumbnails > li.col-sm-3 {
        float: none !important; width: auto !important; margin: 0 !important; padding: 0 !important; min-width: 0;
    }
    #carouselImages .fff { height: 100%; }
    #carouselImages .thumbnail {
        display: flex; align-items: center; gap: 10px; height: 100%; margin: 0 !important;
        padding: 10px 12px !important; background: #fff; border: 1px solid var(--line) !important;
        border-left: 4px solid #f43f5e !important; border-radius: 10px !important; transition: box-shadow .15s ease, border-color .15s ease;
    }
    #carouselImages .thumbnail:hover { box-shadow: var(--shadow); border-color: #f43f5e !important; transform: translateY(-1px); }
    #carouselImages .thumbnail.astra-sel { background: var(--primary-soft); border-color: var(--primary) !important; }
    #carouselImages .thumbnail .icheckbox_minimal-blue { flex: 0 0 auto; }
    #carouselImages .thumbnail > a {
        flex: 1 1 auto; min-width: 0; display: grid !important; grid-template-columns: 38px 1fr;
        column-gap: 10px; align-items: center; text-align: left; cursor: pointer; text-decoration: none;
    }
    #carouselImages .thumbnail > a img { grid-row: 1 / span 2; width: 38px !important; height: 44px !important; object-fit: contain; }
    #carouselImages .thumbnail > a br { display: none; }
    #carouselImages .thumbnail > a label {
        width: auto !important; text-align: left !important; margin: 0 !important;
        font-size: 13px; font-weight: 700 !important; color: var(--text); line-height: 1.25;
        overflow-wrap: anywhere;
    }
    #carouselImages .thumbnail > a label + br + label { font-size: 12px; font-weight: 600 !important; color: #475569; }
    #carouselImages .control-box, #carouselImages nav { display: none !important; }

    /* POLİÇE = yeşil, TEKLİF = turuncu */
    #carouselImages li.astra-doc-police .thumbnail { border-left-color: #16a34a !important; }
    #carouselImages li.astra-doc-police .thumbnail > a label:first-of-type { color: #15803d !important; font-size: 14.5px; }
    #carouselImages li.astra-doc-teklif .thumbnail { border-left-color: #ea580c !important; }
    #carouselImages li.astra-doc-teklif .thumbnail > a label:first-of-type { color: #c2410c !important; font-size: 14.5px; }

    /* Makbuz otomatik yüklenirken sekme geçişi göze görünmesin */
    body.astra-hop .content-wrapper { opacity: 0 !important; }

    /* MAKBUZ = mavi */
    #carouselImages li.astra-makbuz-card .thumbnail { border-left-color: #2563eb !important; cursor: pointer; }
    #carouselImages li.astra-makbuz-card .thumbnail:hover { border-color: #2563eb !important; }
    #carouselImages li.astra-makbuz-card .thumbnail > a label:first-of-type { color: #1d4ed8 !important; font-size: 14.5px; }

    /* ---------- ARAMA FORMU: üstte alanlar, altta ayrı buton satırı ---------- */
    #CNPolicyParam > .box-body { padding: 18px 20px; }
    #CNPolicyParam form.inputForm {
        float: none !important; width: 100% !important; max-width: none; padding: 0 !important; margin: 0;
    }
    #CNPolicyParam form.inputForm > .box-body {
        display: grid; align-items: end; gap: 16px 18px; padding: 0 !important;
        grid-template-columns: auto minmax(220px, 1fr) 150px 150px;
    }
    @media (max-width: 1000px) {
        #CNPolicyParam form.inputForm > .box-body { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        #CNPolicyParam form.inputForm .form-group:first-child { grid-column: 1 / -1; }
    }
    #CNPolicyParam form.inputForm .form-group { margin: 0 !important; min-width: 0; }
    #CNPolicyParam form.inputForm .form-group > label.control-label,
    #CNPolicyParam form.inputForm .form-group > div[class*="col-sm-"] {
        float: none !important; width: 100% !important; max-width: 100%; padding: 0 !important; text-align: left !important;
    }
    #CNPolicyParam form.inputForm .form-group > label.control-label {
        display: block; margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .5px; color: #475569 !important; white-space: nowrap;
    }
    #CNPolicyParam form.inputForm .required-field { color: #ef4444; font-style: normal; }
    #CNPolicyParam form.inputForm .form-control {
        height: 42px; font-size: 14.5px; font-weight: 600; padding: 0 14px; background: #f8fafc;
        color: var(--text); text-overflow: ellipsis; letter-spacing: .2px;
    }
    #CNPolicyParam form.inputForm .form-control::placeholder { font-size: 13px; font-weight: 400; color: #64748b; }
    #CNPolicyParam form.inputForm .form-control:focus { background: #fff; }

    /* Arama tipi: birleşik segment düğme */
    #CNPolicyParam form.inputForm .form-group:first-child > div[class*="col-sm-"] {
        display: inline-flex !important; gap: 0 !important; width: fit-content !important;
        background: #eaeef5; padding: 4px; border-radius: 10px; height: 42px; align-items: center;
    }
    #CNPolicyParam form.inputForm .col-sm-9 > div { position: relative; gap: 0 !important; }
    #CNPolicyParam form.inputForm .icheckbox_minimal-blue {
        position: absolute !important; width: 1px; height: 1px; opacity: 0; pointer-events: none; overflow: hidden;
    }
    #CNPolicyParam form.inputForm label[for^="policeType"] {
        display: block; height: 34px; line-height: 34px; padding: 0 24px !important; margin: 0 !important;
        border: 0; border-radius: 8px; background: transparent; color: #475569;
        font-weight: 700; font-size: 13.5px; cursor: pointer; user-select: none; white-space: nowrap;
    }
    #CNPolicyParam form.inputForm label[for^="policeType"]:hover { color: var(--text); }
    #CNPolicyParam form.inputForm .icheckbox_minimal-blue.checked + label[for="policeTypeTeklif"] {
        background: #ea580c; color: #fff; box-shadow: 0 1px 3px rgba(234,88,12,.35);
    }
    #CNPolicyParam form.inputForm .icheckbox_minimal-blue.checked + label[for="policeTypePolice"] {
        background: #16a34a; color: #fff; box-shadow: 0 1px 3px rgba(22,163,74,.35);
    }

    /* Buton satırı: ince çizgiyle ayrılmış, sağa hizalı */
    #CNPolicyParam form.inputForm > .box-body > div:last-child {
        grid-column: 1 / -1; padding-top: 16px; border-top: 1px solid var(--line);
    }
    #CNPolicyParam form.inputForm .text-right { display: flex; justify-content: flex-end; align-items: center; gap: 10px; flex-wrap: wrap; }
    #CNPolicyParam form.inputForm .text-right .btn {
        height: 40px; padding: 0 20px; font-size: 12.5px; font-weight: 700; letter-spacing: .4px; white-space: nowrap;
    }
    #CNPolicyParam form.inputForm .text-right .btn.hidden { display: none !important; }
    #CNPolicyParam form.inputForm .text-right .btn i { margin-right: 6px; }
    /* İPTAL: sessiz, SONDURUM: açık mavi, GÖRÜNTÜLE: tek ana buton */
    #CNPolicyParam form.inputForm .text-right .btn-default {
        background: transparent !important; border-color: transparent !important; color: #64748b !important;
    }
    #CNPolicyParam form.inputForm .text-right .btn-default:hover { background: #f1f5f9 !important; color: var(--text) !important; }
    #CNPolicyParam form.inputForm .text-right .btn-info {
        background: #eff6ff !important; border-color: #bfdbfe !important; color: #1d4ed8 !important;
    }
    #CNPolicyParam form.inputForm .text-right .btn-info:hover { background: #dbeafe !important; }
    #CNPolicyParam form.inputForm .text-right .btn-success {
        padding: 0 28px; background: #16a34a !important; border-color: #16a34a !important; color: #fff !important;
        box-shadow: 0 2px 6px rgba(22,163,74,.3) !important;
    }
    #CNPolicyParam form.inputForm .text-right .btn-success:hover { background: #15803d !important; }

    /* ---------- ARAMA KARTI: ortalanmış ---------- */
    #CNPolicyParam { max-width: 820px; margin: 8px auto 20px !important; }
    #CNPolicyParam > .box-body { padding: 24px 28px 22px; }
    #CNPolicyParam > .box-body::before {
        content: "Teklif / Poliçe Sorgula"; display: block; text-align: center;
        font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 20px; letter-spacing: .2px;
    }
    #CNPolicyParam form.inputForm > .box-body {
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 18px 16px; align-items: end;
    }
    /* Arama tipi: üstte, ortada */
    #CNPolicyParam form.inputForm .form-group:first-child {
        grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center;
    }
    #CNPolicyParam form.inputForm .form-group:first-child > label.control-label { text-align: center !important; }
    #CNPolicyParam form.inputForm label[for^="policeType"] { padding: 0 34px !important; }
    /* Butonlar: ortada */
    #CNPolicyParam form.inputForm .text-right { justify-content: center; }
    @media (max-width: 640px) {
        #CNPolicyParam form.inputForm > .box-body { grid-template-columns: minmax(0, 1fr); }
        #CNPolicyParam > .box-body { padding: 18px 16px; }
    }

    /* ---------- DETAY BİLGİLERİ: düzenli kart ızgarası ---------- */
    #boxOthers .box-body .row {
        display: grid !important; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr));
        gap: 10px; padding: 16px 18px !important; margin: 0 !important;
    }
    #boxOthers .box-body .row > div {
        float: none !important; width: auto !important; max-width: none !important; min-width: 0;
        padding: 10px 14px !important; margin: 0 !important;
        background: #fafbfd; border: 1px solid var(--line); border-radius: 10px;
    }
    #boxOthers .box-body .row > div > div > label {
        display: block; margin: 0 0 3px; font-size: 10.5px; font-weight: 700; color: #475569 !important;
        text-transform: uppercase; letter-spacing: .5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #boxOthers label[id^="lbl_"] {
        margin: 0; font-size: 14px; line-height: 1.35; font-weight: 600 !important; color: var(--text) !important;
        overflow-wrap: anywhere; font-variant-numeric: tabular-nums;
    }
    #boxOthers #lbl_BRUT_PRIM, #boxOthers #lbl_NET_PRIM, #boxOthers #lbl_KOMISYON {
        font-size: 16px; font-weight: 700 !important; color: #0f766e !important;
    }
    #boxOthers #lbl_PoliceNo, #boxOthers #lbl_TeklifNo { color: var(--primary) !important; font-weight: 700 !important; }
    #boxOthers .box-header .btn-box-tool {
        width: 28px; height: 28px; padding: 0; border-radius: 8px; color: #475569; background: #f1f5f9;
    }
    #boxOthers .box-header .btn-box-tool:hover { background: #e2e8f0; color: var(--text); }
    .box-header > .box-title::before {
        content: ""; display: inline-block; width: 4px; height: 14px; border-radius: 2px;
        background: var(--primary); margin-right: 9px; vertical-align: -2px;
    }

    /* Tablo arama kutusu */
    .dataTables_filter { margin-bottom: 8px; }
    .dataTables_filter input.form-control { width: 240px !important; height: 34px; background: #f8fafc; }

    /* ---------- TEMİNAT BİLGİLERİ ---------- */
    .benefitPremiumFrame .box, .benefitPremiumFrame .box.box-default, .benefitPremiumFrame .box.box-header {
        box-shadow: none !important; background: transparent !important; border-radius: 0 !important;
        margin: 0 !important; border: 0 !important;
    }
    .benefitPremiumFrame .box-body { padding: 0 !important; }
    .benefitPremiumFrame .col-sm-12, .benefitPremiumFrame .col-lg-12 { overflow-x: auto; }
    .benefitPremiumFrame .col-lg-12 > div[style*="padding: 10px 20px"] { padding: 14px 0 !important; }

    /* Teminat tablosu */
    .benefitPremiumFrame table.fold-table {
        width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--line);
        border-radius: 10px; overflow: hidden; background: #fff;
    }
    .benefitPremiumFrame table.fold-table th {
        background: #f1f5f9; color: #334155; font-size: 11.5px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .5px; padding: 11px 16px; border-bottom: 1px solid var(--line);
    }
    .benefitPremiumFrame table.fold-table td {
        padding: 12px 16px; font-size: 14px; color: var(--text); border-bottom: 1px solid var(--line);
        font-variant-numeric: tabular-nums;
    }
    .benefitPremiumFrame table.fold-table td.view { font-weight: 700; }
    .benefitPremiumFrame table.fold-table td.text-right { font-weight: 600; }
    /* toplam satırı: renksiz, sadece kalın yazı */
    .benefitPremiumFrame table.fold-table tr[style*="3c8dbc"],
    .benefitPremiumFrame table.fold-table tr[style*="3c8dbc"] td {
        background: #fff !important; color: #1e293b !important; font-weight: 700 !important; border-bottom: 0;
    }

    /* Vergi / Prim / Komisyon tablosu */
    .benefitPremiumFrame #vergiTable, .benefitPremiumFrame #installmentsTable {
        width: 100%; border: 1px solid var(--line) !important; border-collapse: separate; border-spacing: 0;
        border-radius: 10px; overflow: hidden; background: #fff; margin: 0;
    }
    .benefitPremiumFrame #vergiTable td, .benefitPremiumFrame #vergiTable th,
    .benefitPremiumFrame #installmentsTable td, .benefitPremiumFrame #installmentsTable th {
        padding: 11px 16px !important; border: 0 !important; border-bottom: 1px solid var(--line) !important;
        font-size: 14px; font-variant-numeric: tabular-nums;
    }
    .benefitPremiumFrame #vergiTable td:first-child { font-weight: 600; color: #334155; }
    .benefitPremiumFrame #vergiTable td:not(:first-child), .benefitPremiumFrame #vergiTable th:not(:first-child) {
        text-align: right; font-weight: 600;
    }
    /* mavi başlık hücreleri -> açık gri bölüm başlığı */
    .benefitPremiumFrame #vergiTable th[style*="3c8dbc"],
    .benefitPremiumFrame #vergiTable td[style*="3c8dbc"] {
        background: #f1f5f9 !important; color: #334155 !important; font-size: 11.5px !important;
        font-weight: 700 !important; text-transform: uppercase; letter-spacing: .5px;
    }
    .benefitPremiumFrame #vergiTable tr:last-child td, .benefitPremiumFrame #installmentsTable tr:last-child td { border-bottom: 0 !important; }

    /* Ödeme planı */
    .benefitPremiumFrame .pull-right > .box { padding: 0 !important; }
    .benefitPremiumFrame .box-header > .box-title,
    .benefitPremiumFrame h4.box-title { font-size: 14px; font-weight: 700; color: var(--text); margin: 14px 0 10px; }
    .benefitPremiumFrame #installmentsTable thead th { background: #f1f5f9 !important; color: #334155 !important; font-size: 11.5px; text-transform: uppercase; letter-spacing: .5px; }
    .benefitPremiumFrame #installmentsTable tr[style*="font-weight:bold"] td { background: #fff !important; color: #1e293b; font-weight: 700; }

    /* ---------- TEMİNAT: Excel gibi ızgaralı tablolar, taşma yok ---------- */
    .benefitPremiumFrame, .benefitPremiumFrame * { box-sizing: border-box; }
    .benefitPremiumFrame { max-width: 100%; }
    .benefitPremiumFrame .row { margin: 0 !important; }
    .benefitPremiumFrame .col-lg-12, .benefitPremiumFrame .col-sm-12,
    .benefitPremiumFrame .col-lg-12 > .col-lg-6 {
        float: none !important; width: 100% !important; max-width: 100%; padding: 0 !important;
    }
    .benefitPremiumFrame .col-sm-12, .benefitPremiumFrame .col-lg-12 { overflow-x: visible; }

    .benefitPremiumFrame table.fold-table,
    .benefitPremiumFrame #vergiTable,
    .benefitPremiumFrame #installmentsTable {
        width: 100% !important; max-width: 100%; table-layout: auto;
        border-collapse: collapse !important; border-spacing: 0; border: 1px solid #c4ccd9 !important;
        border-radius: 0 !important; overflow: visible !important; background: #fff; margin: 0 0 14px;
    }
    .benefitPremiumFrame table.fold-table th, .benefitPremiumFrame table.fold-table td,
    .benefitPremiumFrame #vergiTable th, .benefitPremiumFrame #vergiTable td,
    .benefitPremiumFrame #installmentsTable th, .benefitPremiumFrame #installmentsTable td {
        border: 1px solid #d3d9e4 !important; padding: 9px 14px !important; font-size: 13.5px;
        overflow-wrap: anywhere; word-break: normal; vertical-align: middle;
    }
    /* başlık satırı */
    .benefitPremiumFrame table.fold-table thead th,
    .benefitPremiumFrame #installmentsTable thead th {
        background: #e6ebf3 !important; color: #1e293b !important; font-size: 12px; font-weight: 700;
        text-transform: uppercase; letter-spacing: .4px;
    }
    /* zebra satırlar (Excel gibi) */
    .benefitPremiumFrame table.fold-table tbody tr:nth-child(even) td,
    .benefitPremiumFrame #vergiTable tbody tr:nth-child(even) td,
    .benefitPremiumFrame #installmentsTable tbody tr:nth-child(even) td { background: #f6f8fb; }
    .benefitPremiumFrame table.fold-table tbody tr:hover td,
    .benefitPremiumFrame #vergiTable tbody tr:hover td,
    .benefitPremiumFrame #installmentsTable tbody tr:hover td { background: var(--primary-soft); }
    /* bölüm başlıkları ve toplam satırları net ayrışsın */
    .benefitPremiumFrame #vergiTable th[style*="3c8dbc"],
    .benefitPremiumFrame #vergiTable td[style*="3c8dbc"] {
        background: #e6ebf3 !important; color: #1e293b !important; border-color: #c4ccd9 !important;
    }
    .benefitPremiumFrame table.fold-table tr[style*="3c8dbc"] td,
    .benefitPremiumFrame #installmentsTable tr[style*="font-weight:bold"] td {
        background: #fff !important; color: #1e293b !important; font-weight: 700 !important;
    }
    .benefitPremiumFrame .pull-right { float: none !important; }

    /* ---------- DİĞER ---------- */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
    .label-success, .label-warning, .label-danger { border-radius: 999px; }
    `;

    function addCss(css) {
        if (typeof GM_addStyle === 'function') { GM_addStyle(css); return; }
        const s = document.createElement('style');
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    }
    addCss(CSS);

    // =====================================================================
    // BAŞLANGIÇ MENÜSÜ (Teklif / Poliçe / Ek Girişi ... kartları)
    // =====================================================================
    const CSS3 = `
    #astraLauncher {
        display: flex !important; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
        float: none !important; width: 100% !important; min-height: calc(100vh - 140px);
        margin: 0 !important; padding: 24px 16px !important;
        background: radial-gradient(520px 260px at 50% 42%, rgba(37,99,235,.08), transparent 70%);
    }
    #astraLauncher::before, #astraLauncher::after {
        float: none; clear: none; width: min(460px, 100%); text-align: center;
    }
    #astraLauncher::before {
        content: "Ne yapacaksın dostum?"; display: block; order: -2;
        font-size: 26px; font-weight: 800; letter-spacing: .2px; color: #0f172a;
        animation: astraUp .55s cubic-bezier(.2,.8,.2,1) both;
    }
    #astraLauncher::after {
        content: "Seç bakayım"; display: block; order: -1; margin: -6px 0 10px;
        font-size: 13px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #64748b;
        animation: astraUp .55s .08s cubic-bezier(.2,.8,.2,1) both;
    }
    #astraLauncher > div {
        float: none !important; width: min(460px, 100%) !important; max-width: 100%;
        padding: 0 !important; margin: 0 !important; flex: none !important; order: 0 !important;
        animation: astraUp .6s cubic-bezier(.2,.8,.2,1) both;
    }
    #astraLauncher > div:nth-child(1) { animation-delay: .16s; }
    #astraLauncher > div:nth-child(2) { animation-delay: .22s; }
    #astraLauncher > div:nth-child(3) { animation-delay: .28s; }
    #astraLauncher > div:nth-child(4) { animation-delay: .34s; }
    #astraLauncher > div[hidden], #astraLauncher > div.astra-l-off { display: none !important; }

    #astraLauncher a.box-frame, #astraLauncher a.box-frame1 { display: block; text-decoration: none !important; outline: none; }

    #astraLauncher .small-box {
        --lc: 37,99,235; --l1: #3b82f6; --l2: #2563eb;
        position: relative; overflow: hidden; display: flex !important; align-items: center; gap: 16px;
        min-height: 80px; margin: 0 !important; padding: 13px 20px 13px 14px;
        background: #fff !important; color: #0f172a !important;
        border: 1px solid #e8ecf3 !important; border-radius: 16px !important;
        box-shadow: 0 1px 2px rgba(15,23,42,.05), 0 6px 16px rgba(15,23,42,.05) !important;
        white-space: normal !important; cursor: pointer;
        transition: transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s ease, border-color .28s ease !important;
    }
    #astraLauncher .small-box.bg-green { --lc: 22,163,74; --l1: #22c55e; --l2: #16a34a; }
    #astraLauncher .small-box.bg-red   { --lc: 239,68,68; --l1: #f87171; --l2: #dc2626; }
    #astraLauncher .small-box.bg-blue  { --lc: 37,99,235; --l1: #3b82f6; --l2: #2563eb; }

    /* parlama şeridi */
    #astraLauncher .small-box::before {
        content: ""; position: absolute; top: 0; bottom: 0; left: -70%; width: 45%; pointer-events: none;
        background: linear-gradient(100deg, transparent, rgba(148,163,184,.20), transparent);
        transform: skewX(-20deg); transition: left .75s ease;
    }
    /* sağ ok */
    #astraLauncher .small-box::after {
        content: "→"; flex: none; font-size: 20px; line-height: 1; color: #94a3b8;
        transition: transform .28s ease, color .28s ease;
    }

    #astraLauncher a.box-frame:hover .small-box, #astraLauncher a.box-frame:focus-visible .small-box {
        transform: translateY(-4px) !important; border-color: rgba(var(--lc), .55) !important;
        box-shadow: 0 16px 34px rgba(15,23,42,.13), 0 0 0 4px rgba(var(--lc), .08) !important;
    }
    #astraLauncher a.box-frame:hover .small-box::before { left: 130%; }
    #astraLauncher a.box-frame:hover .small-box::after { transform: translateX(6px); color: rgb(var(--lc)); }
    #astraLauncher a.box-frame:active .small-box { transform: translateY(-1px) scale(.99) !important; }

    /* ikon: renkli rozet, nabız gibi atar, üstüne gelince döner */
    #astraLauncher .small-box .icon {
        display: flex !important; order: -1; position: static !important; top: auto !important; right: auto !important;
        flex: 0 0 54px; width: 54px; height: 54px; align-items: center; justify-content: center;
        border-radius: 15px; background: linear-gradient(135deg, var(--l1), var(--l2)) !important;
        box-shadow: 0 8px 18px rgba(var(--lc), .32);
        transition: transform .4s cubic-bezier(.2,.8,.2,1) !important;
        animation: astraPulse 2.8s ease-in-out infinite;
    }
    #astraLauncher .small-box .icon > i, #astraLauncher .small-box .icon i.fa,
    #astraLauncher .small-box:hover .icon > i {
        position: static !important; margin: 0 !important; font-size: 22px !important; line-height: 1 !important; color: #fff !important;
    }
    #astraLauncher a.box-frame:hover .small-box .icon { transform: scale(1.1) rotate(-8deg); }

    /* yazılar */
    #astraLauncher .small-box .inner {
        flex: 1 1 auto; min-width: 0; display: block !important; padding: 0 !important; color: #0f172a !important;
    }
    #astraLauncher .small-box .inner h3 { margin: 0 !important; font-size: 16px !important; line-height: 1.3; }
    #astraLauncher .small-box .inner h3 sup {
        position: static !important; top: auto !important; display: block !important; vertical-align: baseline;
        font-size: 16px !important; font-weight: 700 !important; line-height: 1.3 !important; letter-spacing: .1px;
        color: #0f172a !important;
    }
    #astraLauncher .small-box .inner p {
        display: block !important; margin: 3px 0 0 !important; font-size: 12.5px !important; font-weight: 500;
        color: #64748b !important;
    }
    #astraLauncher .small-box .inner p:empty { display: none !important; }

    @keyframes astraUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
    @keyframes astraPulse {
        0%, 100% { box-shadow: 0 8px 18px rgba(var(--lc), .30), 0 0 0 0 rgba(var(--lc), .28); }
        60%      { box-shadow: 0 8px 18px rgba(var(--lc), .30), 0 0 0 12px rgba(var(--lc), 0); }
    }
    @media (max-width: 480px) { #astraLauncher::before { font-size: 21px; } }
    @media (prefers-reduced-motion: reduce) {
        #astraLauncher, #astraLauncher * , #astraLauncher::before, #astraLauncher::after { animation: none !important; transition: none !important; }
    }
    `;
    addCss(CSS3);

    // Geçiş animasyonları kapalı: site anında tepki versin (başlangıç menüsü hariç)
    const CSS_FAST = `
    html { scroll-behavior: auto !important; }
    *:not(#astraLauncher):not(#astraLauncher *),
    *:not(#astraLauncher):not(#astraLauncher *)::before,
    *:not(#astraLauncher):not(#astraLauncher *)::after { transition: none !important; }
    `;
    addCss(CSS_FAST);

    // Durum yazılarını rozet haline getir
    function badgeify() {
        document.querySelectorAll('#lbl_DURUM, #DataTableTeklifler tbody td:nth-child(6), #DataTableEkbelgeler tbody td:nth-child(8)').forEach(el => {
            if (el.dataset.badged === '1') return;
            const txt = (el.textContent || '').trim();
            if (!txt || txt === '-') return;
            const low = txt.toLocaleLowerCase('tr');
            let cls = '';
            if (/yürürlük|onay|aktif/.test(low)) cls = 'ok';
            else if (/teklif|bekle|askı/.test(low)) cls = 'warn';
            else if (/iptal|red|pasif/.test(low)) cls = 'bad';
            el.dataset.badged = '1';
            el.innerHTML = '<span class="astra-badge ' + cls + '">' + txt + '</span>';
        });
    }

    // Çıktı/Evrak: asıl TEKLİF ve POLİÇE en başa, farklı renkte
    function sortDocs() {
        document.querySelectorAll('#carouselImages ul.thumbnails > li').forEach(li => {
            if (li.dataset.docDone === '1') return;
            const lb = li.querySelector('a label');
            if (!lb) return;
            const name = (lb.textContent || '').trim().toLocaleUpperCase('tr');
            li.dataset.docDone = '1';
            if (name === 'TEKLİF') { li.classList.add('astra-doc-teklif'); li.style.order = '-20'; }
            else if (name === 'POLİÇE') { li.classList.add('astra-doc-police'); li.style.order = '-10'; }
        });
    }

    // Seçili kartı işaretle (hafif: tek bir delege dinleyici)
    document.addEventListener('click', e => {
        const card = e.target.closest && e.target.closest('#carouselImages .thumbnail');
        if (!card) return;
        setTimeout(() => {
            const box = card.querySelector('.icheckbox_minimal-blue');
            card.classList.toggle('astra-sel', !!(box && box.classList.contains('checked')));
        }, 50);
    }, true);

    // =====================================================================
    // Tahsilat Bilgileri'ndeki makbuzları Çıktı/Evrak kartlarına ekle
    // =====================================================================
    const PDF_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="38" height="44" viewBox="0 0 38 44">' +
        '<path d="M4 2h20l10 10v30H4z" fill="#fff" stroke="#2563eb" stroke-width="2"/>' +
        '<path d="M24 2v10h10" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>' +
        '<text x="19" y="32" font-size="10" font-weight="700" text-anchor="middle" fill="#2563eb" font-family="Arial">PDF</text></svg>');

    let makbuzCache = [];
    let makbuzSig = '';
    let hopBusy = false;
    const hopDone = {};

    const txtOf = el => ((el && el.textContent) || '').trim();
    const labelPol = () => { const p = txtOf(document.getElementById('lbl_PoliceNo')); return (p && p !== '-') ? p : ''; };
    const polNo = () => labelPol() || curPol;
    const policySig = () => curPol || curTek || labelPol() || txtOf(document.getElementById('lbl_TeklifNo'));
    const pathKey = href => { try { return new URL(href).pathname; } catch (e) { return href; } };
    const visible = el => !!(el && el.offsetParent !== null);

    // Poliçe mi? Poliçe numarası dolu olmalı VE durum "teklif" olmamalı.
    // Teklifte makbuz olmadığı için Tahsilat kartına geçiş yapılmaz (siteyi bozuyordu).
    const isPolicy = () => {
        const durum = txtOf(document.getElementById('lbl_DURUM')).toLocaleLowerCase('tr');
        if (/teklif/.test(durum)) return false;
        if (labelPol()) return true;
        return !!curPol;   // etiketler geçici sıfırlandıysa son sorgudan (yanıttaki poliçe no) bil
    };

    function readMakbuzRows() {
        const out = [];
        const seen = new Set();
        const add = (title, url, any) => {
            url = String(url || '').replace(/&amp;/g, '&');
            if (!url || /^(javascript:|#)/i.test(url)) return;
            if (!any && !/Makbuz_/i.test(url)) return;
            let full = url; try { full = new URL(url, location.href).href; } catch (e) {}
            const k = pathKey(full);
            if (seen.has(k)) return;
            seen.add(k);
            out.push({ title: (title || 'Makbuz').toString().trim() || 'Makbuz', url: full });
        };
        // 1) Tahsilat belge tablosundaki tüm linkler
        document.querySelectorAll('#CNPolicyPaymentsDocumentsTable tbody tr').forEach(tr => {
            const a = tr.querySelector('a[href]');
            if (a) add(a.title || txtOf(tr.querySelector('th, td')) || txtOf(a), a.href, true);
        });
        // 2) Sayfadaki her Makbuz_ linki (tablo adı değişse de bulur)
        document.querySelectorAll('a[href]').forEach(a => {
            if (/Makbuz_/i.test(a.href)) add(a.title || txtOf(a.closest('tr') && a.closest('tr').querySelector('th, td')) || txtOf(a), a.href, false);
        });
        // 3) onclick / data-* içine gömülü linkler
        document.querySelectorAll('[onclick*="Makbuz_"],[data-url*="Makbuz_"],[data-href*="Makbuz_"],[data-src*="Makbuz_"],[data-link*="Makbuz_"]').forEach(el => {
            const src = [el.getAttribute('onclick'), el.dataset.url, el.dataset.href, el.dataset.src, el.dataset.link].join(' ');
            const m = src.match(/https?:\/\/[^"'\s)<>]*Makbuz_[^"'\s)<>]*/i);
            if (m) add(txtOf(el.closest('tr') && el.closest('tr').querySelector('th, td')) || txtOf(el), m[0], false);
        });
        // 4) iframe/embed kaynakları
        document.querySelectorAll('iframe[src*="Makbuz_"], embed[src*="Makbuz_"]').forEach(el => add('Makbuz', el.src, false));
        return out;
    }
    const makbuzKeys = () => readMakbuzRows().map(r => pathKey(r.url)).sort().join('|');

    function addMakbuz() {
        const sig = policySig();
        if (sig !== makbuzSig) { makbuzSig = sig; makbuzCache = []; }
        const rows = readMakbuzRows();
        if (rows.length) makbuzCache = rows;          // tablo sonradan silinse bile hatırla
        const ul = document.querySelector('#carouselImages ul.thumbnails');
        if (!ul) return;
        const keys = makbuzCache.map(r => pathKey(r.url));
        // eski poliçeden kalan kartları temizle
        ul.querySelectorAll('li.astra-makbuz-card').forEach(li => { if (!keys.includes(li.dataset.key)) li.remove(); });
        makbuzCache.forEach(r => {
            const key = pathKey(r.url);
            let li = Array.from(ul.querySelectorAll('li.astra-makbuz-card')).find(x => x.dataset.key === key);
            if (li) { li.dataset.url = r.url; return; }   // imzalı link yenilenmiş olabilir
            li = document.createElement('li');
            li.className = 'col-sm-3 astra-makbuz-card';
            li.dataset.key = key;
            li.dataset.url = r.url;
            li.dataset.docDone = '1';
            li.style.order = '-5';
            li.innerHTML = '<div class="fff"><div class="thumbnail"><a href="#"><img alt=""><br><label></label><br><label>Tahsilat Makbuzu</label></a></div></div>';
            li.querySelector('img').src = PDF_ICON;
            li.querySelector('label').textContent = r.title;
            ul.appendChild(li);
        });
    }

    const cardByText = re => Array.from(document.querySelectorAll('.small-box'))
        .find(b => re.test(txtOf(b).toLocaleLowerCase('tr')));
    // Gerçek fare tıklaması gibi: pointer/mouse olaylarının hepsini sırayla gönderir (arka planda, ekranı oynatmadan)
    const clickCard = b => {
        const t = b;
        const r = t.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1,
                    clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) };
        try {
            ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                const Ctor = type.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
                t.dispatchEvent(new Ctor(type, Object.assign({}, o, type === 'mouseup' || type === 'pointerup' || type === 'click' ? { buttons: 0 } : {})));
            });
        } catch (e) { t.click(); }
    };

    const dbgLog = [];
    const dbg = (...a) => {
        try { dbgLog.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); if (dbgLog.length > 40) dbgLog.shift(); } catch (e) {}
        try { console.info('[ASTRA-MAKBUZ-DBG]', ...a); } catch (e) {}
    };
    // Makbuz bulunamazsa ekranda tanı kutusu göster (F12 gerekmez, Kopyala ile bana yapıştır)
    function showDiag(extra) {
        if (!BILDIRIM_GOSTER) return;
        const old = document.getElementById('astra-diag'); if (old) old.remove();
        const tah = cardByText(/tahsilat/);
        const anc = tah && tah.closest('a');
        const info = [
            'URL: ' + location.href.replace(/[?#].*$/, ''),
            'isPolicy=' + isPolicy() + ' ul=' + !!ulVisible() + ' pending=' + pending,
            'Tahsilat kartı: ' + (tah ? 'var' : 'YOK'),
            'Tahsilat <a>: ' + (anc ? anc.outerHTML.replace(/\s+/g, ' ').slice(0, 300) : 'yok'),
            'Makbuz_ link sayısı: ' + document.querySelectorAll('a[href*="Makbuz_"]').length,
            'Tablolar: ' + Array.from(document.querySelectorAll('table')).map(t => (t.id || t.className) + '(' + t.rows.length + ')').join(', '),
            'Tahsilat tablosu: ' + (document.getElementById('CNPolicyPaymentsDocumentsTable') ? document.getElementById('CNPolicyPaymentsDocumentsTable').outerHTML.replace(/X-Amz-[A-Za-z]+=[^&"]*/g, '').replace(/\s+/g, ' ').slice(0, 700) : 'yok'),
            'Öğrenilmiş Tahsilat çağrısı: ' + (localStorage.getItem('astraTahsilatCall') || 'YOK (Tahsilat\'a bir kez elle bas)'),
            'GetView çağrıları: ' + viewCalls.join(' ; '),
            extra || '',
            '--- log ---'
        ].concat(dbgLog).join('\n');
        const d = document.createElement('div');
        d.id = 'astra-diag';
        d.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483640;width:420px;max-width:92vw;background:#0f172a;color:#e2e8f0;border-radius:12px;padding:12px;font:12px/1.4 Consolas,monospace;box-shadow:0 10px 30px rgba(0,0,0,.4);';
        d.innerHTML = '<div style="font-weight:700;margin-bottom:6px;">Makbuz bulunamadı - tanı bilgisi</div><textarea readonly style="width:100%;height:150px;background:#111c33;color:#e2e8f0;border:1px solid #1f2d4a;border-radius:8px;font:11px Consolas,monospace;"></textarea><div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end;"><button type="button" data-k="1" style="padding:6px 12px;border-radius:8px;border:0;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;">KOPYALA</button><button type="button" data-c="1" style="padding:6px 12px;border-radius:8px;border:0;background:#334155;color:#fff;font-weight:700;cursor:pointer;">KAPAT</button></div>';
        const ta = d.querySelector('textarea'); ta.value = info;
        d.querySelector('[data-k]').onclick = () => { ta.select(); try { document.execCommand('copy'); } catch (e) {} };
        d.querySelector('[data-c]').onclick = () => d.remove();
        document.body.appendChild(d);
    }
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function waitFor(fn, ms) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(60); }
        return null;
    }
    // ul'ye CSS'te display:contents verildiği için kendi kutusu yok; görünürlüğü kapsayıcıdan ölç
    const ulVisible = () => {
        const c = document.getElementById('carouselImages');
        const u = c && c.querySelector('ul.thumbnails');
        return (u && c.getClientRects().length > 0 && u.children.length > 0) ? u : null;
    };
    const firstRowLink = () => document.querySelector('#CNPolicyPaymentsDocumentsTable tbody tr a[href]');

    // "Lütfen bekle" perdesi (Tahsilat'a geçiş sürerken ekranı kaplar)
    function showWait() {
        if (document.getElementById('astra-wait')) return;
        const d = document.createElement('div');
        d.id = 'astra-wait';
        d.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;font-family:Segoe UI,system-ui,Arial,sans-serif;';
        d.innerHTML = '<div style="background:#fff;border-radius:16px;padding:28px 38px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4);max-width:90vw;">' +
            '<div style="width:44px;height:44px;margin:0 auto 14px;border:4px solid #dbeafe;border-top-color:#2563eb;border-radius:50%;animation:astraSpin .8s linear infinite;"></div>' +
            '<div style="font-size:17px;font-weight:800;color:#0f172a;">Lütfen bekle</div>' +
            '<div style="font-size:13.5px;font-weight:600;color:#475569;margin-top:6px;">Poliçe ve makbuzlar hazırlanıyor...</div></div>' +
            '<style>@keyframes astraSpin{to{transform:rotate(360deg)}}</style>';
        (document.body || document.documentElement).appendChild(d);
    }
    function hideWait() { const d = document.getElementById('astra-wait'); if (d) d.remove(); }

    // Kalıcı bildirim kutusu: mesajlar alt alta birikir, sen KAPAT'a basana kadar kalır
    const BILDIRIM_GOSTER = false;   // true yaparsan sol ortadaki durum kutusu ve tanı kutusu geri gelir
    const toastLines = [];
    function toast(msg) {
        try { console.info('[ASTRA-MAKBUZ]', msg); } catch (e) {}
        if (!BILDIRIM_GOSTER) return;
        const d = new Date(); const z = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
        toastLines.push(z + '  ' + msg); if (toastLines.length > 12) toastLines.shift();
        let t = document.getElementById('astra-toast');
        if (!t) {
            t = document.createElement('div'); t.id = 'astra-toast';
            t.style.cssText = 'position:fixed;left:12px;top:50%;transform:translateY(-50%);z-index:2147483647;width:300px;max-width:80vw;background:#0f172a;color:#fff;padding:12px 14px;border:2px solid #2563eb;border-radius:12px;font:600 12.5px/1.45 Segoe UI,system-ui,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);';
            t.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"><b style="font-size:13px;">Astra Makbuz</b><span><button type="button" data-k style="margin-right:6px;padding:2px 8px;border:0;border-radius:6px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;">KOPYALA</button><button type="button" data-x style="padding:2px 8px;border:0;border-radius:6px;background:#334155;color:#fff;font-weight:700;cursor:pointer;">KAPAT</button></span></div><div data-l style="white-space:pre-wrap;word-break:break-word;max-height:50vh;overflow:auto;"></div>';
            t.querySelector('[data-x]').onclick = () => { t.remove(); toastLines.length = 0; };
            t.querySelector('[data-k]').onclick = () => { const ta = document.createElement('textarea'); ta.value = toastLines.join('\n'); document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); };
            (document.body || document.documentElement).appendChild(t);
        }
        t.querySelector('[data-l]').textContent = toastLines.join('\n');
    }
    // Tahsilat'a hiç basmadan: sitenin kendi makbuz API'sini (afsDocumentList) aynı bilgilerle çağır
    function userAgentCode() {
        try {
            const u = window.Core && window.Core.GetCurrentUser2 && window.Core.GetCurrentUser2();
            if (u) for (const k of Object.keys(u)) { if (/agent.*code|acente.*kod/i.test(k) && u[k]) return String(u[k]); }
        } catch (e) {}
        return '';
    }
    // Makbuz listesini API'den getir (poliçe no -> satırlar). Sonuç poliçe bazında hatırlanır.
    const makbuzOnbellek = {};   // { policeNo: { rows, t } }
    const makbuzIstek = {};      // devam eden istekler (aynı poliçe için tek istek)
    function fetchMakbuzRows(pol) {
        if (makbuzOnbellek[pol] && Date.now() - makbuzOnbellek[pol].t < 20 * 3600 * 1000) return Promise.resolve(makbuzOnbellek[pol].rows);
        if (makbuzIstek[pol]) return makbuzIstek[pol];
        let agent = (lastApi && lastApi.params && lastApi.params.agentCode) || '';
        try { agent = agent || localStorage.getItem('astraAgentCode') || ''; } catch (e) {}
        agent = agent || userAgentCode();
        if (!pol || !agent || !lastAuth) { dbg('API yolu için eksik: poliçe=' + !!pol + ' acente=' + !!agent + ' token=' + !!lastAuth); return Promise.resolve(null); }
        const body = new URLSearchParams({ agentCode: agent, policyNumber: pol, renewalNumber: '0', endorsementNumber: '' }).toString();
        const p = origFetch.call(window, API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': '*/*', 'authorization': lastAuth,
                       'X-Correlation-Id': (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) },
            body
        }).then(r => { if (!r.ok) { dbg('API durum', r.status); return null; } return r.json(); })
          .then(j => {
              if (!j) return null;
              const list = ((j && j.DocumentResponseType) || {}).collectionDocumentDetailList || [];
              const rows = list.filter(x => x && x.documentLink).map(x => ({ title: x.documentType || 'Tahsilat Makbuzu', url: String(x.documentLink).replace(/&amp;/g, '&') }));
              makbuzOnbellek[pol] = { rows, t: Date.now() };
              return rows;
          })
          .catch(e => { dbg('API hatası', String(e)); return null; })
          .then(v => { delete makbuzIstek[pol]; return v; });
        makbuzIstek[pol] = p;
        return p;
    }

    // Arama biter bitmez önceden çek: Çıktı/Evrak'a basınca makbuz hazır olsun
    function onceden(pol) {
        if (!pol) return;
        fetchMakbuzRows(pol).then(rows => {
            if (!rows || pol !== curPol) return;
            makbuzSig = policySig(); makbuzCache = rows;
            dbg('önceden çekildi: ' + rows.length + ' makbuz');
            schedule();
        });
    }

    async function tryApi() {
        const pol = polNo();
        if (!pol) return false;
        toast('Makbuz API (poliçe ' + pol + ')');
        const rows = await fetchMakbuzRows(pol);
        if (!rows) { toast('API yolu olmadı, Tahsilat\'a geçiliyor...'); return false; }
        if (policySig() !== sigAtStart) { toast('Poliçe değişti, sonuç atıldı'); return false; }
        makbuzSig = policySig(); makbuzCache = rows;
        dbg('API ile makbuz sayısı=' + rows.length);
        return true;
    }
    let sigAtStart = '';

    // Kartı sırayla dene: 1) fare olayları  2) native click  3) jQuery trigger  -> sekme değişince dur
    async function pressCard(card, changed, skipOnclick) {
        const a = card.closest('a');
        // -1) Elle basılırken öğrenilmiş GetView çağrısı (Tahsilat için)
        const L = /tahsilat/.test(txtOf(card).toLocaleLowerCase('tr')) ? getLearned() : null;
        const A = window.CreatePolicyView && window.CreatePolicyView.Actions;
        if (L && A && typeof A.GetView === 'function') {
            try { dbg('öğrenilmiş çağrı uygulanıyor:', L); (A.__astraOrig || A.GetView).apply(A, L); } catch (e) { dbg('öğrenilmiş çağrı hatası', String(e)); }
            if (await waitFor(changed, 2500)) return true;
        }
        // 0) Sitenin kendi onclick fonksiyonunu doğrudan çağır (olay üretmeden; gerçek tıklamayla aynı iş)
        if (!skipOnclick && a && typeof a.onclick === 'function') {
            try { dbg('onclick çağrılıyor:', (a.getAttribute('onclick') || '').slice(0, 150)); a.onclick.call(a, new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); }
            catch (e) { dbg('onclick hatası', String(e)); }
            if (await waitFor(changed, 1800)) return true;
        }
        // 1) fare olayları
        clickCard(card);
        if (await waitFor(changed, skipOnclick ? 2500 : 1200)) return true;
        // 2) native click
        try { (a || card).click(); } catch (e) {}
        if (await waitFor(changed, 1200)) return true;
        // 3) jQuery
        try { if (window.jQuery) window.jQuery(a || card).trigger('click'); } catch (e) {}
        return !!(await waitFor(changed, 1500));
    }
    const makbuzLink = () => document.querySelector('#CNPolicyPaymentsDocumentsTable tbody tr a[href], a[href*="Makbuz_"]');

    async function runHop() {
        if (!HOP_AKTIF) return;
        if (hopBusy) { toast('Makbuz: önceki işlem sürüyor', 2500); return; }
        if (!isPolicy()) { dbg('teklif: makbuz geçişi atlandı'); return; }
        hopBusy = true;
        const sig = policySig();
        toast('Astra v2.8: makbuz aranıyor...', 4000);
        try {
            const ulOk = await waitFor(ulVisible, 6000);
            toast('Evrak listesi: ' + (ulOk ? 'açık' : 'görünmedi (devam ediliyor)'));
            if (!isPolicy()) { toast('Durdu: poliçe değil (durum=' + txtOf(document.getElementById('lbl_DURUM')) + ')'); return; }
            sigAtStart = sig;
            if (await tryApi()) {   // hızlı yol: Tahsilat'a basmaya gerek yok
                hopDone[sig] = 1; addMakbuz();
                if (makbuzCache.length) toast('✔ ' + makbuzCache.length + ' makbuz eklendi', 3000);
                else { toast('Bu poliçede makbuz yok', 3000); showDiag('API yanıtı: makbuz listesi boş'); }
                return;
            }
            const tah = cardByText(/tahsilat/);
            if (!tah) { dbg('Tahsilat kartı bulunamadı'); return; }
            await waitFor(() => pending === 0, 3000);
            await sleep(250);
            document.body.classList.add('astra-hop');

            // 1) Tahsilat'a hızlıca bas (liste kapanınca geçiş olmuş demektir)
            const gecti = await pressCard(tah, () => !ulVisible());
            dbg('Tahsilat geçişi:', gecti);

            // 2) makbuz satırı gelsin (en fazla 4 sn)
            await waitFor(makbuzLink, 6000);
            const rows = readMakbuzRows();
            if (rows.length) { makbuzSig = sig; makbuzCache = rows; dbg('makbuz sayısı=' + rows.length); }
            else dbg('makbuz bulunamadı');

            // 3) bulsa da bulmasa da Çıktı/Evrak'a geri dön
            const back = cardByText(/çıktı/) || cardByText(/evrak/);
            if (back) {
                const geriOk = await pressCard(back, () => !!ulVisible());
                if (!geriOk) { try { window.CreatePolicyView.Actions.GetView('Production/PolicyDocument2', true); } catch (e) {} await waitFor(ulVisible, 4000); }
            }
            await sleep(150);
            hopDone[sig] = 1;
            addMakbuz();
            if (makbuzCache.length) toast('✔ ' + makbuzCache.length + ' makbuz eklendi', 3000); else showDiag('UI yolu: makbuz bulunamadı');
        } finally {
            document.body.classList.remove('astra-hop');
            hopBusy = false;
            schedule();
        }
    }

    // Sayfa ilk açıldığında Çıktı/Evrak zaten açıksa bir kere çalış (sadece poliçede)
    function autoHop() {
        if (hopBusy || !ulVisible() || !isPolicy()) return;
        if (hopDone[policySig()]) return;
        runHop();
    }

    // Kullanıcı Çıktı/Evrak kartına basınca (gerçek tıklama)
    document.addEventListener('click', e => {
        if (!e.isTrusted) return;
        const box = e.target.closest && e.target.closest('.small-box');
        if (!box || !/çıktı|evrak/.test(txtOf(box).toLocaleLowerCase('tr'))) return;
        if (!isPolicy()) {
            toast('Makbuz atlandı: poliçe değil (no=' + txtOf(document.getElementById('lbl_PoliceNo')) + ', durum=' + txtOf(document.getElementById('lbl_DURUM')) + ')', 5000);
            return;
        }
        dbg('Çıktı/Evrak tıklandı');
        setTimeout(() => {
            if (hopBusy) return;
            const sg = policySig();
            if (hopDone[sg] && makbuzCache.length) { addMakbuz(); return; }
            delete hopDone[sg];
            runHop();
        }, 300);
    }, true);

    document.addEventListener('click', e => {
        const li = e.target.closest && e.target.closest('li.astra-makbuz-card');
        if (!li) return;
        e.preventDefault();
        e.stopPropagation();
        const url = li.dataset.url;
        const title = li.querySelector('label').textContent;
        showPdf(null, title, url);   // makbuz sunucusu CORS'a izin vermediği için fetch yok, doğrudan iframe
    }, true);

    // Başlangıç menüsü: satıra id ver, pasif kartı gizle (sitenin kendi bağlantılarına dokunmaz)
    function launcher() {
        const g = document.getElementById('genelTeklif');
        const row = g && g.closest('.row');
        if (!row) return;
        if (row.id !== 'astraLauncher') row.id = 'astraLauncher';
        Array.from(row.children).forEach(c => c.classList.toggle('astra-l-off', !!c.querySelector('a.disabled')));
    }

    // ---- Sitenin GetView çağrılarını izle; kullanıcı Tahsilat'a elle basınca çağrıyı ÖĞREN ----
    const viewCalls = [];
    let lastTrusted = { t: 0, label: '' };
    document.addEventListener('click', e => {
        if (!e.isTrusted) return;
        const box = e.target.closest && e.target.closest('.small-box');
        lastTrusted = { t: Date.now(), label: box ? txtOf(box).toLocaleLowerCase('tr') : '' };
    }, true);
    const getLearned = () => { try { return JSON.parse(localStorage.getItem('astraTahsilatCall') || 'null'); } catch (e) { return null; } };
    function wrapGetView() {
        const A = window.CreatePolicyView && window.CreatePolicyView.Actions;
        if (!A || A.__astraWrapped || typeof A.GetView !== 'function') return;
        const orig = A.GetView;
        A.__astraOrig = orig;
        A.GetView = function () {
            const args = Array.prototype.slice.call(arguments);
            try {
                viewCalls.push(JSON.stringify(args)); if (viewCalls.length > 10) viewCalls.shift();
                dbg('GetView çağrıldı:', args);
                if (!hopBusy && Date.now() - lastTrusted.t < 1500 && /tahsilat/.test(lastTrusted.label)) {
                    localStorage.setItem('astraTahsilatCall', JSON.stringify(args));
                    dbg('Tahsilat çağrısı öğrenildi:', args);
                }
            } catch (e) {}
            return orig.apply(this, arguments);
        };
        A.__astraWrapped = true;
    }

    // ---- 😉 Kısayol: ana sayfadaki "Giriş" ve "Detay Görüntüleme" kartlarına her ekrandan git ----
    const GIT = {
        genel: {
            ad: '➕  Teklif / Poliçe / Ek Girişi',
            bul: () => { const g = document.getElementById('genelTeklif'); const b = g && (g.querySelector('a:not(.disabled)') || g.querySelector('.small-box')); return (b && visible(b)) ? b : null; }
        },
        detay: {
            ad: '🔎  Teklif / Poliçe / Ek Detay Görüntüleme',
            bul: () => { const x = Array.from(document.querySelectorAll('.small-box')).find(x => /detay.*görüntüleme/.test(txtOf(x).toLocaleLowerCase('tr'))); const b = x && (x.querySelector('a:not(.disabled)') || x); return (b && visible(b)) ? b : null; }
        }
    };
    function anaSayfaLinki() {
        const sec = ['.main-header a.logo', '.main-header a.navbar-brand', 'a.logo', 'a.navbar-brand'];
        for (const q of sec) { const e = document.querySelector(q); if (e) return e; }
        return Array.from(document.querySelectorAll('.sidebar-menu a, .main-header a')).find(a => /ana\s*sayfa|anasayfa/i.test(txtOf(a) + ' ' + (a.getAttribute('title') || ''))) ||
            Array.from(document.querySelectorAll('a[href]')).find(a => /\/(home|anasayfa)(\/|\?|#|$)/i.test(a.getAttribute('href') || '')) || null;
    }
    function gStat(t) {
        let e = document.getElementById('astra-go-st');
        if (!t) { if (e) e.remove(); return; }
        if (!e) { e = document.createElement('div'); e.id = 'astra-go-st'; e.style.cssText = 'position:fixed;left:68px;top:68%;z-index:99999;background:#0f172a;color:#fff;padding:9px 14px;border-radius:10px;font:600 13px Segoe UI,system-ui,Arial,sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.3);'; document.body.appendChild(e); }
        e.textContent = t;
    }
    async function bas(hedef, card) {
        // Hemen bas; tutmazsa (site kodu henüz bağlanmamışsa) kısa aralıklarla tekrar dene
        const degisti = () => !hedef.bul();
        for (let i = 1; i <= 30; i++) {
            const c = hedef.bul() || card;
            if (!c) { gStat(''); return true; }
            gStat('Karta basılıyor...');
            try { c.click(); } catch (e) {}
            if (await waitFor(degisti, 350)) { gStat(''); return true; }
            if (i % 3 === 0) { try { clickCard(c); } catch (e) {} if (await waitFor(degisti, 250)) { gStat(''); return true; } }
            if (i % 5 === 0) { try { if (window.jQuery) window.jQuery(c).trigger('click'); } catch (e) {} if (await waitFor(degisti, 250)) { gStat(''); return true; } }
        }
        gStat('Karta basıldı ama ekran değişmedi');
        setTimeout(() => gStat(''), 7000);
        return false;
    }
    async function git(which, mesaj) {
        const hedef = GIT[which]; if (!hedef) return;
        let card = hedef.bul();
        if (!card) {
            const home = anaSayfaLinki();
            if (!home) { mesaj('Ana sayfa bağlantısını bulamadım'); return; }
            try { sessionStorage.setItem('astraGo', which); } catch (e) {}
            mesaj('Ana sayfaya gidiliyor...');
            gStat('Ana sayfaya gidiliyor...');
            home.click();
            card = await waitFor(hedef.bul, 6000);          // sayfa yenilenmiyorsa kart burada bulunur
            if (!card) return;                              // sayfa yenilendi: yeni sayfada devam eder
            try { sessionStorage.removeItem('astraGo'); } catch (e) {}
        }
        await bas(hedef, card);
    }
    function kisayol() {
        if (document.getElementById('astra-go')) return;
        if (!document.getElementById('astra-go-css')) {
            const st = document.createElement('style'); st.id = 'astra-go-css';
            st.textContent =
                '#astra-go{position:fixed;left:10px;top:68%;z-index:99998;font-family:Segoe UI,system-ui,Arial,sans-serif;}' +
                '#astra-go [data-b]{width:46px;height:46px;border-radius:50%;border:2px solid #e8ecf3;background:#fff;font-size:25px;line-height:1;cursor:pointer;box-shadow:0 6px 18px rgba(15,23,42,.25);padding:0;transition:transform .15s;}' +
                '#astra-go [data-b]:hover{transform:scale(1.1) rotate(-8deg);}' +
                '#astra-go [data-m]{display:none;position:absolute;left:58px;bottom:0;width:300px;background:#fff;border:1px solid #e5e9f2;border-radius:16px;box-shadow:0 18px 44px rgba(15,23,42,.30);padding:12px;}' +
                '#astra-go .ag-h{font:700 11px Segoe UI,system-ui,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;padding:2px 6px 10px;}' +
                '#astra-go .ag-i{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;text-align:left;padding:12px;margin:0 0 12px;border:1px solid #e5e9f2;border-left-width:5px;border-radius:12px;background:#f8fafc;cursor:pointer;transition:all .15s;}' +
                '#astra-go .ag-i:last-of-type{margin-bottom:0;}' +
                '#astra-go .ag-i:hover{background:#fff;transform:translateX(3px);box-shadow:0 6px 16px rgba(15,23,42,.14);}' +
                '#astra-go .ag-g{border-left-color:#16a34a;}#astra-go .ag-d{border-left-color:#2563eb;}' +
                '#astra-go .ag-ic{flex:none;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:19px;color:#fff;}' +
                '#astra-go .ag-g .ag-ic{background:#16a34a;}#astra-go .ag-d .ag-ic{background:#2563eb;}' +
                '#astra-go .ag-t{font:700 13.5px Segoe UI,system-ui,Arial,sans-serif;color:#0f172a;line-height:1.25;}' +
                '#astra-go .ag-s{font:500 11.5px Segoe UI,system-ui,Arial,sans-serif;color:#64748b;margin-top:2px;}' +
                '#astra-go [data-t]{display:none;padding:10px 6px 0;font:600 12.5px Segoe UI,system-ui,Arial,sans-serif;color:#b91c1c;}';
            document.head.appendChild(st);
        }
        const w = document.createElement('div');
        w.id = 'astra-go';
        w.innerHTML =
            '<button type="button" data-b title="Kısayollar">😉</button>' +
            '<div data-m><div class="ag-h">Hızlı geçiş</div>' +
            '<button type="button" class="ag-i ag-g" data-g="genel"><span class="ag-ic">＋</span><span><div class="ag-t">Teklif / Poliçe / Ek Girişi</div><div class="ag-s">Yeni kayıt oluştur</div></span></button>' +
            '<button type="button" class="ag-i ag-d" data-g="detay"><span class="ag-ic">🔎</span><span><div class="ag-t">Teklif / Poliçe / Ek Detay Görüntüleme</div><div class="ag-s">Kayıt ara ve görüntüle</div></span></button>' +
            '<div data-t></div></div>';
        const menu = w.querySelector('[data-m]'), msg = w.querySelector('[data-t]');
        const mesaj = t => { msg.textContent = t; msg.style.display = t ? 'block' : 'none'; };
        const ac = () => { menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; };
        w.querySelector('[data-b]').addEventListener('click', e => { e.stopPropagation(); mesaj(''); ac(); });
        w.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', async e => {
            e.stopPropagation();
            mesaj('');
            await git(b.dataset.g, mesaj);
            if (!msg.textContent) menu.style.display = 'none';
        }));
        document.addEventListener('click', e => { if (!w.contains(e.target)) menu.style.display = 'none'; }, true);
        document.body.appendChild(w);
    }

    // ---- SBM OTO: kutunun en altında yanıp sönen düğme + Değer alanlarını otomatik doldur ----
    const SBM_KOD = '9d21cf41f7ee94e5380a2e678dba9050';   // #selectPQValueCode_2129 alanına yazılır
    const SBM_DEGER = '99999';                             // #inputPQValue_1671 alanı boşsa kendisi gelir
    function yazDeger(el, v) {
        try {
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            set.call(el, v);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));   // sitenin onchange'i (CheckQuestionAnswer) çalışsın
        } catch (e) { el.value = v; }
    }
    function sbmDegerler() {
        const el = document.getElementById('inputPQValue_1671');
        if (el && el.dataset.astra9999 !== '1' && !String(el.value || '').trim()) {
            el.dataset.astra9999 = '1';
            yazDeger(el, SBM_DEGER);
        }
    }
    async function sbmOtoBas(btn) {
        gStat('SBM OTO: Değer Kodu alanı aranıyor...');
        const el = await waitFor(() => document.getElementById('selectPQValueCode_2129'), 8000);
        if (!el) { gStat('Değer Kodu alanı ekranda yok. İlgili bölümü açıp tekrar bas.'); setTimeout(() => gStat(''), 6000); return; }
        yazDeger(el, SBM_KOD);
        btn.dataset.done = '1';
        gStat('✔ SBM OTO: değer kodu yazıldı');
        setTimeout(() => gStat(''), 3500);
    }
    function sbmOto() {
        sbmDegerler();
        const area = document.getElementById('production-box-area-content');
        const body = area && area.parentElement;
        let b = document.getElementById('astra-sbm-oto');
        if (!body) { if (b) b.remove(); return; }
        if (!document.getElementById('astra-sbm-css')) {
            const st = document.createElement('style'); st.id = 'astra-sbm-css';
            st.textContent =
                '@keyframes astraSbm{0%,100%{background:#dc2626;box-shadow:0 0 0 0 rgba(220,38,38,.55);}50%{background:#f97316;box-shadow:0 0 0 10px rgba(249,115,22,0);}}' +
                '#astra-sbm-oto{display:block;width:100%;margin:12px 0 4px;padding:13px 16px;border:0;border-radius:12px;color:#fff;font:800 15px Segoe UI,system-ui,Arial,sans-serif;letter-spacing:.6px;cursor:pointer;animation:astraSbm 1s ease-in-out infinite;}' +
                '#astra-sbm-oto[data-done="1"]{animation:none;background:#16a34a;}' +
                '#astra-sbm-oto:hover{filter:brightness(1.1);}';
            document.head.appendChild(st);
        }
        if (!b) {
            b = document.createElement('button');
            b.id = 'astra-sbm-oto'; b.type = 'button'; b.textContent = '⚡ SBM OTO';
            b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); sbmOtoBas(b); });
        }
        if (body.lastElementChild !== b) body.appendChild(b);   // her zaman kutunun en altında
    }

    function run() { snapInfo(); fab(); kisayol(); sbmOto(); wrapGetView(); badgeify(); sortDocs(); wrapPdfMake(); addMakbuz(); autoHop(); launcher(); }

    // Debounce: sayfa her değiştiğinde değil, sakinleşince bir kez çalışır
    let timer = 0;
    function schedule() {
        if (timer) return;
        timer = setTimeout(() => { timer = 0; run(); }, 200);
    }

    document.addEventListener('click', () => setTimeout(schedule, 300), true);

    function init() {
        toast('Astra Tema v3.9 yüklendi', 3500);
        loadDir();
        try {
            const g = sessionStorage.getItem('astraGo');
            if (g && GIT[g]) {
                sessionStorage.removeItem('astraGo');
                (async () => { gStat('Kart bekleniyor...'); const c = await waitFor(GIT[g].bul, 15000); if (c) await bas(GIT[g], c); else { gStat('Ana sayfada kart bulunamadı'); setTimeout(() => gStat(''), 7000); } })();
            }
        } catch (e) { /* sessizce geç */ }
        run();
        new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    }

    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
})();