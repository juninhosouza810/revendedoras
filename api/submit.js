import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import formidable from 'formidable';
import fs from 'node:fs/promises';

export const config = {
  api: { bodyParser: false },
};

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const form = formidable({ multiples: false });
    const [fields, files] = await form.parse(req);

    const getField = (k) => {
      const v = fields[k];
      return Array.isArray(v) ? (v[0] || '') : (v || '');
    };

    const pdfEntry = files.pdf;
    const pdfFile = Array.isArray(pdfEntry) ? pdfEntry[0] : pdfEntry;
    if (!pdfFile) {
      res.status(400).json({ ok: false, error: 'PDF ausente no envio.' });
      return;
    }

    const nome = getField('nome') || 'revendedora';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug =
      nome
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'revendedora';
    const key = `cadastros/${stamp}-${slug}.pdf`;

    const pdfBuffer = await fs.readFile(pdfFile.filepath);

    const meta = {};
    for (const k of Object.keys(fields)) {
      meta[k] = getField(k);
    }
    meta.enviadoEm = new Date().toISOString();
    meta.arquivoPdf = key;

    const s3 = getClient();
    const bucket = process.env.R2_BUCKET_NAME;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: pdfBuffer,
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
      sendEmail(meta, pdfBuffer, key).catch((e) => console.error('Falha ao enviar e-mail:', e));
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro em /api/submit:', err);
    res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

async function sendEmail(meta, pdfBuffer, key) {
  const base64 = pdfBuffer.toString('base64');
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
