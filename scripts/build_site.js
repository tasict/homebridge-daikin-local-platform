// Builds the project site pages (site/index.html, site/<lang>/index.html) from scripts/site_text.json.
// Usage: node scripts/build_site.js
// Page copy lives in site_text.json (a \n in the headline marks where it breaks). Shared CSS/JS and images are in
// site/assets/ and are edited directly. Published to GitHub Pages by .github/workflows/pages.yml.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'site_text.json'), 'utf8'));

const BASE = 'https://tasict.github.io/homebridge-daikin-local-platform/';
const REPO = 'https://github.com/tasict/homebridge-daikin-local-platform';
const NPM = 'https://www.npmjs.com/package/homebridge-daikin-local-platform';
const PAYPAL = 'https://paypal.me/tasict';
const BOBA = 'https://tasict.bobaboba.me';

// [hreflang, directory, html lang, native name, og locale]
const LANGS = [
  ['en', '', 'en', 'English', 'en_US'],
  ['zh-TW', 'zh-TW/', 'zh-Hant-TW', '繁體中文', 'zh_TW'],
  ['ja', 'ja/', 'ja', '日本語', 'ja_JP']
];

const GLOBE = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15M10 2.5c2.2 2.3 3.2 4.8 3.2 7.5s-1 5.2-3.2 7.5c-2.2-2.3-3.2-4.8-3.2-7.5s1-5.2 3.2-7.5z"/></svg>';
// The plugin's mark (branding/icon-mono.svg), drawn in currentColor.
const MARK = '<svg viewBox="61 65 390 390" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M122 186 256 80 390 186" stroke-width="30"/><rect x="126" y="216" width="260" height="76" rx="22" fill="currentColor" stroke="none"/><path d="M160 332q96 38 192 0" stroke-width="22"/><path d="M184 384q72 32 144 0" stroke-width="22" opacity=".7"/><path d="M210 432q46 24 92 0" stroke-width="22" opacity=".45"/></svg>';
const PHONE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M9.5 12 12 9.8l2.5 2.2M10.3 11.3v3.2h3.4v-3.2"/></svg>';
const HUB = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="6" rx="1.5"/><rect x="3" y="13" width="18" height="6" rx="1.5"/><path d="M7 8h.01M7 16h.01"/></svg>';

// The indoor unit of the hero: the same shapes as the plugin's mark, with the three arcs as moving air.
const UNIT = alt => `<svg class="unit" viewBox="0 0 480 250" role="img" aria-label="${e(alt)}">
      <rect class="unit-body" x="40" y="18" width="400" height="98" rx="28"/>
      <rect class="unit-vent" x="84" y="88" width="312" height="11" rx="5.5"/>
      <circle class="unit-led" cx="398" cy="46" r="5"/>
      <g class="air">
        <path d="M120 142q120 42 240 0"/>
        <path d="M150 186q90 34 180 0"/>
        <path d="M182 226q58 24 116 0"/>
      </g>
    </svg>`;

// Root page only: send first-time visitors to their browser language; an explicit choice (saved by site.js) wins.
const REDIRECT = `<script>
try {
  if (!localStorage.getItem('lang')) {
    const pick = tag => {
      const t = tag.toLowerCase();
      if (t.startsWith('zh')) return 'zh-TW';
      return ['ja', 'en'].find(l => t.startsWith(l));
    };
    const lang = (navigator.languages || [navigator.language]).map(pick).find(Boolean);
    if (lang && lang !== 'en') location.replace(lang + '/' + location.search + location.hash);
  }
} catch { /* storage blocked: stay on English */ }
</script>
`;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
function e(s) { return String(s).replace(/[&<>"']/g, c => ESC[c]); }

function page([code, dir, htmlLang, native, og]) {
  const t = T[code];
  const up = dir ? '../' : '';
  const a = `${up}assets/`;

  const alts = LANGS.map(([c, d]) => `<link rel="alternate" hreflang="${c}" href="${BASE}${d}">`).join('\n');
  const menu = LANGS.map(([c, d, hl, nm]) =>
    `<li><a href="${up + d || './'}" hreflang="${c}" lang="${hl}"${c === code ? ' aria-current="page"' : ''}>${e(nm)}</a></li>`).join('');
  const pairs = (items, tag = 'li') => items.map(([h, p]) => `<${tag}><h3>${e(h)}</h3><p>${e(p)}</p></${tag}>`).join('');

  // Demo strings for site.js; the order of the mode buttons follows the Home app's own control.
  const demoText = { st: { off: t.st_off, cool: t.st_cool, heat: t.st_heat, auto: t.st_auto }, now: t.now };
  const modes = ['off', 'cool', 'heat', 'auto'].map(m =>
    `<label><input type="radio" name="mode" value="${m}"${m === 'cool' ? ' checked' : ''}><span>${e(t.modes[m])}</span></label>`).join('');

  const flowIcons = [PHONE, HUB, MARK];
  const flow = t.flow.map(([name, sub], i) =>
    `<li class="node"><span class="node-icon">${flowIcons[i]}</span><strong>${e(name)}</strong><small>${e(sub)}</small></li>` +
    (i < t.flow_links.length ? `<li class="link" aria-hidden="true"><span>${e(t.flow_links[i])}</span></li>` : '')).join('\n        ');

  return `<!doctype html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(t.title)}</title>
<meta name="description" content="${e(t.desc)}">
<link rel="canonical" href="${BASE}${dir}">
${alts}
<link rel="alternate" hreflang="x-default" href="${BASE}">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(t.title)}">
<meta property="og:description" content="${e(t.desc)}">
<meta property="og:url" content="${BASE}${dir}">
<meta property="og:image" content="${BASE}assets/og.png">
<meta property="og:locale" content="${og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f2f7fa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d1a24" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${a}icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${a}icon.png">
<link rel="stylesheet" href="${a}site.css">
${dir ? '' : REDIRECT}</head>
<body>
<header class="wrap masthead">
  <a class="wordmark" href="./"><img src="${a}icon.svg" alt="" width="30" height="30">Daikin Local Platform</a>
  <a href="${REPO}">${e(t.source)}</a>
  <a class="tip head-tip" href="${BOBA}" aria-label="${e(t.boba)}"><img src="${a}boba.png" alt="" width="24" height="24"><span>${e(t.boba)}</span></a>
  <details class="lang">
    <summary aria-label="${e(t.lang_menu)}">${GLOBE}<span>${e(native)}</span></summary>
    <ul>${menu}</ul>
  </details>
</header>

<main>
<div class="wrap">
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <h1 id="hero-title">${e(t.h1).replace(/\n/g, '<br>')}</h1>
      <p class="lede">${e(t.lede)}</p>
      <div class="actions">
        <a class="btn" href="#start">${e(t.cta)}</a>
        <a href="${REPO}">${e(t.github)}</a>
      </div>
      <p class="fine">${e(t.fine)}</p>
    </div>
    <div class="room" data-demo data-mode="cool" data-t='${e(JSON.stringify(demoText))}'>
      ${UNIT(t.unit_alt)}
      <div class="tile">
        <div class="tile-head">
          <span class="tile-icon">${MARK}</span>
          <div class="tile-name"><strong>${e(t.room)}</strong><span data-status aria-live="polite"></span></div>
          <span class="tile-now" data-now></span>
        </div>
        <div class="dial">
          <button type="button" class="step" data-step="-0.5" aria-label="${e(t.lower)}">&minus;</button>
          <output class="target" data-target>24°</output>
          <button type="button" class="step" data-step="0.5" aria-label="${e(t.raise)}">+</button>
        </div>
        <fieldset class="seg">
          <legend>${e(t.mode_legend)}</legend>
          ${modes}
        </fieldset>
      </div>
      <p class="hint">${e(t.demo_hint)}</p>
    </div>
  </section>

  <section class="band" aria-labelledby="h-local">
    <div class="intro">
      <h2 id="h-local">${e(t.local_h2)}</h2>
      <p>${e(t.local_p)}</p>
    </div>
    <ol class="flow">
        ${flow}
    </ol>
  </section>

  <section class="band" aria-labelledby="h-feat">
    <div class="intro">
      <h2 id="h-feat">${e(t.feat_h2)}</h2>
      <p>${e(t.feat_p)}</p>
    </div>
    <ul class="feats">${pairs(t.feats)}</ul>
  </section>

  <section class="band" aria-labelledby="h-matter">
    <div class="split">
      <div class="intro">
        <h2 id="h-matter">${e(t.matter_h2)} <span class="chip">${e(t.beta)}</span></h2>
        <p>${e(t.matter_p)}</p>
        <p>${e(t.matter_p2)}</p>
      </div>
      <div class="move">
        <h3>${e(t.move_h3)}</h3>
        <p class="move-p">${e(t.move_p)}</p>
        <ol class="moves">${pairs(t.moves)}</ol>
        <p class="back">${e(t.back)}</p>
      </div>
    </div>
  </section>

  <section class="band" aria-labelledby="h-dev">
    <div class="intro">
      <h2 id="h-dev">${e(t.dev_h2)}</h2>
      <p>${e(t.dev_p)}</p>
    </div>
    <dl class="devs">${t.devs.map(([h, p]) => `<div><dt>${e(h)}</dt><dd>${e(p)}</dd></div>`).join('')}</dl>
    <div class="cloud">
      <h3>${e(t.cloud_h3)}</h3>
      <p>${e(t.cloud_p)} <a href="${REPO}/issues/17">${e(t.cloud_link)}</a></p>
    </div>
  </section>

  <section class="band" id="start" aria-labelledby="h-start">
    <h2 id="h-start">${e(t.start_h2)}</h2>
    <ol class="steps">${pairs(t.steps)}</ol>
    <p class="fine">${e(t.start_note)} <a href="${REPO}#homebridge-setup">${e(t.docs)}</a></p>
  </section>

  <section class="band" aria-labelledby="h-support">
    <div class="tipjar">
      <img src="${a}boba.png" alt="" width="120" height="120">
      <div>
        <h2 id="h-support">${e(t.support_h2)}</h2>
        <p>${e(t.support_p)}</p>
        <div class="actions">
          <a class="btn" href="${BOBA}"><img src="${a}boba.png" alt="" width="22" height="22">${e(t.boba)}</a>
          <a class="tip" href="${PAYPAL}">${e(t.paypal)}</a>
        </div>
        <p class="fine">${e(t.support_card)}</p>
      </div>
    </div>
  </section>
</div>
</main>

<footer>
  <div class="wrap">
    <div class="foot">
      <div>
        <p>${e(t.made)}</p>
        <ul>
          <li><a href="${REPO}">${e(t.source)}</a></li>
          <li><a href="${NPM}">${e(t.npm)}</a></li>
          <li><a href="${REPO}/blob/master/CHANGELOG.md">${e(t.changelog)}</a></li>
          <li><a href="${REPO}/issues">${e(t.issues)}</a></li>
        </ul>
      </div>
      <ul class="langs">${menu}</ul>
    </div>
    <p class="tm">${e(t.tm)}</p>
  </div>
</footer>
<script src="${a}site.js"></script>
</body>
</html>
`;
}

for (const lang of LANGS) {
  const file = path.join(ROOT, 'site', lang[1], 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, page(lang));
  console.log('wrote', path.relative(ROOT, file));
}
