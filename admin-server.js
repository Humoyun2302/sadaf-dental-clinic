if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config(); } catch (_) {}
}

const express = require('express');
const path    = require('path');
const https   = require('https');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 3001;
const DIR  = __dirname;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sadaf2024';
const NETLIFY_HOOK   = process.env.NETLIFY_HOOK_URL || 'https://api.netlify.com/build_hooks/6a3e7057fc5b5c00c28a3261';
const SUPABASE_URL   = process.env.SUPABASE_URL || '';
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.json({ limit: '50mb' }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// Serve admin.html at /admin
app.get('/admin', (req, res) => res.sendFile(path.join(DIR, 'admin.html')));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toPublic(row) {
  if (!row) return null;
  return {
    slug:         row.slug,
    pageTitle:    row.page_title,
    name:         row.name,
    heroSubtitle: row.hero_subtitle,
    initials:     row.initials,
    hasPhoto:     row.has_photo || false,
    fields:       row.fields || {}
  };
}

function fromPublic(body) {
  const updates = {};
  if (body.pageTitle    !== undefined) updates.page_title    = body.pageTitle;
  if (body.name         !== undefined) updates.name          = body.name;
  if (body.heroSubtitle !== undefined) updates.hero_subtitle = body.heroSubtitle;
  if (body.initials     !== undefined) updates.initials      = body.initials;
  if (body.hasPhoto     !== undefined) updates.has_photo     = body.hasPhoto;
  if (body.photoData    !== undefined) updates.photo_data    = body.photoData;
  if (body.fields       !== undefined) updates.fields        = body.fields;
  return updates;
}

// ─── Doctor API ───────────────────────────────────────────────────────────────

app.get('/api/doctors', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('doctors').select('*').order('sort_order').order('slug');
    if (error) throw error;
    res.json((data || []).map(toPublic));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/doctors/:slug', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('doctors').select('*').eq('slug', req.params.slug).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Doctor not found' });
    res.json(toPublic(data));
  } catch (e) { res.status(404).json({ error: e.message }); }
});

app.put('/api/doctors/:slug', async (req, res) => {
  try {
    const updates = fromPublic(req.body);
    const { error } = await supabase
      .from('doctors').update(updates).eq('slug', req.params.slug);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/doctors', async (req, res) => {
  try {
    const { slug, ...rest } = req.body;
    if (!slug || !/^[a-z0-9-]+$/.test(slug))
      return res.status(400).json({ error: 'Slug must be lowercase letters, numbers, hyphens only' });

    const row = { slug, ...fromPublic(rest) };
    const { error } = await supabase.from('doctors').insert([row]);
    if (error) {
      if (error.code === '23505')
        return res.status(409).json({ error: 'A doctor with this slug already exists' });
      throw error;
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/doctors/:slug', async (req, res) => {
  try {
    const { error } = await supabase
      .from('doctors').delete().eq('slug', req.params.slug);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Index Page Meta API ──────────────────────────────────────────────────────

app.get('/api/index-meta', async (req, res) => {
  try {
    const { data } = await supabase.from('clinic_info').select('*');
    const info = {};
    (data || []).forEach(r => { info[r.key] = r.value; });
    res.json({
      clinicName: info.clinic_name || 'Sadaf Dental Clinic',
      clinicSub:  info.clinic_sub  || 'Наши специалисты — Ташкент'
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/index-meta', async (req, res) => {
  try {
    const { clinicName, clinicSub } = req.body;
    const ops = [];
    if (clinicName !== undefined)
      ops.push(supabase.from('clinic_info').upsert({ key: 'clinic_name', value: clinicName }));
    if (clinicSub !== undefined)
      ops.push(supabase.from('clinic_info').upsert({ key: 'clinic_sub',  value: clinicSub }));
    const results = await Promise.all(ops);
    const err = results.find(r => r.error);
    if (err) throw err.error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Index Cards API ──────────────────────────────────────────────────────────

app.get('/api/index-cards', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('slug, card_name, card_spec, card_initials, no_photo, sort_order')
      .order('sort_order').order('slug');
    if (error) throw error;
    res.json((data || []).map(d => ({
      slug:    d.slug,
      name:    d.card_name,
      spec:    d.card_spec,
      initials: d.card_initials,
      noPhoto: d.no_photo || false,
      classes: d.no_photo ? 'no-photo' : ''
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/index-cards/:slug', async (req, res) => {
  try {
    const { name, spec, initials, noPhoto } = req.body;
    const { error } = await supabase.from('doctors').update({
      card_name:     name,
      card_spec:     spec,
      card_initials: initials,
      no_photo:      noPhoto
    }).eq('slug', req.params.slug);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/index-cards', async (req, res) => {
  try {
    const { slug, name, spec, initials, noPhoto } = req.body;
    const { error } = await supabase.from('doctors').update({
      card_name: name, card_spec: spec, card_initials: initials, no_photo: noPhoto
    }).eq('slug', slug);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/index-cards/:slug', async (req, res) => {
  res.json({ success: true }); // Handled by DELETE /api/doctors/:slug
});

// ─── Deploy API ───────────────────────────────────────────────────────────────

app.post('/api/deploy', async (req, res) => {
  const steps = [];
  try {
    if (!NETLIFY_HOOK) {
      return res.status(400).json({ error: 'NETLIFY_HOOK_URL not configured' });
    }

    await new Promise((resolve, reject) => {
      const hookReq = https.request(NETLIFY_HOOK, { method: 'POST' }, resolve);
      hookReq.on('error', reject);
      hookReq.end();
    });
    steps.push('Netlify build triggered — site will update in ~1 minute');
    res.json({ success: true, steps });
  } catch (e) {
    res.status(500).json({ error: e.message, steps });
  }
});

// ─── Startup ─────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Sadaf Admin Panel → http://localhost:${PORT}/admin`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log(`  Supabase: ${SUPABASE_URL ? '✓ connected' : '✗ not configured'}\n`);
  });
}

module.exports = app;
