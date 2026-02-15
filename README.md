# Jira Dynamic Priority Scorer

Este projeto provê uma infraestrutura inteligente para cálculo de prioridade e risco em chamados do Jira, utilizando **Google Apps Script** como motor de processamento e **Google Sheets** como banco de regras dinâmicas (Single Source of Truth).

## 🌟 Diferenciais desta Versão

* **Decoupling (Desacoplamento):** A lógica de pesos não está no código. Ela é lida dinamicamente de uma planilha.
* **Autonomia de Negócio:** Gestores de Compliance ou Negócios podem alterar pesos e critérios na planilha sem tocar em uma linha de código.
* **Segurança Robusta:** Validação de autenticidade via Headers customizados e Shared Secret.
* **Timeline Limpa:** O script gerencia o histórico de comentários, removendo logs antigos e mantendo apenas a classificação mais atual no ticket.

---

## 🏗️ Arquitetura da Solução

A solução opera em um ciclo de 4 etapas:

1. **Trigger (Jira):** Uma automação no Jira dispara um Webhook (POST) ao detectar a criação ou transição de um ticket.
2. **Middleware (App Script):** O script recebe o JSON, valida a segurança e consulta a planilha de pesos.
3. **Engine de Cálculo:** O algoritmo cruza as respostas do formulário Jira com a matriz de pesos da planilha.
4. **Feedback (Jira API):** O score final é injetado no campo definido e um sumário visual é postado nos comentários do ticket.

---

## 📊 Configuração da Planilha de Regras

O script consome dados de uma aba chamada `Config_Pesos`. Siga este modelo:

| Campo (ID Jira) | Critério (Resposta) | Peso (Valor) |
| --- | --- | --- |
| `cf17855` | sim | 25 |
| `cf17855` | não | -5 |
| `cf17854` | crítico | 85 |
| `cf17854` | alto | 60 |

> **Nota:** O script utiliza busca parcial (`.includes()`), permitindo identificar palavras-chave em campos de texto ou seleções múltiplas de forma flexível.

---

## 🔐 Configuração de Variáveis (Script Properties)

No console do Google Apps Script, acesse **Configurações do Projeto > Propriedades do Script** e adicione:

| Chave | Descrição |
| --- | --- |
| `JIRA_DOMAIN` | Domínio do Jira (ex: `empresa.atlassian.net`) |
| `USER_EMAIL` | E-mail do usuário/bot com permissão de API |
| `API_TOKEN` | Token de API gerado na Atlassian |
| `SPREADSHEET_ID` | O ID da planilha Google que contém os pesos |
| `HEADER_KEY` | Nome do Header de segurança (ex: `x-auth-token`) |
| `HEADER_VALUE` | O segredo compartilhado que o Jira deve enviar |

---

## 🛠️ Sintaxe e Lógica do Código

O script foi desenvolvido para ser **agnóstico ao contexto**. Suas principais funções são:

### 1. `carregarPesosDaPlanilha()`

Varre a planilha e transforma as linhas em um mapa de objetos em memória. Isso otimiza a performance, permitindo que o script processe múltiplos campos em milissegundos.

### 2. `doPost(e)`

* Realiza o "handshake" de segurança.
* Normaliza os dados (lowercase e higienização) para evitar erros de case-sensitivity.
* Calcula o score e define a classificação visual (🔴, 🟠, 🟡, 🟢).

### 3. `upsertGovernanceComment()`

Busca por um comentário que contenha a tag "IDENTIFICADOR DE GOVERNANÇA". Caso exista, ele é deletado antes da postagem do novo, garantindo que o histórico do ticket não fique poluído por atualizações sucessivas.

---

## 🔍 Solução de Problemas (Troubleshooting)

Se o score não estiver atualizando, verifique:

* **Log de Execução:** No Google Apps Script, acesse "Execuções" para verificar se o status foi `OK` ou `Proibido` (erro de autenticação).
* **IDs dos Campos:** Certifique-se de que os nomes dos campos no JSON enviado pelo Jira (ex: `customfield_12345`) coincidem com a primeira coluna da planilha.
* **Permissões da Planilha:** O e-mail que executa o script deve ter permissão de leitura na planilha de pesos.
* **JSON no Jira:** Verifique se a automação do Jira está enviando o `issueKey` corretamente no payload.
