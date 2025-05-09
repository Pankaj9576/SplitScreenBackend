const express = require("express");
const fetch = require("node-fetch");
const url = require("url");
const cheerio = require("cheerio");
// const jwt = require("jsonwebtoken");
// const bcrypt = require("bcryptjs");
// const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Configure CORS middleware
app.use(cors({
  origin: ["https://frontendsplitscreen.vercel.app", "http://localhost:3000"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
}));

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`Request - Method: ${req.method}, Origin: ${req.headers.origin}, Path: ${req.path}`);
  next();
});

// // Connect to MongoDB Atlas
// mongoose.connect(process.env.MONGODB_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
//   .then(() => console.log("MongoDB Atlas connected successfully"))
//   .catch(err => console.error("MongoDB Atlas connection error:", err));

// // Define User schema
// const userSchema = new mongoose.Schema({
//   email: { type: String, required: true, unique: true },
//   password: { type: String, required: true },
//   googleId: { type: String },
// });

// const User = mongoose.model("User", userSchema);

app.use(express.json());

// // Load JWT secret from environment variable
// const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// // Middleware to verify JWT token
// const authenticateToken = (req, res, next) => {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];

//   if (!token) {
//     console.log("Auth: No token provided");
//     return res.status(401).json({ error: "Authentication required" });
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     req.user = decoded;
//     console.log("Auth: Token verified, user:", decoded.email);
//     next();
//   } catch (err) {
//     console.log("Auth: Invalid token");
//     return res.status(403).json({ error: "Invalid or expired token" });
//   }
// };

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running" });
});

// // Signup endpoint
// app.post("/api/signup", async (req, res) => {
//   console.log("Signup: Request received:", req.body);
//   const { email, password } = req.body;

//   if (!email || !password) {
//     console.log("Signup: Missing email or password");
//     return res.status(400).json({ error: "Email and password are required" });
//   }

//   try {
//     const existingUser = await User.findOne({ email });
//     if (existingUser) {
//       console.log("Signup: User already exists");
//       return res.status(400).json({ error: "User already exists" });
//     }

//     const hashedPassword = await bcrypt.hash(password, 10);
//     const user = new User({ email, password: hashedPassword });
//     await user.save();

//     const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
//     console.log("Signup: Success, token generated");
//     res.status(200).json({ token, message: "Signup successful" });
//   } catch (error) {
//     console.error("Signup: Error:", error.message);
//     res.status(500).json({ error: "Server error during signup", details: error.message });
//   }
// });

// // Login endpoint
// app.post("/api/login", async (req, res) => {
//   console.log("Login: Request received:", req.body);
//   const { email, password } = req.body;

//   if (!email || !password) {
//     console.log("Login: Missing email or password");
//     return res.status(400).json({ error: "Email and password are required" });
//   }

//   try {
//     const user = await User.findOne({ email });
//     if (!user) {
//       console.log("Login: User not found");
//       return res.status(400).json({ error: "User not found" });
//     }

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       console.log("Login: Invalid password");
//       return res.status(400).json({ error: "Invalid password" });
//     }

//     const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
//     console.log("Login: Success, token generated");
//     res.status(200).json({ token, message: "Login successful" });
//   } catch (error) {
//     console.error("Login: Error:", error.message);
//     res.status(500).json({ error: "Server error during login", details: error.message });
//   }
// });

// // Google login endpoint
// app.post("/api/google-login", async (req, res) => {
//   console.log("Google Login: Request received:", req.body);
//   const { email, googleId } = req.body;

//   if (!email || !googleId) {
//     console.log("Google Login: Missing email or googleId");
//     return res.status(400).json({ error: "Email and Google ID are required" });
//   }

//   try {
//     let user = await User.findOne({ email });
//     if (!user) {
//       user = new User({ email, googleId });
//       await user.save();
//       console.log("Google Login: New user created");
//     }

//     const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
//     console.log("Google Login: Success, token generated");
//     res.status(200).json({ token, message: "Google login successful" });
//   } catch (error) {
//     console.error("Google Login: Error:", error.message);
//     res.status(500).json({ error: "Server error during Google login", details: error.message });
//   }
// });

// // Token verification endpoint
// app.post("/api/verify-token", authenticateToken, (req, res) => {
//   console.log("Verify Token: Request received, user:", req.user.email);
//   res.status(200).json({ valid: true, email: req.user.email });
// });

// Proxy endpoint with authentication (removing authentication for now)
// app.get("/api/proxy", authenticateToken, async (req, res) => {
app.get("/api/proxy", async (req, res) => {
  console.log("Proxy: Request received");
  let targetUrl = req.query.url;
  if (!targetUrl) {
    console.log("Proxy: URL parameter missing");
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
    console.log("Proxy: Invalid URL");
    return res.status(400).json({ error: "Invalid URL" });
  }

  console.log(`Proxy: Fetching URL - ${targetUrl}`);

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
      console.error(`Proxy: Fetch failed - ${response.status} - ${errorText}`);
      return res.status(response.status).json({ error: `Failed to fetch URL: ${response.statusText}` });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);

    if (contentType.includes("text/html")) {
      let html = await response.text();
      const baseUrl = new URL(targetUrl).origin;

      if (targetUrl.includes("patents.google.com/patent")) {
        const $ = cheerio.load(html);

        const images = $('img[itemprop="thumbnail"]').map((i, el) => {
          const src = $(el).attr('src');
          return src ? (src.startsWith('http') ? src : `${baseUrl}${src}`) : null;
        }).get().filter(Boolean);

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
    console.error("Proxy: Error:", error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;