<template>
  <div>
    <div class="panel-card">
      <h3 class="mb-5">Ingestion Target</h3>

      <!-- Target Database Toggle -->
      <div class="toggle-group">
        <div
          class="toggle-option"
          :class="{ active: store.targetMode === 'create' }"
          @click="
            store.targetMode = 'create';
            store.error = null;
          "
        >
          Create New DB
        </div>
        <div
          class="toggle-option"
          :class="{ active: store.targetMode === 'append' }"
          @click="
            store.targetMode = 'append';
            store.error = null;
          "
        >
          Append to Existing
        </div>
      </div>

      <!-- Database Selection Fields -->
      <div v-if="store.targetMode === 'create'" class="form-group">
        <label class="form-label">New Knowledge Base Name</label>
        <input
          type="text"
          class="input-control"
          v-model="store.newDbName"
          placeholder="e.g. hr_faq_2026"
          :disabled="store.statusStep > 0"
        />
      </div>

      <div v-else class="form-group">
        <label class="form-label">Select Knowledge Base</label>
        <select
          class="input-control"
          v-model="store.selectedCollection"
          :disabled="store.statusStep > 0"
        >
          <option value="" disabled>-- Choose a Collection --</option>
          <option v-for="col in store.collections" :key="col" :value="col">
            {{ col }}
          </option>
        </select>
        <p
          v-if="store.collections.length === 0"
          class="text-sm text-muted mt-2"
        >
          No databases found. Create one first!
        </p>
        <button
          v-if="store.selectedCollection && store.targetMode !== 'create'"
          class="btn-secondary w-full p-2 mt-3"
          @click="downloadDbCsv(store.selectedCollection)"
        >
          📥 Download Full DB CSV
        </button>
      </div>
    </div>

    <!-- Settings Panel -->
    <div class="panel-card mt-4">
      <h3 class="mb-5">FAQ Settings</h3>
      <div class="form-group">
        <label class="form-label">Language</label>
        <select
          class="input-control"
          v-model="store.language"
          :disabled="store.statusStep > 0"
        >
          <option value="Thai">Thai</option>
          <option value="English">English</option>
          <option value="Chinese (Simplified)">Chinese (Simplified)</option>
          <option value="Japanese">Japanese</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Approximate Questions per Doc</label>
        <input
          type="number"
          class="input-control"
          v-model="store.numQuestions"
          min="1"
          :disabled="store.statusStep > 0"
        />
      </div>
    </div>

    <!-- File Upload Zone -->
    <div class="panel-card mt-4">
      <h3 class="mb-5">Upload Document(s)</h3>

      <div
        class="dropzone"
        :class="{ active: isDragActive, disabled: !isTargetValid }"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
        @click="isTargetValid ? triggerFileInput() : null"
        v-if="store.statusStep === 0"
      >
        <div class="upload-icon">📥</div>
        <p v-if="!isTargetValid" class="text-muted">
          Please configure Target Database first
        </p>
        <p v-else>Drag & Drop your documents here</p>
        <span>Supports .pdf, .docx, .txt</span>
        <input
          type="file"
          ref="fileInput"
          class="hidden-input"
          accept=".pdf,.docx,.txt"
          multiple
          @change="onFileSelected"
          :disabled="!isTargetValid"
        />
      </div>

      <!-- Pending Files Badge -->
      <div
        v-if="store.statusStep === 0 && store.pendingFiles.length > 0"
        class="mt-4"
      >
        <h4 class="mb-2 text-sm font-semibold">Staged Files:</h4>
        <div
          v-for="(file, index) in store.pendingFiles"
          :key="index"
          class="file-info-badge mb-2"
        >
          <span class="file-name" :title="file.name">{{ file.name }}</span>
          <button
            class="btn-danger-text px-1"
            @click="removePendingFile(index)"
          >
            Remove
          </button>
        </div>
        <button
          class="btn-primary w-full mt-2"
          @click="store.processStagedFiles"
        >
          Process {{ store.pendingFiles.length }} Document(s)
        </button>
      </div>

      <!-- Processing Status -->
      <div
        v-if="store.statusStep > 0 && store.statusStep < 3"
        class="file-info-badge mt-4"
      >
        <span v-if="store.statusStep === 1">
          Processing: {{ store.processedFiles + 1 }} / {{ store.totalFiles }}
        </span>
        <span class="file-name" :title="store.currentFileName">{{
          store.currentFileName
        }}</span>
        <span class="spinner w-4 h-4"></span>
      </div>

      <!-- Processing Cost (Shown when done) -->
      <div
        v-if="store.statusStep >= 3"
        class="file-info-badge cost-summary mt-4"
      >
        <span><strong>Total Files:</strong> {{ store.totalFiles }}</span>
        <span
          ><strong>Extraction Cost:</strong> ${{
            store.totalExtractionCost.toFixed(4)
          }}</span
        >
        <span v-if="store.statusStep >= 5"
          ><strong>Expansion Cost:</strong> ${{
            store.totalExpansionCost.toFixed(4)
          }}</span
        >
        <span v-if="store.statusStep >= 5" class="total-cost">
          <strong>Total Cost:</strong> ${{
            (store.totalExtractionCost + store.totalExpansionCost).toFixed(4)
          }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useSarStore } from "../../stores/sarStore";

const store = useSarStore();
const isDragActive = ref(false);
const fileInput = ref(null);

const isTargetValid = computed(() => {
  if (store.targetMode === "create") {
    return store.newDbName.trim().length > 0;
  }
  return store.selectedCollection !== "";
});

const onDragOver = () => {
  if (isTargetValid.value) isDragActive.value = true;
};

const onDragLeave = () => {
  isDragActive.value = false;
};

const onDrop = (e) => {
  isDragActive.value = false;
  if (!isTargetValid.value) return;

  const files = Array.from(e.dataTransfer.files);
  stageFiles(files);
};

const triggerFileInput = () => {
  if (fileInput.value) {
    fileInput.value.click();
  }
};

const onFileSelected = (e) => {
  const files = Array.from(e.target.files);
  stageFiles(files);
};

const stageFiles = (files) => {
  store.error = null;
  for (let file of files) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "docx", "txt"].includes(ext)) {
      store.error = `Unsupported file format: .${ext}. Please upload a .pdf, .docx, or .txt file.`;
      continue;
    }
    store.pendingFiles.push(file);
  }
};

const removePendingFile = (index) => {
  store.pendingFiles.splice(index, 1);
};

const downloadDbCsv = (collection) => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  window.open(
    `${baseUrl}/api/v1/collections/export/${collection}`,
    "_blank",
  );
};
</script>

<style scoped>
.mb-5 {
  margin-bottom: 1.25rem;
}
.mb-2 {
  margin-bottom: 0.5rem;
}
.mt-2 {
  margin-top: 0.5rem;
}
.mt-3 {
  margin-top: 0.75rem;
}
.mt-4 {
  margin-top: 1rem;
}
.p-2 {
  padding: 0.4rem;
}
.px-1 {
  padding: 0 0.25rem;
}
.w-full {
  width: 100%;
}
.w-4 {
  width: 16px;
}
.h-4 {
  height: 16px;
}
.text-sm {
  font-size: 0.75rem;
}
.text-muted {
  color: var(--text-muted);
}
.font-semibold {
  font-weight: 600;
}
.hidden-input {
  display: none;
}

.cost-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}

.total-cost {
  color: var(--accent-purple);
  font-weight: bold;
}

.dropzone.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: var(--border-color);
  background: var(--bg-secondary);
}
</style>
