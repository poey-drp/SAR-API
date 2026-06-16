<template>
  <div class="dashboard-grid">
    <!-- Left Panel: Configuration & Processing Timeline -->
    <div class="left-column">
      <IngestionSidebar />
      <IngestionTimeline />
      
      <!-- Error Alerts -->
      <div v-if="store.error" class="panel-card error-alert mt-4">
        <span class="error-title">⚠️ Error Encountered</span>
        <p class="error-msg">
          {{ store.error }}
        </p>
        <button class="btn-secondary w-full p-2 mt-3" @click="store.error = null">
          Dismiss
        </button>
      </div>
    </div>

    <!-- Right Panel: FAQ Review Grid & Management -->
    <FaqReviewGrid />
  </div>
</template>

<script setup>
import { onMounted, watch } from "vue";
import { useSarStore } from "../stores/sarStore";
import IngestionSidebar from "./ingestion/IngestionSidebar.vue";
import IngestionTimeline from "./ingestion/IngestionTimeline.vue";
import FaqReviewGrid from "./ingestion/FaqReviewGrid.vue";

const store = useSarStore();

onMounted(() => {
  store.fetchCollections();
});

// Load the existing FAQ list whenever an existing DB is targeted while idle,
// so the grid can manage (add/edit/delete) entries already in the collection.
watch(
  () => [store.targetMode, store.selectedCollection, store.statusStep],
  ([mode, collection, step]) => {
    if (step === 0 && mode === "append" && collection) {
      store.loadExistingFaqs(collection);
    } else {
      store.managingExisting = false;
      store.existingFaqs = [];
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.mt-3 { margin-top: 0.75rem; }
.mt-4 { margin-top: 1rem; }
.p-2 { padding: 0.4rem; }
.w-full { width: 100%; }

.error-alert {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.05);
  padding: 1.25rem;
}

.error-title {
  color: var(--none-color);
  font-weight: 600;
  font-size: 0.9rem;
  display: block;
  margin-bottom: 0.25rem;
}

.error-msg {
  font-size: 0.85rem;
  color: var(--text-secondary);
}
</style>
