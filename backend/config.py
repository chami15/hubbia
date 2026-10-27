"""Configuração central do backend.

Tudo vem do .env (ou de variáveis de ambiente). Nada de segredo hardcoded.
Um único objeto `settings` é importado pelo resto do código.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Banco
    database_url: str = "postgresql://hub:hub@localhost:5000/hub_agentes"

    # LLM (OpenAI) — modelos trocáveis por .env
    openai_api_key: str = ""
    llm_model_cheap: str = "gpt-4o-mini"
    llm_model_strong: str = "gpt-4o"

    # Motor de tick

    # Relógio do mundo (só ambiente: céu, luz, expediente; não custa nada). 1 min real = `relogio_fator` min do mundo:
    # 24 faz o dia do mundo durar 1 hora real. Trocável em runtime por PUT /relogio/fator (aqui é só o valor inicial).
    relogio_fator: float = 24.0

    # Expediente (hora do MUNDO, não a real): só dentro dele o tick automático dispara. Todo dia igual, sem fim de semana.
    expediente_inicio: int = 9
    expediente_fim: int = 18

    # Tick automático (opt-in no app; o backend garante os limites): 1 rodada a cada N min REAIS, no máximo M por dia real,
    # gastando no máximo `fatia` do teto diário. O resto do teto fica de reserva para o que o chefe pedir na hora.
    tick_automatico_intervalo_min: int = 5
    tick_automatico_max_dia: int = 40
    tick_automatico_fatia_orcamento: float = 0.75

    # Controle de custo
    orcamento_diario_usd: float = 1.0

    # Preço por 1K tokens (USD) do modelo forte, usado só pra estimar
    # custo_usd nos registros de execução. CONFERIR na página de pricing
    # da OpenAI antes de confiar nesse número — pode estar desatualizado.
    preco_input_por_1k_forte: float = 0.0025
    preco_output_por_1k_forte: float = 0.01

    # Idem, pro modelo barato (usado na estimativa de macro de refeição do
    # agente de Saúde — não precisa do modelo forte pra isso). CONFERIR
    # também antes de confiar.
    preco_input_por_1k_barato: float = 0.00015
    preco_output_por_1k_barato: float = 0.0006

    # Contexto
    contexto_max_tokens: int = 2000

    # Google Calendar — credentials.json baixado do Cloud Console,
    # token.json gerado na primeira autorização (nenhum dos dois vai pro
    # git). "primary" é o calendário principal da conta autorizada.
    google_credentials_path: str = "credentials.json"
    google_token_path: str = "token.json"
    google_calendar_id: str = "primary"
    timezone_padrao: str = "America/Sao_Paulo"

    # Pendência aberta (ex: "qual dia?") mais velha que isso vira expirada
    # sozinha — sem isso, uma pergunta esquecida vira uma armadilha de
    # contexto pra qualquer mensagem nova e não-relacionada que vier depois.
    agenda_pendencia_ttl_minutos: int = 15

    # GitHub (agente Norte) — OAuth App com Device Flow habilitado (só
    # precisa de client_id, device flow não usa client_secret). Token
    # gerado uma vez por scripts/autorizar_github.py, nunca vai pro git.
    github_client_id: str = ""
    github_token_path: str = "github_token.json"
    github_oauth_scope: str = "repo"

    # Módulo de interação, Etapa 2 (camada social) — constantes-exemplo
    # combinadas na conversa de design, ajustáveis depois de rodar de
    # verdade. Ver docs/produto-e-sprints.md pro desenho completo.
    interacao_peso_extroversao: float = 0.5       # contribuição máx. da extroversão na chance de falar
    interacao_incremento_cooldown: float = 0.05   # soma por tick parado sem falar socialmente
    interacao_chance_falar_max: float = 0.9       # nunca vira obrigação (nunca chega a 100%)
    interacao_peso_afinidade_max: float = 3.0     # quanto a afinidade pode inflar o peso na roleta
    interacao_peso_minimo: float = 0.1            # piso do peso — nunca zera/inverte com afinidade negativa
    interacao_afinidade_incremento_max: float = 3.0  # ganho de afinidade quando afinidade atual = 0
    interacao_historico_mensagens_par: int = 3    # quantas mensagens recentes do par entram no prompt
    interacao_rate_limit_par_por_dia: int = 6     # máx. de mensagens sociais por par, por dia real
    interacao_chance_novo_assunto: float = 0.3    # numa conversa já em andamento, chance de puxar assunto novo (senão, segue o papo)

    # Módulo de interação, Etapa 3 (proatividade de trabalho) — Norte é o
    # primeiro domínio com gatilho real; os outros ainda não têm regra.
    interacao_dias_estagnacao_norte: int = 3         # dias reais parado (sem card ativo) pra virar candidato
    interacao_rate_limit_trabalho_por_dia: int = 5   # máx. de avisos proativos de trabalho por agente, por dia real


settings = Settings()
