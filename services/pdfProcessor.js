/**
 * Servicio de Procesamiento de PDF
 *
 * Maneja la extracción de texto de PDF con seguimiento preciso de metadata a nivel de página.
 * Utiliza pdf-parse para extracción de texto confiable.
 */

const fs = require('fs');
const pdf = require('pdf-parse');

/**
 * Extrae texto de PDF con metadata precisa a nivel de página
 *
 * @param {string} filePath - Ruta al archivo PDF
 * @returns {Promise<{fullText: string, numPages: number, pages: Array}>}
 */
async function extractTextFromPDFWithPages(filePath) {
  const dataBuffer = fs.readFileSync(filePath);

  // Opciones para pdf-parse: extraer texto página por página
  const options = {
    // Función personalizada para procesar cada página
    pagerender: async function(pageData) {
      // Obtener el texto de la página
      const textContent = await pageData.getTextContent();

      // Extraer texto de los items
      let pageText = textContent.items.map(item => item.str).join(' ');

      // LIMPIEZA: Normalizar espacios
      pageText = pageText
        .replace(/\s+/g, ' ')  // Múltiples espacios a uno solo
        .trim();

      return pageText;
    }
  };

  try {
    const data = await pdf(dataBuffer, options);

    console.log(`\n📄 Extracción con pdf-parse:`);
    console.log(`   Total de páginas: ${data.numpages}`);
    console.log(`   Texto total: ${data.text.length} caracteres`);

    // Construir array de páginas con metadata
    const pages = [];
    let charPosition = 0;

    // Extraer texto por página individualmente
    for (let pageNum = 1; pageNum <= data.numpages; pageNum++) {
      const pageOptions = {
        first: pageNum,
        last: pageNum,
        pagerender: options.pagerender
      };

      const pageData = await pdf(dataBuffer, pageOptions);
      let pageText = pageData.text;

      // DEBUG: Mostrar muestra del texto de cada página
      console.log(`\n🔍 DEBUG Página ${pageNum}:`);
      console.log(`   Texto extraído (primeros 300 chars): "${pageText.substring(0, 300)}"`);
      console.log(`   Longitud: ${pageText.length} caracteres`);

      // Análisis de tokens para verificar calidad del texto
      const tokens = pageText.split(/\s+/).filter(t => t.length > 0);
      const avgTokenLength = tokens.length > 0
        ? tokens.reduce((sum, t) => sum + t.length, 0) / tokens.length
        : 0;

      console.log(`   Tokens: ${tokens.length}, Longitud promedio: ${avgTokenLength.toFixed(2)}`);
      console.log(`   Primeros 10 tokens: ${JSON.stringify(tokens.slice(0, 10))}\n`);

      const charStart = charPosition;
      const charEnd = charPosition + pageText.length;

      pages.push({
        pageNumber: pageNum,
        text: pageText,
        charStart: charStart,
        charEnd: charEnd
      });

      charPosition = charEnd + 1; // +1 para el salto de línea entre páginas
    }

    // Reconstruir texto completo de todas las páginas
    const fullText = pages.map(p => p.text).join('\n');

    console.log(`\n✓ Extracción completa: ${fullText.length} caracteres de ${pages.length} páginas\n`);

    return {
      fullText: fullText.trim(),
      numPages: data.numpages,
      pages: pages
    };

  } catch (error) {
    throw new Error(`Error procesando PDF con pdf-parse: ${error.message}`);
  }
}

/**
 * Determina a qué página pertenece un chunk basado en la posición de carácter
 *
 * @param {number} charStart - Posición de carácter inicial del chunk
 * @param {Array} pages - Array de objetos de metadata de página
 * @param {number} totalLength - Longitud total del texto
 * @param {number} numPages - Número total de páginas
 * @returns {number} Número de página (indexado desde 1)
 */
function findPageForChunk(charStart, pages, totalLength, numPages) {
  for (const page of pages) {
    if (charStart >= page.charStart && charStart < page.charEnd) {
      return page.pageNumber;
    }
  }

  // Fallback: aproximar por porcentaje del documento
  const percentage = charStart / totalLength;
  return Math.ceil(percentage * numPages) || 1;
}

/**
 * Mapea chunks a sus páginas correspondientes con posiciones de caracteres
 *
 * @param {Array<string>} chunks - Array de chunks de texto
 * @param {Object} pdfData - Metadata de PDF de extractTextFromPDFWithPages
 * @returns {Array<{text: string, page: number, charStart: number, charEnd: number}>}
 */
function mapChunksToPages(chunks, pdfData) {
  const mappedChunks = [];
  let charPosition = 0;

  for (const chunkText of chunks) {
    const charStart = charPosition;
    const charEnd = charPosition + chunkText.length;
    const page = findPageForChunk(charStart, pdfData.pages, pdfData.fullText.length, pdfData.numPages);

    mappedChunks.push({
      text: chunkText,
      page: page,
      charStart: charStart,
      charEnd: charEnd
    });

    charPosition = charEnd;
  }

  return mappedChunks;
}

module.exports = {
  extractTextFromPDFWithPages,
  findPageForChunk,
  mapChunksToPages
};
