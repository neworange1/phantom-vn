// Paragraphs API - 段落管理（含场景标记与配图）
const { supabase } = require('./supabase-client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const chapterId = url.searchParams.get('chapter_id');
  const storyId = url.searchParams.get('story_id');
  const paraId = url.searchParams.get('id');

  try {
    switch (req.method) {
      case 'GET':
        if (chapterId) {
          const { data, error } = await supabase
            .from('paragraphs')
            .select('*')
            .eq('chapter_id', chapterId)
            .order('order_index', { ascending: true });
          if (error) throw error;
          return res.json(data);
        } else if (storyId) {
          const { data, error } = await supabase
            .from('paragraphs')
            .select('*')
            .eq('story_id', storyId)
            .order('order_index', { ascending: true });
          if (error) throw error;
          return res.json(data);
        }
        return res.status(400).json({ error: 'chapter_id or story_id required' });

      case 'POST': {
        const items = Array.isArray(req.body) ? req.body : [req.body];
        const { data, error } = await supabase
          .from('paragraphs')
          .insert(items)
          .select();

        if (error) throw error;
        return res.status(201).json(data);
      }

      case 'PUT': {
        if (!paraId) return res.status(400).json({ error: 'Paragraph ID required' });
        const { data, error } = await supabase
          .from('paragraphs')
          .update(req.body)
          .eq('id', paraId)
          .select()
          .single();
        if (error) throw error;
        return res.json(data);
      }

      // 批量更新（重新排序）
      case 'PATCH': {
        const { items } = req.body;
        if (!items || !Array.isArray(items)) {
          return res.status(400).json({ error: 'items array required' });
        }
        const updates = items.map(({ id, ...updates }) =>
          supabase.from('paragraphs').update(updates).eq('id', id)
        );
        await Promise.all(updates);
        return res.json({ success: true });
      }

      case 'DELETE': {
        if (paraId) {
          const { error } = await supabase.from('paragraphs').delete().eq('id', paraId);
          if (error) throw error;
        } else if (chapterId) {
          const { error } = await supabase.from('paragraphs').delete().eq('chapter_id', chapterId);
          if (error) throw error;
        }
        return res.json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Paragraphs API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
