const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fetch = require('node-fetch');

const app = express();

// Configure CORS
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = ['https://projectbayslope.vercel.app', 'http://localhost:3000'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
app.use(express.json());

// Configure multer for in-memory storage
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

// Proxy endpoint
app.get('/proxy', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('URL parameter is required');
  }

  console.log(`Proxy GET request for URL: ${url}`);

  try {
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
  } catch (error) {
    console.error(`Error fetching URL ${url}:`, error.message);
    res.status(500).send(`Error fetching the URL: ${error.message}`);
  }
});

// File upload endpoint with .docx to HTML conversion
app.post('/upload', upload.single('file'), async (req, res) => {
  console.log(`Proxy POST upload with content type: ${req.headers['content-type']}, length: ${req.headers['content-length']}`);

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
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

// Export the app as a Vercel Function
module.exports = app;