/* The public site reads only the deliberately limited rm_public_site RPC.
   No admin session, browser-stored configuration or private tables are used. */
(() => {
  'use strict';

  const originalWhatsApp = '447365309553';
  window.rmPublicContact = {
    phone: '07365 309553', whatsapp: originalWhatsApp, email: 'x7reecex@gmail.com'
  };
  window.rmCmsState = { status: 'loading' };

  function config() {
    const raw = window.RM_CONFIG;
    if (!raw?.supabaseKey?.trim()) return null;
    const url = new URL(raw.supabaseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
      throw new Error('Invalid public connection URL.');
    }
    const key = raw.supabaseKey.trim();
    let browserSafe = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    if (!browserSafe && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
      try {
        const part = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
        browserSafe = payload.role === 'anon';
      } catch { /* Unrecognised keys are rejected before any request. */ }
    }
    if (!browserSafe) throw new Error('Only a publishable or anon key is permitted.');
    const imageHosts = new Set([url.hostname]);
    for (const host of Array.isArray(raw.galleryImageHosts) ? raw.galleryImageHosts : []) {
      if (typeof host === 'string' && /^[a-z0-9.-]+$/i.test(host)) imageHosts.add(host.toLowerCase());
    }
    return { url: url.origin, key, imageHosts };
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  function copy(id, value, hideEmpty = false) {
    const node = document.getElementById(id);
    if (!node || typeof value !== 'string') return;
    node.textContent = value;
    node.classList.add('cms-copy');
    if (hideEmpty) node.hidden = !value.trim();
  }

  function phoneNumber(value) {
    if (typeof value !== 'string' || !/^[+\d\s().-]+$/.test(value.trim())) return null;
    let number = value.replace(/\D/g, '');
    if (number.startsWith('00')) number = number.slice(2);
    if (number.startsWith('0')) number = '44' + number.slice(1);
    return /^[1-9]\d{7,14}$/.test(number) ? number : null;
  }

  function whatsAppNumber(value) {
    if (typeof value !== 'string') return null;
    const number = phoneNumber(value);
    if (number) return number;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      if (url.hostname === 'wa.me') return phoneNumber(url.pathname.slice(1));
      if (url.hostname === 'api.whatsapp.com' && url.pathname === '/send') return phoneNumber(url.searchParams.get('phone'));
    } catch { /* Keep the working contact route for invalid saved details. */ }
    return null;
  }

  function contacts(settings) {
    const phone = phoneNumber(settings.phone);
    const whatsapp = whatsAppNumber(settings.whatsapp);
    const email = typeof settings.email === 'string' && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(settings.email.trim()) ? settings.email.trim() : null;
    if (phone) {
      window.rmPublicContact.phone = settings.phone.trim();
      document.querySelectorAll('a[href^="tel:"]').forEach(link => {
        link.href = 'tel:+' + phone;
        const target = link.querySelector('strong') || link;
        // The phone links use either a number or a short "call" label.
        target.textContent = /^call\b/i.test(target.textContent.trim()) ? 'call ' + settings.phone.trim() : settings.phone.trim();
      });
    }
    if (email) {
      window.rmPublicContact.email = email;
      document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
        link.href = 'mailto:' + email;
        (link.querySelector('strong') || link).textContent = email;
      });
    }
    if (whatsapp) {
      window.rmPublicContact.whatsapp = whatsapp;
      document.querySelectorAll('a[href^="https://wa.me/"]').forEach(link => {
        // An already-open enquiry keeps its original recipient and message.
        if (link.id === 'reopenWhatsApp' && !document.getElementById('quoteFollowUp')?.hidden) return;
        const url = new URL(link.href);
        url.pathname = '/' + whatsapp;
        link.href = url.href;
      });
      if (whatsapp !== originalWhatsApp) {
        document.querySelectorAll('.qr-block').forEach(node => {
          node.querySelector('img.qr')?.setAttribute('hidden', '');
          const label = node.querySelector('.qr-copy strong');
          if (label) label.textContent = 'Tap to WhatsApp';
        });
      }
    }
  }

  function validate(data) {
    if (!data || typeof data !== 'object' || typeof data.published !== 'boolean') throw new Error('Invalid public content response.');
    if (!data.published) return;
    if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('Missing homepage settings.');
    const collections = { services: ['name', 'price', 'description'], faqs: ['question', 'answer'], areas: ['name'], gallery: ['image_url', 'title', 'description'] };
    for (const [name, fields] of Object.entries(collections)) {
      if (!Array.isArray(data[name])) throw new Error('Missing public collection.');
      for (const row of data[name]) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid public record.');
        for (const field of fields) {
          if (row[field] != null && typeof row[field] !== 'string' && !(field === 'price' && typeof row[field] === 'number' && Number.isFinite(row[field]))) throw new Error('Invalid public field.');
        }
      }
    }
    for (const field of ['headline', 'intro', 'boundary', 'phone', 'whatsapp', 'email']) {
      if (data.settings[field] != null && typeof data.settings[field] !== 'string') throw new Error('Invalid homepage field.');
    }
  }

  function services(rows) {
    const container = document.getElementById('cmsServices');
    if (!container) return;
    const originalCards = [...container.children];
    const icons = new Map(originalCards.map(card => [card.querySelector('h3')?.textContent.toLowerCase(), card.querySelector('.icon')]));
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const card = element('div', null, 'card');
      const head = element('div', null, 'card-head');
      const originalIcon = icons.get((row.name || '').toLowerCase()) || originalCards.at(-1)?.querySelector('.icon');
      if (originalIcon) head.append(originalIcon.cloneNode(true));
      const price = String(row.price ?? '').trim();
      head.append(element('div', price ? (/^\d+(?:\.\d{1,2})?$/.test(price) ? 'From £' + price : price) : 'Ask for a quote', 'price'));
      card.append(head, element('h3', row.name || 'Small job'), element('p', row.description || ''));
      fragment.append(card);
    }
    container.replaceChildren(fragment);
    container.hidden = rows.length === 0;
    document.getElementById('cmsPriceNote').hidden = rows.length === 0;
    let empty = document.getElementById('cmsServicesEmpty');
    if (!empty) {
      empty = element('p', 'Please get in touch to check which jobs I can help with.', 'price-note');
      empty.id = 'cmsServicesEmpty';
      container.after(empty);
    }
    empty.hidden = rows.length !== 0;
  }

  function faqs(rows) {
    const container = document.getElementById('cmsFaqs');
    if (!container) return;
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const details = element('details');
      details.append(element('summary', row.question || 'Question'), element('p', row.answer || ''));
      fragment.append(details);
    }
    container.replaceChildren(fragment);
    document.getElementById('faqs').hidden = rows.length === 0;
  }

  function gallery(rows, allowedHosts) {
    const container = document.getElementById('cmsGallery');
    if (!container) return;
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      let url;
      try {
        url = new URL(row.image_url);
        if (url.protocol !== 'https:' || url.username || url.password || !allowedHosts.has(url.hostname)) continue;
      } catch { continue; }
      const figure = element('figure');
      const image = element('img');
      image.src = url.href;
      image.alt = row.title || 'RM Small Jobs work photo';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.width = 800;
      image.height = 600;
      image.addEventListener('error', () => {
        figure.remove();
        document.getElementById('gallery').hidden = !container.childElementCount;
      });
      const caption = element('figcaption');
      caption.append(element('strong', row.title || ''));
      if (row.description) caption.append(element('p', row.description));
      figure.append(image, caption);
      fragment.append(figure);
    }
    container.replaceChildren(fragment);
    document.getElementById('gallery').hidden = !container.childElementCount;
  }

  function render(data, settings) {
    const homepage = data.settings;
    if (homepage.headline?.trim() && homepage.headline.trim() !== 'Small jobs. Done properly.') copy('cmsHeadline', homepage.headline);
    copy('cmsIntro', homepage.intro, true);
    copy('cmsBoundary', homepage.boundary, true);
    const names = data.areas.map(area => area.name?.trim()).filter(Boolean);
    copy('cmsLocation', names.length ? names.join(' · ') : 'Send your postcode to check coverage');
    copy('cmsAreas', names.length ? names.join(', ') + '.' : 'Ask about your area.');
    copy('cmsFooterAreas', names.length ? names.join(' · ') : 'Coverage by agreement');
    contacts(homepage);
    services(data.services);
    faqs(data.faqs);
    gallery(data.gallery, settings.imageHosts);
    const structured = document.querySelector('script[type="application/ld+json"]');
    if (structured) {
      try {
        const business = JSON.parse(structured.textContent);
        business.telephone = '+' + (phoneNumber(homepage.phone) || originalWhatsApp);
        business.email = window.rmPublicContact.email;
        business.areaServed = names;
        if (homepage.intro) business.description = homepage.intro;
        structured.textContent = JSON.stringify(business);
      } catch { /* Structured data must not interrupt the enquiry route. */ }
    }
  }

  async function load() {
    let settings;
    try { settings = config(); }
    catch { return window.rmCmsState = { status: 'fallback', reason: 'invalid-configuration' }; }
    if (!settings) return window.rmCmsState = { status: 'fallback', reason: 'not-configured' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const headers = { apikey: settings.key, 'Content-Type': 'application/json' };
      if (!settings.key.startsWith('sb_publishable_')) headers.Authorization = 'Bearer ' + settings.key;
      const response = await fetch(settings.url + '/rest/v1/rpc/rm_public_site', {
        method: 'POST', headers, body: '{}', signal: controller.signal,
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw new Error('Public content could not be loaded.');
      const data = await response.json();
      validate(data);
      if (!data.published) return window.rmCmsState = { status: 'fallback', reason: 'not-published' };
      render(data, settings);
      return window.rmCmsState = { status: 'published' };
    } catch {
      return window.rmCmsState = { status: 'fallback', reason: controller.signal.aborted ? 'timeout' : 'unavailable' };
    } finally { clearTimeout(timer); }
  }

  window.rmCmsReady = load();
})();
