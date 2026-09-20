# Cadastro de Revendedoras — GitHub + Vercel + R2

Formulário de pré-cadastro. O PDF é gerado no navegador e enviado para uma
função da Vercel, que salva no bucket R2 `cadastro-revendedoras-pdfs`
(já criado na sua conta Cloudflare) usando a API compatível com S3 do R2.

## Estrutura
- `index.html` — o formulário (raiz do projeto, servido como página estática)
- `api/submit.js` — recebe o envio e salva o PDF + dados no R2
- `api/admin.js` — painel para ver os cadastros recebidos (`/api/admin`)
- `api/admin-pdf.js` — baixa um PDF específico do R2

## 1. Criar o token de acesso do R2 (API compatível com S3)

No painel da Cloudflare:
1. Vá em **R2** → **Manage R2 API Tokens** → **Create API Token**.
2. Permissão: **Object Read & Write**, escopo: apenas o bucket `cadastro-revendedoras-pdfs`.
3. Copie os três valores gerados: **Access Key ID**, **Secret Access Key** e o
   **Account ID** (aparece na mesma tela ou na URL do painel R2, algo como
   `dash.cloudflare.com/<ACCOUNT_ID>/r2`).

## 2. Subir o projeto para o GitHub

```
cd cadastro-vercel
git init
git add .
git commit -m "Primeira versão do cadastro de revendedoras"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/cadastro-revendedoras.git
git push -u origin main
```

## 3. Importar na Vercel

1. Em vercel.com → **Add New → Project** → selecione o repositório do GitHub.
2. Framework preset: **Other** (não é Next.js, não precisa de build).
3. Antes do primeiro deploy, adicione as variáveis de ambiente
   (Project Settings → Environment Variables), usando os nomes do arquivo
   `.env.example`:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME` = `cadastro-revendedoras-pdfs`
   - `ADMIN_EMAIL` = `manuelamiguel12345@gmail.com`
   - `ADMIN_PASSWORD` = escolha uma senha forte (protege o `/admin`)
   - *(opcional)* `RESEND_API_KEY` e `EMAIL_FROM` — para envio automático de
     e-mail com o PDF anexado (crie uma conta grátis em resend.com)
4. Clique em **Deploy**.

Depois disso, todo `git push` na branch `main` já publica automaticamente.

## Onde ficam os cadastros

- Painel: `https://SEU-PROJETO.vercel.app/api/admin`
  (login básico do navegador: usuário `admin`, senha que você definiu)
- Direto no R2: dashboard da Cloudflare → R2 → bucket `cadastro-revendedoras-pdfs`
  → pasta `cadastros/` (cada envio gera um `.pdf` e um `.json` com os dados)

## Domínio próprio

Em Project Settings → Domains na Vercel, adicione seu domínio ou subdomínio
(ex.: `cadastro.suamarca.com.br`) e siga as instruções de DNS mostradas lá.
