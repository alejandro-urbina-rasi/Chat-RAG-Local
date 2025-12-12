/**
 * Módulo de Chunking Semántico
 *
 * Divide texto en chunks semánticos por oraciones completas
 *
 * @param {string} text - Texto a dividir
 * @param {number} maxChunkSize - Tamaño máximo del chunk en caracteres (default: 500)
 * @param {number} overlapSentences - Número de oraciones a repetir entre chunks (default: 1)
 * @returns {Array<string>} - Array de chunks
 */
function splitIntoSemanticChunks(text, maxChunkSize = 500, overlapSentences = 1) {
  // 1. Limpieza básica del texto
  text = text
    .replace(/\s+/g, ' ')           // Normalizar espacios múltiples
    .replace(/\n+/g, '\n')          // Normalizar saltos de línea
    .trim();

  if (!text || text.length === 0) {
    return [];
  }

  // 2. Dividir en oraciones usando regex mejorado para español
  // Detecta finales de oración: . ! ? seguidos de espacio/mayúscula o fin de texto
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)/g;

  let sentences = text.match(sentenceRegex) || [];

  console.log(`\n🔍 DEBUG Chunking:`);
  console.log(`   Texto total: ${text.length} caracteres`);
  console.log(`   Primeros 300 chars: "${text.substring(0, 300)}"`);
  console.log(`   Oraciones detectadas por regex: ${sentences.length}`);

  // Si no se detectaron oraciones con el regex (texto sin puntuación), usar todo el texto
  if (sentences.length === 0) {
    console.log(`   ⚠️  NO SE DETECTARON ORACIONES - el texto no tiene puntuación`);
    console.log(`   Se usará el texto completo como 1 solo chunk`);
    sentences = [text];
  } else {
    console.log(`   ✓ ${sentences.length} oraciones encontradas`);
    console.log(`   Primeras 3 oraciones:`);
    sentences.slice(0, 3).forEach((s, i) => {
      console.log(`      ${i + 1}. "${s.substring(0, 100)}${s.length > 100 ? '...' : ''}"`);
    });
  }

  // Limpiar oraciones (quitar espacios extras)
  sentences = sentences.map(s => s.trim()).filter(s => s.length > 0);

  // 3. Agrupar oraciones en chunks respetando maxChunkSize
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceSize = sentence.length;

    // Caso especial: Una sola oración excede maxChunkSize
    if (sentenceSize > maxChunkSize) {
      // Si ya tenemos contenido en currentChunk, guardarlo primero
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
        currentSize = 0;
      }

      // Dividir la oración larga por palabras
      const subChunks = splitLongSentenceByWords(sentence, maxChunkSize);
      chunks.push(...subChunks);
      continue;
    }

    // Verificar si agregar esta oración excede el límite
    const wouldExceed = (currentSize + sentenceSize) > maxChunkSize;

    if (wouldExceed && currentChunk.length > 0) {
      // Guardar el chunk actual
      chunks.push(currentChunk.join(' '));

      // Preparar nuevo chunk con overlap
      if (overlapSentences > 0 && currentChunk.length > overlapSentences) {
        // Mantener las últimas N oraciones para contexto
        currentChunk = currentChunk.slice(-overlapSentences);
        currentSize = currentChunk.reduce((sum, s) => sum + s.length, 0);
      } else {
        currentChunk = [];
        currentSize = 0;
      }
    }

    // Agregar la oración al chunk actual
    currentChunk.push(sentence);
    currentSize += sentenceSize;
  }

  // Agregar el último chunk si tiene contenido
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  // 4. Post-procesamiento: eliminar chunks vacíos o muy pequeños
  return chunks
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 20); // Mínimo 20 caracteres
}

/**
 * Divide una oración muy larga por palabras cuando excede maxChunkSize
 *
 * @param {string} sentence - Oración a dividir
 * @param {number} maxChunkSize - Tamaño máximo por chunk
 * @returns {Array<string>} - Array de sub-chunks
 */
function splitLongSentenceByWords(sentence, maxChunkSize) {
  const words = sentence.split(/\s+/);
  const subChunks = [];
  let currentSubChunk = '';

  for (const word of words) {
    const testChunk = currentSubChunk ? `${currentSubChunk} ${word}` : word;

    if (testChunk.length > maxChunkSize && currentSubChunk) {
      // Guardar el sub-chunk actual y empezar uno nuevo
      subChunks.push(currentSubChunk.trim());
      currentSubChunk = word;
    } else {
      currentSubChunk = testChunk;
    }
  }

  // Agregar el último sub-chunk
  if (currentSubChunk.trim().length > 0) {
    subChunks.push(currentSubChunk.trim());
  }

  return subChunks;
}

/**
 * Versión antigua de chunking por caracteres fijos (para comparación)
 *
 * @deprecated Usar splitIntoSemanticChunks para mejor calidad
 * @param {string} text - Texto a dividir
 * @param {number} chunkSize - Tamaño del chunk
 * @param {number} overlap - Overlap en caracteres
 * @returns {Array<string>} - Array de chunks
 */
function splitIntoFixedChunks(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Obtiene estadísticas de un conjunto de chunks para análisis
 *
 * @param {Array<string>} chunks - Array de chunks
 * @returns {Object} - Estadísticas detalladas
 */
function getChunkStatistics(chunks) {
  if (!chunks || chunks.length === 0) {
    return {
      count: 0,
      avgSize: 0,
      minSize: 0,
      maxSize: 0,
      totalChars: 0
    };
  }

  const sizes = chunks.map(c => c.length);
  const totalChars = sizes.reduce((sum, size) => sum + size, 0);

  return {
    count: chunks.length,
    avgSize: Math.round(totalChars / chunks.length),
    minSize: Math.min(...sizes),
    maxSize: Math.max(...sizes),
    totalChars: totalChars,
    sizes: sizes
  };
}

/**
 * Analiza la calidad del chunking comparando métodos
 *
 * @param {string} text - Texto original
 * @param {number} maxSize - Tamaño máximo de chunk
 * @returns {Object} - Comparación entre métodos
 */
function compareChunkingMethods(text, maxSize = 500) {
  // Chunking fijo
  const fixedChunks = splitIntoFixedChunks(text, maxSize, 50);
  const fixedStats = getChunkStatistics(fixedChunks);

  // Chunking semántico
  const semanticChunks = splitIntoSemanticChunks(text, maxSize, 1);
  const semanticStats = getChunkStatistics(semanticChunks);

  // Analizar calidad: chunks que terminan a mitad de palabra
  const fixedBrokenWords = fixedChunks.filter(chunk => {
    const lastChar = chunk.trim().slice(-1);
    return lastChar !== '.' && lastChar !== '!' && lastChar !== '?' && !chunk.trim().endsWith('...');
  }).length;

  const semanticBrokenWords = semanticChunks.filter(chunk => {
    const lastChar = chunk.trim().slice(-1);
    return lastChar !== '.' && lastChar !== '!' && lastChar !== '?' && !chunk.trim().endsWith('...');
  }).length;

  return {
    fixed: {
      ...fixedStats,
      brokenChunks: fixedBrokenWords,
      completenessScore: ((fixedStats.count - fixedBrokenWords) / fixedStats.count * 100).toFixed(1)
    },
    semantic: {
      ...semanticStats,
      brokenChunks: semanticBrokenWords,
      completenessScore: ((semanticStats.count - semanticBrokenWords) / semanticStats.count * 100).toFixed(1)
    },
    recommendation: semanticStats.count > 0 ? 'semantic' : 'fixed'
  };
}

module.exports = {
  splitIntoSemanticChunks,
  splitIntoFixedChunks,
  getChunkStatistics,
  compareChunkingMethods
};
