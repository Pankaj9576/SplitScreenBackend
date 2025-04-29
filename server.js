const cors = require('cors');
const fetch = require('node-fetch');
const url = require('url');

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
        let { url: targetUrl } = req.query;

        if (!targetUrl) {
          console.log('Missing URL parameter');
          res.status(400).json({ error: 'URL parameter is required' });
          return;
        }

        // Resolve relative URLs
        try {
          targetUrl = new URL(targetUrl, 'https://patents.google.com').toString();
        } catch (e) {
          console.log(`Invalid URL: ${targetUrl}`);
          res.status(400).json({ error: 'Invalid URL' });
          return;
        }

        console.log(`Proxy GET request for URL: ${targetUrl}`);

        const fetchHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://patents.google.com/',
          'Connection': 'keep-alive',
        };
        console.log('Fetch headers:', fetchHeaders);

        let response;
        try {
          response = await fetch(targetUrl, { headers: fetchHeaders });
        } catch (fetchError) {
          console.error(`Fetch error: ${fetchError.message}`);
          res.status(500).json({ error: `Failed to fetch URL: ${fetchError.message}` });
          return;
        }

        console.log(`Fetch response status: ${response.status}`);
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Fetch failed: ${response.status} - ${errorText}`);
          res.status(response.status).json({ error: `Failed to fetch URL: ${response.statusText}` });
          return;
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');

        if (contentType.includes('text/html')) {
          let html;
          try {
            html = await response.text();
          } catch (textError) {
            console.error(`Error reading response text: ${textError.message}`);
            res.status(500).json({ error: `Error reading response: ${textError.message}` });
            return;
          }

          // Check if the response is a search page (contains "Google Patents" search form)
          if (html.includes('Google Patents') && html.includes('Search and read the full text of patents')) {
            console.log('Detected Google Patents search page, attempting PDF fallback');
            // Extract the patent number from the URL
            const patentNumberMatch = targetUrl.match(/patent\/([A-Z0-9]+)/);
            if (patentNumberMatch) {
              const patentNumber = patentNumberMatch[1];
              const pdfUrl = `https://patentimages.storage.googleapis.com/pdfs/${patentNumber}.pdf`;
              console.log(`Fetching PDF fallback: ${pdfUrl}`);
              try {
                response = await fetch(pdfUrl, { headers: fetchHeaders });
              } catch (pdfFetchError) {
                console.error(`PDF fetch error: ${pdfFetchError.message}`);
                res.status(500).json({ error: `Failed to fetch PDF: ${pdfFetchError.message}` });
                return;
              }

              if (!response.ok) {
                const pdfErrorText = await response.text();
                console.error(`PDF fetch failed: ${response.status} - ${pdfErrorText}`);
                res.status(response.status).json({ error: `Failed to fetch PDF: ${response.statusText}` });
                return;
              }

              const pdfContentType = response.headers.get('content-type') || 'application/pdf';
              res.setHeader('Content-Type', pdfContentType);
              res.setHeader('Content-Disposition', 'inline');
              response.body.pipe(res);
              return;
            } else {
              res.status(400).json({ error: 'Could not extract patent number for PDF fallback' });
              return;
            }
          }

          // Rewrite relative URLs to absolute URLs
          html = html.replace(
            /(href|src)="\/([^"]*)"/g,
            `$1="https://patents.google.com/$2"`
          );
          res.setHeader('Content-Type', 'text/html');
          res.send(html);
          return;
        }

        // Ensure non-HTML content is displayed inline
        res.setHeader('Content-Disposition', 'inline');
        response.body.pipe(res);
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