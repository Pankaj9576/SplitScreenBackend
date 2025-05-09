const express = require("express");
const fetch = require("node-fetch");
const url = require("url");
const cheerio = require("cheerio");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();

// CORS middleware to handle all requests
app.use((req, res, next) => {
  const allowedOrigins = ["https://frontendsplitscreen.vercel.app", "http://localhost:3000"];
  const origin = req.headers.origin;

  // Log the origin for debugging
  console.log(`Request Origin: ${origin}`);

  // Set CORS headers for allowed origins
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    console.warn(`Origin not allowed: ${origin}`);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");

  // Handle preflight OPTIONS requests
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight request");
    return res.status(204).end();
  }

  next();
});

// Ensure JSON parsing for POST requests
app.use(express.json());

// In-memory user storage (replace with a database in production)
const users = [];

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, 'your_jwt_secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Signup endpoint
app.post("/api/signup", async (req, res) => {
  console.log("Signup request received:", req.body);
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ error: "User already exists" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { email, password: hashedPassword };
    users.push(user);

    const token = jwt.sign({ email: user.email }, 'your_jwt_secret', { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Server error during signup" });
  }
});

// Login endpoint
app.post("/api/login", async (req, res) => {
  console.log("Login request received:", req.body);
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(400).json({ error: "User not found" });
  }

  try {
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid password" });
    }

    const token = jwt.sign({ email: user.email }, 'your_jwt_secret', { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error during login" });
  }
});

// Google login endpoint
app.post("/api/google-login", (req, res) => {
  console.log("Google login request received:", req.body);
  const { email, googleId } = req.body;
  
  if (!email || !googleId) {
    return res.status(400).json({ error: "Email and Google ID are required" });
  }

  let user = users.find(u => u.email === email);
  if (!user) {
    user = { email, googleId };
    users.push(user);
  }

  const token = jwt.sign({ email: user.email }, 'your_jwt_secret', { expiresIn: '1h' });
  res.json({ token });
});

// Token verification endpoint
app.post("/api/verify-token", authenticateToken, (req, res) => {
  res.json({ valid: true });
});

// Proxy endpoint with authentication
app.get("/api/proxy", authenticateToken, async (req, res) => {
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

    if (contentType.includes("text/html")) {
      let html = await response.text();
      const baseUrl = new URL(targetUrl).origin;

      if (targetUrl.includes("patents.google.com/patent")) {
        const $ = cheerio.load(html);

        // Extract images for the slider
        const images = $('img[itemprop="thumbnail"]').map((i, el) => {
          const src = $(el).attr('src');
          return src ? (src.startsWith('http') ? src : `${baseUrl}${src}`) : null;
        }).get().filter(Boolean);

        // Inject CSS for the slider
        html = html.replace(
          "</head>",
          `
          <style>
            .image-slider {
              position: relative;
              width: 100%;
              max-height: 400px;
              overflow: hidden;
              margin-bottom: 24px;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            .image-container {
              display: flex;
              transition: transform 0.5s ease-in-out;
              width: 100%;
              height: 100%;
            }
            .image-container img {
              width: 100%;
              max-height: 400px;
              object-fit: contain;
              flex-shrink: 0;
              border-radius: 8px;
              background: #f0f0f0;
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
            @media (max-width: 1024px) {
              .image-slider {
                max-height: 300px;
              }
              .image-container img {
                max-height: 300px;
              }
            }
            @media (max-width: 768px) {
              .image-slider {
                max-height: 200px;
              }
              .image-container img {
                max-height: 200px;
              }
            }
          </style>
          </head>
        `
        );

        // Inject the image slider and JavaScript
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

            document.addEventListener('DOMContentLoaded', function() {
              const patentResult = document.querySelector('patent-result');
              if (patentResult) {
                const mainContent = patentResult.querySelector('section');
                const sidebar = patentResult.querySelector('#meta');
                if (mainContent && sidebar) {
                  mainContent.classList.add('main-content');
                  sidebar.classList.add('sidebar');

                  const layoutDiv = document.createElement('div');
                  layoutDiv.className = 'layout horizontal';
                  layoutDiv.appendChild(mainContent);
                  layoutDiv.appendChild(sidebar);
                  patentResult.insertBefore(layoutDiv, patentResult.firstChild);
                }

                // Replace images section with slider
                const imagesSection = document.querySelector('.images.style-scope.patent-result');
                if (imagesSection) {
                  imagesSection.innerHTML = '';
                  const sliderDiv = document.createElement('div');
                  sliderDiv.className = 'image-slider';
                  const imageContainer = document.createElement('div');
                  imageContainer.className = 'image-container';
                  imageContainer.id = 'imageContainer';
                  const imageUrls = ${JSON.stringify(images)};
                  imageUrls.forEach(url => {
                    const img = document.createElement('img');
                    img.src = url;
                    img.alt = 'Patent Image';
                    imageContainer.appendChild(img);
                  });
                  sliderDiv.appendChild(imageContainer);
                  if (imageUrls.length > 1) {
                    const prevButton = document.createElement('button');
                    prevButton.className = 'slider-nav prev';
                    prevButton.textContent = '❮';
                    prevButton.onclick = () => moveSlide(-1);
                    sliderDiv.appendChild(prevButton);

                    const nextButton = document.createElement('button');
                    nextButton.className = 'slider-nav next';
                    nextButton.textContent = '❯';
                    nextButton.onclick = () => moveSlide(1);
                    sliderDiv.appendChild(nextButton);
                  }
                  if (imageUrls.length === 0) {
                    sliderDiv.innerHTML = '<p>No images available.</p>';
                  }
                  imagesSection.appendChild(sliderDiv);
                }

                const actionButtons = document.createElement('div');
                actionButtons.className = 'action-buttons';

                const downloadButton = document.createElement('button');
                downloadButton.textContent = 'Download PDF';
                downloadButton.onclick = () => {
                  window.parent.postMessage({
                    type: 'linkClick',
                    url: '${targetUrl}/pdf'
                  }, '*');
                };
                actionButtons.appendChild(downloadButton);

                const priorArtButton = document.createElement('button');
                priorArtButton.textContent = 'Find Prior Art';
                priorArtButton.onclick = () => {
                  window.parent.postMessage({
                    type: 'linkClick',
                    url: 'https://patents.google.com/xhr/query?url=pn%3D${targetUrl.split('/').pop()}%26priorart%3Dtrue'
                  }, '*');
                };
                actionButtons.appendChild(priorArtButton);

                const similarButton = document.createElement('button');
                similarButton.textContent = 'Similar';
                similarButton.onclick = () => {
                  window.parent.postMessage({
                    type: 'linkClick',
                    url: 'https://patents.google.com/xhr/query?url=pn%3D${targetUrl.split('/').pop()}%26similar%3Dtrue'
                  }, '*');
                };
                actionButtons.appendChild(similarButton);

                sidebar.insertBefore(actionButtons, sidebar.firstChild);

                const patentHeader = document.createElement('div');
                patentHeader.className = 'patent-header';
                patentHeader.textContent = '${targetUrl.split('/').pop()}';
                sidebar.insertBefore(patentHeader, sidebar.firstChild);
              }
            });

            let currentSlide = 0;
            function moveSlide(direction) {
              const slides = document.querySelectorAll('#imageContainer img');
              const totalSlides = slides.length;
              currentSlide += direction;
              if (currentSlide < 0) {
                currentSlide = totalSlides - 1;
              } else if (currentSlide >= totalSlides) {
                currentSlide = 0;
              }
              const offset = -currentSlide * 100;
              document.querySelector('#imageContainer').style.transform = \`translateX(\${offset}%)\`;
            }
          </script>
          </body>
        `
        );
      }

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

      res.send(html);
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
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;