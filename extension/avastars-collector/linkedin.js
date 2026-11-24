// AvaStars Collector — LinkedIn messages: puts a "Send to AvaStars" button next to every resume file
// (PDF / Word) someone sends you in LinkedIn chat. Nothing is sent until you click the button.
(() => {
  const FILE_RE = /\.(pdf|docx?|rtf)\b/i;
  const BTN = 'avs-send-btn';
  const sentKey = (url) => { try { const u = new URL(url, location.href); return `${u.hostname}${u.pathname}`; } catch { return url; } };
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  /** Attachment links inside LinkedIn messaging (full page and the small chat windows). */
  function findAttachments(root = document) {
    const scope = root.querySelectorAll('.msg-s-message-list, .msg-overlay-conversation-bubble, .msg-thread, [class*="msg-s-event"]');
    const areas = scope.length ? [...scope] : [];
    const seen = new Set(); const out = [];
    for (const area of areas) {
      for (const a of area.querySelectorAll('a[href]')) {
        if (seen.has(a)) continue;
        const href = a.href || '';
        const text = clean(`${a.textContent} ${a.getAttribute('aria-label') || ''} ${a.getAttribute('download') || ''} ${a.title || ''}`);
        const box = a.closest('[class*="attachment"], .ui-attachment, .msg-s-event-listitem__attachment-item') || a.parentElement;
        const boxText = clean(box?.textContent || '');
        const isFileLink = /\/dms\/|messaging-attachments|\/attachment/i.test(href) || a.hasAttribute('download');
        const looksLikeFile = FILE_RE.test(text) || FILE_RE.test(boxText) || /download/i.test(text);
        if (!(isFileLink && looksLikeFile) && !(FILE_RE.test(text) && /^https?:/.test(href) && !/\/in\/|\/company\//.test(href))) continue;
        seen.add(a);
        const fname = (text.match(/[^\s/\\]+\.(pdf|docx?|rtf)\b/i) || boxText.match(/[^\s/\\]+\.(pdf|docx?|rtf)\b/i) || [])[0] || 'resume.pdf';
        out.push({ a, box: box || a, href, filename: fname });
      }
    }
    return out;
  }

  /** Who sent it: the name on the message group, else the conversation title; plus their profile link. */
  function senderOf(el) {
    let item = el.closest('.msg-s-event-listitem, li');
    let name = ''; let profile = '';
    // Walk back through earlier messages until we reach the one that shows the sender's name.
    for (let i = 0; item && i < 30 && !name; i++) {
      const n = item.querySelector('.msg-s-message-group__name, .msg-s-message-group__profile-link');
      if (n) {
        name = clean(n.textContent);
        const link = n.closest('a[href*="/in/"]') || item.querySelector('a[href*="/in/"]');
        if (link) profile = link.href;
      }
      item = item.previousElementSibling;
    }
    const thread = el.closest('.msg-overlay-conversation-bubble, .msg-convo-wrapper, main') || document;
    if (!name) name = clean(thread.querySelector('.msg-entity-lockup__entity-title, .msg-overlay-bubble-header__title, h2')?.textContent);
    if (!profile) profile = thread.querySelector('a.msg-thread__link-to-profile, a.profile-card-one-to-one__profile-link, a[href*="/in/"]')?.href || '';
    return { name: name.replace(/\s*\(.*?\)\s*$/, '').slice(0, 120), profile: profile.split('?')[0] };
  }

  async function readFile(href) {
    // Same-site files are read here with your LinkedIn sign-in; if that fails the extension tries in the background.
    try {
      const u = new URL(href, location.href);
      if (u.origin !== location.origin) return null;
      const res = await fetch(u, { credentials: 'include' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size > 8 * 1024 * 1024) throw new Error('The file is over 8 MB');
      const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
      for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
      return { b64: btoa(s), mime: blob.type || '' };
    } catch (e) {
      if (/8 MB/.test(e.message)) throw e;
      return null;
    }
  }

  async function send(att, btn) {
    btn.disabled = true; btn.textContent = 'Sending…'; btn.className = `${BTN} busy`;
    try {
      const who = senderOf(att.a);
      const local = await readFile(att.href);
      const res = await chrome.runtime.sendMessage({ type: 'avs-linkedin-resume', href: att.href, filename: att.filename, name: who.name, profile: who.profile, page: location.href.split('?')[0], b64: local?.b64 || null, mime: local?.mime || '' });
      if (!res?.ok) throw new Error(res?.error || 'Could not send');
      const { sentFiles = {} } = await chrome.storage.local.get('sentFiles');
      sentFiles[sentKey(att.href)] = { at: Date.now(), id: res.candidate_id };
      await chrome.storage.local.set({ sentFiles: Object.fromEntries(Object.entries(sentFiles).slice(-3000)) });
      mark(btn, res);
    } catch (e) {
      btn.disabled = false; btn.className = `${BTN} bad`; btn.textContent = 'Failed · retry';
      btn.title = e.message;
    }
  }

  function mark(btn, res) {
    btn.disabled = true; btn.className = `${BTN} done`;
    btn.textContent = res.merged ? 'Already in AvaStars ✓' : `Sent to AvaStars ✓${typeof res.match === 'number' ? ` · ${res.match}%` : ''}`;
    btn.title = res.job ? `Added to ${res.job}` : 'Saved in the AvaStars resume database';
  }

  async function decorate() {
    const atts = findAttachments();
    if (!atts.length) return;
    const { sentFiles = {}, apiKey } = await chrome.storage.local.get(['sentFiles', 'apiKey']);
    for (const att of atts) {
      if (att.box.querySelector(`.${BTN}`) || att.box.nextElementSibling?.classList?.contains(BTN)) continue;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = BTN;
      btn.setAttribute('aria-label', `Send ${att.filename} to AvaStars Hire`);
      if (sentFiles[sentKey(att.href)]) mark(btn, { merged: true });
      else {
        btn.textContent = apiKey ? 'Send to AvaStars' : 'Send to AvaStars (connect first)';
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); send(att, btn); });
      }
      att.box.insertAdjacentElement('afterend', btn);
    }
  }

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => decorate().catch(() => {}), 600); };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
