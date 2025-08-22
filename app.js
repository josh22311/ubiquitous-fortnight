/* app.js — 15 GB capable, mobile-safe, any encoding, Garena-only domains */
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

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- progress helpers ---------- */
const createBar = () => {
  const bar = document.createElement('div');
  bar.id = 'progressBar';
  bar.style.cssText = 'width:0%;height:4px;background:#3b82f6;transition:width .2s;border-radius:2px;margin-bottom:.5rem;';
  return bar;
};
const setProgress = (bar, p) => bar.style.width = `${Math.min(100, p)}%`;
const killBar = () => $('#progressBar')?.remove();

/* ---------- main handler ---------- */
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
  if (file.size > 15 * 1024 * 1024 * 1024) {  // 15 GB cap
    resultDiv.innerHTML = '<p class="text-red-500">File too big (max 15 GB).</p>';
    return;
  }

  processBtn.disabled = true;
  domainSel.classList.add('hidden');
  downloadBtn.classList.add('hidden');
  resultDiv.innerHTML = '';

  const progress = createBar();
  resultDiv.appendChild(progress);

  /* ---- parser state ---- */
  const credsByDomain = Object.fromEntries(SUPPORTED_DOMAINS.map(d => [d, []]));
  let invalid = 0;
  const seen = new Set();                 // dedupe
  const CHUNK = 16 * 1024;                // 16 kB slices
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let fallback = null;
  let offset = 0;
  let leftover = '';
  let diag = 0;                           // first 5 bad lines

  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK);
    const buf = await slice.arrayBuffer();
    let text = decoder.decode(buf, { stream: true });
    text = leftover + text;
    const lines = text.split('\n');
    leftover = lines.pop();               // last line may be partial

    const BATCH = 10_000;                 // micro-task size
    for (let i = 0; i < lines.length; i += BATCH) {
      const batch = lines.slice(i, i + BATCH);
      for (const raw of batch) {
        const line = raw.trim();
        if (!line) continue;

        // loose regex strips protocol, allows extra spaces
        const m = line.match(/^\s*(?:https?:\/\/)?([^:]+):([^:]+):(.+)\s*$/);
        if (!m) { invalid++; if (diag++ < 5) console.warn('Invalid →', line); continue; }

        let [, host, user, pass] = m;
        host = host.trim().toLowerCase();
        user = user.trim();
        pass = pass.trim();

        // encoding fix
        try {
          host = decoder.decode(new TextEncoder().encode(host));
          user = decoder.decode(new TextEncoder().encode(user));
          pass = decoder.decode(new TextEncoder().encode(pass));
        } catch {
          if (!fallback) fallback = new TextDecoder('windows-1252');
          host = fallback.decode(new TextEncoder().encode(host));
          user = fallback.decode(new TextEncoder().encode(user));
          pass = fallback.decode(new TextEncoder().encode(pass));
        }

        if (!user || !pass || !SUPPORTED_DOMAINS.includes(host)) {
          invalid++; if (diag++ < 5) console.warn('Rejected →', line); continue;
        }

        const key = `${host}:${user}:${pass}`;
        if (seen.has(key)) continue;
        seen.add(key);
        credsByDomain[host].push({ url: host, user, pass });
      }

      // keep UI responsive
      await new Promise(r => setTimeout(r, 0));
    }

    offset += CHUNK;
    setProgress(progress, (offset / file.size) * 100);
  }

  /* ---- final partial line ---- */
  if (leftover.trim()) {
    const m = leftover.trim().match(/^\s*(?:https?:\/\/)?([^:]+):([^:]+):(.+)\s*$/);
    if (m) {
      let [, host, user, pass] = m;
      host = host.trim().toLowerCase();
      user = user.trim();
      pass = pass.trim();
      if (user && pass && SUPPORTED_DOMAINS.includes(host)) {
        const key = `${host}:${user}:${pass}`;
        if (!seen.has(key)) {
          seen.add(key);
          credsByDomain[host].push({ url: host, user, pass });
        }
      } else { invalid++; }
    } else { invalid++; }
  }

  killBar();

  /* ---- UI rebuild (same as before) ---- */
  const activeDomains = SUPPORTED_DOMAINS.filter(d => credsByDomain[d].length);
  if (!activeDomains.length) {
    resultDiv.innerHTML = `<p class="text-red-500">No valid credentials found.<br>Check console for rejected lines.</p>`;
    processBtn.disabled = false;
    return;
  }

  const total = activeDomains.reduce((s, d) => s + credsByDomain[d].length, 0);
  const banner = document.createElement('div');
  banner.className = 'mb-4 text-center text-lg font-semibold';
  banner.innerHTML = `<span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">📦 Total: ${total}</span>`;
  checkDiv.innerHTML = '';
  checkDiv.appendChild(banner);

  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'mb-3';
  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = 'Deselect All';
  toggleBtn.className = 'text-sm underline text-blue-600 hover:text-blue-800';
  toggleBtn.onclick = () => {
    const any = $$('.domain-checkbox').some(c => c.checked);
    $$('.domain-checkbox').forEach(c => c.checked = !any);
    toggleBtn.textContent = any ? 'Select All' : 'Deselect All';
    updateResults();
  };
  toggleWrap.appendChild(toggleBtn);
  checkDiv.appendChild(toggleWrap);

  activeDomains.forEach(domain => {
    const label = document.createElement('label');
    label.className = 'flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.value = domain;
    cb.className = 'domain-checkbox w-5 h-5 accent-blue-600';
    label.append(cb, `${domain} (${credsByDomain[domain].length})`);
    checkDiv.appendChild(label);
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
