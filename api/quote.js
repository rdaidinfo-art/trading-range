// /api/quote.js — Vercel Serverless Function
// Yahoo Finance (primary) → Polygon.io (fallback)
// Returns: { ticker, price, bid, ask, change, changePct, volume, marketState, source }

const POLYGON_KEY = process.env.POLYGON_API_KEY || "";

async function fetchYahoo(ticker) {
  // Step 1: get crumb + cookie
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });
  const cookie = cookieRes.headers.get("set-cookie") || "";

  // Step 2: get crumb
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Cookie": cookie
    }
  });
  const crumb = await crumbRes.text();
  if (!crumb || crumb.includes("<!DOCTYPE")) throw new Error("No crumb");

  // Step 3: fetch quote
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}&crumb=${encodeURIComponent(crumb)}`;
  const quoteRes = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Cookie": cookie,
      "Accept": "application/json"
    }
  });
  const data = await quoteRes.json();
  const q = data?.quoteResponse?.result?.[0];
  if (!q) throw new Error("No quote data");

  return {
    ticker: q.symbol,
    price: q.regularMarketPrice,
    bid: q.bid ?? q.regularMarketPrice,
    ask: q.ask ?? q.regularMarketPrice,
    bidSize: q.bidSize ?? 0,
    askSize: q.askSize ?? 0,
    change: q.regularMarketChange,
    changePct: q.regularMarketChangePercent,
    volume: q.regularMarketVolume,
    open: q.regularMarketOpen,
    prevClose: q.regularMarketPreviousClose,
    high: q.regularMarketDayHigh,
    low: q.regularMarketDayLow,
    marketState: q.marketState, // REGULAR, PRE, POST, CLOSED
    source: "yahoo"
  };
}

async function fetchPolygon(ticker) {
  if (!POLYGON_KEY) throw new Error("No Polygon key");
  const res = await fetch(
    `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_KEY}`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  const data = await res.json();
  const t = data?.ticker;
  if (!t) throw new Error("No Polygon data");

  const day = t.day || {};
  const lastQuote = t.lastQuote || {};
  const lastTrade = t.lastTrade || {};

  return {
    ticker: ticker,
    price: lastTrade.p ?? t.prevDay?.c ?? 0,
    bid: lastQuote.p ?? 0,
    ask: lastQuote.P ?? 0,
    bidSize: lastQuote.s ?? 0,
    askSize: lastQuote.S ?? 0,
    change: t.todaysChange ?? 0,
    changePct: t.todaysChangePerc ?? 0,
    volume: day.v ?? 0,
    open: day.o ?? 0,
    prevClose: t.prevDay?.c ?? 0,
    high: day.h ?? 0,
    low: day.l ?? 0,
    marketState: "REGULAR",
    source: "polygon"
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const ticker = (req.query.ticker || "").toUpperCase().trim();
  if (!ticker || !/^[A-Z]{1,6}$/.test(ticker)) {
    return res.status(400).json({ error: "Invalid ticker" });
  }

  // Try Yahoo first, then Polygon
  try {
    const quote = await fetchYahoo(ticker);
    return res.status(200).json(quote);
  } catch (yahooErr) {
    try {
      const quote = await fetchPolygon(ticker);
      return res.status(200).json({ ...quote, yahooError: yahooErr.message });
    } catch (polyErr) {
      return res.status(502).json({
        error: "Both sources failed",
        yahoo: yahooErr.message,
        polygon: polyErr.message
      });
    }
  }
}
