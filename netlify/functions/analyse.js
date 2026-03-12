const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════
// ANTHROPIC API CALL
// ══════════════════════════════
const callAnthropic = async (apiKey, systemPrompt, messages) => {
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
      messages
    })
  });
  return response;
};

// ══════════════════════════════
// SCORE VALIDATION
// ══════════════════════════════
// If the model classifies the image as historical but scores it low,
// we catch this contradiction and ask for a correction.
function validateResult(parsed) {
  const st = (parsed.sourceType || '').toLowerCase();
  const score = parsed.overallScore;
  const attr = parsed.attribution;

  const isHistorical =
    st.includes('stone') || st.includes('拓片') || st.includes('rubbing') ||
    st.includes('歷代') || st.includes('historical') || st.includes('墨跡真跡') ||
    st.includes('copybook') || st.includes('字帖');

  const hasAttribution = attr && attr !== null && attr !== 'null' && attr.length > 2;

  // RULE: Historical masterwork classified but scored below floor
  if (isHistorical && score < 8.0) {
    return {
      valid: false,
      reason: `You classified this as "${parsed.sourceType}" ${hasAttribution ? `attributed to "${attr}"` : ''} but scored it ${score}/10. Historical masterworks and stone rubbings by famous calligraphers must score 8.0+. A Tang dynasty stele rubbing should be 9.0–9.5. Please re-evaluate with corrected scores.`
    };
  }

  // RULE: Has specific attribution to a famous master but scored below 8
  if (hasAttribution && score < 8.0) {
    return {
      valid: false,
      reason: `You attributed this to "${attr}" but scored it ${score}/10. Works by recognised historical masters must score 8.0+. Please re-evaluate with corrected scores.`
    };
  }

  // RULE: Grandmaster level but scored below 8.5
  if (parsed.practitionerLevel === 'Grandmaster' && score < 8.5) {
    return {
      valid: false,
      reason: `You classified the practitioner level as "Grandmaster" but scored it ${score}/10. Grandmaster-level work must score 8.5+. Please re-evaluate.`
    };
  }

  return { valid: true };
}

// ══════════════════════════════
// SYSTEM PROMPT
// ══════════════════════════════
const SYSTEM_PROMPT = `You are a world-class Chinese calligraphy connoisseur and art historian.

CRITICAL OUTPUT RULE: Return ONLY a raw JSON object. No markdown, no backticks, no prose. Start with { end with }.

══════════════════════════════════════════
STEP 1 — CLASSIFY THE IMAGE (do this FIRST)
══════════════════════════════════════════

CATEGORY A — STONE RUBBING (碑刻拓片): Score floor 8.5
  White/light characters on dark stone background. Grid layout. Stone texture/erosion.
  → Almost always a famous historical inscription. Identify the stele and calligrapher.

CATEGORY B — HISTORICAL INK (墨跡真跡): Score floor 8.0
  Brush on aged paper/silk. Yellowed material. Red collector seals (紅印/藏印).
  Fan-shaped, scroll, or album leaf. Museum-quality presentation.
  → Multiple collector seals = virtually certain museum piece.

CATEGORY C — COPYBOOK (字帖): Score floor 8.0
  Printed reproduction of a famous work. Score the original's quality.

CATEGORY D — CONTEMPORARY MASTER (當代作品): Score range 7.0–9.0
  Fresh ink, quality paper, confident execution, artist's seal.

CATEGORY E — STUDENT PRACTICE (習作): Score range 1.0–7.0
  Fresh ink, practice paper, hesitation marks, no seals.

══════════════════════════════════════════
STEP 2 — IDENTIFY (Categories A–C)
══════════════════════════════════════════

Stone rubbings:
• 歐陽詢 Ouyang Xun — 九成宮醴泉銘 (tight, angular, 險勁)
• 顏真卿 Yan Zhenqing — 多寶塔碑, 顏勤禮碑 (wide, thick, 寬博)
• 柳公權 Liu Gongquan — 玄秘塔碑, 神策軍碑 (bone-strength, sharp hooks)
• 褚遂良 Chu Suiliang — 雁塔聖教序 (elegant, flowing)
• 虞世南 Yu Shinan — 孔子廟堂碑 (gentle, rounded)

Historical ink:
• 王羲之 Wang Xizhi — 蘭亭集序, 快雪時晴帖
• 蘇軾 Su Shi — 寒食帖 • 趙孟頫 Zhao Mengfu — 洛神賦
• 米芾 Mi Fu — 蜀素帖 • 黃庭堅 Huang Tingjian — 松風閣詩帖
• 楊妹子 Yang Meizi — Southern Song, fan/album kaishu
• 弘一法師 Hongyi — sparse kaishu • 啟功 Qi Gong — slender elegant

══════════════════════════════════════════
STEP 3 — SCORE (use the full 1–10 range)
══════════════════════════════════════════

CALIBRATION ANCHORS:
  10.0 = 蘭亭集序, 祭姪文稿
   9.5 = 九成宮醴泉銘, 玄秘塔碑
   9.0 = Major dynasty master works
   8.5 = Lesser works by major masters
   8.0 = Accomplished historical/contemporary master
   7.0 = Advanced (10+ years)
   5.0–6.0 = Intermediate student
   3.0–4.0 = Beginner
   1.0–2.0 = First attempts

HARD RULES:
- Stone rubbing of a Tang/Song master → score 9.0–9.5
- Museum piece with collector seals → score 8.5–9.5
- Student single-character practice → score 2.0–6.0
- Gap between student and masterwork must be ≥3 points

══════════════════════════════════════════
JSON SCHEMA
══════════════════════════════════════════

{
  "sourceType": "石刻拓片 Stone Rubbing" | "墨跡真跡 Historical Ink" | "字帖 Copybook" | "當代作品 Contemporary" | "習作 Practice Work",
  "attribution": "calligrapher — work" | "in the style of X" | null,
  "overallScore": 1.0–10.0,
  "grade": "優秀" (≥8) | "良好" (6.5–7.9) | "中等" (5–6.4) | "尚可" (3.5–4.9) | "需努力" (<3.5),
  "practitionerLevel": "Novice"|"Beginner"|"Early Intermediate"|"Solid Intermediate"|"Advanced"|"Master"|"Grandmaster",
  "detectedStyle": "style — attribution if known",
  "summary": "2–3 sentences",
  "metrics": [
    {"name":"Stroke Weight","cn":"筆力","score":N,"note":"<20 words"},
    {"name":"Brush Flow","cn":"行氣","score":N,"note":"<20 words"},
    {"name":"Structure","cn":"結體","score":N,"note":"<20 words"},
    {"name":"Spacing","cn":"佈局","score":N,"note":"<20 words"},
    {"name":"Ink","cn":"墨色","score":N,"note":"<20 words"},
    {"name":"Rhythm","cn":"節奏","score":N,"note":"<20 words"}
  ],
  "improvements": [{"title":"≤5 words","desc":"≤30 words"},{"title":"...","desc":"..."},{"title":"...","desc":"..."}],
  "strengths": ["str1","str2","str3"],
  "intermediateFocus": "2 sentences",
  "intermediateChar": "single char",
  "studyRefs": [
    {"char":"X","name":"master — work","style":"style","reason":"<15 words"},
    {"char":"X","name":"...","style":"...","reason":"..."},
    {"char":"X","name":"...","style":"...","reason":"..."}
  ]
}

REMINDER: If you see dark background + white characters → stone rubbing → score 9+
If you see aged paper + red seals → museum piece → score 8.5+
If you see fresh ink on practice paper → student → score on actual merit (often 3–6)`;

// ══════════════════════════════
// HANDLER
// ══════════════════════════════
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

  try {
    // Note: Image resizing is handled client-side (canvas 800px cap).
    // No server-side sharp dependency needed.
    const finalBase64 = imageBase64;

    // ── Build initial messages ─────────────────────────────────────────────
    const userMsg = `Analyse this Chinese calligraphy image. ${styleHint}

IMPORTANT — Before scoring, classify the image:
• Dark background + white characters = stone rubbing = MUST score 9+
• Aged paper/silk + red collector seals = museum piece = MUST score 8.5+
• Fresh ink on practice paper = student work = score on merit (often 3–6)

Your classification determines the scoring range. Return only the JSON object.`;

    let messages = [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: finalBase64 } },
          { type: 'text', text: userMsg }
        ]
      }
    ];

    // ── Call with retry on 429 ─────────────────────────────────────────────
    const callWithRetry = async (msgs) => {
      let response;
      const delays = [2000, 5000, 10000];
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        response = await callAnthropic(ANTHROPIC_API_KEY, SYSTEM_PROMPT, msgs);
        if (response.status !== 429) break;
        if (attempt < delays.length) await sleep(delays[attempt]);
      }
      return response;
    };

    // ── PASS 1: Initial analysis ───────────────────────────────────────────
    let response = await callWithRetry(messages);
    let data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || 'Anthropic API error', details: data.error || data })
      };
    }

    let raw = data.content?.[0]?.text || '';
    let clean = raw.replace(/```json\n?|```/g, '').trim();
    let parsed;

    try {
      parsed = JSON.parse(clean);
    } catch {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse AI response as JSON.' }) };
    }

    // ── PASS 2: Validate and correct if needed ─────────────────────────────
    const validation = validateResult(parsed);

    if (!validation.valid) {
      console.log('Score validation failed, requesting correction:', validation.reason);

      const correctionMessages = [
        ...messages,
        {
          role: 'assistant',
          content: clean
        },
        {
          role: 'user',
          content: `SCORING ERROR: ${validation.reason}

Please return a corrected JSON object with appropriate scores. Remember the calibration anchors:
- Tang dynasty stele rubbing = 9.0–9.5
- Museum piece with collector seals = 8.5–9.5
- Student practice = 2.0–6.0

Return ONLY the corrected JSON object.`
        }
      ];

      const corrResponse = await callWithRetry(correctionMessages);
      const corrData = await corrResponse.json();

      if (corrResponse.ok) {
        const corrRaw = corrData.content?.[0]?.text || '';
        const corrClean = corrRaw.replace(/```json\n?|```/g, '').trim();

        try {
          const corrParsed = JSON.parse(corrClean);
          if (corrParsed.overallScore && corrParsed.metrics) {
            parsed = corrParsed;
            clean = corrClean;
          }
        } catch {
          console.error('Correction parse failed, using original result');
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: typeof parsed === 'string' ? clean : JSON.stringify(parsed)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
