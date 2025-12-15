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

  // Custom page render function for text extraction
  const pageRenderFunction = async function(pageData) {
    // Get the text content from the page
    const textContent = await pageData.getTextContent();

    // Extract text from items
    let pageText = textContent.items.map(item => item.str).join(' ');

    // CLEANUP: Normalize spaces
    pageText = pageText
      .replace(/\s+/g, ' ')  // Multiple spaces to single space
      .trim();

    return pageText;
  };

  try {
    // First: Get page count only (without full text extraction)
    // Using a minimal pagerender that returns empty string to avoid processing text
    const metadataOptions = {
      max: 0, // Don't process any pages for text
      pagerender: () => '' // Return empty string to skip text extraction
    };
    const metadata = await pdf(dataBuffer, metadataOptions);
    const numPages = metadata.numpages;

    console.log(`\n[PDF] Extraction with pdf-parse:`);
    console.log(`   Total pages: ${numPages}`);

    // Build array of pages with metadata
    const pages = [];
    let charPosition = 0;

    // Extract text page by page individually
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageOptions = {
        first: pageNum,
        last: pageNum,
        pagerender: pageRenderFunction
      };

      const pageData = await pdf(dataBuffer, pageOptions);
      let pageText = pageData.text;

      // DEBUG: Show sample of text from each page
      console.log(`\n[DEBUG] Page ${pageNum}:`);
      console.log(`   Extracted text (first 300 chars): "${pageText.substring(0, 300)}"`);
      console.log(`   Length: ${pageText.length} characters`);

      // Token analysis to verify text quality
      const tokens = pageText.split(/\s+/).filter(t => t.length > 0);
      const avgTokenLength = tokens.length > 0
        ? tokens.reduce((sum, t) => sum + t.length, 0) / tokens.length
        : 0;

      console.log(`   Tokens: ${tokens.length}, Average length: ${avgTokenLength.toFixed(2)}`);
      console.log(`   First 10 tokens: ${JSON.stringify(tokens.slice(0, 10))}\n`);

      const charStart = charPosition;
      const charEnd = charPosition + pageText.length;

      pages.push({
        pageNumber: pageNum,
        text: pageText,
        charStart: charStart,
        charEnd: charEnd
      });

      charPosition = charEnd + 1; // +1 for the newline between pages
    }

    // Reconstruct full text from all pages
    const fullText = pages.map(p => p.text).join('\n');

    console.log(`\n[OK] Extraction complete: ${fullText.length} characters from ${pages.length} pages\n`);

    return {
      fullText: fullText.trim(),
      numPages: numPages,
      pages: pages
    };

  } catch (error) {
    throw new Error(`Error processing PDF with pdf-parse: ${error.message}`);
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
