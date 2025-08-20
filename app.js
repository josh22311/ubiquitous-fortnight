/* app.js — mobile-safe, 800 MB+, any encoding, Garena-only domains */
const SUPPORTED_DOMAINS = [
  "authgop.garena.com",
  "sso.garena.com",
  "100082.connect.garena.com",
  "100055.connect.garena.com",
  "100054.connect.garena.com",
  "auth.garena.com",
  "account.garena.com",
  "100072.connect.garena.com",
  "com.garena.gaslite"
];

/* ---------- helpers ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

/* ---------- progress bar ---------- */
function createProgressBar() {
  const bar = document.createElement('div');
  bar.id = 'progressBar';
  bar.style.cssText =
    'width:0%;height:4px;background:#3b82f6;transition:width .2s;border-radius:2px;margin-bottom:.5rem;';
  return bar;
}
function setProgress(bar, percent) {
  bar.style.width = `${Math.min(100, percent)}%`;
}
function removeProgress() {
  const bar = $('#progressBar');
  if (bar) bar.remove();
}

/* ---------- main click handler ---------- */
$('#processBtn').addEventListener('click', async () => {
  const fileInput   = $('#fileInput');
  const resultDiv   = $('#result');
  const processBtn  = $('#processBtn');
  const domainSel   = $('#domainSelection');
  const checkDiv    = $('#domainCheckboxes');
  const downloadBtn = $('#downloadBtn');

  if (!fileInput.files.length) {
    resultDiv.innerHTML = '<p class="text-red-500">Please select a .txt file!</p>';
    return;
  }

  const file = fileInput.files[0];
  if (file.size > 800 * 1024 * 1024) {
    resultDiv.innerHTML = '<p class="text-red-500">File too big (max 800 MB).</p>';
    return;
  }

  processBtn.disabled = true;
  domainSel.classList.add('hidden');
  downloadBtn.classList.add('hidden');
  resultDiv.innerHTML = '';

  const progress = createProgressBar();
  resultDiv.appendChild(progress);

  /* ---- state ---- */
  const credsByDomain = Object.fromEntries(SUPPORTED_DOMAINS.map(d => [d, []]));
  let invalid = 0;
  const seen = new Set();               // dedupe toggle
  const CHUNK = 32 * 1024;              // smaller slices for mobile
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let fallbackDecoder = null;           // for weird encodings
  let offset = 0;
  let leftover = '';
  let diagnostic = 0;                   // first 5 bad lines

  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK);
    const buf = await slice.arrayBuffer();
    let text = decoder.decode(buf, { stream: true });
    text = leftover + text;
    const lines = text.split('\n');
    leftover = lines.pop();

    const BATCH = 5000;                 // lighter batches for mobile
    for (let i = 0; i < lines.length; i += BATCH) {
      const batch = lines.slice(i, i + BATCH);
      for (const raw of batch) {
        const line = raw.trim();
        if (!line) continue;

        // loose regex: strips protocol, allows spaces/tabs
        const match = line.match(/^\s*(?:https?:\/\/)?([^:]+):([^:]+):(.+)\s*$/);
        if (!match) {
          invalid++;
          if (diagnostic++ < 5) console.warn('Invalid →', line);
          continue;
        }

        let [, rawUrl, user, pass] = match;
        rawUrl = rawUrl.trim();
        user   = user.trim();
        pass   = pass.trim();

        // handle encoding issues
        try {
          rawUrl = decoder.decode(new TextEncoder().encode(rawUrl));
          user   = decoder.decode(new TextEncoder().encode(user));
          pass   = decoder.decode(new TextEncoder().encode(pass));
        } catch {
          if (!fallbackDecoder) fallbackDecoder = new TextDecoder('windows-1252');
          rawUrl = fallbackDecoder.decode(new TextEncoder().encode(rawUrl));
          user   = fallbackDecoder.decode(new TextEncoder().encode(user));
          pass   = fallbackDecoder.decode(new TextEncoder().encode(pass));
        }

        const url = rawUrl.toLowerCase();
        if (!user || !pass || !SUPPORTED_DOMAINS.includes(url)) {
          invalid++;
          if (diagnostic++ < 5) console.warn('Rejected →', line);
          continue;
        }

        const key = `${url}:${user}:${pass}`;
        if (seen.has(key)) continue;
        seen.add(key);
        credsByDomain[url].push({ url, user, pass });
      }

      // keep UI alive on low-end devices
      if ((i + BATCH) % 50_000 === 0) await new Promise(r => setTimeout(r, 0));
    }

    offset += CHUNK;
    setProgress(progress, (offset / file.size) * 100);
  }

  /* ---- handle last partial line ---- */
  if (leftover.trim()) {
    const line = leftover.trim();
    const match = line.match(/^\s*(?:https?:\/\/)?([^:]+):([^:]+):(.+)\s*$/);
    if (match) {
      let [, rawUrl, user, pass] = match;
      rawUrl = rawUrl.trim();
      user   = user.trim();
      pass   = pass.trim();
      const url = rawUrl.toLowerCase();
      if (user && pass && SUPPORTED_DOMAINS.includes(url)) {
        const key = `${url}:${user}:${pass}`;
        if (!seen.has(key)) {
          seen.add(key);
          credsByDomain[url].push({ url, user, pass });
        }
      } else { invalid++; }
    } else { invalid++; }
  }

  progress.remove();

  /* ---- identical UI rebuild ---- */
  const activeDomains = SUPPORTED_DOMAINS.filter(d => credsByDomain[d].length);
  if (!activeDomains.length) {
    resultDiv.innerHTML = '<p class="text-red-500">No valid credentials found for supported domains!</p>';
    processBtn.disabled = false;
    return;
  }

  const totalCreds = activeDomains.reduce((s, d) => s + credsByDomain[d].length, 0);
  const banner = document.createElement('div');
  banner.className = 'mb-4 text-center text-lg font-semibold';
  banner.innerHTML = `<span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">📦 Total Credentials Found: ${totalCreds}</span>`;
  checkDiv.innerHTML = '';
  checkDiv.appendChild(banner);

  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'mb-3';
  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = 'Deselect All';
  toggleBtn.className = 'text-sm underline text-blue-600 hover:text-blue-800';
  toggleBtn.addEventListener('click', () => {
    const anyChecked = $$('.domain-checkbox').some(cb => cb.checked);
    $$('.domain-checkbox').forEach(cb => cb.checked = !anyChecked);
    toggleBtn.textContent = anyChecked ? 'Select All' : 'Deselect All';
    updateResults();
  });
  toggleWrap.appendChild(toggleBtn);
  checkDiv.appendChild(toggleWrap);

  activeDomains.forEach(domain => {
    const card = document.createElement('label');
    card.className = 'flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.value = domain;
    cb.className = 'domain-checkbox w-5 h-5 accent-blue-600';
    card.append(cb, document.createTextNode(`${domain} (${credsByDomain[domain].length})`));
    checkDiv.appendChild(card);
  });

  const updateResults = () => {
    const selected = $$('.domain-checkbox:checked').map(cb => cb.value);
    let out = '';
    selected.forEach(d => {
      credsByDomain[d].forEach(({ url, user, pass }) => {
        out += `${url}:${user}:${pass}\n`;
      });
    });
    if (invalid) out += `\n⚠️ Skipped ${invalid} invalid/unsupported entries.`;
    resultDiv.textContent = out || 'No entries selected.';
    downloadBtn.classList.toggle('hidden', !selected.length);
  };
  $$('.domain-checkbox').forEach(cb => cb.addEventListener('change', updateResults));

  domainSel.classList.remove('hidden');
  updateResults();

  downloadBtn.onclick = () => {
    const selected = $$('.domain-checkbox:checked').map(cb => cb.value);
    const payload = selected.flatMap(d => credsByDomain[d].map(c => `${c.url}:${c.user}:${c.pass}`)).join('\n');
    if (!payload) return;
    const blob = new Blob([payload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'filtered_credentials.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  processBtn.disabled = false;
});
