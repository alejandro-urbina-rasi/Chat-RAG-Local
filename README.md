# Agente Local RAG 🤖📄

Sistema de **RAG (Retrieval-Augmented Generation)** local que permite hacer preguntas sobre documentos PDF utilizando embeddings y búsqueda semántica. Incluye autenticación, chat en tiempo real con streaming, y panel de administración para gestionar documentos.

## 🌟 Características

- **RAG (Retrieval-Augmented Generation)**: Responde preguntas basándose únicamente en el contenido de tus documentos
- **Búsqueda Semántica**: Utiliza embeddings vectoriales para encontrar información relevante
- **Procesamiento de PDFs**: Extrae, divide y vectoriza automáticamente documentos PDF
- **Chat con Streaming**: Respuestas en tiempo real con streaming de tokens
- **Modo Estricto**: Previene respuestas creativas, solo usa información de los documentos
- **Autenticación**: Sistema de login seguro con bcrypt
- **Panel de Administración**: Gestiona documentos y visualiza estadísticas
- **Chat Público**: Interfaz sin autenticación para consultas rápidas
- **100% Local**: No envía datos a servicios externos, todo corre en tu máquina

## 🏗️ Arquitectura

```
┌─────────────────┐
│   Frontend      │
│  (HTML/CSS/JS)  │
└────────┬────────┘
         │
┌────────▼────────────────────────────────────┐
│           Express Server                    │
│  ┌────────────────────────────────────┐    │
│  │  Middleware                        │    │
│  │  - Auth, Validation, Error Handler │    │
│  └────────────────────────────────────┘    │
│  ┌────────────────────────────────────┐    │
│  │  Services                          │    │
│  │  - RAG, Embeddings, PDF Processor  │    │
│  └────────────────────────────────────┘    │
└────────┬───────────────────┬────────────────┘
         │                   │
┌────────▼────────┐   ┌─────▼──────────┐
│  SQLite DBs     │   │  Ollama API    │
│  - users.db     │   │  - Embeddings  │
│  - vectors.db   │   │  - LLM         │
└─────────────────┘   └────────────────┘
```

## 📋 Requisitos Previos

- **Node.js** v18 o superior
- **Ollama** instalado y corriendo
- **Modelos de Ollama**:
  - `nomic-embed-text` (embeddings, 274MB)
  - `mistral` (LLM para respuestas)

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/alejandro-urbina-rasi/Chat-RAG-Local.git
cd Chat-RAG-Local
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Instalar Ollama y modelos

```bash
# Instalar Ollama (si no lo tienes)
curl -fsSL https://ollama.ai/install.sh | sh

# Descargar modelos necesarios
ollama pull nomic-embed-text
ollama pull mistral

# Verificar que Ollama está corriendo
ollama list
```

### 4. Configurar variables de entorno

```bash
# Copiar el archivo de ejemplo
cp .env.example .env

# Editar .env con tu configuración
nano .env
```

Configuración mínima requerida:

```env
PORT=3000
NODE_ENV=development

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_LLM_MODEL=mistral
OLLAMA_TIMEOUT=200000

RAG_CHUNK_SIZE=800
RAG_CHUNK_OVERLAP=2
RAG_TOP_K=3
RAG_SIMILARITY_THRESHOLD=0.2
RAG_STRICT_MODE=true

ADMIN_PASSWORD=tu_contraseña_segura
```

### 5. Iniciar el servidor

```bash
# Producción
npm start

# Desarrollo
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

## 📖 Uso

### Panel de Administrador

1. Accede a `http://localhost:3000/login.html`
2. Inicia sesión con:
   - Usuario: `admin`
   - Contraseña: La que configuraste en `ADMIN_PASSWORD`

3. Desde el panel puedes:
   - Subir documentos PDF
   - Ver documentos cargados y sus chunks
   - Eliminar documentos
   - Hacer consultas en el chat

### Chat Público

Accede a `http://localhost:3000/public-chat.html` para usar el chat sin autenticación.

### API Endpoints

#### Autenticación

- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/logout` - Cerrar sesión
- `GET /api/auth/session` - Verificar sesión actual

#### Documentos (requiere autenticación de admin)

- `POST /api/upload-pdf` - Subir y procesar PDF
- `GET /api/documents` - Listar documentos cargados
- `DELETE /api/documents/:filename` - Eliminar documento

#### Consultas

- `POST /api/query` - Consulta con respuesta completa
- `POST /api/query-stream` - Consulta con streaming (SSE)

## ⚙️ Configuración

### Parámetros RAG

El archivo `.env` permite ajustar el comportamiento del sistema RAG:

| Parámetro | Valor Recomendado | Descripción |
|-----------|-------------------|-------------|
| `RAG_CHUNK_SIZE` | 800 | Tamaño de chunks en caracteres |
| `RAG_CHUNK_OVERLAP` | 2 | Oraciones que se repiten entre chunks |
| `RAG_TOP_K` | 3 | Número de chunks más relevantes a recuperar |
| `RAG_SIMILARITY_THRESHOLD` | 0.2 | Umbral mínimo de similitud (0-1) |
| `RAG_STRICT_MODE` | true | Solo responde con info de documentos |

### Optimización para Hardware Limitado

Si experimentas timeouts o lentitud:

```env
RAG_CHUNK_SIZE=600          # Reduce el tamaño de chunks
RAG_TOP_K=3                 # Mantén TOP_K bajo
OLLAMA_TIMEOUT=200000       # 3.3 minutos de timeout
```

### Optimización para Hardware Potente

Si tienes buen hardware:

```env
RAG_CHUNK_SIZE=1000         # Chunks más grandes, mejor contexto
RAG_TOP_K=5                 # Más resultados, mejor recall
OLLAMA_TIMEOUT=120000       # 2 minutos suficientes
```

## 🔧 Estructura del Proyecto

```
.
├── config/                 # Configuración centralizada
│   └── index.js
├── data/                   # Bases de datos SQLite
│   ├── users.db
│   └── vectors.db
├── middleware/             # Middleware Express
│   ├── auth.js
│   ├── errorHandler.js
│   └── validation.js
├── prompts/                # Prompts del sistema
│   └── ragPrompts.js
├── public/                 # Frontend (HTML/CSS/JS)
│   ├── chat.html
│   ├── login.html
│   ├── public-chat.html
│   └── upload.html
├── services/               # Lógica de negocio
│   ├── authService.js
│   ├── chunking.js
│   ├── documentProcessor.js
│   ├── embeddingService.js
│   ├── pdfProcessor.js
│   ├── ragService.js
│   ├── responseFormatter.js
│   ├── userDatabase.js
│   └── vectorStore.js
├── uploads/                # PDFs subidos
├── .env                    # Variables de entorno (no incluido)
├── .env.example            # Ejemplo de configuración
├── package.json
└── server.js               # Punto de entrada
```

## 🧠 Cómo Funciona el RAG

1. **Upload de PDF**: El usuario sube un PDF
2. **Extracción**: Se extrae el texto con `pdf-parse`
3. **Chunking**: El texto se divide en chunks semánticos (por oraciones)
4. **Embeddings**: Cada chunk se convierte en un vector de 768 dimensiones usando `nomic-embed-text`
5. **Almacenamiento**: Los vectores se guardan en SQLite con `better-sqlite3`
6. **Consulta**: Cuando el usuario hace una pregunta:
   - Se genera el embedding de la pregunta
   - Se buscan los TOP_K chunks más similares (cosine similarity)
   - Se filtran por umbral de similitud
   - Se envían al LLM como contexto
7. **Respuesta**: El LLM genera una respuesta basada solo en el contexto

## 🐛 Troubleshooting

### Error: "Timeout al generar respuesta"

**Causa**: Hardware limitado o TOP_K muy alto

**Solución**:
```env
RAG_TOP_K=3
OLLAMA_TIMEOUT=200000
```

### Error: "No encontré esta información"

**Causa**: Umbral de similitud muy alto o chunks cortados incorrectamente

**Solución**:
```env
RAG_SIMILARITY_THRESHOLD=0.2
RAG_CHUNK_SIZE=800
```

### Duplicados en la base de datos

**Solución**: Ejecutar limpieza manual

```bash
sqlite3 data/vectors.db "DELETE FROM documents WHERE id NOT IN (SELECT MIN(id) FROM documents GROUP BY text)"
sqlite3 data/vectors.db "VACUUM"
```

### Respuestas creativas en modo estricto

**Causa**: El prompt no es suficientemente restrictivo

**Solución**: Verificar que `RAG_STRICT_MODE=true` en `.env`

## 🔐 Seguridad

- Las contraseñas se hashean con bcrypt (10 rondas)
- Las sesiones usan cookies HTTP-only
- Validación de entrada en todos los endpoints
- Sanitización de nombres de archivo
- Rate limiting (configurable)
- CORS configurable

