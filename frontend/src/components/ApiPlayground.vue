<template>
  <div class="playground-grid">
    <!-- Left Column: DB selector & API details -->
    <div class="left-column">
      <div class="panel-card">
        <h3 style="margin-bottom: 1rem">Target Database</h3>
        <div class="form-group">
          <label class="form-label">Active Database</label>
          <select
            class="input-control"
            v-model="store.selectedCollection"
            @change="clearChat"
          >
            <option value="" disabled>-- Select a database to test --</option>
            <option v-for="col in store.collections" :key="col" :value="col">
              {{ col }}
            </option>
          </select>
        </div>
      </div>

      <!-- API Details Card -->
      <div
        v-if="store.selectedCollection"
        class="panel-card"
        style="margin-top: 1rem"
      >
        <h3 style="margin-bottom: 0.75rem">REST API Endpoint</h3>
        <p
          style="
            font-size: 0.8rem;
            color: var(--text-secondary);
            margin-bottom: 1rem;
          "
        >
          External systems can query this database by calling this URL.
        </p>

        <label class="form-label">Endpoint URL</label>
        <div class="copy-endpoint-box">
          <span class="endpoint-text">{{ endpointUrl }}</span>
          <button class="btn-copy" @click="copyText(endpointUrl, 'url')">
            {{ copiedUrl ? "Copied!" : "Copy" }}
          </button>
        </div>

        <label class="form-label" style="margin-top: 1.5rem"
          >CURL Integration</label
        >
        <div class="codebox-curl">
          {{ curlCommand }}
        </div>
        <button
          class="btn-secondary"
          style="
            margin-top: 0.75rem;
            width: 100%;
            font-size: 0.8rem;
            padding: 0.4rem 0;
          "
          @click="copyText(curlCommand, 'curl')"
        >
          {{ copiedCurl ? "Curl Command Copied!" : "Copy Curl Command" }}
        </button>

        <div class="general-knowledge-toggle">
          <label class="toggle-row">
            <input
              type="checkbox"
              v-model="allowOwnKnowledge"
              @change="clearChat"
            />
            <span>Allow general-knowledge fallback</span>
          </label>
          <p>
            Default off: SAR only answers from the knowledge base. Turn this on
            only when the LLM may answer outside the stored FAQs.
          </p>
        </div>
      </div>

      <div
        v-else
        class="panel-card"
        style="
          margin-top: 1rem;
          text-align: center;
          color: var(--text-muted);
          padding: 2rem 1.5rem;
        "
      >
        <p style="font-size: 0.85rem">
          Select an active database to view API endpoints and curl examples.
        </p>
      </div>
    </div>

    <!-- Right Column: Interactive Chat Simulation -->
    <div
      class="right-column panel-card"
      style="padding: 1.5rem; display: flex; flex-direction: column"
    >
      <div
        class="card-title-bar"
        style="margin-bottom: 1rem; padding-bottom: 0.75rem"
      >
        <div>
          <h2>SAR Precision Chat Tester</h2>
          <p
            style="
              font-size: 0.8rem;
              color: var(--text-muted);
              margin-top: 0.15rem;
            "
          >
            Test retrieval score thresholding and context synthesis.
          </p>
        </div>
        <button
          class="btn-secondary"
          style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
          @click="clearChat"
          :disabled="messages.length === 0"
        >
          Clear History
        </button>
      </div>

      <!-- Legend Panel -->
      <div class="legend-panel">
        <div class="legend-item">
          <strong>Score:</strong> The confidence score from the knowledge base
        </div>
        <div class="legend-badges">
          <div class="badge-group">
            <span class="status-badge match-strong">
              <span class="dot"></span>STRONG MATCH
            </span>
            <span class="badge-desc">Direct answer found</span>
          </div>
          <div class="badge-group">
            <span class="status-badge match-related">
              <span class="dot"></span>RELATED MATCH
            </span>
            <span class="badge-desc">Related evidence found</span>
          </div>
          <div class="badge-group">
            <span class="status-badge match-weak">
              <span class="dot"></span>WEAK MATCH
            </span>
            <span class="badge-desc">Unsupported fallback</span>
          </div>
        </div>
        <div class="legend-item">
          <strong>Debug Logs:</strong> Click to view the actual retrieved
          database passages
        </div>
      </div>

      <!-- Chat workspace pane -->
      <div class="chat-workspace">
        <!-- Welcoming simulator screen -->
        <div v-if="!store.selectedCollection" class="welcome-sim">
          <div class="welcome-sim-icon">💬</div>
          <h3>Select a Database</h3>
          <p style="font-size: 0.85rem; max-width: 350px">
            Choose one of your indexed collections from the left panel to begin
            querying.
          </p>
        </div>

        <div v-else-if="messages.length === 0" class="welcome-sim">
          <div class="welcome-sim-icon">🤖</div>
          <h3>Simulating: {{ store.selectedCollection }}</h3>
          <p style="font-size: 0.85rem; max-width: 350px">
            Ask a question in Thai or English to test SAR matching.
          </p>
        </div>

        <!-- Scrollable messages container -->
        <div v-else class="chat-messages" ref="chatScrollContainer">
          <div
            v-for="(msg, index) in messages"
            :key="index"
            class="chat-bubble-container"
            :class="msg.role"
          >
            <!-- Chat bubble -->
            <div class="chat-bubble">
              {{ msg.content }}
            </div>

            <!-- Metadata & Debugger panel -->
            <div v-if="msg.role === 'bot'" class="bubble-meta">
              <span
                class="badge"
                :class="msg.matchType"
                style="font-weight: 600"
              >
                <template v-if="msg.matchType !== 'own_knowledge'">
                  Score: {{ msg.score.toFixed(3) }}
                </template>
                {{ getMatchLabel(msg.matchType) }}
              </span>
              <button
                v-if="msg.context && msg.context.length > 0"
                class="debug-details-link"
                @click="msg.showDebug = !msg.showDebug"
              >
                {{ msg.showDebug ? "Hide Debug" : "Debug Logs" }}
              </button>
            </div>

            <!-- Debug collapse panel -->
            <div
              v-if="msg.role === 'bot' && msg.showDebug"
              class="chat-debug-card"
            >
              <div class="debug-metric-row">
                <span>Reranker Match Score</span>
                <strong>{{ msg.score.toFixed(4) }}</strong>
              </div>
              <div class="debug-metric-row">
                <span>Sources Refereed</span>
                <span style="color: #60a5fa">{{
                  msg.sources.join(", ") || "None"
                }}</span>
              </div>

              <div class="debug-contexts-title" style="margin-top: 0.25rem">
                Retrieved Database Passages
              </div>
              <div
                v-for="(ctx, cIdx) in msg.context"
                :key="cIdx"
                class="debug-context-item"
              >
                <div class="debug-context-meta">
                  <span>File: {{ ctx.source_file }}</span>
                  <span v-if="ctx.category">Category: {{ ctx.category }}</span>
                </div>
                <div class="debug-context-body">{{ ctx.content }}</div>
              </div>
            </div>
          </div>

          <!-- Typing loading state -->
          <div v-if="botTyping" class="chat-bubble-container bot">
            <div
              class="chat-bubble"
              style="display: flex; align-items: center; gap: 0.25rem"
            >
              <span
                class="spinner"
                style="
                  border-top-color: var(--text-secondary);
                  width: 12px;
                  height: 12px;
                  margin-left: 0;
                "
              ></span>
              <span style="font-size: 0.85rem; color: var(--text-secondary)"
                >Querying database...</span
              >
            </div>
          </div>
        </div>

        <!-- Chat Input Bar -->
        <div class="chat-input-bar">
          <input
            type="text"
            class="input-control chat-input"
            v-model="userInput"
            placeholder="Type your test query..."
            @keyup.enter="sendMessage"
            :disabled="!store.selectedCollection || botTyping"
          />
          <button
            class="btn-send"
            @click="sendMessage"
            :disabled="
              !store.selectedCollection || botTyping || !userInput.trim()
            "
          >
            <svg viewBox="0 0 24 24">
              <path d="M2,21L23,12L2,3V10L17,12L2,14V21Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from "vue";
import { useSarStore } from "../stores/sarStore";

const store = useSarStore();

const userInput = ref("");
const messages = ref([]);
const botTyping = ref(false);
const chatScrollContainer = ref(null);
const allowOwnKnowledge = ref(false);

const copiedUrl = ref(false);
const copiedCurl = ref(false);

const endpointUrl = computed(() => {
  if (!store.selectedCollection) return "";
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  return `${baseUrl}/api/v1/query/${store.selectedCollection}`;
});

const curlCommand = computed(() => {
  if (!store.selectedCollection) return "";
  return `curl -X POST "${endpointUrl.value}" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "คำถามของคุณ", "chat_history": [], "allow_own_knowledge": ${allowOwnKnowledge.value}}'`;
});

const getMatchLabel = (type) => {
  switch (type) {
    case "exact":
      return ": STRONG MATCH (>=0.525)";
    case "related":
      return ": RELATED MATCH (0.30-0.525)";
    case "own_knowledge":
      return ": General Knowledge";
    default:
      return ": WEAK MATCH (<0.30)";
  }
};

// Send user question to FastAPI dynamic endpoint
const sendMessage = async () => {
  const query = userInput.value.trim();
  if (!query || botTyping.value || !store.selectedCollection) return;

  // 1. Append User Bubble
  messages.value.push({
    role: "user",
    content: query,
  });
  userInput.value = "";

  await scrollToBottom();
  botTyping.value = true;

  // 2. Format chat history payload for query rewriter
  const chatHistory = messages.value
    .slice(0, -1) // Exclude current query
    .map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

  try {
    const data = await store.queryCollection(
      store.selectedCollection,
      query,
      chatHistory,
      allowOwnKnowledge.value,
    );

    // 3. Append Bot Bubble
    messages.value.push({
      role: "bot",
      content: data.response,
      matchType: data.match_type,
      score: data.score,
      sources: data.sources || [],
      context: data.context || [],
      showDebug: false,
    });
  } catch (err) {
    messages.value.push({
      role: "bot",
      content: `⚠️ Failed to query service. Connection issue or bad API response: ${err.message}`,
      matchType: "none",
      score: 0,
      sources: [],
      context: [],
      showDebug: false,
    });
  } finally {
    botTyping.value = false;
    await scrollToBottom();
  }
};

const clearChat = () => {
  messages.value = [];
  store.error = null;
};

const scrollToBottom = async () => {
  await nextTick();
  if (chatScrollContainer.value) {
    chatScrollContainer.value.scrollTop =
      chatScrollContainer.value.scrollHeight;
  }
};

const copyText = (text, type) => {
  navigator.clipboard.writeText(text).then(() => {
    if (type === "url") {
      copiedUrl.value = true;
      setTimeout(() => {
        copiedUrl.value = false;
      }, 2000);
    } else if (type === "curl") {
      copiedCurl.value = true;
      setTimeout(() => {
        copiedCurl.value = false;
      }, 2000);
    }
  });
};
</script>

<style scoped>
.legend-panel {
  font-size: 0.8rem;
  background: var(--bg-card, #ffffff);
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.legend-item {
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

.legend-item strong {
  color: var(--text-primary);
  font-weight: 600;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-badges {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
  align-items: center;
}

.badge-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.6rem;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.7rem;
  border: 1px solid transparent;
}

.status-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.match-strong {
  background: #ecfdf5;
  color: #065f46;
  border-color: #a7f3d0;
}
.match-strong .dot {
  background-color: #10b981;
}

.match-related {
  background: #fffbeb;
  color: #92400e;
  border-color: #fde68a;
}
.match-related .dot {
  background-color: #f59e0b;
}

.match-weak {
  background: #f3f4f6;
  color: #374151;
  border-color: #e5e7eb;
}
.match-weak .dot {
  background-color: #6b7280;
}

.badge-desc {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.general-knowledge-toggle {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-primary);
  cursor: pointer;
}

.general-knowledge-toggle p {
  margin-top: 0.4rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--text-muted);
}
</style>
