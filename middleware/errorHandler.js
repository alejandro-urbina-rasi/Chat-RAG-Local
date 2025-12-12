/**
 * Middleware de Manejo de Errores
 *
 * Proporciona respuestas de error consistentes en toda la aplicación
 */

/**
 * Middleware global de manejo de errores
 * Debe registrarse DESPUÉS de todas las rutas
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * Wrapper para manejadores de rutas async para capturar errores
 * Uso: app.get('/ruta', asyncHandler(async (req, res) => {...}))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Clase de error personalizada para errores de la aplicación
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  AppError
};
