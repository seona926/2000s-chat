export function onRequest({ request }) {
  const country = request.cf?.country
  const lang = country === 'KR' ? 'ko' : country && country !== 'XX' && country !== 'T1' ? 'en' : null
  return Response.json({ lang }, { headers: { 'Cache-Control': 'private, no-store' } })
}
