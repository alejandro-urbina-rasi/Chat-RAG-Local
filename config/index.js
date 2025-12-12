/**
 * Configuración Centralizada del Sistema RAG
 *
 * Carga variables de entorno y proporciona valores por defecto
 * Validación básica de configuración al inicio
 */

require('dotenv').config();

/**
 * Parsea un valor booleano de string
 * @param {string} value - Valor a parsear
 * @param {boolean} defaultValue - Valor por defecto
 * @returns {boolean}
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parsea un valor numérico de string
 * @param {string} value - Valor a parsear
 * @param {number} defaultValue - Valor por defecto
 * @returns {number}
 */
function parseNumber(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parsea un valor float de string
 * @param {string} value - Valor a parsear
 * @param {number} defaultValue - Valor por defecto
 * @returns {number}
 */
function parseFloatValue(value, defaultValue) {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parsea un array de strings separados por coma
 * @param {string} value - Valor a parsear
 * @param {Array} defaultValue - Valor por defecto
 * @returns {Array}
 */
function parseArray(value, defaultValue = []) {
  if (!value) return defaultValue;
  return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
}

// ============= CONFIGURACIÓN =============

const config = {
  // Servidor
  server: {
    port: parseNumber(process.env.PORT, 3000),
    environment: process.env.NODE_ENV || 'development',
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production'
  },

  // Ollama
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    embedModel: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
    llmModel: process.env.OLLAMA_LLM_MODEL || 'mistral',
    timeout: parseNumber(process.env.OLLAMA_TIMEOUT, 120000),
    temperature: parseFloatValue(process.env.OLLAMA_TEMPERATURE, 0.1),
    topP: parseFloatValue(process.env.OLLAMA_TOP_P, 0.9),
    topK: parseNumber(process.env.OLLAMA_TOP_K, 40)
  },

  // RAG
  rag: {
    chunkSize: parseNumber(process.env.RAG_CHUNK_SIZE, 500),
    chunkOverlap: parseNumber(process.env.RAG_CHUNK_OVERLAP, 1),
    topK: parseNumber(process.env.RAG_TOP_K, 3),
    similarityThreshold: parseFloatValue(process.env.RAG_SIMILARITY_THRESHOLD, 0.3),
    strictMode: parseBoolean(process.env.RAG_STRICT_MODE, true)
  },

  // Rutas
  paths: {
    uploads: process.env.UPLOADS_DIR || './uploads',
    data: process.env.DATA_DIR || './data'
  },

  // Seguridad
  security: {
    rateLimit: {
      max: parseNumber(process.env.RATE_LIMIT_MAX, 100),
      windowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000)
    },
    corsOrigins: parseArray(process.env.CORS_ORIGINS, ['http://localhost:3000'])
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

// ============= VALIDACIÓN =============

/**
 * Valida la configuración al inicio
 * @throws {Error} Si hay errores de configuración críticos
 */
function validateConfig() {
  const errors = [];

  // Validar puerto
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push(`Puerto inválido: ${config.server.port}. Debe estar entre 1-65535`);
  }

  // Validar RAG
  if (config.rag.chunkSize < 100) {
    errors.push(`RAG_CHUNK_SIZE muy pequeño: ${config.rag.chunkSize}. Mínimo: 100`);
  }

  if (config.rag.chunkSize > 2000) {
    console.warn(`⚠️  RAG_CHUNK_SIZE grande: ${config.rag.chunkSize}. Puede afectar performance.`);
  }

  if (config.rag.topK < 1) {
    errors.push(`RAG_TOP_K inválido: ${config.rag.topK}. Debe ser >= 1`);
  }

  if (config.rag.topK > 10) {
    console.warn(`⚠️  RAG_TOP_K alto: ${config.rag.topK}. Puede incluir documentos irrelevantes.`);
  }

  if (config.rag.similarityThreshold < 0 || config.rag.similarityThreshold > 1) {
    errors.push(`RAG_SIMILARITY_THRESHOLD inválido: ${config.rag.similarityThreshold}. Debe estar entre 0-1`);
  }

  // Validar timeout
  if (config.ollama.timeout < 1000) {
    console.warn(`⚠️  OLLAMA_TIMEOUT muy bajo: ${config.ollama.timeout}ms. Recomendado: >= 10000ms`);
  }

  // Si hay errores críticos, lanzar excepción
  if (errors.length > 0) {
    throw new Error(`Errores de configuración:\n  - ${errors.join('\n  - ')}`);
  }
}

// ============= UTILIDADES =============

/**
 * Imprime la configuración actual (oculta valores sensibles)
 */
function printConfig() {
  console.log('\n⚙️  Configuración del sistema:\n');
  console.log(`   Servidor:`);
  console.log(`      Puerto: ${config.server.port}`);
  console.log(`      Entorno: ${config.server.environment}`);
  console.log('');
  console.log(`   Ollama:`);
  console.log(`      URL: ${config.ollama.baseURL}`);
  console.log(`      Modelo embeddings: ${config.ollama.embedModel}`);
  console.log(`      Modelo LLM: ${config.ollama.llmModel}`);
  console.log(`      Timeout: ${config.ollama.timeout}ms`);
  console.log(`      Temperature: ${config.ollama.temperature}`);
  console.log(`      Top-P: ${config.ollama.topP}`);
  console.log(`      Top-K: ${config.ollama.topK}`);
  console.log('');
  console.log(`   RAG:`);
  console.log(`      Chunk size: ${config.rag.chunkSize} caracteres`);
  console.log(`      Chunk overlap: ${config.rag.chunkOverlap} oraciones`);
  console.log(`      Top-K: ${config.rag.topK} documentos`);
  console.log(`      Similarity threshold: ${config.rag.similarityThreshold}`);
  console.log(`      Modo estricto: ${config.rag.strictMode ? 'Activado' : 'Desactivado'}`);
  console.log('');
  console.log(`   Rutas:`);
  console.log(`      Uploads: ${config.paths.uploads}`);
  console.log(`      Data: ${config.paths.data}`);
  console.log('');
}

/**
 * Obtiene configuración específica para un módulo
 * @param {string} module - Nombre del módulo (server, ollama, rag, etc.)
 * @returns {Object} Configuración del módulo
 */
function getConfig(module) {
  if (!config[module]) {
    throw new Error(`Módulo de configuración no encontrado: ${module}`);
  }
  return config[module];
}

/**
 * Verifica si está en modo desarrollo
 * @returns {boolean}
 */
function isDevelopment() {
  return config.server.isDevelopment;
}

/**
 * Verifica si está en modo producción
 * @returns {boolean}
 */
function isProduction() {
  return config.server.isProduction;
}

// Validar configuración al cargar el módulo
try {
  validateConfig();
} catch (error) {
  console.error('\n❌ Error en la configuración:');
  console.error(`   ${error.message}\n`);
  console.error('   Revisa tu archivo .env y corrige los valores.\n');
  process.exit(1);
}

// ============= EXPORTS =============

module.exports = config;
module.exports.validate = validateConfig;
module.exports.print = printConfig;
module.exports.get = getConfig;
module.exports.isDevelopment = isDevelopment;
module.exports.isProduction = isProduction;
