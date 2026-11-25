// AvaStars Collector — LinkedIn messages: puts a "Send to AvaStars" button under every resume file
// (PDF / Word) someone sends you in LinkedIn chat. Nothing is sent until you click it.
// LinkedIn shows a file as a download *button* (no link); the file address only exists once it is clicked.
// So our button asks the extension to catch that download, clicks LinkedIn's own download button,
// and the extension sends the file to AvaStars instead of saving it.
(() => {
  const FILE_RE = /\.(pdf|docx?|rtf)\s*$/i;
  const BTN = 'avs-send-btn';
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  /** Resume attachments in LinkedIn messaging (full page and the small chat windows). */
  function findAttachments() {
    const out = [];
    const triggers = document.querySelectorAll('button.msg-s-event-listitem__download-attachment-button, .msg-s-event-listitem__attachment-item a[href], .ui-attachment a[href]');
    for (const t of triggers) {
      const box = t.closest('.msg-s-event-listitem__attachment-item') || t.closest('.ui-attachment') || t;
      const fname = clean(box.querySelector('.ui-attachment__filename')?.textContent || t.textContent);
      if (!FILE_RE.test(fname)) continue; // images, links etc. are skipped
      out.push({ trigger: t, box, filename: fname.match(/[^\s/\\][^/\\]*\.(pdf|docx?|rtf)/i)?.[0] || fname });
    }
    return out;
  }

  /** The person who sent it: the name on that message (or the conversation), and their profile link. */
  function senderOf(el) {
    let li = el.closest('li.msg-s-message-list__event') || el.closest('li');
    let name = ''; let profile = '';
    for (let i = 0; li && i < 40 && !name; i++) {
      const n = li.querySelector('.msg-s-message-group__name');
      if (n) {
        name = clean(n.textContent);
        const a = n.closest('a[href*="/in/"]') || li.querySelector('a.msg-s-event-listitem__link[href*="/in/"], a[href*="/in/"]');
        if (a) profile = a.href;
      }
      li = li.previousElementSibling;
    }
    const wrap = el.closest('.msg-overlay-conversation-bubble, .msg-convo-wrapper, .scaffold-layout__detail, main') || document;
    const head = wrap.querySelector('a.msg-thread__link-to-profile, .msg-overlay-bubble-header__title a, .msg-entity-lockup__entity-title');
    if (!name && head) name = clean(head.textContent);
    if (!profile && head?.href) profile = head.href;
    return { name: name.replace(/\s*\((he|she|they)[^)]*\)\s*$/i, '').slice(0, 120), profile: (profile || '').split('?')[0] };
  }

  const keyOf = (att, who) => `${who.profile || who.name}|${att.filename}`.toLowerCase();

  async function send(att, btn) {
    const who = senderOf(att.box);
    btn.disabled = true; btn.className = `${BTN} busy`; btn.textContent = 'Getting the file…';
    try {
      // 1) Tell the extension to catch the next LinkedIn download, 2) press LinkedIn's download button.
      const pending = chrome.runtime.sendMessage({ type: 'avs-linkedin-capture', filename: att.filename, name: who.name, profile: who.profile, page: location.href.split('?')[0] });
      await new Promise((r) => setTimeout(r, 150));
      att.trigger.click();
      let res = await pending;
      if (res?.blob) { // LinkedIn made the file in the page: read it here and send it
        btn.textContent = 'Sending…';
        const blob = await (await fetch(res.blob)).blob();
        const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
        for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
        res = await chrome.runtime.sendMessage({ type: 'avs-linkedin-resume', b64: btoa(s), mime: blob.type || '', filename: att.filename, name: who.name, profile: who.profile, page: location.href.split('?')[0] });
      }
      if (!res?.ok) throw new Error(res?.error || 'Could not send');
      const { sentFiles = {} } = await chrome.storage.local.get('sentFiles');
      sentFiles[keyOf(att, who)] = { at: Date.now(), id: res.candidate_id, match: res.match ?? null };
      await chrome.storage.local.set({ sentFiles: Object.fromEntries(Object.entries(sentFiles).slice(-3000)) });
      mark(btn, res);
    } catch (e) {
      btn.disabled = false; btn.className = `${BTN} bad`; btn.textContent = 'Failed · retry';
      btn.title = e.message;
    }
  }

  function mark(btn, res) {
    btn.disabled = true; btn.className = `${BTN} done`;
    btn.textContent = res.merged ? `Already in AvaStars ✓${typeof res.match === 'number' ? ` · ${res.match}%` : ''}` : `Sent to AvaStars ✓${typeof res.match === 'number' ? ` · ${res.match}%` : ''}`;
    btn.title = res.job ? `Added to ${res.job}` : 'Saved in the AvaStars resume database';
  }

  async function decorate() {
    const atts = findAttachments();
    if (!atts.length) return;
    const { sentFiles = {}, apiKey } = await chrome.storage.local.get(['sentFiles', 'apiKey']);
    for (const att of atts) {
      const host = att.box.parentElement || att.box;
      if (host.querySelector(`:scope > .${BTN}`)) continue;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = BTN;
      btn.setAttribute('aria-label', `Send ${att.filename} to AvaStars Hire`);
      const done = sentFiles[keyOf(att, senderOf(att.box))];
      if (done) mark(btn, { merged: true, match: done.match });
      else {
        btn.textContent = apiKey ? 'Send to AvaStars' : 'Send to AvaStars (connect first)';
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); send(att, btn); });
      }
      att.box.insertAdjacentElement('afterend', btn);
    }
  }

  // ---------------------------------------------------------------- profiles: "Save to AvaStars" (sourcing)
  const PBTN = 'avs-save-profile';
  const slugOf = () => (location.pathname.match(/^\/in\/([^/]+)\/?$/) || [])[1] || null;

  /** Reads what the profile page shows (top card, about, experience, skills). */
  function readProfile() {
    const main = document.querySelector('main') || document.body;
    const h1 = main.querySelector('h1');
    const top = h1?.closest('section') || h1?.parentElement?.parentElement?.parentElement || main;
    const txt = (sel, root = top) => clean(root.querySelector(sel)?.textContent);
    const sectionText = (id, max) => {
      const sec = document.getElementById(id)?.closest('section');
      if (!sec) return '';
      return [...sec.querySelectorAll('span[aria-hidden="true"]')].map((x) => clean(x.textContent)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n').slice(0, max);
    };
    const topText = clean(top.innerText);
    const company = clean(top.querySelector('[aria-label^="Current company"]')?.getAttribute('aria-label')?.replace(/^Current company:\s*/i, '').replace(/\.\s*Click.*$/i, ''));
    const skillsSec = document.getElementById('skills')?.closest('section');
    const skills = skillsSec ? [...skillsSec.querySelectorAll('a[data-field="skill_card_skill_topic"] span[aria-hidden="true"], .hoverable-link-text span[aria-hidden="true"]')].map((x) => clean(x.textContent)).filter((x) => x && x.length < 60) : [];
    return {
      name: clean(h1?.textContent),
      headline: txt('.text-body-medium.break-words') || txt('.text-body-medium'),
      location: txt('.text-body-small.inline.t-black--light.break-words') || txt('span.text-body-small.inline'),
      company,
      open_to_work: /open to work|#opentowork/i.test(topText) || !!top.querySelector('img[alt*="OPEN_TO_WORK" i], img[alt*="open to work" i]'),
      about: sectionText('about', 2500),
      experience: sectionText('experience', 3000).split('\n').slice(0, 30),
      skills: [...new Set(skills)].slice(0, 40),
      profile_url: `https://www.linkedin.com/in/${slugOf()}/`,
    };
  }

  async function profileButton() {
    const slug = slugOf();
    const old = document.querySelector(`.${PBTN}`);
    if (!slug || !document.querySelector('main h1')) { old?.remove(); return; }
    if (old && old.dataset.slug === slug) return;
    old?.remove();
    const { savedProfiles = {} } = await chrome.storage.local.get('savedProfiles');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = `${BTN} ${PBTN}`; btn.dataset.slug = slug;
    btn.setAttribute('aria-label', 'Save this profile to AvaStars Hire as a prospect');
    const saved = savedProfiles[slug];
    if (saved) { btn.className += ' done'; btn.textContent = `Saved in AvaStars ✓${typeof saved.match === 'number' ? ` · ${saved.match}%` : ''}`; btn.title = 'Click to update it'; }
    else btn.textContent = 'Save to AvaStars';
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.className = `${BTN} ${PBTN} busy`; btn.textContent = 'Saving…';
      try {
        const p = readProfile();
        if (!p.name) throw new Error('Wait for the profile to load, then try again.');
        const res = await chrome.runtime.sendMessage({ type: 'avs-linkedin-prospect', profile: p });
        if (!res?.ok) throw new Error(res?.error || 'Could not save');
        const store = (await chrome.storage.local.get('savedProfiles')).savedProfiles || {};
        store[slug] = { at: Date.now(), id: res.candidate_id, match: res.match ?? null };
        await chrome.storage.local.set({ savedProfiles: Object.fromEntries(Object.entries(store).slice(-3000)) });
        btn.className = `${BTN} ${PBTN} done`;
        btn.textContent = `Saved in AvaStars ✓${typeof res.match === 'number' ? ` · ${res.match}%` : ''}`;
        btn.title = res.job ? `Prospect for ${res.job}` : 'Saved as a prospect (Sourcing page)';
      } catch (e) { btn.className = `${BTN} ${PBTN} bad`; btn.textContent = 'Failed · retry'; btn.title = e.message; }
      btn.disabled = false;
    });
    document.body.appendChild(btn);
  }

  // ---------------------------------------------------------------- search results: a small "Save" per person
  const SBTN = 'avs-save-result';
  const profileLink = (root) => [...root.querySelectorAll('a[href*="/in/"]')].find((a) => /\/in\/[^/?#]+/.test(a.href) && clean(a.textContent).length > 1);

  /** Reads one search-result card: the name link, then the next text lines (headline, location). */
  function readCard(root) {
    const a = profileLink(root);
    if (!a) return null;
    const slug = (a.href.match(/\/in\/([^/?#]+)/) || [])[1];
    const name = clean(a.querySelector('span[aria-hidden="true"]')?.textContent || a.textContent).replace(/View .*?profile/i, '').replace(/\s*•.*$/, '').trim();
    const lines = root.innerText.split('\n').map(clean).filter((l) => l && !l.toLowerCase().startsWith(name.toLowerCase()) && !/view .*profile/i.test(l)
      && !/^(connect|follow|message|pending|save|saved.*|•|1st|2nd|3rd\+?|\d+(st|nd|rd|th))$/i.test(l) && !/mutual connection|^• ?(1st|2nd|3rd)/i.test(l));
    return { slug, name, headline: lines[0] || '', location: lines[1] || '', open_to_work: /open to work|#opentowork/i.test(root.innerText), profile_url: `https://www.linkedin.com/in/${slug}/` };
  }

  async function decorateResults() {
    if (!/^\/search\/results\/(people|all)/.test(location.pathname)) return;
    const main = document.querySelector('main') || document.body;
    const cards = [...main.querySelectorAll('li')].filter((li) => profileLink(li) && !li.querySelector('li') && li.innerText.length < 1500);
    if (!cards.length) return;
    const { savedProfiles = {} } = await chrome.storage.local.get('savedProfiles');
    for (const li of cards) {
      if (li.querySelector(`.${SBTN}`)) continue;
      const card = readCard(li);
      if (!card?.slug || !card.name) continue;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = `${BTN} ${SBTN}`;
      btn.setAttribute('aria-label', `Save ${card.name} to AvaStars`);
      const saved = savedProfiles[card.slug];
      if (saved) { btn.className += ' done'; btn.textContent = `Saved ✓${typeof saved.match === 'number' ? ` · ${saved.match}%` : ''}`; }
      else btn.textContent = 'Save';
      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.disabled = true; btn.className = `${BTN} ${SBTN} busy`; btn.textContent = 'Saving…';
        try {
          const res = await chrome.runtime.sendMessage({ type: 'avs-linkedin-prospect', profile: readCard(li) || card });
          if (!res?.ok) throw new Error(res?.error || 'Could not save');
          const store = (await chrome.storage.local.get('savedProfiles')).savedProfiles || {};
          store[card.slug] = { at: Date.now(), id: res.candidate_id, match: res.match ?? null };
          await chrome.storage.local.set({ savedProfiles: Object.fromEntries(Object.entries(store).slice(-3000)) });
          btn.className = `${BTN} ${SBTN} done`; btn.textContent = `Saved ✓${typeof res.match === 'number' ? ` · ${res.match}%` : ''}`;
        } catch (err) { btn.className = `${BTN} ${SBTN} bad`; btn.textContent = 'Retry'; btn.title = err.message; btn.disabled = false; }
      });
      li.appendChild(btn);
    }
  }

  // ---------------------------------------------------------------- connection requests: count the ones you send
  // We never click Connect. When YOU click LinkedIn's Connect (on a profile or a search result) and the
  // button turns into "Pending", the request is recorded in AvaStars (Sourcing → Connection requests).
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('button, a, [role="button"], [role="menuitem"]');
    if (!b) return;
    const label = clean(`${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`);
    if (window.__avsAutoConnect || !/^(invite .+ to connect|connect)\b/i.test(label) || /avs-/.test(b.className)) return;
    const card = b.closest('li');
    const onProfile = slugOf();
    const info = onProfile && !card?.querySelector('a[href*="/in/"]') ? { ...readProfile(), slug: onProfile } : (card && readCard(card));
    const inviteName = (label.match(/^invite (.+?) to connect/i) || [])[1];
    if (!info?.slug) return;
    if (inviteName && !info.name) info.name = inviteName;
    const scope = card || document.querySelector('main') || document.body;
    let tries = 0;
    const check = setInterval(async () => {
      tries++;
      const pending = [...scope.querySelectorAll('button, span')].some((x) => /^pending$|withdraw invitation|invitation sent/i.test(clean(x.getAttribute?.('aria-label') || x.textContent)));
      if (pending || tries > 120) { // up to 2 min: LinkedIn first asks "Add a note?" before sending
        clearInterval(check);
        if (!pending) return;
        const { sentInvites = {} } = await chrome.storage.local.get('sentInvites');
        if (sentInvites[info.slug]) return;
        const res = await chrome.runtime.sendMessage({ type: 'avs-linkedin-prospect', profile: { ...info, connect_sent: true } }).catch(() => null);
        if (res?.ok) {
          sentInvites[info.slug] = Date.now();
          await chrome.storage.local.set({ sentInvites: Object.fromEntries(Object.entries(sentInvites).slice(-5000)) });
        }
      }
    }, 1000);
  }, true);


  // ---------------------------------------------------------------- "Send connection request" from the AvaStars app
  // Runs only in a tab the extension opened for that click: finds Connect on the profile (or under "More"),
  // clicks it, then "Send without a note", and waits for LinkedIn to show Pending.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!el && el.getClientRects().length > 0;
  const waitFor = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(300); } return null; };
  function toast(text, kind = '') {
    let t = document.getElementById('avs-auto-toast');
    if (!t) { t = document.createElement('div'); t.id = 'avs-auto-toast'; document.body.appendChild(t); }
    t.className = `avs-auto-toast ${kind}`; t.textContent = `AvaStars: ${text}`;
  }
  const labelOf = (el) => clean(`${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`);
  async function autoConnect(job) {
    const slug = slugOf();
    if (!slug || decodeURIComponent(slug).toLowerCase() !== job.slug) return;
    toast('sending connection request…');
    const h1 = await waitFor(() => document.querySelector('main h1'), 15000);
    if (!h1) throw new Error('The profile did not load.');
    await sleep(1200);
    const top = h1.closest('section') || document.querySelector('main');
    const isPending = () => [...top.querySelectorAll('button, [role="button"]')].some((b) => visible(b) && /^pending\b|withdraw invitation/i.test(labelOf(b)));
    const isConnected = () => /·\s*1st\b/.test(clean(top.textContent)) || [...top.querySelectorAll('span')].some((x) => /^1st( degree connection)?$/i.test(clean(x.textContent)));
    if (isPending()) return 'already';
    if (isConnected()) return 'connected';
    const connectRx = /^(invite .+ to connect|connect)$/i;
    let btn = [...top.querySelectorAll('button, [role="button"]')].find((b) => visible(b) && connectRx.test(clean(b.getAttribute('aria-label') || '')) ) ||
      [...top.querySelectorAll('button')].find((b) => visible(b) && /^connect$/i.test(clean(b.textContent)));
    if (!btn) {
      const more = [...top.querySelectorAll('button')].find((b) => visible(b) && /^more( actions)?$/i.test(clean(b.getAttribute('aria-label') || b.textContent)));
      if (more) {
        more.click();
        btn = await waitFor(() => [...document.querySelectorAll('[role="button"], [role="menuitem"], button')].find((b) => visible(b) && /^invite .+ to connect$/i.test(clean(b.getAttribute('aria-label') || ''))), 4000);
      }
    }
    if (!btn) throw new Error('LinkedIn shows no Connect option for this person (they may only allow Follow).');
    btn.click();
    const sendBtn = await waitFor(() => {
      const dlg = [...document.querySelectorAll('dialog[open], [role="dialog"], .artdeco-modal')].find(visible);
      if (!dlg) return isPending() ? 'done' : null;
      if (dlg.querySelector('input[type="email"], input[name="email"]')) return 'email';
      return [...dlg.querySelectorAll('button')].find((b) => visible(b) && !b.disabled && /^(send without a note|send now|send|send invitation)$/i.test(clean(b.getAttribute('aria-label') || b.textContent)));
    }, 8000);
    if (sendBtn === 'email') throw new Error('LinkedIn asks for their email address to connect. Finish it on this tab.');
    if (!sendBtn) throw new Error('LinkedIn did not show the send step. Finish it on this tab.');
    if (sendBtn !== 'done') sendBtn.click();
    const ok = await waitFor(isPending, 10000);
    if (!ok) {
      const dlg = [...document.querySelectorAll('dialog[open], [role="dialog"], .artdeco-modal')].find(visible);
      if (dlg && /weekly|limit|too many/i.test(clean(dlg.textContent))) throw new Error('LinkedIn says you reached its invitation limit.');
      throw new Error('LinkedIn did not confirm the request. Check this tab.');
    }
    return 'sent';
  }
  (async () => {
    if (!slugOf()) return;
    const { job } = await chrome.runtime.sendMessage({ type: 'avs-li-connect-job' }).catch(() => ({ job: null }));
    if (!job) return;
    window.__avsAutoConnect = true;
    try {
      const result = await autoConnect(job);
      if (result === 'connected') { toast('you are already connected with this person.', 'ok'); await chrome.runtime.sendMessage({ type: 'avs-li-connect-done', ok: false }); return; }
      const info = { ...readProfile(), slug: slugOf(), connect_sent: true };
      if (!info.name && job.name) info.name = job.name;
      const res = await chrome.runtime.sendMessage({ type: 'avs-linkedin-prospect', profile: info }).catch((e) => ({ ok: false, error: e.message }));
      if (!res?.ok) throw new Error(`Sent on LinkedIn, but AvaStars could not record it: ${res?.error || 'no answer'}`);
      const { sentInvites = {} } = await chrome.storage.local.get('sentInvites');
      sentInvites[info.slug] = Date.now();
      await chrome.storage.local.set({ sentInvites });
      toast(result === 'already' ? 'request was already pending — recorded in AvaStars.' : 'connection request sent and recorded ✓', 'ok');
      await chrome.runtime.sendMessage({ type: 'avs-li-connect-done', ok: true, from: job.from });
    } catch (e) {
      toast(e.message, 'err');
      await chrome.runtime.sendMessage({ type: 'avs-li-connect-done', ok: false }).catch(() => {});
    }
  })();


  // ---------------------------------------------------------------- "Create post on LinkedIn" from AvaStars
  // Only in a tab the extension opened for that click: "Start a post" → write the text. We never click Post.
  async function writePost(job) {
    toast('opening the post box…');
    const editorSel = ['dialog .ProseMirror[contenteditable="true"]', '.ProseMirror[contenteditable="true"][role="textbox"]', 'dialog [contenteditable="true"][role="textbox"]',
      '[role="dialog"] .ql-editor[contenteditable="true"]', '.share-box .ql-editor[contenteditable="true"]', '[role="dialog"] [contenteditable="true"][role="textbox"]'].join(', ');
    let editor = document.querySelector(editorSel);
    if (!editor) {
      const start = await waitFor(() => [...document.querySelectorAll('button, [role="button"]')].find((b) => visible(b) && /^start a post\b/i.test(clean(b.getAttribute('aria-label') || b.textContent))), 20000);
      if (!start) throw new Error('Could not find "Start a post". Click it yourself and paste (Ctrl+V).');
      start.click();
      editor = await waitFor(() => document.querySelector(editorSel), 10000);
    }
    if (!editor) throw new Error('The post box did not open. Click "Start a post" and paste (Ctrl+V).');
    editor.focus();
    await sleep(300);
    // Paste keeps line breaks the way LinkedIn's editor expects.
    const dt = new DataTransfer();
    dt.setData('text/plain', job.text);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(500);
    if (clean(editor.textContent).length < Math.min(20, clean(job.text).length)) {
      const lines = job.text.split('\n');
      lines.forEach((line, i) => {
        if (line) document.execCommand('insertText', false, line);
        if (i < lines.length - 1) document.execCommand('insertParagraph');
      });
    }
    await sleep(300);
    if (clean(editor.textContent).length < 5) throw new Error('Could not type the post. Paste it yourself (Ctrl+V).');
    toast('post written ✓ Check it, then click Post.', 'ok');
    // When they click Post / Schedule and the box closes, mark it done in AvaStars.
    const dialog = editor.closest('dialog, [role="dialog"], .artdeco-modal') || document.body;
    const onClick = (e) => {
      const b = e.target.closest?.('button');
      if (!b || !dialog.contains(b) || !/^(post|schedule)$/i.test(clean(b.textContent))) return;
      document.removeEventListener('click', onClick, true);
      (async () => {
        const closed = await waitFor(() => !document.contains(editor) || !visible(editor), 30000);
        if (!closed) return;
        await chrome.runtime.sendMessage({ type: 'avs-li-post-done', jobId: job.jobId, scheduleId: job.scheduleId, text: job.text }).catch(() => {});
        toast(/schedule/i.test(clean(b.textContent)) ? 'post scheduled ✓ Saved in AvaStars.' : 'posted ✓ Saved in AvaStars share history.', 'ok');
        setTimeout(() => document.getElementById('avs-auto-toast')?.remove(), 6000);
      })();
    };
    document.addEventListener('click', onClick, true);
  }
  (async () => {
    if (!/^\/(feed|sharing\/compose)\b/.test(location.pathname)) return;
    const { job } = await chrome.runtime.sendMessage({ type: 'avs-li-post-job' }).catch(() => ({ job: null }));
    if (!job?.text) return;
    try { await writePost(job); } catch (e) {
      try { await navigator.clipboard.writeText(job.text); } catch { /* needs focus */ }
      toast(e.message, 'err');
    }
  })();

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { decorate().catch(() => {}); profileButton().catch(() => {}); decorateResults().catch(() => {}); }, 500); };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
})();
