// Sem "server-only" de propósito: ele impede o lib/gmail.check.mjs de importar
// este módulo direto no Node, e a montagem do MIME é justamente o que quebra
// calado. O node:crypto abaixo já derruba o build se alguém importar isto num
// componente de cliente.
import { createSign } from "node:crypto";
export { separaAssunto, paraHtml } from "./gmail-texto.js";

// Envio pela Gmail API, como o próprio farmer. É o mesmo caminho do painel de
// formalização (formalizacao-b2b/lib/gmail.ts), portado para JS sem mudar a
// mecânica: service account com domain-wide delegation, escopo gmail.send e
// só ele. O e-mail sai da caixa de quem está mandando, a resposta do cliente
// volta para ela, e o BCC de log registra na timeline do HubSpot.
//
// Sem googleapis: são ~60 linhas de JWT com node:crypto contra dezenas de MB
// de SDK para dois endpoints.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ESCOPO = "https://www.googleapis.com/auth/gmail.send";

export const envioConfigurado = () =>
  Boolean(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_KEY);

export const bccDeLog = () => process.env.HUBSPOT_BCC || "";

const b64url = (b) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Token impersonando `comoEmail`. Exige a delegação liberada no Admin do
// Workspace para o client id da service account, com ESTE escopo e só ele.
async function tokenComo(comoEmail) {
  const iss = process.env.GOOGLE_SA_EMAIL;
  // A chave vem do JSON da service account com \n escapado; no painel da
  // Vercel ela chega como literal "\n" e o createSign rejeita sem este replace.
  const key = (process.env.GOOGLE_SA_KEY ?? "").replace(/\\n/g, "\n");
  if (!iss || !key) throw new Error("GOOGLE_SA_EMAIL / GOOGLE_SA_KEY não definidos no ambiente.");

  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(
    JSON.stringify({ iss, sub: comoEmail, scope: ESCOPO, aud: TOKEN_URL, iat: agora, exp: agora + 3600 })
  );
  const assinatura = b64url(createSign("RSA-SHA256").update(`${cabecalho}.${corpo}`).sign(key));

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cabecalho}.${corpo}.${assinatura}`,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    // "unauthorized_client" aqui = delegação não liberada para este escopo.
    throw new Error(`Google recusou o token para ${comoEmail}: ${res.status} ${body.slice(0, 400)}`);
  }
  return JSON.parse(body).access_token;
}

// Prova que a credencial e a delegação funcionam, sem mandar e-mail para
// ninguém. É este passo que falha com "unauthorized_client" quando a delegação
// não está liberada no Workspace para o escopo, e sem ele a única forma de
// descobrir isso seria escrevendo para um cliente de verdade.
export async function testaCredencial(comoEmail) {
  await tokenComo(comoEmail);
  return true;
}

// RFC 2047: assunto e nome do remetente com acento viram ?UTF-8?B?
export function cabecalhoUtf8(v) {
  return /^[\x20-\x7E]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

export function mime(de, e) {
  // O filtro de vazio é SÓ dos cabeçalhos opcionais. Aplicado na lista inteira
  // ele comia a linha em branco que separa cabeçalho de corpo, e aí o Gmail
  // trata o HTML como mais cabeçalho e a mensagem sai vazia.
  const cabecalhos = [
    `From: ${cabecalhoUtf8(de.nome)} <${de.email}>`,
    `To: ${(e.para || []).join(", ")}`,
    e.cc?.length ? `Cc: ${e.cc.join(", ")}` : "",
    e.bcc?.length ? `Bcc: ${e.bcc.join(", ")}` : "",
    `Subject: ${cabecalhoUtf8(e.assunto)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ].filter((l) => l !== "");

  // base64 em linhas de 76: acima disso há servidor que recusa a mensagem.
  const corpo = Buffer.from(e.html, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");

  return `${cabecalhos.join("\r\n")}\r\n\r\n${corpo}`;
}

export async function enviar(de, e) {
  if (!e.para?.length) throw new Error(`"${e.assunto}" está sem destinatário.`);

  const token = await tokenComo(de.email);
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(de.email)}/messages/send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64url(mime(de, e)) }),
    }
  );
  const body = await res.text();
  if (!res.ok) throw new Error(`Gmail recusou "${e.assunto}": ${res.status} ${body.slice(0, 400)}`);
  return JSON.parse(body).id;
}
