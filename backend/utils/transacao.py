"""Várias queries numa transação só: tudo ou nada.

O `executar_query` roda cada query sozinha (autocommit), o que basta para quase tudo no hub. A organização da
Pauta (P2) não: aplicar o resultado de um lote mexe em textos, tarefas, checklist e perguntas, e parar no meio
deixaria um texto "organizado" numa tarefa que não foi criada. Aqui ou entra tudo, ou nada.

    with em_transacao() as q:
        tarefa = q("tarefas:inserir", (...))[0]
        q("anotacoes:organizar", (...))

`q` devolve as linhas quando a query tem resultado (SELECT ou RETURNING) e, sem resultado, o número de linhas
afetadas. Qualquer exceção dentro do bloco desfaz tudo e sobe para quem chamou.

Sem retentativa de conexão (o `executar_query` tem uma): repetir uma transação pela metade não é seguro.
"""
from contextlib import contextmanager

from utils.db import Database
from utils.sql_manager import sql_manager


@contextmanager
def em_transacao():
    with Database() as pc:
        with pc.conn.transaction():
            def q(nome: str, params=None, **kwargs):
                pc.cur.execute(sql_manager.load_query(nome, **kwargs), params)
                return pc.cur.fetchall() if pc.cur.description else pc.cur.rowcount

            yield q
