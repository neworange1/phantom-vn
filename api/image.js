/**
 * Vercel Serverless Function — 图片生成代理
 * 代理到 Pollinations.ai（免费，无需 API Key）
 * 前端调用 /api/image，服务端构造 URL 并返回图片地址
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, size, n } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const [width, height] = (size || '1024x1024').split('x').map(Number);
    const count = n || 1;

    const images = [];
    for (let i = 0; i < count; i++) {
      const seed = Math.floor(Math.random() * 900000) + 100000 + i;
      const encodedPrompt = encodeURIComponent(prompt);
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true&enhance=true`;
      images.push({ url });
    }

    return res.status(200).json({ data: images });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
