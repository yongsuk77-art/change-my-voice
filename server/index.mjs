import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const isProd = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 5173);
const defaultModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: process.env.OPENAI_API_KEY ? "openai" : "local",
    model: defaultModel
  });
});

app.post("/api/rewrite", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({
      error: "OPENAI_API_KEY가 설정되어 있지 않아 로컬 변환 모드로 전환합니다."
    });
    return;
  }

  const body = req.body ?? {};
  const sourceText = safeText(body.sourceText, 20000);
  const sampleText = safeText(body.sampleText, 30000);

  if (!sourceText.trim()) {
    res.status(400).json({ error: "변환할 글이 비어 있습니다." });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: body.model || defaultModel,
        instructions: buildInstructions(body),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(
                  {
                    style_samples: sampleText,
                    style_profile: body.styleProfile ?? {},
                    text_to_rewrite: sourceText,
                    options: body.options ?? {}
                  },
                  null,
                  2
                )
              }
            ]
          }
        ],
        max_output_tokens: 6000
      })
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({
        error: data?.error?.message || "OpenAI 변환 중 오류가 발생했습니다."
      });
      return;
    }

    const text = extractOutputText(data);
    if (!text.trim()) {
      res.status(502).json({ error: "모델 응답에서 변환된 글을 찾지 못했습니다." });
      return;
    }

    res.json({ text: text.trim(), provider: "openai", model: body.model || defaultModel });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "알 수 없는 서버 오류가 발생했습니다."
    });
  }
});

if (isProd) {
  app.use(express.static(path.join(root, "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(root, "dist", "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "127.0.0.1", () => {
  const mode = process.env.OPENAI_API_KEY ? `OpenAI ${defaultModel}` : "로컬 변환";
  console.log(`WordTone 앱이 실행 중입니다: http://127.0.0.1:${port} (${mode})`);
});

function safeText(value, limit) {
  if (typeof value !== "string") return "";
  return value.slice(0, limit);
}

function buildInstructions(body) {
  const options = body.options ?? {};
  const intensity = Number(options.intensity ?? 80);
  const destination = options.destination ?? "sermon";
  const strictMeaning = options.strictMeaning !== false;
  const keepScripture = options.keepScripture !== false;
  const humanize = options.humanize !== false;
  const finalCheck = options.finalCheck !== false;

  return [
    "너는 한국어 목회 글쓰기 편집자다.",
    "사용자가 제공한 옛 설교문 샘플을 문체 기준으로 삼아 새 글을 같은 사람의 글처럼 다시 쓴다.",
    "샘플의 신학적 방향, 문장 호흡, 연결어, 반복 리듬, 권면 방식, 존칭과 종결어미를 우선 학습한다.",
    `문체 반영 강도는 ${intensity}%다. 50%는 은은하게, 80%는 분명하게, 100%는 샘플과 거의 같은 리듬으로 적용한다.`,
    `목적지는 ${destination} 형식이다. 형식에 맞게 단락 밀도와 호흡을 조정한다.`,
    destination === "blog"
      ? "블로그 형식일 때는 그림책처럼 읽히도록 한 단락을 1-2개의 짧은 문장으로 만든다. 장면이 바뀌는 곳마다 빈 줄을 두고, 감정이 보이는 문장을 살린다. 이미지 설명 문구나 대괄호 태그는 출력하지 않는다."
      : "목적지에 맞게 단락 밀도와 호흡을 자연스럽게 조정한다.",
    strictMeaning ? "원문의 핵심 주장과 사실관계는 바꾸지 않는다." : "의미를 해치지 않는 범위에서 배열과 표현을 자유롭게 다듬는다.",
    keepScripture ? "성경 장절, 인명, 지명, 숫자, 직접 인용은 보존한다." : "성경 장절과 인용도 자연스러운 흐름 안에서 정리할 수 있다.",
    humanize ? "AI가 쓴 듯한 균질한 문장, 과한 요약어, 목록식 문체, 홍보성 표현을 피하고 사람의 호흡을 살린다." : "문장은 깔끔하고 정돈되게 유지한다.",
    "원문에 이미 있는 Markdown 제목(#, ##), 번호 제목, 목록, 표, 코드블록은 구조와 기호를 그대로 보존한다.",
    "기존 제목의 문구는 바꾸지 말고, 제목 앞에 연결어·감탄사·머리말을 붙이지 않는다.",
    finalCheck
      ? "출력 직전 맞춤법, 띄어쓰기, 어색한 문장, 주어-서술어 호응, 원문 핵심어·숫자·성경 장절 누락 여부를 점검한다. 문체를 억지로 입혀 문장이 어색해지면 원문 의미와 자연스러운 문장을 우선한다."
      : "문체를 억지로 입혀 문장이 어색해지면 원문 의미와 자연스러운 문장을 우선한다.",
    "결과만 한국어 본문으로 출력한다. 설명, 머리말, 따옴표는 붙이지 않는다. 단, 원문에 있던 Markdown 제목은 그대로 유지한다."
  ].join("\n");
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n");
}
