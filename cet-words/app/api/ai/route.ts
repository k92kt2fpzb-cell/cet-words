import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BASE = "https://api.deepseek.com";

interface AiRequest {
  task: "mnemonic" | "example" | "explain" | "test" | "expressions" | "extract-url";
  word?: string;
  senses?: { pos: string; cn: string; en: string }[];
  examTypes?: Record<string, number>;
  major?: string;
  question?: string;
  theme?: string;
  kind?: "writing" | "translation";
  url?: string;
  sourceText?: string;
  model?: string;
  stream?: boolean;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function buildMessages(body: AiRequest, sourceText = ""): { role: string; content: string }[] | null {
  const word = (body.word || "").trim();
  const senses = (body.senses || [])
    .map((s) => `${s.pos ? s.pos + " " : ""}${s.cn}${s.en ? "（" + s.en + "）" : ""}`)
    .join("；");
  const exam = Object.entries(body.examTypes || {})
    .map(([k, v]) => `${k} ${v} 次`)
    .join("、");

  if (body.task === "test") {
    return [
      { role: "system", content: "你是接口连通性测试助手，只回复要求的固定内容。" },
      { role: "user", content: "请只回复：pong" },
    ];
  }

  if (body.task === "mnemonic") {
    if (!word) return null;
    return [
      {
        role: "system",
        content:
          "你是中国大学生的四六级词汇教练，用简体中文回答。语言精炼、口语化、不要客套话，不要重复题目。" +
          "如果无法确认词源，就用联想/谐音/场景记忆，禁止编造学术上错误的词源。",
      },
      {
        role: "user",
        content:
          `请为四六级单词「${word}」生成助记材料${senses ? "（词典释义：" + senses + "）" : ""}。` +
          "严格按以下 Markdown 结构输出，每部分 1-3 行：\n" +
          "**词根拆解**：…\n**联想记忆**：…\n**易混词**：… 与 … 的区别\n**一句话记忆**：…",
      },
    ];
  }

  if (body.task === "example") {
    if (!word) return null;
    const major = (body.major || "").trim();
    return [
      {
        role: "system",
        content:
          "你是四六级英语例句作者，用简体中文解释，英文句子必须自然、符合四六级难度，语法正确。" +
          (major ? `学习者的专业/兴趣是：${major}，例句尽量贴合这个背景。` : ""),
      },
      {
        role: "user",
        content:
          `请用单词「${word}」${senses ? "（释义：" + senses + "）" : ""}写 3 个例句，` +
          "每个例句先英文、后中文翻译，一行一句，英文里用 **加粗** 标出该单词。不要输出其他解释。",
      },
    ];
  }

  if (body.task === "explain") {
    const question = (body.question || "").trim();
    if (!question) return null;
    return [
      {
        role: "system",
        content:
          "你是四六级英语老师，用简体中文讲解，先给结论再解释，必要时举 1-2 个四六级真题风格的例句。" +
          "回答控制在 200 字以内，不要输出无关内容。",
      },
      {
        role: "user",
        content:
          `关于单词「${word}」${senses ? "（词典释义：" + senses + "）" : ""}的问题：${question}` +
          (exam ? `\n补充信息：该词在近十年四六级真题中出现情况 ${exam}。` : ""),
      },
    ];
  }

  const expressionSystem =
    "你是中国大学生的四六级写作与翻译老师。请给出可以直接背诵、套用的地道表达。" +
    "每一行严格使用这个格式：英文表达 || 中文意思 || 一句话用法说明。" +
    "不要编号、不要标题、不要解释、不要额外文字。";

  if (body.task === "expressions") {
    const kind = body.kind === "translation" ? "翻译" : "写作";
    const theme = (body.theme || "").trim();
    return [
      { role: "system", content: expressionSystem },
      {
        role: "user",
        content: theme
          ? `请给出四六级${kind}中围绕「${theme}」这个主题最常用的 12 条高频表达，按格式输出 12 行。`
          : `请给出四六级${kind}中最通用的 12 条高分表达（万能句型 / 高频短语），按格式输出 12 行。`,
      },
    ];
  }

  if (body.task === "extract-url") {
    if (!sourceText) return null;
    const kind = body.kind === "translation" ? "翻译" : "写作";
    return [
      { role: "system", content: expressionSystem },
      {
        role: "user",
        content:
          `下面是从网页抓取的文字。请从中提炼出 15 条适合四六级${kind}的高频表达` +
          "（如果原文是中文，请给出对应的英文表达），按格式输出 15 行，忽略与英语学习无关的内容。\n\n" +
          sourceText,
      },
    ];
  }

  return null;
}

export async function POST(req: NextRequest) {
  let body: AiRequest;
  try {
    body = (await req.json()) as AiRequest;
  } catch {
    return json({ error: "请求体不是合法 JSON" }, 400);
  }

  // 每名用户使用自己的 Key（只存在浏览器本地），服务端不预置任何密钥
  const key = (req.headers.get("x-ai-key") || "").trim();
  if (!key) {
    return json({ error: "请先在「设置 → AI 助手」里填写你自己的 DeepSeek API Key（不填则无法使用 AI 功能）" }, 400);
  }
  const base = (req.headers.get("x-ai-base") || DEFAULT_BASE)
    .trim()
    .replace(/\/+$/, "");
  const model = (body.model || "deepseek-chat").trim();

  // 网页提取：先在服务端抓取网页并转成纯文本，再交给模型提炼
  let sourceText = "";
  if (body.task === "extract-url") {
    const target = (body.url || "").trim();
    if (!/^https?:\/\//i.test(target)) {
      return json({ error: "请填写完整的网页地址（以 http:// 或 https:// 开头）" }, 400);
    }
    try {
      const page = await fetch(target, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; CETWords/1.0)", accept: "text/html,*/*" },
        signal: AbortSignal.timeout(20000),
      });
      if (!page.ok) return json({ error: `网页抓取失败：HTTP ${page.status}` }, 502);
      const html = await page.text();
      sourceText = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);
      if (sourceText.length < 200) {
        return json({ error: "这个网页抓到的内容太少（可能需要登录或由脚本渲染），换一个页面试试" }, 400);
      }
    } catch (err) {
      return json({ error: `网页抓取失败：${(err as Error).message}` }, 502);
    }
  }

  const messages = buildMessages(body, sourceText);
  if (!messages) return json({ error: "未知的 AI 任务类型或缺少参数" }, 400);

  const stream = body.stream !== false;
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        stream,
        temperature: body.task === "test" ? 0 : 1,
        max_tokens: body.task === "test" ? 16 : body.task === "expressions" || body.task === "extract-url" ? 900 : 1200,
      }),
    });
  } catch (err) {
    return json({ error: `无法连接 ${base}：${(err as Error).message}` }, 502);
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    let hint = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      hint = parsed?.error?.message || hint;
    } catch {
      /* 保留原始文本 */
    }
    return json({ error: `DeepSeek 返回 ${upstream.status}：${hint}` }, upstream.status === 401 ? 401 : 502);
  }

  if (!stream) {
    const data = (await upstream.json()) as { choices?: { message?: { content?: string } }[] };
    return json({ ok: true, model, reply: data?.choices?.[0]?.message?.content ?? "" });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

