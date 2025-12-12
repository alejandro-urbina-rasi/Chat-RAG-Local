/**
 * Middleware de Validación
 *
 * Proporciona validación de requests para varios endpoints
 */

const path = require('path');
const { AppError } = require('./errorHandler');

/**
 * Valida la carga de archivos PDF
 */
function validatePDFUpload(req, res, next) {
  if (!req.file) {
    return next(new AppError('No file uploaded', 400));
  }

  const fileExt = path.extname(req.file.originalname).toLowerCase();
  if (fileExt !== '.pdf') {
    return next(new AppError('Only PDF files are allowed', 400));
  }

  next();
}

/**
 * Valida el body del request de consulta
 */
function validateQuery(req, res, next) {
  const { query } = req.body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return next(new AppError('Query is required and must be a non-empty string', 400));
  }

  if (query.length > 2000) {
    return next(new AppError('Query is too long (max 2000 characters)', 400));
  }

  next();
}

/**
 * Sanitiza el nombre de archivo para prevenir ataques de path traversal
 */
function sanitizeFilename(req, res, next) {
  const { filename } = req.params;

  if (!filename) {
    return next(new AppError('Filename is required', 400));
  }

  // Prevenir path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return next(new AppError('Invalid filename', 400));
  }

  next();
}

module.exports = {
  validatePDFUpload,
  validateQuery,
  sanitizeFilename
};
