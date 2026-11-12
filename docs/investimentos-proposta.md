# Agente de investimentos — proposta (não aprovada)

> **Status:** proposta de 2026-11-11, **sem "pode"**. O **segundo andar** já existe (`docs/segundo-andar.md`, branch
> `feat/andares`) e está vazio esperando este agente; voltamos aqui depois. Nada foi codado. Perguntas em aberto no fim.

## O pedido

"Um agente de finanças para cuidar dos meus investimentos, no segundo andar."

## Por que um agente novo, e não a Cifra

A Cifra cuida do que **sai** (extrato, gastos, relatório do mês). O novo cuida do que **fica** (patrimônio, aportes,
rentabilidade, metas). Eles conversam: a **sobra do mês** que a Cifra calcula vira a **sugestão de aporte** do novo.

## O que "cuidar dos investimentos" faria (quase tudo sem LLM)

- **Carteira e patrimônio:** quanto há em cada coisa (Tesouro, CDB, ações, FIIs, fundos), somado e por classe.
- **Rentabilidade honesta:** quanto rendeu de verdade, comparado com CDI e IPCA. Conta, não LLM.
- **Alocação-alvo do chefe** (ex.: 40% renda fixa, 30% ações, 20% FIIs, 10% exterior): quanto está fora e onde pôr o
  próximo aporte para voltar ao alvo. Conta, não LLM.
- **Metas:** reserva de emergência (meses de gasto, com o dado real da Cifra) e objetivos de longo prazo ("faltam X/mês").
- **Avisos que valem a pena:** título vencendo, concentração alta num ativo, desvio grande do alvo.
- **LLM só no relatório do mês:** o que aconteceu, o que mudou e a sugestão de aporte explicada. Uma chamada por mês.

**Trava inegociável:** **nunca** recomenda comprar ativo específico e **nunca** executa ordem em corretora. Sugestão é
sempre "rebalancear para o alvo que você definiu" e "comparar com CDI/IPCA". Escolher ativo é decisão do chefe.

## De onde vêm os dados

- **Manual:** "aportei R$ 500 no Tesouro IPCA+ 2035". Simples, sempre funciona.
- **Planilha de movimentações da B3** (Área do Investidor): ações, FIIs, Tesouro e renda fixa de todas as corretoras.
- **Índices e cotações:** CDI, Selic e IPCA da API pública do Banco Central (SGS); taxas e preços do Tesouro Direto
  (dados públicos). Cotação de ação depende de serviço externo (pode exigir chave e liberação na rede do ambiente).

## Fases propostas

| Fase | Entrega | LLM? |
|---|---|---|
| I1 | Banco: ativos, movimentações, alocação-alvo, metas; registro manual | não |
| I2 | Importar a planilha da B3 | não |
| I3 | CDI/Selic/IPCA e Tesouro (Banco Central); rentabilidade x CDI e IPCA | não |
| I4 | Rebalanceamento, aporte do mês (com a sobra da Cifra), reserva de emergência, avisos no tick | não |
| I5 | Relatório do mês | sim, 1 por mês |
| I6 | Painel e sala no 2º andar | não |

## Decisões em aberto (perguntar ao chefe ao retomar)

1. Agente novo separado da Cifra? (recomendação: sim)
2. O que ele tem hoje: Tesouro, CDB/LCI, ações, FIIs, fundos, cripto, previdência, exterior?
3. Entrada dos dados: só manual, ou manual + planilha da B3? Corretora fora da B3 (cripto, exterior), qual?
4. Avisos no chat (título vencendo, carteira desbalanceada) ou só no painel? (Na Pauta ele não quis lembrete.)
5. 2º andar: "andar do dinheiro" com a Cifra subindo junto, ou só o agente novo lá em cima?
6. Nome: Lastro, Safra, Cofre, ou outro.
