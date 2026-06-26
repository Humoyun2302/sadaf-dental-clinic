/**
 * build.js
 * 
 * Netlify build script: fetches all data from Supabase and generates
 * static HTML files into the dist/ directory.
 * 
 * Run automatically by Netlify during each deploy.
 * Run locally: node build.js
 */

try { require('dotenv').config(); } catch (_) {}

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const SRC  = __dirname;
const DIST = path.join(__dirname, 'dist');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFieldValue(value) {
  const lines = (value || '').split('\n').filter(l => l.trim());
  if (lines.length > 1)
    return `<span style="display:flex;flex-direction:column;gap:6px;">${lines.map(l => `<span>${l.trim()}</span>`).join('')}</span>`;
  return lines[0] || value || '';
}

function updateDoctorHtml(html, doc) {
  if (doc.page_title) {
    html = html.replace(/<title>[^<]+<\/title>/, `<title>${doc.page_title}</title>`);
  }
  if (!doc.has_photo) {
    if (doc.name)
      html = html.replace(/<h1>[^<]+<\/h1>/, `<h1>${doc.name}</h1>`);
    if (doc.hero_subtitle)
      html = html.replace(/<p class="hero-subtitle">[^<]+<\/p>/, `<p class="hero-subtitle">${doc.hero_subtitle}</p>`);
    if (doc.initials)
      html = html.replace(/<div class="avatar">[^<]+<\/div>/, `<div class="avatar">${doc.initials}</div>`);
  } else if (doc.photo_data) {
    // Update photo src if photo_data is present
    html = html.replace(
      /src="data:image\/jpeg;base64,[^"]+"/,
      `src="data:image/jpeg;base64,${doc.photo_data}"`
    );
  }
  if (doc.fields) {
    for (const [label, value] of Object.entries(doc.fields)) {
      const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx  = new RegExp(
        `(<p class="info-label">${esc}<\\/p>\\s*<p class="info-value"[^>]*>)[\\s\\S]*?(<\\/p>)`,
        'g'
      );
      html = html.replace(rx, `$1${formatFieldValue(value)}$2`);
    }
  }
  return html;
}

function generateNewDoctorPage(doc) {
  const templatePath = path.join(SRC, 'doctor-nurkhozhaev.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  return updateDoctorHtml(html, doc);
}

function buildIndexHtml(doctors, clinicName, clinicSub) {
  let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

  // Update clinic header
  html = html.replace(/<div class="clinic-name">[^<]+<\/div>/, `<div class="clinic-name">${clinicName}</div>`);
  html = html.replace(/<div class="clinic-sub">[^<]+<\/div>/, `<div class="clinic-sub">${clinicSub}</div>`);

  // Rebuild doctor cards
  const cards = doctors.map(d => {
    const cls      = d.no_photo ? ' no-photo' : '';
    const initials = d.card_initials || d.initials || '';
    const name     = d.card_name    || d.name     || d.slug;
    const spec     = d.card_spec    || '';
    return `    <a class="doctor-card${cls}" href="doctor-${d.slug}.html">
      <div class="avatar">${initials}</div>
      <div class="doctor-info">
        <div class="doctor-name">${name}</div>
        <div class="doctor-spec">${spec}</div>
      </div>
      <span class="arrow">›</span>
    </a>`;
  }).join('\n');

  const total = doctors.length;
  const countStr = total === 1 ? '1 врач' : total < 5 ? `${total} врача` : `${total} врачей`;

  // Replace list contents
  html = html.replace(
    /(<div class="doctor-list" id="list">)[\s\S]*?(<\/div>\s*\n\s*<div class="empty")/,
    `$1\n${cards}\n  $2`
  );

  // Update count
  html = html.replace(
    /<div class="count-label" id="count">[^<]+<\/div>/,
    `<div class="count-label" id="count">${countStr}</div>`
  );

  return html;
}

// ─── Main build ──────────────────────────────────────────────────────────────

async function build() {
  console.log('Building Sadaf Dental Clinic from Supabase...\n');

  // Ensure dist/ exists
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

  // Fetch all data
  const [{ data: doctors, error: docErr }, { data: clinicRows, error: clinicErr }] = await Promise.all([
    supabase.from('doctors').select('*').order('sort_order').order('slug'),
    supabase.from('clinic_info').select('*')
  ]);

  if (docErr)    { console.error('Supabase doctors error:', docErr.message); process.exit(1); }
  if (clinicErr) { console.error('Supabase clinic_info error:', clinicErr.message); process.exit(1); }

  const clinicInfo = {};
  (clinicRows || []).forEach(r => { clinicInfo[r.key] = r.value; });
  const clinicName = clinicInfo.clinic_name || 'Sadaf Dental Clinic';
  const clinicSub  = clinicInfo.clinic_sub  || 'Наши специалисты — Ташкент';

  // Generate each doctor page
  let built = 0;
  for (const doc of (doctors || [])) {
    try {
      let html;
      const existingFile = path.join(SRC, `doctor-${doc.slug}.html`);

      if (fs.existsSync(existingFile)) {
        html = fs.readFileSync(existingFile, 'utf8');
        html = updateDoctorHtml(html, doc);
      } else {
        html = generateNewDoctorPage(doc);
      }

      fs.writeFileSync(path.join(DIST, `doctor-${doc.slug}.html`), html, 'utf8');
      built++;
      console.log(`  ✓ doctor-${doc.slug}.html`);
    } catch (e) {
      console.error(`  ✗ doctor-${doc.slug}.html: ${e.message}`);
    }
  }

  // Generate index.html
  const indexHtml = buildIndexHtml(doctors || [], clinicName, clinicSub);
  fs.writeFileSync(path.join(DIST, 'index.html'), indexHtml, 'utf8');
  console.log(`  ✓ index.html`);

  // Copy admin.html to dist (so it's accessible on the Netlify domain)
  fs.copyFileSync(path.join(SRC, 'admin.html'), path.join(DIST, 'admin.html'));
  console.log(`  ✓ admin.html`);

  console.log(`\nBuild complete: ${built} doctor pages + index.html\n`);
}

build().catch(err => {
  console.error('\nBuild failed:', err.message);
  process.exit(1);
});
