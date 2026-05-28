/**
 * parser.js — 文件解析模块 v2.0
 * 支持: TXT, Markdown(保留格式), PDF, DOCX, EPUB, URL爬取, 批量导入
 */

const Parser = (() => {

  // ── 主入口（单文件） ──
  async function parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'txt')  return await parseTxt(file);
      if (ext === 'md')   return await parseMarkdownRich(file);
      if (ext === 'pdf')  return await parsePdf(file);
      if (ext === 'docx' || ext === 'doc') return await parseDocx(file);
      if (ext === 'epub') return await parseEpub(file);
      if (ext === 'html' || ext === 'htm') return await parseHtmlFile(file);
      // RTF / 其他纯文本格式 fallback
      return await parseTxt(file);
    } catch(e) {
      console.error('Parse error', e);
      throw new Error('解析失败，请确认文件格式正确：' + e.message);
    }
  }

  // ── 批量文件入口（返回 [{name, text}, ...] 数组） ──
  async function parseFiles(fileList) {
    const results = [];
    for (const file of fileList) {
      try {
        const text = await parseFile(file);
        results.push({ name: file.name, text, size: file.size, ok: true });
      } catch(e) {
        results.push({ name: file.name, text: '', error: e.message, ok: false });
      }
    }
    return results;
  }

  // ── TXT（兼容 GBK / UTF-8） ──
  function parseTxt(file) {
    return new Promise((res, rej) => {
      const readerUtf = new FileReader();
      readerUtf.onload = e => {
        const text = e.target.result;
        // 若包含乱码特征，尝试 GBK
        if (/\ufffd/.test(text)) {
          const readerGbk = new FileReader();
          readerGbk.onload = ev => res(ev.target.result);
          readerGbk.onerror = rej;
          readerGbk.readAsText(file, 'GBK');
        } else {
          res(text);
        }
      };
      readerUtf.onerror = rej;
      readerUtf.readAsText(file, 'UTF-8');
    });
  }

  // ── Markdown（保留格式信息，转换为富文本 HTML 片段） ──
  async function parseMarkdownRich(file) {
    const raw = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsText(file, 'UTF-8');
    });
    return mdToHtml(raw);
  }

  // 轻量 Markdown → HTML 转换（不引入外部库，覆盖常见语法）
  function mdToHtml(md) {
    let html = md
      // 标题
      .replace(/^#{6}\s(.+)$/gm, '<h6>$1</h6>')
      .replace(/^#{5}\s(.+)$/gm, '<h5>$1</h5>')
      .replace(/^#{4}\s(.+)$/gm, '<h4>$1</h4>')
      .replace(/^###\s(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s(.+)$/gm, '<h1>$1</h1>')
      // 粗体 / 斜体
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      // 分隔线
      .replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr>')
      // 引用块
      .replace(/^>\s(.+)$/gm, '<blockquote>$1</blockquote>')
      // 行内代码
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 链接
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // 空行转段落
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
    return '<p>' + html + '</p>';
  }

  // ── PDF (使用 pdf.js via CDN) ──
  async function parsePdf(file) {
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join('');
      fullText += pageText + '\n\n';
    }
    return fullText.trim();
  }

  // ── DOCX (解析 XML) ──
  async function parseDocx(file) {
    await ensureJSZip();
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file('word/document.xml').async('string');

    const parser = new DOMParser();
    const doc = parser.parseFromString(docXml, 'application/xml');
    const paragraphs = doc.querySelectorAll('p');
    let text = '';
    paragraphs.forEach(p => {
      const runs = p.querySelectorAll('t');
      let paraText = '';
      runs.forEach(r => { paraText += r.textContent; });
      if (paraText.trim()) text += paraText.trim() + '\n\n';
    });
    return text.trim();
  }

  // ── EPUB (解析 ZIP → XHTML 章节文本) ──
  async function parseEpub(file) {
    await ensureJSZip();
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. 读 container.xml 获取 OPF 路径
    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) throw new Error('无效 EPUB：缺少 META-INF/container.xml');

    const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
    const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!opfPath) throw new Error('无效 EPUB：找不到 OPF 路径');

    // 2. 读 OPF 获取 spine / manifest
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    const opfXml = await zip.file(opfPath)?.async('string');
    if (!opfXml) throw new Error('无法读取 OPF 文件');

    const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

    // manifest: id → href
    const manifest = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      manifest[item.getAttribute('id')] = item.getAttribute('href');
    });

    // spine: 顺序 idref 列表
    const spineItems = Array.from(opfDoc.querySelectorAll('spine itemref'))
      .map(ref => ref.getAttribute('idref'));

    // 3. 逐章提取文本
    let fullText = '';
    for (const idref of spineItems) {
      const href = manifest[idref];
      if (!href) continue;
      const fullHref = opfDir + href;
      const chapterHtml = await zip.file(fullHref)?.async('string') ||
                          await zip.file(decodeURIComponent(fullHref))?.async('string');
      if (!chapterHtml) continue;

      const chapterDoc = new DOMParser().parseFromString(chapterHtml, 'text/html');

      // 移除脚本、样式、导航
      chapterDoc.querySelectorAll('script,style,nav').forEach(el => el.remove());

      // 提取段落，保留标题与正文
      const body = chapterDoc.body;
      if (!body) continue;
      body.querySelectorAll('h1,h2,h3,h4,p,div').forEach(el => {
        const t = el.textContent.trim();
        if (!t) return;
        if (/^h[1-4]$/i.test(el.tagName)) {
          fullText += '\n\n━━━ ' + t + ' ━━━\n\n';
        } else {
          fullText += t + '\n\n';
        }
      });
    }

    if (!fullText.trim()) throw new Error('EPUB 内容为空或格式不受支持');
    return fullText.trim();
  }

  // ── HTML 文件解析 ──
  async function parseHtmlFile(file) {
    const raw = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsText(file, 'UTF-8');
    });
    return extractTextFromHtml(raw);
  }

  // ── URL 爬取（通过 CORS 代理） ──
  async function parseUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) throw new Error('请输入有效的 http/https 链接');

    // 依次尝试多个公共 CORS 代理
    const proxies = [
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];

    let html = null;
    let lastErr = null;

    for (const proxy of proxies) {
      try {
        const res = await fetch(proxy, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json().catch(() => null);
        html = data?.contents ?? (await res.text());
        if (html) break;
      } catch(e) {
        lastErr = e;
      }
    }

    if (!html) throw new Error('无法获取页面内容，请检查链接或网络：' + (lastErr?.message || ''));

    return extractTextFromHtml(html, url);
  }

  // 从 HTML 字符串中提取小说正文
  function extractTextFromHtml(html, sourceUrl = '') {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // 移除噪音元素
    doc.querySelectorAll(
      'script,style,nav,header,footer,aside,iframe,noscript,button,' +
      '.ad,.ads,.advertisement,.sidebar,.comment,.comments,' +
      '[class*="ad-"],[class*="banner"],[class*="toolbar"],[id*="comment"]'
    ).forEach(el => el.remove());

    // 优先查找主要内容区域（常见小说站选择器）
    const mainSelectors = [
      '#content', '#novel-content', '#chapter-content', '#articleBody',
      '.content', '.chapter-content', '.article-content', '.novel-text',
      '.read-content', '.text-content', 'article', 'main'
    ];
    let container = null;
    for (const sel of mainSelectors) {
      const el = doc.querySelector(sel);
      if (el && el.textContent.trim().length > 200) {
        container = el;
        break;
      }
    }

    // fallback: 取字数最多的 div/section/article
    if (!container) {
      let maxLen = 0;
      doc.querySelectorAll('div,section,article').forEach(el => {
        const len = el.textContent.trim().length;
        if (len > maxLen) { maxLen = len; container = el; }
      });
    }
    container = container || doc.body;

    // 提取段落文本
    let text = '';
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.trim();
        if (t) text += t + '\n';
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        text += '\n\n━━━ ' + node.textContent.trim() + ' ━━━\n\n';
        return;
      }
      if (tag === 'p' || tag === 'br' || tag === 'div') {
        const t = node.textContent.trim();
        if (t) text += t + '\n\n';
        return;
      }
      node.childNodes.forEach(walk);
    };
    container.childNodes.forEach(walk);

    const result = text.replace(/\n{3,}/g, '\n\n').trim();
    if (!result || result.length < 50)
      throw new Error('未能从页面中提取到有效文本，可能是动态渲染页面');
    return result;
  }

  // ── 自动整理格式 ──
  function autoFormat(rawText) {
    // 若传入的是 HTML 字符串（Markdown 转换结果），先提取纯文本
    if (rawText.trim().startsWith('<')) {
      const doc = new DOMParser().parseFromString(rawText, 'text/html');
      rawText = doc.body.innerText;
    }

    let lines = rawText.split('\n');
    let result = [];
    let prevEmpty = false;

    for (let line of lines) {
      line = line
        .replace(/\r/g, '')
        .replace(/\u3000/g, '  ')
        .trim();

      if (!line) {
        if (!prevEmpty) result.push('');
        prevEmpty = true;
        continue;
      }
      prevEmpty = false;

      // 章节标题识别
      if (/^━━━/.test(line) ||
          /^第[一二三四五六七八九十百千0-9]+[章节回篇]/.test(line) ||
          /^Chapter\s+\d+/i.test(line) ||
          /^【.*】$/.test(line)) {
        result.push('');
        if (!/^━━━/.test(line)) result.push('━━━ ' + line + ' ━━━');
        else result.push(line);
        result.push('');
        continue;
      }

      // 对话行
      if (/^[""「『]/.test(line)) {
        result.push('　　' + line);
      } else {
        if (!/^　/.test(line)) result.push('　　' + line);
        else result.push(line);
      }
    }

    return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ── 计算字数和段落数 ──
  function countStats(text) {
    // 若是 HTML 先转纯文本
    if (typeof text === 'string' && text.trim().startsWith('<')) {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      text = doc.body ? doc.body.innerText : text;
    }
    const clean = text.replace(/\s+/g, '');
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    return { chars: clean.length, paragraphs: paragraphs.length };
  }

  // ── 提取文段（用于暮舟资源） ──
  function extractSegments(text, maxLen = 200) {
    // 若是 HTML 先转纯文本
    if (typeof text === 'string' && text.trim().startsWith('<')) {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      text = doc.body ? doc.body.innerText : text;
    }
    const paras = text.split(/\n\s*\n/).filter(p => p.trim().length > 10);
    return paras.map((p, i) => ({
      id: 'seg_' + i,
      index: i + 1,
      text: p.trim(),
      preview: p.trim().slice(0, maxLen) + (p.trim().length > maxLen ? '…' : '')
    }));
  }

  // ── 工具：确保 JSZip 已加载 ──
  async function ensureJSZip() {
    if (!window.JSZip) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }
  }

  // ── 动态加载外部脚本 ──
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Failed to load: ' + src));
      document.head.appendChild(s);
    });
  }

  return { parseFile, parseFiles, parseUrl, autoFormat, countStats, extractSegments, mdToHtml };
})();
