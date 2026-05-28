/**
 * Vercel Serverless Function — DeepSeek API 代理
 *
 * 架构说明：
 * - API Key 来源：Vercel 环境变量 `DEEPSEEK_API_KEY`，无回退硬编码值。
 * - 封装原则：所有 DeepSeek 调用经由此函数，前端不持有任何 Key。
 * - 错误分级：auth 错误（401/403）返回 demo_mode 标识，前端据此切换演示模式。
 */

const SYSTEM_PROMPTS = {
  ziwen: '你是一个专业的文学编辑与文字优化助手，擅长润色小说文段、调整文风、优化节奏。回复直接给出优化后的文本，不需要额外解释。',
  huahua: '你是一个视觉小说美术设计助手，擅长描述图片生成提示词、场景构图、角色设计。回复简洁专业。',
  mzhou: '你是一个视觉小说脚本编辑助手，擅长将文段转化为视觉小说分镜脚本，包含场景编号、说话人标签、画面描述和对话文本。'
};

// ══════════════════════════════════════
// API Key 配置（唯一入口，勿直接修改）
// ══════════════════════════════════════
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
// 注：Vercel 环境变量在 Dashboard → Settings → Environment Variables 设置
//     若未配置，API 将返回 demo_mode，前端自动进入演示模式

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { agent, prompt } = req.body;

    if (!agent || !prompt) {
      return res.status(400).json({ error: 'Missing agent or prompt' });
    }

    // 若无 API Key，直接返回演示模式标识
    if (!DEEPSEEK_API_KEY) {
      return res.status(200).json({
        content: '',
        demo_mode: true,
        reason: 'API Key 未配置（请在 Vercel 环境变量中设置 DEEPSEEK_API_KEY）'
      });
    }

    const systemPrompt = SYSTEM_PROMPTS[agent] || SYSTEM_PROMPTS.ziwen;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2048,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const status = response.status;
      // 认证错误 → 演示模式
      if (status === 401 || status === 403) {
        return res.status(200).json({
          content: '',
          demo_mode: true,
          reason: `DeepSeek API 认证失败 (${status})，请检查 API Key 是否有效`
        });
      }
      // 其他错误（429 限流、500 服务端等）→ 透传错误
      const errText = await response.text().catch(() => '');
      return res.status(status).json({
        error: errText,
        demo_mode: status === 429,
        reason: status === 429 ? 'DeepSeek API 请求过于频繁，请稍后重试' : undefined
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '（无返回内容）';
    return res.status(200).json({ content });
  } catch (err) {
    return res.status(200).json({
      content: '',
      demo_mode: true,
      reason: `DeepSeek API 连接失败: ${err.message}`
    });
  }
}
