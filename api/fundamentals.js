// /api/fundamentals.js — Vercel Serverless
// Scrapes Finviz for all fundamental data of a ticker

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  const ticker = (req.query.ticker || "").toUpperCase().trim();
  if (!ticker || !/^[A-Z]{1,6}$/.test(ticker)) {
    return res.status(400).json({ error: "Invalid ticker" });
  }

  try {
    const url = `https://finviz.com/quote.ashx?t=${ticker}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Referer": "https://finviz.com/screener.ashx",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Finviz returned ${response.status}` });
    }

    const html = await response.text();

    // Parse the snapshot table
    const data = {};
    // Finviz uses table rows with alternating label/value td pairs
    const tableMatch = html.match(/snapshot-table2[\s\S]*?<\/table>/);
    if (!tableMatch) {
      // Try alternate selector
      const rows = [...html.matchAll(/<td[^>]*class="[^"]*snapshot-td2-cp[^"]*"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*class="[^"]*snapshot-td2[^"]*"[^>]*>([\s\S]*?)<\/td>/g)];
      if (!rows.length) {
        return res.status(404).json({ error: "Ticker not found or Finviz blocked" });
      }
      rows.forEach(([, label, value]) => {
        const k = label.replace(/<[^>]+>/g, "").trim();
        const v = value.replace(/<[^>]+>/g, "").trim();
        if (k) data[k] = v;
      });
    } else {
      // Parse all td pairs from the table
      const pairs = [...tableMatch[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
      for (let i = 0; i < pairs.length - 1; i += 2) {
        const k = pairs[i][1].replace(/<[^>]+>/g, "").trim();
        const v = pairs[i+1][1].replace(/<[^>]+>/g, "").trim();
        if (k && k.length < 40) data[k] = v || "-";
      }
    }

    // Also grab company name and description
    const nameMatch = html.match(/<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>/);
    const company = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    // Sector/Industry from breadcrumbs
    const sectorMatch = html.match(/sector=([^&"]+)/);
    const industryMatch = html.match(/industry=([^&"]+)/);

    return res.status(200).json({
      ticker,
      company,
      sector: sectorMatch ? decodeURIComponent(sectorMatch[1].replace(/\+/g, " ")) : "",
      industry: industryMatch ? decodeURIComponent(industryMatch[1].replace(/\+/g, " ")) : "",
      data,
      timestamp: new Date().toISOString(),
      source: "finviz"
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
