const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fetch = require('node-fetch');

// CORS middleware
const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = ['https://projectbayslope-5lcf.vercel.app', 'http://localhost:3000'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
});

// Multer setup for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
    ];
    if (allowedTypes.includes(file.mimetype) || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

// Vercel Function handler
module.exports = async (req, res) => {
  // Apply CORS middleware
  corsMiddleware(req, res, async () => {
    try {
      // Handle /proxy endpoint (GET)
      if (req.method === 'GET' && req.path === '/proxy') {
        const { url } = req.query;

        if (!url) {
          res.status(400).send('URL parameter is required');
          return;
        }

        console.log(`Proxy GET request for URL: ${url}`);

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch URL: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');

        console.log(`Content-Type: ${contentType}`);
        response.body.pipe(res);
        return;
      }

      // Handle /upload endpoint (POST)
      if (req.method === 'POST' && req.path === '/upload') {
        const uploadMiddleware = upload.single('file');
        uploadMiddleware(req, res, async (err) => {
          if (err) {
            res.status(400).json({ error: err.message });
            return;
          }

          try {
            if (!req.file) {
              res.status(400).json({ error: 'No file uploaded' });
              return;
            }

            res.setHeader('Content-Disposition', `inline; filename="${req.file.originalname}"`);
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');

            if (req.file.mimetype.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
              const { value: html } = await mammoth.convertToHtml({ buffer: req.file.buffer });
              res.setHeader('Content-Type', 'text/html');
              res.send(html);
            } else {
              res.setHeader('Content-Type', req.file.mimetype);
              res.send(req.file.buffer);
            }
          } catch (error) {
            console.error('Error processing file:', error.message);
            res.status(500).json({ error: error.message });
          }
        });
        return;
      }

      // If the route doesn't match
      res.status(404).send('Endpoint not found');
    } catch (error) {
      console.error('Server error:', error.message);
      res.status(500).send(`Server error: ${error.message}`);
    }
  });
};