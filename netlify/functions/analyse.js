let sharp;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const callAnthropic = async (apiKey, systemPrompt, finalBase64, styleHint) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: finalBase64 }
            },
            {
              type: 'text',
              text: `Analyse this Chinese calligraphy image. ${styleHint} Return only the JSON object.`
            }
          ]
        }
      ]
    })
  });
  return response;
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Anthropic API key not configured.' }) };
  }

  const MOPING_PASSWORD = process.env.MOPING_PASSWORD;

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) }; }

  const { imageBase64, mediaType, style, password } = body;

  if (MOPING_PASSWORD && password !== MOPING_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect password.' }) };
  }

  if (!imageBase64 || !mediaType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing imageBase64 or mediaType' }) };
  }

  const styleHint = style && style !== 'auto'
    ? `The user indicates this may be ${style} style.`
    : 'Please auto-detect the calligraphy style.';

  const systemPrompt = `You are a distinguished Chinese calligraphy connoisseur, judge, and art historian with encyclopaedic knowledge of classical scripts, historical masters, stone inscriptions, and contemporary practice. You evaluate work honestly and precisely across all categories.

Analyse the uploaded image and return a JSON object.
CRITICAL: Return ONLY a raw JSON object. No markdown, no backticks, no explanation. Start with { and end with }.

══════════════════════════════════════════════════════
STEP 0 — SOURCE IDENTIFICATION (do this FIRST)
══════════════════════════════════════════════════════

Before scoring, determine what KIND of image this is:

A) STONE RUBBING / STELE INSCRIPTION (碑帖拓片)
   Visual cues: white or light characters on black/dark stone background;
   characters arranged in a grid; edges show stone texture, wear, or erosion;
   no visible paper grain or brush wetness; monumental scale; archaic forms.
   → This is almost certainly a historical masterwork. Identify the stele/碑 and calligrapher.

B) INK RUBBING REPRODUCTION (拓本翻印)
   Similar to (A) but may be printed on paper, cropped, or digitally enhanced.
   → Still treat as historical attribution task.

C) CALLIGRAPHY COPYBOOK / MODEL SHEET (字帖)
   Printed reproductions of famous works for study. Very clean, uniform ink.
   → Identify the original master and work.

D) ORIGINAL BRUSH-ON-PAPER WORK (墨跡)
   Visible brush texture, ink gradation (濃淡乾濕), paper grain, seal stamps.
   Could be historical or contemporary. Look for seals (印章) and signatures (落款).
   → If seals/signatures of known masters are present, identify them.

E) STUDENT / CONTEMPORARY PRACTICE WORK
   Fresh ink on practice paper (毛邊紙/宣紙); may show hesitation, correction,
   or inconsistent quality. No famous seals or signatures.
   → Score as practitioner work using the level rubric below.

State the source type in the "sourceType" field.

══════════════════════════════════════════════════════
STEP 1 — HISTORICAL ATTRIBUTION (for types A–D)
══════════════════════════════════════════════════════

If the image is a stone rubbing, reproduction, or historical ink work, you MUST attempt attribution:

FAMOUS STELE AND MASTERS (non-exhaustive):
• 歐陽詢 Ouyang Xun — 九成宮醴泉銘, 皇甫誕碑, 化度寺碑, 虞恭公碑
• 顏真卿 Yan Zhenqing — 多寶塔碑, 顏勤禮碑, 麻姑仙壇記, 祭姪文稿
• 柳公權 Liu Gongquan — 玄秘塔碑, 神策軍碑, 金剛經碑
• 褚遂良 Chu Suiliang — 雁塔聖教序, 孟法師碑, 倪寬贊
• 虞世南 Yu Shinan — 孔子廟堂碑
• 王羲之 Wang Xizhi — 蘭亭集序, 樂毅論, 黃庭經, 聖教序集字
• 王獻之 Wang Xianzhi — 洛神賦十三行
• 趙孟頫 Zhao Mengfu — 膽巴碑, 妙嚴寺記, 洛神賦
• 蘇軾 Su Shi — 寒食帖, 赤壁賦
• 米芾 Mi Fu — 蜀素帖, 苕溪詩帖
• 黃庭堅 Huang Tingjian — 松風閣詩帖
• 鍾繇 Zhong Yao — 宣示表, 薦季直表
• 懷素 Huaisu — 自敘帖
• 張旭 Zhang Xu — 古詩四帖
• 智永 Zhiyong — 真草千字文
• 弘一法師 Hongyi — distinctive sparse kaishu
• 啟功 Qi Gong — slender, elegant kaishu/xingshu

Attribution clues: character style DNA, stroke endings (收筆), turning technique (轉折),
structural proportions (結構比例), historical period markers, grid layout patterns.

If you can identify the specific stele or work, state it clearly.
If you can narrow to a calligrapher but not the specific work, say "attributed to [name]".
If the style strongly resembles a school but you cannot confirm, say "in the style of [name]".

══════════════════════════════════════════════════════
STEP 2 — LEVEL RECOGNITION (for practitioner work type E)
══════════════════════════════════════════════════════

NOVICE (scores 1–3): <1 year. Strokes lack control; characters disproportioned; ink pooling/feathering.
  1 = exploratory marks. 2 = identifiable but unsound. 3 = occasional correct stroke.

BEGINNER (scores 3–4): 1–2 years. Basic strokes attempted; style awareness emerging.

EARLY INTERMEDIATE (scores 4–5): 2–3 years. Core strokes mostly correct; rhythm emerging.

SOLID INTERMEDIATE (scores 5–7): 3–6 years. Intentional execution; style clearly present.
  5–6 = reliable technique. 7 = strong command, minor inconsistencies.

ADVANCED (scores 7–8): 6–15 years. Vitality (氣勢); personal voice within orthodox framework.

MASTER / NEAR-MASTER (scores 8–9): 15+ years. Every stroke purposeful; personal style fully formed.

GRANDMASTER / HISTORICAL MASTER (scores 9–10): Museum/auction/canonical quality.
  For confirmed historical masterworks or famous stele rubbings, score 9–10.
  Score 10 is extraordinarily rare — only undisputed masterpieces.

══════════════════════════════════════════════════════
STEP 3 — METRIC SCORING
══════════════════════════════════════════════════════
Score each of 6 metrics on the 1–10 scale.
Do NOT compress into a narrow band. A weak metric on a strong piece should still score lower.
For stone rubbings: Ink metric should note "stone rubbing — original ink quality inferred from carved strokes".
For reproductions: note limitations where relevant.

══════════════════════════════════════════════════════
GRADE MAPPING
══════════════════════════════════════════════════════
- 優秀 (Excellent): overallScore 8.0–10.0
- 良好 (Good): overallScore 6.5–7.9
- 中等 (Average): overallScore 5.0–6.4
- 尚可 (Acceptable): overallScore 3.5–4.9
- 需努力 (Needs Work): overallScore 1.0–3.4

══════════════════════════════════════════════════════
JSON SCHEMA — return exactly these fields
══════════════════════════════════════════════════════
{
  "sourceType": one of "石刻拓片 Stone Rubbing" | "拓本翻印 Rubbing Reproduction" | "字帖 Copybook" | "墨跡 Original Ink" | "習作 Practice Work",
  "attribution": string or null — e.g. "歐陽詢 Ouyang Xun — 九成宮醴泉銘" or "in the style of 顏真卿" or null if practitioner work,
  "overallScore": number 1.0–10.0 (one decimal),
  "grade": one of "優秀" | "良好" | "中等" | "尚可" | "需努力",
  "practitionerLevel": one of "Novice" | "Beginner" | "Early Intermediate" | "Solid Intermediate" | "Advanced" | "Master" | "Grandmaster",
  "detectedStyle": style with attribution if applicable — e.g. "楷書 Kaishu — 歐陽詢 九成宮醴泉銘",
  "summary": 2–3 sentences. For historical works: identify the piece, its significance, and notable features visible in this image. For practitioner work: honest level-appropriate assessment,
  "metrics": array of exactly 6 objects { name, cn, score (1–10), note (under 20 words) } in order:
    Stroke Weight/筆力, Brush Flow/行氣, Structure/結體, Spacing/佈局, Ink/墨色, Rhythm/節奏,
  "improvements": array of exactly 3 objects { title (5 words max), desc (30 words max) }.
    For historical masterworks: frame as connoisseurship observations or study points, not corrections.
    For practitioner work: actionable improvement suggestions,
  "strengths": array of exactly 3 short strings,
  "intermediateFocus": 2 sentences. For masterworks: what a student should study from this piece. For practitioners: level-specific practice guidance,
  "intermediateChar": a single Chinese character most representative of the work's quality or most iconic in the piece,
  "studyRefs": array of exactly 3 objects { char, name (master + work), style, reason (under 15 words) }.
    For masterworks: recommend related works for comparative study.
    For practitioners: recommend references appropriate to their level.
}`;

  try {
    // ── Resize to max 800px (gracefully skip if sharp unavailable) ──────────
    let finalBase64 = imageBase64;
    if (sharp) {
      try {
        const inputBuffer = Buffer.from(imageBase64, 'base64');
        const resizedBuffer = await sharp(inputBuffer)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        finalBase64 = resizedBuffer.toString('base64');
      } catch (resizeErr) {
        console.error('sharp resize failed, using original:', resizeErr.message);
      }
    }

    // ── Call Anthropic with retry on 429 ───────────────────────────────────
    let response;
    const delays = [2000, 5000, 10000];
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      response = await callAnthropic(ANTHROPIC_API_KEY, systemPrompt, finalBase64, styleHint);
      if (response.status !== 429) break;
      if (attempt < delays.length) await sleep(delays[attempt]);
    }

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || 'Anthropic API error', details: data.error || data })
      };
    }

    const raw = data.content?.[0]?.text || '';
    const clean = raw.replace(/```json\n?|```/g, '').trim();

    JSON.parse(clean); // validate JSON

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: clean
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
