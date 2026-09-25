/**
 * まなびノート - 小学校向け学習アプリ
 * Phase 2: 手書きCanvas（Pointer Events）＋ 数字認識 ＋ 1タップ修正 ＋ 大型テンキー
 */

class MathGridApp {
  constructor() {
    this.gridSize = 5; // 5x5マス（プロトタイプ）
    this.operation = '+';
    this.rowHeaders = [];
    this.colHeaders = [];
    this.activeCell = { row: 0, col: 0 };
    this.answers = []; // 5x5 2D配列 (表示用)
    this.details = []; // 5x5 2D配列 (ResultDetail構造)
    this.totalCells = this.gridSize * this.gridSize;

    // ストローク認識エンジン
    this.recognizer = new StrokeRecognizer();

    // Canvas関連の状態
    this.isDrawing = false;
    this.currentStroke = null;
    this.currentStrokes = []; // 現在のマスに書かれたストローク群
    this.recognitionTimer = null;
    this.autoAdvanceTimer = null;

    // DOM要素キャッシュ
    this.gridContainer = document.getElementById('math-grid');
    this.calcFormulaEl = document.getElementById('calc-formula');
    this.progressCountEl = document.getElementById('progress-count');
    this.btnPrevCell = document.getElementById('btn-prev-cell');
    this.btnNextCell = document.getElementById('btn-next-cell');

    // Phase 2 入力要素キャッシュ
    this.tabHandwriting = document.getElementById('tab-handwriting');
    this.tabKeypad = document.getElementById('tab-keypad');
    this.handwritingPanel = document.getElementById('handwriting-panel');
    this.keypadPanel = document.getElementById('keypad-panel');

    this.canvas = document.getElementById('draw-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.canvasWatermark = document.querySelector('.canvas-watermark');
    this.btnClearCanvas = document.getElementById('btn-clear-canvas');
    this.btnConfirmNext = document.getElementById('btn-confirm-next');

    this.recogBadge = document.getElementById('recog-badge');
    this.quickCorrectionBar = document.getElementById('quick-correction-bar');

    // Phase 3 結果モーダル & 終了・見直し要素
    this.btnQuit = document.getElementById('btn-quit');
    this.resultModal = document.getElementById('result-modal');
    this.resultCorrectCount = document.getElementById('result-correct-count');
    this.resultTotalCount = document.getElementById('result-total-count');
    this.resultAccuracyTag = document.getElementById('result-accuracy-tag');
    this.bdCorrect = document.getElementById('bd-correct');
    this.bdIncorrect = document.getElementById('bd-incorrect');
    this.bdUnanswered = document.getElementById('bd-unanswered');
    this.bdCorrections = document.getElementById('bd-corrections');
    this.btnReviewAnswers = document.getElementById('btn-review-answers');
    this.btnRestart = document.getElementById('btn-restart');
    this.isTestFinished = false;

    // 利き手（左利き/右利き）状態
    this.workspaceLayout = document.getElementById('workspace-layout');
    this.btnHandToggle = document.getElementById('btn-hand-toggle');
    this.handPreference = localStorage.getItem('manabi_hand_preference') || 'right';

    this.init();
  }

  /**
   * 初期化
   */
  init() {
    this.generateHeaders();
    this.initAnswers();
    this.renderGrid();
    this.initCanvas();
    this.applyHandPreference();
    this.setActiveCell(0, 0);
    this.attachEventListeners();
    this.updateProgress();
    console.log('MathGridApp initialized successfully.');
  }

  /**
   * 1桁の数字（1〜9）を重複なくランダムに選択して見出しを生成
   */
  generateHeaders() {
    const shuffle = (array) => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    this.rowHeaders = shuffle(digits).slice(0, this.gridSize);
    this.colHeaders = shuffle(digits).slice(0, this.gridSize);
  }

  /**
   * 解答配列およびResultDetail詳細モデルの初期化
   */
  initAnswers() {
    this.answers = Array.from({ length: this.gridSize }, () =>
      Array.from({ length: this.gridSize }, () => '')
    );

    // 指針に基づくResultDetailの初期化
    this.details = Array.from({ length: this.gridSize }, (_, r) =>
      Array.from({ length: this.gridSize }, (_, c) => {
        const rowNum = this.rowHeaders[r];
        const colNum = this.colHeaders[c];
        return {
          index: r * this.gridSize + c,
          rowNum,
          colNum,
          operation: this.operation,
          correctAnswer: rowNum + colNum,
          recognizedAnswer: null, // 認識エンジンが最初に認識した値
          studentAnswer: null,    // 児童が確定した値
          isCorrect: false,
          correctionUsed: false,  // 修正を利用したか
          elapsedMs: 0,
          strokes: []             // 筆跡データ
        };
      })
    );
  }

  /**
   * 6×6（演算子マス1 + 見出し5 + 解答25）のDOMグリッドを構築
   */
  renderGrid() {
    this.gridContainer.innerHTML = '';

    // (0, 0) 演算子マス
    const opCell = document.createElement('div');
    opCell.className = 'grid-cell op-cell';
    opCell.textContent = this.operation;
    this.gridContainer.appendChild(opCell);

    // (0, 1..5) 列見出しマス
    for (let c = 0; c < this.gridSize; c++) {
      const colCell = document.createElement('div');
      colCell.className = 'grid-cell col-header';
      colCell.textContent = this.colHeaders[c];
      colCell.setAttribute('data-col', c);
      this.gridContainer.appendChild(colCell);
    }

    // 各行（行見出し + 5つの解答マス）
    for (let r = 0; r < this.gridSize; r++) {
      // (r+1, 0) 行見出しマス
      const rowCell = document.createElement('div');
      rowCell.className = 'grid-cell row-header';
      rowCell.textContent = this.rowHeaders[r];
      rowCell.setAttribute('data-row', r);
      this.gridContainer.appendChild(rowCell);

      // (r+1, 1..5) 解答マス
      for (let c = 0; c < this.gridSize; c++) {
        const ansCell = document.createElement('div');
        ansCell.className = 'grid-cell answer-cell';
        ansCell.setAttribute('data-row', r);
        ansCell.setAttribute('data-col', c);
        ansCell.setAttribute('tabindex', '0');
        ansCell.setAttribute('role', 'gridcell');
        ansCell.setAttribute('aria-label', `${this.rowHeaders[r]} たす ${this.colHeaders[c]}`);

        const val = this.answers[r][c];
        if (val !== '') {
          ansCell.textContent = val;
          ansCell.classList.add('is-filled');
        }

        // タップ / クリックでそのマスを選択
        ansCell.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.setActiveCell(r, c);
        });

        this.gridContainer.appendChild(ansCell);
      }
    }
  }

  /**
   * 利き手（右利き・左利き）設定の適用
   */
  applyHandPreference() {
    if (!this.workspaceLayout || !this.btnHandToggle) return;

    if (this.handPreference === 'left') {
      this.workspaceLayout.classList.add('is-left-handed');
      this.btnHandToggle.textContent = '🤚 ひだりきき';
      this.btnHandToggle.classList.add('is-left');
    } else {
      this.workspaceLayout.classList.remove('is-left-handed');
      this.btnHandToggle.textContent = '🖐️ みぎきき';
      this.btnHandToggle.classList.remove('is-left');
    }
  }

  /**
   * 利き手の切り替え
   */
  toggleHandPreference() {
    this.handPreference = this.handPreference === 'right' ? 'left' : 'right';
    try {
      localStorage.setItem('manabi_hand_preference', this.handPreference);
    } catch (_) {}
    this.applyHandPreference();

    // レイアウト反転に伴うCanvasの再調整
    setTimeout(() => {
      this.initCanvas();
      if (this.currentStrokes.length > 0) {
        this.redrawStrokes(this.currentStrokes);
      }
    }, 60);
  }

  /**
   * 手書きCanvasの解像度調整およびPointer Events初期化
   */
  initCanvas() {
    if (!this.canvas) return;

    // Retina / High-DPI ディスプレイ対応
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    // 描画スタイルの設定（小学生向けの太くはっきりした線）
    this.ctx.lineWidth = 7;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#1e293b';

    if (this.canvasListenersAttached) return;
    this.canvasListenersAttached = true;

    // Pointer Events（pen, touch, mouse 全対応）
    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointerleave', (e) => {
      if (this.isDrawing) this.handlePointerUp(e);
    });
  }

  /**
   * Canvasの座標変換（CSSピクセル基準）
   */
  getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      time: performance.now()
    };
  }

  handlePointerDown(e) {
    e.preventDefault();
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    if (this.recognitionTimer) {
      clearTimeout(this.recognitionTimer);
      this.recognitionTimer = null;
    }

    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    this.isDrawing = true;
    const pt = this.getCanvasPoint(e);
    this.currentStroke = { points: [pt] };

    // ウォーターマーク非表示
    if (this.canvasWatermark) {
      this.canvasWatermark.classList.add('is-hidden');
    }

    this.ctx.beginPath();
    this.ctx.moveTo(pt.x, pt.y);
  }

  handlePointerMove(e) {
    if (!this.isDrawing) return;
    e.preventDefault();

    const pt = this.getCanvasPoint(e);
    this.currentStroke.points.push(pt);

    this.ctx.lineTo(pt.x, pt.y);
    this.ctx.stroke();
  }

  handlePointerUp(e) {
    if (!this.isDrawing) return;
    e.preventDefault();
    this.isDrawing = false;

    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (this.currentStroke && this.currentStroke.points.length > 0) {
      this.currentStrokes.push(this.currentStroke);
      this.currentStroke = null;
    }

    // ストローク停止から350ms後に自動認識を実行（テンポを崩さない設計）
    this.scheduleRecognition();
  }

  /**
   * 自動認識のスケジュール（筆記停止の検知）
   */
  scheduleRecognition() {
    if (this.recognitionTimer) {
      clearTimeout(this.recognitionTimer);
    }

    this.recognitionTimer = setTimeout(() => {
      this.runRecognition();
    }, 360);
  }

  /**
   * ストローク認識の実行とマスへの反映
   */
  runRecognition() {
    if (this.currentStrokes.length === 0) return;

    const result = this.recognizer.recognize(this.currentStrokes);
    if (!result || result.answer === '') return;

    const { row, col } = this.activeCell;
    const detail = this.details[row][col];

    // ストロークの保存
    detail.strokes = JSON.parse(JSON.stringify(this.currentStrokes));

    // 初回認識値の保存（修正前に保持）
    if (detail.recognizedAnswer === null) {
      detail.recognizedAnswer = result.answer;
    }

    // 児童の確定値にも一旦反映
    detail.studentAnswer = result.answer;

    // UI更新
    this.setAnswer(row, col, result.answer);
    this.updateRecogBadge(result.answer);
    this.highlightCorrectionButton(result.answer);

    console.log(`[認識完了] マス(${row}, ${col}) 認識結果: ${result.answer} (確信度: ${result.confidence})`);
  }

  /**
   * 1タップ修正の適用（誤認識時）
   */
  applyCorrection(selectedNum) {
    const { row, col } = this.activeCell;
    const detail = this.details[row][col];

    // 児童が修正したフラグを立てる
    detail.correctionUsed = true;
    detail.studentAnswer = String(selectedNum);

    // UI更新
    this.setAnswer(row, col, String(selectedNum));
    this.updateRecogBadge(String(selectedNum));
    this.highlightCorrectionButton(String(selectedNum));

    console.log(`[1タップ修正] マス(${row}, ${col}) 児童が修正: ${selectedNum} (元の認識: ${detail.recognizedAnswer})`);

    // テンポよく解けるよう、修正後280msで自動的に次のマスへ進む
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
    this.autoAdvanceTimer = setTimeout(() => {
      this.moveToNextCell();
    }, 280);
  }

  /**
   * 大型テンキーからの直接入力
   */
  handleKeypadInput(key) {
    const { row, col } = this.activeCell;
    const detail = this.details[row][col];

    if (key === 'clear') {
      this.clearCurrentCell();
      return;
    }

    if (key === 'enter') {
      this.moveToNextCell();
      return;
    }

    // 0〜9の数字
    const currentVal = String(this.answers[row][col] || '');
    let newVal = key;

    // 2桁入力のサポート（例: 1を押した後に5で15）
    if (currentVal !== '' && currentVal.length === 1) {
      newVal = currentVal + key;
    }

    detail.recognizedAnswer = null; // テンキー入力のため手書き認識なし
    detail.studentAnswer = newVal;
    detail.correctionUsed = false;

    this.setAnswer(row, col, newVal);
    this.updateRecogBadge(newVal);
    this.highlightCorrectionButton(newVal.length === 1 ? newVal : null);

    // 2桁入力または一巡で自動送り
    if (newVal.length >= 2 || parseInt(newVal, 10) >= 10) {
      if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = setTimeout(() => {
        this.moveToNextCell();
      }, 200);
    }
  }

  /**
   * 認識結果バッジの表示更新
   */
  updateRecogBadge(val) {
    if (this.recogBadge) {
      this.recogBadge.textContent = val !== '' && val !== null ? val : '-';
    }
  }

  /**
   * 修正バーのボタンハイライト
   */
  highlightCorrectionButton(num) {
    if (!this.quickCorrectionBar) return;
    const buttons = this.quickCorrectionBar.querySelectorAll('.btn-correct');
    buttons.forEach(btn => {
      if (btn.getAttribute('data-num') === String(num)) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.remove('is-selected');
      }
    });
  }

  /**
   * 現在のマスの入力をクリア
   */
  clearCurrentCell() {
    const { row, col } = this.activeCell;
    this.answers[row][col] = '';
    const detail = this.details[row][col];
    detail.studentAnswer = null;
    detail.recognizedAnswer = null;
    detail.strokes = [];
    detail.correctionUsed = false;

    this.currentStrokes = [];
    this.clearCanvas();
    this.setAnswer(row, col, '');
    this.updateRecogBadge('-');
    this.highlightCorrectionButton(null);
  }

  /**
   * Canvasの描画クリア
   */
  clearCanvas() {
    if (!this.ctx || !this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    if (this.canvasWatermark) {
      this.canvasWatermark.classList.remove('is-hidden');
    }
  }

  /**
   * 保存済みストロークをCanvasに再描画
   */
  redrawStrokes(strokes) {
    this.clearCanvas();
    if (!strokes || strokes.length === 0 || !this.ctx) return;

    if (this.canvasWatermark) {
      this.canvasWatermark.classList.add('is-hidden');
    }

    this.ctx.save();
    this.ctx.lineWidth = 7;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#1e293b';

    strokes.forEach(stroke => {
      if (!stroke.points || stroke.points.length === 0) return;
      this.ctx.beginPath();
      this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      this.ctx.stroke();
    });

    this.ctx.restore();
  }

  /**
   * 指定したマスをアクティブ（フォーカス）にする
   */
  setActiveCell(row, col) {
    if (row < 0 || row >= this.gridSize || col < 0 || col >= this.gridSize) {
      return;
    }

    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    if (this.recognitionTimer) {
      clearTimeout(this.recognitionTimer);
      this.recognitionTimer = null;
    }

    // 既存のアクティブ解除
    const prevActive = this.gridContainer.querySelector('.answer-cell.is-active');
    if (prevActive) {
      prevActive.classList.remove('is-active');
    }

    this.activeCell = { row, col };

    // 新しいマスをアクティブ化
    const targetCell = this.getCellElement(row, col);
    if (targetCell) {
      targetCell.classList.add('is-active');
      targetCell.focus({ preventScroll: true });
    }

    // 画面下部の式表示を更新
    const rowNum = this.rowHeaders[row];
    const colNum = this.colHeaders[col];
    const detail = this.details[row][col];

    if (this.isTestFinished) {
      if (detail.isCorrect) {
        this.calcFormulaEl.textContent = `${rowNum} ＋ ${colNum} ＝ ${detail.correctAnswer} ⭕ せいかい！`;
      } else {
        const yourAns = detail.studentAnswer !== null && detail.studentAnswer !== '' ? detail.studentAnswer : '未入力';
        this.calcFormulaEl.textContent = `${rowNum} ＋ ${colNum} ＝ ${detail.correctAnswer}（あなたの答え: ${yourAns}）`;
      }
    } else {
      this.calcFormulaEl.textContent = `${rowNum} ＋ ${colNum} ＝ ？`;
    }

    // マスに保存されているストロークや回答の復元
    this.currentStrokes = detail.strokes ? JSON.parse(JSON.stringify(detail.strokes)) : [];
    if (this.currentStrokes.length > 0) {
      this.redrawStrokes(this.currentStrokes);
    } else {
      this.clearCanvas();
    }

    const currentVal = detail.studentAnswer !== null ? detail.studentAnswer : this.answers[row][col];
    this.updateRecogBadge(currentVal || '-');
    this.highlightCorrectionButton(currentVal);
  }

  /**
   * 指定座標のDOM要素を取得
   */
  getCellElement(row, col) {
    return this.gridContainer.querySelector(`.answer-cell[data-row="${row}"][data-col="${col}"]`);
  }

  /**
   * 次のマスへ移動（右へ、行末なら次の行の先頭へ）
   */
  moveToNextCell() {
    let { row, col } = this.activeCell;
    col++;
    if (col >= this.gridSize) {
      col = 0;
      row++;
    }
    if (row >= this.gridSize) {
      console.log('すべてのマスに到達しました');
      return;
    }
    this.setActiveCell(row, col);
  }

  /**
   * 前のマスへ移動（左へ、行頭なら前の行の末尾へ）
   */
  moveToPrevCell() {
    let { row, col } = this.activeCell;
    col--;
    if (col < 0) {
      col = this.gridSize - 1;
      row--;
    }
    if (row < 0) {
      return;
    }
    this.setActiveCell(row, col);
  }

  /**
   * マスに数値をセット
   */
  setAnswer(row, col, value) {
    this.answers[row][col] = value;
    const cellEl = this.getCellElement(row, col);
    if (cellEl) {
      cellEl.textContent = value;
      if (value !== '' && value !== null) {
        cellEl.classList.add('is-filled');
      } else {
        cellEl.classList.remove('is-filled');
      }
    }
    this.updateProgress();
  }

  /**
   * 進捗状況（入力済みマス数）の更新 & 全問回答時の自動採点トリガー
   */
  updateProgress() {
    let filledCount = 0;
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.answers[r][c] !== '' && this.answers[r][c] !== null) {
          filledCount++;
        }
      }
    }
    if (this.progressCountEl) {
      this.progressCountEl.textContent = filledCount;
    }

    // 全マス埋まったら自動で採点・結果表示へ
    if (filledCount === this.totalCells && !this.isTestFinished) {
      setTimeout(() => {
        this.finishTest();
      }, 450);
    }
  }

  /**
   * 自動採点の実行（Phase 3 コアロジック）
   * 基準: isCorrect は studentAnswer と correctAnswer の厳密な比較により算出
   */
  gradeTest() {
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let correctionCount = 0;

    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const detail = this.details[r][c];
        const studentVal = detail.studentAnswer !== null && detail.studentAnswer !== '' 
          ? Number(detail.studentAnswer) 
          : null;

        // 【最重要】isCorrect は studentAnswer と correctAnswer を比較
        detail.isCorrect = (studentVal !== null && studentVal === detail.correctAnswer);

        if (studentVal === null) {
          unansweredCount++;
        } else if (detail.isCorrect) {
          correctCount++;
        } else {
          incorrectCount++;
        }

        if (detail.correctionUsed) {
          correctionCount++;
        }
      }
    }

    const accuracyRate = Math.round((correctCount / this.totalCells) * 100);

    return {
      totalQuestions: this.totalCells,
      correctCount,
      incorrectCount,
      unansweredCount,
      correctionCount,
      accuracyRate
    };
  }

  /**
   * テスト終了・採点フロー
   */
  finishTest() {
    this.isTestFinished = true;
    const result = this.gradeTest();
    console.log('[Phase 3 採点完了]', result);
    this.showResultModal(result);
  }

  /**
   * 結果表示モーダルの表示
   */
  showResultModal(result) {
    if (!this.resultModal) return;

    if (this.resultCorrectCount) this.resultCorrectCount.textContent = result.correctCount;
    if (this.resultTotalCount) this.resultTotalCount.textContent = result.totalQuestions;
    if (this.resultAccuracyTag) this.resultAccuracyTag.textContent = `せいとうりつ ${result.accuracyRate}%`;

    if (this.bdCorrect) this.bdCorrect.textContent = result.correctCount;
    if (this.bdIncorrect) this.bdIncorrect.textContent = result.incorrectCount;
    if (this.bdUnanswered) this.bdUnanswered.textContent = result.unansweredCount;
    if (this.bdCorrections) this.bdCorrections.textContent = `${result.correctionCount} かい`;

    this.resultModal.classList.add('is-open');
    this.resultModal.setAttribute('aria-hidden', 'false');
  }

  /**
   * 結果モーダルを閉じ、間違えた問題を見直すモード
   */
  startReviewMode() {
    if (this.resultModal) {
      this.resultModal.classList.remove('is-open');
      this.resultModal.setAttribute('aria-hidden', 'true');
    }

    // グリッドの各マスに正誤スタイルを適用
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const cellEl = this.getCellElement(r, c);
        const detail = this.details[r][c];
        if (cellEl) {
          cellEl.classList.remove('is-review-correct', 'is-review-incorrect');
          if (detail.isCorrect) {
            cellEl.classList.add('is-review-correct');
          } else {
            cellEl.classList.add('is-review-incorrect');
          }
        }
      }
    }

    // 最初の間違えた問題、または(0, 0)にフォーカス
    let firstIncorrect = null;
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (!this.details[r][c].isCorrect && firstIncorrect === null) {
          firstIncorrect = { r, c };
        }
      }
    }

    if (firstIncorrect) {
      this.setActiveCell(firstIncorrect.r, firstIncorrect.c);
    } else {
      this.setActiveCell(0, 0);
    }
  }

  /**
   * もう一度挑戦する（テストのリセット）
   */
  restartTest() {
    if (this.resultModal) {
      this.resultModal.classList.remove('is-open');
      this.resultModal.setAttribute('aria-hidden', 'true');
    }

    this.isTestFinished = false;

    // グリッドのスタイルクリア
    const cells = this.gridContainer.querySelectorAll('.answer-cell');
    cells.forEach(c => {
      c.classList.remove('is-review-correct', 'is-review-incorrect', 'is-filled', 'is-active');
    });

    // 新しいランダム問題の生成と初期化
    this.generateHeaders();
    this.initAnswers();
    this.renderGrid();
    this.clearCurrentCell();
    this.setActiveCell(0, 0);
    this.updateProgress();
    console.log('[再挑戦] 新しい問題で再スタートしました。');
  }

  /**
   * イベントリスナー登録（Phase 2: 手書き・1タップ修正・テンキー・タブ）
   */
  attachEventListeners() {
    // 前へ / 次へ ボタン
    this.btnPrevCell.addEventListener('click', () => this.moveToPrevCell());
    this.btnNextCell.addEventListener('click', () => this.moveToNextCell());

    // 手書きCanvasアクションボタン
    if (this.btnClearCanvas) {
      this.btnClearCanvas.addEventListener('click', () => this.clearCurrentCell());
    }
    if (this.btnConfirmNext) {
      this.btnConfirmNext.addEventListener('click', () => this.moveToNextCell());
    }

    // 1タップ修正バーのボタン群
    if (this.quickCorrectionBar) {
      this.quickCorrectionBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-correct');
        if (btn) {
          const num = btn.getAttribute('data-num');
          this.applyCorrection(num);
        }
      });
    }

    // 大型テンキーのボタン群
    if (this.keypadPanel) {
      this.keypadPanel.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-key');
        if (btn) {
          const key = btn.getAttribute('data-key');
          this.handleKeypadInput(key);
        }
      });
    }

    // モード切り替えタブ
    if (this.tabHandwriting && this.tabKeypad) {
      this.tabHandwriting.addEventListener('click', () => {
        this.tabHandwriting.classList.add('is-active');
        this.tabKeypad.classList.remove('is-active');
        this.handwritingPanel.classList.add('is-active');
        this.keypadPanel.classList.remove('is-active');
      });

      this.tabKeypad.addEventListener('click', () => {
        this.tabKeypad.classList.add('is-active');
        this.tabHandwriting.classList.remove('is-active');
        this.keypadPanel.classList.add('is-active');
        this.handwritingPanel.classList.remove('is-active');
      });
    }

    // Phase 3 結果モーダル & 終了・見直しボタン
    if (this.btnQuit) {
      this.btnQuit.addEventListener('click', () => {
        if (!this.isTestFinished) {
          this.finishTest();
        }
      });
    }

    if (this.btnReviewAnswers) {
      this.btnReviewAnswers.addEventListener('click', () => this.startReviewMode());
    }

    if (this.btnRestart) {
      this.btnRestart.addEventListener('click', () => this.restartTest());
    }

    // きき手（右利き・左利き）切り替えボタン
    if (this.btnHandToggle) {
      this.btnHandToggle.addEventListener('click', () => this.toggleHandPreference());
    }

    // キーボード操作（PCテスト用 & アクセシビリティ）
    window.addEventListener('keydown', (e) => {
      const { row, col } = this.activeCell;

      if (e.key === 'ArrowRight' || e.key === 'Tab') {
        e.preventDefault();
        this.moveToNextCell();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.moveToPrevCell();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (row < this.gridSize - 1) this.setActiveCell(row + 1, col);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (row > 0) this.setActiveCell(row - 1, col);
      } else if (e.key >= '0' && e.key <= '9') {
        this.handleKeypadInput(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        this.clearCurrentCell();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.moveToNextCell();
      }
    });

    // ウィンドウリサイズ時のCanvasスケーリング再計算
    window.addEventListener('resize', () => {
      if (this.currentStrokes.length > 0) {
        const saved = JSON.parse(JSON.stringify(this.currentStrokes));
        this.initCanvas();
        this.redrawStrokes(saved);
      } else {
        this.initCanvas();
      }
    });
  }
}

// アプリケーション起動
window.addEventListener('DOMContentLoaded', () => {
  window.__mathApp = new MathGridApp();
});
