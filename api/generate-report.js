// Vercel Serverless Function
// 배포 경로: /api/generate-report.js
//
// Gemini API 키는 서버에서만 사용하고 클라이언트에는 절대 노출하지 않습니다.
// Vercel 프로젝트 설정 > Environment Variables 에 아래 값을 등록하세요:
//   GEMINI_API_KEY

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY가 Vercel 환경변수에 설정되어 있지 않습니다.' });
    return;
  }

  const { prompt, file } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: 'prompt가 필요합니다.' });
    return;
  }

  const parts = [];
  if (file && file.base64 && file.mimeType) {
    parts.push({ inlineData: { mimeType: file.mimeType, data: file.base64 } });
  }
  parts.push({ text: prompt });

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data?.error?.message || 'Gemini API 오류' });
      return;
    }
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n').trim();
    res.status(200).json({ text: text || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
