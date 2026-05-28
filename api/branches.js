// Branches API - 分支剧情管理
const { supabase } = require('./supabase-client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const storyId = url.searchParams.get('story_id');
  const chapterId = url.searchParams.get('chapter_id');
  const branchId = url.searchParams.get('id');

  try {
    switch (req.method) {
      case 'GET':
        if (storyId) {
          const { data, error } = await supabase
            .from('branches')
            .select('*')
            .eq('story_id', storyId)
            .order('paragraph_index', { ascending: true });
          if (error) throw error;
          return res.json(data);
        } else if (chapterId) {
          const { data, error } = await supabase
            .from('branches')
            .select('*')
            .eq('chapter_id', chapterId)
            .order('paragraph_index', { ascending: true });
          if (error) throw error;
          return res.json(data);
        }
        return res.status(400).json({ error: 'story_id or chapter_id required' });

      case 'POST': {
        const items = Array.isArray(req.body) ? req.body : [req.body];
        const { data, error } = await supabase.from('branches').insert(items).select();
        if (error) throw error;
        return res.status(201).json(data);
      }

      case 'PUT': {
        if (!branchId) return res.status(400).json({ error: 'Branch ID required' });
        const { data, error } = await supabase
          .from('branches')
          .update(req.body)
          .eq('id', branchId)
          .select()
          .single();
        if (error) throw error;
        return res.json(data);
      }

      case 'DELETE': {
        if (branchId) {
          const { error } = await supabase.from('branches').delete().eq('id', branchId);
          if (error) throw error;
        } else if (chapterId) {
          const { error } = await supabase.from('branches').delete().eq('chapter_id', chapterId);
          if (error) throw error;
        }
        return res.json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Branches API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
