/**
 * Servicio de Embeddings
 *
 * Maneja todas las interacciones con Ollama para embeddings y generación LLM
 */

const axios = require('axios');
const config = require('../config');

const {
  baseURL: OLLAMA_BASE_URL,
  embedModel: EMBED_MODEL,
  llmModel: LLM_MODEL,
  timeout: OLLAMA_TIMEOUT,
  temperature: TEMPERATURE,
  topP: TOP_P,
  topK: TOP_K
} = config.ollama;

/**
 * Genera vector de embedding para texto dado usando Ollama
 *
 * @param {string} text - Texto a vectorizar
 * @returns {Promise<Array<number>>} Vector de embedding
 */
async function generateEmbedding(text) {
  try {
    const response = await axios.post(
      `${OLLAMA_BASE_URL}/api/embeddings`,
      {
        model: EMBED_MODEL,
        prompt: text
      },
      { timeout: OLLAMA_TIMEOUT }
    );
    return response.data.embedding;
  } catch (error) {
    console.error('Error generando embedding:', error.message);
    throw error;
  }
}

/**
 * Genera respuesta LLM usando Ollama (sin streaming)
 *
 * @param {string} prompt - Prompt a enviar al LLM
 * @returns {Promise<string>} Texto de respuesta generado
 */
async function generateLLMResponse(prompt) {
  try {
    const response = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: LLM_MODEL,
        prompt: prompt,
        stream: false,
        options: {
          temperature: TEMPERATURE,
          top_p: TOP_P,
          top_k: TOP_K
        }
      },
      { timeout: OLLAMA_TIMEOUT }
    );
    return response.data.response;
  } catch (error) {
    console.error('Error generando respuesta LLM:', error.message);
    throw error;
  }
}

/**
 * Crea respuesta LLM con streaming usando Ollama
 *
 * @param {string} prompt - Prompt a enviar al LLM
 * @returns {Promise<axios.AxiosResponse>} Respuesta stream de Axios
 */
async function generateLLMResponseStream(prompt) {
  try {
    const response = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: LLM_MODEL,
        prompt: prompt,
        stream: true,
        options: {
          temperature: TEMPERATURE,
          top_p: TOP_P,
          top_k: TOP_K
        }
      },
      {
        responseType: 'stream',
        timeout: OLLAMA_TIMEOUT
      }
    );
    return response;
  } catch (error) {
    console.error('Error generando streaming LLM:', error.message);
    throw error;
  }
}

module.exports = {
  generateEmbedding,
  generateLLMResponse,
  generateLLMResponseStream
};
