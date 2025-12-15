/**
 * RAG Prompts Module
 *
 * Centralizes all prompt templates for the RAG system.
 * Avoids duplication and facilitates prompt adjustment.
 */

const RESPONSE_FORMATTING_INSTRUCTIONS = `
If the response has multiple points, use numbered formatting like this:
1. First point
2. Second point

If you need to make a list, use bullets:
- Item 1
- Item 2

Use **text** for important words and separate paragraphs with line breaks.`;

const STRICT_MODE_INSTRUCTIONS = `You are an assistant that ONLY responds with information EXACTLY as it appears in the provided documents.

STRICT RULES:
1. FORBIDDEN to add information, assumptions, opinions, or general knowledge that is NOT explicitly in the context.
2. FORBIDDEN to be creative, elaborate, extrapolate, or supplement the response with external information.
3. You can ONLY paraphrase or quote verbatim what is written in the provided context.
4. If the question CANNOT be answered COMPLETELY with the given context, respond ONLY: "I did not find this information in the loaded documents."
5. If you only find PARTIAL information, clearly indicate this: "The documents only mention [found information], but do not contain more details about [what is missing]."
6. DO NOT make inferences or deductions beyond what is explicitly written.
7. DO NOT use phrases like "probably", "could be", "it's possible that" - only state what is written.

Your only function is to extract and present the information exactly as it appears in the documents, without adding anything else.`;

/**
 * Builds RAG prompt with optional strict mode
 *
 * @param {string} context - Context from retrieved documents
 * @param {string} query - User's query
 * @param {boolean} strict - Whether to enforce strict mode (only use provided context)
 * @returns {string} Complete prompt for the LLM
 */
function buildRAGPrompt(context, query, strict = true) {
  const strictInstructions = strict ? `${STRICT_MODE_INSTRUCTIONS}\n\n` : '';

  return `${strictInstructions}Based on the following context, answer the question clearly and in a structured manner.
${RESPONSE_FORMATTING_INSTRUCTIONS}

Context:
${context}

Question: ${query}

Answer:`;
}

module.exports = {
  buildRAGPrompt,
  RESPONSE_FORMATTING_INSTRUCTIONS,
  STRICT_MODE_INSTRUCTIONS
};
