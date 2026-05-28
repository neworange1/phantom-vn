// User API - Registration, Login, Profile
let supabase;
try {
  const mod = require('./supabase-client');
  supabase = mod.supabase;
} catch (e) {
  console.error('Failed to load supabase-client:', e.message);
}
const crypto = require('crypto');

// Simple password hash (SHA-256 + salt)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(password + salt)
    .digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, originalHash] = stored.split(':');
  const hash = crypto
    .createHash('sha256')
    .update(password + salt)
    .digest('hex');
  return hash === originalHash;
}

function generateToken(user) {
  const payload = JSON.stringify({ id: user.id, username: user.username, role: user.role });
  return Buffer.from(payload).toString('base64');
}

function parseToken(token) {
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
  } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get('action');
  const userId = url.searchParams.get('id');

  try {
    switch (action) {
      case 'register': {
        if (req.method !== 'POST') return res.status(405).end();
        if (!supabase) return res.status(500).json({ error: '数据库连接未初始化，请检查 SUPABASE 环境变量' });

        const { username, email, password } = req.body;
        if (!username || !email || !password) {
          return res.status(400).json({ error: 'username, email, and password required' });
        }

        try {
          // Check existing
          const { data: existing, error: checkError } = await supabase
            .from('users')
            .select('id')
            .or(`username.eq.${username},email.eq.${email}`)
            .maybeSingle();

          if (checkError) {
            console.error('Check existing error:', checkError);
            return res.status(500).json({ error: '数据库查询失败: ' + checkError.message });
          }

          if (existing) {
            return res.status(409).json({ error: '用户名或邮箱已被注册' });
          }

          const password_hash = hashPassword(password);
          const { data, error: insertError } = await supabase
            .from('users')
            .insert({ username, email, password_hash, role: 'reader' })
            .select('id, username, email, role, avatar_url, bio, created_at')
            .single();

          if (insertError) {
            console.error('Insert error:', insertError);
            return res.status(500).json({ error: '创建用户失败: ' + insertError.message });
          }

          const token = generateToken(data);
          return res.status(201).json({ user: data, token });
        } catch (err) {
          console.error('Register error:', err);
          return res.status(500).json({ error: '服务器内部错误: ' + err.message });
        }
      }

      case 'login': {
        if (req.method !== 'POST') return res.status(405).end();
        const { username, password } = req.body;
        if (!username || !password) {
          return res.status(400).json({ error: 'username and password required' });
        }

        // Support both username and email login
        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .or(`username.eq.${username},email.eq.${username}`)
          .maybeSingle();

        if (error) throw error;
        if (!user || !verifyPassword(password, user.password_hash)) {
          return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = generateToken(user);
        const { password_hash, ...safeUser } = user;
        return res.json({ user: safeUser, token });
      }

      case 'profile': {
        if (req.method === 'GET') {
          if (!userId) return res.status(400).json({ error: 'User ID required' });
          const { data, error } = await supabase
            .from('users')
            .select('id, username, email, role, avatar_url, bio, created_at')
            .eq('id', userId)
            .single();

          if (error || !data) return res.status(404).json({ error: 'User not found' });
          return res.json(data);
        }

        if (req.method === 'PUT') {
          if (!userId) return res.status(400).json({ error: 'User ID required' });
          const { username, email, avatar_url, bio } = req.body;
          const updates = {};
          if (username !== undefined) updates.username = username;
          if (email !== undefined) updates.email = email;
          if (avatar_url !== undefined) updates.avatar_url = avatar_url;
          if (bio !== undefined) updates.bio = bio;

          const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select('id, username, email, role, avatar_url, bio, created_at')
            .single();

          if (error) throw error;
          return res.json(data);
        }
        break;
      }

      case 'activate_author': {
        // 升级为作者 — 支持多种方式提取用户ID
        if (req.method !== 'POST') return res.status(405).end();
        let uid = userId || (req.body && req.body.userId);
        if (!uid) {
          // Try parse from Authorization header
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const tokenData = parseToken(authHeader.slice(7));
            if (tokenData) uid = tokenData.id;
          }
        }
        if (!uid) return res.status(400).json({ error: 'User ID required' });

        const { data, error } = await supabase
          .from('users')
          .update({ role: 'author' })
          .eq('id', uid)
          .select('id, username, email, role')
          .single();

        if (error) throw error;
        return res.json(data);
      }

      default:
        return res.status(400).json({ error: 'action required: register | login | profile | activate_author' });
    }
  } catch (err) {
    console.error('User API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
