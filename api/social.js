// Social API - Likes, Favorites, Comments
const { supabase } = require('./supabase-client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get('action'); // like | favorite | comment
  const storyId = url.searchParams.get('story_id');
  const userId = url.searchParams.get('user_id');
  const commentId = url.searchParams.get('id');

  try {
    switch (action) {
      case 'like': {
        if (req.method === 'POST') {
          const { user_id, story_id } = req.body;
          const { data, error } = await supabase
            .from('likes')
            .insert({ user_id, story_id })
            .select()
            .single();
          if (error) {
            if (error.code === '23505') return res.json({ already_liked: true });
            throw error;
          }
          await supabase.rpc('update_like_count', { story_id });
          return res.json(data);
        }
        if (req.method === 'DELETE') {
          if (!userId || !storyId) return res.status(400).json({ error: 'user_id and story_id required' });
          const { error } = await supabase.from('likes').delete().match({ user_id: userId, story_id: storyId });
          if (error) throw error;
          return res.json({ success: true });
        }
        if (req.method === 'GET') {
          const { count } = await supabase.from('likes').select('*', { count: 'exact' }).eq('story_id', storyId);
          return res.json({ count });
        }
        break;
      }

      case 'favorite': {
        if (req.method === 'POST') {
          const { user_id, story_id } = req.body;
          const { data, error } = await supabase
            .from('favorites')
            .insert({ user_id, story_id })
            .select()
            .single();
          if (error) {
            if (error.code === '23505') return res.json({ already_favorited: true });
            throw error;
          }
          return res.json(data);
        }
        if (req.method === 'DELETE') {
          const { error } = await supabase.from('favorites').delete().match({ user_id: userId, story_id: storyId });
          if (error) throw error;
          return res.json({ success: true });
        }
        if (req.method === 'GET') {
          const { data } = await supabase
            .from('favorites')
            .select('story_id, stories:story_id(*)')
            .eq('user_id', userId);
          return res.json(data || []);
        }
        break;
      }

      case 'comment': {
        if (req.method === 'GET') {
          const { data, error } = await supabase
            .from('comments')
            .select('*, users:user_id(username, avatar_url)')
            .eq('story_id', storyId)
            .order('created_at', { ascending: false });
          if (error) throw error;
          return res.json(data);
        }
        if (req.method === 'POST') {
          const { user_id, story_id, content } = req.body;
          if (!content) return res.status(400).json({ error: 'Content required' });
          const { data, error } = await supabase
            .from('comments')
            .insert({ user_id, story_id, content })
            .select('*, users:user_id(username, avatar_url)')
            .single();
          if (error) throw error;
          return res.status(201).json(data);
        }
        if (req.method === 'DELETE') {
          if (!commentId) return res.status(400).json({ error: 'Comment ID required' });
          const { error } = await supabase.from('comments').delete().eq('id', commentId);
          if (error) throw error;
          return res.json({ success: true });
        }
        break;
      }

      default:
        return res.status(400).json({ error: 'action parameter required: like | favorite | comment' });
    }
  } catch (err) {
    console.error('Social API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
