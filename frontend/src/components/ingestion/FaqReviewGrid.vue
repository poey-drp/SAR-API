<template>
  <div class="right-column panel-card min-h-500">
    <!-- Manage existing collection FAQs (add / edit / delete) -->
    <div
      v-if="store.statusStep === 0 && store.managingExisting"
      class="faq-review-container"
    >
      <div v-if="store.existingLoading" class="empty-review-state">
        <div class="spinner big-spinner mb-4"></div>
        <h2>Loading FAQs from "{{ store.selectedCollection }}"...</h2>
      </div>
      <template v-else>
        <div class="faq-review-header">
          <div>
            <h2>Manage FAQs — {{ store.selectedCollection }}</h2>
            <p class="text-xs text-muted mt-1">
              {{ store.existingFaqs.length }} FAQ(s) in this database. Add, edit,
              or delete entries below.
            </p>
          </div>
          <div class="action-buttons">
            <button class="btn-secondary action-add" @click="addManualExisting">
              ➕ Add manually
            </button>
            <button
              class="btn-primary action-save"
              :disabled="store.savingExisting"
              @click="store.saveExistingChanges()"
            >
              <span v-if="store.savingExisting" class="spinner w-4 h-4"></span>
              <span v-else>💾 Save Changes ({{ store.existingPendingCount() }})</span>
            </button>
          </div>
        </div>

        <div v-if="store.existingFaqs.length === 0" class="empty-review-state">
          <div class="empty-review-icon">📭</div>
          <p class="max-w-400 text-sm">
            This database has no FAQ entries yet. Click "Add manually" or upload a
            document to populate it.
          </p>
        </div>

        <div v-else class="faq-grid-list">
          <FaqEditCard
            v-for="item in pagedManage"
            :key="(item.faq.point_ids && item.faq.point_ids[0]) || 'new-' + item.index"
            :faq="item.faq"
            @delete="store.deleteExistingFaq(item.index)"
          />
        </div>

        <div v-if="manageTotalPages > 1" class="pager">
          <button class="btn-secondary pager-btn" :disabled="managePage === 1" @click="managePage--">‹ Prev</button>
          <span class="pager-info">Page {{ managePage }} / {{ manageTotalPages }} · {{ store.existingFaqs.length }} FAQs</span>
          <button class="btn-secondary pager-btn" :disabled="managePage === manageTotalPages" @click="managePage++">Next ›</button>
        </div>
      </template>
    </div>

    <!-- Inactive / Idle state -->
    <div v-else-if="store.statusStep < 3" class="empty-review-state">
      <div class="empty-review-icon">📑</div>
      <h2>FAQ Generation Grid</h2>
      <p class="max-w-400 text-sm">
        Select a database target, configure settings, and stage documents into
        the upload zone to automatically generate FAQ pairs for review.
      </p>
    </div>

    <!-- Ingesting state -->
    <div v-else-if="store.statusStep === 4" class="empty-review-state">
      <div class="spinner big-spinner mb-4"></div>
      <h2>Expanding & Embedding FAQ Pairs...</h2>
      <p>
        Generating x5 question variations and dense vector embeddings in Qdrant.
      </p>
    </div>

    <!-- Success State -->
    <div
      v-else-if="store.statusStep === 5"
      class="empty-review-state success-state"
    >
      <div class="success-icon">🎉</div>
      <h2>Ingestion Completed!</h2>
      <p class="max-w-400 text-sm text-secondary mb-6">
        All FAQ pairs and variations have been embedded and stored. External
        integrations can now query the collection.
      </p>
      <button class="btn-secondary" @click="store.resetIngestion()">
        Start New Upload
      </button>
    </div>

    <!-- Active Review State -->
    <div v-else-if="store.statusStep === 3" class="faq-review-container">
      <div class="faq-review-header">
        <div>
          <h2>Review Extracted FAQs</h2>
          <p class="text-xs text-muted mt-1">
            Generated {{ store.extractedFaqs.length }} FAQ pairs from
            {{ store.totalFiles }} document(s). Review and edit before saving.
          </p>
        </div>
        <div class="action-buttons">
          <button class="btn-secondary action-add" @click="addManualFaq">
            ➕ Add manually
          </button>
          <button class="btn-secondary action-cancel" @click="cancelUpload">
            Cancel
          </button>
          <button class="btn-primary action-save" @click="submitIngestion">
            Save & Ingest ({{ store.extractedFaqs.length }})
          </button>
        </div>
      </div>

      <!-- FAQ Grid list -->
      <div class="faq-grid-list">
        <FaqEditCard
          v-for="item in pagedReview"
          :key="item.index"
          :faq="item.faq"
          @delete="deleteFaq(item.index)"
        />
      </div>

      <div v-if="reviewTotalPages > 1" class="pager">
        <button class="btn-secondary pager-btn" :disabled="reviewPage === 1" @click="reviewPage--">‹ Prev</button>
        <span class="pager-info">Page {{ reviewPage }} / {{ reviewTotalPages }} · {{ store.extractedFaqs.length }} FAQs</span>
        <button class="btn-secondary pager-btn" :disabled="reviewPage === reviewTotalPages" @click="reviewPage++">Next ›</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useSarStore } from "../../stores/sarStore";
import FaqEditCard from "./FaqEditCard.vue";

const store = useSarStore();
const PAGE_SIZE = 5;

// --- Review (extraction) pagination ---
const reviewPage = ref(1);
const reviewTotalPages = computed(() =>
  Math.max(1, Math.ceil(store.extractedFaqs.length / PAGE_SIZE))
);
const pagedReview = computed(() => {
  const start = (reviewPage.value - 1) * PAGE_SIZE;
  return store.extractedFaqs
    .slice(start, start + PAGE_SIZE)
    .map((faq, i) => ({ faq, index: start + i }));
});

// --- Manage (existing) pagination ---
const managePage = ref(1);
const manageTotalPages = computed(() =>
  Math.max(1, Math.ceil(store.existingFaqs.length / PAGE_SIZE))
);
const pagedManage = computed(() => {
  const start = (managePage.value - 1) * PAGE_SIZE;
  return store.existingFaqs
    .slice(start, start + PAGE_SIZE)
    .map((faq, i) => ({ faq, index: start + i }));
});

// Keep the current page within bounds when the list shrinks (deletes).
watch(reviewTotalPages, (n) => { if (reviewPage.value > n) reviewPage.value = n; });
watch(manageTotalPages, (n) => { if (managePage.value > n) managePage.value = n; });
// Reset to the first page when switching DB.
watch(() => store.selectedCollection, () => { managePage.value = 1; });

const addManualFaq = () => {
  store.extractedFaqs.unshift({
    category: "",
    question: "",
    answer: "",
    filename: "Manual Entry",
    source_type: "Manual",
  });
  reviewPage.value = 1; // new row is added to the top
};

const addManualExisting = () => {
  store.addManualExistingFaq();
  managePage.value = 1; // new row is added to the top
};

const deleteFaq = (index) => {
  store.extractedFaqs.splice(index, 1);
};

const cancelUpload = () => {
  store.resetIngestion();
};

const submitIngestion = async () => {
  if (store.extractedFaqs.length === 0) {
    store.error = "The FAQ list is empty. Nothing to ingest.";
    return;
  }
  await store.ingestApprovedFaqs(store.selectedCollection);
};
</script>

<style scoped>
.min-h-500 { min-height: 500px; }
.max-w-400 { max-width: 400px; }
.text-sm { font-size: 0.9rem; }
.text-xs { font-size: 0.8rem; }
.text-muted { color: var(--text-muted); }
.text-secondary { color: var(--text-secondary); }
.mt-1 { margin-top: 0.25rem; }
.mb-4 { margin-bottom: 1rem; }
.mb-6 { margin-bottom: 1.5rem; }

.empty-review-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-muted);
}

.empty-review-state h2 {
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.empty-review-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.success-state {
  color: var(--exact-color);
}

.success-icon {
  font-size: 4rem;
  margin-bottom: 0.5rem;
}

.big-spinner {
  width: 40px;
  height: 40px;
  border-width: 3px;
  border-top-color: var(--accent-purple);
}

.faq-review-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.faq-review-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 1.5rem;
}

.action-buttons {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: flex-end;
}

.action-add {
  border-color: var(--accent-purple);
  color: var(--accent-purple);
  min-width: 170px;
  justify-content: center;
}

.action-cancel {
  min-width: 110px;
  justify-content: center;
}

.action-save {
  min-width: 180px;
  justify-content: center;
}

.faq-grid-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border-color);
}

.pager-btn {
  min-width: 90px;
  justify-content: center;
}

.pager-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pager-info {
  font-size: 0.85rem;
  color: var(--text-secondary);
  min-width: 200px;
  text-align: center;
}
</style>
