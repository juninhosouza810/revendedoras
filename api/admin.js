import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

function getClient() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function checkAuth(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) return false;
  if (!process.env.ADMIN_PASSWORD) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return user === 'admin' && pass === process.env.ADMIN_PASSWORD;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export default async function handler(req, res) {
  if (!checkAuth(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="admin"');
    res.status(401).send('Autenticação necessária');
    return;
  }

  try {
    const s3 = getClient();
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, Prefix: 'cadastros/' })
    );

    const pdfObjects = (listed.Contents || [])
      .filter((o) => o.Key.endsWith('.pdf'))
      .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));

    const rows = pdfObjects
      .map((o) => {
        const filename = o.Key.split('/').pop();
        const data = new Date(o.LastModified).toLocaleString('pt-BR');
        return `<tr><td>${escapeHtml(filename)}</td><td>${data}</td><td><a href="/api/admin-pdf?key=${encodeURIComponent(o.Key)}">baixar PDF</a></td></tr>`;
      })
      .join('');

    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Cadastros recebidos</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:820px;margin:48px auto;padding:0 16px;color:#2B2430;}
  h1{font-weight:600;}
  table{width:100%;border-collapse:collapse;margin-top:20px;}
  th,td{padding:10px 12px;border-bottom:1px solid #E4D9C8;text-align:left;font-size:14px;}
  a{color:#8A6A3B;}
</style>
</head><body>
<h1>Cadastros recebidos (${pdfObjects.length})</h1>
<table><tr><th>Arquivo</th><th>Recebido em</th><th></th></tr>${rows || '<tr><td colspan="3">Nenhum cadastro ainda.</td></tr>'}</table>
</body></html>`;

    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    console.error('Erro em /api/admin:', err);
    res.status(500).send('Erro ao carregar cadastros: ' + String(err && err.message ? err.message : err));
  }
}
