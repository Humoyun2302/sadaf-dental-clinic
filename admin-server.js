const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const DIR = __dirname;

app.use(express.json({ limit: '50mb' }));

// Serve admin.html at /admin
app.get('/admin', (req, res) => res.sendFile(path.join(DIR, 'admin.html')));

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDoctorSlugs() {
  return fs.readdirSync(DIR)
    .filter(f => f.startsWith('doctor-') && f.endsWith('.html'))
    .map(f => f.slice(7, -5))
    .sort();
}

function parseDoctorFile(slug) {
  const html = fs.readFileSync(path.join(DIR, `doctor-${slug}.html`), 'utf8');
  const data = { slug };

  const titleM = html.match(/<title>([^<]+)<\/title>/);
  if (titleM) data.pageTitle = titleM[1];

  data.hasPhoto = html.includes('src="data:image/jpeg;base64,');

  if (!data.hasPhoto) {
    const h1M = html.match(/<h1>([^<]+)<\/h1>/);
    if (h1M) data.name = h1M[1];
    const subM = html.match(/<p class="hero-subtitle">([^<]+)<\/p>/);
    if (subM) data.heroSubtitle = subM[1];
    const avM = html.match(/<div class="avatar">([^<]+)<\/div>/);
    if (avM) data.initials = avM[1];
  } else {
    data.name = data.pageTitle ? data.pageTitle.split(' — ')[0] : '';
  }

  data.fields = {};
  const cardRx = /<p class="info-label">([^<]+)<\/p>\s*<p class="info-value"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = cardRx.exec(html)) !== null) {
    const label = m[1].trim();
    const value = m[2]
      .replace(/<\/span>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n+/g, '\n')
      .trim();
    data.fields[label] = value;
  }

  return data;
}

function updateDoctorFile(slug, updates) {
  const filePath = path.join(DIR, `doctor-${slug}.html`);
  let html = fs.readFileSync(filePath, 'utf8');

  if (updates.pageTitle !== undefined) {
    html = html.replace(/<title>[^<]+<\/title>/, `<title>${updates.pageTitle}</title>`);
  }

  if (!html.includes('src="data:image/jpeg;base64,')) {
    if (updates.name !== undefined) {
      html = html.replace(/<h1>[^<]+<\/h1>/, `<h1>${updates.name}</h1>`);
    }
    if (updates.heroSubtitle !== undefined) {
      html = html.replace(/<p class="hero-subtitle">[^<]+<\/p>/, `<p class="hero-subtitle">${updates.heroSubtitle}</p>`);
    }
    if (updates.initials !== undefined) {
      html = html.replace(/<div class="avatar">[^<]+<\/div>/, `<div class="avatar">${updates.initials}</div>`);
    }
  }

  if (updates.fields) {
    for (const [label, value] of Object.entries(updates.fields)) {
      const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(
        `(<p class="info-label">${esc}<\\/p>\\s*<p class="info-value"[^>]*>)[\\s\\S]*?(<\\/p>)`,
        'g'
      );
      const lines = value.split('\n').filter(l => l.trim());
      const newVal = lines.length > 1
        ? `<span style="display:flex;flex-direction:column;gap:6px;">${lines.map(l => `<span>${l.trim()}</span>`).join('')}</span>`
        : (lines[0] || value);
      html = html.replace(rx, `$1${newVal}$2`);
    }
  }

  fs.writeFileSync(filePath, html, 'utf8');
}

// ─── Doctor API ──────────────────────────────────────────────────────────────

app.get('/api/doctors', (req, res) => {
  try {
    const doctors = getDoctorSlugs().map(slug => {
      try { return parseDoctorFile(slug); }
      catch (e) { return { slug, error: e.message }; }
    });
    res.json(doctors);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/doctors/:slug', (req, res) => {
  try { res.json(parseDoctorFile(req.params.slug)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

app.put('/api/doctors/:slug', (req, res) => {
  try {
    updateDoctorFile(req.params.slug, req.body);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/doctors', (req, res) => {
  try {
    const { slug, ...data } = req.body;
    if (!slug || !/^[a-z0-9-]+$/.test(slug))
      return res.status(400).json({ error: 'Slug must be lowercase letters, numbers, hyphens only' });

    const newPath = path.join(DIR, `doctor-${slug}.html`);
    if (fs.existsSync(newPath))
      return res.status(409).json({ error: 'A doctor with this slug already exists' });

    // Use nurkhozhaev (no-photo) as template
    const tpl = fs.readFileSync(path.join(DIR, 'doctor-nurkhozhaev.html'), 'utf8');
    fs.writeFileSync(newPath, tpl, 'utf8');
    updateDoctorFile(slug, data);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/doctors/:slug', (req, res) => {
  try {
    const fp = path.join(DIR, `doctor-${req.params.slug}.html`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Index Page API ──────────────────────────────────────────────────────────

app.get('/api/index-meta', (req, res) => {
  try {
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const nameM = html.match(/<div class="clinic-name">([^<]+)<\/div>/);
    const subM  = html.match(/<div class="clinic-sub">([^<]+)<\/div>/);
    res.json({ clinicName: nameM?.[1] ?? '', clinicSub: subM?.[1] ?? '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/index-meta', (req, res) => {
  try {
    const { clinicName, clinicSub } = req.body;
    let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    if (clinicName !== undefined)
      html = html.replace(/<div class="clinic-name">[^<]+<\/div>/, `<div class="clinic-name">${clinicName}</div>`);
    if (clinicSub !== undefined)
      html = html.replace(/<div class="clinic-sub">[^<]+<\/div>/, `<div class="clinic-sub">${clinicSub}</div>`);
    fs.writeFileSync(path.join(DIR, 'index.html'), html, 'utf8');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/index-cards', (req, res) => {
  try {
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const cards = [];
    const rx = /<a class="doctor-card([^"]*)"[^>]*href="doctor-([^"]+)\.html"[^>]*>\s*<div class="avatar">([^<]*)<\/div>\s*<div class="doctor-info">\s*<div class="doctor-name">([^<]+)<\/div>\s*<div class="doctor-spec">([^<]+)<\/div>/g;
    let m;
    while ((m = rx.exec(html)) !== null) {
      cards.push({
        classes: m[1].trim(),
        slug: m[2],
        initials: m[3],
        name: m[4],
        spec: m[5],
        noPhoto: m[1].includes('no-photo')
      });
    }
    res.json(cards);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/index-cards/:slug', (req, res) => {
  try {
    const { name, spec, initials, noPhoto } = req.body;
    const slug = req.params.slug;
    let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

    // Update card content
    const contentRx = new RegExp(
      `(<a class="doctor-card[^"]*"[^>]*href="doctor-${slug}\\.html"[^>]*>\\s*<div class="avatar">)[^<]*(<\\/div>\\s*<div class="doctor-info">\\s*<div class="doctor-name">)[^<]*(<\\/div>\\s*<div class="doctor-spec">)[^<]*(<\\/div>)`,
      'g'
    );
    if (!contentRx.test(html))
      return res.status(404).json({ error: 'Card not found in index.html' });

    html = html.replace(contentRx, `$1${initials}$2${name}$3${spec}$4`);

    // Update no-photo class
    const classRx = new RegExp(`(<a class="doctor-card)([^"]*)(")([^>]*href="doctor-${slug}\\.html")`,'g');
    html = html.replace(classRx, (_, a, cls, q, rest) => {
      let newCls = cls.replace(/\s*no-photo\s*/g, '').trim();
      if (noPhoto) newCls = (newCls + ' no-photo').trim();
      return `${a}${newCls ? ' ' + newCls : ''}${q}${rest}`;
    });

    fs.writeFileSync(path.join(DIR, 'index.html'), html, 'utf8');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add a new card to index.html
app.post('/api/index-cards', (req, res) => {
  try {
    const { slug, name, spec, initials, noPhoto } = req.body;
    let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

    const cardHtml = `    <a class="doctor-card${noPhoto ? ' no-photo' : ''}" href="doctor-${slug}.html">
      <div class="avatar">${initials}</div>
      <div class="doctor-info">
        <div class="doctor-name">${name}</div>
        <div class="doctor-spec">${spec}</div>
      </div>
      <span class="arrow">›</span>
    </a>\n`;

    html = html.replace(/(\s*<\/div>\s*\n\s*<div class="empty")/, `\n${cardHtml}$1`);

    // Update doctor count
    const total = (html.match(/<a class="doctor-card/g) || []).length;
    const countStr = total === 1 ? '1 врач' : total < 5 ? `${total} врача` : `${total} врачей`;
    html = html.replace(/<div class="count-label" id="count">[^<]+<\/div>/, `<div class="count-label" id="count">${countStr}</div>`);

    fs.writeFileSync(path.join(DIR, 'index.html'), html, 'utf8');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Remove a card from index.html
app.delete('/api/index-cards/:slug', (req, res) => {
  try {
    const slug = req.params.slug;
    let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const cardRx = new RegExp(`\\s*<a class="doctor-card[^"]*"[^>]*href="doctor-${slug}\\.html"[^>]*>[\\s\\S]*?<\\/a>`, 'g');
    html = html.replace(cardRx, '');

    const total = (html.match(/<a class="doctor-card/g) || []).length;
    const countStr = total === 1 ? '1 врач' : total < 5 ? `${total} врача` : `${total} врачей`;
    html = html.replace(/<div class="count-label" id="count">[^<]+<\/div>/, `<div class="count-label" id="count">${countStr}</div>`);

    fs.writeFileSync(path.join(DIR, 'index.html'), html, 'utf8');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`\n  Sadaf Admin Panel → http://localhost:${PORT}/admin\n`);
});
