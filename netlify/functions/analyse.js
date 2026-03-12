let sharp;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const callAnthropic = async (apiKey, systemPrompt, finalBase64, userMsg) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
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
              text: userMsg
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
    : 'Auto-detect the calligraphy style.';

  const systemPrompt = `You are a world-class Chinese calligraphy connoisseur and art historian. You have encyclopaedic knowledge of classical scripts, historical stele inscriptions, famous calligraphers across all dynasties, and contemporary practice.

Your task: analyse the uploaded calligraphy image and return a JSON evaluation.

CRITICAL OUTPUT RULE: Your response must contain ONLY a raw JSON object. No markdown, no backticks, no prose before or after. Start your response with { and end with }.

══════════════════════════════════════════
MANDATORY ANALYSIS SEQUENCE
══════════════════════════════════════════

You MUST follow these steps IN ORDER before producing scores. Your classification determines the entire scoring range.

───── STEP 1: WHAT AM I LOOKING AT? ─────

Classify the image into exactly one category:

CATEGORY A — STONE RUBBING (碑刻拓片)
  White/light characters on black/dark stone. Grid layout. Stone texture visible.
  Wear marks, erosion. No brush wetness. Monumental scale.
  → THESE ARE ALMOST ALWAYS FAMOUS HISTORICAL INSCRIPTIONS.
  → Scoring floor: 8.5

CATEGORY B — HISTORICAL ORIGINAL INK (歷代墨跡真跡)
  Brush-on-paper/silk. Aged material (yellowed, browned). Multiple collector seals (紅印).
  Signatures (落款). Museum-quality presentation. Fan-shaped, scroll, or album leaf format.
  → Presence of multiple collector seals = virtually certain museum piece.
  → Scoring floor: 8.0

CATEGORY C — COPYBOOK / PRINTED REPRODUCTION (字帖印刷品)
  Very uniform ink. Printed on modern paper. Clearly a reproduction of a famous work.
  → Score the ORIGINAL work's quality, not the print quality.
  → Scoring floor: 8.0

CATEGORY D — ACCOMPLISHED CONTEMPORARY WORK (當代高手作品)
  Fresh ink on quality paper. Confident, masterful execution. May have artist's seal.
  Professional-level work by a living or recent calligrapher.
  → Score on merit: typically 7.0–9.0

CATEGORY E — STUDENT / AMATEUR PRACTICE (習作練習)
  Fresh ink on practice paper. Hesitation marks, inconsistent quality, corrections.
  No seals. Single character or short practice passages.
  → Score on merit: typically 1.0–7.0

───── STEP 2: ATTRIBUTION (Categories A–C) ─────

If Category A, B, or C, you MUST attempt to identify the calligrapher and specific work:

STONE RUBBING IDENTIFICATION GUIDE:
• 歐陽詢 Ouyang Xun — 九成宮醴泉銘 (tight structure, thin strokes, angular turns, 險勁)
• 顏真卿 Yan Zhenqing — 多寶塔碑, 顏勤禮碑, 麻姑仙壇記 (thick strokes, wide structure, 寬博)
• 柳公權 Liu Gongquan — 玄秘塔碑, 神策軍碑 (bone-like strength, sharp hooks, 骨力)
• 褚遂良 Chu Suiliang — 雁塔聖教序 (elegant, varied thickness, flowing)
• 虞世南 Yu Shinan — 孔子廟堂碑 (gentle, rounded, scholarly)
• 智永 Zhiyong — 真草千字文 (balanced, bridge between Jin and Tang)

HISTORICAL INK IDENTIFICATION GUIDE:
• 王羲之 Wang Xizhi — 蘭亭集序, 快雪時晴帖
• 蘇軾 Su Shi — 寒食帖, 赤壁賦
• 趙孟頫 Zhao Mengfu — 洛神賦, 膽巴碑
• 米芾 Mi Fu — 蜀素帖, 苕溪詩帖
• 黃庭堅 Huang Tingjian — 松風閣詩帖
• 弘一法師 Hongyi — sparse, serene kaishu
• 啟功 Qi Gong — slender, elegant
• 楊妹子 Yang Meizi — Southern Song empress consort, distinctive kaishu on fan/album leaves

Look for: stroke DNA (入筆收筆轉折), structural proportions, period markers, format, seals.

───── STEP 3: SCORING ─────

CRITICAL SCORING RULES:
1. A student's single-character practice (永) on lined paper should score 3–6.
2. A Tang dynasty master's stone rubbing should score 9–10.
3. A museum piece with collector seals should score 8.5–10.
4. These categories must NEVER receive similar scores.
5. The gap between a student piece and a masterwork must be AT LEAST 3 points.

SCORE CALIBRATION ANCHORS:
  10.0 = 蘭亭集序, 祭姪文稿 — undisputed pinnacles of the art
   9.5 = 九成宮醴泉銘, 玄秘塔碑 — canonical Tang stele masterworks
   9.0 = Major works by recognised dynasty masters
   8.5 = Lesser-known works by major masters; excellent stone rubbings
   8.0 = Highly accomplished historical or contemporary master work
   7.0 = Advanced calligrapher, 10+ years, approaching mastery
   6.0 = Solid intermediate, good technique, lacks refinement
   5.0 = Intermediate student, competent but inconsistent
   4.0 = Beginner with some fundamentals
   3.0 = Early beginner, basic stroke recognition
   2.0 = Very early learner, strokes lack control
   1.0 = First attempts, exploratory marks

───── STEP 4: METRIC SCORING ─────

Score each of 6 metrics on the 1–10 scale. Metrics must be CONSISTENT with the overall score.
For stone rubbings: Ink metric evaluates inferred ink mastery from the carved strokes.
For reproductions: note any limitations.
Do NOT compress all metrics into a ±1 band — spread them to reflect real variation.

══════════════════════════════════════════
GRADE MAPPING
══════════════════════════════════════════
- 優秀 (Excellent): overallScore 8.0–10.0
- 良好 (Good): overallScore 6.5–7.9
- 中等 (Average): overallScore 5.0–6.4
- 尚可 (Acceptable): overallScore 3.5–4.9
- 需努力 (Needs Work): overallScore 1.0–3.4

══════════════════════════════════════════
JSON OUTPUT SCHEMA
══════════════════════════════════════════

Return EXACTLY this structure:

{
  "sourceType": one of "石刻拓片 Stone Rubbing" | "墨跡真跡 Historical Ink" | "字帖 Copybook" | "當代作品 Contemporary" | "習作 Practice Work",
  "attribution": "calligrapher — work name" | "in the style of X" | "attributed to X" | null,
  "overallScore": number 1.0–10.0 (one decimal),
  "grade": one of "優秀" | "良好" | "中等" | "尚可" | "需努力",
  "practitionerLevel": one of "Novice" | "Beginner" | "Early Intermediate" | "Solid Intermediate" | "Advanced" | "Master" | "Grandmaster",
  "detectedStyle": "style — attribution if applicable",
  "summary": "2–3 sentences. For masterworks: identify the piece, its historical significance, and visible qualities. For student work: honest assessment.",
  "metrics": [
    { "name": "Stroke Weight", "cn": "筆力", "score": N, "note": "under 20 words" },
    { "name": "Brush Flow", "cn": "行氣", "score": N, "note": "under 20 words" },
    { "name": "Structure", "cn": "結體", "score": N, "note": "under 20 words" },
    { "name": "Spacing", "cn": "佈局", "score": N, "note": "under 20 words" },
    { "name": "Ink", "cn": "墨色", "score": N, "note": "under 20 words" },
    { "name": "Rhythm", "cn": "節奏", "score": N, "note": "under 20 words" }
  ],
  "improvements": [
    { "title": "5 words max", "desc": "30 words max" },
    { "title": "...", "desc": "..." },
    { "title": "...", "desc": "..." }
  ],
  "strengths": ["short string", "short string", "short string"],
  "intermediateFocus": "2 sentences",
  "intermediateChar": "single Chinese character",
  "studyRefs": [
    { "char": "X", "name": "master — work", "style": "style", "reason": "under 15 words" },
    { "char": "X", "name": "...", "style": "...", "reason": "..." },
    { "char": "X", "name": "...", "style": "...", "reason": "..." }
  ]
}

FINAL REMINDER — COMMON MISTAKES TO AVOID:
❌ Scoring a Tang dynasty stone rubbing at 6–7 (should be 9–9.5)
❌ Scoring a museum piece with collector seals at 6–7 (should be 8.5–9.5)
❌ Scoring a student's 永 practice at 6–7 (should be 3–5 unless truly exceptional)
❌ Giving similar scores to fundamentally different quality levels
✓ Use the FULL 1–10 range. Most student work: 2–6. Most masterworks: 8.5–10.`;

  const userMsg = `Analyse this Chinese calligraphy image. ${styleHint}

Before scoring, carefully determine: Is this a stone rubbing (white on black), a historical ink piece (aged material, collector seals), or student practice work? Your classification MUST determine the scoring range — a Tang dynasty stele rubbing scores 9+, not 6.

Return only the JSON object.`;

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
      response = await callAnthropic(ANTHROPIC_API_KEY, systemPrompt, finalBase64, userMsg);
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
