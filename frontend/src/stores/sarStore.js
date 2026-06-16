import { defineStore } from 'pinia'

// Same-origin: API is reverse-proxied under /api by the frontend's nginx (see docker-compose).
// Override at build time with VITE_API_BASE_URL if the backend lives elsewhere.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

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
    
    // Staging and settings
    targetMode: 'create', // 'create' or 'append'
    newDbName: '',
    pendingFiles: [],
    
    filename: '', // Just for keeping some legacy stuff if needed, though we track multi-files now
    extractedFaqs: [],

    // Managing FAQs that already live in an existing collection
    managingExisting: false,
    existingLoading: false,
    existingFaqs: [],
    savingExisting: false,
    
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
      
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          this.currentFileName = file.name
          
          const formData = new FormData()
          formData.append('file', file)
          formData.append('language', this.language)
          formData.append('num_questions', this.numQuestions)
          
          const response = await fetch(`${API_BASE_URL}/api/v1/extract-faq`, {
            method: 'POST',
            body: formData
          })
          
          if (!response.ok) {
            const detail = await response.json()
            throw new Error(detail.detail || `Extraction failed for ${file.name}`)
          }
          
          const data = await response.json()
          this.extractedFaqs = this.extractedFaqs.concat(data.faqs || [])
          this.totalExtractionCost += (data.extraction_cost || 0.0)
          
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
          const detail = await response.json()
          throw new Error(detail.detail || 'Ingestion failed')
        }
        
        const data = await response.json()
        this.totalExpansionCost = data.expansion_cost || 0.0
        
        this.statusStep = 5 // Step 5: Success
        await this.fetchCollections() // Refresh collections list
      } catch (err) {
        console.error(err)
        this.error = err.message
        this.statusStep = 3 // Rollback to review grid on failure
      }
    },
    
    // ---- Manage existing collection FAQs (add / edit / delete) ----
    async loadExistingFaqs(collectionName) {
      if (!collectionName) {
        this.managingExisting = false
        this.existingFaqs = []
        return
      }
      this.existingLoading = true
      this.managingExisting = true
      this.error = null
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/collections/${collectionName}/faqs/grouped`)
        if (!response.ok) throw new Error('Failed to load existing FAQs')
        const data = await response.json()
        this.existingFaqs = (data.faqs || []).map(f => ({
          point_ids: f.point_ids || [],
          category: f.category || '',
          question: f.question || '',
          answer: f.answer || '',
          filename: f.filename || '',
          source_type: f.source_type || 'LLM',
          _new: false,
          // snapshot to detect edits on save
          _orig: JSON.stringify({ category: f.category || '', question: f.question || '', answer: f.answer || '', source_type: f.source_type || 'LLM' })
        }))
      } catch (err) {
        console.error(err)
        this.error = err.message
        this.existingFaqs = []
      } finally {
        this.existingLoading = false
      }
    },

    addManualExistingFaq() {
      this.existingFaqs.unshift({
        point_ids: [],
        category: '',
        question: '',
        answer: '',
        filename: 'Manual Entry',
        source_type: 'Manual',
        _new: true,
        _orig: ''
      })
    },

    async deleteExistingFaq(index) {
      const faq = this.existingFaqs[index]
      if (!faq) return
      // Brand-new unsaved row: just drop it locally.
      if (faq._new || faq.point_ids.length === 0) {
        this.existingFaqs.splice(index, 1)
        return
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/collections/${this.selectedCollection}/faqs/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ point_ids: faq.point_ids })
        })
        if (!response.ok) {
          const detail = await response.json()
          throw new Error(detail.detail || 'Failed to delete FAQ')
        }
        this.existingFaqs.splice(index, 1)
      } catch (err) {
        console.error(err)
        this.error = err.message
      }
    },

    existingPendingCount() {
      return this.existingFaqs.filter(f => {
        if (f._new) return f.question.trim() || f.answer.trim()
        const cur = JSON.stringify({ category: f.category, question: f.question, answer: f.answer, source_type: f.source_type })
        return cur !== f._orig
      }).length
    },

    async saveExistingChanges() {
      // Collect brand-new rows and edited existing rows.
      const upserts = []
      for (const f of this.existingFaqs) {
        if (f._new) {
          if (!f.question.trim() && !f.answer.trim()) continue // skip empty new rows
          upserts.push({ point_ids: [], category: f.category, question: f.question, answer: f.answer, filename: f.filename || 'Manual Entry', source_type: f.source_type || 'Manual' })
        } else {
          const cur = JSON.stringify({ category: f.category, question: f.question, answer: f.answer, source_type: f.source_type })
          if (cur !== f._orig) {
            upserts.push({ point_ids: f.point_ids, category: f.category, question: f.question, answer: f.answer, filename: f.filename || 'Manual Entry', source_type: f.source_type || 'Manual' })
          }
        }
      }

      if (upserts.length === 0) {
        this.error = 'No new or edited FAQs to save.'
        return
      }

      this.savingExisting = true
      this.error = null
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/collections/${this.selectedCollection}/faqs/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ upserts, language: this.language })
        })
        if (!response.ok) {
          const detail = await response.json()
          throw new Error(detail.detail || 'Failed to save changes')
        }
        const data = await response.json()
        this.successMessage = `Saved ${data.added} entries (${data.replaced} replaced).`
        setTimeout(() => { this.successMessage = null }, 4000)
        // Reload to reflect persisted state + fresh point ids.
        await this.loadExistingFaqs(this.selectedCollection)
      } catch (err) {
        console.error(err)
        this.error = err.message
      } finally {
        this.savingExisting = false
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
    
    async queryCollection(collectionName, query, chatHistory = []) {
      this.error = null
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/query/${collectionName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            chat_history: chatHistory
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
