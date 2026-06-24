<template>
  <div v-if="store.statusStep > 0" class="timeline-tracker mt-6">
    <!-- Step 1: Text extraction -->
    <div
      class="timeline-step"
      :class="{
        active: store.statusStep === 1,
        completed: store.statusStep > 1,
      }"
    >
      <div class="step-indicator">
        <span v-if="store.statusStep > 1">✓</span>
        <span v-else>1</span>
      </div>
      <div class="step-details">
        <div class="step-title">
          Extracting & Generating FAQs
          <span v-if="store.statusStep === 1" class="spinner"></span>
        </div>
        <div class="step-desc">{{ extractionDesc }}</div>
        <div
          v-if="store.statusStep === 1 && store.totalChunks > 0"
          class="chunk-progress"
        >
          <div class="chunk-bar-track">
            <div class="chunk-bar-fill" :style="{ width: chunkPercent + '%' }"></div>
          </div>
          <div class="chunk-label">
            {{ chunkStageLabel }} {{ store.currentChunk }}/{{ store.totalChunks }}
            ({{ chunkPercent }}%)
          </div>
        </div>
      </div>
    </div>

    <!-- Step 2: Review Grid -->
    <div
      class="timeline-step"
      :class="{
        active: store.statusStep === 3,
        completed: store.statusStep > 3,
      }"
    >
      <div class="step-indicator">
        <span v-if="store.statusStep > 3">✓</span>
        <span v-else>2</span>
      </div>
      <div class="step-details">
        <div class="step-title">Administrative Review</div>
        <div class="step-desc">Modify question content & categories</div>
      </div>
    </div>

    <!-- Step 3: Vector Store Ingestion -->
    <div
      class="timeline-step"
      :class="{
        active: store.statusStep === 4,
        completed: store.statusStep > 4,
      }"
    >
      <div class="step-indicator">
        <span v-if="store.statusStep > 4">✓</span>
        <span v-else>3</span>
      </div>
      <div class="step-details">
        <div class="step-title">
          Expanding & Ingesting
          <span v-if="store.statusStep === 4" class="spinner"></span>
        </div>
        <div class="step-desc">Generating x5 variations and embedding in Qdrant</div>
        <div
          v-if="store.statusStep === 4 && store.totalChunks > 0"
          class="chunk-progress"
        >
          <div class="chunk-bar-track">
            <div class="chunk-bar-fill" :style="{ width: chunkPercent + '%' }"></div>
          </div>
          <div class="chunk-label">
            {{ chunkStageLabel }} {{ store.currentChunk }}/{{ store.totalChunks }}
            ({{ chunkPercent }}%)
          </div>
        </div>
      </div>
    </div>

    <!-- Step 4: Success -->
    <div
      class="timeline-step"
      :class="{ completed: store.statusStep === 5 }"
    >
      <div class="step-indicator">
        <span v-if="store.statusStep === 5">✓</span>
        <span v-else>4</span>
      </div>
      <div class="step-details">
        <div class="step-title">Success</div>
        <div class="step-desc">Knowledge indexed and queryable!</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useSarStore } from "../../stores/sarStore";
const store = useSarStore();

const chunkPercent = computed(() => {
  if (!store.totalChunks) return 0;
  return Math.round((store.currentChunk / store.totalChunks) * 100);
});

const chunkStageLabel = computed(() => {
  switch (store.progressStage) {
    case "cleaning":
      return "Cleaning batch";
    case "expanding":
      return "Expanding question";
    case "embedding":
      return "Embedding";
    default:
      return "Processing chunk";
  }
});

const extractionDesc = computed(() => {
  if (store.totalFiles > 1) {
    return `Processing document ${store.processedFiles + 1}/${store.totalFiles}: ${store.currentFileName}`;
  }
  return store.currentFileName
    ? `Processing ${store.currentFileName}`
    : "Processing all selected documents";
});
</script>

<style scoped>
.mt-6 { margin-top: 1.5rem; }

.chunk-progress {
  margin-top: 0.5rem;
}
.chunk-bar-track {
  width: 100%;
  height: 6px;
  background: rgba(148, 163, 184, 0.25);
  border-radius: 999px;
  overflow: hidden;
}
.chunk-bar-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.chunk-label {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}
</style>
