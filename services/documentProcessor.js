/**
 * Servicio de Procesamiento de Documentos
 *
 * Maneja el pipeline completo de procesamiento de PDF:
 * extracción → chunking → embedding → almacenamiento
 */

const { extractTextFromPDFWithPages, mapChunksToPages } = require('./pdfProcessor');
const { generateEmbedding } = require('./embeddingService');
const { splitIntoSemanticChunks } = require('./chunking');

/**
 * Procesa un archivo PDF: extrae texto, lo divide en chunks, genera embeddings
 *
 * @param {Object} file - Objeto de archivo Multer
 * @param {Object} config - Configuración RAG (chunkSize, chunkOverlap)
 * @returns {Promise<{pdfData, chunks, chunksWithEmbeddings}>}
 */
async function processPDFDocument(file, config) {
  console.log(`\n📄 Procesando PDF: ${file.originalname}`);

  // Extraer texto con metadata de páginas
  const pdfData = await extractTextFromPDFWithPages(file.path);
  console.log(`✓ Texto extraído: ${pdfData.fullText.length} caracteres de ${pdfData.numPages} páginas`);

  // Dividir texto semánticamente
  const chunks = splitIntoSemanticChunks(pdfData.fullText, config.chunkSize, config.chunkOverlap);
  console.log(`✓ Dividido en ${chunks.length} chunks semánticos (size=${config.chunkSize}, overlap=${config.chunkOverlap})`);

  // Mapear chunks a páginas
  const mappedChunks = mapChunksToPages(chunks, pdfData);

  // Generar embeddings para cada chunk
  const chunksWithEmbeddings = await generateChunkEmbeddings(mappedChunks, file.filename);
  console.log(`✓ Todos los embeddings generados con metadata de ubicación\n`);

  return {
    pdfData,
    chunks,
    chunksWithEmbeddings
  };
}

/**
 * Genera embeddings para todos los chunks con seguimiento de progreso
 *
 * @param {Array} mappedChunks - Chunks con metadata de página
 * @param {string} filename - Nombre de archivo original
 * @returns {Promise<Array>} Chunks con embeddings
 */
async function generateChunkEmbeddings(mappedChunks, filename) {
  const chunksWithEmbeddings = [];

  for (let i = 0; i < mappedChunks.length; i++) {
    process.stdout.write(`\r⏳ Generando embeddings... ${i + 1}/${mappedChunks.length}`);

    const chunk = mappedChunks[i];
    const embedding = await generateEmbedding(chunk.text);

    chunksWithEmbeddings.push({
      id: `${filename}_chunk_${i}`,
      filename: filename,
      text: chunk.text,
      embedding: embedding,
      page: chunk.page,
      charStart: chunk.charStart,
      charEnd: chunk.charEnd
    });
  }

  console.log(''); // Nueva línea después del progreso
  return chunksWithEmbeddings;
}

module.exports = {
  processPDFDocument,
  generateChunkEmbeddings
};
