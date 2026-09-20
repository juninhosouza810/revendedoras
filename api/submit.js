import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const form = await request.formData();
    const pdfFile = form.get('pdf');
    const nome = (form.get('nome') || 'revendedora').toString();

    if (!pdfFile || typeof pdfFile === 'string') {
      return json({ ok: false, error: 'PDF ausente no envio.' }, 400);
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug =
      nome
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'revendedora';
    const key = `cadastros/${stamp}-${slug}.pdf`;

    const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());

    const meta = {};
    for (const [k, v] of form.entries()) {
      if (k === 'pdf') continue;
      meta[k] = v.toString();
    }
    meta.enviadoEm = new Date().toISOString();
    meta.arquivoPdf = key;

    const s3 = getClient();
    const bucket = process.env.R2_BUCKET_NAME;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: pdfBytes,
        ContentType: 'application/pdf',
      })
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key.replace(/\.pdf$/, '.json'),
        Body: JSON.stringify(meta, null, 2),
        ContentType: 'application/json',
      })
    );

    if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
      sendEmail(meta, pdfBytes, key).catch((e) => console.error('Falha ao enviar e-mail:', e));
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

async function sendEmail(meta, pdfBytes, key) {
  const base64 = arrayBufferToBase64(pdfBytes);
  const filename = key.split('/').pop();
  const bodyText = Object.entries(meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const payload = {
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    to: [process.env.ADMIN_EMAIL],
    subject: `Novo cadastro de revendedora — ${meta.nome || 'sem nome'}`,
    text: bodyText,
    attachments: [{ filename, content: base64 }],
  };

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error(`Resend respondeu ${resp.status}: ${await resp.text()}`);
  }
}

function arrayBufferToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
