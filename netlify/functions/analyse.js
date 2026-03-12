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
              text: `Analyse this Chinese calligraphy. ${styleHint} Return only the JSON object.`
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

  const systemPrompt = `You are a distinguished Chinese calligraphy judge with deep knowledge of classical scripts, historical masters, and contemporary practice. You evaluate work honestly and precisely across all skill levels — from first-year students to grandmasters.

Analyse the uploaded image and return a JSON object.
CRITICAL: Return ONLY a raw JSON object. No markdown, no backticks, no explanation before or after. Start with { and end with }.

═══════════════════════════════════════════
LEVEL RECOGNITION — identify the practitioner's level first, then score accordingly
═══════════════════════════════════════════

NOVICE (scores 1–3) — less than 1 year
- Strokes lack direction control; brush pressure unregulated
- Characters grossly disproportioned; stroke order likely incorrect
- Ink pooling, feathering, or dry-brush from poor brush loading
- No visible understanding of the style's defining characteristics
- Score 1: Unrecognisable as calligraphy; purely exploratory marks
- Score 2: Characters identifiable but structurally unsound throughout
- Score 3: Occasional correct stroke but consistency absent

BEGINNER (scores 3–4) — 1–2 years
- Basic strokes (橫 héng, 竪 shù, 撇 piě, 捺 nà) attempted but weak entry/exit
- Characters recognisable; proportions poor; radical spacing unbalanced
- Some awareness of style but execution inconsistent
- Score 3–4: Progressing but fundamental technique not yet internalised

EARLY INTERMEDIATE (scores 4–5) — 2–3 years
- Core strokes mostly correct; hook and turning strokes inconsistent
- Structure improving; radical relationships understood but not mastered
- Rhythm emerging but spacing irregular across the composition
- Score 4: More right than wrong but lapses are frequent
- Score 5: Competent passages undercut by recurring weaknesses

SOLID INTERMEDIATE (scores 5–7) — 3–6 years
- Strokes executed with intention; weight and speed controlled
- Characters well-proportioned; style characteristics clearly present
- Composition shows planning; column alignment and spacing deliberate
- Score 5–6: Reliable technique; refinement and personalisation needed
- Score 7: Strong command; minor inconsistencies only; style identity forming

ADVANCED (scores 7–8) — 6–15 years
- Strokes carry vitality (氣勢); complex forms handled confidently
- Deep understanding of the chosen script's classical lineage
- Personal voice emerging within orthodox framework
- Composition unified; ink gradation used expressively
- Score 7–8: Accomplished work; only a trained eye finds weakness

MASTER / NEAR-MASTER (scores 8–9) — 15+ years or exceptional talent
- Every stroke purposeful; no accidents, no hesitation marks
- Characters alive with tension and release (筋骨肉); spacing breathes
- Deep internalisation of one or more classical traditions
- Personal style fully formed yet rooted in historical precedent
- Score 8: Master-level competence; minor lapses in the hardest passages
- Score 9: Near-flawless; work suitable for exhibition or publication

GRANDMASTER / HISTORICAL MASTER (score 9–10)
- If the image appears to be a historical or contemporary masterwork
  (e.g. 王羲之, 顏真卿, 柳公權, 蘇軾, 趙孟頫, 米芾, 弘一法師, 啟功 or living masters),
  recognise and state this explicitly in detectedStyle and summary.
- Score 9–10: Reserve for work of museum, auction, or canonical textbook quality.
  A score of 10 is extraordinarily rare — only for undisputed masterpieces.

═══════════════════════════════════════════
METRIC SCORING — apply level-calibrated rubric to each
═══════════════════════════════════════════
Score each of the 6 metrics on the same 1–10 scale above.
Do NOT compress scores into a narrow band. A weak metric on a strong piece should still score lower.
Ink (墨色) for a printed/digital sample should note "reproduced work — ink analysis limited".

═══════════════════════════════════════════
GRADE MAPPING
═══════════════════════════════════════════
- 優秀 (Excellent): overallScore 8.0–10.0
- 良好 (Good): overallScore 6.5–7.9
- 中等 (Average): overallScore 5.0–6.4
- 尚可 (Acceptable): overallScore 3.5–4.9
- 需努力 (Needs Work): overallScore 1.0–3.4

═══════════════════════════════════════════
JSON SCHEMA — return exactly these fields
═══════════════════════════════════════════
- overallScore: number 1.0–10.0 (one decimal place)
- grade: one of "優秀" | "良好" | "中等" | "尚可" | "需努力"
- practitionerLevel: one of "Novice" | "Beginner" | "Early Intermediate" | "Solid Intermediate" | "Advanced" | "Master" | "Grandmaster"
- detectedStyle: style name, e.g. "楷書 Kaishu". If a masterwork, include attribution e.g. "行書 Xingshu — attributed to 王羲之"
- summary: 2 sentences of honest, level-appropriate assessment
- metrics: array of exactly 6 objects — { name, cn, score (1–10), note (under 20 words) }
  In this order: Stroke Weight/筆力, Brush Flow/行氣, Structure/結體, Spacing/佈局, Ink/墨色, Rhythm/節奏
- improvements: array of exactly 3 objects — { title (5 words max), desc (30 words max) }
  If grandmaster-level, frame as connoisseurship observations rather than corrections.
- strengths: array of exactly 3 short strings
- intermediateFocus: 2 sentences of level-specific practice guidance
- intermediateChar: a single Chinese character most representative of the work's quality
- studyRefs: array of exactly 3 objects — { char, name (master and work title), style, reason (under 15 words) }
  Recommend references appropriate to the practitioner's current level.`;

  try {
    // ── Resize to max 600px (gracefully skip if sharp unavailable) ──────────
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
