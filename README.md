# Jira Dynamic Priority Scorer

Este projeto traz uma infraestrutura inteligente para cálculo de prioridade e risco em chamados do Jira, utilizando **Google Apps Script** para o processamento e **Google Sheets** como banco de regras dinâmicas. O **jira** entra como ferramenta que irá enviar as respostas dos campos e receber o score final de risco para definição de prioridade dos times envolvidos na demanda.

## 🌟 Principais características desse projeto

* **Desacoplamento:** A lógica de pesos não está no código. Ela é lida dinamicamente de uma planilha.
* **Autonomia na manutenção:** Gestores podem alterar pesos na planilha sem tocar em código.
* **Segurança:** Validação de autenticidade via Headers customizados. Isso será de extrema valia, pois para o Jira acessar o AppScript, a configuração de visibilidade da URL de requisição precisa ser "Qualquer pessoa", o que não possibilita que qualquer pessoa veja seu código fonte, mas que possa ser realizada uma requisição, nesse exemplo, ao Slack, incluindo informações diversas no JSON.
* **Timeline Limpa:** O script gerencia o histórico de comentários, removendo logs antigos.

---
## 🎯 Por que usar esta solução (AppScript vs. Nativo)?
Tentei realizar cálculos de score usando as regras de automação nativas do Jira, mas encontrei alguns problemas de confiabilidade que esta solução resolve:

1. Falha em cálculos condicionais complexos: No Jira, ao usar múltiplos blocos {{#if}} ou funções .contains(), qualquer campo vazio (null) faz com que a expressão matemática inteira "quebre", resultando em um score em branco ou calculado incorretamente.

2. Limitação de aninhamento: O Jira limita o aninhamento de lógicas if/else, tornando quase impossível manter uma matriz de pesos com mais de 5 ou 6 variáveis sem que a regra se torne instável.

3. Dificuldade de manutenção: Alterar um "peso" em uma regra nativa exige permissões de administrador e a edição manual de strings complexas de Smart Values. Com o AppScript, a regra de negócio é externa (Google Sheets), permitindo que o stakeholder altere pesos sem risco de quebrar a automação.

4. Tratamento de nulos: no script com JavaScript, há um tratamento automático de campos não preenchidos como 0 ou false, garantindo que o cálculo nunca retorne vazio.

---

## 🏗️ Arquitetura da Solução

A solução opera em um ciclo de 4 etapas:

1. **Trigger (Jira):** Uma automação no Jira dispara um Webhook (POST).
2. **Middleware (App Script):** O script valida a segurança e consulta a planilha de pesos.
3. **Engine de Cálculo:** O algoritmo cruza as respostas do ticket com a matriz da planilha.
4. **Feedback (Jira API):** O score é injetado no ticket e um sumário visual é postado nos comentários.

---

## 📊 Configuração da Planilha de Regras

O script consome dados de uma aba chamada `Config_Pesos`. Siga este modelo:

| Campo (ID Jira) | Critério (Resposta) | Peso (Valor) |
| --- | --- | --- |
| `cf17855` | sim | 25 |
| `cf17854` | crítico | 85 |

---

## ⚙️ Configuração da Regra de Automação (Jira)

Para integrar o Jira ao script, siga os passos abaixo na administração do seu projeto:

1. **Gatilho:** Escolha o gatilho desejado (ex: *Issue Created* ou *Field Value Changed*).
2. **Ação:** Selecione **Send web request**.
3. **Webhook URL:** Insira a URL de implantação do seu Google Apps Script.
4. **Headers:** * Chave: `X-Auth-Token` (Ou a chave definida em `HEADER_KEY`).
* Valor: O segredo definido em `HEADER_VALUE`.


5. **HTTP Method:** `POST`.
6. **Webhook Body:** Selecione **Custom Data**.

### JSON Exemplo (Custom Data)

Copie e cole o código abaixo, substituindo os IDs pelos campos reais do seu Jira:

```json
{
  "issueKey": "{{issue.key}}",
  "fields": {
    "cf17855": "{{issue.CustomFieldName1.value}}",
    "cf17854": "{{issue.CustomFieldName2.value}}",
    "cf17856": "{{issue.CustomFieldName3.value}}"
  }
}

```

> **Vale se atentar:** Use as *Smart Values* do Jira (entre chaves duplas) para que o Jira envie os valores dinâmicos de cada ticket.

---

## 🔐 Variáveis de Ambiente (Script Properties)

No Google Apps Script, configure em **Propriedades do Script**:

| Chave | Descrição |
| --- | --- |
| `JIRA_DOMAIN` | URL do Jira (ex: `empresa.atlassian.net`) |
| `USER_EMAIL` | E-mail do bot/usuário de serviço |
| `API_TOKEN` | Token de API Atlassian |
| `SPREADSHEET_ID` | O ID da planilha Google com os pesos |
| `HEADER_KEY` | Nome do Header de segurança |
| `HEADER_VALUE` | O segredo compartilhado |

---

## 🔍 Solução de Problemas (Troubleshooting)

| Problema | Causa Provável | Solução |
| --- | --- | --- |
| Score não atualiza | JSON mal formatado no Jira | Verifique as vírgulas no "Custom Data" da automação. |
| Erro "Proibido" | Header Incorreto | Verifique se o `HEADER_KEY` no script é idêntico ao do Jira. |
| Score sempre zero | ID do campo errado | Garanta que o ID na planilha (ex: `cf123`) seja igual ao do JSON. |
| Script lento | Planilha muito grande | Limpe linhas vazias na aba `Config_Pesos`. |
