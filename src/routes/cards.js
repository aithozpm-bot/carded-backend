const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { query } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
const router   = express.Router();
const MAX_CARDS = 5;
// New cards may use only these template indexes.
// Existing cards keep their current index, including hidden templates.
const SELECTABLE_TEMPLATE_INDEXES = new Set([0, 4, 5, 10, 11, 13]);

function parseTemplateIndex(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}

// ─── Multer config — store in /tmp (Vercel compatible) ───────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = '/tmp/carded-uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
      console.log("MIME TYPE:", file.mimetype);
  console.log("ORIGINAL NAME:", file.originalname);
  cb(null, true); // temporarily allow all
  },
});

// ─── Row → API shape ──────────────────────────────────────────
function toCard(row) {
  return {
    id:            row.id,
    nickname:      row.nickname,
    name:          row.name,
    designation:   row.designation,
    company:       row.company,
    email1:        row.email1,
    email2:        row.email2,
    phone1:        row.phone1,
    phone2:        row.phone2,
    website:       row.website,
    address:       row.address,
    templateIndex: row.template_index,
    photoUrl:      row.photo_url || '',
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

router.use(authMiddleware);

// ─── GET /cards ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM cards WHERE user_id = $1 ORDER BY created_at ASC',
      [req.userId]
    );
    return res.json({ success: true, cards: result.rows.map(toCard) });
  } catch (err) {
    console.error('Get cards:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── GET /cards/:id ───────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM cards WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Card not found' });
    return res.json({ success: true, card: toCard(result.rows[0]) });
  } catch (err) {
    console.error('Get card:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── POST /cards ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const countRes = await query('SELECT COUNT(*) FROM cards WHERE user_id = $1', [req.userId]);
    if (parseInt(countRes.rows[0].count) >= MAX_CARDS) {
      return res.status(403).json({ success: false, message: `Card limit reached. Maximum ${MAX_CARDS} cards allowed.` });
    }

    const { nickname, name, designation, company, email1, email2,
            phone1, phone2, website, address, templateIndex, photoUrl } = req.body;

    if (!name || !designation || !company || !email1 || !phone1) {
      return res.status(400).json({ success: false, message: 'Required: name, designation, company, email1, phone1' });
    }

    const parsedTemplate = parseTemplateIndex(templateIndex);
    const chosenTemplate = parsedTemplate === null ? 0 : parsedTemplate;
    if (chosenTemplate === undefined || !SELECTABLE_TEMPLATE_INDEXES.has(chosenTemplate)) {
      return res.status(400).json({ success: false, message: 'This template is no longer available.' });
    }

    const result = await query(
      `INSERT INTO cards
         (user_id, nickname, name, designation, company,
          email1, email2, phone1, phone2, website, address, template_index, photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [req.userId, nickname || name, name, designation, company,
       email1, email2 || '', phone1, phone2 || '', website || '', address || '',
       chosenTemplate, photoUrl || '']
    );
    return res.status(201).json({ success: true, card: toCard(result.rows[0]) });
  } catch (err) {
    console.error('Create card:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── PUT /cards/:id ───────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const existing = await query(
      'SELECT id, template_index FROM cards WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ success: false, message: 'Card not found' });

    const { nickname, name, designation, company, email1, email2,
            phone1, phone2, website, address, templateIndex, photoUrl } = req.body;

    const requestedTemplate = parseTemplateIndex(templateIndex);
    const currentTemplate = existing.rows[0].template_index;
    if (requestedTemplate === undefined ||
        (requestedTemplate !== null &&
         !SELECTABLE_TEMPLATE_INDEXES.has(requestedTemplate) &&
         requestedTemplate !== currentTemplate)) {
      return res.status(400).json({ success: false, message: 'This template is no longer available.' });
    }

    const result = await query(
      `UPDATE cards SET
         nickname       = COALESCE($1,  nickname),
         name           = COALESCE($2,  name),
         designation    = COALESCE($3,  designation),
         company        = COALESCE($4,  company),
         email1         = COALESCE($5,  email1),
         email2         = COALESCE($6,  email2),
         phone1         = COALESCE($7,  phone1),
         phone2         = COALESCE($8,  phone2),
         website        = COALESCE($9,  website),
         address        = COALESCE($10, address),
         template_index = COALESCE($11, template_index),
         photo_url      = COALESCE($12, photo_url)
       WHERE id = $13 AND user_id = $14
       RETURNING *`,
      [nickname, name, designation, company, email1, email2,
       phone1, phone2, website, address, templateIndex, photoUrl,
       req.params.id, req.userId]
    );
    return res.json({ success: true, card: toCard(result.rows[0]) });
  } catch (err) {
    console.error('Update card:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /cards/:id/photo
router.post('/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    // Verify ownership
    const existing = await query(
      'SELECT id FROM cards WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Card not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo uploaded' });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'carded/profile-photos',
      public_id: `card_${req.params.id}`,
      overwrite: true,
      resource_type: 'image'
    });

    const photoUrl = result.secure_url;

    // Save URL in DB
    await query(
      'UPDATE cards SET photo_url = $1 WHERE id = $2 AND user_id = $3',
      [photoUrl, req.params.id, req.userId]
    );

    // Remove temp file
    fs.unlinkSync(req.file.path);

    return res.json({
      success: true,
      photoUrl
    });

  } catch (err) {
    console.error('Upload photo:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error'
    });
  }
});

// ─── GET /cards/:id/photo/file — serve uploaded photo ────────
router.get('/:id/photo/file', async (req, res) => {
  try {
    const filePath = (global.photoMap || {})[req.params.id];
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Photo not found' });
    }
    return res.sendFile(filePath);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── DELETE /cards/:id ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM cards WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Card not found' });
    return res.json({ success: true, message: 'Card deleted' });
  } catch (err) {
    console.error('Delete card:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;