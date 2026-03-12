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
      max_tokens: 1500,
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
              text: `Analyse this Chinese calligraphy for an intermediate student. ${styleHint} Return only the JSON object.`
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

  const systemPrompt = `You are a strict but fair master Chinese calligraphy teacher evaluating work from an intermediate student (1-3 years practice). Analyse the uploaded image and return a JSON object.

CRITICAL: Return ONLY a raw JSON object. No markdown, no backticks, no explanation before or after. Start your response with { and end with }.

SCORING RUBRIC — use the full 1-10 range honestly:
- 1-2: Fundamental errors, strokes unrecognisable, no structure
- 3-4: Beginner level, major proportion, stroke order or ink control issues
- 5-6: Early intermediate — some correct strokes but inconsistent rhythm, spacing or weight
- 7-8: Solid intermediate — controlled strokes, good structure, minor refinements needed
- 9: Near-master level — very few flaws, strong personal style emerging
- 10: Exceptional, museum quality — reserve only for truly outstanding work
Most intermediate students (1-3 years) score 4-7. Do NOT cluster around 6-7 out of politeness. Score 5 or below if the work shows clear weaknesses. Score 8+ only for genuinely impressive control. Apply the same rubric to each individual metric score.

The JSON must have exactly these fields:
- overallScore: a number between 1.0 and 10.0
- grade: one of these exact strings: "優秀" or "良好" or "中等" or "尚可" or "需努力"
- detectedStyle: the calligraphy style detected, e.g. "楷書 Kaishu"
- summary: a string with 2 sentences of overall assessment
- metrics: an array of exactly 6 objects, each with: name (string), cn (string), score (number 1-10), note (string under 20 words)
  The 6 metrics must be: Stroke Weight/筆力, Brush Flow/行氣, Structure/結體, Spacing/佈局, Ink/墨色, Rhythm/節奏
- improvements: an array of exactly 3 objects, each with: title (string, 5 words max), desc (string, 30 words max)
- strengths: an array of exactly 3 short strings
- intermediateFocus: a string with 2 sentences about what this intermediate student should focus on
- intermediateChar: a single Chinese character relevant to the work
- studyRefs: an array of exactly 3 objects, each with: char (single Chinese character), name (master and work title), style (style name), reason (string under 15 words)`;

  try {
    // ── Resize to max 600px (gracefully skip if sharp unavailable) ──────────
    let finalBase64 = imageBase64;
    if (sharp) {
      try {
        const inputBuffer = Buffer.from(imageBase64, 'base64');
        const resizedBuffer = await sharp(inputBuffer)
          .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        finalBase64 = resizedBuffer.toString('base64');
      } catch (resizeErr) {
        // sharp failed — proceed with original image
        console.error('sharp resize failed, using original:', resizeErr.message);
      }
    }

    // ── Call Anthropic with retry on 429 ───────────────────────────────────
    let response;
    const delays = [2000, 5000, 10000]; // 2s, 5s, 10s
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
