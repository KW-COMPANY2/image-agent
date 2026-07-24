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

// タスク名を日本語ラベルに変換
function taskLabel(t) {
  const map = {
    design: "プロンプト設計",
    enrich_keyword: "キーワード補強",
    generate: "画像生成",
    strict_check: "厳格チェック",
    diversity_boost: "多様性強化",
    evaluate: "多角評価",
    attr: "属性生成",
  };
  return map[t] || t;
}

// 分岐結果を日本語ラベルに変換
function branchLabel(b) {
  const map = {
    as_is: "そのまま採用",
    improved: "弱点特化で再生成🔧",
    sanitized: "安全化で差し替え🛡",
  };
  return map[b] || b;
}

// 評価軸名を日本語ラベルに変換
function axisLabel(a) {
  const map = {
    quality: "品質",
    relevance: "適合",
    safety: "安全",
    diversity: "多様",
    aesthetics: "美的",
    clarity: "明瞭",
  };
  return map[a] || a;
}

// 外部ツール名を日本語ラベルに変換
function toolLabel(t) {
  const map = {
    color: "配色API",
    related: "関連語API",
    refmeta: "参照メタAPI",
  };
  return map[t] || t;
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
    "① 計画 → ② 外部ツール連携 → ③ 複数案設計＆選抜 → ④ 生成 → ⑤ 6軸評価 …";

  const p2 = setTimeout(() => setProgress(2), 1200);
  const p3 = setTimeout(() => setProgress(3), 3000);

  try {
    const res = await fetch(`${WORKER_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, keyword, usage, needAttr, realism }),
    });

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

    // 動的計画の表示
    let planNote = "";
    if (data.plan && Array.isArray(data.plan.tasks)) {
      const flow = data.plan.tasks.map(taskLabel).join("→");
      const summary = data.plan.summary ? `（${data.plan.summary}）` : "";
      planNote = `\n🧭 今回の計画: ${flow}${summary}`;
    }

    // 外部ツール連携の表示
    let toolNote = "";
    if (data.tools) {
      const ok = [];
      if (data.tools.color) ok.push(toolLabel("color"));
      if (data.tools.related) ok.push(toolLabel("related"));
      if (data.tools.refmeta) ok.push(toolLabel("refmeta"));
      toolNote = `\n🔌 外部連携: ${ok.length ? ok.join("・") + " 使用" : "なし"}`;
      if (Array.isArray(data.tools.failed) && data.tools.failed.length) {
        toolNote += `（保険発動: ${data.tools.failed.map(toolLabel).join("・")}）`;
      }
      if (Array.isArray(data.tools.relatedWords) && data.tools.relatedWords.length) {
        toolNote += `\n🔤 拡張された関連概念: ${data.tools.relatedWords.join(", ")}`;
      }
    }

    // Best-of-N の表示
    let candNote = "";
    if (data.candidates && data.candidates.count > 1) {
      const idx = data.candidates.chosenIndex;
      const scores = Array.isArray(data.candidates.scores)
        ? data.candidates.scores.map((s) => (s === null ? "-" : s)).join("/")
        : "";
      candNote = `\n🎯 複数案から選抜: ${data.candidates.count}案中 第${idx + 1}案を採用`;
      if (scores) candNote += `（各案スコア: ${scores}）`;
    }

    // 6軸評価の表示
    let evalNote = "";
    if (data.evaluation && data.evaluation.axes) {
      const a = data.evaluation.axes;
      const fmt = (v) => (v === null || v === undefined ? "-" : v);
      evalNote =
        `\n📊 6軸評価: 品質${fmt(a.quality)}/適合${fmt(a.relevance)}/安全${fmt(a.safety)}` +
        `/多様${fmt(a.diversity)}/美的${fmt(a.aesthetics)}/明瞭${fmt(a.clarity)}` +
        `｜総合${data.evaluation.overall === null ? "-" : data.evaluation.overall}点`;
      if (Array.isArray(data.evaluation.weakAxes) && data.evaluation.weakAxes.length > 0) {
        evalNote += `\n🔍 弱点軸: ${data.evaluation.weakAxes.map(axisLabel).join("・")}`;
      }
      if (data.evaluation.moderationFlagged) {
        evalNote += `\n⚠ モデレーション: ${data.evaluation.moderationReason || "要注意"}`;
      }
      if (data.evaluation.critique) {
        evalNote += `\n💬 AI講評: ${data.evaluation.critique}`;
      }
    } else if (data.qualityScore !== null && data.qualityScore !== undefined) {
      evalNote = `\n📊 品質: ${data.qualityScore}点`;
      if (data.qualityComment) evalNote += `（AI講評: ${data.qualityComment}）`;
    }

    // 判定分岐の表示
    let branchNote = "";
    if (data.decisionBranch) {
      branchNote = `\n✅ 判定: ${branchLabel(data.decisionBranch)}`;
    }

    const ngNote =
      data.referencedNg && data.referencedNg > 0
        ? `｜回避傾向: ${data.referencedNg}件`
        : "";

    const statusEl = $("statusArea");
    statusEl.style.whiteSpace = "pre-line";
    statusEl.textContent =
      `✅ 生成完了 ${geminiNote}${levelNote}｜参照ナレッジ: ${data.referencedKnowledge}件${ngNote}` +
      planNote + toolNote + candNote + evalNote + branchNote;

    if (needAttr) {
      $("attrArea").hidden = false;
      $("altText").value = data.alt;
      $("fetchPriority").value = data.fetchpriority;
      $("htmlTag").value =
        `<img src="画像URL" alt="${data.alt}" fetchpriority="${data.fetchpriority}" loading="lazy" />`;
    } else {
      $("attrArea").hidden = true;
    }

    setTimeout(() => setProgress(0), 800);
  } catch (e) {
    clearTimeout(p2);
    clearTimeout(p3);
    setProgress(0);
    $("statusArea").style.whiteSpace = "normal";
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
    $("statusArea").style.whiteSpace = "normal";
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
