/**
 * RAG Backend Server
 *
 * Express server for RAG (Retrieval-Augmented Generation) system with:
 * - PDF processing with page-level tracking
 * - Vector similarity search
 * - LLM response generation (streaming & non-streaming)
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

// Import modular services
const config = require('./config');
const VectorStore = require('./services/vectorStore');
const AuthService = require('./services/authService');
const { processPDFDocument } = require('./services/documentProcessor');
const { performRAGSearch, generateRAGResponse, handleStreamingRAGResponse } = require('./services/ragService');
const { errorHandler, asyncHandler, AppError } = require('./middleware/errorHandler');
const { validatePDFUpload, validateQuery, sanitizeFilename } = require('./middleware/validation');
const { requireAuth, requireAdmin, optionalAuth } = require('./middleware/auth');

const app = express();

// Configuration
const { port: PORT } = config.server;
const { topK: TOP_K, similarityThreshold: SIMILARITY_THRESHOLD } = config.rag;

// Middleware - CORS configurado para permitir credenciales
app.use(cors({
  origin: true, // Allow any origin (for development)
  credentials: true, // Allow credentials (cookies)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(cookieParser());

// Root path - serve login.html (BEFORE static middleware)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Static files AFTER root redirect (disable automatic index.html serving)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Setup directories
const uploadsDir = path.join(__dirname, config.paths.uploads);
const dbDir = path.join(__dirname, config.paths.data);

[uploadsDir, dbDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Initialize VectorStore and AuthService
const vectorStore = new VectorStore(path.join(dbDir, 'vectors.db'));
const authService = new AuthService(path.join(dbDir, 'users.db'));

// Initialize default admin user and start session cleaner
(async () => {
  await authService.initializeDefaultAdmin(process.env.ADMIN_PASSWORD || 'admin123');
  authService.startSessionCleaner();
})();

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// ============= API ROUTES =============

// Health check
app.get('/api', (req, res) => {
  res.json({
    message: 'Backend RAG con Ollama corriendo',
    endpoints: {
      // Auth
      login: 'POST /api/auth/login',
      logout: 'POST /api/auth/logout',
      session: 'GET /api/auth/session',
      // Documents
      upload: 'POST /api/upload',
      uploadPDF: 'POST /api/upload-pdf',
      files: 'GET /api/files',
      query: 'POST /api/query',
      queryStream: 'POST /api/query-stream',
      documents: 'GET /api/documents',
      getDocument: 'GET /api/documents/:filename',
      deleteDocument: 'DELETE /api/documents/:filename',
      // Users (admin only)
      users: 'GET /api/users',
      createUser: 'POST /api/users',
      deleteUser: 'DELETE /api/users/:id',
      // Config
      config: 'GET /api/config'
    }
  });
});

// ============= AUTH ROUTES =============

// Login
app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    throw new AppError('Usuario y contraseña son requeridos', 400);
  }

  const { sessionId, user } = await authService.login(username, password);

  // Set session cookie
  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  });

  res.json({
    success: true,
    message: 'Login exitoso',
    sessionId,
    user
  });
}));

// Logout
app.post('/api/auth/logout', requireAuth(authService), asyncHandler(async (req, res) => {
  authService.logout(req.sessionId);

  res.clearCookie('sessionId');

  res.json({
    success: true,
    message: 'Logout exitoso'
  });
}));

// Get current session / user info
app.get('/api/auth/session', optionalAuth(authService), (req, res) => {
  if (!req.user) {
    return res.json({
      authenticated: false,
      user: null
    });
  }

  res.json({
    authenticated: true,
    user: req.user
  });
});

// Change password
app.post('/api/auth/change-password', requireAuth(authService), asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new AppError('Contraseña actual y nueva contraseña son requeridas', 400);
  }

  await authService.changePassword(req.user.userId, oldPassword, newPassword);

  res.json({
    success: true,
    message: 'Contraseña actualizada exitosamente'
  });
}));

// Get chat history
app.get('/api/chat/history', requireAuth(authService), asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const history = authService.getChatHistory(req.user.userId, limit);

  res.json({
    success: true,
    history
  });
}));

// Get configuration
app.get('/api/config', (req, res) => {
  res.json({
    strictMode: config.rag.strictMode,
    message: 'Modo estricto activado: Solo responde con información de los documentos'
  });
});

// ============= DOCUMENT ROUTES =============

// Upload generic file (admin only)
app.post('/api/upload', requireAuth(authService), requireAdmin, upload.single('file'), (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file uploaded', 400));
  }

  res.json({
    success: true,
    message: 'Archivo subido correctamente',
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      path: req.file.path
    }
  });
});

// Upload and process PDF with embeddings (admin only)
app.post('/api/upload-pdf', requireAuth(authService), requireAdmin, upload.single('file'), validatePDFUpload, asyncHandler(async (req, res) => {
  const result = await processPDFDocument(req.file, config.rag);

  // Store in VectorStore
  vectorStore.insertChunksBatch(result.chunksWithEmbeddings);
  console.log(`✓ Guardado en VectorStore: ${result.chunksWithEmbeddings.length} documentos\n`);

  res.json({
    success: true,
    message: 'PDF procesado correctamente',
    file: req.file.originalname,
    pages: result.pdfData.numPages,
    chunks: result.chunks.length,
    embeddings_generated: result.chunksWithEmbeddings.length
  });
}));

// List uploaded files (admin only)
app.get('/api/files', requireAuth(authService), requireAdmin, (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const fileList = files.map(file => {
      const filePath = path.join(uploadsDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        created: stats.birthtime
      };
    });

    res.json({ files: fileList });
  });
});

// List processed documents (authenticated users)
app.get('/api/documents', requireAuth(authService), asyncHandler(async (_req, res) => {
  const stats = vectorStore.getDocumentStats();

  // Transform to format expected by frontend
  const documents = Object.entries(stats.files).map(([filename, chunks]) => ({
    filename,
    chunks
  }));

  res.json({
    documents,
    total_chunks: stats.totalDocuments
  });
}));

// Delete document (admin only)
app.delete('/api/documents/:filename', requireAuth(authService), requireAdmin, sanitizeFilename, asyncHandler(async (req, res) => {
  const filename = req.params.filename;
  console.log(`\n🗑️  Eliminando documento: ${filename}`);

  // Delete PDF file
  const filePath = path.join(uploadsDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`✓ PDF eliminado: ${filename}`);
  }

  // Delete embeddings from VectorStore
  const deletedCount = vectorStore.deleteByFilename(filename);
  console.log(`✓ ${deletedCount} embeddings eliminados de VectorStore\n`);

  res.json({
    success: true,
    message: 'Documento eliminado correctamente',
    file: filename,
    embeddingsDeleted: deletedCount
  });
}));

// Serve PDFs with page navigation
app.get('/api/documents/:filename', sanitizeFilename, (req, res, next) => {
  const filename = req.params.filename;
  const page = req.query.page;

  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) {
    return next(new AppError('Archivo no encontrado', 404));
  }

  if (!filename.toLowerCase().endsWith('.pdf')) {
    return next(new AppError('Solo se pueden servir archivos PDF', 400));
  }

  console.log(`📄 Sirviendo PDF: ${filename}${page ? ` (página ${page})` : ''}`);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  if (page && !isNaN(parseInt(page))) {
    res.setHeader('Content-Location', `/api/documents/${filename}#page=${page}`);
  }

  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      next(new AppError('Error al servir el PDF', 500));
    }
  });
});

// ============= RAG QUERY ROUTES (Authenticated users) =============

// Query documents (RAG) - non-streaming
app.post('/api/query', requireAuth(authService), validateQuery, asyncHandler(async (req, res) => {
  const { query, strict = true } = req.body;

  const topDocs = await performRAGSearch(query, vectorStore, TOP_K, SIMILARITY_THRESHOLD);
  const response = await generateRAGResponse(query, topDocs, strict);

  // Save to chat history
  authService.saveChatMessage(req.user.userId, query, response.answer, response.sources);

  res.json(response);
}));

// Query documents (RAG) - streaming
app.post('/api/query-stream', requireAuth(authService), validateQuery, asyncHandler(async (req, res) => {
  const { query, strict = true } = req.body;

  console.log(`\n🔍 Consultando (STREAMING): "${query}" (Usuario: ${req.user.username}, Modo estricto: ${strict})`);

  // Configure SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const topDocs = await performRAGSearch(query, vectorStore, TOP_K, SIMILARITY_THRESHOLD);

    // Capture the full response for saving to history
    let fullAnswer = '';
    const originalWrite = res.write.bind(res);
    res.write = (chunk) => {
      const data = chunk.toString();
      const match = data.match(/data: ({.*})/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed.type === 'content') {
            fullAnswer += parsed.content;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      return originalWrite(chunk);
    };

    await handleStreamingRAGResponse(query, topDocs, strict, res);

    // Save to chat history after streaming completes
    if (fullAnswer) {
      const sources = topDocs.map(doc => ({
        file: doc.filename,
        page: doc.page,
        similarity: doc.similarity
      }));
      authService.saveChatMessage(req.user.userId, query, fullAnswer, sources);
    }
  } catch (error) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      content: error.message
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}));

// ============= PUBLIC RAG QUERY ROUTES (No authentication required) =============

// Public query - streaming (no authentication)
app.post('/api/public/query-stream', validateQuery, asyncHandler(async (req, res) => {
  const { query, strict = true } = req.body;

  console.log(`\n🌐 Consulta PÚBLICA (STREAMING): "${query}" (Modo estricto: ${strict})`);

  // Configure SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const topDocs = await performRAGSearch(query, vectorStore, TOP_K, SIMILARITY_THRESHOLD);
    await handleStreamingRAGResponse(query, topDocs, strict, res);
    // No guardamos historial para consultas públicas
  } catch (error) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      content: error.message
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}));

// Public query - non-streaming (no authentication)
app.post('/api/public/query', validateQuery, asyncHandler(async (req, res) => {
  const { query, strict = true } = req.body;

  console.log(`\n🌐 Consulta PÚBLICA: "${query}" (Modo estricto: ${strict})`);

  const topDocs = await performRAGSearch(query, vectorStore, TOP_K, SIMILARITY_THRESHOLD);
  const response = await generateRAGResponse(query, topDocs, strict);

  // No guardamos historial para consultas públicas
  res.json(response);
}));

// Fallback - serve login for unknown routes
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Error handling middleware (must be last)
app.use(errorHandler);

// ============= START SERVER =============

app.listen(PORT, () => {
  config.print();

  console.log(`✓ Backend RAG corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno: ${config.server.environment}`);
  console.log(`\n📍 Rutas disponibles:`);
  console.log(`   POST   /api/upload         - Subir archivo genérico`);
  console.log(`   POST   /api/upload-pdf     - Subir y procesar PDF`);
  console.log(`   GET    /api/files          - Listar archivos`);
  console.log(`   GET    /api/documents      - Listar documentos procesados`);
  console.log(`   GET    /api/documents/:filename - Servir PDF (con ?page=N opcional)`);
  console.log(`   DELETE /api/documents/:filename - Eliminar documento`);
  console.log(`   POST   /api/query          - Consultar documentos (strict=${config.rag.strictMode})`);
  console.log(`   POST   /api/query-stream   - Consultar con streaming (strict=${config.rag.strictMode})`);
  console.log(`   GET    /api/config         - Ver configuración\n`);
});
