const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fetch = require('node-fetch');

const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = ['https://projectbayslope.vercel.app', 'http://localhost:3000'];
    console.log(`CORS origin check - Origin: ${origin}`);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
});

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
  limits: { fileSize: 20 * 1024 * 1024 },
});

module.exports = (req, res) => {
  console.log(`Received request: ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    corsMiddleware(req, res, () => {
      res.status(200)
        .setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
        .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        .setHeader('Access-Control-Allow-Headers', 'Content-Type');
      console.log('OPTIONS response sent');
      res.end();
    });
    return;
  }

  corsMiddleware(req, res, async () => {
    try {
      const path = req.url.split('?')[0];

      if (req.method === 'GET' && path === '/api/proxy') {
        const { url } = req.query;

        if (!url) {
          console.log('Missing URL parameter');
          res.status(400).json({ error: 'URL parameter is required' });
          return;
        }

        console.log(`Proxy GET request for URL: ${url}`);

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch URL: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');

        if (url.includes('patents.google.com')) {
          const html = await response.text();
          res.setHeader('Content-Type', 'text/html');
          res.send(html);
          return;
        }

        res.setHeader('Content-Disposition', 'inline');
        response.body.pipe(res);
        return;
      }

      if (req.method === 'POST' && path === '/api/upload') {
        console.log('Handling POST request for /api/upload');

        const uploadMiddleware = upload.single('file');
        uploadMiddleware(req, res, async (err) => {
          if (err) {
            console.log('Multer error:', err.message);
            res.status(400).json({ error: err.message });
            return;
          }

          try {
            if (!req.file) {
              console.log('No file uploaded');
              res.status(400).json({ error: 'No file uploaded' });
              return;
            }

            console.log(`File uploaded: ${req.file.originalname}, Type: ${req.file.mimetype}`);

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

      console.log(`Route not found: ${req.method} ${path}`);
      res.status(404).json({ error: 'Endpoint not found' });
    } catch (error) {
      console.error('Server error:', error.message);
      res.status(500).json({ error: `Server error: ${error.message}` });
    }
  });
};