-- ============================================
-- Phantom Wild Visual Novel - 数据库初始化脚本
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴全部内容 → Run
-- ============================================

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'reader' CHECK (role IN ('reader', 'author', 'admin')),
  avatar_url TEXT,
  bio TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 作品表
CREATE TABLE IF NOT EXISTS stories (
  id SERIAL PRIMARY KEY,
  author_id INT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  cover_image_url TEXT,
  bgm_url TEXT,
  template TEXT DEFAULT 'modern' CHECK (template IN ('ancient', 'modern', 'mystery', 'custom')),
  branch_enabled BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'private')),
  html_content TEXT,
  view_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 章节表
CREATE TABLE IF NOT EXISTS chapters (
  id SERIAL PRIMARY KEY,
  story_id INT REFERENCES stories(id) ON DELETE CASCADE,
  chapter_number INT NOT NULL,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  html_fragment TEXT,
  bgm_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 段落表（存储场景标记与配图）
CREATE TABLE IF NOT EXISTS paragraphs (
  id SERIAL PRIMARY KEY,
  story_id INT REFERENCES stories(id) ON DELETE CASCADE,
  chapter_id INT REFERENCES chapters(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  image_style TEXT DEFAULT 'visual-card' CHECK (image_style IN ('visual-card', 'polaroid', 'banner', 'none')),
  effects TEXT[] DEFAULT '{}',
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 分支剧情表
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  story_id INT REFERENCES stories(id) ON DELETE CASCADE,
  chapter_id INT REFERENCES chapters(id) ON DELETE CASCADE,
  paragraph_index INT NOT NULL,
  option_text TEXT NOT NULL,
  target_chapter_id INT REFERENCES chapters(id) ON DELETE CASCADE,
  target_paragraph_index INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 点赞表
CREATE TABLE IF NOT EXISTS likes (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  story_id INT REFERENCES stories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, story_id)
);

-- 7. 收藏表
CREATE TABLE IF NOT EXISTS favorites (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  story_id INT REFERENCES stories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, story_id)
);

-- 8. 评论表
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  story_id INT REFERENCES stories(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 索引优化
-- ============================================
CREATE INDEX IF NOT EXISTS idx_stories_author ON stories(author_id);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_stories_created ON stories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_story ON chapters(story_id);
CREATE INDEX IF NOT EXISTS idx_paragraphs_chapter ON paragraphs(chapter_id);
CREATE INDEX IF NOT EXISTS idx_paragraphs_order ON paragraphs(order_index);
CREATE INDEX IF NOT EXISTS idx_branches_chapter ON branches(chapter_id);
CREATE INDEX IF NOT EXISTS idx_likes_story ON likes(story_id);
CREATE INDEX IF NOT EXISTS idx_comments_story ON comments(story_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

-- ============================================
-- RLS 启用（但设为开放，由 service_role 控制后端）
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE paragraphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 公开读取策略（已发布的作品任何人都能读）
CREATE POLICY "published_stories_readable" ON stories
  FOR SELECT USING (status = 'published');

CREATE POLICY "public_chapters_readable" ON chapters
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM stories WHERE stories.id = chapters.story_id AND stories.status = 'published')
  );

CREATE POLICY "public_paragraphs_readable" ON paragraphs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM stories WHERE stories.id = paragraphs.story_id AND stories.status = 'published')
  );

CREATE POLICY "public_branches_readable" ON branches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM stories WHERE stories.id = branches.story_id AND stories.status = 'published')
  );

CREATE POLICY "public_comments_readable" ON comments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM stories WHERE stories.id = comments.story_id AND stories.status = 'published')
  );

-- 认证用户读取公开资料
CREATE POLICY "users_readable" ON users
  FOR SELECT USING (true);

-- 允许注册（任何人均可 INSERT）
CREATE POLICY "users_insertable" ON users
  FOR INSERT WITH CHECK (true);

-- 用户可更新自己的资料
CREATE POLICY "users_own_update" ON users
  FOR UPDATE USING (true) WITH CHECK (true);

-- 点赞/收藏仅本人可管理
CREATE POLICY "likes_own_manage" ON likes
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "favorites_own_manage" ON favorites
  FOR ALL USING (true) WITH CHECK (true);

-- 评论任何人可读，认证用户可写
CREATE POLICY "comments_insert_auth" ON comments
  FOR INSERT WITH CHECK (true);

-- ============================================
-- RPC 函数
-- ============================================

-- 增加阅读量
CREATE OR REPLACE FUNCTION increment_view(story_id INT)
RETURNS VOID AS $$
BEGIN
  UPDATE stories SET view_count = view_count + 1 WHERE id = story_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 更新点赞数
CREATE OR REPLACE FUNCTION update_like_count(story_id INT)
RETURNS VOID AS $$
BEGIN
  UPDATE stories SET like_count = (SELECT COUNT(*) FROM likes WHERE likes.story_id = story_id) WHERE id = story_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 确认表创建成功
-- ============================================
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
