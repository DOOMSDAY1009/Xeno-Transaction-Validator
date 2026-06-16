// Vercel serverless function: runs real SQL against a cloud MySQL database.
//
// Credentials are read from environment variables set in the Vercel project
// (Settings -> Environment Variables) - they are NEVER sent to the browser:
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
// Optional: APP_API_KEY - if set, the request must send the same key.
//
// The frontend calls this with either:
//   { action: "load",  rows: [ {...}, ... ] }   -> rebuilds a table `data`
//   { action: "query", query: "SELECT ..." }    -> runs SQL, returns rows
//
// Works with any MySQL-compatible host (e.g. TiDB Cloud Serverless).

const mysql = require("mysql2/promise");

function getConfig() {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "test",
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectTimeout: 15000,
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  if (!process.env.DB_HOST) {
    res.status(503).json({ error: "Cloud database is not configured (missing DB_* environment variables)." });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

  // Optional shared-secret gate.
  if (process.env.APP_API_KEY && body.apiKey !== process.env.APP_API_KEY) {
    res.status(401).json({ error: "Invalid API key." });
    return;
  }

  let conn;
  try {
    conn = await mysql.createConnection(getConfig());

    if (body.action === "load") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) { res.status(400).json({ error: "No rows to load." }); return; }
      const cols = Object.keys(rows[0]);
      const colDefs = cols.map((c) => `\`${c}\` TEXT`).join(", ");
      await conn.query("DROP TABLE IF EXISTS `data`");
      await conn.query(`CREATE TABLE \`data\` (${colDefs})`);
      const values = rows.map((r) => cols.map((c) => (r[c] === undefined || r[c] === null ? null : String(r[c]))));
      // insert in batches to stay within packet limits
      for (let i = 0; i < values.length; i += 500) {
        await conn.query("INSERT INTO `data` VALUES ?", [values.slice(i, i + 500)]);
      }
      res.status(200).json({ loaded: values.length });
      return;
    }

    if (body.action === "query") {
      const q = (body.query || "").trim();
      if (!q) { res.status(400).json({ error: "Empty query." }); return; }
      const [result, fields] = await conn.query(q);
      if (Array.isArray(result)) {
        const columns = fields ? fields.map((f) => f.name) : (result[0] ? Object.keys(result[0]) : []);
        res.status(200).json({ columns, rows: result });
      } else {
        res.status(200).json({ columns: ["info"], rows: [{ info: `OK (${result.affectedRows} rows affected)` }] });
      }
      return;
    }

    res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    if (conn) await conn.end();
  }
};
