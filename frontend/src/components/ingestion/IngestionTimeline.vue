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
        <div class="step-desc">Processing all selected documents</div>
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
import { useSarStore } from "../../stores/sarStore";
const store = useSarStore();
</script>

<style scoped>
.mt-6 { margin-top: 1.5rem; }
</style>
