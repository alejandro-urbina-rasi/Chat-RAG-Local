/**
 * Servicio de Formateo de Respuestas
 *
 * Maneja el formateo de respuestas del LLM a HTML y construcción de metadata de fuentes
 */

/**
 * Convierte respuesta de texto plano del LLM a HTML formateado
 * Soporta sintaxis tipo markdown: **negrita**, _cursiva_, listas, encabezados
 *
 * @param {string} text - Respuesta de texto plano del LLM
 * @returns {string} Texto formateado en HTML
 */
function formatResponseAsHTML(text) {
  let formatted = escapeHTML(text);
  formatted = formatLists(formatted);
  formatted = formatEmphasis(formatted);
  formatted = formatHeaders(formatted);
  formatted = wrapInParagraphs(formatted);

  return formatted;
}

/**
 * Escapa caracteres especiales HTML
 */
function escapeHTML(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formatea listas (viñetas y numeradas)
 */
function formatLists(text) {
  let formatted = text;

  // Convertir viñetas con "-" o "*"
  formatted = formatted.replace(/^[-\*]\s+(.+)$/gm, '<li>$1</li>');

  // Envolver listas en <ul>
  formatted = formatted.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>');
  formatted = formatted.replace(/<\/ul>\s*<ul>/g, '');

  // Convertir listas numeradas
  formatted = formatted.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  return formatted;
}

/**
 * Formatea énfasis (negrita y cursiva)
 */
function formatEmphasis(text) {
  let formatted = text;

  // Convertir "**texto**" a <strong>
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Convertir "_texto_" a <em>
  formatted = formatted.replace(/_(.+?)_/g, '<em>$1</em>');

  return formatted;
}

/**
 * Formatea encabezados
 */
function formatHeaders(text) {
  let formatted = text;

  formatted = formatted.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  formatted = formatted.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  formatted = formatted.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  return formatted;
}

/**
 * Envuelve contenido en párrafos
 */
function wrapInParagraphs(text) {
  let formatted = text;

  // Convertir saltos de línea
  formatted = formatted.replace(/\n\n/g, '</p><p>');
  formatted = formatted.replace(/\n/g, '<br>');

  // Envolver en párrafos
  formatted = `<p>${formatted}</p>`;

  // Limpiar envoltura de párrafos alrededor de elementos de bloque
  formatted = formatted.replace(/<p>\s*<(ul|h1|h2|h3)/g, '<$1');
  formatted = formatted.replace(/<\/(ul|h1|h2|h3)>\s*<\/p>/g, '</$1>');

  return formatted;
}

/**
 * Construye metadata de fuentes para resultados de búsqueda
 *
 * @param {Array} topDocs - Array de documentos top de la búsqueda vectorial
 * @returns {Array} Metadata de fuentes formateada con enlaces a páginas
 */
function buildSourcesMetadata(topDocs) {
  return topDocs.map((doc, index) => ({
    filename: doc.filename,
    page: doc.page,
    chunkIndex: index,
    similarity: doc.similarity.toFixed(4),
    preview: doc.text.substring(0, 100) + '...',
    pdfLink: doc.page
      ? `/api/documents/${doc.filename}?page=${doc.page}`
      : `/api/documents/${doc.filename}`,
    charStart: doc.charStart,
    charEnd: doc.charEnd
  }));
}

module.exports = {
  formatResponseAsHTML,
  buildSourcesMetadata
};
