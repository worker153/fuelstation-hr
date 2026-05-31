const Branch = require('../models/Branch');
const Worker = require('../models/Worker');
const User   = require('../models/User');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');

// ─── Parse lat/lng from any Google Maps URL format ────────────────────────────
function parseMapsCoords(url) {
  const at  = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at)  return { lat: parseFloat(at[1]),  lng: parseFloat(at[2])  };
  const q   = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (q)   return { lat: parseFloat(q[1]),   lng: parseFloat(q[2])   };
  const ll  = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (ll)  return { lat: parseFloat(ll[1]),  lng: parseFloat(ll[2])  };
  const ctr = url.match(/center=(-?\d+\.\d+)[,%2C]+(-?\d+\.\d+)/);
  if (ctr) return { lat: parseFloat(ctr[1]), lng: parseFloat(ctr[2]) };
  return null;
}

// ─── Extract place name from Google Maps URL ──────────────────────────────────
function extractPlaceName(url) {
  // Strategy 1: /maps/place/Name (full desktop URLs)
  const m = url.match(/maps\/place\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]).replace(/\+/g, ' ').replace(/_/g, ' ').trim();

  // Strategy 2: ?q=address (short URLs like maps.app.goo.gl resolve to this format)
  // e.g. ?q=8HJV+4X2+Oando+Filling+Station,+Ekenhuan+Rd,+Benin+City
  const q = url.match(/[?&]q=([^&#]+)/);
  if (q) {
    const decoded = decodeURIComponent(q[1]).replace(/\+/g, ' ').trim();
    // Skip if it's raw lat,lng coordinates (handled by parseMapsCoords instead)
    if (!/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(decoded)) return decoded;
  }

  return '';
}

// ─── Forward geocode via Nominatim (free, no API key) ─────────────────────────
async function nominatimGeocode(placeName) {
  // Strip leading Plus Code — may be "8HJV+4X2 " or "8HJV 4X2 " (+ decoded to space)
  const stripped = placeName.replace(/^[23456789CFGHJMPQRVWX]{2,8}[+ ][23456789CFGHJMPQRVWX]{2,3}\s+/i, '').trim();
  const nameToUse = stripped || placeName;

  const parts = nameToUse.split(',').map(s => s.trim()).filter(Boolean);

  // Build progressively simpler queries
  const queries = new Set();

  if (parts.length >= 2) {
    // Drop business name (first part) — most useful for Nigerian addresses
    queries.add(parts.slice(1).join(', '));
    // Road name only (strip leading house number like "300 ")
    const roadRaw = parts[1] || '';
    const road    = roadRaw.replace(/^\d+\s+/, '');
    if (road && road !== roadRaw) {
      if (parts.length >= 3) queries.add(`${road}, ${parts.slice(2).join(', ')}`);
      if (parts.length >= 4) queries.add(`${road}, ${parts[parts.length - 2]}, ${parts[parts.length - 1]}`);
    }
    // Last N parts (city + state most likely to be in OSM)
    if (parts.length >= 3) queries.add(parts.slice(-3).join(', '));
    queries.add(parts.slice(-2).join(', '));        // ← "Benin City 300104, Edo" — reliably found
    queries.add(parts[parts.length - 1].trim());   // just the state/country
  }
  queries.add(nameToUse); // full stripped name
  queries.add(placeName); // original full name — last resort

  for (const q of queries) {
    if (!q || q.length < 4) continue;
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'FuelStationHR/1.0', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(6000) }
      );
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), addr: data[0].display_name };
      }
    } catch { /* try next */ }
  }
  return null;
}

// ─── POST /api/branches/resolve-url ──────────────────────────────────────────
const resolveMapsUrl = async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'URL is required' });

  // Strip trailing punctuation
  let cleanUrl = url.trim().replace(/[?&#]+$/, '');
  // For maps.app.goo.gl short URLs, strip query params entirely —
  // ?g_st=ic and similar tracking params cause server-side redirects to fail
  if (/maps\.app\.goo\.gl/i.test(cleanUrl)) {
    cleanUrl = cleanUrl.split('?')[0];
  }

  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);

    // Follow the full redirect chain — native fetch handles the whole chain
    const response = await fetch(cleanUrl, {
      method:   'GET',
      redirect: 'follow',
      signal:   ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
    });
    clearTimeout(timer);
    // Discard body to free the connection immediately (we only need response.url)
    response.body?.cancel().catch(() => {});

    const finalUrl  = response.url;
    const placeName = extractPlaceName(finalUrl);
    console.log(`[resolveMapsUrl] Input: ${cleanUrl}`);
    console.log(`[resolveMapsUrl] Final: ${finalUrl.slice(0, 100)}`);
    console.log(`[resolveMapsUrl] Place: ${placeName.slice(0, 80)}`);

    // ── Strategy 1: coordinates embedded in the URL (@lat,lng) ───────────────
    const urlCoords = parseMapsCoords(finalUrl);
    if (urlCoords) {
      return res.json({
        success: true,
        data: { lat: urlCoords.lat, lng: urlCoords.lng, address: placeName, url: finalUrl }
      });
    }

    // ── Strategy 2: forward geocode place name via Nominatim ─────────────────
    if (placeName) {
      const geo = await nominatimGeocode(placeName);
      if (geo) {
        return res.json({
          success: true,
          data: {
            lat:     geo.lat,
            lng:     geo.lng,
            address: placeName,   // use Google's address (more specific than Nominatim's)
            url:     finalUrl,
            geocodeNote: 'Coordinates are approximate — from nearest matching road/area',
          }
        });
      }

      // Place name extracted but no geocode match — return address without coords
      return res.json({
        success: true,
        data: { address: placeName, url: finalUrl, coordsNotFound: true }
      });
    }

    // ── Strategy 3: nothing worked ────────────────────────────────────────────
    return res.status(422).json({
      success: false,
      message: 'Could not extract coordinates. Try copying the link from Google Maps → Share → Copy link.'
    });

  } catch (err) {
    console.error('[resolveMapsUrl] Error:', err.name, err.message);
    const msg = err.name === 'AbortError'
      ? 'Request timed out — check the server internet connection.'
      : `Could not resolve the URL (${err.message}). Please paste a full Google Maps link.`;
    return res.status(500).json({ success: false, message: msg });
  }
};

// ─── GET /api/branches ────────────────────────────────────────────────────────
const getBranches = async (req, res) => {
  const cid      = req.user.company._id;
  const { all }  = req.query;                 // ?all=1 → include inactive

  const filter = { company: cid };
  if (!all) filter.isActive = true;

  const branches = await Branch.find(filter)
    .populate('manager', 'name email role')
    .populate('createdBy', 'name')
    .sort({ isActive: -1, name: 1 });

  // Attach active-worker counts per branch
  const counts = await Worker.aggregate([
    { $match: { company: cid, employmentStatus: 'active' } },
    { $group: { _id: '$branchId', count: { $sum: 1 } } }
  ]);
  const countMap = {};
  counts.forEach(c => { if (c._id) countMap[c._id.toString()] = c.count; });

  const data = branches.map(b => ({
    ...b.toObject(),
    activeWorkerCount: countMap[b._id.toString()] || 0
  }));

  res.json({ success: true, data });
};

// ─── GET /api/branches/:id ────────────────────────────────────────────────────
const getBranch = async (req, res) => {
  const branch = await Branch.findOne({ _id: req.params.id, company: req.user.company._id })
    .populate('manager', 'name email role');
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
  res.json({ success: true, data: branch });
};

// ─── POST /api/branches ───────────────────────────────────────────────────────
const createBranch = async (req, res) => {
  const { name, address, location, phone, managerId } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ success: false, message: 'Branch name is required' });
  }

  // Validate manager belongs to this company
  if (managerId) {
    const mgr = await User.findOne({ _id: managerId, 'company': req.user.company._id });
    if (!mgr) return res.status(400).json({ success: false, message: 'Manager not found in this company' });
  }

  const branch = await Branch.create({
    company:   req.user.company._id,
    name:      name.trim(),
    address:   address?.trim(),
    location:  location || undefined,
    phone:     phone?.trim(),
    manager:   managerId || undefined,
    createdBy: req.user._id,
    attendanceSettings:  req.body.attendanceSettings  || undefined,
    attendanceRules:     req.body.attendanceRules     || undefined,
    personalPhoneRadius: req.body.personalPhoneRadius != null
      ? Number(req.body.personalPhoneRadius) : undefined,
  });

  await branch.populate('manager', 'name email role');
  res.status(201).json({ success: true, data: { ...branch.toObject(), activeWorkerCount: 0 } });
};

// ─── PUT /api/branches/:id ────────────────────────────────────────────────────
const updateBranch = async (req, res) => {
  const branch = await Branch.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });

  const { name, address, location, phone, managerId, isActive } = req.body;

  if (name     !== undefined) branch.name     = name.trim();
  if (address  !== undefined) branch.address  = address?.trim();
  if (location !== undefined) branch.location = location;
  if (phone    !== undefined) branch.phone    = phone?.trim();
  if (isActive !== undefined) branch.isActive = isActive;

  if (managerId !== undefined) {
    if (managerId === null || managerId === '') {
      branch.manager = undefined;
    } else {
      const mgr = await User.findOne({ _id: managerId, company: req.user.company._id });
      if (!mgr) return res.status(400).json({ success: false, message: 'Manager not found' });
      branch.manager = managerId;
    }
  }

  if (req.body.attendanceSettings) {
    branch.attendanceSettings = {
      ...(branch.attendanceSettings?.toObject?.() || {}),
      ...req.body.attendanceSettings,
    };
  }
  if (req.body.attendanceRules !== undefined) {
    branch.attendanceRules = req.body.attendanceRules;
  }
  if (req.body.breakSettings) {
    const cur = branch.breakSettings?.toObject?.() || {};
    const inc = req.body.breakSettings;
    // Deep-merge each break type
    branch.breakSettings = {
      morning:   { ...(cur.morning   || {}), ...(inc.morning   || {}) },
      afternoon: { ...(cur.afternoon || {}), ...(inc.afternoon || {}) },
      night:     { ...(cur.night     || {}), ...(inc.night     || {}) },
    };
    branch.markModified('breakSettings');
  }
  if (req.body.restroomSettings) {
    branch.restroomSettings = {
      ...(branch.restroomSettings?.toObject?.() || {}),
      ...req.body.restroomSettings,
    };
    branch.markModified('restroomSettings');
  }
  if (req.body.penaltyPresets) {
    branch.penaltyPresets = {
      ...(branch.penaltyPresets?.toObject?.() || {}),
      ...req.body.penaltyPresets,
    };
    branch.markModified('penaltyPresets');
  }
  if (req.body.salesShortageRule !== undefined) {
    branch.salesShortageRule = {
      ...(branch.salesShortageRule?.toObject?.() || {}),
      ...req.body.salesShortageRule,
    };
    branch.markModified('salesShortageRule');
  }
  if (req.body.personalPhoneRadius != null) {
    branch.personalPhoneRadius = Number(req.body.personalPhoneRadius);
  }

  await branch.save();
  await branch.populate('manager', 'name email role');

  // Attach worker count
  const activeCount = await Worker.countDocuments({
    company: req.user.company._id,
    branchId: branch._id,
    employmentStatus: 'active'
  });

  res.json({ success: true, data: { ...branch.toObject(), activeWorkerCount: activeCount } });
};

// ─── DELETE /api/branches/:id  (soft-deactivate) ─────────────────────────────
const deactivateBranch = async (req, res) => {
  const branch = await Branch.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });

  branch.isActive = !branch.isActive;
  await branch.save();
  res.json({
    success: true,
    message: `Branch ${branch.isActive ? 'activated' : 'deactivated'}`,
    data: branch
  });
};

// ─── POST /api/branches/:id/photo  (upload station picture) ──────────────────
const uploadBranchPhoto = async (req, res) => {
  const branch = await Branch.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  // Delete old photo from Cloudinary if it exists
  if (branch.photo?.publicId) {
    await deleteFromCloudinary(branch.photo.publicId).catch(() => {});
  }

  const result = await uploadToCloudinary(
    req.file.buffer,
    `${req.user.company._id}/branches/photos`,
    'image'
  );

  branch.photo = { url: result.secure_url, publicId: result.public_id };
  await branch.save();

  res.json({ success: true, data: { url: branch.photo.url, publicId: branch.photo.publicId } });
};

// ─── DELETE /api/branches/:id/photo  (remove station picture) ────────────────
const deleteBranchPhoto = async (req, res) => {
  const branch = await Branch.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });

  if (branch.photo?.publicId) {
    await deleteFromCloudinary(branch.photo.publicId).catch(() => {});
  }
  branch.photo = undefined;
  await branch.save();
  res.json({ success: true });
};

module.exports = { getBranches, getBranch, createBranch, updateBranch, deactivateBranch, resolveMapsUrl, uploadBranchPhoto, deleteBranchPhoto };
