"""Testes do motor de interação — Etapa 2 (camada social): elegibilidade
determinística (quem tenta falar), roleta ponderada pela afinidade (com
quem fala), guardrails (orçamento, rate limit por par) e persistência
(mensagem, afinidade, estado do agente); e Etapa 3 (proatividade de
trabalho): gatilho de estagnação do Norte, prioridade sobre social, teto
diário de avisos. Mocka só o modelo/a função do agente de interação (ou
`resolvers.norte.gerar_proximo_card` na Etapa 3) — nunca a lógica de
decisão em si, mesma disciplina usada nos outros domínios."""
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo

import pytest

import resolvers.interacao as interacao
import resolvers.tick as tick
from config import settings
from tests.helpers import registrar_gasto, resultado_agente
from utils.query_executor import executar_query


def _criar_agente(nome: str, extroversao: int = 5, ativo: bool = True, especialidade: str = "teste") -> int:
    rows = executar_query(
        "agentes:upsert",
        returning=True,
        params=(nome, "colaborador", especialidade, f"Personalidade de {nome}.", "{}", 0, extroversao),
    )
    agente_id = rows[0]["id"]
    if not ativo:
        from utils.db import Database
        with Database() as conn:
            conn.execute("UPDATE agentes SET ativo = FALSE WHERE id = %s", (agente_id,))
            conn.commit()
    return agente_id


def _criar_projeto_norte(nome: str = "Projeto", dias_atras: int = 10) -> int:
    rows = executar_query(
        "projetos:inserir",
        returning=True,
        params=(nome, f"https://github.com/o/{nome}", "o", nome, "main", "desc", ["Python"], "arch", "sha0"),
    )
    projeto_id = rows[0]["id"]
    from utils.db import Database
    with Database() as conn:
        conn.execute(
            "UPDATE projetos SET criado_em = now() - (%s || ' days')::interval WHERE id = %s",
            (str(dias_atras), projeto_id),
        )
        conn.commit()
    return projeto_id


def _criar_chefe(nome: str = "Você") -> int:
    rows = executar_query(
        "agentes:upsert",
        returning=True,
        params=(nome, "chefe", "chefe", None, "{}", 0, 5),
    )
    return rows[0]["id"]


def _mensagem_gerada(conteudo: str = "Oi, tudo certo por aí?"):
    return resultado_agente(SimpleNamespace(conteudo=conteudo))


def _escolhe_o_chefe(population, weights, k):
    chefe_candidato = [c for c in population if c["especialidade"] == "chefe"]
    return chefe_candidato if chefe_candidato else [population[0]]


class TestFuncoesPuras:
    def test_chance_falar_soma_extroversao_e_cooldown(self):
        assert interacao._chance_falar(extroversao=10, ticks_parado=0) == pytest.approx(0.5)
        assert interacao._chance_falar(extroversao=0, ticks_parado=0) == 0.0

    def test_chance_falar_nunca_passa_do_teto(self):
        assert interacao._chance_falar(extroversao=10, ticks_parado=1000) == pytest.approx(0.9)

    def test_peso_destinatario_cresce_com_afinidade(self):
        assert interacao._peso_destinatario(0) == pytest.approx(1.0)
        assert interacao._peso_destinatario(100) == pytest.approx(4.0)

    def test_peso_destinatario_nao_fica_negativo_com_afinidade_negativa(self):
        # -100 de afinidade daria peso 1 + (-1)*3 = -2 sem o piso — o piso
        # garante que nenhum par fica com chance zero/negativa de se falar.
        assert interacao._peso_destinatario(-100) == pytest.approx(0.1)

    def test_delta_afinidade_diminui_conforme_afinidade_atual_sobe(self):
        assert interacao._delta_afinidade(0) == pytest.approx(3.0)
        assert interacao._delta_afinidade(50) == pytest.approx(1.5)
        assert interacao._delta_afinidade(100) == pytest.approx(0.0)

    def test_fato_do_dia_deriva_do_relogio_simulado_nao_da_data_real(self):
        # Sexta-feira (2026-01-02 é sexta), manhã.
        sexta_de_manha = datetime(2026, 1, 2, 9, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))
        fato = interacao._fato_do_dia(sexta_de_manha)
        assert "sexta-feira" in fato
        assert "manhã" in fato
        assert "fim de semana" not in fato

        # Sábado à noite.
        sabado_a_noite = datetime(2026, 1, 3, 20, 0, tzinfo=ZoneInfo("America/Sao_Paulo"))
        fato_fds = interacao._fato_do_dia(sabado_a_noite)
        assert "sábado" in fato_fds
        assert "fim de semana" in fato_fds
        assert "noite" in fato_fds

    def test_periodo_do_dia_cobre_as_quatro_faixas(self):
        assert interacao._periodo_do_dia(3) == "madrugada"
        assert interacao._periodo_do_dia(9) == "manhã"
        assert interacao._periodo_do_dia(15) == "tarde"
        assert interacao._periodo_do_dia(21) == "noite"


class TestGuardrails:
    async def test_sem_tick_ainda_levanta_erro(self):
        with pytest.raises(ValueError, match="Nenhum tick rodou"):
            await interacao.processar_tick_completo()

    async def test_orcamento_esgotado_bloqueia_tudo_sem_chamar_llm(self, mocker):
        agente_a = _criar_agente("A", extroversao=10)
        _criar_agente("B", extroversao=10)
        tick.avancar_tick()

        # o orçamento sai de `tick_execucoes` desde que o UNION sobre as
        # tabelas de domínio foi aposentado — gravar um relatório não move
        # mais o teto por si só, quem move é a execução registrada
        registrar_gasto(agente_a, 999.0)

        mock_gerar = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        resultado = await interacao.processar_tick_completo()

        assert "esgotado" in resultado["aviso"]
        assert mock_gerar.call_count == 0
        assert executar_query("mensagens:listar_todas", params=(10,)) == []

    async def test_um_colaborador_sozinho_nao_disputa_social_mas_nao_quebra(self):
        # Com só 1 colaborador ativo não tem com quem falar socialmente,
        # mas isso não deveria bloquear a rodada inteira — trabalho (se
        # esse único agente tivesse motivo) ainda seria possível.
        agente_id = _criar_agente("Sozinho", extroversao=10)
        tick.avancar_tick()

        resultado = await interacao.processar_tick_completo()

        assert "aviso" not in resultado
        entrada = resultado["interacoes"][0]
        assert entrada["agente_id"] == agente_id
        assert entrada["tipo"] is None
        assert entrada["quer_falar"] is False

    async def test_rate_limit_do_par_impede_novo_destinatario_sem_chamar_llm(self, mocker):
        a_id = _criar_agente("A", extroversao=10)
        b_id = _criar_agente("B", extroversao=10)
        tick_info = tick.avancar_tick()
        numero_tick = tick_info["numero"]

        from config import settings
        for _ in range(settings.interacao_rate_limit_par_por_dia):
            executar_query(
                "mensagens:inserir",
                returning=True,
                params=(a_id, b_id, "social", "mensagem antiga", numero_tick, None),
            )

        mocker.patch("resolvers.interacao.random.random", return_value=0.0)
        mock_gerar = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        resultado = await interacao.processar_tick_completo()

        entrada_a = next(i for i in resultado["interacoes"] if i["agente_id"] == a_id)
        assert entrada_a["quer_falar"] is True
        assert entrada_a["destinatario_id"] is None
        assert "rate limit" in entrada_a["aviso"]
        assert mock_gerar.call_count == 0


class TestDryRun:
    async def test_dry_run_nao_persiste_nada_nem_chama_llm(self, mocker):
        _criar_agente("A", extroversao=10)
        _criar_agente("B", extroversao=10)
        tick.avancar_tick()

        mocker.patch("resolvers.interacao.random.random", return_value=0.0)
        mock_gerar = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        resultado = await interacao.processar_tick_completo(dry_run=True)

        assert any(i["quer_falar"] for i in resultado["interacoes"])
        assert all(i["mensagem"] is None for i in resultado["interacoes"])
        assert mock_gerar.call_count == 0
        assert executar_query("mensagens:listar_todas", params=(10,)) == []


class TestRodadaReal:
    async def test_gera_mensagem_atualiza_afinidade_e_estado(self, mocker):
        a_id = _criar_agente("A", extroversao=10)
        b_id = _criar_agente("B", extroversao=10)
        tick_info = tick.avancar_tick()
        numero_tick = tick_info["numero"]

        executar_query("relacionamentos:upsert_neutro", commit=True, params=(a_id, b_id))
        executar_query("relacionamentos:upsert_neutro", commit=True, params=(b_id, a_id))

        # Só A sorteia "quer falar" (0.0 < chance) — B não (1.0 < chance é
        # falso) — isolando exatamente 1 interação nesse tick, pra conferir
        # a fórmula de afinidade sem uma segunda troca (A->B e B->A) somando
        # duas vezes por cima.
        mocker.patch("resolvers.interacao.random.random", side_effect=[0.0, 1.0])
        mock_gerar = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada("Oi, tudo certo?"),
        )

        resultado = await interacao.processar_tick_completo()

        assert mock_gerar.call_count == 1
        fato_do_dia_passado = mock_gerar.call_args.args[-4]
        assert "hoje é" in fato_do_dia_passado
        assert mock_gerar.call_args.args[-3] is False  # destinatario_eh_chefe
        assert mock_gerar.call_args.args[-2] is None  # mensagem_para_responder (sem pendência)
        assert mock_gerar.call_args.args[-1] is True  # pode_novo_assunto (histórico vazio)

        mensagens = executar_query("mensagens:listar_todas", params=(10,))
        assert len(mensagens) >= 1
        assert mensagens[0]["tipo"] == "social"
        assert mensagens[0]["tick"] == numero_tick

        par = executar_query("relacionamentos:buscar_por_par", params=(a_id, b_id))[0]
        assert par["afinidade"] == 3  # 0 -> delta de 3 (afinidade inicial 0)

        agente_a = executar_query("agentes:buscar_por_id", params=(a_id,))[0]
        assert agente_a["estado"] == "falando"

    async def test_evento_mundo_e_marcado_como_usado(self, mocker):
        _criar_agente("A", extroversao=10)
        _criar_agente("B", extroversao=10)
        tick.avancar_tick()

        evento = executar_query("eventos_mundo:inserir", returning=True, params=("Está calor hoje.", None))[0]

        mocker.patch("resolvers.interacao.random.random", return_value=0.0)
        mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        await interacao.processar_tick_completo()

        eventos = executar_query("eventos_mundo:listar")
        assert eventos[0]["ultimo_uso_tick"] == evento["tick"] or eventos[0]["ultimo_uso_tick"] is not None


class TestEventosMundoManual:
    def test_criar_e_listar_evento_manual(self):
        _criar_agente("A")
        criado = interacao.criar_evento_mundo("Sextou.")
        listados = interacao.listar_eventos_mundo()
        assert any(e["descricao"] == "Sextou." for e in listados)
        assert criado["descricao"] == "Sextou."


class TestChefeComoDestinatario:
    async def test_agente_pode_puxar_papo_com_o_chefe(self, mocker):
        chefe_id = _criar_chefe()
        a_id = _criar_agente("A", extroversao=10)
        _criar_agente("B", extroversao=10)
        tick.avancar_tick()

        executar_query("relacionamentos:upsert_neutro", commit=True, params=(a_id, chefe_id))
        executar_query("relacionamentos:upsert_neutro", commit=True, params=(chefe_id, a_id))

        # Só A elege falar (0.0 < chance); B não (1.0 < chance é falso).
        mocker.patch("resolvers.interacao.random.random", side_effect=[0.0, 1.0])
        mocker.patch("resolvers.interacao.random.choices", side_effect=_escolhe_o_chefe)
        mock_gerar = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada("Bom dia, chefe!"),
        )

        resultado = await interacao.processar_tick_completo()

        assert mock_gerar.call_count == 1
        assert mock_gerar.call_args.args[-3] is True  # destinatario_eh_chefe

        mensagens = executar_query("mensagens:listar_todas", params=(10,))
        assert any(m["destinatario_id"] == chefe_id for m in mensagens)

        par = executar_query("relacionamentos:buscar_por_par", params=(a_id, chefe_id))[0]
        assert par["afinidade"] == 3

    async def test_chefe_nunca_e_sorteado_para_falar(self, mocker):
        _criar_chefe()
        _criar_agente("A", extroversao=10)
        _criar_agente("B", extroversao=10)
        tick.avancar_tick()

        mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        resultado = await interacao.processar_tick_completo(dry_run=True)

        chefe_row = executar_query("agentes:buscar_chefe")[0]
        agentes_no_resultado = {i["agente_id"] for i in resultado["interacoes"]}
        assert chefe_row["id"] not in agentes_no_resultado


class TestProatividadeNorte:
    def _card_fake(self, projeto_id: int, titulo: str = "Corrigir X") -> dict:
        return {
            "id": 1,
            "projeto_id": projeto_id,
            "tipo": "bug",
            "titulo": titulo,
            "descricao": "d",
            "arquivos_afetados": ["a.py"],
            "origem": "agente",
            "status": "sugerido",
            "criado_em": None,
        }

    async def test_projeto_estagnado_dispara_trabalho_e_gera_card(self, mocker):
        norte_id = _criar_agente("Norte", extroversao=3, especialidade="norte")
        _criar_agente("Outro", extroversao=10)
        chefe_id = _criar_chefe()
        tick.avancar_tick()
        projeto_id = _criar_projeto_norte(dias_atras=10)

        mock_gerar_card = mocker.patch(
            "resolvers.interacao.resolver_norte.gerar_proximo_card",
            new=AsyncMock(return_value=self._card_fake(projeto_id)),
        )
        # "Outro" não tem motivo de trabalho, então cai no fluxo social —
        # roda de verdade (sem dry_run) nesse teste, então precisa mockar
        # a geração de mensagem social também, senão às vezes chamaria a
        # OpenAI de verdade (achado rodando a suíte real: teste ficou
        # flaky sem isso).
        mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        resultado = await interacao.processar_tick_completo()

        entrada_norte = next(i for i in resultado["interacoes"] if i["agente_id"] == norte_id)
        assert entrada_norte["tipo"] == "trabalho"
        assert "Corrigir X" in entrada_norte["mensagem"]
        assert mock_gerar_card.call_count == 1

        mensagens = executar_query("mensagens:listar_todas", params=(10,))
        trabalho = [m for m in mensagens if m["tipo"] == "trabalho"]
        assert len(trabalho) == 1
        assert trabalho[0]["remetente_id"] == norte_id
        assert trabalho[0]["destinatario_id"] == chefe_id

        norte_row = executar_query("agentes:buscar_por_id", params=(norte_id,))[0]
        assert norte_row["estado"] == "executando"

    async def test_projeto_recente_nao_dispara_trabalho(self, mocker):
        norte_id = _criar_agente("Norte", extroversao=3, especialidade="norte")
        _criar_agente("Outro", extroversao=10)
        _criar_chefe()
        tick.avancar_tick()
        _criar_projeto_norte(dias_atras=1)  # abaixo do limite (3 dias, default)

        mock_gerar_card = mocker.patch(
            "resolvers.interacao.resolver_norte.gerar_proximo_card", new=AsyncMock()
        )

        resultado = await interacao.processar_tick_completo(dry_run=True)

        entrada_norte = next(i for i in resultado["interacoes"] if i["agente_id"] == norte_id)
        assert entrada_norte["tipo"] != "trabalho"
        assert mock_gerar_card.call_count == 0

    async def test_trabalho_tem_prioridade_e_nunca_disputa_social_no_mesmo_tick(self, mocker):
        # Precisa de um parceiro social de verdade disponível (senão o
        # teste não prova nada — o Norte não teria com quem falar de
        # qualquer jeito). random.random mockado pra 0.0 favoreceria
        # MUITO falar socialmente se ele chegasse a disputar; a prova
        # de prioridade é ele nunca sequer tentar, mesmo assim.
        norte_id = _criar_agente("Norte", extroversao=10, especialidade="norte")
        _criar_agente("Outro", extroversao=10)
        _criar_chefe()
        tick.avancar_tick()
        projeto_id = _criar_projeto_norte(dias_atras=10)

        mocker.patch(
            "resolvers.interacao.resolver_norte.gerar_proximo_card",
            new=AsyncMock(return_value=self._card_fake(projeto_id)),
        )
        mock_social = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )
        mocker.patch("resolvers.interacao.random.random", return_value=0.0)  # favoreceria falar socialmente

        resultado = await interacao.processar_tick_completo()

        entrada_norte = next(i for i in resultado["interacoes"] if i["agente_id"] == norte_id)
        assert entrada_norte["tipo"] == "trabalho"
        # "Outro" pode ter falado socialmente por conta própria — o que
        # não pode acontecer é o NORTE ter disputado social nesse tick.
        assert all(chamada.args[1] != "Norte" for chamada in mock_social.call_args_list)

    async def test_teto_diario_de_avisos_bloqueia_novo_trabalho(self, mocker):
        norte_id = _criar_agente("Norte", extroversao=3, especialidade="norte")
        chefe_id = _criar_chefe()
        _criar_agente("Outro", extroversao=10)
        tick_info = tick.avancar_tick()
        numero_tick = tick_info["numero"]

        for _ in range(settings.interacao_rate_limit_trabalho_por_dia):
            executar_query(
                "mensagens:inserir",
                returning=True,
                params=(norte_id, chefe_id, "trabalho", "aviso antigo", numero_tick, None),
            )

        _criar_projeto_norte(dias_atras=10)
        mock_gerar_card = mocker.patch(
            "resolvers.interacao.resolver_norte.gerar_proximo_card", new=AsyncMock()
        )

        resultado = await interacao.processar_tick_completo(dry_run=True)

        entrada_norte = next(i for i in resultado["interacoes"] if i["agente_id"] == norte_id)
        assert entrada_norte["tipo"] != "trabalho"
        assert mock_gerar_card.call_count == 0

    def test_projeto_com_card_ativo_nao_aparece_mais_como_estagnado(self):
        projeto_id = _criar_projeto_norte(dias_atras=10)
        executar_query(
            "cards:inserir",
            returning=True,
            params=(projeto_id, "bug", "T", "D", ["a.py"], "agente", "sugerido", "gpt-4o", 10, 5, 0.01),
        )

        limite = datetime.now(ZoneInfo(settings.timezone_padrao)) - timedelta(
            days=settings.interacao_dias_estagnacao_norte
        )
        rows = executar_query("projetos:listar_estagnados", params=(limite,))

        assert rows == []


class TestRespostaSocial:
    async def test_responde_pendencia_antes_de_sortear_novo_destinatario(self, mocker):
        a_id = _criar_agente("A", extroversao=10)
        b_id = _criar_agente("B", extroversao=0)
        tick_info = tick.avancar_tick()
        numero_tick = tick_info["numero"]

        pendente = executar_query(
            "mensagens:inserir",
            returning=True,
            params=(b_id, a_id, "social", "Oi A, tudo bem?", numero_tick, None),
        )[0]

        mocker.patch("resolvers.interacao.random.random", return_value=0.0)
        mock_gerar = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada("Tudo certo, e você?"),
        )

        resultado = await interacao.processar_tick_completo()

        entrada_a = next(i for i in resultado["interacoes"] if i["agente_id"] == a_id)
        assert entrada_a["destinatario_id"] == b_id
        assert entrada_a["respondendo_a_id"] == pendente["id"]
        assert mock_gerar.call_args.args[-2] == "Oi A, tudo bem?"  # mensagem_para_responder
        assert mock_gerar.call_args.args[-1] is False  # pode_novo_assunto — resposta nunca puxa

        mensagens = executar_query("mensagens:listar_todas", params=(10,))
        resposta = next(m for m in mensagens if m["id"] != pendente["id"])
        assert resposta["respondendo_a_id"] == pendente["id"]
        assert resposta["respondendo_a_conteudo"] == "Oi A, tudo bem?"
        assert resposta["respondendo_a_remetente_nome"] == "B"

    async def test_responde_a_pendencia_mais_antiga_primeiro(self, mocker):
        a_id = _criar_agente("A", extroversao=10)
        b_id = _criar_agente("B", extroversao=0)
        c_id = _criar_agente("C", extroversao=0)
        tick_info = tick.avancar_tick()
        numero_tick = tick_info["numero"]

        pendente_c = executar_query(
            "mensagens:inserir",
            returning=True,
            params=(c_id, a_id, "social", "Mensagem da C (mais antiga)", numero_tick, None),
        )[0]
        executar_query(
            "mensagens:inserir",
            returning=True,
            params=(b_id, a_id, "social", "Mensagem da B (mais nova)", numero_tick, None),
        )

        mocker.patch("resolvers.interacao.random.random", return_value=0.0)
        mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada("Resposta"),
        )

        resultado = await interacao.processar_tick_completo()

        entrada_a = next(i for i in resultado["interacoes"] if i["agente_id"] == a_id)
        assert entrada_a["respondendo_a_id"] == pendente_c["id"]
        assert entrada_a["destinatario_id"] == c_id

    async def test_pendencia_ja_respondida_nao_e_escolhida_de_novo(self, mocker):
        a_id = _criar_agente("A", extroversao=10)
        b_id = _criar_agente("B", extroversao=0)
        tick_info = tick.avancar_tick()
        numero_tick = tick_info["numero"]

        pendente = executar_query(
            "mensagens:inserir",
            returning=True,
            params=(b_id, a_id, "social", "Oi A", numero_tick, None),
        )[0]
        executar_query(
            "mensagens:inserir",
            returning=True,
            params=(a_id, b_id, "social", "Já respondi", numero_tick, pendente["id"]),
        )

        mocker.patch("resolvers.interacao.random.random", return_value=0.0)
        mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada("Novo assunto"),
        )

        resultado = await interacao.processar_tick_completo()

        entrada_a = next(i for i in resultado["interacoes"] if i["agente_id"] == a_id)
        assert entrada_a.get("respondendo_a_id") != pendente["id"]

    async def test_rate_limit_do_par_bloqueia_ate_a_resposta_de_pendencia(self, mocker):
        a_id = _criar_agente("A", extroversao=10)
        b_id = _criar_agente("B", extroversao=0)
        tick_info = tick.avancar_tick()
        numero_tick = tick_info["numero"]

        for _ in range(settings.interacao_rate_limit_par_por_dia):
            executar_query(
                "mensagens:inserir",
                returning=True,
                params=(a_id, b_id, "social", "mensagem antiga", numero_tick, None),
            )
        pendente = executar_query(
            "mensagens:inserir",
            returning=True,
            params=(b_id, a_id, "social", "Socorro", numero_tick, None),
        )[0]

        mocker.patch("resolvers.interacao.random.random", return_value=0.0)
        mock_gerar = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        resultado = await interacao.processar_tick_completo()

        entrada_a = next(i for i in resultado["interacoes"] if i["agente_id"] == a_id)
        assert entrada_a.get("respondendo_a_id") != pendente["id"]
        assert entrada_a["destinatario_id"] is None
        assert mock_gerar.call_count == 0


class TestNovoAssunto:
    async def test_conversa_em_andamento_pode_nao_puxar_assunto_novo(self, mocker):
        a_id = _criar_agente("A", extroversao=10)
        b_id = _criar_agente("B", extroversao=0)
        tick.avancar_tick()
        # Histórico existente do par (mensagem de A pra B) — não é
        # pendência pra A (A mandou), mas garante conversa em andamento,
        # então A entra no sorteio de puxar-ou-não assunto novo.
        executar_query(
            "mensagens:inserir",
            returning=True,
            params=(a_id, b_id, "social", "papo antigo", 1, None),
        )
        # A fala (0.0<chance); sorteio de novo assunto dá "não" (0.99 >= 0.3);
        # B não fala (0.99).
        mocker.patch("resolvers.interacao.random.random", side_effect=[0.0, 0.99, 0.99])
        mock_gerar = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        await interacao.processar_tick_completo()

        chamada_a = next(c for c in mock_gerar.call_args_list if c.args[1] == "A")
        assert chamada_a.args[-1] is False  # pode_novo_assunto
        assert chamada_a.args[-5] is None  # evento_desc não injetado

    async def test_conversa_vazia_sempre_permite_assunto_novo(self, mocker):
        _criar_agente("A", extroversao=10)
        _criar_agente("B", extroversao=0)
        tick.avancar_tick()

        # Sem histórico nenhum — A fala (0.0), B não (0.99). Não deve
        # rolar dado de novo assunto (conversa vazia sempre permite).
        mocker.patch("resolvers.interacao.random.random", side_effect=[0.0, 0.99])
        mock_gerar = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        await interacao.processar_tick_completo()

        chamada_a = next(c for c in mock_gerar.call_args_list if c.args[1] == "A")
        assert chamada_a.args[-1] is True  # pode_novo_assunto

    async def test_evento_nao_e_marcado_se_ninguem_puxou_assunto_novo(self, mocker):
        a_id = _criar_agente("A", extroversao=10)
        b_id = _criar_agente("B", extroversao=0)
        tick.avancar_tick()
        executar_query(
            "mensagens:inserir",
            returning=True,
            params=(a_id, b_id, "social", "papo antigo", 1, None),
        )
        evento = executar_query(
            "eventos_mundo:inserir", returning=True, params=("Está calor hoje.", None)
        )[0]

        mocker.patch("resolvers.interacao.random.random", side_effect=[0.0, 0.99, 0.99])
        mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        await interacao.processar_tick_completo()

        alvo = next(e for e in executar_query("eventos_mundo:listar") if e["id"] == evento["id"])
        assert alvo["ultimo_uso_tick"] is None  # ninguém puxou assunto novo, evento intocado


class TestProatividadeCifra:
    def _inserir_transacao(self, data_str, valor=100.0, tipo="saida", i=0):
        from datetime import date as _date
        y, m, d = (int(x) for x in data_str.split("-"))
        executar_query(
            "transacoes:inserir",
            returning=True,
            params=(
                "nubank", _date(y, m, d), valor, tipo, f"compra {i}", f"compra {i}",
                None, f"hash-{data_str}-{tipo}-{valor}-{i}", None,
            ),
        )

    def _relatorio_fake(self, gasto=100.0, ganho=200.0):
        return {"kpis": {"gasto_mensal": gasto, "ganho_mensal": ganho}}

    async def test_mes_fechado_sem_relatorio_dispara_e_gera(self, mocker):
        cifra_id = _criar_agente("Cifra", extroversao=5, especialidade="financeiro")
        chefe_id = _criar_chefe()
        tick.avancar_tick()
        self._inserir_transacao("2020-03-15", valor=250.0)  # mês fechado, sem relatório

        mock_gerar = mocker.patch(
            "resolvers.interacao.resolver_financeiro.gerar_relatorio",
            new=AsyncMock(return_value=self._relatorio_fake(gasto=250.0, ganho=0.0)),
        )

        resultado = await interacao.processar_tick_completo()

        entrada = next(i for i in resultado["interacoes"] if i["agente_id"] == cifra_id)
        assert entrada["tipo"] == "trabalho"
        assert "março/2020" in entrada["mensagem"]
        assert "250.00" in entrada["mensagem"]
        assert mock_gerar.call_count == 1

        mensagens = executar_query("mensagens:listar_todas", params=(10,))
        trabalho = [m for m in mensagens if m["tipo"] == "trabalho"]
        assert len(trabalho) == 1
        assert trabalho[0]["remetente_id"] == cifra_id
        assert trabalho[0]["destinatario_id"] == chefe_id

    async def test_so_mes_atual_nao_dispara(self, mocker):
        _criar_agente("Cifra", extroversao=5, especialidade="financeiro")
        _criar_chefe()
        tick.avancar_tick()
        hoje = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
        self._inserir_transacao(hoje.isoformat(), valor=50.0)  # mês atual, ainda aberto

        mock_gerar = mocker.patch(
            "resolvers.interacao.resolver_financeiro.gerar_relatorio", new=AsyncMock()
        )

        resultado = await interacao.processar_tick_completo(dry_run=True)

        entrada = resultado["interacoes"][0]
        assert entrada["tipo"] != "trabalho"
        assert mock_gerar.call_count == 0

    async def test_mes_com_relatorio_nao_dispara(self, mocker):
        from datetime import date as _date
        _criar_agente("Cifra", extroversao=5, especialidade="financeiro")
        _criar_chefe()
        tick.avancar_tick()
        self._inserir_transacao("2020-03-15", valor=250.0)
        # Já existe relatório pra março/2020 → mês sai do gatilho.
        executar_query(
            "relatorios_financeiros:upsert",
            returning=True,
            params=(_date(2020, 3, 1), '{"x": 1}', "gpt-4o", 10, 5, 0.01),
        )

        mock_gerar = mocker.patch(
            "resolvers.interacao.resolver_financeiro.gerar_relatorio", new=AsyncMock()
        )

        resultado = await interacao.processar_tick_completo(dry_run=True)

        entrada = resultado["interacoes"][0]
        assert entrada["tipo"] != "trabalho"
        assert mock_gerar.call_count == 0

    def test_checar_cifra_pega_o_mes_fechado_mais_antigo(self):
        from datetime import date as _date
        self._inserir_transacao("2020-05-10", valor=10.0, i=1)
        self._inserir_transacao("2020-03-10", valor=10.0, i=2)  # mais antigo
        ctx = interacao._checar_cifra({"id": 1})
        assert ctx["mes"] == _date(2020, 3, 1)


class TestProatividadeVita:
    def _inserir_refeicao_em(self, quando):
        rows = executar_query(
            "refeicoes:inserir",
            returning=True,
            params=("almoco", "texto", "arroz e feijão", None, 500, 60, 20, 10, "alta", "gpt-4o-mini", 10, 5, 0.0001),
        )
        rid = rows[0]["id"]
        from utils.db import Database
        with Database() as conn:
            conn.execute("UPDATE refeicoes SET registrado_em = %s WHERE id = %s", (quando, rid))
            conn.commit()
        return rid

    def _semana_fechada(self):
        hoje = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
        segunda_atual = hoje - timedelta(days=hoje.weekday())
        return segunda_atual - timedelta(days=7)

    def _dentro_da_semana(self, semana):
        return datetime.combine(semana + timedelta(days=2), datetime.min.time(), tzinfo=ZoneInfo("America/Sao_Paulo"))

    async def test_semana_fechada_com_dado_dispara_e_gera(self, mocker):
        vita_id = _criar_agente("Vita", extroversao=5, especialidade="saude")
        chefe_id = _criar_chefe()
        tick.avancar_tick()
        semana = self._semana_fechada()
        self._inserir_refeicao_em(self._dentro_da_semana(semana))

        mock_gerar = mocker.patch(
            "resolvers.interacao.resolver_saude.gerar_relatorio_semanal",
            new=AsyncMock(return_value={"dias_com_refeicao_registrada": 3}),
        )

        resultado = await interacao.processar_tick_completo()

        entrada = next(i for i in resultado["interacoes"] if i["agente_id"] == vita_id)
        assert entrada["tipo"] == "trabalho"
        assert "relatório da semana" in entrada["mensagem"]
        assert "3 dia" in entrada["mensagem"]
        assert mock_gerar.call_count == 1
        assert mock_gerar.call_args.args[0] == semana

        trabalho = [m for m in executar_query("mensagens:listar_todas", params=(10,)) if m["tipo"] == "trabalho"]
        assert len(trabalho) == 1
        assert trabalho[0]["remetente_id"] == vita_id
        assert trabalho[0]["destinatario_id"] == chefe_id

    async def test_semana_sem_dado_nao_dispara(self, mocker):
        _criar_agente("Vita", extroversao=5, especialidade="saude")
        _criar_chefe()
        tick.avancar_tick()

        mock_gerar = mocker.patch(
            "resolvers.interacao.resolver_saude.gerar_relatorio_semanal", new=AsyncMock()
        )

        resultado = await interacao.processar_tick_completo(dry_run=True)

        assert resultado["interacoes"][0]["tipo"] != "trabalho"
        assert mock_gerar.call_count == 0

    async def test_semana_com_relatorio_nao_dispara(self, mocker):
        _criar_agente("Vita", extroversao=5, especialidade="saude")
        _criar_chefe()
        tick.avancar_tick()
        semana = self._semana_fechada()
        self._inserir_refeicao_em(self._dentro_da_semana(semana))
        executar_query(
            "relatorios_saude:inserir",
            returning=True,
            params=(semana, '{"x": 1}', "gpt-4o", 10, 5, 0.01),
        )

        mock_gerar = mocker.patch(
            "resolvers.interacao.resolver_saude.gerar_relatorio_semanal", new=AsyncMock()
        )

        resultado = await interacao.processar_tick_completo(dry_run=True)

        assert resultado["interacoes"][0]["tipo"] != "trabalho"
        assert mock_gerar.call_count == 0

    def test_checar_vita_pega_semana_fechada_mais_antiga(self):
        semana_recente = self._semana_fechada()
        semana_antiga = semana_recente - timedelta(days=7)
        self._inserir_refeicao_em(self._dentro_da_semana(semana_recente))
        self._inserir_refeicao_em(self._dentro_da_semana(semana_antiga))

        ctx = interacao._checar_vita({"id": 1})
        assert ctx["semana"] == semana_antiga


class TestProatividadeAgenda:
    def _evento_raw(self, titulo, inicio_iso):
        return {
            "id": f"ev-{titulo}",
            "summary": titulo,
            "start": {"dateTime": inicio_iso},
            "end": {"dateTime": inicio_iso},
        }

    async def test_com_eventos_manda_resumo(self, mocker):
        agenda_id = _criar_agente("Agenda", extroversao=5, especialidade="agenda")
        chefe_id = _criar_chefe()
        tick.avancar_tick()

        mocker.patch(
            "agents.agenda.google_calendar.listar_eventos",
            return_value=[
                self._evento_raw("Reunião com cliente", "2026-07-22T14:30:00-03:00"),
                self._evento_raw("Almoço", "2026-07-22T12:00:00-03:00"),
            ],
        )

        resultado = await interacao.processar_tick_completo()

        entrada = next(i for i in resultado["interacoes"] if i["agente_id"] == agenda_id)
        assert entrada["tipo"] == "trabalho"
        assert "Compromissos de hoje" in entrada["mensagem"]
        assert "14:30 — Reunião com cliente" in entrada["mensagem"]
        assert "12:00 — Almoço" in entrada["mensagem"]

        trabalho = [m for m in executar_query("mensagens:listar_todas", params=(10,)) if m["tipo"] == "trabalho"]
        assert len(trabalho) == 1
        assert trabalho[0]["destinatario_id"] == chefe_id

    async def test_sem_eventos_manda_bora_descansar(self, mocker):
        agenda_id = _criar_agente("Agenda", extroversao=5, especialidade="agenda")
        _criar_chefe()
        tick.avancar_tick()

        mocker.patch("agents.agenda.google_calendar.listar_eventos", return_value=[])

        resultado = await interacao.processar_tick_completo()

        entrada = next(i for i in resultado["interacoes"] if i["agente_id"] == agenda_id)
        assert entrada["tipo"] == "trabalho"
        assert entrada["mensagem"] == "Nenhum compromisso para hoje, bora descansar!"

    async def test_nao_repete_o_resumo_no_mesmo_dia(self, mocker):
        agenda_id = _criar_agente("Agenda", extroversao=5, especialidade="agenda")
        chefe_id = _criar_chefe()
        tick_info = tick.avancar_tick()
        # Já mandou o resumo hoje (mensagem de trabalho da Agenda).
        executar_query(
            "mensagens:inserir",
            returning=True,
            params=(agenda_id, chefe_id, "trabalho", "resumo de hoje", tick_info["numero"], None),
        )

        mock_listar = mocker.patch("agents.agenda.google_calendar.listar_eventos", return_value=[])

        resultado = await interacao.processar_tick_completo(dry_run=True)

        entrada = next(i for i in resultado["interacoes"] if i["agente_id"] == agenda_id)
        assert entrada["tipo"] != "trabalho"
        assert mock_listar.call_count == 0  # nem leu o calendário

    async def test_token_do_google_fora_cai_pro_social(self, mocker):
        agenda_id = _criar_agente("Agenda", extroversao=10, especialidade="agenda")
        _criar_agente("Colega", extroversao=10)
        _criar_chefe()
        tick.avancar_tick()

        mocker.patch(
            "agents.agenda.google_calendar.listar_eventos",
            side_effect=RuntimeError("Sem token do Google."),
        )
        mocker.patch("resolvers.interacao.random.random", return_value=0.0)
        mock_social = mocker.patch(
            "resolvers.interacao.agente_interacao.gerar_mensagem_social",
            return_value=_mensagem_gerada(),
        )

        resultado = await interacao.processar_tick_completo()

        entrada = next(i for i in resultado["interacoes"] if i["agente_id"] == agenda_id)
        assert "Falha ao checar" in entrada.get("aviso", "")
        assert entrada["tipo"] == "social"  # caiu pro social em vez de travar
        assert mock_social.call_count >= 1
        trabalho = [m for m in executar_query("mensagens:listar_todas", params=(10,)) if m["tipo"] == "trabalho"]
        assert trabalho == []
