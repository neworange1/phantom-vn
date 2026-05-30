/**
 * Phantom VN 产品画像报告生成器
 * 输出：Phantom_VN_产品画像报告.docx
 */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, PageBreak, LevelFormat
} = require('docx');

// ── Helpers ──
const border = { style: BorderStyle.SINGLE, size: 1, color: "D4B896" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };
const headerBorder = { style: BorderStyle.SINGLE, size: 1, color: "C9944A" };
const headerBorders = { top: headerBorder, bottom: headerBorder, left: headerBorder, right: headerBorder };
const headerShading = { fill: "FDF6EE", type: ShadingType.CLEAR };

const A4W = 11906, A4H = 16838, MARGIN = 1440;
const CONTENT_W = A4W - 2 * MARGIN; // 9026

function heading1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function heading2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function heading3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 360 },
    ...opts,
    children: [new TextRun({ text, size: 21, font: "Microsoft YaHei", ...opts.run })]
  });
}
function boldPara(label, value) {
  return new Paragraph({
    spacing: { after: 80, line: 360 },
    children: [
      new TextRun({ text: label + "：", bold: true, size: 21, font: "Microsoft YaHei" }),
      new TextRun({ text: value, size: 21, font: "Microsoft YaHei" })
    ]
  });
}
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60, line: 340 },
    children: [new TextRun({ text, size: 20, font: "Microsoft YaHei" })]
  });
}
function subBullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 1 },
    spacing: { after: 60, line: 340 },
    children: [new TextRun({ text, size: 20, font: "Microsoft YaHei" })]
  });
}

function makeTable(headers, rows, colWidths) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    children: headers.map((h, i) => new TableCell({
      borders: headerBorders, shading: headerShading, width: { size: colWidths[i], type: WidthType.DXA },
      margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, font: "Microsoft YaHei" })] })]
    }))
  });
  const dataRows = rows.map(row =>
    new TableRow({
      children: row.map((cell, i) => new TableCell({
        borders, width: { size: colWidths[i], type: WidthType.DXA }, margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text: cell, size: 18, font: "Microsoft YaHei" })] })]
      }))
    })
  );
  return new Table({ width: { size: totalW, type: WidthType.DXA }, columnWidths: colWidths, rows: [headerRow, ...dataRows] });
}

// ── Document ──
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Microsoft YaHei", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Microsoft YaHei", color: "3D2015" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Microsoft YaHei", color: "6B4E3D" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Microsoft YaHei", color: "8A6D5B" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 270 } } } },
      ]},
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: A4W, height: A4H },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "Phantom VN 产品画像报告", size: 16, color: "B8A48E", font: "Microsoft YaHei", italics: true })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "— ", size: 16, color: "B8A48E" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "B8A48E" }),
            new TextRun({ text: " —", size: 16, color: "B8A48E" }),
          ]
        })]
      })
    },
    children: [

      // ═══════════════════════════════════════════
      // 封面
      // ═══════════════════════════════════════════
      new Paragraph({ spacing: { before: 2400 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Phantom Wild Visual Novel", size: 56, bold: true, font: "Microsoft YaHei", color: "3D2015" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: "轻视觉小说平台", size: 36, font: "Microsoft YaHei", color: "C9944A" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [new TextRun({ text: "产 品 画 像 报 告", size: 44, bold: true, font: "Microsoft YaHei", color: "8A6D5B" })]
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [
        new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━", size: 18, color: "D4B896" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [
        new TextRun({ text: "版本：v2.0", size: 24, font: "Microsoft YaHei", color: "6B4E3D" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [
        new TextRun({ text: "生成日期：2026年5月30日", size: 24, font: "Microsoft YaHei", color: "6B4E3D" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [
        new TextRun({ text: "版权所有：Jingqua Lin", size: 24, font: "Microsoft YaHei", color: "6B4E3D" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [
        new TextRun({ text: "域名：https://phantom-vn.vercel.app", size: 24, font: "Microsoft YaHei", color: "6B4E3D" })
      ]}),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 目录
      // ═══════════════════════════════════════════
      heading1("目录"),
      para("一、产品概述"),
      para("二、产品定位与市场分析"),
      para("三、平台架构总览"),
      para("四、功能模块详解"),
      para("　　4.1 用户系统"),
      para("　　4.2 读者面板"),
      para("　　4.3 作者面板 — 创作工坊"),
      para("　　4.4 作者面板 — 发布中心"),
      para("　　4.5 作者面板 — 成品库"),
      para("五、AI 智能体体系"),
      para("六、技术架构"),
      para("七、数据库设计"),
      para("八、API 接口体系"),
      para("九、UI/UX 设计体系"),
      para("十、视觉效果系统"),
      para("十一、部署与运维"),
      para("十二、版本历史与当前状态"),
      para("十三、路线图与待办事项"),
      para("十四、技术债务与已知问题"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 一、产品概述
      // ═══════════════════════════════════════════
      heading1("一、产品概述"),

      heading2("1.1 产品身份"),
      boldPara("产品名称", "Phantom Wild Visual Novel（幻野轻视觉小说）"),
      boldPara("产品类型", "Web 应用 / UGC 平台 / 视觉小说创作与阅读工具"),
      boldPara("Slogan", "在文字与光影之间，开启你的视觉小说之旅"),
      boldPara("品牌标语", "我们都是过去式的幽灵（We are all ghosts of the past）"),
      boldPara("版权所有", "Jingqua Lin"),
      boldPara("线上地址", "https://phantom-vn.vercel.app"),
      boldPara("代码仓库", "GitHub: neworange1/phantom-vn"),

      heading2("1.2 一句话定位"),
      para("介于传统纸质小说与视觉小说游戏之间的全新轻视觉小说创作与阅读平台。"),

      heading2("1.3 核心价值主张"),
      bullet("写作者：将纯文字小说快速转化为带有场景配图、分支剧情、视觉特效的轻视觉小说"),
      bullet("阅读者：享受花瓣飘落、滚动渐显、快门转场等沉浸式阅读体验"),
      bullet("平台方：通过 AI 智能体（字吻/花花/暮舟）辅助创作，降低视觉小说制作门槛"),

      heading2("1.4 品类定义"),
      para('Phantom VN 定位为"轻视觉小说"（Light Visual Novel），这是一个全球品类空白的新概念：'),
      bullet("比传统纸质小说更多维 —— 有配图、动画、分支、BGM"),
      bullet("比视觉小说游戏更轻量 —— 无需游戏引擎，浏览器即开即读"),
      bullet("比漫画/轻小说更自由 —— 作者可自主定义视觉风格与叙事结构"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 二、产品定位与市场分析
      // ═══════════════════════════════════════════
      heading1("二、产品定位与市场分析"),

      heading2("2.1 目标用户"),
      makeTable(
        ["用户角色", "描述", "核心需求"],
        [
          ["读者 (Reader)", "喜爱小说的普通读者，偏好沉浸式阅读体验", "发现、阅读、收藏、评论视觉小说"],
          ["作者 (Author)", "小说创作者，希望作品有更强的视觉表现力", "创作、排版、配图、发布、管理作品"],
          ["管理员 (Admin)", "平台运营者", "内容审核、用户管理、数据分析"],
        ],
        [1800, 3613, 3613]
      ),

      heading2("2.2 竞品对比"),
      makeTable(
        ["维度", "传统小说网站", "视觉小说游戏", "Phantom VN"],
        [
          ["创作门槛", "低（纯文字）", "高（需要游戏引擎+美术）", "中（AI辅助+低代码编辑器）"],
          ["阅读体验", "纯文字", "全动画+配音", "文字+配图+轻特效"],
          ["分发方式", "网站/App", "Steam/独立下载", "Web 即点即读"],
          ["制作周期", "天", "月~年", "小时~天"],
          ["成本", "几乎为零", "数万~数十万", "免费（AI生成配图）"],
        ],
        [1800, 2400, 2400, 2426]
      ),

      heading2("2.3 品类优势"),
      bullet('填补空白：在"小说"与"游戏"之间建立新品类'),
      bullet("AI 降本：DeepSeek 文字润色 + Pollinations.ai 配图生成，零美术成本"),
      bullet("Web 原生：无需安装，浏览器打开即用，适合移动端分享传播"),
      bullet("UGC 生态：作者创作 → 读者消费 → 互动反馈，形成内容正循环"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 三、平台架构总览
      // ═══════════════════════════════════════════
      heading1("三、平台架构总览"),

      heading2("3.1 四大核心板块"),
      makeTable(
        ["板块", "定位", "核心功能"],
        [
          ["用户注册", "身份入口", "邮箱注册/登录、角色激活（读者→作者）、个人资料"],
          ["作者界面", "创作端", "创作工坊（文本导入/编辑）、发布中心（HTML生成/打包）、成品库（作品管理）"],
          ["读者界面", "消费端", "首页推荐、探索发现、沉浸阅读、社交互动（点赞/收藏/评论）"],
          ["平台端", "基础设施", "API服务、数据库、AI代理、部署运维"],
        ],
        [1800, 1800, 5426]
      ),

      heading2("3.2 SPA 路由架构"),
      para("Phantom VN 采用单页应用（SPA）架构，index.html 作为壳应用，所有页面通过 hash 路由驱动："),
      makeTable(
        ["路由", "面板", "说明"],
        [
          ["#home", "首页", "Hero区域 + 推荐作品墙 + 页脚"],
          ["#reader", "读者面板", "包含首页入口 + 探索作品子面板"],
          ["#author", "作者面板", "包含创作工坊 + 发布中心 + 成品库三个子面板"],
          ["#story/{id}", "阅读页", "沉浸式视觉小说阅读器"],
          ["/profile/{username}", "作者主页", "作者个人主页（规划中）"],
        ],
        [2400, 2400, 4226]
      ),

      heading2("3.3 Dashboard 双面板模式"),
      para("读者面板和作者面板采用 Dashboard 设计，通过 dash-nav 导航栏切换子面板。子面板通过 DOM move 动态嵌入 dashboard 内容区，保留所有事件监听器。顶部导航栏精简为 Logo + 主题切换 + 认证 + 新建项目，不再包含 tab 按钮。"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 四、功能模块详解
      // ═══════════════════════════════════════════
      heading1("四、功能模块详解"),

      heading2("4.1 用户系统"),
      heading3("4.1.1 认证体系"),
      bullet("注册：邮箱 + 用户名 + 密码，通过 /api/user 接口对接 Supabase"),
      bullet("登录：邮箱 + 密码，JWT token 管理"),
      bullet("角色：reader（默认）/ author（手动激活）/ admin"),
      bullet("用户下拉菜单：角色显示、激活作者身份、个人资料、我的作品、退出登录"),
      bullet("顶栏状态切换：未登录显示登录/注册按钮，已登录显示头像+用户名"),

      heading3("4.1.2 数据库用户表"),
      para("users 表包含：id, username, email, password_hash, role（reader/author/admin）, avatar_url, bio, created_at。RLS 策略允许公开读取、任何人注册、用户自助更新资料。"),

      heading2("4.2 读者面板"),
      heading3("4.2.1 首页 (#tab-home)"),
      bullet("Hero 区域：品牌标题 Phantom Wild Visual Novel + 标语 + CTA按钮（开始探索/创作故事）"),
      bullet("推荐作品墙：网格布局展示热门作品卡片（封面图、标题、简介）"),
      bullet("页脚：版权信息（© 2026 Jingqua Lin）"),
      bullet("渐变背景：fdf6ee → fef0f3 → fce4ec → f8e8d0"),

      heading3("4.2.2 探索页"),
      bullet("搜索：基于关键词搜索，后端 Supabase ilike 匹配 title + summary"),
      bullet("分类筛选：按模板类型（古风/现代/悬疑/自定义）过滤"),
      bullet("排序：按创建时间 / 阅读量 / 点赞数排序"),
      bullet("作品卡片：封面图 + 标题 + 作者 + 简介 + 浏览量 + 点赞数"),
      bullet("对接 /api/stories?search= 接口进行实时搜索"),

      heading3("4.2.3 阅读页 (#story/{id})"),
      bullet("沉浸式阅读器：全屏模式、花瓣飘落、滚动渐显、快门转场"),
      bullet("阅读设置面板：字体大小、行距、背景色、动画开关"),
      bullet("社交媒体接线：点赞（toggle）、收藏（toggle）、评论（加载/发布/刷新）"),
      bullet("视觉效果引擎：VNEffects 模块提供 7 种可配置视觉效果"),
      bullet("分支剧情支持：段落选项跳转（规划中交互完善）"),

      heading2("4.3 作者面板 — 创作工坊"),
      para("创作工坊是三栏布局的编辑器，是平台核心创作工具："),

      heading3("4.3.1 左栏 — 原文导入"),
      bullet("导入方式：文件导入（PDF/DOCX/TXT/MD/EPUB/HTML，支持多选）、网页爬取、直接粘贴"),
      bullet("格式工具栏（三行布局）："),
      subBullet("第一行：字号选择器 + 字体选择器（宋体风/黑体风/可爱风/等宽）+ 行距选择器 + B/I/H2/H3 格式按钮"),
      subBullet("第二行：◆ 场景标记按钮 + 🖼 配图按钮 + ↯ 分支按钮"),
      subBullet('第三行：✦ 自动整理 + "第一行设为标题"开关'),
      bullet("编辑器：contenteditable div，支持实时字数/段落统计"),
      bullet("浮动选中气泡：选中文字后自动弹出，提供「字吻优化」和「花花配图」快捷操作"),
      bullet("分支剧情面板：为段落添加分支选项，设置选项文字 + 目标跳转段落编号"),
      bullet("配图插入弹窗：三个 Tab（本地上传 / 图片链接 / 素材库），支持预览和插入"),
      bullet("场景标记：选中文字后点击 ◆场景 将内容包裹为场景分隔符"),

      heading3("4.3.2 中栏 — 智能体工作区"),
      para("三个 AI 智能体的对话式工作区（详见第五章）"),

      heading3("4.3.3 右栏 — 排版设计面板"),
      bullet("自动同步左侧编辑器内容，实时预览排版效果"),
      bullet("背景模板选择器"),
      bullet("插入项工具（分隔线、装饰元素等）"),

      heading2("4.4 作者面板 — 发布中心"),
      bullet("对接 HTML 生成引擎（html-generator.js），将场景输出为独立 .html 文件"),
      bullet("双模式选择：滚动模式 / 剧场模式（翻页式）"),
      bullet("5 种视觉模板：古风、现代、悬疑、自定义、默认"),
      bullet("内嵌视觉效果：花瓣飘落、滚动渐显、快门转场等"),
      bullet("离线包打包（offline-pack.js）：外部图片自动转 data URI + JSZip 生成 ZIP"),
      bullet("Markdown 导出支持"),
      bullet("作品选择器绑定（选择要发布的作品）"),

      heading2("4.5 作者面板 — 成品库"),
      bullet("作品列表展示：标题、封面、状态（草稿/已发布/私密）、更新时间"),
      bullet("作品管理：编辑、预览、删除（双重确认弹窗）"),
      bullet("作品状态筛选"),

      heading2("4.6 特色交互设计"),
      bullet("木鱼禅意功能：🪘 按钮，点击敲木鱼计数，每10次写入 localStorage，上限 999999"),
      bullet("久坐提醒：定时弹出提醒弹窗，提示作者休息"),
      bullet("写作鼓励弹窗：达到一定字数后弹出鼓励消息"),
      bullet("Konami Code 彩蛋：特定按键序列触发隐藏效果"),
      bullet("Logo 彩蛋：点击 Logo 触发隐藏动画"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 五、AI 智能体体系
      // ═══════════════════════════════════════════
      heading1("五、AI 智能体体系"),

      para("Phantom VN 内置三个 AI 智能体，分别负责文字、图片、整合三个环节。所有 LLM 调用通过 Vercel Serverless /api/chat 代理 DeepSeek API，图片生成通过 /api/image 代理 Pollinations.ai（免费）。API Key 仅存在于 Vercel 环境变量，前端无硬编码。"),

      heading2("5.1 字吻（Ziwen）— 文字润色"),
      makeTable(
        ["维度", "详情"],
        [
          ["定位", "文字优化师，负责文本润色、扩写、改写、精炼、对白化"],
          ["模式", "润色 / 扩写 / 改写 / 精炼 / 对白化（5种）"],
          ["强度控制", "0-100% 保留原意滑块"],
          ["多版本", "支持生成 3 个版本对比选择"],
          ["交互", "选中文本 → 浮动气泡快捷调用，或直接在对话区输入"],
          ["输出", "优化结果可替换原文 / 复制 / 加入暮舟资源库"],
          ["头像", "assets/ziwen.jpg"],
        ],
        [2400, 6626]
      ),

      heading2("5.2 花花（Huahua）— 配图生成"),
      makeTable(
        ["维度", "详情"],
        [
          ["定位", "视觉设计师，负责场景图、角色立绘、头像、UI模板、封面生成"],
          ["模式", "场景图 / 角色立绘 / 头像 / UI模板 / 封面（5种）"],
          ["风格", "动漫插画 / 水墨写意 / 油画厚涂 / 像素风 / 水彩淡彩 / 真实感 / 扁平插图（7种）"],
          ["比例", "横版 16:9 / 竖版 9:16"],
          ["角色系统", "支持添加角色设定（名称+外貌描述），生成时注入角色信息以提高一致性"],
          ["参考图", "支持上传参考图（以图生图）"],
          ["输出", "生成图片可加入资源库 / 下载 / 插入编辑器"],
          ["后端", "Pollinations.ai（免费），通过 Vercel /api/image 代理"],
          ["头像", "assets/huahua.jpg"],
        ],
        [2400, 6626]
      ),

      heading2("5.3 暮舟（Mzhou）— 整合发布"),
      makeTable(
        ["维度", "详情"],
        [
          ["定位", "项目整合师，融合文字与图片资源，生成完整视觉小说"],
          ["资源总览", "展示已有文段数量 + 已有图片缩略图网格"],
          ["输出", "生成独立 HTML 文件（滚动/剧场双模式），可打包为 ZIP 下载"],
          ["对接", "发布中心 → HTML 生成引擎 → 离线打包"],
          ["头像", "assets/mzhou.jpg"],
        ],
        [2400, 6626]
      ),

      heading2("5.4 智能体通用特性"),
      bullet("对话历史管理（每个智能体独立维护聊天记录）"),
      bullet("「思考中……」提示动画（showThinking/hideThinking 覆盖三智能体 send 流程）"),
      bullet("API 不可用时自动进入演示模式（demo_mode 标识），显示错误提示"),
      bullet("图片 URL 校验使用 Image() onload/onerror 方案"),
      bullet("Base64 编码使用 TextEncoder 替代已废弃的 unescape()"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 六、技术架构
      // ═══════════════════════════════════════════
      heading1("六、技术架构"),

      heading2("6.1 技术栈总览"),
      makeTable(
        ["层级", "技术选型", "说明"],
        [
          ["前端", "纯 HTML/CSS/JS（无框架）", "SPA 单页应用，hash 路由，无构建工具"],
          ["CSS 框架", "Neumorphism UI", "青色+金色+金粉纹理，5套常驻主题"],
          ["字体", "Google Fonts", "Ma Shan Zheng + Noto Serif SC + Noto Sans SC"],
          ["后端", "Vercel Serverless Functions", "10 个 API 端点，Node.js runtime"],
          ["数据库", "Supabase PostgreSQL", "8 张业务表 + RLS 行级安全"],
          ["AI 文字", "DeepSeek API", "通过 /api/chat 代理，API Key 仅存于 Vercel 环境变量"],
          ["AI 图片", "Pollinations.ai", "通过 /api/image 代理，免费生成"],
          ["部署", "Vercel + GitHub", "自动从 GitHub 部署，rewrites 指向 index.html"],
          ["文件处理", "mammoth (docx) + pdf.js + marked", "导入时解析各类文档格式"],
        ],
        [1800, 3613, 3613]
      ),

      heading2("6.2 前端架构"),
      bullet("index.html：壳应用，包含所有 HTML 面板和嵌入样式"),
      bullet("js/app.js：主应用入口 —— Tab切换、Panel折叠、事件总线、编辑器逻辑、全局工具函数"),
      bullet("js/auth.js：认证模块 —— 登录/注册/登出、用户状态管理、角色激活"),
      bullet("js/agents.js：AI 智能体模块 —— 字吻/花花/暮舟的 UI 交互与 API 调用"),
      bullet("js/parser.js：文档解析器 —— PDF/DOCX/TXT/MD/EPUB/HTML 导入解析"),
      bullet("js/vn-effects.js：视觉效果引擎 —— 花瓣飘落/滚动渐显/快门转场/视差光晕/鼠标粒子/点击涟漪/全屏模式"),
      bullet("js/html-generator.js：HTML 生成引擎 —— 将场景数据生成独立 .html 文件"),
      bullet("js/offline-pack.js：离线打包 —— 外部图片转 data URI + JSZip 打包 ZIP"),
      bullet("js/manager.js：作品管理器 —— 成品库 CRUD、确认删除等"),
      bullet("css/style.css：全局样式 —— Neumorphism UI、主题变量、布局系统"),
      bullet("css/vn-effects.css：视觉效果样式 —— 14 个视觉效果 CSS 定义"),

      heading2("6.3 数据流"),
      para("前端 → /api/* (Vercel Serverless) → Supabase PostgreSQL。API Key 和数据库凭据全部存于 Vercel 环境变量，前端通过 fetch 调用 API 端点获取数据。"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 七、数据库设计
      // ═══════════════════════════════════════════
      heading1("七、数据库设计"),

      heading2("7.1 数据表概览"),
      makeTable(
        ["表名", "用途", "核心字段"],
        [
          ["users", "用户", "id, username, email, password_hash, role, avatar_url, bio, created_at"],
          ["stories", "作品", "id, author_id, title, summary, tags[], cover_image_url, bgm_url, template, branch_enabled, status, html_content, view_count, like_count"],
          ["chapters", "章节", "id, story_id, chapter_number, title, content, html_fragment, bgm_url"],
          ["paragraphs", "段落", "id, story_id, chapter_id, content, image_url, image_style, effects[], order_index"],
          ["branches", "分支剧情", "id, story_id, chapter_id, paragraph_index, option_text, target_chapter_id, target_paragraph_index"],
          ["likes", "点赞", "id, user_id, story_id, created_at, UNIQUE(user_id, story_id)"],
          ["comments", "评论", "id, user_id, story_id, content, created_at"],
          ["favorites", "收藏", "id, user_id, story_id, created_at, UNIQUE(user_id, story_id)"],
        ],
        [1600, 1400, 6026]
      ),

      heading2("7.2 关键设计"),
      bullet("stories.status：draft / published / private 三态，控制可见性"),
      bullet("stories.template：ancient / modern / mystery / custom 四种视觉风格"),
      bullet("paragraphs.image_style：visual-card / polaroid / banner / none 四种图片展示方式"),
      bullet("paragraphs.effects：PostgreSQL TEXT[] 数组，存储段落级特效"),
      bullet("branches：支持跨章节跳转（target_chapter_id + target_paragraph_index）"),

      heading2("7.3 索引与性能"),
      bullet("所有外键字段均已建立索引"),
      bullet("likes 和 favorites 设置 UNIQUE 约束防止重复操作"),
      bullet("RLS 策略：已发布作品公开可读，其他操作由 service_role 控制"),

      heading2("7.4 RPC 函数"),
      bullet("increment_view(story_id)：原子化增加阅读量"),
      bullet("update_like_count(story_id)：同步更新作品点赞计数"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 八、API 接口体系
      // ═══════════════════════════════════════════
      heading1("八、API 接口体系"),

      makeTable(
        ["接口", "方法", "超时", "功能"],
        [
          ["/api/chat", "POST", "30s", "AI 文字生成代理，转发到 DeepSeek API"],
          ["/api/image", "POST", "30s", "AI 图片生成代理，转发到 Pollinations.ai"],
          ["/api/user", "GET/POST", "10s", "用户注册/登录/信息查询"],
          ["/api/stories", "GET/POST", "10s", "作品列表/搜索/创建"],
          ["/api/chapters", "GET/POST", "10s", "章节读取/创建"],
          ["/api/paragraphs", "GET/POST", "10s", "段落读取/创建"],
          ["/api/branches", "GET/POST", "10s", "分支剧情读取/创建"],
          ["/api/social", "GET/POST/DELETE", "10s", "点赞/收藏/评论"],
          ["/api/health", "GET", "10s", "健康检查端点"],
          ["/api/supabase-client", "—", "—", "Supabase 客户端单例（JWT+service_key）"],
        ],
        [2400, 1600, 1200, 3826]
      ),

      heading2("8.1 安全设计"),
      bullet("API Key 和数据库凭据全部存于 Vercel 环境变量：DEEPSEEK_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY"),
      bullet("前端不持有任何 Key，所有敏感调用均通过 Vercel Serverless 代理"),
      bullet("RLS 策略确保数据库级别的权限隔离"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 九、UI/UX 设计体系
      // ═══════════════════════════════════════════
      heading1("九、UI/UX 设计体系"),

      heading2("9.1 设计风格"),
      bullet("核心风格：Neumorphism（新拟态）—— 柔和阴影、内凹/外凸质感"),
      bullet("配色体系：青色 + 金色（#C9944A）+ 金粉纹理"),
      bullet("字体系统：马善政（Ma Shan Zheng）用于标题、Noto Serif SC 用于正文、Noto Sans SC 用于 UI"),

      heading2("9.2 五套常驻主题"),
      makeTable(
        ["主题", "CSS类", "主色调", "适用场景"],
        [
          ["桃花（默认）", "theme-peach", "粉暖色系 (fdf6ee/fef0f3)", "通用、浪漫、日常"],
          ["暗紫", "theme-purple", "深紫暗色系", "夜晚模式、悬疑氛围"],
          ["清新", "theme-green", "淡绿自然系", "清新、治愈题材"],
          ["青金", "theme-bluegold", "深蓝+金色", "史诗、古风、正式"],
          ["回忆/Vintage", "theme-vintage", "泛黄怀旧", "回忆录、年代题材"],
        ],
        [1800, 1800, 2400, 3026]
      ),

      heading2("9.3 主题切换机制"),
      para("通过 #themeToggle 按钮循环切换，CSS 使用 .theme-{name} 类名 + 全局 CSS 变量（--bg, --bg-mid, --text-secondary, --accent-purple 等）来控制主题色。花瓣飘落效果也随主题变化（桃花/银杏/雪等）。"),

      heading2("9.4 响应式设计"),
      bullet("创作工坊三栏布局：左栏（可折叠/展开）+ 中栏（智能体）+ 右栏（排版设计）"),
      bullet("面板折叠按钮：左栏支持 ◁ 收起 / ⤢ 双倍展开"),
      bullet("移动端适配：顶栏精简、卡片网格自适应（auto-fill, minmax(300px, 1fr)）"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 十、视觉效果系统
      // ═══════════════════════════════════════════
      heading1("十、视觉效果系统"),

      heading2("10.1 VNEffects 引擎"),
      para("可复用的视觉效果模块，独立文件 js/vn-effects.js + css/vn-effects.css，提供 7 种可配置的视觉效果："),

      makeTable(
        ["效果名称", "描述", "配置参数"],
        [
          ["花瓣飘落", "粉色花瓣从顶部飘落（默认主题专用）", "密度、速度、花瓣类型"],
          ["滚动渐显", "页面滚动时元素淡入上升", "触发偏移、动画时长"],
          ["快门转场", "段落间切换的相机快门效果", "转场时长、方向"],
          ["视差光晕", "鼠标移动驱动背景光晕位移", "光晕大小、颜色、跟随速度"],
          ["鼠标粒子", "鼠标周围粒子拖尾效果", "粒子数量、颜色、生命周期"],
          ["点击涟漪", "点击位置扩散波纹", "波纹颜色、扩散速度、最大半径"],
          ["全屏模式", "沉浸式全屏阅读", "背景色、字体缩放"],
        ],
        [1800, 3600, 3626]
      ),

      heading2("10.2 效果配置"),
      para("VNEffects.init() 接受配置对象，按需启用效果："),
      para("{ petals: false, scrollReveal: true, parallax: true, cursorParticles: true, clickRipple: true }"),
      para("各效果支持独立参数调整，如花瓣密度、粒子数量、转场速度等。"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 十一、部署与运维
      // ═══════════════════════════════════════════
      heading1("十一、部署与运维"),

      heading2("11.1 部署架构"),
      makeTable(
        ["组件", "平台", "说明"],
        [
          ["前端托管", "Vercel", "静态文件 + Serverless Functions，自动从 GitHub 部署"],
          ["数据库", "Supabase", "PostgreSQL 云数据库，含 RLS 和 RPC"],
          ["代码托管", "GitHub", "neworange1/phantom-vn 仓库"],
          ["域名", "Vercel 自动分配", "https://phantom-vn.vercel.app"],
        ],
        [2000, 2400, 4626]
      ),

      heading2("11.2 Vercel 配置"),
      para("vercel.json 配置了 9 个 Serverless Function 的路由和超时限制，以及 5 条 rewrites 规则将所有子路由指向 index.html（SPA 必需）。"),

      heading2("11.3 已知部署问题"),
      bullet("git push 因 schannel 网络问题长期失败，当前使用 GitHub REST API PUT 逐文件上传"),
      bullet("每次修改需确认所有受影响文件都已上传，避免 app.js 和 index.html 版本不匹配"),

      heading2("11.4 环境变量"),
      para("Vercel 环境变量：DEEPSEEK_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY。所有敏感凭据通过 Vercel Dashboard 管理。"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 十二、版本历史与当前状态
      // ═══════════════════════════════════════════
      heading1("十二、版本历史与当前状态"),

      heading2("12.1 当前版本：v2.0"),
      para("截至 2026年5月30日，Phantom VN 处于 v2.0 版本。已完成的主要功能："),

      heading3("v2.0 已完成清单"),
      bullet("品牌升级：首页 Phantom Wild Visual Novel 品牌化"),
      bullet("SPA 单页应用：三页面统一为 index.html 壳 + hash 路由"),
      bullet("用户系统：Supabase 对接，邮箱+用户名登录/注册，读者/作者/管理员三角色"),
      bullet("探索页：分类/搜索/排序/作品卡片 + Supabase ilike 搜索"),
      bullet("阅读页：花瓣飘落/滚动渐显/快门转场/阅读设置面板"),
      bullet("社交媒体接线：点赞/收藏/评论对接 /api/social"),
      bullet("编辑器升级：场景标记UI、配图插入UI（三Tab）、分支剧情UI"),
      bullet("五套常驻主题：桃花/暗紫/清新/青金/回忆"),
      bullet("可复用视觉效果：css/vn-effects.css + js/vn-effects.js（7种效果）"),
      bullet("AI 智能体体系：字吻/花花/暮舟 + DeepSeek API + Pollinations.ai"),
      bullet("HTML 生成引擎：场景 → 独立 .html，双模式 + 5模板 + 内嵌效果"),
      bullet("离线包打包：外部图片转 data URI + JSZip 生成 ZIP"),
      bullet("格式按钮：纯 DOM 操作（B/I/H2/H3 toggle），不依赖 execCommand"),
      bullet("Logo 替换：全部 ◈ 符号替换为抠图 logo"),
      bullet("DeepSeek API Key 封装：仅 Vercel 环境变量，无硬编码回退"),
      bullet("排版面板：自动同步编辑器内容 + 背景模板 + 插入项工具"),
      bullet("特色交互：木鱼禅意、久坐提醒、写作鼓励弹窗、Konami Code 彩蛋"),
      bullet("20 个 Bug 修复（P0/P1/P2，详见 BUG_REPORT.md）"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 十三、路线图与待办
      // ═══════════════════════════════════════════
      heading1("十三、路线图与待办事项"),

      heading2("13.1 短期待办（v2.x）"),
      makeTable(
        ["优先级", "功能", "描述"],
        [
          ["高", "BGM 设置 UI", "音频上传 + 播放控制面板"],
          ["高", "BGM 播放系统", "基于 Web Audio API 的背景音乐播放"],
          ["中", "作者主页 /profile/[username]", "作者个人主页，展示作品列表和个人信息"],
          ["中", "分支剧情阅读交互", "阅读页的分支选项选择与跳转"],
        ],
        [1200, 3600, 4226]
      ),

      heading2("13.2 中期规划"),
      bullet("移动端 PWA 适配：Service Worker 离线缓存 + 添加到主屏幕"),
      bullet("多语言支持：英文界面国际化"),
      bullet("作品数据统计面板：作者端查看阅读量、点赞趋势、评论分析"),
      bullet("协作创作：多人协作编辑同一作品"),
      bullet("模板市场：用户可分享和下载视觉小说模板"),

      heading2("13.3 长期愿景"),
      bullet("AI 驱动的全自动小说生成：输入大纲 → AI 生成全文 + 配图 + 排版"),
      bullet("社区生态：读者打赏、作者订阅、作品排名"),
      bullet("开放 API：第三方工具可接入 Phantom VN 生态"),

      new Paragraph({ children: [new PageBreak()] }),

      // ═══════════════════════════════════════════
      // 十四、技术债务与已知问题
      // ═══════════════════════════════════════════
      heading1("十四、技术债务与已知问题"),

      heading2("14.1 已修复的 Bug（v2.0）"),
      para("2026年5月29日代码自检发现 20 个 bug（P0:4, P1:6, P2:10），已全部修复。涵盖："),
      bullet("P0：validateImageUrl 方案升级、unescape 替换为 TextEncoder、auth.js showToast 调用修复、_applyBlockFormat DOM 保护"),
      bullet("P1：浮动气泡选区过期修复、escapeAttr 反斜杠转义、selectionchange 性能优化、格式按钮视觉反馈"),
      bullet("P2：字体路径注释、重复循环守卫、冗余标签清理、图片失败计数、双重确认删除等"),

      heading2("14.2 技术债务"),
      makeTable(
        ["分类", "问题", "影响"],
        [
          ["部署", "git push 不可用，依赖 GitHub API 逐文件上传", "部署效率低，易遗漏文件"],
          ["架构", "无构建工具，所有 JS/CSS 为单文件", "代码组织困难，不利于团队协作"],
          ["测试", "无自动化测试覆盖", "回归风险高，功能验证依赖人工"],
          ["监控", "无错误追踪和日志系统", "线上问题难以定位"],
          ["安全", "部分 API 端点鉴权依赖前端逻辑", "需加强后端 token 校验"],
        ],
        [1500, 4000, 3526]
      ),

      heading2("14.3 建议改进项"),
      bullet("引入构建工具（如 Vite）实现代码分割和 Tree Shaking"),
      bullet("添加 ESLint + Prettier 统一代码风格"),
      bullet("引入 Sentry 或类似工具进行前端错误追踪"),
      bullet("编写核心模块的单元测试（Jest 或 Vitest）"),
      bullet("优化 GitHub Actions CI/CD 流程"),

      // ── 结尾 ──
      new Paragraph({ spacing: { before: 600, after: 200 }, children: [] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━", size: 18, color: "D4B896" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [
        new TextRun({ text: "报告完", size: 24, bold: true, font: "Microsoft YaHei", color: "8A6D5B" })
      ]}),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
        new TextRun({ text: "Phantom Wild Visual Novel — 轻视觉小说平台产品画像", size: 18, font: "Microsoft YaHei", color: "B8A48E", italics: true })
      ]}),
    ]
  }]
});

// ── Generate ──
const OUT = "C:\\Users\\32045\\Desktop\\网站\\phantom-vn\\Phantom_VN_产品画像报告.docx";
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUT, buffer);
  console.log("OK: " + OUT);
  console.log("Size: " + (buffer.length / 1024).toFixed(1) + " KB");
}).catch(err => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
