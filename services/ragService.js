/**
 * RAG Query Service
 *
 * Handles RAG query logic: embedding generation, similarity search,
 * context building, and LLM response generation.
 */

const { generateEmbedding, generateLLMResponse, generateLLMResponseStream } = require('./embeddingService');
const { buildRAGPrompt } = require('../prompts/ragPrompts');
const { formatResponseAsHTML, buildSourcesMetadata } = require('./responseFormatter');

/**
 * Performs RAG query search and returns top similar documents
 *
 * @param {string} query - User query
 * @param {Object} vectorStore - VectorStore instance
 * @param {number} topK - Number of top results
 * @param {number} threshold - Similarity threshold
 * @returns {Promise<Array>} Top similar documents
 */
async function performRAGSearch(query, vectorStore, topK, threshold) {
  console.log(`\n🔍 Consultando: "${query}"`);

  const queryEmbedding = await generateEmbedding(query);
  console.log('✓ Embedding de consulta generado');

  const topDocs = vectorStore.searchSimilar(queryEmbedding, topK, threshold);

  if (topDocs.length === 0) {
    throw new Error('No encontré documentos relevantes para tu pregunta. Por favor, asegúrate de haber cargado PDFs relacionados con tu consulta.');
  }

  console.log(`✓ Top ${topDocs.length} documentos encontrados (similaridades: ${topDocs.map(d => d.similarity.toFixed(4)).join(', ')})`);

  return topDocs;
}

/**
 * Generates RAG response (non-streaming)
 *
 * @param {string} query - User query
 * @param {Array} topDocs - Top similar documents
 * @param {boolean} strict - Strict mode flag
 * @returns {Promise<{answer, rawAnswer, sources}>}
 */
async function generateRAGResponse(query, topDocs, strict = true) {
  const context = topDocs.map(doc => doc.text).join('\n\n');
  const prompt = buildRAGPrompt(context, query, strict);

  const rawAnswer = await generateLLMResponse(prompt);
  console.log('✓ Respuesta generada\n');

  const answer = formatResponseAsHTML(rawAnswer);
  const sources = buildSourcesMetadata(topDocs);

  return {
    answer,
    rawAnswer,
    sources,
    strictMode: strict
  };
}

/**
 * Handles streaming RAG response
 *
 * @param {string} query - User query
 * @param {Array} topDocs - Top similar documents
 * @param {boolean} strict - Strict mode flag
 * @param {Object} res - Express response object (for SSE)
 */
async function handleStreamingRAGResponse(query, topDocs, strict, res) {
  // Send sources first
  const sources = buildSourcesMetadata(topDocs);
  res.write(`data: ${JSON.stringify({
    type: 'sources',
    content: sources
  })}\n\n`);

  // Build prompt and start streaming
  const context = topDocs.map(doc => doc.text).join('\n\n');
  const prompt = buildRAGPrompt(context, query, strict);

  const response = await generateLLMResponseStream(prompt);
  let fullResponse = '';

  // Process stream
  response.data.on('data', (chunk) => {
    const lines = chunk.toString().split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const json = JSON.parse(line);

        if (json.response) {
          fullResponse += json.response;

          res.write(`data: ${JSON.stringify({
            type: 'token',
            content: json.response
          })}\n\n`);
        }

        if (json.done) {
          console.log('✓ Respuesta streaming completada\n');

          const formattedAnswer = formatResponseAsHTML(fullResponse);
          res.write(`data: ${JSON.stringify({
            type: 'done',
            content: formattedAnswer,
            rawAnswer: fullResponse
          })}\n\n`);

          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (e) {
        // Ignore malformed JSON lines
      }
    }
  });

  response.data.on('error', (error) => {
    console.error('Error en streaming:', error.message);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      content: error.message
    })}\n\n`);
    res.end();
  });
}

module.exports = {
  performRAGSearch,
  generateRAGResponse,
  handleStreamingRAGResponse
};
