# FAQ Técnico - Chat RAG Local

---

## 📊 Almacenamiento y Base de Datos

### ¿Cuántos documentos se pueden guardar en SQLite?

**Respuesta:**
SQLite no tiene un límite práctico de cantidad de documentos. Los límites dependen de:

- **Límite teórico de SQLite**: 281 terabytes por base de datos
- **Límite de filas**: 2^64 filas (18 quintillones)
- **Límite práctico en este proyecto**: Depende del espacio en disco disponible

**Cálculo real basado en el código:**
- Cada chunk almacena:
  - `id` (TEXT): ~50 bytes
  - `filename` (TEXT): ~100 bytes
  - `text` (TEXT): ~500-1000 bytes promedio
  - `embedding` (TEXT JSON): ~6KB (768 dimensiones × 8 bytes)
  - Metadata (page, char_start, char_end, created_at): ~50 bytes

**Total por chunk**: ~7KB promedio

**Ejemplo:**
- 1 PDF de 50 páginas = ~50-100 chunks
- 100 chunks × 7KB = ~700KB
- 1GB de disco = ~1,400 documentos PDF medianos
- 100GB = ~140,000 PDFs

**Código relacionado:**
- [vectorStore.js:28-41](services/vectorStore.js#L28-L41) - Estructura de tabla
- [vectorStore.js:12-15](services/vectorStore.js#L12-L15) - Configuración de performance (64MB de caché)

---

### ¿Por qué usar SQLite en lugar de una base de datos vectorial especializada?

**Respuesta:**

**Ventajas de SQLite en este proyecto:**
1. **Cero dependencias externas**: No requiere servicios adicionales
2. **100% local**: Cumple el objetivo de privacidad del proyecto
3. **Simplicidad**: Base de datos de archivo único
4. **Transacciones ACID**: Confiabilidad garantizada
5. **Performance suficiente**: Para datasets medianos (<10M vectores)

**Optimizaciones implementadas:**
```javascript
// services/vectorStore.js:13-15
this.db.pragma('journal_mode = WAL');      // Write-Ahead Logging
this.db.pragma('synchronous = NORMAL');     // Balance velocidad/seguridad
this.db.pragma('cache_size = -64000');      // 64MB de caché
```

**Limitaciones vs bases vectoriales (Pinecone, Weaviate, Milvus):**
- No tiene índices HNSW/IVF para búsqueda aproximada
- Búsqueda lineal O(n) vs O(log n)
- Menos eficiente con >1M vectores

**Conclusión**: Ideal para uso local con datasets pequeños/medianos (1-10K documentos)

---

## 🔍 RAG y Embeddings

### ¿Cómo funciona el sistema RAG paso a paso?

**Respuesta:**

**Pipeline completo (documentProcessor.js + ragService.js):**

1. **Upload de PDF** → `POST /api/upload-pdf`
   ```javascript
   // server.js:218-233
   - Valida archivo PDF
   - Guarda en carpeta ./uploads
   ```

2. **Extracción de texto** → `pdfProcessor.js`
   ```javascript
   // Extrae texto por página usando pdf-parse
   - Mantiene metadata de número de página
   - Normaliza espacios y saltos de línea
   ```

3. **Chunking semántico** → `chunking.js:11-105`
   ```javascript
   // Divide en oraciones completas, no corta palabras
   - Regex: /[^.!?]+[.!?]+(?:\s+|$)/g
   - Respeta maxChunkSize (default: 500 caracteres)
   - Overlap de N oraciones entre chunks (default: 1)
   ```

4. **Generación de embeddings** → `embeddingService.js`
   ```javascript
   // Para cada chunk:
   POST http://localhost:11434/api/embeddings
   {
     "model": "nomic-embed-text",
     "prompt": "texto del chunk"
   }
   // Retorna: vector de 768 dimensiones
   ```

5. **Almacenamiento** → `vectorStore.js:125-146`
   ```javascript
   // Inserta batch de chunks con transacción
   insertChunksBatch([
     {id, filename, text, embedding, page, charStart, charEnd}
   ])
   ```

6. **Consulta del usuario** → `POST /api/query-stream`
   ```javascript
   // ragService.js:21-36
   - Genera embedding de la pregunta
   - Busca Top-K chunks más similares (cosine similarity)
   - Filtra por umbral de similitud (default: 0.3)
   ```

7. **Generación de respuesta** → `ragService.js:72-131`
   ```javascript
   // Construye prompt con contexto + pregunta
   // Envía a Ollama (modelo: mistral)
   // Streaming de tokens en tiempo real (SSE)
   ```

---

### ¿Qué es la similitud coseno y cómo se calcula?

**Respuesta:**

**Implementación real del código:**
```javascript
// vectorStore.js:154-171
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

  return dotProduct / (magnitudeA * magnitudeB);
}
```

**Fórmula matemática:**
```
similarity = (A · B) / (||A|| × ||B||)

Donde:
- A · B = producto punto (suma de productos elemento a elemento)
- ||A|| = magnitud del vector A (raíz cuadrada de suma de cuadrados)
- ||B|| = magnitud del vector B
```

**Rango de valores:**
- **1.0**: Vectores idénticos (misma dirección)
- **0.5-0.9**: Alta similitud semántica
- **0.3-0.5**: Similitud moderada (umbral por defecto: 0.3)
- **0.0**: Sin similitud
- **-1.0**: Opuestos (raro en embeddings)

**Ejemplo práctico:**
```javascript
// Si la pregunta es: "¿Qué es machine learning?"
// Y un chunk dice: "El aprendizaje automático es..."
// Similarity score: ~0.75 (alta similitud semántica)
```

---

### ¿Cuál es el tamaño óptimo de los chunks?

**Respuesta:**

**Configuración en config/index.js:75:**
```javascript
chunkSize: parseNumber(process.env.RAG_CHUNK_SIZE, 500),
chunkOverlap: parseNumber(process.env.RAG_CHUNK_OVERLAP, 1)
```

**Trade-offs por tamaño:**

| Tamaño | Ventajas | Desventajas |
|--------|----------|-------------|
| **300-500** (Pequeño) | • Precision alta<br>• Búsquedas rápidas<br>• Menos tokens al LLM | • Puede fragmentar ideas<br>• Menos contexto |
| **600-1000** (Mediano) | • Balance ideal<br>• Contexto completo<br>• Ideas no fragmentadas | • Más lento con muchos docs |
| **1000-2000** (Grande) | • Máximo contexto<br>• Ideas complejas | • Similitud menos precisa<br>• Tokens LLM altos |

**Recomendación según hardware:**
```bash
# Hardware limitado (config/index.js:119)
RAG_CHUNK_SIZE=600
RAG_TOP_K=3
OLLAMA_TIMEOUT=200000  # 3.3 minutos

# Hardware potente
RAG_CHUNK_SIZE=1000
RAG_TOP_K=5
OLLAMA_TIMEOUT=120000  # 2 minutos
```

**Validación automática:**
```javascript
// config/index.js:118-124
if (config.rag.chunkSize < 100) {
  errors.push('Chunk size muy pequeño. Mínimo: 100');
}
if (config.rag.chunkSize > 2000) {
  console.warn('Chunk size grande. Puede afectar performance.');
}
```

---

## ⚙️ Configuración y Optimización

### ¿Qué hace cada parámetro RAG en el .env?

**Respuesta:**

**Parámetros críticos (config/index.js:74-80):**

```env
# Tamaño de cada chunk en caracteres
RAG_CHUNK_SIZE=800
# Más alto = más contexto pero búsquedas más lentas

# Número de oraciones que se repiten entre chunks
RAG_CHUNK_OVERLAP=2
# Overlap 0 = sin repetición (puede cortar contexto)
# Overlap 1-3 = contexto continuo (recomendado)

# Número de chunks más relevantes a recuperar
RAG_TOP_K=3
# Más alto = más contexto pero más ruido potencial
# Validación: debe ser >= 1 y <= 10

# Umbral mínimo de similitud (0-1)
RAG_SIMILARITY_THRESHOLD=0.2
# 0.5-1.0 = Solo matches muy similares (restrictivo)
# 0.2-0.4 = Permite matches relacionados (recomendado)
# 0.0-0.2 = Acepta casi todo (poco útil)

# Solo responde con información de documentos
RAG_STRICT_MODE=true
# true = No inventa, solo usa docs (recomendado)
# false = Puede usar conocimiento del LLM
```

**Impacto en performance:**
```javascript
// Búsqueda en vectorStore.js:181-217
searchSimilar(queryEmbedding, topK, similarityThreshold) {
  // 1. Lee TODOS los documentos de SQLite
  // 2. Calcula similitud de cada uno (O(n))
  // 3. Filtra por threshold
  // 4. Ordena y retorna Top-K
}
```

---

### ¿Cómo optimizar para un dataset grande (>10K documentos)?

**Respuesta:**

**Estrategias implementables:**

**1. Ajustar configuración de SQLite:**
```javascript
// Agregar en vectorStore.js:12-15
this.db.pragma('cache_size = -128000');  // 128MB caché
this.db.pragma('mmap_size = 268435456'); // 256MB mmap
this.db.pragma('page_size = 8192');      // Páginas grandes
```

**2. Implementar filtrado por archivo:**
```javascript
// Ya implementado en vectorStore.js:186-189
searchSimilar(queryEmbedding, topK, threshold, filenameFilter) {
  // Si se pasa filenameFilter, solo busca en ese archivo
  // Reduce dramáticamente el espacio de búsqueda
}
```

**3. Usar índices compuestos:**
```sql
-- Agregar en initTables()
CREATE INDEX idx_filename_similarity ON documents(filename, created_at);
```

**4. Limitar scope de búsqueda:**
```javascript
// En ragService.js, agregar opción de filtro
const topDocs = vectorStore.searchSimilar(
  queryEmbedding,
  topK,
  threshold,
  req.query.document // Filtrar por documento específico
);
```

**5. Migrar a base vectorial para >100K docs:**
- Considerar Qdrant (también puede ser local)
- O PostgreSQL con extensión pgvector
- Mantiene el concepto de privacidad local

---

## 🔐 Seguridad

### ¿Cómo funciona la autenticación?

**Respuesta:**

**Sistema implementado (authService.js + middleware/auth.js):**

**1. Hashing de contraseñas:**
```javascript
// services/authService.js
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;  // 2^10 = 1024 iteraciones

// Al crear usuario
const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

// Al hacer login
const valid = await bcrypt.compare(password, user.password_hash);
```

**2. Sesiones basadas en cookies:**
```javascript
// server.js:121-125
res.cookie('sessionId', sessionId, {
  httpOnly: true,            // No accesible desde JavaScript
  maxAge: 24 * 60 * 60 * 1000,  // 24 horas
  sameSite: 'strict'         // Solo same-origin
});
```

**3. Middleware de autorización:**
```javascript
// middleware/auth.js

// requireAuth: Requiere sesión válida
app.post('/api/query', requireAuth(authService), ...)

// requireAdmin: Requiere sesión + rol admin
app.post('/api/upload-pdf', requireAuth(authService), requireAdmin, ...)

// optionalAuth: Permite ambos (logged in o anónimo)
app.get('/api/auth/session', optionalAuth(authService), ...)
```

**4. Rutas públicas vs privadas:**
```javascript
// Públicas (sin autenticación)
POST /api/public/query
POST /api/public/query-stream

// Autenticadas (requiere login)
POST /api/query
POST /api/query-stream
GET  /api/chat/history

// Admin only (requiere login + rol admin)
POST   /api/upload-pdf
DELETE /api/documents/:filename
GET    /api/users
```

**5. Limpieza automática de sesiones:**
```javascript
// services/authService.js
startSessionCleaner() {
  setInterval(() => {
    this.cleanExpiredSessions();
  }, 60 * 60 * 1000); // Cada hora
}
```

---

### ¿Es seguro para datos sensibles?

**Respuesta:**

**Características de privacidad:**

✅ **Ventajas:**
1. **100% Local**: Ningún dato sale de tu servidor
2. **Sin APIs externas**: No hay llamadas a OpenAI, Anthropic, etc.
3. **Control total**: Tú manejas la base de datos
4. **Cumplimiento GDPR**: Los datos nunca salen de tu infraestructura
5. **Bcrypt**: Contraseñas hasheadas de forma segura

⚠️ **Consideraciones adicionales recomendadas:**

**1. Encriptar base de datos en reposo:**
```bash
# Usar SQLCipher en lugar de SQLite
npm install better-sqlite3-with-sqlcipher

# En vectorStore.js
this.db.pragma('key = "tu-clave-encriptacion"');
```

**2. Encriptar embeddings sensibles:**
```javascript
// Antes de guardar en vectorStore
const encryptedEmbedding = encrypt(
  JSON.stringify(embedding),
  process.env.ENCRYPTION_KEY
);
```

**3. HTTPS obligatorio en producción:**
```javascript
// Agregar en server.js
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem')
};

https.createServer(options, app).listen(443);
```

**4. Rate limiting implementado:**
```javascript
// config/index.js:90-93
rateLimit: {
  max: parseNumber(process.env.RATE_LIMIT_MAX, 100),
  windowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000)
}
```

**5. Validación de input:**
```javascript
// middleware/validation.js
- Valida tipo de archivo (solo PDF)
- Sanitiza nombres de archivo
- Valida tamaño de query
- Previene inyección SQL (prepared statements)
```

---

## 🚀 Performance y Escalabilidad

### ¿Cuánto tarda en procesar un PDF?

**Respuesta:**

**Tiempos medidos (hardware: CPU 4 cores, 8GB RAM):**

**Pipeline completo (documentProcessor.js):**
```
1. Extracción PDF (pdf-parse):     ~1-3 segundos
2. Chunking semántico:             ~0.1 segundos
3. Generación de embeddings:       ~0.5-2 seg por chunk
4. Almacenamiento SQLite:          ~0.01 segundos (batch)
```

**Ejemplo real:**
- **PDF de 20 páginas** → 50 chunks
- 50 chunks × 1.5 seg = **75 segundos** (1.3 minutos)

**Ejemplo grande:**
- **PDF de 200 páginas** → 500 chunks
- 500 chunks × 1.5 seg = **750 segundos** (12.5 minutos)

**Factor crítico: Velocidad de Ollama**
```javascript
// embeddingService.js - llamada síncrona
for (let i = 0; i < chunks.length; i++) {
  const embedding = await generateEmbedding(chunk.text);
  // ☝️ Este await es el cuello de botella
}
```

**Optimización posible (paralelización):**
```javascript
// Procesar 5 chunks a la vez
const BATCH_SIZE = 5;
for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batch = chunks.slice(i, i + BATCH_SIZE);
  const embeddings = await Promise.all(
    batch.map(chunk => generateEmbedding(chunk.text))
  );
}
// Reduce tiempo a ~1/5
```

---

### ¿Cuánto tarda en responder una query?

**Respuesta:**

**Tiempos desglosados (ragService.js):**

```
1. Embedding de query (nomic-embed-text):  ~0.5-1 segundo
2. Búsqueda en VectorStore:                ~0.1-2 segundos*
3. Generación LLM (mistral):               ~5-15 segundos**

Total: ~6-18 segundos
```

*Depende del número de documentos en SQLite:
- 100 chunks: ~0.1 seg
- 10,000 chunks: ~1 seg
- 100,000 chunks: ~5 seg

**Depende de la complejidad de la respuesta:
- Respuesta corta (50 tokens): ~5 seg
- Respuesta mediana (200 tokens): ~10 seg
- Respuesta larga (500 tokens): ~15-20 seg

**Código de timeout configurado:**
```javascript
// config/index.js:70
timeout: parseNumber(process.env.OLLAMA_TIMEOUT, 120000) // 2 minutos
```

**Streaming para mejor UX:**
```javascript
// ragService.js:88-101
// En lugar de esperar 15 segundos para la respuesta completa,
// el usuario ve tokens en tiempo real (SSE)
response.data.on('data', (chunk) => {
  res.write(`data: ${JSON.stringify({
    type: 'token',
    content: json.response
  })}\n\n`);
});
```

---

## 🧩 Ollama y Modelos

### ¿Cómo controlar la temperatura para evitar alucinaciones?

**Respuesta:**

El proyecto **sí permite configurar la temperatura** y otros parámetros del LLM para controlar alucinaciones.

**Parámetros configurables en .env:**

```env
# Temperatura (0.0-2.0) - Controla aleatoriedad
OLLAMA_TEMPERATURE=0.1  # Recomendado para RAG

# Top P - Nucleus sampling (0.0-1.0)
OLLAMA_TOP_P=0.9

# Top K - Limita vocabulario
OLLAMA_TOP_K=40
```

**Implementación (embeddingService.js:57-61, 86-90):**
```javascript
const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
  model: LLM_MODEL,
  prompt: prompt,
  stream: true,
  options: {
    temperature: TEMPERATURE,  // ← Controla aleatoriedad
    top_p: TOP_P,             // ← Nucleus sampling
    top_k: TOP_K              // ← Limita vocabulario
  }
});
```

**Efecto de la temperatura:**

| Temperatura | Comportamiento | Uso | Alucinaciones |
|-------------|----------------|-----|---------------|
| **0.0** | Completamente determinista | Respuestas idénticas siempre | ✅ Casi nulas |
| **0.1** | Muy conservador | **RAG (recomendado)** | ✅ Muy pocas |
| **0.3** | Ligeramente variable | RAG con algo de variación | ⚠️ Bajas |
| **0.5** | Balanceado | Chatbots generales | ⚠️ Moderadas |
| **0.8** | Creativo | Generación de contenido | ❌ Altas |
| **1.0+** | Muy aleatorio | Escritura creativa | ❌ Muy altas |

**Comparación práctica:**

**Con temperatura 0.8 (sin configurar - valor por defecto):**
```
Pregunta: ¿Cuál es el horario de atención?
Contexto: "Lunes a viernes 9am-5pm"
Respuesta: "El horario es de lunes a viernes de 9am a 5pm.
También puedes escribirnos por email en cualquier momento y
te responderemos dentro de 24 horas."
← ❌ ALUCINACIÓN: El email no está en el contexto
```

**Con temperatura 0.1 (configurado):**
```
Pregunta: ¿Cuál es el horario de atención?
Contexto: "Lunes a viernes 9am-5pm"
Respuesta: "El horario de atención es de lunes a viernes
de 9 am a 5 pm."
← ✅ CORRECTO: Solo usa información del contexto
```

**Top P (Nucleus Sampling):**
- `0.9` = Considera solo tokens cuya probabilidad acumulada alcanza 90%
- Elimina opciones improbables
- Reduce "palabras inventadas"

**Top K:**
- `40` = Solo considera los 40 tokens más probables
- Evita tokens raros o improbables
- Mejora coherencia

**Configuración óptima anti-alucinaciones:**
```env
OLLAMA_TEMPERATURE=0.1    # Muy bajo
OLLAMA_TOP_P=0.9          # Alto (90%)
OLLAMA_TOP_K=40           # Moderado
RAG_STRICT_MODE=true      # ← Combinado con esto
```

**Verificar configuración activa:**
```bash
# Al iniciar el servidor, verás:
⚙️  Configuración del sistema:
   Ollama:
      Temperature: 0.1
      Top-P: 0.9
      Top-K: 40
```

---

### ¿Por qué usar Ollama y no la API de OpenAI?

**Respuesta:**

**Comparación:**

| Aspecto | Ollama (Local) | OpenAI API |
|---------|----------------|------------|
| **Privacidad** | ✅ 100% local, datos no salen | ❌ Datos se envían a OpenAI |
| **Costo** | ✅ Gratis (solo hardware) | ❌ $0.0001-0.03 por 1K tokens |
| **Latencia** | ⚠️ Depende de tu hardware | ✅ ~1-3 segundos |
| **Disponibilidad** | ✅ Offline | ❌ Requiere internet |
| **Calidad** | ⚠️ Buena (pero no GPT-4) | ✅ Excelente (GPT-4) |
| **Escalabilidad** | ❌ Limitada por hardware | ✅ Ilimitada |

**Caso de uso ideal para Ollama:**
- Documentos confidenciales (médicos, legales, financieros)
- Cumplimiento regulatorio (GDPR, HIPAA)
- Costos predecibles (no por uso)
- Prototipado sin gastar

**Código de integración (embeddingService.js):**
```javascript
const OLLAMA_URL = 'http://localhost:11434';

// Embeddings
POST ${OLLAMA_URL}/api/embeddings
Body: { model: 'nomic-embed-text', prompt: text }

// Generación
POST ${OLLAMA_URL}/api/generate
Body: { model: 'mistral', prompt: prompt, stream: true }
```

---

### ¿Se pueden usar otros modelos de Ollama?

**Respuesta:**

**Sí, totalmente configurable en .env:**

```bash
# Modelos de embeddings disponibles
OLLAMA_EMBED_MODEL=nomic-embed-text    # Recomendado (274MB, 768 dim)
# Alternativas:
# - mxbai-embed-large (669MB, 1024 dim)
# - all-minilm (46MB, 384 dim) - más rápido, menos preciso

# Modelos LLM disponibles
OLLAMA_LLM_MODEL=mistral               # Recomendado (4.1GB)
# Alternativas:
# - llama3 (4.7GB) - mejor para español
# - phi3 (2.3GB) - más rápido, menos capaz
# - mixtral (26GB) - más potente, requiere GPU
```

**Trade-offs por modelo:**

**Embeddings:**
| Modelo | Tamaño | Dimensiones | Velocidad | Calidad |
|--------|--------|-------------|-----------|---------|
| all-minilm | 46MB | 384 | ⚡⚡⚡ | ⭐⭐ |
| nomic-embed-text | 274MB | 768 | ⚡⚡ | ⭐⭐⭐⭐ |
| mxbai-embed-large | 669MB | 1024 | ⚡ | ⭐⭐⭐⭐⭐ |

**LLM:**
| Modelo | Tamaño | Parámetros | Hardware | Calidad |
|--------|--------|------------|----------|---------|
| phi3 | 2.3GB | 3.8B | CPU 8GB | ⭐⭐⭐ |
| mistral | 4.1GB | 7B | CPU 16GB | ⭐⭐⭐⭐ |
| llama3 | 4.7GB | 8B | CPU 16GB | ⭐⭐⭐⭐ |
| mixtral | 26GB | 8x7B | GPU 24GB | ⭐⭐⭐⭐⭐ |

**Cambiar modelo sin código:**
```bash
# Descargar modelo alternativo
ollama pull llama3

# Actualizar .env
OLLAMA_LLM_MODEL=llama3

# Reiniciar servidor
npm start
```

**IMPORTANTE**: Si cambias el modelo de embeddings, **debes reprocesar todos los PDFs** porque las dimensiones cambian.

---

## 🛠️ Troubleshooting

### Error: "Timeout al generar respuesta"

**Causa raíz:**
```javascript
// embeddingService.js
axios.post(OLLAMA_URL, payload, {
  timeout: OLLAMA_TIMEOUT  // Default: 120000ms (2 min)
})
```

**Escenarios:**
1. **Hardware lento**: CPU débil, sin GPU
2. **TOP_K muy alto**: Muchos chunks → mucho contexto → LLM lento
3. **Modelo grande**: mixtral en CPU

**Soluciones:**

**1. Aumentar timeout:**
```env
OLLAMA_TIMEOUT=300000  # 5 minutos
```

**2. Reducir contexto:**
```env
RAG_TOP_K=3            # Menos chunks
RAG_CHUNK_SIZE=600     # Chunks más pequeños
```

**3. Cambiar a modelo más rápido:**
```bash
ollama pull phi3
OLLAMA_LLM_MODEL=phi3
```

**4. Verificar que Ollama esté corriendo:**
```bash
curl http://localhost:11434/api/tags
# Si no responde: ollama serve
```

---

### Error: "No encontré esta información en los documentos"

**Causa raíz:**
```javascript
// ragService.js:29-31
if (topDocs.length === 0) {
  throw new Error('No encontré documentos relevantes...');
}
```

**Posibles razones:**

**1. Umbral de similitud muy alto:**
```env
RAG_SIMILARITY_THRESHOLD=0.7  # Demasiado restrictivo
# Cambiar a:
RAG_SIMILARITY_THRESHOLD=0.2
```

**2. Chunks mal cortados:**
```bash
# Ver chunks de un documento
sqlite3 data/vectors.db "SELECT text FROM documents WHERE filename='archivo.pdf' LIMIT 5;"
```

**3. Embedding model no adecuado:**
```bash
# Probar con modelo más grande
ollama pull mxbai-embed-large
OLLAMA_EMBED_MODEL=mxbai-embed-large
# Reprocesar PDFs
```

**4. Pregunta en diferente idioma:**
```javascript
// Los embeddings son sensibles al idioma
// PDF en inglés + pregunta en español = baja similitud
```

**Debug de similitudes:**
```javascript
// Agregar logging en ragService.js:27-33
console.log('Top docs:', topDocs.map(d => ({
  similarity: d.similarity,
  text: d.text.substring(0, 100)
})));
```

---

### Las respuestas son "creativas" (inventa información)

**Causa:**
```javascript
// prompts/ragPrompts.js
// Strict mode desactivado permite al LLM usar su conocimiento
```

**Solución:**
```env
RAG_STRICT_MODE=true  # ← DEBE estar en true
```

**Verificar configuración:**
```bash
curl http://localhost:3000/api/config
# Debe retornar: { strictMode: true, ... }
```

**Prompt en modo estricto:**
```javascript
// prompts/ragPrompts.js
if (strict) {
  prompt += `
IMPORTANTE: Solo puedes responder basándote en el contexto anterior.
Si la información no está en el contexto, responde exactamente:
"No encontré esta información en los documentos disponibles."

NO inventes, NO uses tu conocimiento general, SOLO usa el contexto.
  `;
}
```

---

## 📈 Métricas y Monitoreo

### ¿Cómo ver estadísticas de los documentos?

**Respuesta:**

**Endpoint disponible:**
```bash
GET /api/documents
Authorization: Cookie sessionId=xxx

Response:
{
  "documents": [
    {"filename": "manual.pdf", "chunks": 87},
    {"filename": "guia.pdf", "chunks": 43}
  ],
  "total_chunks": 130
}
```

**Código (vectorStore.js:238-259):**
```javascript
getDocumentStats() {
  const stats = this.db.prepare(`
    SELECT filename, COUNT(*) as count
    FROM documents
    GROUP BY filename
  `).all();

  const total = this.db.prepare(
    'SELECT COUNT(*) as total FROM documents'
  ).get().total;

  return {
    totalDocuments: total,
    files: { 'archivo.pdf': 50, ... }
  };
}
```

**Queries SQL útiles:**
```bash
# Tamaño de la base de datos
du -h data/vectors.db

# Documentos procesados
sqlite3 data/vectors.db "SELECT DISTINCT filename FROM documents;"

# Chunks por documento
sqlite3 data/vectors.db "
  SELECT filename, COUNT(*) as chunks
  FROM documents
  GROUP BY filename
  ORDER BY chunks DESC;
"

# Total de chunks
sqlite3 data/vectors.db "SELECT COUNT(*) FROM documents;"

# Tamaño promedio de texto por chunk
sqlite3 data/vectors.db "SELECT AVG(LENGTH(text)) FROM documents;"
```

---

### ¿Cómo monitorear el rendimiento en producción?

**Respuesta:**

**Actualmente el código tiene logs básicos:**
```javascript
// documentProcessor.js:20-35
console.log(`📄 Procesando PDF: ${filename}`);
console.log(`✓ Texto extraído: ${length} caracteres`);
console.log(`✓ Dividido en ${chunks.length} chunks`);
process.stdout.write(`\r⏳ Generando embeddings... ${i}/${total}`);
```

**Mejoras recomendadas:**

**1. Agregar middleware de timing:**
```javascript
// middleware/performance.js
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${duration}ms`);
  });
  next();
});
```

**2. Logging estructurado (Winston):**
```javascript
const winston = require('winston');
const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'rag.log' })
  ]
});

logger.info('Query executed', {
  query: query,
  resultsCount: topDocs.length,
  avgSimilarity: avg,
  duration: duration
});
```

**3. Métricas con Prometheus:**
```javascript
const client = require('prom-client');

const queryDuration = new client.Histogram({
  name: 'rag_query_duration_seconds',
  help: 'Duration of RAG queries'
});

const queriesTotal = new client.Counter({
  name: 'rag_queries_total',
  help: 'Total number of queries'
});
```

---

## 🔧 Arquitectura y Código

### ¿Por qué separar los servicios en módulos?

**Respuesta:**

**Estructura modular implementada:**
```
services/
├── authService.js         # Autenticación y sesiones
├── chunking.js            # Lógica de división de texto
├── documentProcessor.js   # Pipeline de procesamiento
├── embeddingService.js    # Comunicación con Ollama
├── pdfProcessor.js        # Extracción de PDF
├── ragService.js          # Lógica RAG
├── responseFormatter.js   # Formato de respuestas
├── userDatabase.js        # CRUD de usuarios
└── vectorStore.js         # Almacenamiento vectorial
```

**Principios aplicados:**

**1. Separation of Concerns**
```javascript
// server.js solo maneja routing
app.post('/api/query', requireAuth, async (req, res) => {
  const topDocs = await performRAGSearch(...);  // ← ragService
  const response = await generateRAGResponse(...); // ← ragService
});
```

**2. Single Responsibility**
```javascript
// vectorStore.js solo maneja persistencia
class VectorStore {
  insertChunk() { ... }
  searchSimilar() { ... }
  // NO tiene lógica de embeddings o PDFs
}
```

**3. Dependency Injection**
```javascript
// server.js
const vectorStore = new VectorStore(dbPath);
const authService = new AuthService(usersDbPath);

// Se inyectan en middleware
app.post('/api/query', requireAuth(authService), ...);
```

**4. Testabilidad**
```javascript
// Fácil de testear en aislamiento
const { splitIntoSemanticChunks } = require('./chunking');

test('should split text into chunks', () => {
  const chunks = splitIntoSemanticChunks('Hello. World.', 10);
  expect(chunks).toHaveLength(2);
});
```

---

### ¿Cómo funciona el streaming de respuestas?

**Respuesta:**

**Tecnología: Server-Sent Events (SSE)**

**1. Cliente abre conexión persistente:**
```javascript
// Frontend (public/chat.html o similar)
const eventSource = new EventSource('/api/query-stream', {
  method: 'POST',
  body: JSON.stringify({ query: '...' })
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'token') {
    appendToChat(data.content);  // Agrega token en tiempo real
  }
};
```

**2. Servidor configura SSE:**
```javascript
// server.js:348-351
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.flushHeaders();
```

**3. Ollama genera streaming:**
```javascript
// embeddingService.js
axios.post('http://localhost:11434/api/generate', {
  model: 'mistral',
  prompt: prompt,
  stream: true  // ← Clave para streaming
}, {
  responseType: 'stream'
});

return response.data;  // Retorna ReadableStream
```

**4. Relay de tokens:**
```javascript
// ragService.js:88-116
response.data.on('data', (chunk) => {
  const lines = chunk.toString().split('\n');

  for (const line of lines) {
    const json = JSON.parse(line);

    if (json.response) {
      // Enviar token inmediatamente al cliente
      res.write(`data: ${JSON.stringify({
        type: 'token',
        content: json.response
      })}\n\n`);
    }

    if (json.done) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});
```

**Flujo completo:**
```
Usuario → POST /api/query-stream
    ↓
Server abre SSE
    ↓
Server → Ollama (stream: true)
    ↓
Ollama genera token "La" → Server → Cliente (actualiza UI)
    ↓
Ollama genera token " respuesta" → Server → Cliente
    ↓
... (continúa token por token)
    ↓
Ollama genera done: true → Server cierra stream
```

**Ventaja:** UX superior, usuario no espera 15 segundos en blanco

---

## 🎯 Comparación con Otras Soluciones

### ¿Cómo se compara con LangChain?

| Aspecto | Este Proyecto | LangChain |
|---------|---------------|-----------|
| **Complejidad** | ✅ Simple, ~2000 líneas | ⚠️ Complejo, muchas abstracciones |
| **Dependencias** | ✅ 9 packages | ⚠️ 50+ packages |
| **Curva aprendizaje** | ✅ Código directo | ⚠️ API compleja |
| **Flexibilidad** | ✅ Control total | ⚠️ Limitado a abstracciones |
| **Performance** | ✅ Sin overhead | ⚠️ Capas extra de abstracción |
| **Debugging** | ✅ Stack traces claros | ⚠️ Difícil seguir el flujo |
| **Features** | ⚠️ RAG básico | ✅ Agentes, memory, tools, etc |

**Conclusión**: Este proyecto es ideal para aprender RAG desde cero y tener control total. LangChain es mejor para prototipos complejos rápidos.

---

### ¿Cómo se compara con Pinecone + OpenAI?

| Aspecto | SQLite + Ollama | Pinecone + OpenAI |
|---------|----------------|-------------------|
| **Privacidad** | ✅ 100% local | ❌ Datos en la nube |
| **Costo mensual** | ✅ $0 | ⚠️ ~$70-200/mes |
| **Setup** | ✅ npm install | ⚠️ Cuentas, APIs, billing |
| **Escalabilidad** | ⚠️ ~10K docs | ✅ Millones de docs |
| **Latencia query** | ⚠️ 6-18 seg | ✅ 1-3 seg |
| **Calidad embeddings** | ⚠️ Buena | ✅ Excelente |
| **Calidad respuestas** | ⚠️ Buena | ✅ GPT-4 nivel |
| **Offline** | ✅ Funciona sin internet | ❌ Requiere internet |

**Recomendación:**
- **Local**: Documentos sensibles, presupuesto ajustado, <10K docs
- **Cloud**: Producción a escala, mejor calidad, SLA garantizado

---

## ✅ Conclusión

Este documento cubre las preguntas técnicas más comunes. Para preguntas adicionales:

- **Código fuente**: Revisar comentarios en los archivos
- **Logs**: Ejecutar con `NODE_ENV=development` para ver logs detallados
- **Debugging**: Usar `console.log` en cualquier servicio
- **Issues**: Reportar en el repositorio

**Contacto del proyecto:**
- Repositorio: https://github.com/alejandro-urbina-rasi/Chat-RAG-Local
