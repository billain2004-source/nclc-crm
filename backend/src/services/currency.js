const { pool } = require('../db');

// Latest rate per currency, expressed as "units of currency per 1 USD".
async function getLatestRates(conn = pool) {
  const [rows] = await conn.query(
    `SELECT er.currency_code, er.rate_per_usd
       FROM exchange_rates er
       JOIN (SELECT currency_code, MAX(effective_date) AS d FROM exchange_rates GROUP BY currency_code) m
         ON m.currency_code = er.currency_code AND m.d = er.effective_date`
  );
  const rates = { USD: 1 };
  for (const r of rows) rates[r.currency_code] = Number(r.rate_per_usd);
  return rates;
}

// Convert an amount between currencies using USD as the pivot:
//   amount_to = amount_from * rate(to) / rate(from)
function convert(amount, from, to, rates) {
  if (amount === null || amount === undefined) return null;
  if (!from || !to || from === to) return Number(amount);
  const rf = rates[from];
  const rt = rates[to];
  if (!rf || !rt) return null; // unknown rate
  return Math.round(Number(amount) * (rt / rf) * 100) / 100;
}

async function getFirm(firmId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT f.*, c.name AS country_name, cur.symbol AS currency_symbol, cur.name AS currency_name
       FROM firms f
       JOIN countries c ON c.code = f.country_code
       JOIN currencies cur ON cur.code = f.base_currency
      WHERE f.id = ?`,
    [firmId]
  );
  return rows[0] || null;
}

module.exports = { getLatestRates, convert, getFirm };
