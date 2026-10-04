import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BASE = "https://api.deepseek.com";

interface AiRequest {
  task: "mnemonic" | "example" | "explain" | "test";
  word?: string;
  senses?: { pos: string; cn: string; en: string }[];
  examTypes?: Record<string, number>;
  major?: string;
  question?: string;
  model?: string;
  stream?: boolean;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function buildMessages(body: AiRequest): { role: string; content: string }[] | null {
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
  const messages = buildMessages(body);
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
        max_tokens: body.task === "test" ? 16 : 1200,
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

