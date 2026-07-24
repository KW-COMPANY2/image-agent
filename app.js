// File: app.js

// ▼▼▼ あなたのWorkerのURL（設定済み） ▼▼▼
const WORKER_URL = "https://image-agent.skunkonsen.workers.dev";
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

let currentResult = null; // 直近の生成結果を保持
let currentRating = 0;

const $ = (id) => document.getElementById(id);

// 星評価
document.querySelectorAll("#stars span").forEach((star) => {
  star.addEventListener("click", () => {
    currentRating = Number(star.dataset.v);
    document.querySelectorAll("#stars span").forEach((s) => {
      s.classList.toggle("active", Number(s.dataset.v) <= currentRating);
    });
  });
});

// 生成ボタン
$("generateBtn").addEventListener("click", async () => {
  const category = $("category").value;
  const keyword = $("keyword").value.trim();
  const usage = $("usage").value;
  const needAttr = $("needAttr").checked;

  const btn = $("generateBtn");
  btn.disabled = true;
  btn.textContent = "生成中…（10〜20秒ほど）";

  $("resultCard").hidden = false;
  $("statusArea").textContent =
    "① プロンプト設計 → ② 過去ナレッジ参照 → ③ 画像生成 → ④ 属性生成 …";

  try {
    const res = await fetch(`${WORKER_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, keyword, usage, needAttr }),
    });
    if (!res.ok) throw new Error("生成に失敗しました（無料枠超過の可能性）");
    const data = await res.json();
    currentResult = data;
    currentRating = 0;
    document.querySelectorAll("#stars span").forEach((s) => s.classList.remove("active"));

    $("resultImage").src = data.imageDataUrl;
    $("statusArea").textContent = `✅ 生成完了（参照した過去ナレッジ: ${data.referencedKnowledge}件）`;

    if (needAttr) {
      $("attrArea").hidden = false;
      $("altText").value = data.alt;
      $("fetchPriority").value = data.fetchpriority;
      $("htmlTag").value =
        `<img src="画像URL" alt="${data.alt}" fetchpriority="${data.fetchpriority}" loading="lazy" />`;
    } else {
      $("attrArea").hidden = true;
    }
  } catch (e) {
    $("statusArea").textContent = "⚠️ " + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ 画像を生成する";
  }
});

// 採用／却下（Closed Loop）
$("approveBtn").addEventListener("click", () => sendFeedback("approved"));
$("rejectBtn").addEventListener("click", () => sendFeedback("rejected"));

async function sendFeedback(decision) {
  if (!currentResult) return;
  const payload = {
    decision,
    rating: currentRating,
    fixComment: $("fixComment").value.trim(),
    category: currentResult.category,
    prompt: currentResult.prompt,
    alt: $("altText").value,
    generatedAlt: currentResult.alt,
  };
  try {
    const res = await fetch(`${WORKER_URL}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("記録に失敗");
    $("statusArea").textContent =
      decision === "approved"
        ? "✅ 採用を記録しました。このプロンプトは次回のお手本として学習されます。"
        : "❌ 却下を記録しました。次回はこの傾向を避けるよう調整されます。";
  } catch (e) {
    $("statusArea").textContent = "⚠️ " + e.message;
  }
}

// 学習ダッシュボード
$("loadStatsBtn").addEventListener("click", async () => {
  try {
    const res = await fetch(`${WORKER_URL}/stats`);
    const s = await res.json();
    $("statsArea").innerHTML = `
      <div class="stat-box"><div class="num">${s.totalGenerated}</div><div class="lbl">累計生成数</div></div>
      <div class="stat-box"><div class="num">${s.approved}</div><div class="lbl">採用数</div></div>
      <div class="stat-box"><div class="num">${s.approvalRate}%</div><div class="lbl">採用率</div></div>
      <div class="stat-box"><div class="num">${s.knowledgeCount}</div><div class="lbl">お手本ナレッジ数</div></div>
      <div class="stat-box"><div class="num">${s.avgRating}</div><div class="lbl">平均評価</div></div>
    `;
  } catch (e) {
    $("statsArea").textContent = "読み込み失敗: " + e.message;
  }
});
