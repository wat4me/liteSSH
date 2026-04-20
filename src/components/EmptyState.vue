<script setup lang="ts">
</script>

<template>
  <div class="empty-state">
    <div class="empty-visual">
      <div class="terminal-mock">
        <div class="mock-bar">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </div>
        <div class="mock-body">
          <span class="prompt">$</span> ssh connect...
        </div>
      </div>
    </div>
    <h3 class="empty-title">开始连接</h3>
    <p class="empty-desc">返回 <span class="highlight">连接管理</span> 页面开始新的 SSH 会话</p>
  </div>
</template>

<style scoped>
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  user-select: none;
}

.empty-visual {
  margin-bottom: 4px;
}

.terminal-mock {
  width: 220px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  opacity: 0.6;
}

.mock-bar {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg-tertiary);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot.red { background: var(--danger); }
.dot.yellow { background: var(--warning); }
.dot.green { background: var(--success); }

.mock-body {
  padding: 14px 16px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  color: var(--text-secondary);
}

.prompt {
  color: var(--success);
  margin-right: 8px;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.6;
}

.highlight {
  color: var(--accent);
  font-weight: 500;
}
</style>
