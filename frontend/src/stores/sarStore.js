import { defineStore } from 'pinia'

const API_BASE_URL = import.meta.env.VITE_API_URL || window.location.origin

export const useSarStore = defineStore('sar', {
  state: () => ({
    collections: [],
    collectionStats: [],
    selectedCollection: '',
    
    // Extraction config
    language: 'Thai',
    numQuestions: 10,
    
    // Ingestion States
    // 0 = Idle, 1 = Extracting Text/Generating FAQs, 3 = FAQ Review Grid, 4 = Embedding & Ingesting, 5 = Success
    statusStep: 0,
    
    // Progress for multiple files
    totalFiles: 0,
    processedFiles: 0,
    currentFileName: '',

    // Live chunk-level progress (streamed from backend during extraction)
    progressStage: '',   // 'extracting' | 'cleaning' | ''
    currentChunk: 0,
    totalChunks: 0,
    
    // Staging and settings
    targetMode: 'create', // 'create' or 'append'
    newDbName: '',
    pendingFiles: [],
    
    filename: '', // Just for keeping some legacy stuff if needed, though we track multi-files now
    extractedFaqs: [],
    
    // Cost
    totalExtractionCost: 0.0,
    totalExpansionCost: 0.0,
    
    // UI Helpers
    loading: false,
    error: null,
    successMessage: null
  }),
  
  actions: {
    async fetchCollections() {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/collections`)
        if (!response.ok) throw new Error('Failed to load collections')
        const data = await response.json()
        this.collections = data.collections || []
        
        // Auto-select first collection if none selected
        if (this.collections.length > 0 && !this.selectedCollection) {
          this.selectedCollection = this.collections[0]
        }
      } catch (err) {
        console.error(err)
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
    
    async fetchCollectionStats() {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/collections/stats`)
        if (!response.ok) throw new Error('Failed to load collection stats')
        const data = await response.json()
        this.collectionStats = data.stats || []
      } catch (err) {
        console.error(err)
        this.error = err.message
      } finally {
        this.loading = false
      }
    },
    
    async fetchCollectionFaqs(collectionName) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/collections/${collectionName}/faqs?limit=50`)
        if (!response.ok) throw new Error('Failed to load FAQs')
        const data = await response.json()
        return data.faqs || []
      } catch (err) {
        console.error(err)
        return []
      }
    },
    
    async deleteCollection(collectionName) {
      const response = await fetch(`${API_BASE_URL}/api/v1/collections/${collectionName}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail.detail || 'Failed to delete Knowledge Base')
      }
      // Refresh state: drop the deleted collection from local lists/selection.
      if (this.selectedCollection === collectionName) this.selectedCollection = ''
      await this.fetchCollections()
      await this.fetchCollectionStats()
      return await response.json()
    },

    // --- Manual FAQ CRUD on an existing collection ---
    async addFaqToCollection(collectionName, faq) {
      const response = await fetch(`${API_BASE_URL}/api/v1/collections/${collectionName}/faqs/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: faq.category || '',
          question: faq.question,
          answer: faq.answer,
          language: this.language
        })
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail.detail || 'Failed to add FAQ')
      }
      return await response.json()
    },

    async editFaqInCollection(collectionName, originalQuestion, faq) {
      const response = await fetch(`${API_BASE_URL}/api/v1/collections/${collectionName}/faqs/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_question: originalQuestion,
          category: faq.category || '',
          question: faq.question,
          answer: faq.answer,
          language: this.language
        })
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail.detail || 'Failed to edit FAQ')
      }
      return await response.json()
    },

    async deleteFaqFromCollection(collectionName, originalQuestion) {
      const response = await fetch(`${API_BASE_URL}/api/v1/collections/${collectionName}/faqs/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_question: originalQuestion })
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail.detail || 'Failed to delete FAQ')
      }
      return await response.json()
    },

    async createNewCollection(name) {
      this.loading = true
      this.error = null
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/collections/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        })
        if (!response.ok) {
          const detail = await response.json()
          throw new Error(detail.detail || 'Failed to create collection')
        }
        await this.fetchCollections()
        this.selectedCollection = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')
        this.successMessage = `Collection "${name}" created successfully!`
        setTimeout(() => { this.successMessage = null }, 3000)
        return true
      } catch (err) {
        console.error(err)
        this.error = err.message
        return false
      } finally {
        this.loading = false
      }
    },
    
    async extractFaqs(files) {
      this.error = null
      this.statusStep = 1 // Step 1: Extracting / Generation
      this.totalFiles = files.length
      this.processedFiles = 0
      this.extractedFaqs = []
      this.totalExtractionCost = 0.0
      this.progressStage = ''
      this.currentChunk = 0
      this.totalChunks = 0

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          this.currentFileName = file.name
          this.progressStage = ''
          this.currentChunk = 0
          this.totalChunks = 0

          const formData = new FormData()
          formData.append('file', file)
          formData.append('language', this.language)
          formData.append('num_questions', this.numQuestions)

          const response = await fetch(`${API_BASE_URL}/api/v1/extract-faq`, {
            method: 'POST',
            body: formData
          })

          if (!response.ok) {
            let message = `Extraction failed for ${file.name}`
            try {
              const detail = await response.json()
              message = detail.detail || message
            } catch (_) { /* non-JSON error body (e.g. gateway timeout) */ }
            throw new Error(message)
          }

          // The endpoint streams newline-delimited JSON (NDJSON) progress events.
          await this._consumeExtractStream(response, file.name)

          this.processedFiles += 1
        }
        
        this.filename = 'Multiple Files'
        if (files.length === 1) {
          this.filename = files[0].name
        }
        
        this.statusStep = 3 // Step 3: FAQ Review Grid
      } catch (err) {
        console.error(err)
        this.error = err.message
        this.statusStep = 0 // Reset
      } finally {
        this.progressStage = ''
        this.currentChunk = 0
        this.totalChunks = 0
      }
    },

    // Reads the NDJSON stream from /extract-faq, updating live progress state
    // and collecting the final result. Throws on a streamed error event.
    async _consumeExtractStream(response, fileName) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let gotResult = false

      const handleEvent = (ev) => {
        switch (ev.type) {
          case 'chunked':
            this.progressStage = 'extracting'
            this.totalChunks = ev.total_chunks || 0
            this.currentChunk = 0
            break
          case 'progress':
            this.progressStage = ev.stage || this.progressStage
            this.currentChunk = ev.current || 0
            this.totalChunks = ev.total || this.totalChunks
            break
          case 'status':
            if (ev.stage === 'rule_extraction') {
              this.progressStage = 'cleaning'
              this.currentChunk = 0
              this.totalChunks = 0
            }
            break
          case 'result':
            this.extractedFaqs = this.extractedFaqs.concat(ev.faqs || [])
            this.totalExtractionCost += (ev.extraction_cost || 0.0)
            gotResult = true
            break
          case 'error':
            throw new Error(ev.detail || `Extraction failed for ${fileName}`)
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newlineIdx
        while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
          const rawLine = buffer.slice(0, newlineIdx).trim()
          buffer = buffer.slice(newlineIdx + 1)
          if (rawLine) handleEvent(JSON.parse(rawLine))
        }
      }

      // Flush any trailing line without a terminating newline.
      const tail = buffer.trim()
      if (tail) handleEvent(JSON.parse(tail))

      if (!gotResult) {
        throw new Error(`Extraction did not complete for ${fileName}`)
      }
    },

    async processStagedFiles() {
      this.error = null
      
      if (this.pendingFiles.length === 0) {
        this.error = "No files to process."
        return
      }

      // 1. Determine target collection name
      let targetCollection = ""
      if (this.targetMode === "create") {
        const rawName = this.newDbName.trim()
        targetCollection = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, "_")
      } else {
        targetCollection = this.selectedCollection
      }

      // 2. If in create mode, create the collection first
      if (this.targetMode === "create") {
        const success = await this.createNewCollection(targetCollection)
        if (!success) return
      }

      this.selectedCollection = targetCollection

      // 3. Run FAQ extraction
      await this.extractFaqs(this.pendingFiles)
      this.pendingFiles = [] // clear staging
    },
    
    async ingestApprovedFaqs(collectionName) {
      this.error = null
      this.statusStep = 4 // Step 4: Embedding & Ingestion
      this.progressStage = ''
      this.currentChunk = 0
      this.totalChunks = 0

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/collections/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collection_name: collectionName,
            filename: this.filename,
            faqs: this.extractedFaqs,
            language: this.language
          })
        })

        if (!response.ok) {
          let message = 'Ingestion failed'
          try {
            const detail = await response.json()
            message = detail.detail || message
          } catch (_) { /* non-JSON error body */ }
          throw new Error(message)
        }

        // The endpoint streams newline-delimited JSON (NDJSON) progress events.
        await this._consumeIngestStream(response)

        this.statusStep = 5 // Step 5: Success
        await this.fetchCollections() // Refresh collections list
      } catch (err) {
        console.error(err)
        this.error = err.message
        this.statusStep = 3 // Rollback to review grid on failure
      } finally {
        this.progressStage = ''
        this.currentChunk = 0
        this.totalChunks = 0
      }
    },

    // Reads the NDJSON stream from /collections/ingest, updating live progress
    // state. Throws on a streamed error event.
    async _consumeIngestStream(response) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let gotResult = false

      const handleEvent = (ev) => {
        switch (ev.type) {
          case 'progress':
            this.progressStage = ev.stage || this.progressStage
            this.currentChunk = ev.current || 0
            this.totalChunks = ev.total || this.totalChunks
            break
          case 'result':
            this.totalExpansionCost = ev.expansion_cost || 0.0
            gotResult = true
            break
          case 'error':
            throw new Error(ev.detail || 'Ingestion failed')
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newlineIdx
        while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
          const rawLine = buffer.slice(0, newlineIdx).trim()
          buffer = buffer.slice(newlineIdx + 1)
          if (rawLine) handleEvent(JSON.parse(rawLine))
        }
      }

      // Flush any trailing line without a terminating newline.
      const tail = buffer.trim()
      if (tail) handleEvent(JSON.parse(tail))

      if (!gotResult) {
        throw new Error('Ingestion did not complete')
      }
    },
    
    resetIngestion() {
      this.statusStep = 0
      this.filename = ''
      this.extractedFaqs = []
      this.error = null
      this.totalFiles = 0
      this.processedFiles = 0
      this.currentFileName = ''
      this.totalExtractionCost = 0.0
      this.totalExpansionCost = 0.0
      this.pendingFiles = []
      this.newDbName = ''
    },
    
    async queryCollection(collectionName, query, chatHistory = [], allowOwnKnowledge = false) {
      this.error = null
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/query/${collectionName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            chat_history: chatHistory,
            allow_own_knowledge: allowOwnKnowledge
          })
        })
        
        if (!response.ok) {
          const detail = await response.json()
          throw new Error(detail.detail || 'Query request failed')
        }
        
        return await response.json()
      } catch (err) {
        console.error(err)
        this.error = err.message
        throw err
      }
    }
  }
})
