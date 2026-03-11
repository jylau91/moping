exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured. Set ANTHROPIC_API_KEY in environment variables.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { imageBase64, mediaType, style } = body;

  if (!imageBase64 || !mediaType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing imageBase64 or mediaType' }) };
  }

  const styleHint = style && style !== 'auto'
    ? `The user indicates this may be ${style} style.`
    : 'Please auto-detect the calligraphy style.';

  const systemPrompt = `You are a master Chinese calligraphy teacher evaluating work from an intermediate student (1-3 years practice). Analyse the uploaded image and return a JSON object.

CRITICAL: Return ONLY a raw JSON object. No markdown, no backticks, no explanation before or after. Start your response with { and end with }.

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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: `Analyse this Chinese calligraphy for an intermediate student. ${styleHint} Return only the JSON object.` }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || 'Anthropic API error' })
      };
    }

    const raw = data.content?.find(b => b.type === 'text')?.text || '';
    const clean = raw.replace(/```json\n?|```/g, '').trim();

    // Validate it parses before sending back
    JSON.parse(clean);

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
