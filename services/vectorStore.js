const Database = require('better-sqlite3');
const path = require('path');

/**
 * VectorStore - Almacenamiento persistente de documentos y embeddings
 * Usa SQLite para persistencia y búsqueda eficiente de vectores
 */
class VectorStore {
  constructor(dbPath) {
    this.db = new Database(dbPath);

    // Configuración de performance
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging para mejor concurrencia
    this.db.pragma('synchronous = NORMAL'); // Balance entre seguridad y velocidad
    this.db.pragma('cache_size = -64000'); // 64MB de caché

    this.initTables();
  }

  /**
   * Inicializa las tablas necesarias
   */
  initTables() {
    this.migrateSchema();

    // Luego crear tabla e índices básicos
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        text TEXT NOT NULL,
        embedding TEXT NOT NULL,  -- JSON serializado del vector
        page INTEGER,             -- Número de página en el PDF
        char_start INTEGER,       -- Posición inicial del chunk
        char_end INTEGER,         -- Posición final del chunk
        created_at INTEGER DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_filename ON documents(filename);
      CREATE INDEX IF NOT EXISTS idx_created_at ON documents(created_at);
    `);

    //  Crear índice de página después de asegurar que la columna existe
    this.createPageIndex();
  }

  /**
   * Migración para agregar campos de ubicación a tablas existentes
   */
  migrateSchema() {
    try {
      // Verificar si la tabla existe
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'").all();

      if (tables.length === 0) {
        // La tabla no existe aún, se creará en initTables
        return;
      }

      // Verificar si las columnas ya existen
      const tableInfo = this.db.pragma('table_info(documents)');
      const columnNames = tableInfo.map(col => col.name);

      // Agregar columnas faltantes
      if (!columnNames.includes('page')) {
        this.db.exec('ALTER TABLE documents ADD COLUMN page INTEGER');
        console.log('✓ Columna "page" agregada a la tabla documents');
      }

      if (!columnNames.includes('char_start')) {
        this.db.exec('ALTER TABLE documents ADD COLUMN char_start INTEGER');
        console.log('✓ Columna "char_start" agregada a la tabla documents');
      }

      if (!columnNames.includes('char_end')) {
        this.db.exec('ALTER TABLE documents ADD COLUMN char_end INTEGER');
        console.log('✓ Columna "char_end" agregada a la tabla documents');
      }
    } catch (error) {
      console.error('⚠️  Error en migración de schema:', error.message);
    }
  }

  /**
   * Crear índice en columna page (solo si la columna existe)
   */
  createPageIndex() {
    try {
      // Verificar si la tabla y columna existen
      const tableInfo = this.db.pragma('table_info(documents)');
      const columnNames = tableInfo.map(col => col.name);

      if (columnNames.includes('page')) {
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_page ON documents(page)');
      }
    } catch (error) {
      console.error('⚠️  Error creando índice de página:', error.message);
    }
  }

  /**
   * Inserta un chunk de documento con su embedding
   * @param {string} id - ID único del chunk
   * @param {string} filename - Nombre del archivo fuente
   * @param {string} text - Texto del chunk
   * @param {Array<number>} embedding - Vector de embedding
   * @param {number} page - Número de página (opcional)
   * @param {number} charStart - Posición inicial (opcional)
   * @param {number} charEnd - Posición final (opcional)
   */
  insertChunk(id, filename, text, embedding, page = null, charStart = null, charEnd = null) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, filename, text, embedding, page, char_start, char_end)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, filename, text, JSON.stringify(embedding), page, charStart, charEnd);
  }

  /**
   * Inserta múltiples chunks en una transacción (mucho más rápido)
   * Soporta campos de ubicación opcionales en cada chunk
   * @param {Array} chunks - Array de {id, filename, text, embedding, page?, charStart?, charEnd?}
   */
  insertChunksBatch(chunks) {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, filename, text, embedding, page, char_start, char_end)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((chunks) => {
      for (const chunk of chunks) {
        insert.run(
          chunk.id,
          chunk.filename,
          chunk.text,
          JSON.stringify(chunk.embedding),
          chunk.page || null,
          chunk.charStart || null,
          chunk.charEnd || null
        );
      }
    });

    insertMany(chunks);
  }

  /**
   * Calcula la similitud coseno entre dos vectores
   * @param {Array<number>} a - Vector A
   * @param {Array<number>} b - Vector B
   * @returns {number} - Similitud coseno (0-1)
   */
  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Busca los chunks más similares a un embedding de consulta
   * @param {Array<number>} queryEmbedding - Vector de la consulta
   * @param {number} topK - Número de resultados a devolver
   * @param {number} similarityThreshold - Umbral mínimo de similitud (0-1)
   * @param {string} filenameFilter - Filtrar por nombre de archivo (opcional)
   * @returns {Array} - Array de documentos con similarity score y metadata de ubicación
   */
  searchSimilar(queryEmbedding, topK = 3, similarityThreshold = 0.3, filenameFilter = null) {
    // Construir query con filtro opcional 
    let query = 'SELECT id, filename, text, embedding, page, char_start, char_end FROM documents';
    const params = [];

    if (filenameFilter) {
      query += ' WHERE filename = ?';
      params.push(filenameFilter);
    }

    const stmt = this.db.prepare(query);
    const documents = stmt.all(...params);

    // Calcular similitudes 
    const results = documents.map(doc => {
      const embedding = JSON.parse(doc.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);

      return {
        id: doc.id,
        filename: doc.filename,
        text: doc.text,
        similarity: similarity,
        page: doc.page,           
        charStart: doc.char_start, 
        charEnd: doc.char_end      
      };
    });

    // Filtrar por threshold y ordenar por similitud descendente
    const filtered = results
      .filter(doc => doc.similarity >= similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return filtered;
  }

  /**
   * Elimina todos los chunks de un archivo
   * @param {string} filename - Nombre del archivo a eliminar
   * @returns {number} - Número de chunks eliminados
   */
  deleteByFilename(filename) {
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM documents WHERE filename = ?');
    const count = countStmt.get(filename).count;

    const deleteStmt = this.db.prepare('DELETE FROM documents WHERE filename = ?');
    deleteStmt.run(filename);

    return count;
  }

  /**
   * Obtiene estadísticas de documentos almacenados
   * @returns {Object} - {totalDocuments, files: {filename: count}}
   */
  getDocumentStats() {
    const statsStmt = this.db.prepare(`
      SELECT filename, COUNT(*) as count
      FROM documents
      GROUP BY filename
      ORDER BY filename
    `);
    const stats = statsStmt.all();

    const totalStmt = this.db.prepare('SELECT COUNT(*) as total FROM documents');
    const total = totalStmt.get().total;

    const files = {};
    for (const stat of stats) {
      files[stat.filename] = stat.count;
    }

    return {
      totalDocuments: total,
      files: files
    };
  }

  /**
   * Verifica si un archivo ya está procesado
   * @param {string} filename - Nombre del archivo
   * @returns {boolean}
   */
  hasFile(filename) {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM documents WHERE filename = ?');
    const result = stmt.get(filename);
    return result.count > 0;
  }

  /**
   * Obtiene el número de chunks de un archivo
   * @param {string} filename - Nombre del archivo
   * @returns {number}
   */
  getChunkCount(filename) {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM documents WHERE filename = ?');
    const result = stmt.get(filename);
    return result.count;
  }

  /**
   * Optimiza la base de datos (útil después de muchas eliminaciones)
   */
  optimize() {
    this.db.exec('VACUUM');
    this.db.exec('ANALYZE');
  }

  /**
   * Cierra la conexión a la base de datos
   */
  close() {
    this.db.close();
  }
}

module.exports = VectorStore;
