const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');

(async () => {
  const { default: fetch } = await import('node-fetch');
  const app = express();
  const port = process.env.PORT || 5001;

  // Configure CORS to allow multiple origins
  const corsOptions = {
    origin: (origin, callback) => {
      const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  };
  app.use(cors(corsOptions));

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

  // Proxy endpoint with CORS proxy and logging
  app.get('/proxy', async (req, res) => {
    const { url } = req.query;

    if (!url) {
      return res.status(400).send('URL parameter is required');
    }

    console.log(`Proxy GET request for URL: ${url}`);

    try {
      const proxyUrl = url.includes('insight.rpxcorp.com')
        ? `https://cors-anywhere.herokuapp.com/${url}`
        : url;

      const response = await fetch(proxyUrl, {
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
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin); // Dynamic CORS header

      console.log(`Content-Type: ${contentType}`);

      if (contentType.includes('text/html')) {
        const browser = await puppeteer.launch({
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          headless: 'new',
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.goto(proxyUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await page.waitForFunction('window.performance && window.performance.timing.loadEventEnd > 0', { timeout: 30000 });
        const content = await page.content();
        await browser.close();
        res.send(content);
      } else if (
        contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      ) {
        const arrayBuffer = await response.buffer();
        const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } else {
        response.body.pipe(res);
      }
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
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin); // Dynamic CORS header

      if (
        req.file.mimetype.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      ) {
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

  app.listen(port, () => {
    console.log(`Proxy server running at http://localhost:${port}`);
  });
})();