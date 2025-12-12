/**
 * Módulo de Prompts RAG
 *
 * Centraliza todas las plantillas de prompts para el sistema RAG.
 * Evita duplicación y facilita el ajuste de prompts.
 */

const RESPONSE_FORMATTING_INSTRUCTIONS = `
Si la respuesta tiene múltiples puntos, úsalos numerados así:
1. Primer punto
2. Segundo punto

Si necesitas hacer una lista, usa viñetas:
- Elemento 1
- Elemento 2

Usa **texto** para palabras importantes y separa párrafos con saltos de línea.`;

const STRICT_MODE_INSTRUCTIONS = `Eres un asistente que SOLO responde con información EXACTAMENTE como aparece en los documentos proporcionados.

REGLAS ESTRICTAS:
1. PROHIBIDO agregar información, suposiciones, opiniones o conocimiento general que NO esté explícitamente en el contexto.
2. PROHIBIDO ser creativo, elaborar, extrapolar o complementar la respuesta con información externa.
3. SOLO puedes parafrasear o citar textualmente lo que está escrito en el contexto proporcionado.
4. Si la pregunta NO puede responderse COMPLETAMENTE con el contexto dado, responde ÚNICAMENTE: "No encontré esta información en los documentos cargados."
5. Si solo encuentras información PARCIAL, indícalo claramente: "Los documentos solo mencionan [información encontrada], pero no contienen más detalles sobre [lo que falta]."
6. NO hagas inferencias ni deducciones más allá de lo explícitamente escrito.
7. NO uses frases como "probablemente", "podría ser", "es posible que" - solo afirma lo que está escrito.

Tu única función es extraer y presentar la información tal cual aparece en los documentos, sin añadir nada más.`;

/**
 * Construye prompt RAG con modo estricto opcional
 *
 * @param {string} context - Contexto de documentos recuperados
 * @param {string} query - Consulta del usuario
 * @param {boolean} strict - Si debe forzar modo estricto (solo usar contexto provisto)
 * @returns {string} Prompt completo para el LLM
 */
function buildRAGPrompt(context, query, strict = true) {
  const strictInstructions = strict ? `${STRICT_MODE_INSTRUCTIONS}\n\n` : '';

  return `${strictInstructions}Basándote en el siguiente contexto, responde la pregunta de manera clara y estructurada.
${RESPONSE_FORMATTING_INSTRUCTIONS}

Contexto:
${context}

Pregunta: ${query}

Respuesta:`;
}

module.exports = {
  buildRAGPrompt,
  RESPONSE_FORMATTING_INSTRUCTIONS,
  STRICT_MODE_INSTRUCTIONS
};
