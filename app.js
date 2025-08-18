/* app.js — refreshed version */
const SUPPORTED_DOMAINS = [
  "sso.crunchyroll.co", "www.crunchyroll.com", "www.vivamax.net", "com.viva.vivamax",
  "www.youtube.com", "www.pornhub.com", "www.pornhubpremium.com", "www.brazzers.com",
  "www.liveatbrazzers.com", "probiller.brazzersnetwork.com", "onlyfans.com",
  "web.telegram.org", "www.codashop.com", "www.tiktok.com",
  "com.supercell.clashofclans", "com.supercell.clashroyale",
  "com.supercell.brawlstars", "com.garena.gaslite", "100082.connect.garena.com",
  "accountmt.mobilelegends.com", "mtacc.mobilelegends.com",
  "google.com", "facebook.com"
];

/* ---------- helpers ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

/* ---------- main flow ---------- */
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

  processBtn.disabled = true;
  resultDiv.innerHTML = '<p class="text-gray-500">Processing...</p>';
  domainSel.classList.add('hidden');
  downloadBtn.classList.add('hidden');

  try {
    const text  = await fileInput.files[0].text();
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());

    if (!lines.length) {
      resultDiv.innerHTML = '<p class="text-red-500">File is empty!</p>';
      return;
    }

    /* ----- parse & bucket ----- */
    const credsByDomain = Object.fromEntries(SUPPORTED_DOMAINS.map(d => [d, []]));
    let invalid = 0;

    lines.forEach((raw, idx) => {
      const parts = raw.split(':');
      if (parts.length < 3) { invalid++; return; }

      let [url, user, pass] = parts;
      url  = url.replace(/^https?:\/\//, '').split('/')[0].toLowerCase().trim();
      user = user.trim();
      pass = pass.trim();

      if (!user || !pass || !url) { invalid++; return; }
      if (SUPPORTED_DOMAINS.includes(url)) {
        credsByDomain[url].push({ url, user, pass, index: idx + 1 });
      } else {
        invalid++;
      }
    });

    const activeDomains = SUPPORTED_DOMAINS.filter(d => credsByDomain[d].length);
    if (!activeDomains.length) {
      resultDiv.innerHTML = '<p class="text-red-500">No valid credentials found for supported domains!</p>';
      return;
    }

    /* ----- total banner ----- */
    const totalCreds = activeDomains.reduce((sum, d) => sum + credsByDomain[d].length, 0);
    const totalBanner = document.createElement('div');
    totalBanner.className = 'mb-4 text-center text-lg font-semibold';
    totalBanner.innerHTML = `
      <span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
        📦 Total Credentials Found: ${totalCreds}
      </span>`;
    checkDiv.innerHTML = '';
    checkDiv.appendChild(totalBanner);

    /* ----- select / deselect all toggle ----- */
    const toggleWrap = document.createElement('div');
    toggleWrap.className = 'mb-3';
    const toggle = document.createElement('button');
    toggle.textContent = 'Deselect All';
    toggle.className = 'text-sm underline text-blue-600 hover:text-blue-800';
    toggle.addEventListener('click', () => {
      const checked = $$('.domain-checkbox').some(cb => cb.checked);
      $$('.domain-checkbox').forEach(cb => cb.checked = !checked);
      toggle.textContent = checked ? 'Select All' : 'Deselect All';
      updateResults();
    });
    toggleWrap.appendChild(toggle);
    checkDiv.appendChild(toggleWrap);

    /* ----- domain checkboxes (styled cards) ----- */
    activeDomains.forEach(domain => {
      const card = document.createElement('label');
      card.className = `flex items-center gap-3 p-3 border rounded-lg cursor-pointer
                        hover:bg-gray-50 transition`;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.value = domain;
      cb.className = 'domain-checkbox w-5 h-5 accent-blue-600';
      card.append(cb, document.createTextNode(`${domain} (${credsByDomain[domain].length})`));
      checkDiv.appendChild(card);
    });

    /* ----- live update function ----- */
    const updateResults = () => {
      const selected = $$('.domain-checkbox:checked').map(cb => cb.value);
      let out = '';
      selected.forEach(d => {
        credsByDomain[d].forEach(({ url, user, pass, index }) => {
          out += `Entry ${index}: URL=${url}, User=${user}, Pass=${pass}\n`;
        });
      });

      if (invalid) out += `\n⚠️ Skipped ${invalid} invalid/unsupported entries.`;
      resultDiv.textContent = out || 'No entries selected.';
      downloadBtn.classList.toggle('hidden', !selected.length);
    };

    $$('.domain-checkbox').forEach(cb => cb.addEventListener('change', updateResults));

    /* ----- reveal UI ----- */
    domainSel.classList.remove('hidden');
    updateResults();

    /* ----- download handler ----- */
    downloadBtn.onclick = () => {
      const selected = $$('.domain-checkbox:checked').map(cb => cb.value);
      const payload = selected.flatMap(d =>
        credsByDomain[d].map(({ url, user, pass }) => `${url}:${user}:${pass}`)
      ).join('\n');
      if (!payload) return;
      const blob = new Blob([payload], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'filtered_credentials.txt';
      a.click();
      URL.revokeObjectURL(url);
    };

  } catch (err) {
    resultDiv.innerHTML = `<p class="text-red-500">Error: ${err.message}</p>`;
  } finally {
    processBtn.disabled = false;
  }
});
