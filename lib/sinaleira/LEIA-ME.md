# Cópia da régua da Sinaleira

`sinaleira.ts` e `relogios.ts` são **cópia literal** de `painel-tramitacao/lib`.
Não edite aqui: edite lá e copie de novo.

```bash
cp ../painel-tramitacao/lib/{sinaleira,relogios}.ts lib/sinaleira/
npm run check
```

## Por que cópia e não reescrita

O Diário tinha uma régua própria, aproximada, que media distância até o evento.
A Sinaleira mede marcos de cada etapa: logística vence 5 dias após o ganho do
negócio, não perto do evento. Resultado medido em 05/11/2026: dois tickets da
Luiza em Contratar Logística apareciam verdes no Diário e vermelhos na
Sinaleira. Transcrever a regra à mão foi o que produziu essa divergência, então
agora é cópia.

## Por que cópia e não dependência compartilhada

São dois projetos Vercel separados, sem pacote comum. A cópia tem o defeito de
poder envelhecer: no dia em que o CS recalibrar a Sinaleira, é preciso rodar o
comando acima. A solução boa é o Diário consumir a régua da Sinaleira por API,
e vale fazer quando isso estabilizar.
