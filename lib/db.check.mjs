// node lib/db.check.mjs — o guarda do schema.
//
// O init() só aplica as 30 instruções de criação quando a marca da versão
// atual ainda não está na tabela migracoes. Isso tirou 600ms de toda
// instância nova da Vercel, mas abriu um buraco: quem acrescentar uma coluna
// e esquecer de mudar SCHEMA_VERSAO nunca verá essa coluna em produção, e a
// gravação passa a falhar em silêncio, que é o pior tipo de erro.
//
// Este arquivo fecha o buraco. Ele guarda a impressão digital do bloco de
// schema e falha quando o bloco muda sem a versão mudar junto.
//
// Mexeu no schema? Rode `node lib/db.check.mjs`, copie a digital que ele
// imprime e acrescente aqui uma linha nova com a data nova.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const ESPERADO = {
  "2026-11-11": "0e2abdfdac05",
  "2026-11-11b": "32db09d2c85f",
};

let falhou = false;
const ok = (cond, msg) => {
  if (!cond) falhou = true;
  console.log((cond ? "ok: " : "FALHOU: ") + msg);
};

const fonte = readFileSync(new URL("./db.js", import.meta.url), "utf8");

const versao = fonte.match(/const SCHEMA_VERSAO = "([^"]+)"/)?.[1];
ok(!!versao, "db.js declara SCHEMA_VERSAO");

// O bloco vai do disparo condicional até o fecho da transação.
const ini = fonte.indexOf("if (marcaSchema.length > 0) await sql.transaction([");
const fim = fonte.indexOf("\n      ]);", ini);
ok(ini > 0 && fim > ini, "o bloco de schema está onde o teste espera");

const bloco = fonte.slice(ini, fim);
const digital = createHash("sha256").update(bloco).digest("hex").slice(0, 12);

// Só vale o que o schema manda para o banco. Comentário e espaço mudam toda
// semana e não mudam tabela nenhuma: travar neles seria alarme falso.
const instrucoes = bloco.match(/sql`[^`]+`/g) || [];
ok(instrucoes.length >= 30, `o bloco tem ${instrucoes.length} instruções, 30 ou mais`);

const digitalSQL = createHash("sha256")
  .update(instrucoes.map((i) => i.replace(/\s+/g, " ")).join("\n"))
  .digest("hex")
  .slice(0, 12);

if (ESPERADO[versao] !== digitalSQL) {
  falhou = true;
  console.log("");
  console.log("FALHOU: o schema mudou e a versão não acompanhou.");
  console.log(`  SCHEMA_VERSAO em db.js: "${versao}"`);
  console.log(`  digital registrada:     ${ESPERADO[versao] || "(nenhuma para esta versão)"}`);
  console.log(`  digital do schema hoje: ${digitalSQL}`);
  console.log("");
  console.log("  Sem corrigir isto, a instância em produção pula a criação e a");
  console.log("  coluna nova nunca existe lá. Em lib/db.js mude SCHEMA_VERSAO para");
  console.log("  a data de hoje; aqui acrescente a linha correspondente:");
  console.log(`    "AAAA-MM-DD": "${digitalSQL}",`);
} else {
  console.log(`ok: schema "${versao}" bate com a digital ${digitalSQL}`);
}

// A marca gravada no banco é derivada da versão: se o prefixo mudar, bancos
// já migrados voltariam a aplicar tudo.
ok(/`schema-\$\{SCHEMA_VERSAO\}`/.test(fonte), "a marca gravada é schema-<versao>");
// Sem isto, o bloco rodaria sempre e o ganho sumiria sem ninguém notar.
ok(/if \(marcaSchema\.length > 0\)/.test(fonte), "o schema só roda quando a marca não existe");

console.log(falhou ? "\nFALHOU" : `\ntudo certo (digital ${digitalSQL})`);
process.exit(falhou ? 1 : 0);
