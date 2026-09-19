import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { articles as seedArticles, categories } from './content.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'pathtodev.sqlite');

mkdirSync(path.dirname(dbPath), { recursive: true });
mkdirSync(publicDir, { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    bio TEXT DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0,
    created TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id)
  );
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    level TEXT NOT NULL,
    summary TEXT NOT NULL,
    body TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    created TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    article_id TEXT NOT NULL,
    PRIMARY KEY(user_id, article_id)
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    status TEXT NOT NULL,
    detail TEXT NOT NULL,
    created TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

function ensureColumn(tableName, columnName, definitionSql) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
}

function ensureSchema() {
  ensureColumn('users', 'bio', 'TEXT DEFAULT ""');
  ensureColumn('users', 'verified', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'verified_text', 'TEXT DEFAULT "Verified Developer: This account has been checked by Soft Production: Game Group and marked as a trusted creator for community guidance and pinned updates."');
  ensureColumn('posts', 'pinned', 'INTEGER NOT NULL DEFAULT 0');

  const followsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'follows'").get();
  if (!followsExists) {
    db.exec(`
      CREATE TABLE follows (
        follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (follower_id, following_id)
      );
    `);
  }
}

ensureSchema();

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  return timingSafeEqual(Buffer.from(key, 'hex'), scryptSync(password, salt, 64));
}

function parseJson(value, fallback = []) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(parsed ?? '')];
  } catch {
    if (Array.isArray(value)) return value;
    return typeof value === 'string' && value.trim() ? [value] : fallback;
  }
}

const articleInsert = db.prepare('INSERT OR IGNORE INTO articles (id,title,category,level,summary,body,minutes,status,source) VALUES (?,?,?,?,?,?,?,?,?)');
const existingCount = db.prepare('SELECT COUNT(*) AS count FROM articles').get().count;
if (existingCount === 0) {
  for (const article of seedArticles) {
    articleInsert.run(
      article.id,
      article.title,
      article.category,
      article.level,
      article.summary,
      JSON.stringify(article.body),
      article.minutes,
      article.status || 'published',
      article.source || 'Soft Production: Game Group AI Editorial'
    );
  }
}


const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf('=');
        if (eq === -1) return [part, ''];
        return [part.slice(0, eq), decodeURIComponent(part.slice(eq + 1))];
      })
  );
}

function getUserFromRequest(req) {
  const token = parseCookies(req.headers.cookie || '').pathtodev_session;
  if (!token) return null;
  return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?').get(token, Date.now()) || null;
}

function titleCase(value) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    bio: user.bio || '',
    verified: Boolean(user.verified),
    verified_text: user.verified_text || 'Verified Developer: This account has been checked by Soft Production: Game Group and marked as a trusted creator for community guidance and pinned updates.',
    created: user.created,
    followers_count: Number(user.followers_count || 0),
    following_count: Number(user.following_count || 0),
    post_count: Number(user.post_count || 0),
    is_following: Boolean(user.is_following)
  };
}

function ensureValidCategory(value) {
  return categories.some((category) => category.id === value) ? value : 'studio';
}

function generateAiArticleSet() {
  return [
    { category: 'studio', title: 'Fast Roblox Studio Workflow Setup', level: 'Beginner', minutes: 12 },
    { category: 'scripting', title: 'Secure Data Handling in Luau', level: 'Intermediate', minutes: 18 },
    { category: 'building', title: 'Creating Memorable Map Landmarks', level: 'Intermediate', minutes: 16 },
    { category: 'gameplay', title: 'Designing Reward Loops That Keep Players Playing', level: 'Intermediate', minutes: 20 },
    { category: 'ui', title: 'Polished HUD and Notification Design', level: 'Intermediate', minutes: 17 },
    { category: 'shipping', title: 'Launch Checklist Before You Publish', level: 'Advanced', minutes: 22 }
  ];
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      if (pathname === '/api/overview') {
        const articleCount = db.prepare('SELECT COUNT(*) AS count FROM articles').get().count;
        const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
        const postCount = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count;
        sendJson(res, 200, {
          articleCount,
          userCount,
          postCount,
          categories,
          brand: 'Soft Production: Game Group'
        });
        return;
      }

      if (pathname === '/api/users') {
        const requestedId = Number(url.searchParams.get('id') || url.searchParams.get('userId') || 0);
        const viewer = getUserFromRequest(req);

        if (requestedId) {
          const userRow = db.prepare(`
            SELECT u.*, 
              (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS followers_count,
              (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following_count,
              (SELECT COUNT(*) FROM posts WHERE user_id = u.id) AS post_count,
              CASE WHEN ? IS NOT NULL AND EXISTS (SELECT 1 FROM follows WHERE follower_id = ? AND following_id = u.id) THEN 1 ELSE 0 END AS is_following
            FROM users u
            WHERE u.id = ?
          `).get(viewer ? viewer.id : null, viewer ? viewer.id : null, requestedId);

          if (!userRow) {
            sendJson(res, 404, { message: 'User not found.' });
            return;
          }

          const userPosts = db.prepare(`
            SELECT p.*, u.name AS author_name, u.verified AS author_verified
            FROM posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.user_id = ?
            ORDER BY p.pinned DESC, p.created DESC
          `).all(requestedId);

          sendJson(res, 200, {
            user: serializeUser(userRow),
            posts: userPosts
          });
          return;
        }

        const rows = db.prepare(`
          SELECT u.*, 
            (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS followers_count,
            (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following_count,
            (SELECT COUNT(*) FROM posts WHERE user_id = u.id) AS post_count,
            CASE WHEN ? IS NOT NULL AND EXISTS (SELECT 1 FROM follows WHERE follower_id = ? AND following_id = u.id) THEN 1 ELSE 0 END AS is_following
          FROM users u
          ORDER BY u.verified DESC, u.name ASC
        `).all(viewer ? viewer.id : null, viewer ? viewer.id : null);

        sendJson(res, 200, {
          users: rows.map((row) => serializeUser(row))
        });
        return;
      }

      if (pathname === '/api/articles') {
        const category = url.searchParams.get('category') || 'all';
        const search = url.searchParams.get('search') || '';
        const rows = db.prepare('SELECT * FROM articles WHERE status = ? ORDER BY created DESC').all('published');
        const filtered = rows.filter((article) => {
          const matchesCategory = category === 'all' || article.category === category;
          const haystack = `${article.title} ${article.summary} ${article.category} ${article.level}`.toLowerCase();
          const matchesSearch = !search || haystack.includes(search.toLowerCase());
          return matchesCategory && matchesSearch;
        });

        sendJson(res, 200, {
          articles: filtered.map((article) => ({
            ...article,
            body: parseJson(article.body, [article.summary])
          }))
        });
        return;
      }

      if (pathname === '/api/posts') {
        if (req.method === 'POST') {
          const currentUser = getUserFromRequest(req);
          if (!currentUser) {
            sendJson(res, 401, { message: 'Please sign in to create a post.' });
            return;
          }

          const body = await readRequestBody(req);
          const title = String(body.title || '').trim();
          const content = String(body.body || '').trim();
          const category = ensureValidCategory(String(body.category || 'studio'));

          if (title.length < 6 || title.length > 120 || content.length < 12 || content.length > 5000) {
            sendJson(res, 400, { message: 'Your post title and body need to be valid and useful.' });
            return;
          }

          const postResult = db.prepare('INSERT INTO posts (user_id, title, body, category, pinned) VALUES (?, ?, ?, ?, 0)').run(currentUser.id, title, content, category);
          sendJson(res, 201, { message: 'Post created successfully.', postId: postResult.lastInsertRowid });
          return;
        }

        const postRows = db.prepare(`
          SELECT p.*, u.name AS author_name, u.verified AS author_verified
          FROM posts p
          JOIN users u ON u.id = p.user_id
          ORDER BY p.pinned DESC, p.created DESC
        `).all();
        const commentRows = db.prepare('SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.user_id ORDER BY c.created ASC').all();
        const commentsByPost = {};
        for (const comment of commentRows) {
          commentsByPost[comment.post_id] ??= [];
          commentsByPost[comment.post_id].push(comment);
        }
        sendJson(res, 200, {
          posts: postRows.map((post) => ({
            ...post,
            comments: commentsByPost[post.id] || []
          }))
        });
        return;
      }

      if (pathname === '/api/signup') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { message: 'Method not allowed.' });
          return;
        }
        const body = await readRequestBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const name = String(body.name || '').trim();
        const password = String(body.password || '');

        if (!email || !email.includes('@') || email.length < 6) {
          sendJson(res, 400, { message: 'Please enter a valid email address.' });
          return;
        }
        if (name.length < 2 || name.length > 40) {
          sendJson(res, 400, { message: 'Display name must be 2-40 characters.' });
          return;
        }
        if (password.length < 6 || password.length > 128) {
          sendJson(res, 400, { message: 'Password should be between 6 and 128 characters.' });
          return;
        }

        const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existingEmail) {
          sendJson(res, 409, { message: 'That email already has an account.' });
          return;
        }

        const existingName = db.prepare('SELECT id FROM users WHERE name = ?').get(name);
        if (existingName) {
          sendJson(res, 409, { message: 'That display name is already in use.' });
          return;
        }

        const isOfficialVerifiedAccount = name.trim() === 'Soft Production';
        const createdUser = db.prepare('INSERT INTO users (email, name, password, bio, verified) VALUES (?, ?, ?, ?, ?)')
          .run(email, name, hashPassword(password), isOfficialVerifiedAccount ? 'Official Soft Production creator account. We share real dev updates, helpful posts, and verified community guidance.' : '', isOfficialVerifiedAccount ? 1 : 0);
        const createdUserRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(createdUser.lastInsertRowid);
        const token = createHash('sha256').update(`${email}:${Date.now()}:${randomBytes(16).toString('hex')}`).digest('hex');
        db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').run(token, createdUser.lastInsertRowid, Date.now() + 1000 * 60 * 60 * 24 * 30);

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': `pathtodev_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({
          user: { id: createdUser.lastInsertRowid, email, name, verified: Boolean(createdUserRecord.verified), verified_text: createdUserRecord.verified_text || 'Verified Developer: This account has been checked by Soft Production: Game Group and marked as a trusted creator for community guidance and pinned updates.' },
          message: 'Account created successfully.'
        }));
        return;
      }

      if (pathname === '/api/login') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { message: 'Method not allowed.' });
          return;
        }

        const body = await readRequestBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user || !verifyPassword(password, user.password)) {
          sendJson(res, 401, { message: 'Invalid email or password.' });
          return;
        }

        const token = createHash('sha256').update(`${user.email}:${Date.now()}:${randomBytes(16).toString('hex')}`).digest('hex');
        db.prepare('INSERT OR REPLACE INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').run(token, user.id, Date.now() + 1000 * 60 * 60 * 24 * 30);

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': `pathtodev_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({
          user: { id: user.id, email: user.email, name: user.name, verified: Boolean(user.verified), verified_text: user.verified_text || 'Verified Developer: This account has been checked by Soft Production: Game Group and marked as a trusted creator for community guidance and pinned updates.' },
          message: 'Signed in successfully.'
        }));
        return;
      }

      if (pathname === '/api/me') {
        const user = getUserFromRequest(req);
        sendJson(res, 200, { user: user ? { id: user.id, email: user.email, name: user.name, verified: Boolean(user.verified), verified_text: user.verified_text || 'Verified Developer: This account has been checked by Soft Production: Game Group and marked as a trusted creator for community guidance and pinned updates.', bio: user.bio || '' } : null });
        return;
      }

      if (pathname === '/api/verify-user') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { message: 'Method not allowed.' });
          return;
        }

        const currentUser = getUserFromRequest(req);
        if (!currentUser || currentUser.name !== 'Soft Production' || !currentUser.verified) {
          sendJson(res, 403, { message: 'Only the verified Soft Production account can manage creator badges.' });
          return;
        }

        const body = await readRequestBody(req);
        const targetId = Number(body.userId || 0);
        const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
        if (!targetUser) {
          sendJson(res, 404, { message: 'User not found.' });
          return;
        }

        const verified = body.verified === true || body.verified === 'true' || body.verified === 1 || body.verified === '1';
        const verifiedText = String(body.verifiedText || '').trim() || 'Verified Developer: This account has been checked by Soft Production: Game Group and marked as a trusted creator for community guidance and pinned updates.';

        db.prepare('UPDATE users SET verified = ?, verified_text = ? WHERE id = ?').run(verified ? 1 : 0, verifiedText, targetId);
        sendJson(res, 200, {
          message: verified ? 'Verified badge granted.' : 'Verified badge removed.',
          user: serializeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(targetId))
        });
        return;
      }

      if (pathname === '/api/follow') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { message: 'Method not allowed.' });
          return;
        }

        const currentUser = getUserFromRequest(req);
        if (!currentUser) {
          sendJson(res, 401, { message: 'Please sign in to follow people.' });
          return;
        }

        const body = await readRequestBody(req);
        const targetId = Number(body.userId || 0);
        if (!targetId || targetId === currentUser.id) {
          sendJson(res, 400, { message: 'Choose a valid person to follow.' });
          return;
        }

        const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(currentUser.id, targetId);
        if (existing) {
          db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(currentUser.id, targetId);
          sendJson(res, 200, { followed: false });
          return;
        }

        db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(currentUser.id, targetId);
        sendJson(res, 200, { followed: true });
        return;
      }

      if (pathname === '/api/pin-post') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { message: 'Method not allowed.' });
          return;
        }

        const currentUser = getUserFromRequest(req);
        if (!currentUser || !currentUser.verified) {
          sendJson(res, 403, { message: 'Only a verified developer can pin a post.' });
          return;
        }

        const body = await readRequestBody(req);
        const postId = Number(body.postId || 0);
        const pinned = Number(body.pinned || 0) === 1;
        db.prepare('UPDATE posts SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, postId);
        sendJson(res, 200, { message: pinned ? 'Post pinned to the top.' : 'Post was unpinned.' });
        return;
      }

      if (pathname === '/api/ai-refresh') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { message: 'Method not allowed.' });
          return;
        }

        const additions = generateAiArticleSet();
        const articleStatement = db.prepare('INSERT OR IGNORE INTO articles (id,title,category,level,summary,body,minutes,status,source) VALUES (?,?,?,?,?,?,?,?,?)');
        let inserted = 0;

        for (const item of additions) {
          const id = `ai-${item.category}-${Date.now()}-${inserted}`;
          articleStatement.run(
            id,
            item.title,
            item.category,
            item.level,
            `This AI-assisted article covers ${item.title.toLowerCase()} with practical, production-ready guidance for Roblox developers.`,
            JSON.stringify([
              `Focus on the core mechanics behind ${item.title.toLowerCase()} before scaling into more complex systems.`,
              `Test in Studio after each milestone and design around real player behavior rather than assumptions.`,
              `Keep every feature measurable so you can quickly learn what changes improve retention, clarity, and excitement.`
            ]),
            item.minutes,
            'published',
            'Soft Production AI Auto-Update'
          );
          inserted += 1;
        }

        sendJson(res, 200, {
          message: 'AI content refresh complete. New knowledge modules were added to the library.',
          inserted
        });
        return;
      }

      if (pathname === '/api/comments' && req.method === 'POST') {
        const currentUser = getUserFromRequest(req);
        if (!currentUser) {
          sendJson(res, 401, { message: 'Please sign in to comment.' });
          return;
        }

        const body = await readRequestBody(req);
        const postId = Number(body.postId || 0);
        const message = String(body.body || '').trim();

        if (!postId || !message || message.length < 2 || message.length > 2000) {
          sendJson(res, 400, { message: 'A comment is required.' });
          return;
        }

        db.prepare('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)').run(postId, currentUser.id, message);
        sendJson(res, 201, { message: 'Comment added.' });
        return;
      }

      sendJson(res, 404, { message: 'API endpoint not found.' });
    } catch (error) {
      sendJson(res, 500, { message: error instanceof Error ? error.message : 'Unexpected server error.' });
    }

    return;
  }

  if (req.method === 'GET') {
    const fileName = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const filePath = path.normalize(path.join(publicDir, fileName));
    if (!filePath.startsWith(publicDir)) {
      sendJson(res, 403, { message: 'Forbidden.' });
      return;
    }

    try {
      const content = readFileSync(filePath);
      const extension = path.extname(fileName).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Page not found.');
    }
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed.');
});

server.listen(port, host, () => {
  console.log(`Soft Production: Game Group site is live at http://${host}:${port}`);
});
