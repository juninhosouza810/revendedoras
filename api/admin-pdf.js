import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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

export default async function handler(req, res) {
  if (!checkAuth(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="admin"');
    res.status(401).send('Autenticação necessária');
    return;
  }

  const key = req.query.key;
  if (!key || Array.isArray(key) || !key.startsWith('cadastros/')) {
    res.status(400).send('Chave inválida');
    return;
  }

  try {
    const s3 = getClient();
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key })
    );

    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="${key.split('/').pop()}"`);
    obj.Body.pipe(res);
  } catch (err) {
    console.error('Erro em /api/admin-pdf:', err);
    res.status(404).send('Não encontrado');
  }
}
