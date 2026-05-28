// Chapters API
const { supabase } = require('./supabase-client');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const storyId = url.searchParams.get('story_id');
  const chapterId = url.searchParams.get('id');

  try {
    switch (req.method) {
      case 'GET':
        if (chapterId) {
          const { data, error } = await supabase
            .from('chapters')
            .select('*, paragraphs(*)')
            .eq('id', chapterId)
            .single();
          if (error) throw error;
          return res.json(data);
        } else if (storyId) {
          const { data, error } = await supabase
            .from('chapters')
            .select('*')
            .eq('story_id', storyId)
            .order('chapter_number', { ascending: true });
          if (error) throw error;
          return res.json(data);
        }
        return res.status(400).json({ error: 'story_id or id required' });

      case 'POST': {
        const { story_id, chapter_number, title, content, html_fragment, bgm_url } = req.body;
        if (!story_id) return res.status(400).json({ error: 'story_id required' });

        const { data, error } = await supabase
          .from('chapters')
          .insert({
            story_id,
            chapter_number: chapter_number || 1,
            title: title || '',
            content: content || '',
            html_fragment: html_fragment || null,
            bgm_url: bgm_url || null
          })
          .select()
          .single();

        if (error) throw error;
        return res.status(201).json(data);
      }

      case 'PUT': {
        if (!chapterId) return res.status(400).json({ error: 'Chapter ID required' });
        const { data, error } = await supabase
          .from('chapters')
          .update(req.body)
          .eq('id', chapterId)
          .select()
          .single();
        if (error) throw error;
        return res.json(data);
      }

      case 'DELETE': {
        if (!chapterId) return res.status(400).json({ error: 'Chapter ID required' });
        const { error } = await supabase
          .from('chapters')
          .delete()
          .eq('id', chapterId);
        if (error) throw error;
        return res.json({ success: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Chapters API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
