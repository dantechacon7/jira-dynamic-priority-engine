/**
 * SISTEMA DE CÁLCULO DE SCORE DE PRIORIDADE DINÂMICO
 * Integração: Jira <-> Google Apps Script <-> Google Sheets
 * Autor: Dante Chacon
 */

// =========================================================
// 1. CONFIGURAÇÕES E CONSTANTES
// =========================================================
const props = PropertiesService.getScriptProperties();
const JIRA_DOMAIN    = props.getProperty('JIRA_DOMAIN');
const USER_EMAIL     = props.getProperty('USER_EMAIL');
const API_TOKEN      = props.getProperty('API_TOKEN');
const SPREADSHEET_ID = props.getProperty('SPREADSHEET_ID');
const SCORE_FIELD    = "customfield_17864"; // Altere para o ID do campo de Score no seu Jira

// Segurança
const VALOR_ESPERADO = props.getProperty('HEADER_VALUE');
const NOME_HEADER    = (props.getProperty('HEADER_KEY') || "").toLowerCase();

// =========================================================
// 2. FUNÇÃO PRINCIPAL (WEBHOOK RECEIVER)
// =========================================================
function doPost(e) {
  console.log("--- INÍCIO DA EXECUÇÃO (V2.0 - Dynamic) ---");

  // --- A. VALIDAÇÃO DE SEGURANÇA ---
  let autenticado = false;
  
  // Verifica no Header
  if (e && e.headers && e.headers[NOME_HEADER] === VALOR_ESPERADO) {
    autenticado = true;
  } 
  // Backup: Verifica nos parâmetros da URL
  else if (e && e.parameter && e.parameter.secret === VALOR_ESPERADO) {
    autenticado = true;
  }

  if (!autenticado) {
    console.warn("Acesso negado: Chave de segurança inválida.");
    return ContentService.createTextOutput("Proibido").setMimeType(ContentService.MimeType.TEXT);
  }

  // --- B. CAPTURA E LIMPEZA DE DADOS ---
  let contents;
  try {
    contents = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput("Erro no JSON").setMimeType(ContentService.MimeType.TEXT);
  }

  const issueKey = contents.issueKey;
  const fields = contents.fields || {};
  
  const limpar = (val) => val ? JSON.stringify(val).toLowerCase() : "";

  // --- C. CÁLCULO DINÂMICO (VIA PLANILHA) ---
  try {
    const pesosMap = carregarPesosDaPlanilha();
    let score = 0;

    // Itera sobre todos os campos enviados pelo Jira
    for (let campoId in fields) {
      let valorResposta = limpar(fields[campoId]);
      
      // Se este campo possui regras definidas na planilha
      if (pesosMap[campoId]) {
        for (let criterio in pesosMap[campoId]) {
          // Se a resposta do Jira contém o critério da planilha
          if (valorResposta.includes(criterio)) {
            score += pesosMap[campoId][criterio];
            console.log(`Campo ${campoId} matched com "${criterio}": +${pesosMap[campoId][criterio]}`);
            break; 
          }
        }
      }
    }

    // --- D. CLASSIFICAÇÃO ---
    let classe = "";
    if (score >= 100) { classe = "🔴 CRÍTICO"; } 
    else if (score >= 65) { classe = "🟠 ALTO"; } 
    else if (score >= 35) { classe = "🟡 MÉDIO"; } 
    else { classe = "🟢 BAIXO"; }

    // --- E. UPDATE JIRA ---
    if (issueKey && issueKey !== "undefined") {
      updateJiraScore(issueKey, score);
      upsertGovernanceComment(issueKey, classe, score);
      console.log(`Sucesso: ${issueKey} | Score: ${score} | Classe: ${classe}`);
    }

    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    console.error("Erro no processamento: " + err);
    return ContentService.createTextOutput("Erro Interno").setMimeType(ContentService.MimeType.TEXT);
  }
}

// =========================================================
// 3. FUNÇÕES DE SUPORTE
// =========================================================

/**
 * Lê a aba 'Config_Pesos' e retorna um objeto mapeado
 */
function carregarPesosDaPlanilha() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Config_Pesos");
  const data = sheet.getDataRange().getValues();
  
  let mapa = {};
  
  // Começa em 1 para pular o cabeçalho
  for (let i = 1; i < data.length; i++) {
    let campo    = String(data[i][0]).trim();
    let criterio = String(data[i][1]).trim().toLowerCase();
    let peso     = parseFloat(data[i][2]);

    if (!mapa[campo]) mapa[campo] = {};
    mapa[campo][criterio] = peso;
  }
  return mapa;
}

/**
 * Atualiza o campo de score numérico no Jira
 */
function updateJiraScore(issueKey, scoreValue) {
  const url = `https://${JIRA_DOMAIN}/rest/api/3/issue/${issueKey}`;
  const auth = Utilities.base64Encode(`${USER_EMAIL}:${API_TOKEN}`);
  const payload = JSON.stringify({ "fields": { [SCORE_FIELD]: scoreValue } });

  UrlFetchApp.fetch(url, {
    "method": "put",
    "contentType": "application/json",
    "headers": { "Authorization": "Basic " + auth },
    "payload": payload,
    "muteHttpExceptions": true
  });
}

/**
 * Gerencia o comentário de governança (apaga o antigo e cria o novo)
 */
function upsertGovernanceComment(issueKey, classe, score) {
  const auth = Utilities.base64Encode(`${USER_EMAIL}:${API_TOKEN}`);
  const baseUrl = `https://${JIRA_DOMAIN}/rest/api/3/issue/${issueKey}/comment`;
  const TAG = "🆔 IDENTIFICADOR DE GOVERNANÇA"; 

  // 1. Busca comentários para limpar o histórico
  const res = UrlFetchApp.fetch(baseUrl, { 
    "headers": { "Authorization": "Basic " + auth } 
  });
  const commentsData = JSON.parse(res.getContentText());

  if (commentsData.comments) {
    commentsData.comments.forEach(c => {
      let bodyString = JSON.stringify(c.body);
      if (bodyString.includes("IDENTIFICADOR DE GOVERNANÇA")) {
        UrlFetchApp.fetch(`${baseUrl}/${c.id}`, {
          "method": "delete",
          "headers": { "Authorization": "Basic " + auth },
          "muteHttpExceptions": true
        });
      }
    });
  }

  // 2. Monta o novo comentário (Formato Atlassian Document - ADF)
  const commentBody = {
    "body": {
      "type": "doc", "version": 1,
      "content": [{
        "type": "paragraph",
        "content": [
          { "type": "text", "text": TAG + "\n", "marks": [{ "type": "em" }] },
          { "type": "text", "text": "Classificação: ", "marks": [{ "type": "strong" }] },
          { "type": "text", "text": classe + "\n" },
          { "type": "text", "text": "Score Atual: ", "marks": [{ "type": "strong" }] },
          { "type": "text", "text": score + " pontos" }
        ]
      }]
    }
  };

  UrlFetchApp.fetch(baseUrl, {
    "method": "post",
    "contentType": "application/json",
    "headers": { "Authorization": "Basic " + auth },
    "payload": JSON.stringify(commentBody),
    "muteHttpExceptions": true
  });
}
