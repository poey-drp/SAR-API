# SAR Engine Manager & API Service

A standalone, single-user SAR system that allows users to upload documents, automatically extract them into FAQ pairs using an LLM as a language expert or a cleaned rule-based approach, review/edit the extraction in a modular Admin UI, ingest them into Qdrant, and query them using a highly-optimized hybrid dense-sparse SAR pipeline.

---

## System Components

1. **FastAPI Backend (`backend/`)**: 
   - Manages text extraction (with page numbers) from uploaded files.
   - Generates customizable LLM FAQs (by language and count) or cleans rule-based extractions with an LLM for grammar, context, and formatting.
   - Calculates OpenAI API cost estimations dynamically.
   - Handles query expansion (paraphrasing questions x5 before embedding).
   - Manages Qdrant collection creation (dense + sparse configurations).
   - Serves dynamic query endpoints (`/api/v1/query/{collection_name}`) with tokenization, retrieval, and CrossEncoder reranking.
   - Automatically exports ingested FAQs to local CSV files for record-keeping.
   - Exposes a retrieval endpoint to fetch live FAQ samples directly from collections in Qdrant.

2. **Vue 3 Admin Frontend (`frontend/`)**: 
   - Provides a modular, senior-architected user interface.
   - **Ingestion Panel**: Drag-and-drop multi-document ingestion staging, settings configuration (language, question quantity), step-by-step sequential progress tracking, and interactive FAQ editing grid.
   - **Manual FAQ Additions**: Allows users to manually create new FAQ pairs on-the-fly before final vector database ingestion.
   - **System Dashboard**: Displays active collections, total FAQ points count, active statuses, and supports interactive clicking on collections to inspect live FAQ pairs stored inside Qdrant.
   - **API Playground**: Allows developers to test retrieval metrics, query terms, and inspect match types.

3. **Qdrant Vector Database**: Storing and retrieving collections in hybrid mode (OpenAI Embeddings + BM25 Sparse Embeddings).

---

## 1. Quick Start: Docker Deployment (Recommended)

The easiest way to run the entire SAR Engine Manager (Frontend, Backend, and Database) is using Docker Compose. This ensures a consistent environment and zero manual configuration for database connections.

### Local Deployment
1. **Clone the repository.**
2. **Create backend environment variables**:
   ```bash
   cp backend/.env.example backend/.env
   ```
   *Edit `backend/.env` and add your `OPENAI_API_KEY`.*
3. **Start the whole stack**:
   ```bash
   docker-compose up -d --build
   ```

### Remote VM / Server Deployment
When deploying to a remote host, the frontend (which builds statically in Docker and runs in the user's browser) needs to know where to find the API server.
1. **Create backend environment variables**:
   ```bash
   cp backend/.env.example backend/.env
   ```
   *Edit `backend/.env` and add your `OPENAI_API_KEY`.*
2. **Create frontend environment variables**:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
   *Edit `frontend/.env` and change `VITE_API_URL` to your remote server's public IP or domain name (e.g., `VITE_API_URL=http://your-server-ip:8000`).*
3. **Start the stack**:
   ```bash
   docker-compose up -d --build
   ```

Once running, you can access the services at:
- **Admin UI (Frontend)**: `http://localhost:80` (or `http://your-server-ip:80`)
- **API Documentation (Backend)**: `http://localhost:8000/docs` (or `http://your-server-ip:8000/docs`)
- **Qdrant DB**: `http://localhost:6335` (or `http://your-server-ip:6335`)

---

## 2. Local Development Setup (Manual)

If you prefer to run the services manually without Docker (e.g., for active development):

### Backend Setup
1. **Navigate to the backend folder**:
   ```bash
   cd backend
   ```
2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Set up `.env`**: Copy `.env.example` to `.env` and add your OpenAI key. For local dev, `QDRANT_URL=http://localhost:6335` is correct.
4. **Start the backend server**:
   ```bash
   python run.py
   ```

### Frontend Setup
1. **Navigate to the frontend folder**:
   ```bash
   cd frontend
   ```
2. **Install node dependencies**:
   ```bash
   npm install
   ```
3. **Set up `.env`**: Copy `.env.example` to `.env`. For local dev, `VITE_API_URL=http://localhost:8000` is correct.
4. **Start the Vite development server**:
   ```bash
   npm run dev
   ```

---

## 3. Ingestion Pipeline & API Endpoints

The FastAPI backend exposes the following endpoints for the Admin UI and external integrations:

### Document Ingestion & Staging
- `POST /api/v1/extract-faq`: Accepts an uploaded document (`.pdf`, `.docx`, `.txt`), parses its contents, and processes it through two parallel tracks:
  1. **LLM Generator**: Generates `num_questions` high-quality FAQ pairs in the chosen language.
  2. **Rule-based Parser**: Extracts structured headings/questions using deterministic patterns, then uses an LLM to clean up the grammar, formatting, and context.
- `POST /api/v1/collections/ingest`: Takes reviewed/approved FAQ pairs, expands the questions 5x (generating paraphrased variations for dense/sparse semantic coverage), indexes them in Qdrant, and exports a backup to a local CSV file.

### Collection Management
- `GET /api/v1/collections`: Lists all indexed database collections.
- `GET /api/v1/collections/stats`: Retrieves point counts and operational statuses for all collections.
- `POST /api/v1/collections/create`: Creates a new Qdrant collection configured with OpenAI dense vector parameters and BM25 sparse index parameters.
- `GET /api/v1/collections/{collection_name}/faqs`: Scrolls and fetches live FAQ records directly from Qdrant.
- `GET /api/v1/collections/export/{collection_name}`: Exports all vectors/FAQ data in the specified collection into a downloadable CSV file.

### Dynamic Querying
- `POST /api/v1/query/{collection_name}`: The primary external search API. Details on the pipeline logic are documented in Section 4.

---

## 4. Query SAR Pipeline Logic

When external systems call the dynamic endpoint:
`POST /api/v1/query/{collection_name}`

The backend runs the following precision search and synthesis stages:

1. **Multilingual Detection**:
   - The backend uses `langdetect` to identify the language of the incoming query (e.g., Thai or English).
   - It samples the database collection to identify the primary language of the indexed documents (cached for subsequent queries).
2. **Query Translation & Rewriting**:
   - If `chat_history` is provided, `gpt-4o-mini` rephrases the request to capture conversational context.
   - If the query language differs from the database language, it automatically translates the query to align with the database's language for maximum hybrid search accuracy.
3. **Language-specific Tokenization**:
   - If the search query contains Thai characters, it uses `PyThaiNLP` to tokenize the query with explicit spaces, enabling Qdrant's sparse index analyzer to match Thai terms effectively.
4. **Hybrid Search**:
   - Performs a dual-search on Qdrant:
     - **Dense Retrieval**: Calculates vector embeddings using `text-embedding-3-large`.
     - **Sparse Retrieval**: Uses BM25 keyword matching on tokenized text.
   - Combines results to return the top 5 candidates.
5. **Cross-Encoder Reranking**:
   - Reranks the retrieved candidates using `BAAI/bge-reranker-v2-m3` on CPU/GPU.
   - Normalizes reranker scores using a Sigmoid function to range between `[0.0, 1.0]` and retains the top 3 results.
6. **Score Thresholding & Response Synthesis**:
   - **Strong Match (`score >= 0.525`)**: Reranked documents provide a highly accurate answer. An LLM synthesizes a direct response in the **user's query language**.
   - **Related Match (`0.30 <= score < 0.525`)**: Reranked documents have related info. The LLM synthesizes an answer containing the relevant context in the **user's query language**.
   - **Weak Match (`score < 0.30`)**: Reranked documents are not matching.
     - If `allow_own_knowledge` is enabled, the LLM provides a general knowledge response labeled with a warning badge (`💡 ข้อมูลทั่วไปเบื้องต้น` / `💡 General Information`).
     - If disabled, returns a standard fallback message ("ข้อมูลนี้ไม่พบในฐานข้อมูล" / "This information was not found in the database").

---

## 5. Production & Security Considerations

Before deploying this system to a production environment, implement the following security enhancements:

1. **Add API Authentication**:
   Currently, all backend endpoints are fully open for ease of integration. Because endpoints trigger OpenAI models which incur financial costs, you should implement an API Key verification middleware (e.g., using FastAPI's `APIKeyHeader` or `HTTPBearer`) to secure the API from unauthorized access.
2. **Restrict CORS Origins**:
   The backend allows CORS requests from any origin (`allow_origins=["*"]`) to facilitate local frontend development. In production, modify `allow_origins` in `backend/app/main.py` to only allow the domain names of your authorized web client applications.
