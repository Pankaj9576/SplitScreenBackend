const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const url = require("url");
const cheerio = require("cheerio");

const app = express();

const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = ["https://frontendsplitscreen.vercel.app", "http://localhost:3000"];
    console.log(`CORS origin check - Origin: ${origin}`);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS warning - Origin not allowed: ${origin}`);
      callback(null, false);
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true,
});

app.use(corsMiddleware);

app.options("*", (req, res) => {
  res
    .status(200)
    .setHeader("Access-Control-Allow-Origin", req.headers.origin || "*")
    .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type")
    .end();
});

app.get("/api/proxy", async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: "URL parameter is required" });
  }

  targetUrl = decodeURIComponent(targetUrl);

  if (targetUrl.includes("/api/proxy?url=")) {
    const urlMatch = targetUrl.match(/url=([^&]+)/);
    if (urlMatch) {
      targetUrl = decodeURIComponent(urlMatch[1]);
    }
  }

  try {
    new URL(targetUrl);
  } catch (e) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  console.log(`Proxy GET request for URL: ${targetUrl}`);

  const fetchHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    Referer: "https://patents.google.com/",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  };

  try {
    const response = await fetch(targetUrl, { headers: fetchHeaders, redirect: "follow" });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Fetch failed: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ error: `Failed to fetch URL: ${response.statusText}` });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");

    if (contentType.includes("text/html")) {
      let html = await response.text();
      const baseUrl = new URL(targetUrl).origin;

      if (targetUrl.includes("patents.google.com/patent")) {
        const $ = cheerio.load(html);

        // Extract key elements with improved selectors and fallbacks
        const patentNumber = $('h2#pubnum').text().trim() || $('h3#pubnum').text().trim() || targetUrl.split('/').pop();
        const title = $('h1#title').text().trim() || $('title').text().trim().replace(' - Google Patents', '') || "Patent Title Not Available";
        const abstract = $('abstract').text().trim() || $('section[itemprop="abstract"]').text().trim() || "Abstract not available.";
        const inventor = $('dd[itemprop="inventor"]').map((i, el) => $(el).text().trim()).get().join(", ") || "N/A";
        const assignee = $('dd[itemprop="assigneeCurrent"]').text().trim() || $('dd[itemprop="assignee"]').text().trim() || "N/A";
        const applicationNumber = $('dd[itemprop="applicationNumber"]').text().trim() || "N/A";
        const filingDate = $('time[itemprop="filingDate"]').text().trim() || "N/A";
        const publicationDate = $('time[itemprop="publicationDate"]').text().trim() || "N/A";
        const grantDate = $('time[itemprop="publicationDate"]').next('time').text().trim() || $('time[itemprop="grantDate"]').text().trim() || "N/A";
        const status = $('span[itemprop="status"]').text().trim() || "N/A";
        const priorityDate = $('time[itemprop="priorityDate"]').text().trim() || "N/A";
        const images = $('img[itemprop="thumbnail"]').map((i, el) => {
          const src = $(el).attr('src');
          return src ? (src.startsWith('http') ? src : `${baseUrl}${src}`) : null;
        }).get().filter(Boolean);
        const classifications = $('[itemprop="classifications"] div, [itemprop="classifications"] span').map((i, el) => $(el).text().trim()).get().filter(text => text);
        const description = $('section[itemprop="description"]').html() || $('div.description').html() || "<p>Description not available.</p>";
        const claims = $('section[itemprop="claims"]').html() || $('div.claims').html() || "<p>Claims not available.</p>";
        const citations = $('tr[itemprop="backwardReferences"]').map((i, el) => {
          const patent = $(el).find('td[itemprop="publicationNumber"]').text().trim();
          const date = $(el).find('time[itemprop="publicationDate"]').text().trim();
          const link = $(el).find('a').attr('href') || '#';
          return `<li><a href="${link}" onclick="window.parent.postMessage({type: 'linkClick', url: '${link}'}, '*'); return false;">${patent} (${date})</a></li>`;
        }).get().join('');

        // Build custom HTML structure with enhanced design
        let customHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${patentNumber} - Patent Viewer</title>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Product+Sans:400,700&display=swap">
            <style>
              body {
                margin: 0;
                padding: 0;
                font-family: 'Roboto', Arial, sans-serif;
                color: #1a1a1a;
                line-height: 1.6;
                background: #f5f5f5;
              }
              a {
                color: #0066cc;
                text-decoration: none;
                transition: color 0.3s ease;
              }
              a:hover {
                color: #0033a0;
                text-decoration: underline;
              }
              .container {
                max-width: 1400px;
                margin: 0 auto;
                padding: 24px;
                background: #fff;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
                margin-top: 20px;
                margin-bottom: 20px;
              }
              .header {
                font-family: 'Product Sans', 'Roboto', Arial, sans-serif;
                font-size: 28px;
                font-weight: 500;
                color: #1a1a1a;
                margin-bottom: 24px;
                border-bottom: 2px solid #0066cc;
                padding-bottom: 8px;
              }
              .layout {
                display: flex;
                flex-direction: row;
                gap: 40px;
              }
              .main-content {
                flex: 3;
                max-width: 70%;
              }
              .sidebar {
                flex: 1;
                max-width: 30%;
                padding: 24px;
                background: #fafafa;
                border-radius: 10px;
                border: 1px solid #e0e0e0;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
              }
              .section {
                margin-bottom: 32px;
                padding: 16px;
                background: #fff;
                border-radius: 8px;
                transition: box-shadow 0.3s ease;
              }
              .section:hover {
                box-shadow: 0 2px 15px rgba(0, 0, 0, 0.1);
              }
              .section h2 {
                font-family: 'Product Sans', 'Roboto', Arial, sans-serif;
                font-size: 20px;
                font-weight: 500;
                color: #1a1a1a;
                margin-bottom: 16px;
                border-left: 4px solid #0066cc;
                padding-left: 12px;
              }
              .abstract {
                font-size: 15px;
                color: #4a4a4a;
                background: #f9f9f9;
                padding: 16px;
                border-radius: 6px;
              }
              .image-slider {
                position: relative;
                width: 100%;
                max-height: 400px; /* Limit the height of the slider */
                overflow: hidden;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
              }
              .image-container {
                display: flex;
                transition: transform 0.5s ease-in-out;
                width: 100%;
                height: 100%;
              }
              .image-container img {
                width: 100%;
                max-height: 400px; /* Limit image height */
                object-fit: contain; /* Ensure image fits without distortion */
                flex-shrink: 0;
                border-radius: 8px;
                background: #f0f0f0; /* Background for images with transparency */
              }
              .slider-nav {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                background: rgba(0, 0, 0, 0.5);
                color: white;
                border: none;
                padding: 10px;
                cursor: pointer;
                font-size: 18px;
                border-radius: 50%;
                transition: background 0.3s ease;
              }
              .slider-nav:hover {
                background: rgba(0, 0, 0, 0.8);
              }
              .prev {
                left: 10px;
              }
              .next {
                right: 10px;
              }
              .classifications div {
                font-size: 14px;
                color: #4a4a4a;
                margin-bottom: 10px;
                padding: 8px;
                background: #f0f4f8;
                border-radius: 4px;
              }
              .description, .claims {
                font-size: 15px;
                color: #4a4a4a;
              }
              .description p, .claims p {
                margin-bottom: 12px;
              }
              .citations ul {
                list-style: none;
                padding: 0;
                font-size: 14px;
                color: #4a4a4a;
              }
              .citations li {
                margin-bottom: 10px;
                padding: 8px;
                background: #f0f4f8;
                border-radius: 4px;
                transition: background 0.3s ease;
              }
              .citations li:hover {
                background: #e8eef4;
              }
              .metadata {
                font-size: 14px;
                color: #4a4a4a;
                margin-bottom: 20px;
              }
              .metadata div {
                margin-bottom: 12px;
                padding: 8px;
                border-left: 2px solid #0066cc;
                background: #f9f9f9;
                border-radius: 4px;
              }
              .metadata strong {
                font-weight: 500;
                color: #1a1a1a;
              }
              .action-buttons {
                display: flex;
                gap: 12px;
                margin-bottom: 20px;
                flex-wrap: wrap;
              }
              .action-buttons button {
                background: #0066cc;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-family: 'Roboto', Arial, sans-serif;
                font-weight: 500;
                transition: background 0.3s ease, transform 0.2s ease, box-shadow 0.3s ease;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              }
              .action-buttons button:hover {
                background: #0033a0;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
              }
              .action-buttons button:active {
                transform: translateY(0);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              }
              .patent-header {
                background: linear-gradient(90deg, #0066cc, #0033a0);
                color: white;
                padding: 12px 20px;
                font-size: 16px;
                font-family: 'Product Sans', 'Roboto', Arial, sans-serif;
                font-weight: 500;
                margin-bottom: 16px;
                border-radius: 6px;
                text-align: center;
              }
              .status-active {
                color: #2e7d32;
                font-weight: 500;
                background: #e8f5e9;
                padding: 4px 8px;
                border-radius: 12px;
                display: inline-block;
              }
              /* Responsive Design */
              @media (max-width: 1024px) {
                .layout {
                  flex-direction: column;
                }
                .main-content, .sidebar {
                  max-width: 100%;
                }
                .image-slider {
                  max-height: 300px;
                }
                .image-container img {
                  max-height: 300px;
                }
              }
              @media (max-width: 768px) {
                .container {
                  padding: 16px;
                }
                .header {
                  font-size: 24px;
                }
                .section h2 {
                  font-size: 18px;
                }
                .action-buttons button {
                  padding: 8px 16px;
                  font-size: 13px;
                }
                .image-slider {
                  max-height: 200px;
                }
                .image-container img {
                  max-height: 200px;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="header">${title}</h1>
              <div class="layout">
                <div class="main-content">
                  <div class="section abstract">
                    <h2>Abstract</h2>
                    <p>${abstract}</p>
                  </div>
                  <div class="section image-slider">
                    <h2>Images (${images.length})</h2>
                    <div class="image-container" id="imageContainer">
                      ${images.length > 0 ? images.map(src => `<img src="${src}" alt="Patent Image">`).join('') : '<p>No images available.</p>'}
                    </div>
                    ${images.length > 1 ? `
                      <button class="slider-nav prev" onclick="moveSlide(-1)">❮</button>
                      <button class="slider-nav next" onclick="moveSlide(1)">❯</button>
                    ` : ''}
                  </div>
                  <div class="section classifications">
                    <h2>Classifications</h2>
                    ${classifications.length > 0 ? classifications.map(cls => `<div>${cls}</div>`).join('') : '<p>No classifications available.</p>'}
                    <a href="${targetUrl}" onclick="window.parent.postMessage({type: 'linkClick', url: '${targetUrl}'}, '*'); return false;">View more classifications</a>
                  </div>
                  <div class="section description">
                    <h2>Description</h2>
                    ${description}
                  </div>
                  <div class="section claims">
                    <h2>Claims</h2>
                    ${claims}
                  </div>
                  <div class="section citations">
                    <h2>Citations</h2>
                    <ul>${citations || '<li>No citations available.</li>'}</ul>
                  </div>
                </div>
                <div class="sidebar">
                  <div class="patent-header">${patentNumber} United States</div>
                  <div class="action-buttons">
                    <button onclick="window.parent.postMessage({type: 'linkClick', url: '${targetUrl}/pdf'}, '*')">Download PDF</button>
                    <button onclick="window.parent.postMessage({type: 'linkClick', url: 'https://patents.google.com/xhr/query?url=pn%3D${patentNumber}%26priorart%3Dtrue'}, '*')">Find Prior Art</button>
                    <button onclick="window.parent.postMessage({type: 'linkClick', url: 'https://patents.google.com/xhr/query?url=pn%3D${patentNumber}%26similar%3Dtrue'}, '*')">Similar</button>
                  </div>
                  <div class="metadata">
                    <div><strong>Inventor:</strong> ${inventor}</div>
                    <div><strong>Current Assignee:</strong> ${assignee}</div>
                    <div><strong>Application:</strong> ${applicationNumber}</div>
                    <div><strong>Filing Date:</strong> ${filingDate}</div>
                    <div><strong>Priority Date:</strong> ${priorityDate}</div>
                    <div><strong>Publication Date:</strong> ${publicationDate}</div>
                    <div><strong>Grant Date:</strong> ${grantDate}</div>
                    <div><strong>Status:</strong> <span class="status-active">${status}</span></div>
                  </div>
                </div>
              </div>
            </div>
            <script>
              let currentSlide = 0;
              const slides = document.querySelectorAll('#imageContainer img');
              const totalSlides = slides.length;

              function moveSlide(direction) {
                currentSlide += direction;
                if (currentSlide < 0) {
                  currentSlide = totalSlides - 1;
                } else if (currentSlide >= totalSlides) {
                  currentSlide = 0;
                }
                const offset = -currentSlide * 100;
                document.querySelector('#imageContainer').style.transform = \`translateX(\${offset}%)\`;
              }

              if (totalSlides <= 1) {
                const prevButton = document.querySelector('.prev');
                const nextButton = document.querySelector('.next');
                if (prevButton) prevButton.style.display = 'none';
                if (nextButton) nextButton.style.display = 'none';
              }
            </script>
          </body>
          </html>
        `;
        res.send(customHtml);
      } else {
        const proxyBaseUrl = `https://${req.get("host")}`;
        html = html.replace(/(href|src)=(["'])(\/[^"']+)/g, `$1=$2${proxyBaseUrl}/api/proxy?url=${encodeURIComponent(baseUrl)}$3`);
        html = html.replace(/(href|src)=(["'])(https?:\/\/[^"']+)/g, (match, attr, quote, url) => {
          if (url.includes(proxyBaseUrl)) {
            return match;
          }
          return `${attr}=${quote}${proxyBaseUrl}/api/proxy?url=${encodeURIComponent(url)}`;
        });

        html = html.replace("<head>", `<head><base href="${baseUrl}/">`);

        html = html.replace(
          "<head>",
          `<head>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap">
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Product+Sans:400,700&display=swap">
          `
        );

        html = html.replace(
          "</body>",
          `
          <script>
            window.addEventListener('message', function(e) {
              if (e.data.type === 'linkClick') {
                window.parent.postMessage({ type: 'linkClick', url: e.data.url }, '*');
              }
            });

            document.addEventListener('click', function(e) {
              if (e.target.tagName === 'A' && e.target.href) {
                e.preventDefault();
                window.parent.postMessage({
                  type: 'linkClick',
                  url: e.target.href
                }, '*');
              }
            });
          </script>
          </body>
        `);

        res.send(html);
      }
    } else {
      res.setHeader("Content-Disposition", "inline");
      response.body.pipe(res);
    }
  } catch (error) {
    console.error("Proxy error:", error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});

module.exports = app;