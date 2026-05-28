// Stories API - CRUD operations for stories
const { supabase } = require('./supabase-client');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { method } = req;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const id = url.searchParams.get('id');

  try {
    switch (method) {
      case 'GET':
        if (id) {
          // 获取单篇作品 + 章节 + 段落
          const { data: story, error: storyErr } = await supabase
            .from('stories')
            .select('*, users:author_id(username, avatar_url, bio)')
            .eq('id', id)
            .single();

          if (storyErr || !story) {
            return res.status(404).json({ error: 'Story not found' });
          }

          // 增加阅读量
          await supabase.rpc('increment_view', { story_id: parseInt(id) });

          // 获取章节
          const { data: chapters } = await supabase
            .from('chapters')
            .select('*')
            .eq('story_id', id)
            .order('chapter_number', { ascending: true });

          // 获取段落
          const { data: paragraphs } = await supabase
            .from('paragraphs')
            .select('*')
            .eq('story_id', id)
            .order('order_index', { ascending: true });

          // 获取分支
          const { data: branches } = await supabase
            .from('branches')
            .select('*')
            .eq('story_id', id);

          return res.json({ story, chapters, paragraphs, branches });
        } else {
          // 获取作品列表
          const page = parseInt(url.searchParams.get('page') || '1');
          const limit = parseInt(url.searchParams.get('limit') || '12');
          const tag = url.searchParams.get('tag');
          const search = url.searchParams.get('search');
          const sort = url.searchParams.get('sort') || 'newest';

          let query = supabase
            .from('stories')
            .select('id, title, summary, tags, cover_image_url, view_count, like_count, created_at, users:author_id(username, avatar_url)', { count: 'exact' })
            .eq('status', 'published');

          if (tag) {
            query = query.contains('tags', [tag]);
          }
          if (search) {
            query = query.or('title.ilike.%' + search + '%,summary.ilike.%' + search + '%');
          }

          if (sort === 'popular') {
            query = query.order('like_count', { ascending: false });
          } else {
            query = query.order('created_at', { ascending: false });
          }

          const from = (page - 1) * limit;
          const to = from + limit - 1;

          const { data, count, error } = await query.range(from, to);

          if (error) throw error;
          return res.json({ stories: data, total: count, page, limit });
        }

      case 'POST': {
        // 创建新作品
        const { title, summary, tags, template, branch_enabled, status } = req.body;

        if (!title) return res.status(400).json({ error: 'Title is required' });

        const { data, error } = await supabase
          .from('stories')
          .insert({
            title,
            summary: summary || '',
            tags: tags || [],
            template: template || 'modern',
            branch_enabled: branch_enabled || false,
            status: status || 'draft'
          })
          .select()
          .single();

        if (error) throw error;
        return res.status(201).json(data);
      }

      case 'PUT': {
        // 更新作品
        if (!id) return res.status(400).json({ error: 'Story ID is required' });

        const updates = req.body;
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
          .from('stories')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return res.json(data);
      }

      case 'DELETE': {
        if (!id) return res.status(400).json({ error: 'Story ID is required' });

        const { error } = await supabase
          .from('stories')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return res.json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Stories API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
