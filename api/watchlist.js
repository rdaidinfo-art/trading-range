import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { method, body, query } = req

  if (method === 'GET') {
    const { data, error } = await supabase
      .from('watchlist')
      .select('ticker')
      .eq('session_id', query.session_id)
      .order('created_at', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data.map(r => r.ticker))
  }

  if (method === 'POST') {
    const { session_id, ticker } = body
    const { error } = await supabase
      .from('watchlist')
      .insert({ session_id, ticker })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  if (method === 'DELETE') {
    const { session_id, ticker } = body
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('session_id', session_id)
      .eq('ticker', ticker)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
