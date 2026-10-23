// Espelha o retorno dos endpoints do Agenda (ver backend/routers/agenda.py
// e resolvers/agenda.py). Mesma disciplina do Pydantic no backend: o
// contrato mora num lugar só.

export interface RespostaAgenda {
  mensagem: string
  // id da ação que ficou pendente por causa desta resposta — null quando
  // a resposta foi só informativa e não deixou nada em aberto
  acao_pendente_id: number | null
  // Só `/agenda/mensagem` devolve este campo. `/confirmar` e `/rejeitar`
  // não devolvem — por isso é opcional aqui, e não `boolean` puro: o tipo
  // conta a verdade do contrato, não o que seria mais cômodo.
  //
  // true  = é uma PROPOSTA esperando confirmação (tem Confirmar/Rejeitar)
  // false + acao_pendente_id != null = é uma PERGUNTA esperando resposta
  //         em texto (aguardando_info) — não tem botão pra clicar
  aguardando_confirmacao?: boolean
  // devolvido pelo /confirmar quando a ação real no Google Calendar deu
  // certo. Formato depende do tipo de ação; a UI só precisa saber que
  // existe, não interpretar.
  resultado?: unknown
}
