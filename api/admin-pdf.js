import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export const config = { runtime: 'edge' };

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

function checkAuth(request) {
  const header = request.headers.get('Authorization');
  if (!header || !header.startsWith('Basic ')) return false;
  if (!process.env.ADMIN_PASSWORD) return false;
  const decoded = atob(header.slice(6));
  const sep = decoded.indexOf(':');
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return user === 'admin' && pass === process.env.ADMIN_PASSWORD;
}

function unauthorized() {
  return new Response('Autenticação necessária', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="admin"' },
  });
}

export default async function handler(request) {
  if (!checkAuth(request)) return unauthorized();

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key || !key.startsWith('cadastros/')) {
    return new Response('Chave inválida', { status: 400 });
  }

  try {
    const s3 = getClient();
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key })
    );
    return new Response(obj.Body, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${key.split('/').pop()}"`,
      },
    });
  } catch (err) {
    return new Response('Não encontrado', { status: 404 });
  }
}
