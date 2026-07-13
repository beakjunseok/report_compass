// Vercel Serverless Function
// 배포 경로: /api/config.js  (프로젝트 루트에 api/config.js 로 저장)
//
// Vercel 프로젝트 설정 > Environment Variables 에 아래 두 값을 등록하세요:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//
// anon key는 원래 클라이언트에 노출되는 공개 키이며, 실제 접근 제어는
// Supabase의 Row Level Security(RLS)가 담당합니다.

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  });
};