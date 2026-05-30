/**
 * offline-pack.js — 离线包打包引擎
 *
 * 将视觉小说打包为可离线阅读的 ZIP 文件。
 * - 扫描场景中的外部图片 URL → 转为 data URI
 * - 生成自包含 HTML
 * - 用 JSZip 打包下载
 *
 * 使用方式：
 *   await OfflinePack.generate({
 *     title, author, scenes, template, mode, options
 *   });
 */

const OfflinePack = (() => {

  /**
   * 判断 URL 是否为外部链接（非 data: 非 blob:）
   */
  function isExternalUrl(url) {
    if (!url) return false;
    if (/^data:/i.test(url)) return false;
    if (/^blob:/i.test(url)) return false;
    return true;
  }

  /**
   * 将外部图片 URL 转为 data URI
   * 通过 Canvas 跨域加载 → toDataURL
   * 失败时保留原 URL（降级，ZIP 仍然可下载但图片需联网）
   */
  function urlToDataUri(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          resolve(url); // 降级
        }
      };
      img.onerror = () => resolve(url); // 降级：保留原 URL
      img.src = url;
    });
  }

  /**
   * 处理场景数据，将外部图片转为 data URI
   * 返回深拷贝后的场景数组
   */
  async function inlineSceneImages(scenes) {
    const inlined = [];
    let failCount = 0;
    for (const s of scenes) {
      const scene = { ...s };
      if (isExternalUrl(scene.bgImage)) {
        const inlinedUrl = await urlToDataUri(scene.bgImage);
        if (inlinedUrl === scene.bgImage) failCount++;  // 降级：图片未成功内联
        scene.bgImage = inlinedUrl;
      }
      inlined.push(scene);
    }
    return { scenes: inlined, failCount };
  }

  /**
   * 主入口：生成离线 ZIP 并触发下载
   */
  async function generate(params) {
    const { title = '视觉小说', onProgress } = params;

    // Step 1: 内联外部图片
    const totalImages = (params.scenes || []).filter(s => isExternalUrl(s.bgImage)).length;
    if (onProgress) onProgress({ stage: 'images', current: 0, total: totalImages });

    const { scenes, failCount } = await inlineSceneImages(params.scenes || []);

    if (failCount > 0 && window.App?.showToast) {
      window.App.showToast(`${failCount} 张图片无法内嵌，离线时可能无法显示`, 'warning');
    }

    if (onProgress) onProgress({ stage: 'images', current: totalImages, total: totalImages });

    // Step 2: 用 HtmlGenerator 生成 HTML
    if (onProgress) onProgress({ stage: 'html' });
    const html = HtmlGenerator.generate({ ...params, scenes });

    // Step 3: 创建 ZIP
    if (onProgress) onProgress({ stage: 'zip' });

    if (typeof JSZip === 'undefined') {
      // JSZip 未加载时降级为单 HTML 下载
      HtmlGenerator.download(html, title + '.html');
      return { htmlOnly: true, reason: 'JSZip 未加载，已降级为单文件 HTML' };
    }

    const zip = new JSZip();
    zip.file(title + '.html', html);
    zip.file('说明.txt', [
      'Phantom Wild Visual Novel — 离线视觉小说包',
      '=============================================',
      '',
      '用法：解压后双击 .html 文件即可在任何浏览器中阅读。',
      '无需网络连接，所有图片已内嵌。',
      '',
      '生成工具：Phantom VN HTML Generator',
      '平台：https://phantom-vn.vercel.app'
    ].join('\n'));

    if (onProgress) onProgress({ stage: 'compress' });

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    }, (meta) => {
      if (onProgress) onProgress({ stage: 'compress', percent: meta.percent });
    });

    // Step 4: 触发下载
    downloadBlob(blob, title + '.zip');
    return { ok: true, blob, size: blob.size };
  }

  /**
   * 触发 Blob 下载
   */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 200);
  }

  return { generate, inlineSceneImages, isExternalUrl };
})();
