const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════
// MODELS — Haiku for pass 1 (cheap), Sonnet for correction (accurate)
// ══════════════════════════════
const MODEL_FAST  = 'claude-haiku-4-5-20251001';   // ~$0.001/req
const MODEL_SMART = 'claude-sonnet-4-6';            // ~$0.022/req

// ══════════════════════════════
// COMPRESSED SYSTEM PROMPT (trimmed ~35% tokens from original)
// ══════════════════════════════
const SYSTEM_PROMPT = `You are a world-class Chinese calligraphy connoisseur and art historian.
Return ONLY a raw JSON object. No markdown, no backticks, no prose. Start with { end with }.

STEP 1 — CLASSIFY THE IMAGE FIRST

A) STONE RUBBING (碑刻拓片): White chars on dark stone, grid layout, erosion marks. Score floor: 8.5. Identify stele + calligrapher.
B) HISTORICAL INK (墨跡真跡): Aged paper/silk, red collector seals (紅印), fan/scroll/album format. Score floor: 8.0.
C) COPYBOOK (字帖): Printed reproduction of famous work. Score the original. Floor: 8.0.
D) CONTEMPORARY MASTER (當代作品): Fresh ink, quality paper, artist's seal. Range: 7.0–9.0.
E) STUDENT PRACTICE (習作): Practice paper, hesitation marks, no seals. Range: 1.0–7.0.

STEP 2 — IDENTIFY (A–C only)

Stone rubbings: 歐陽詢(九成宮醴泉銘,險勁), 顏真卿(多寶塔碑/顏勤禮碑,寬博), 柳公權(玄秘塔碑/神策軍碑,骨力), 褚遂良(雁塔聖教序), 虞世南(孔子廟堂碑).
Historical ink: 王羲之(蘭亭集序), 蘇軾(寒食帖), 趙孟頫(洛神賦), 米芾(蜀素帖), 黃庭堅(松風閣詩帖), 楊妹子(Southern Song fan kaishu), 弘一法師, 啟功.

STEP 3 — SCORE (full 1–10 range)

Anchors: 10=蘭亭集序/祭姪文稿, 9.5=九成宮醴泉銘/玄秘塔碑, 9=major master works, 8.5=lesser master works, 8=accomplished master, 7=advanced(10+yr), 5–6=intermediate, 3–4=beginner, 1–2=first attempts.

HARD RULES: Stone rubbing of Tang/Song master→9+. Museum piece with seals→8.5+. Student practice→2–6. Gap between student and masterwork≥3pts.

JSON SCHEMA:
{"sourceType":"石刻拓片 Stone Rubbing"|"墨跡真跡 Historical Ink"|"字帖 Copybook"|"當代作品 Contemporary"|"習作 Practice Work","attribution":"calligrapher — work"|"in the style of X"|null,"overallScore":1.0-10.0,"grade":"優秀"(≥8)|"良好"(6.5-7.9)|"中等"(5-6.4)|"尚可"(3.5-4.9)|"需努力"(<3.5),"practitionerLevel":"Novice"|"Beginner"|"Early Intermediate"|"Solid Intermediate"|"Advanced"|"Master"|"Grandmaster","detectedStyle":"style — attribution","summary":"2–3 sentences","metrics":[{"name":"Stroke Weight","cn":"筆力","score":N,"note":"<20w"},{"name":"Brush Flow","cn":"行氣","score":N,"note":"<20w"},{"name":"Structure","cn":"結體","score":N,"note":"<20w"},{"name":"Spacing","cn":"佈局","score":N,"note":"<20w"},{"name":"Ink","cn":"墨色","score":N,"note":"<20w"},{"name":"Rhythm","cn":"節奏","score":N,"note":"<20w"}],"improvements":[{"title":"≤5w","desc":"≤30w"},{"title":"","desc":""},{"title":"","desc":""}],"strengths":["s1","s2","s3"],"intermediateFocus":"2 sentences","intermediateChar":"single char","studyRefs":[{"char":"X","name":"master — work","style":"s","reason":"<15w"},{"char":"X","name":"","style":"","reason":""},{"char":"X","name":"","style":"","reason":""}]}

Dark bg + white chars = rubbing = 9+. Aged paper + red seals = museum = 8.5+. Fresh ink practice paper = student = score on merit.`;

// ══════════════════════════════
// SCORE VALIDATION
// ══════════════════════════════
function validateResult(parsed) {
  const st = (parsed.sourceType || '').toLowerCase();
  const score = parsed.overallScore;
  const attr = parsed.attribution;

  const isHistorical =
    st.includes('stone') || st.includes('拓片') || st.includes('rubbing') ||
    st.includes('歷代') || st.includes('historical') || st.includes('墨跡真跡') ||
    st.includes('copybook') || st.includes('字帖');

  const hasAttribution = attr && attr !== null && attr !== 'null' && attr.length > 2;

  if (isHistorical && score < 8.0) {
    return {
      valid: false,
      reason: `Classified as "${parsed.sourceType}"${hasAttribution ? ` attributed to "${attr}"` : ''} but scored ${score}. Historical masterworks must score 8.0+. Tang stele rubbings: 9.0–9.5. Re-score.`
    };
  }

  if (hasAttribution && score < 8.0) {
    return {
      valid: false,
      reason: `Attributed to "${attr}" but scored ${score}. Recognised master works must score 8.0+. Re-score.`
    };
  }

  if (parsed.practitionerLevel === 'Grandmaster' && score < 8.5) {
    return {
      valid: false,
      reason: `Level "Grandmaster" but scored ${score}. Must be 8.5+. Re-score.`
    };
  }

  return { valid: true };
}

// ══════════════════════════════
// API CALL (with prompt caching)
// ══════════════════════════════
const callAnthropic = async (apiKey, model, messages) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages
    })
  });
  return response;
};

const callWithRetry = async (apiKey, model, messages) => {
  let response;
  const delays = [2000, 5000, 10000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    response = await callAnthropic(apiKey, model, messages);
    if (response.status !== 429) break;
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  return response;
};

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
    ? `Style hint: ${style}.`
    : '';

  try {
    const userMsg = `Analyse this calligraphy. ${styleHint} Classify first (rubbing/historical/student), then score accordingly. Dark bg+white chars=rubbing=9+. Aged+seals=museum=8.5+. Student=merit. JSON only.`;

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: userMsg }
        ]
      }
    ];

    // ── PASS 1: Haiku (fast + cheap) ───────────────────────────────────────
    let response = await callWithRetry(ANTHROPIC_API_KEY, MODEL_FAST, messages);
    let data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || 'API error', details: data.error || data })
      };
    }

    let raw = data.content?.[0]?.text || '';
    let clean = raw.replace(/```json\n?|```/g, '').trim();
    let parsed;

    try {
      parsed = JSON.parse(clean);
    } catch {
      // Haiku JSON parse failed — fall back to Sonnet
      console.log('Haiku parse failed, falling back to Sonnet');
      response = await callWithRetry(ANTHROPIC_API_KEY, MODEL_SMART, messages);
      data = await response.json();
      if (!response.ok) {
        return { statusCode: response.status, body: JSON.stringify({ error: 'Fallback API error' }) };
      }
      raw = data.content?.[0]?.text || '';
      clean = raw.replace(/```json\n?|```/g, '').trim();
      try {
        parsed = JSON.parse(clean);
      } catch {
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse AI response.' }) };
      }
    }

    // ── PASS 2: Validate — if score is contradictory, correct with Sonnet ──
    const validation = validateResult(parsed);

    if (!validation.valid) {
      console.log('Validation failed, correcting with Sonnet:', validation.reason);

      const correctionMessages = [
        ...messages,
        { role: 'assistant', content: clean },
        {
          role: 'user',
          content: `SCORING ERROR: ${validation.reason} Return corrected JSON only.`
        }
      ];

      const corrResponse = await callWithRetry(ANTHROPIC_API_KEY, MODEL_SMART, correctionMessages);
      const corrData = await corrResponse.json();

      if (corrResponse.ok) {
        const corrRaw = corrData.content?.[0]?.text || '';
        const corrClean = corrRaw.replace(/```json\n?|```/g, '').trim();
        try {
          const corrParsed = JSON.parse(corrClean);
          if (corrParsed.overallScore && corrParsed.metrics) {
            parsed = corrParsed;
            clean = JSON.stringify(corrParsed);
          }
        } catch {
          console.error('Correction parse failed, using Haiku result');
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: typeof parsed === 'object' ? JSON.stringify(parsed) : clean
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
