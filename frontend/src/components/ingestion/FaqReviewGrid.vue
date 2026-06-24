<template>
  <div class="right-column panel-card min-h-500">
    <!-- Append mode: preview the selected Knowledge Base -->
    <div
      v-if="store.statusStep < 3 && showKbPreview"
      class="kb-preview"
    >
      <div class="kb-preview-header">
        <div>
          <div class="kb-preview-eyebrow">Knowledge Base</div>
          <h2 class="kb-preview-name">{{ store.selectedCollection }}</h2>
        </div>
        <div class="kb-header-right">
          <div class="kb-stats">
            <div class="kb-stat">
              <div class="kb-stat-value">{{ selectedKbStats?.points_count ?? "—" }}</div>
              <div class="kb-stat-label">Vectors</div>
            </div>
            <div class="kb-stat">
              <div class="kb-stat-value">{{ kbUniqueQuestionCount }}</div>
              <div class="kb-stat-label">Questions (sample)</div>
            </div>
          </div>
          <button
            class="kb-delete-db-btn"
            :disabled="kbSaving"
            title="ลบ Knowledge Base นี้ทั้งหมด"
            @click="deleteKnowledgeBase"
          >
            🗑️ ลบ KB
          </button>
        </div>
      </div>

      <div class="kb-preview-toolbar">
        <p class="kb-preview-hint">
          เอกสารที่อัปโหลดจะถูกเพิ่มเข้าไปใน Knowledge Base นี้ ตัวอย่างข้อมูลที่มีอยู่:
        </p>
        <button class="kb-add-btn" :disabled="kbSaving" @click="openAddForm">
          + เพิ่ม FAQ
        </button>
      </div>

      <!-- Add / Edit form -->
      <div v-if="kbForm" class="kb-form">
        <div class="kb-form-title">
          {{ kbForm.mode === "add" ? "เพิ่ม FAQ ใหม่" : "แก้ไข FAQ" }}
        </div>
        <label class="kb-form-label">หมวดหมู่ (Category)</label>
        <input v-model="kbForm.category" class="kb-form-input" placeholder="เช่น เวลาทำการ" />
        <label class="kb-form-label">คำถาม (Question)</label>
        <textarea v-model="kbForm.question" class="kb-form-input" rows="2"></textarea>
        <label class="kb-form-label">คำตอบ (Answer)</label>
        <textarea v-model="kbForm.answer" class="kb-form-input" rows="3"></textarea>
        <div class="kb-form-actions">
          <button class="kb-btn-ghost" :disabled="kbSaving" @click="kbForm = null">
            ยกเลิก
          </button>
          <button class="kb-btn-primary" :disabled="kbSaving || !kbFormValid" @click="saveKbForm">
            <span v-if="kbSaving" class="spinner sm"></span>
            {{ kbSaving ? "กำลังบันทึก..." : "บันทึก" }}
          </button>
        </div>
        <p class="kb-form-note">
          * ระบบจะสร้างคำถามที่หลากหลาย (x5) และฝัง embedding ใหม่อัตโนมัติ
        </p>
      </div>

      <div v-if="kbError" class="kb-error">{{ kbError }}</div>

      <div v-if="kbLoading" class="kb-preview-loading">
        <div class="spinner"></div>
        <span>กำลังโหลดข้อมูล...</span>
      </div>

      <div v-else-if="kbPreviewFaqs.length === 0" class="kb-preview-empty">
        ยังไม่มีข้อมูลใน Knowledge Base นี้
      </div>

      <div v-else class="kb-faq-list">
        <div
          v-for="faq in kbPreviewFaqs"
          :key="faq.id"
          class="kb-faq-item"
        >
          <div class="kb-faq-main">
            <div class="kb-faq-q">
              <span v-if="faq.category" class="kb-faq-cat">{{ faq.category }}</span>
              {{ faq.original_question || faq.question }}
            </div>
            <div class="kb-faq-a">{{ faq.answer }}</div>
          </div>
          <div class="kb-faq-actions">
            <button class="kb-icon-btn" title="แก้ไข" :disabled="kbSaving" @click="openEditForm(faq)">
              ✏️
            </button>
            <button class="kb-icon-btn danger" title="ลบ" :disabled="kbSaving" @click="deleteKbFaq(faq)">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Inactive / Idle state -->
    <div
      v-else-if="store.statusStep < 3"
      class="empty-review-state"
    >
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
      <div v-if="store.totalChunks > 0" class="ingest-progress">
        <div class="ingest-bar-track">
          <div
            class="ingest-bar-fill"
            :style="{ width: ingestPercent + '%' }"
          ></div>
        </div>
        <div class="ingest-label">
          {{ ingestStageLabel }} {{ store.currentChunk }}/{{ store.totalChunks }}
          ({{ ingestPercent }}%)
        </div>
      </div>
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
      <div class="faq-grid-scroll">
        <FaqEditCard
          v-for="(faq, index) in pagedFaqs"
          :key="pageStartIndex + index"
          :faq="faq"
          @delete="deleteFaq(pageStartIndex + index)"
        />
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="faq-pagination">
        <button
          class="btn-secondary page-btn"
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          ‹ Prev
        </button>
        <span class="page-info">
          Page {{ currentPage }} / {{ totalPages }}
        </span>
        <button
          class="btn-secondary page-btn"
          :disabled="currentPage === totalPages"
          @click="currentPage++"
        >
          Next ›
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useSarStore } from "../../stores/sarStore";
import FaqEditCard from "./FaqEditCard.vue";

const store = useSarStore();

const PAGE_SIZE = 10;
const currentPage = ref(1);

// --- Append-mode Knowledge Base preview ---------------------------------
const kbPreviewFaqs = ref([]);
const kbLoading = ref(false);

// Show the preview only while idle (before extraction), in append mode,
// with a collection actually selected.
const showKbPreview = computed(
  () =>
    store.statusStep < 3 &&
    store.targetMode === "append" &&
    !!store.selectedCollection
);

const selectedKbStats = computed(() =>
  store.collectionStats.find((s) => s.name === store.selectedCollection)
);

// Count distinct original questions in the sample (variations collapse to one).
const kbUniqueQuestionCount = computed(() => {
  const seen = new Set(
    kbPreviewFaqs.value.map((f) => f.original_question || f.question)
  );
  return seen.size;
});

// CRUD state for the append-mode KB preview.
const kbForm = ref(null); // { mode: 'add'|'edit', original_question, category, question, answer }
const kbSaving = ref(false);
const kbError = ref(null);

const kbFormValid = computed(
  () =>
    kbForm.value &&
    kbForm.value.question.trim() &&
    kbForm.value.answer.trim()
);

const openAddForm = () => {
  kbError.value = null;
  kbForm.value = { mode: "add", original_question: "", category: "", question: "", answer: "" };
};

const openEditForm = (faq) => {
  kbError.value = null;
  kbForm.value = {
    mode: "edit",
    original_question: faq.original_question || faq.question,
    category: faq.category || "",
    question: faq.original_question || faq.question,
    answer: faq.answer || "",
  };
};

const saveKbForm = async () => {
  if (!kbFormValid.value) return;
  kbSaving.value = true;
  kbError.value = null;
  const name = store.selectedCollection;
  const payload = {
    category: kbForm.value.category,
    question: kbForm.value.question,
    answer: kbForm.value.answer,
  };
  try {
    if (kbForm.value.mode === "add") {
      await store.addFaqToCollection(name, payload);
    } else {
      await store.editFaqInCollection(name, kbForm.value.original_question, payload);
    }
    kbForm.value = null;
    await store.fetchCollectionStats();
    await loadKbPreview(name);
  } catch (err) {
    kbError.value = err.message;
  } finally {
    kbSaving.value = false;
  }
};

const deleteKnowledgeBase = async () => {
  const name = store.selectedCollection;
  if (!name) return;
  if (
    !window.confirm(
      `ต้องการลบ Knowledge Base "${name}" ทั้งหมด?\n\nข้อมูล FAQ ทั้งหมดใน KB นี้จะถูกลบถาวรและกู้คืนไม่ได้`
    )
  )
    return;
  kbSaving.value = true;
  kbError.value = null;
  try {
    await store.deleteCollection(name);
    kbForm.value = null;
    kbPreviewFaqs.value = [];
    // selectedCollection is cleared by the store; preview hides automatically.
  } catch (err) {
    kbError.value = err.message;
  } finally {
    kbSaving.value = false;
  }
};

const deleteKbFaq = async (faq) => {
  const key = faq.original_question || faq.question;
  if (!window.confirm(`ต้องการลบ FAQ นี้?\n\n"${key}"`)) return;
  kbSaving.value = true;
  kbError.value = null;
  const name = store.selectedCollection;
  try {
    await store.deleteFaqFromCollection(name, key);
    await store.fetchCollectionStats();
    await loadKbPreview(name);
  } catch (err) {
    kbError.value = err.message;
  } finally {
    kbSaving.value = false;
  }
};

const loadKbPreview = async (name) => {
  if (!name) {
    kbPreviewFaqs.value = [];
    return;
  }
  kbLoading.value = true;
  try {
    // Refresh stats (for the vector count) and pull a sample of FAQs.
    if (store.collectionStats.length === 0) await store.fetchCollectionStats();
    const faqs = await store.fetchCollectionFaqs(name);
    // Collapse paraphrase variations: keep one row per original question.
    const byOriginal = new Map();
    for (const f of faqs) {
      const key = f.original_question || f.question;
      if (!byOriginal.has(key)) byOriginal.set(key, f);
    }
    kbPreviewFaqs.value = Array.from(byOriginal.values());
  } finally {
    kbLoading.value = false;
  }
};

// Reload the preview whenever the user switches mode or picks a different KB.
watch(
  () => [store.targetMode, store.selectedCollection, store.statusStep],
  () => {
    kbForm.value = null;
    kbError.value = null;
    if (showKbPreview.value) loadKbPreview(store.selectedCollection);
    else kbPreviewFaqs.value = [];
  },
  { immediate: true }
);

const ingestPercent = computed(() => {
  if (!store.totalChunks) return 0;
  return Math.round((store.currentChunk / store.totalChunks) * 100);
});

const ingestStageLabel = computed(() => {
  if (store.progressStage === "embedding") return "Embedding";
  return "Expanding question";
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(store.extractedFaqs.length / PAGE_SIZE))
);
const pageStartIndex = computed(() => (currentPage.value - 1) * PAGE_SIZE);
const pagedFaqs = computed(() =>
  store.extractedFaqs.slice(pageStartIndex.value, pageStartIndex.value + PAGE_SIZE)
);

// Keep currentPage within bounds when the list shrinks (e.g. after delete)
watch(totalPages, (max) => {
  if (currentPage.value > max) currentPage.value = max;
});

const addManualFaq = () => {
  store.extractedFaqs.unshift({
    category: "",
    question: "",
    answer: "",
    filename: "Manual Entry",
    source_type: "Manual",
  });
  // New entry is prepended — jump to the first page to reveal it
  currentPage.value = 1;
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

.faq-grid-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-right: 0.5rem;
}

.faq-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding-top: 1.25rem;
  margin-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.page-btn {
  min-width: 90px;
  justify-content: center;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 0.85rem;
  color: var(--text-secondary);
  min-width: 110px;
  text-align: center;
}

/* Live progress bar shown during the Expanding & Embedding step */
.ingest-progress {
  width: 100%;
  max-width: 420px;
  margin: 1.5rem auto 0;
}
.ingest-bar-track {
  width: 100%;
  height: 8px;
  background: rgba(148, 163, 184, 0.25);
  border-radius: 999px;
  overflow: hidden;
}
.ingest-bar-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.ingest-label {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

/* --- Append-mode Knowledge Base preview --- */
.kb-preview {
  padding: 1.5rem;
  text-align: left;
}
.kb-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1rem;
}
.kb-preview-eyebrow {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  font-weight: 600;
}
.kb-preview-name {
  margin: 0.15rem 0 0;
  font-size: 1.5rem;
}
.kb-header-right {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}
.kb-stats {
  display: flex;
  gap: 1.5rem;
}
.kb-delete-db-btn {
  flex-shrink: 0;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #dc2626;
  background: rgba(239, 68, 68, 0.08);
  border-radius: 8px;
  padding: 0.45rem 0.8rem;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.kb-delete-db-btn:hover:not(:disabled) { background: rgba(239, 68, 68, 0.18); }
.kb-delete-db-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.kb-stat {
  text-align: center;
}
.kb-stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #3b82f6;
  font-variant-numeric: tabular-nums;
}
.kb-stat-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}
.kb-preview-hint {
  margin: 1rem 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.kb-preview-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  padding: 2rem 0;
  justify-content: center;
}
.kb-preview-empty {
  padding: 2rem 0;
  text-align: center;
  color: var(--text-secondary);
}
.kb-faq-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 460px;
  overflow-y: auto;
}
.kb-faq-item {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary, rgba(148, 163, 184, 0.06));
}
.kb-faq-q {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.35rem;
}
.kb-faq-cat {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 600;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 6px;
  padding: 0.1rem 0.4rem;
  margin-right: 0.4rem;
  vertical-align: middle;
}
.kb-faq-a {
  font-size: 0.83rem;
  color: var(--text-secondary);
  line-height: 1.45;
}

/* CRUD controls */
.kb-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.kb-add-btn {
  flex-shrink: 0;
  border: 1px solid #3b82f6;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.08);
  border-radius: 8px;
  padding: 0.45rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.kb-add-btn:hover:not(:disabled) { background: rgba(59, 130, 246, 0.16); }
.kb-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.kb-faq-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}
.kb-faq-main { flex: 1; min-width: 0; }
.kb-faq-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}
.kb-icon-btn {
  border: 1px solid var(--border-color);
  background: transparent;
  border-radius: 6px;
  padding: 0.2rem 0.45rem;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
}
.kb-icon-btn:hover:not(:disabled) { background: rgba(148, 163, 184, 0.15); }
.kb-icon-btn.danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.12); }
.kb-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.kb-form {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
  background: var(--bg-secondary, rgba(148, 163, 184, 0.06));
}
.kb-form-title { font-weight: 700; margin-bottom: 0.75rem; }
.kb-form-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  margin: 0.6rem 0 0.25rem;
}
.kb-form-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.5rem 0.7rem;
  font-size: 0.9rem;
  font-family: inherit;
  background: var(--bg-primary, #fff);
  resize: vertical;
}
.kb-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
.kb-btn-ghost,
.kb-btn-primary {
  border-radius: 8px;
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.kb-btn-ghost { border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); }
.kb-btn-primary { border: none; background: #3b82f6; color: #fff; }
.kb-btn-primary:disabled,
.kb-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.kb-form-note { margin: 0.6rem 0 0; font-size: 0.72rem; color: var(--text-secondary); }
.spinner.sm { width: 13px; height: 13px; border-width: 2px; }

.kb-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #dc2626;
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
</style>
