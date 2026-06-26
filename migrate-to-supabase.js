/**
 * migrate-to-supabase.js
 * 
 * One-time migration: reads all doctor-*.html files and seeds Supabase.
 * 
 * Usage:
 *   node migrate-to-supabase.js
 * 
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in .env or environment.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DIR = __dirname;

function getDoctorSlugs() {
  return fs.readdirSync(DIR)
    .filter(f => f.startsWith('doctor-') && f.endsWith('.html'))
    .map(f => f.slice(7, -5))
    .sort();
}

function parseDoctorFile(slug) {
  const html = fs.readFileSync(path.join(DIR, `doctor-${slug}.html`), 'utf8');
  const doc = { slug };

  const titleM = html.match(/<title>([^<]+)<\/title>/);
  if (titleM) doc.page_title = titleM[1];

  doc.has_photo = html.includes('src="data:image/jpeg;base64,');

  if (!doc.has_photo) {
    const h1M  = html.match(/<h1>([^<]+)<\/h1>/);
    if (h1M)  doc.name = h1M[1];
    const subM = html.match(/<p class="hero-subtitle">([^<]+)<\/p>/);
    if (subM) doc.hero_subtitle = subM[1];
    const avM  = html.match(/<div class="avatar">([^<]+)<\/div>/);
    if (avM)  doc.initials = avM[1];
  } else {
    doc.name = doc.page_title ? doc.page_title.split(' — ')[0] : '';
    // Extract base64 photo
    const photoM = html.match(/src="data:image\/jpeg;base64,([^"]+)"/);
    if (photoM) doc.photo_data = photoM[1];
  }

  // Parse info fields
  doc.fields = {};
  const cardRx = /<p class="info-label">([^<]+)<\/p>\s*<p class="info-value"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = cardRx.exec(html)) !== null) {
    const label = m[1].trim();
    const value = m[2]
      .replace(/<\/span>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n+/g, '\n')
      .trim();
    doc.fields[label] = value;
  }

  return doc;
}

function parseIndexCards() {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const cards = {};
  const rx = /<a class="doctor-card([^"]*)"[^>]*href="doctor-([^"]+)\.html"[^>]*>\s*<div class="avatar">([^<]*)<\/div>\s*<div class="doctor-info">\s*<div class="doctor-name">([^<]+)<\/div>\s*<div class="doctor-spec">([^<]+)<\/div>/g;
  let m;
  let order = 0;
  while ((m = rx.exec(html)) !== null) {
    cards[m[2]] = {
      card_initials: m[3],
      card_name: m[4],
      card_spec: m[5],
      no_photo: m[1].includes('no-photo'),
      sort_order: order++
    };
  }
  return cards;
}

function parseClinicMeta() {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const nameM = html.match(/<div class="clinic-name">([^<]+)<\/div>/);
  const subM  = html.match(/<div class="clinic-sub">([^<]+)<\/div>/);
  return {
    clinic_name: nameM?.[1] ?? 'Sadaf Dental Clinic',
    clinic_sub:  subM?.[1]  ?? 'Наши специалисты — Ташкент'
  };
}

async function migrate() {
  console.log('Starting migration to Supabase...\n');

  // Parse index cards for ordering info
  const indexCards = parseIndexCards();
  const clinicMeta = parseClinicMeta();

  // Upsert clinic info
  console.log('Upserting clinic info...');
  for (const [key, value] of Object.entries(clinicMeta)) {
    const { error } = await supabase.from('clinic_info').upsert({ key, value });
    if (error) console.error(`  clinic_info error: ${error.message}`);
    else console.log(`  ✓ ${key}: ${value}`);
  }

  // Parse and upsert each doctor
  const slugs = getDoctorSlugs();
  console.log(`\nMigrating ${slugs.length} doctors...\n`);

  for (const slug of slugs) {
    try {
      const doc = parseDoctorFile(slug);
      const card = indexCards[slug] || {};

      const row = {
        slug:          doc.slug,
        page_title:    doc.page_title   || null,
        name:          doc.name         || null,
        hero_subtitle: doc.hero_subtitle || null,
        initials:      doc.initials     || null,
        has_photo:     doc.has_photo    || false,
        photo_data:    doc.photo_data   || null,
        fields:        doc.fields       || {},
        card_name:     card.card_name   || doc.name || null,
        card_spec:     card.card_spec   || null,
        card_initials: card.card_initials || doc.initials || null,
        no_photo:      card.no_photo    || false,
        sort_order:    card.sort_order  || 0
      };

      const { error } = await supabase.from('doctors').upsert(row);
      if (error) {
        console.error(`  ✗ ${slug}: ${error.message}`);
      } else {
        const photoStr = doc.has_photo ? '📷 photo' : '○ no-photo';
        console.log(`  ✓ ${slug} (${photoStr})`);
      }
    } catch (e) {
      console.error(`  ✗ ${slug}: ${e.message}`);
    }
  }

  console.log('\nMigration complete!');
}

migrate().catch(console.error);
