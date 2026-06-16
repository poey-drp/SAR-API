<template>
  <div class="faq-edit-card">
    <div class="faq-card-header">
      <div class="faq-metadata">
        <span class="faq-textarea-label mb-0">Category</span>
        <input
          type="text"
          class="input-control category-input"
          v-model="faq.category"
          placeholder="Category"
        />
        <span class="metadata-text" :title="faq.filename">
          📄 {{ faq.filename }} | ⚙️ Source: {{ faq.source_type || "LLM" }}
        </span>
      </div>
      <button
        class="btn-danger-text"
        @click="emit('delete')"
        title="Delete FAQ"
      >
        🗑️ Delete
      </button>
    </div>

    <div class="faq-card-body">
      <div>
        <div class="faq-textarea-label">Question</div>
        <textarea
          class="faq-textarea"
          rows="2"
          v-model="faq.question"
          placeholder="FAQ Question"
        ></textarea>
      </div>
      <div>
        <div class="faq-textarea-label">Answer</div>
        <textarea
          class="faq-textarea"
          rows="4"
          v-model="faq.answer"
          placeholder="FAQ Answer"
        ></textarea>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  faq: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['delete']);
</script>

<style scoped>
.mb-0 { margin-bottom: 0 !important; }

.faq-edit-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0; /* keep full height inside the scrollable list (no squishing) */
}

.faq-card-header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.faq-metadata {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.metadata-text {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-left: 0.5rem;
}

.category-input {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
  width: auto;
  min-width: 200px;
}

.faq-card-body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.faq-textarea-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
  display: block;
}

.faq-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.95rem;
  resize: vertical;
  transition: all 0.2s;
}

.faq-textarea:focus {
  outline: none;
  border-color: var(--accent-purple);
  background: var(--bg-primary);
}
</style>
