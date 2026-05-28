// Health check endpoint — 诊断 API 是否正常加载
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const info = {
    status: 'ok',
    node_version: process.version,
    has_supabase_url: !!process.env.SUPABASE_URL,
    has_supabase_service_key: !!process.env.SUPABASE_SERVICE_KEY,
    has_supabase_anon_key: !!process.env.SUPABASE_ANON_KEY,
    supabase_url_prefix: process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 20) + '...' : 'MISSING',
    env_keys: Object.keys(process.env).filter(k => k.startsWith('SUPABASE') || k.startsWith('DEEPSEEK')),
    timestamp: new Date().toISOString()
  };

  // Try supabase connection
  try {
    const { supabase } = require('./supabase-client');
    const { data, error } = await supabase.from('users').select('count').limit(1);
    info.supabase_query = error ? 'FAIL: ' + error.message : 'OK';
    info.user_count_hint = data ? 'queryable' : 'no data';
  } catch(e) {
    info.supabase_query = 'CRASH: ' + e.message;
  }

  return res.status(200).json(info);
};
