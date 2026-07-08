const router   = require('express').Router();
const { protect }           = require('../middleware/auth');
const { upload, uploadToCloudinary } = require('../middleware/upload');

// POST /api/pdf-share/upload
// Accepts a PDF blob, uploads to Cloudinary, returns public URL
router.post('/upload', protect, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file received' });
    const cid    = req.user.company._id;
    const folder = `${String(cid)}/pdf-shares`;
    const result = await uploadToCloudinary(req.file.buffer, folder, 'raw');
    res.json({ success: true, url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    console.error('[PDF-SHARE]', err.message);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

module.exports = router;
