const WORKER_URL = "https://image-agent.skunkonsen.workers.dev";

let currentResult = null;
let currentRating = 0;
let currentRealism = "abstract";

const $ = (id) => document.getElementById(id);

// 抽象度レベル選択
document.querySelectorAll("#realismSelector .realism-opt").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentRealism = btn.dataset.v;
    document.querySelectorAll("#realismSelector .realism-opt").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
  });
});

// 星評価
document.querySelectorAll("#stars span").forEach((star) => {
  star.addEventListener("click", () => {
    currentRating = Number(star.dataset.v);
    document.querySelectorAll("#stars span").forEach((s) => {
      s.classList.toggle("active", Number(s.dataset.v) <= currentRating);
    });
  });
});

// 進捗インジケーター制御
function setProgress(step) {
  const ol = $("progressSteps");
  if (!ol) return;
  if (step === 0) {
    ol.hidden = true;
    ol.querySelectorAll("li").forEach((li) => li.classList.remove("active", "done"));
    return;
  }
  ol.hidden = false;
  ol.querySelectorAll("li").forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle("done", n < step);
    li.classList.toggle("active", n === step);
  });
}

// トースト表示
let toastTimer = null;
function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => (t.hidden = true), 300);
  }, 1800);
}

// 生成ボタン
$("generateBtn").addEventListener("click", async () => {
  const category = $("category").value;
  const keyword = $("keyword").value.trim();
  const usage = $("usage").value;
  const needAttr = $("needAttr").checked;
  const realism = currentRealism;

  const btn = $("generateBtn");
  btn.disabled = true;
  btn.textContent = "生成中…（10〜20秒ほど）";

  $("resultCard").hidden = false;
  $("downloadBtn").hidden = true;
  setProgress(1);
  $("statusArea").textContent =
    "① プロンプト設計 → ② 過去ナレッジ参照 → ③ 画像生成 → ④ 品質採点 …";

  // 体感の進捗を進める（実処理は一括だが利用者に流れを見せる）
  const p2 = setTimeout(() => setProgress(2), 1200);
  const p3 = setTimeout(() => setProgress(3), 3000);

  try {
    const res = await fetch(`${WORKER_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, keyword, usage, needAttr, realism }),
    });

    // 本当のエラー内容を取得して表示
    if (!res.ok) {
      let detail = "";
      try {
        const errData = await res.json();
        detail = errData.error || JSON.stringify(errData);
      } catch (_) {
        detail = await res.text();
      }
      throw new Error(`HTTP ${res.status} / ${detail}`);
    }

    const data = await res.json();
    currentResult = data;
    currentRating = 0;
    document.querySelectorAll("#stars span").forEach((s) => s.classList.remove("active"));

    clearTimeout(p2);
    clearTimeout(p3);
    setProgress(4);

    $("resultImage").src = data.imageDataUrl;
    $("downloadBtn").hidden = false;

    const geminiNote = data.geminiUsed
      ? "（Geminiでプロンプト最適化）"
      : "（簡易プロンプトで生成：Gemini枠回復後はより高品質に）";
    const levelNote = data.realismLabel ? `｜表現: ${data.realismLabel}` : "";

    let qualityNote = "";
    if (data.qualityScore !== null && data.qualityScore !== undefined) {
      const improved = data.autoImproved ? "／自動改善済み🔧" : "";
      qualityNote = `｜品質: ${data.qualityScore}点${improved}`;
      if (data.qualityComment) {
        qualityNote += `（AI講評: ${data.qualityComment}）`;
      }
    }

    const ngNote =
      data.referencedNg && data.referencedNg > 0
        ? `｜回避傾向: ${data.referencedNg}件`
        : "";

    $("statusArea").textContent =
      `✅ 生成完了 ${geminiNote}${levelNote}${qualityNote}｜参照ナレッジ: ${data.referencedKnowledge}件${ngNote}`;

    if (needAttr) {
      $("attrArea").hidden = false;
      $("altText").value = data.alt;
      $("fetchPriority").value = data.fetchpriority;
      $("htmlTag").value =
        `<img src="画像URL" alt="${data.alt}" fetchpriority="${data.fetchpriority}" loading="lazy" />`;
    } else {
      $("attrArea").hidden = true;
    }

    // 少し余韻を置いて進捗を閉じる
    setTimeout(() => setProgress(0), 800);
  } catch (e) {
    clearTimeout(p2);
    clearTimeout(p3);
    setProgress(0);
    $("statusArea").textContent = "⚠️ エラー詳細: " + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ ";
  }
});

// 画像ダウンロード
$("downloadBtn").addEventListener("click", () => {
  if (!currentResult || !currentResult.imageDataUrl) return;
  const a = document.createElement("a");
  a.href = currentResult.imageDataUrl;
  const cat = (currentResult.category || "image").replace(/[\\/:*?"<>|]/g, "_");
  const lv = currentResult.realism || "abstract";
  a.download = `imagenic_${cat}_${lv}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("画像を保存しました");
});

// HTMLタグをコピー
$("copyTagBtn").addEventListener("click", async () => {
  const text = $("htmlTag").value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast("HTMLタグをコピーしました");
  } catch (_) {
    // クリップボードAPI非対応時のフォールバック
    const ta = $("htmlTag");
    ta.removeAttribute("readonly");
    ta.select();
    document.execCommand("copy");
    ta.setAttribute("readonly", "");
    showToast("HTMLタグをコピーしました");
  }
});

// 採用／却下
$("approveBtn").addEventListener("click", () => sendFeedback("approved"));
$("rejectBtn").addEventListener("click", () => sendFeedback("rejected"));

async function sendFeedback(decision) {
  if (!currentResult) return;
  const payload = {
    decision,
    rating: currentRating,
    fixComment: $("fixComment").value.trim(),
    category: currentResult.category,
    realism: currentResult.realism,
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
        ? "✅ 採用を記録しました。次回のお手本として学習されます。"
        : "❌ 却下を記録しました。次回はこの傾向を避けます。";
  } catch (e) {
    $("statusArea").textContent = "⚠️ " + e.message;
  }
}

// 学習ダッシュボード
$("loadStatsBtn").addEventListener("click", async () => {
  try {
    const res = await fetch(`${WORKER_URL}/stats`);
    const s = await res.json();
    const avgQ =
      s.avgQualityScore !== undefined && s.avgQualityScore !== null
        ? s.avgQualityScore
        : 0;
    $("statsArea").innerHTML = `
      <div class="stat-box"><div class="num">${s.totalGenerated}</div><div class="lbl">累計生成数</div></div>
      <div class="stat-box"><div class="num">${s.approved}</div><div class="lbl">採用数</div></div>
      <div class="stat-box"><div class="num">${s.approvalRate}%</div><div class="lbl">採用率</div></div>
      <div class="stat-box"><div class="num">${s.knowledgeCount}</div><div class="lbl">お手本ナレッジ数</div></div>
      <div class="stat-box"><div class="num">${s.avgRating}</div><div class="lbl">平均評価</div></div>
      <div class="stat-box"><div class="num">${avgQ}</div><div class="lbl">平均品質スコア</div></div>
    `;
  } catch (e) {
    $("statsArea").textContent = "読み込み失敗: " + e.message;
  }
});
