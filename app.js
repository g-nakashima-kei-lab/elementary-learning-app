/**
 * まなびノート - 小学校向け学習アプリ
 * Phase 2: 手書きCanvas（Pointer Events）＋ 数字認識 ＋ 1タップ修正 ＋ 大型テンキー
 */

class MathGridApp {
  constructor() {
    // グリッドサイズ（設定値として行数・列数を独立管理。将来の5x10や6x8等の拡張にも対応）
    this.rows = parseInt(localStorage.getItem('manabi_grid_rows') || '5', 10);
    this.cols = parseInt(localStorage.getItem('manabi_grid_cols') || '5', 10);
    this.gridSize = this.rows; // 既存コードとの互換性用
    this.totalCells = this.rows * this.cols;

    this.operation = localStorage.getItem('manabi_operation') || '+';
    this.rowHeaders = [];
    this.colHeaders = [];
    this.activeCell = { row: 0, col: 0 };
    this.answers = []; // rows x cols 2D配列 (表示用)
    this.details = []; // rows x cols 2D配列 (ResultDetail構造)

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
    this.testTitleEl = document.getElementById('test-title');
    this.testBadgeIcon = document.getElementById('test-badge-icon');

    // 指導者用設定UI
    this.selectGridSize = document.getElementById('select-grid-size');
    this.selectOperation = document.getElementById('select-operation');

    // 手元フォーカス式バナー要素（現在の問題 ＋ 次の問題を縦配置）
    this.inputFormulaText = document.getElementById('input-formula-text');
    this.nextFormulaText = document.getElementById('next-formula-text');
    this.nextFormulaBox = document.getElementById('next-formula-box');
    this.btnCorrectBackspace = document.getElementById('btn-correct-backspace');
    this.selectedDigitIndex = null; // 2桁修正時の選択中桁インデックス（0=十の位, 1=一の位）

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

    // タイマー状態
    this.timerDisplayEl = document.getElementById('timer-display');
    this.timerInterval = null;   // setInterval ID
    this.timerStartTime = null;  // performance.now() の開始時刻
    this.timerElapsedMs = 0;     // 停止時に確定した経過ミリ秒

    // 学習記録（localStorage）関連
    this.historyKey = 'manabi_learning_history';
    this.resultTimeDisplay = document.getElementById('result-time-display');
    this.resultComparisonBox = document.getElementById('result-comparison-box');
    this.btnHeaderHistory = document.getElementById('btn-header-history');
    this.btnModalHistory = document.getElementById('btn-modal-history');
    this.historyModal = document.getElementById('history-modal');
    this.btnCloseHistory = document.getElementById('btn-close-history');
    this.btnClearHistory = document.getElementById('btn-clear-history');
    this.historyListItems = document.getElementById('history-list-items');
    this.bestRecordStats = document.getElementById('best-record-stats');

    // 結果モーダルを閉じるボタン（✕）
    this.btnCloseResult = document.getElementById('btn-close-result');

    this.init();
  }

  /**
   * 演算子記号（全角表示用）
   */
  getOperationSymbol() {
    if (this.operation === '-' || this.operation === '−') return '−';
    if (this.operation === '*' || this.operation === '×') return '×';
    return '＋';
  }

  /**
   * 演算子ラベル
   */
  getOperationLabel() {
    if (this.operation === '-' || this.operation === '−') return 'ひきざん';
    if (this.operation === '*' || this.operation === '×') return 'かけざん';
    return 'たしざん';
  }

  /**
   * 演算子アイコン
   */
  getOperationIcon() {
    if (this.operation === '-' || this.operation === '−') return '➖';
    if (this.operation === '*' || this.operation === '×') return '✖️';
    return '➕';
  }

  /**
   * 初期化
   */
  init() {
    this.syncSettingsUI();
    this.generateHeaders();
    this.initAnswers();
    this.renderGrid();
    this.initCanvas();
    this.applyHandPreference();
    this.setActiveCell(0, 0);
    this.attachEventListeners();
    this.updateProgress();
    this.startTimer();
    console.log(`MathGridApp initialized successfully (${this.operation}, ${this.rows}x${this.cols}, total: ${this.totalCells} cells).`);
  }

  /**
   * 指導者設定UI（セレクト）とステータス表示の同期
   */
  syncSettingsUI() {
    if (this.selectGridSize) {
      this.selectGridSize.value = `${this.rows}x${this.cols}`;
    }
    if (this.selectOperation) {
      this.selectOperation.value = this.operation;
    }
    if (this.testTitleEl) {
      this.testTitleEl.textContent = `${this.getOperationLabel()} (${this.rows}×${this.cols} マス)`;
    }
    if (this.testBadgeIcon) {
      this.testBadgeIcon.textContent = this.getOperationIcon();
    }
  }

  /**
   * 既存コード互換用
   */
  syncGridSizeUI() {
    this.syncSettingsUI();
  }

  /**
   * 指導者による演算子変更（問題開始前または設定時）
   * @param {string} op '+' または '-'
   */
  setOperation(op) {
    if (this.operation === op) return;
    this.operation = op;
    try {
      localStorage.setItem('manabi_operation', op);
    } catch (_) {}

    this.syncSettingsUI();
    this.restartTest();
    console.log(`[指導者設定] 演算子を ${op} (${this.getOperationLabel()}) に変更しました。`);
  }

  /**
   * 指導者によるグリッドサイズ変更（問題開始前または設定時）
   * @param {number} rows 行数
   * @param {number} cols 列数
   */
  setGridDimensions(rows, cols) {
    if (this.rows === rows && this.cols === cols) return;
    this.rows = rows;
    this.cols = cols;
    this.gridSize = rows;
    this.totalCells = rows * cols;

    try {
      localStorage.setItem('manabi_grid_rows', String(rows));
      localStorage.setItem('manabi_grid_cols', String(cols));
    } catch (_) {}

    this.syncSettingsUI();
    this.restartTest();
    console.log(`[指導者設定] グリッドサイズを ${rows}x${cols} (${this.totalCells}問) に変更しました。`);
  }

  /**
   * 見出し数字の生成（足し算・引き算・掛け算対応）
   * 引き算時は答えが必ず0以上になるように生成
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

    const isSub = (this.operation === '-' || this.operation === '−');
    const isMul = (this.operation === '*' || this.operation === '×');

    if (isSub) {
      // 引き算: 1桁−1桁、2桁−1桁（答えは必ず0以上）
      // 列ヘッダー（引く数）: 0〜9からシャッフル
      const baseColDigits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      let cPool = shuffle(baseColDigits);
      while (cPool.length < this.cols) {
        cPool = cPool.concat(shuffle(baseColDigits));
      }
      this.colHeaders = cPool.slice(0, this.cols);

      // 引く数の最大値
      const maxCol = Math.max(...this.colHeaders);

      // 行ヘッダー（引かれる数）: 必ず maxCol 以上にして答えを0以上にする
      if (this.rows >= 10) {
        // 10x10の場合: 9〜18の10個の数字をシャッフル
        const baseRowDigits = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
        let rPool = shuffle(baseRowDigits);
        while (rPool.length < this.rows) {
          rPool = rPool.concat(shuffle(baseRowDigits));
        }
        this.rowHeaders = rPool.slice(0, this.rows);
      } else {
        // 5x5等の場合: maxCol から始まる数字群（例: maxCol=7なら 7, 8, 9, 11, 14 等）
        // 1桁−1桁と2桁−1桁が両方出現するように生成
        const rowCandidates = [];
        for (let offset of [0, 1, 2, 4, 7]) {
          rowCandidates.push(maxCol + offset);
        }
        let rPool = shuffle(rowCandidates);
        this.rowHeaders = rPool.slice(0, this.rows);
      }
    } else if (isMul) {
      // 掛け算: 1桁 × 1桁（九九の範囲）
      const baseDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

      // 行ヘッダーの生成
      let rPool = shuffle(baseDigits);
      while (rPool.length < this.rows) {
        rPool = rPool.concat(shuffle(baseDigits));
      }
      this.rowHeaders = rPool.slice(0, this.rows);

      // 列ヘッダーの生成
      let cPool = shuffle(baseDigits);
      while (cPool.length < this.cols) {
        cPool = cPool.concat(shuffle(baseDigits));
      }
      this.colHeaders = cPool.slice(0, this.cols);
    } else {
      // 足し算: 0〜9の基本数字
      const baseDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

      // 行ヘッダーの生成
      let rPool = shuffle(baseDigits);
      while (rPool.length < this.rows) {
        rPool = rPool.concat(shuffle(baseDigits));
      }
      this.rowHeaders = rPool.slice(0, this.rows);

      // 列ヘッダーの生成
      let cPool = shuffle(baseDigits);
      while (cPool.length < this.cols) {
        cPool = cPool.concat(shuffle(baseDigits));
      }
      this.colHeaders = cPool.slice(0, this.cols);
    }
  }

  /**
   * 解答配列およびResultDetail詳細モデルの初期化（rows x cols）
   */
  initAnswers() {
    this.answers = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => '')
    );

    const isSub = (this.operation === '-' || this.operation === '−');
    const isMul = (this.operation === '*' || this.operation === '×');

    // ResultDetailの初期化
    this.details = Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.cols }, (_, c) => {
        const rowNum = this.rowHeaders[r];
        const colNum = this.colHeaders[c];
        let correctAnswer;
        if (isSub) {
          correctAnswer = rowNum - colNum;
        } else if (isMul) {
          correctAnswer = rowNum * colNum;
        } else {
          correctAnswer = rowNum + colNum;
        }

        return {
          index: r * this.cols + c,
          rowNum,
          colNum,
          operation: this.operation,
          correctAnswer,
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
   * (cols+1)×(rows+1) のDOMグリッドを構築
   */
  renderGrid() {
    this.gridContainer.innerHTML = '';

    // CSS変数でグリッドの列数を設定（5x5なら6列、10x10なら11列）
    this.gridContainer.style.setProperty('--grid-cols', this.cols + 1);

    // 10x10（またはマス数が多い場合）専用のスタイルクラスを適用
    if (this.cols >= 10 || this.rows >= 10) {
      this.gridContainer.classList.add('is-size-10');
    } else {
      this.gridContainer.classList.remove('is-size-10');
    }

    // (0, 0) 演算子マス
    const opCell = document.createElement('div');
    opCell.className = 'grid-cell op-cell';
    opCell.textContent = this.getOperationSymbol();
    this.gridContainer.appendChild(opCell);

    // (0, 1..cols) 列見出しマス
    for (let c = 0; c < this.cols; c++) {
      const colCell = document.createElement('div');
      colCell.className = 'grid-cell col-header';
      colCell.textContent = this.colHeaders[c];
      colCell.setAttribute('data-col', c);
      this.gridContainer.appendChild(colCell);
    }

    // 各行（行見出し + cols個の解答マス）
    for (let r = 0; r < this.rows; r++) {
      // (r+1, 0) 行見出しマス
      const rowCell = document.createElement('div');
      rowCell.className = 'grid-cell row-header';
      rowCell.textContent = this.rowHeaders[r];
      rowCell.setAttribute('data-row', r);
      this.gridContainer.appendChild(rowCell);

      // (r+1, 1..cols) 解答マス
      for (let c = 0; c < this.cols; c++) {
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
   * タイマーを開始する（テスト開始時に呼ぶ）
   */
  startTimer() {
    if (this.timerInterval) return; // 二重起動防止
    this.timerStartTime = performance.now() - this.timerElapsedMs;
    this.timerInterval = setInterval(() => this.updateTimerDisplay(), 500);
    this.updateTimerDisplay(); // 即時描画
    console.log('[タイマー] 開始');
  }

  /**
   * タイマーを停止する（テスト終了時に呼ぶ）
   */
  stopTimer() {
    if (!this.timerInterval) return;
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerElapsedMs = performance.now() - this.timerStartTime;
    this.updateTimerDisplay(); // 最終時刻を確定表示
    console.log(`[タイマー] 停止 (${this.formatTime(this.timerElapsedMs)})`);
  }

  /**
   * タイマーをリセットする（再挑戦時に呼ぶ）
   */
  resetTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerStartTime = null;
    this.timerElapsedMs = 0;
    if (this.timerDisplayEl) {
      this.timerDisplayEl.textContent = '00:00';
    }
    console.log('[タイマー] リセット');
  }

  /**
   * タイマー表示を現在の経過時間で更新する
   */
  updateTimerDisplay() {
    if (!this.timerDisplayEl || !this.timerStartTime) return;
    const elapsed = performance.now() - this.timerStartTime;
    this.timerDisplayEl.textContent = this.formatTime(elapsed);
  }

  /**
   * ミリ秒を MM:SS 形式にフォーマット
   * @param {number} ms
   * @returns {string}
   */
  formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
    if (this.isTestFinished) return;
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
   * 1タップ修正の適用（誤認識時、2桁以上の桁単位訂正に対応）
   */
  applyCorrection(selectedNum) {
    if (this.isTestFinished) return;
    const { row, col } = this.activeCell;
    const detail = this.details[row][col];
    const currentVal = String(this.answers[row][col] || '');

    let newVal = String(selectedNum);

    if (currentVal.length >= 2) {
      // 2桁の場合：選択されている桁（デフォルトは一の位）を置き換える
      const chars = currentVal.split('');
      const targetIdx = (this.selectedDigitIndex !== null && this.selectedDigitIndex >= 0 && this.selectedDigitIndex < chars.length)
        ? this.selectedDigitIndex
        : (chars.length - 1); // 一の位

      chars[targetIdx] = String(selectedNum);
      newVal = chars.join('');
    } else if (currentVal.length === 1 && this.selectedDigitIndex === null) {
      // 1桁で通常置換
      newVal = String(selectedNum);
    }

    // 児童が修正したフラグを立てる
    detail.correctionUsed = true;
    detail.studentAnswer = newVal;

    // UI更新
    this.setAnswer(row, col, newVal);
    this.updateRecogBadge(newVal);
    this.highlightCorrectionButton(String(selectedNum));

    console.log(`[1タップ修正] マス(${row}, ${col}) 児童が修正: ${newVal} (元の認識: ${detail.recognizedAnswer})`);

    // テンポよく解けるよう、修正後280msで自動的に次のマスへ進む
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
    this.autoAdvanceTimer = setTimeout(() => {
      this.moveToNextCell();
    }, 280);
  }

  /**
   * 修正バーの1文字消去（⌫）
   */
  handleCorrectionBackspace() {
    if (this.isTestFinished) return;
    const { row, col } = this.activeCell;
    const detail = this.details[row][col];
    const currentVal = String(this.answers[row][col] || '');

    if (currentVal.length <= 1) {
      this.clearCurrentCell();
    } else {
      // 2桁なら末尾の1文字を消して1桁にする
      const newVal = currentVal.slice(0, -1);
      detail.studentAnswer = newVal;
      this.setAnswer(row, col, newVal);
      this.selectedDigitIndex = 0;
      this.updateRecogBadge(newVal);
    }
  }

  /**
   * 大型テンキーからの直接入力（スマート自動送り対応）
   */
  handleKeypadInput(key) {
    if (this.isTestFinished) return;
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

    // 2桁入力のサポート（1文字入力済みの状態で次の数字が来たら連結）
    if (currentVal !== '' && currentVal.length === 1) {
      newVal = currentVal + key;
    }

    detail.recognizedAnswer = null; // テンキー入力のため手書き認識なし
    detail.studentAnswer = newVal;
    detail.correctionUsed = false;

    this.setAnswer(row, col, newVal);
    this.updateRecogBadge(newVal);
    this.highlightCorrectionButton(newVal.length === 1 ? newVal : null);

    // スマート自動送り判定（正答の桁数基準）
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);

    // 正答の必要桁数（1桁なら1、2桁なら2）
    const targetDigits = String(Math.abs(detail.correctAnswer)).length;

    // 1. 入力桁数が正答桁数に達した、または2桁入力された場合：
    //    140ms後に次の問題へ進む！
    if (newVal.length >= targetDigits || newVal.length >= 2) {
      this.autoAdvanceTimer = setTimeout(() => {
        this.moveToNextCell();
      }, 140);
      return;
    }

    // 2. 正答が2桁でまだ1桁目（例: 12の「1」）しか入力されていない場合：
    //    タイムアウト（時間）による自動送りは行わず、2桁目の入力を何秒でも待機する。
  }

  /**
   * 認識結果バッジの表示更新（桁スロット対応）
   */
  updateRecogBadge(val) {
    if (!this.recogBadge) return;

    const str = (val !== '' && val !== null && val !== undefined) ? String(val) : '';
    if (str === '' || str === '-') {
      this.recogBadge.innerHTML = '<span class="recog-placeholder">-</span>';
      this.selectedDigitIndex = null;
      return;
    }

    // 見直しモードなどのリッチHTMLの場合
    if (str.includes('<span') || this.isTestFinished) {
      this.recogBadge.innerHTML = str;
      return;
    }

    // 1桁または2桁以上の数字をスロット化して描画
    this.recogBadge.innerHTML = '';
    const digits = str.split('');

    if (this.selectedDigitIndex === null || this.selectedDigitIndex >= digits.length) {
      this.selectedDigitIndex = digits.length - 1; // デフォルトは一の位
    }

    digits.forEach((d, idx) => {
      const slot = document.createElement('span');
      slot.className = 'recog-digit-slot';
      if (idx === this.selectedDigitIndex) {
        slot.classList.add('is-active-digit');
      }
      slot.textContent = d;
      slot.setAttribute('data-digit-idx', idx);
      slot.setAttribute('title', idx === 0 && digits.length === 2 ? '十の位（タップして変更）' : '一の位（タップして変更）');

      // タップで修正対象の桁を切り替え
      slot.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.selectedDigitIndex = idx;
        this.recogBadge.querySelectorAll('.recog-digit-slot').forEach((s, i) => {
          s.classList.toggle('is-active-digit', i === idx);
        });
        this.highlightCorrectionButton(digits[idx]);
      });

      this.recogBadge.appendChild(slot);
    });
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
    if (this.isTestFinished) return;
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
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
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
    this.selectedDigitIndex = null;

    // 新しいマスをアクティブ化
    const targetCell = this.getCellElement(row, col);
    if (targetCell) {
      targetCell.classList.add('is-active');
      targetCell.focus({ preventScroll: true });
    }

    // 行見出し・列見出しのハイライト更新
    this.updateHeaderHighlights(row, col);

    // 手元フォーカス式バナーの更新
    this.updateInputFormulaBanner(row, col);

    // 画面下部の式表示を更新
    const rowNum = this.rowHeaders[row];
    const colNum = this.colHeaders[col];
    const detail = this.details[row][col];
    const opSymbol = this.getOperationSymbol();

    if (this.isTestFinished) {
      if (detail.isCorrect) {
        this.calcFormulaEl.innerHTML = `<span>${rowNum} ${opSymbol} ${colNum} ＝ <strong>${detail.correctAnswer}</strong></span> <span class="review-status-pill pill-correct">⭕ せいかい！</span>`;
      } else {
        const yourAns = (detail.studentAnswer !== null && detail.studentAnswer !== '') ? detail.studentAnswer : '未入力';
        this.calcFormulaEl.innerHTML = `<span>${rowNum} ${opSymbol} ${colNum} ＝ <strong class="text-success-bold">${detail.correctAnswer}</strong></span> <span class="review-status-pill pill-wrong">あなたの答え: <del>${yourAns}</del> ❌</span>`;
      }
    } else {
      this.calcFormulaEl.textContent = `${rowNum} ${opSymbol} ${colNum} ＝ ？`;
    }

    // マスに保存されているストロークや回答の復元
    this.currentStrokes = detail.strokes ? JSON.parse(JSON.stringify(detail.strokes)) : [];
    if (this.currentStrokes.length > 0) {
      this.redrawStrokes(this.currentStrokes);
    } else {
      this.clearCanvas();
    }

    const currentVal = detail.studentAnswer !== null ? detail.studentAnswer : this.answers[row][col];
    if (this.isTestFinished) {
      if (detail.isCorrect) {
        this.updateRecogBadge(detail.correctAnswer);
      } else {
        const studentAns = (detail.studentAnswer !== null && detail.studentAnswer !== '') ? detail.studentAnswer : '未';
        if (this.recogBadge) {
          this.recogBadge.innerHTML = `<span class="badge-wrong">${studentAns}</span><span class="badge-arrow">➔</span><span class="badge-correct">${detail.correctAnswer}</span>`;
        }
      }
    } else {
      this.updateRecogBadge(currentVal || '-');
      this.highlightCorrectionButton(currentVal);
    }
  }

  /**
   * 現在のアクティブマスに対応する行見出し・列見出しをハイライト
   */
  updateHeaderHighlights(row, col) {
    if (!this.gridContainer) return;
    const prevHighlights = this.gridContainer.querySelectorAll('.row-header.is-highlight, .col-header.is-highlight');
    prevHighlights.forEach(el => el.classList.remove('is-highlight'));

    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      const rowHeader = this.gridContainer.querySelector(`.row-header[data-row="${row}"]`);
      const colHeader = this.gridContainer.querySelector(`.col-header[data-col="${col}"]`);
      if (rowHeader) rowHeader.classList.add('is-highlight');
      if (colHeader) colHeader.classList.add('is-highlight');
    }
  }

  /**
   * 手元フォーカス式バナーの表示更新（現在の式 ＋ 次の問題予告）
   */
  updateInputFormulaBanner(row, col) {
    if (!this.inputFormulaText || !this.nextFormulaText) return;

    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      this.inputFormulaText.innerHTML = '-';
      this.nextFormulaText.textContent = '-';
      return;
    }

    const rowNum = this.rowHeaders[row];
    const colNum = this.colHeaders[col];
    const detail = this.details[row][col];
    const opSymbol = this.getOperationSymbol();

    if (this.isTestFinished) {
      if (detail.isCorrect) {
        this.inputFormulaText.innerHTML = `${rowNum} ${opSymbol} ${colNum} ＝ <strong class="text-success">${detail.correctAnswer}</strong> ⭕`;
      } else {
        const yourAns = (detail.studentAnswer !== null && detail.studentAnswer !== '') ? detail.studentAnswer : '未入力';
        this.inputFormulaText.innerHTML = `${rowNum} ${opSymbol} ${colNum} ＝ <strong class="text-success">${detail.correctAnswer}</strong> <span class="formula-wrong-note">(あなたの答え: <del>${yourAns}</del>)</span>`;
      }
      if (this.nextFormulaBox) this.nextFormulaBox.style.display = 'none';
      return;
    }

    if (this.nextFormulaBox) this.nextFormulaBox.style.display = 'flex';

    // 解答中: 入力済みならその数値を、未入力なら「？」を表示
    const currentVal = this.answers[row][col];
    const targetHtml = (currentVal !== '' && currentVal !== null)
      ? `<strong class="formula-val-filled">${currentVal}</strong>`
      : `<span class="formula-target">？</span>`;

    this.inputFormulaText.innerHTML = `${rowNum} ${opSymbol} ${colNum} ＝ ${targetHtml}`;

    // つぎの問題の計算予告（右へ進み、行末なら次の行頭へ）
    let nextRow = row;
    let nextCol = col + 1;
    if (nextCol >= this.cols) {
      nextCol = 0;
      nextRow++;
    }

    if (nextRow < this.rows) {
      const nextRowNum = this.rowHeaders[nextRow];
      const nextColNum = this.colHeaders[nextCol];
      this.nextFormulaText.textContent = `${nextRowNum} ${opSymbol} ${nextColNum} ＝ □`;
    } else {
      this.nextFormulaText.textContent = 'ラスト！🏁';
    }
  }

  /**
   * 指定座標のDOM要素を取得
   */
  getCellElement(row, col) {
    return this.gridContainer.querySelector(`.answer-cell[data-row="${row}"][data-col="${col}"]`);
  }

  /**
   * 次のマスへ移動（右へ、行末なら次の行の先頭へ、最終問完了なら採点結果へ）
   */
  moveToNextCell() {
    let { row, col } = this.activeCell;
    col++;
    if (col >= this.cols) {
      col = 0;
      row++;
    }
    if (row >= this.rows) {
      // 最終問題の入力が完了して次のマスへ進もうとした場合：テスト終了・採点へ！
      if (!this.isTestFinished) {
        this.finishTest();
      }
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
      col = this.cols - 1;
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
    this.updateInputFormulaBanner(row, col);
    this.updateProgress();
  }

  /**
   * 進捗状況（入力済みマス数）の表示更新
   */
  updateProgress() {
    let filledCount = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.answers[r][c] !== '' && this.answers[r][c] !== null) {
          filledCount++;
        }
      }
    }
    if (this.progressCountEl) {
      this.progressCountEl.textContent = filledCount;
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

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
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
    this.stopTimer();
    this.isTestFinished = true;
    const result = this.gradeTest();
    console.log('[Phase 3 採点完了]', result);

    // 学習記録の保存と比較データの生成
    const comparison = this.saveRecord(result);
    this.showResultModal(result, comparison);
  }

  /**
   * 結果表示モーダルの表示
   * @param {Object} result 採点結果
   * @param {Object} [comparison] 過去記録との比較データ
   */
  showResultModal(result, comparison) {
    if (!this.resultModal) return;

    if (this.resultCorrectCount) this.resultCorrectCount.textContent = result.correctCount;
    if (this.resultTotalCount) this.resultTotalCount.textContent = result.totalQuestions;
    if (this.resultAccuracyTag) this.resultAccuracyTag.textContent = `せいとうりつ ${result.accuracyRate}%`;

    // 所要時間（タイム）の表示
    if (this.resultTimeDisplay) {
      this.resultTimeDisplay.textContent = this.formatTime(this.timerElapsedMs);
    }

    if (this.bdCorrect) this.bdCorrect.textContent = result.correctCount;
    if (this.bdIncorrect) this.bdIncorrect.textContent = result.incorrectCount;
    if (this.bdUnanswered) this.bdUnanswered.textContent = result.unansweredCount;
    if (this.bdCorrections) this.bdCorrections.textContent = `${result.correctionCount} かい`;

    // 過去記録との比較カードを描画
    if (comparison) {
      this.renderComparisonBox(comparison);
    }

    this.resultModal.classList.add('is-open');
    this.resultModal.setAttribute('aria-hidden', 'false');
  }

  /**
   * テスト結果をlocalStorageに保存し、過去記録との比較データを生成
   * @param {Object} result 採点結果
   * @returns {Object} 比較データ
   */
  saveRecord(result) {
    const history = this.getHistory();
    const currentGridLabel = `${this.rows}×${this.cols}`;

    // ★重要: グリッドサイズと演算子（たしざん/ひきざん）を混同しないよう、同じ設定の記録のみを抽出して比較
    const sameSizeHistory = history.filter(rec => {
      const matchGrid = rec.gridLabel === currentGridLabel ||
        (rec.rows === this.rows && rec.cols === this.cols) ||
        (!rec.rows && this.rows === 5 && rec.gridSize === 5);
      const matchOp = (rec.operation === this.operation) || (!rec.operation && this.operation === '+');
      return matchGrid && matchOp;
    });

    const prevRecord = sameSizeHistory.length > 0 ? sameSizeHistory[0] : null;
    const bestRecord = this.getBestRecord(sameSizeHistory);

    const now = new Date();
    const dateFormatted = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newRecord = {
      id: Date.now(),
      date: dateFormatted,
      timestamp: Date.now(),
      gridSize: this.rows,
      gridLabel: currentGridLabel,
      rows: this.rows,
      cols: this.cols,
      operation: this.operation,
      elapsedMs: Math.round(this.timerElapsedMs),
      timeFormatted: this.formatTime(this.timerElapsedMs),
      correctCount: result.correctCount,
      totalQuestions: result.totalQuestions,
      accuracyRate: result.accuracyRate,
      incorrectCount: result.incorrectCount,
      unansweredCount: result.unansweredCount,
      correctionCount: result.correctionCount
    };

    // 比較データの算出
    let comparison = {
      isFirstTime: history.length === 0,
      isBestRecord: false,
      prevRecord: prevRecord,
      bestRecord: bestRecord,
      timeDiffSec: null,     // 負なら早くなった（短縮）、正なら遅くなった
      accuracyDiff: null     // 正ならアップ、負ならダウン
    };

    if (prevRecord) {
      comparison.timeDiffSec = Math.round((newRecord.elapsedMs - prevRecord.elapsedMs) / 1000);
      comparison.accuracyDiff = newRecord.accuracyRate - prevRecord.accuracyRate;
    }

    // 自己ベスト判定（正答率が最も高く、同率ならタイムが最短）
    if (!bestRecord) {
      comparison.isBestRecord = true;
    } else if (newRecord.accuracyRate > bestRecord.accuracyRate) {
      comparison.isBestRecord = true;
    } else if (newRecord.accuracyRate === bestRecord.accuracyRate && newRecord.elapsedMs < bestRecord.elapsedMs) {
      comparison.isBestRecord = true;
    }

    // 新規記録を先頭に追加（最大50件保存）
    history.unshift(newRecord);
    if (history.length > 50) history.pop();

    try {
      localStorage.setItem(this.historyKey, JSON.stringify(history));
      console.log('[学習記録] 保存完了:', newRecord);
    } catch (e) {
      console.warn('[学習記録] localStorageへの保存に失敗しました:', e);
    }

    return comparison;
  }

  /**
   * localStorageから学習記録を取得
   * @returns {Array}
   */
  getHistory() {
    try {
      const data = localStorage.getItem(this.historyKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('[学習記録] 読み込みエラー:', e);
      return [];
    }
  }

  /**
   * 履歴から自己ベスト記録（最高正答率 ＆ 最速タイム）を取得
   * @param {Array} history
   * @returns {Object|null}
   */
  getBestRecord(history) {
    if (!history || history.length === 0) return null;
    let best = history[0];
    for (let i = 1; i < history.length; i++) {
      const rec = history[i];
      if (rec.accuracyRate > best.accuracyRate) {
        best = rec;
      } else if (rec.accuracyRate === best.accuracyRate && rec.elapsedMs < best.elapsedMs) {
        best = rec;
      }
    }
    return best;
  }

  /**
   * 児童の自己肯定感と成長意欲を育む前向きメッセージを取得
   * （結果が伸びなかった場合でも、過程や挑戦を肯定するメッセージを複数候補から選択）
   * @param {Object} comp 比較データ
   * @returns {{ icon: string, title: string, text: string }}
   */
  getCheerMessage(comp) {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // 1. はじめて解いたとき
    if (comp.isFirstTime) {
      return pick([
        {
          icon: '🌱',
          title: 'はじめてのちょうせん！',
          text: 'さいしょの１歩をふみ出せたね！これから自分のペースで楽しもう！'
        },
        {
          icon: '✨',
          title: 'すてきなスタート！',
          text: 'さいごまでやりきってえらい！ここからキミの記録がはじまるよ。'
        },
        {
          icon: '🎉',
          title: 'きろくの第１歩！',
          text: '100マス計算にチャレンジできたね！つづけるほど、どんどん得意になるよ。'
        }
      ]);
    }

    // 2. 自己ベスト更新のとき
    if (comp.isBestRecord) {
      return pick([
        {
          icon: '🏆',
          title: '自己ベスト更新！',
          text: 'これまででいちばんの記録！コツコツつづけてきた努力のたまものだね！'
        },
        {
          icon: '🚀',
          title: '新きろく達成！',
          text: '過去の自分を大きくこえられたね！すばらしい集中力でした！'
        },
        {
          icon: '⭐',
          title: '大かつやく！',
          text: 'じぶんの力でつかんだ最高の記録！この調子で自信を持っていこう！'
        }
      ]);
    }

    const timeDiff = comp.timeDiffSec || 0;
    const accDiff = comp.accuracyDiff || 0;

    // 3. 正答率が下がってしまったとき（間違いを見直して前向きになれるメッセージ）
    if (accDiff < 0) {
      return pick([
        {
          icon: '💪',
          title: 'まちがいは「のびしろ」！',
          text: 'まちがえた問題こそ、もっと賢くなれる大チャンス！「見直し」で正解をたしかめてみよう！'
        },
        {
          icon: '🔍',
          title: '次につながる大事な一歩！',
          text: 'むずかしい問題にもにげずに立ち向かったね！見直してもう1回やれば、次はきっとできるよ。'
        },
        {
          icon: '📖',
          title: 'ここからパワーアップ！',
          text: '失敗はできるようになったことの前ぶれだよ。どこでまちがえたか見直しモードでチェックしてみよう！'
        },
        {
          icon: '✨',
          title: 'ちょうせんした証拠！',
          text: 'まちがいをおそれず解いたのがえらい！答えをたしかめて、もう一歩前へ進もう！'
        }
      ]);
    }

    // 4. タイムが前回より遅くなったとき（焦らず丁寧に解いたことを肯定）
    if (timeDiff > 2) {
      return pick([
        {
          icon: '🐢',
          title: 'ていねいに向き合えたね！',
          text: 'あわてずに、じっくり考えられた証拠だよ。ていねいに計算する習慣が本当の実力になるよ！'
        },
        {
          icon: '💡',
          title: 'しっかり考えたナイス集中力！',
          text: 'スピードよりも、一問一問ていねいに解いた時間が力になるよ。その調子！'
        },
        {
          icon: '🌿',
          title: '落ち着いて取り組めたね！',
          text: '自分のペースを大切にして解けたね。あせらず着実に進むのがいちばんの近道だよ。'
        },
        {
          icon: '🎯',
          title: 'じっくり解いてえらい！',
          text: '速さだけがすべてじゃないよ！しっかり考えて最後まで解ききった集中力がすばらしい！'
        }
      ]);
    }

    // 5. 前回とほぼ変わらないとき（継続と安定した実力を称賛）
    if (Math.abs(timeDiff) <= 2 && accDiff === 0) {
      return pick([
        {
          icon: '👏',
          title: 'つづけていて本当にえらい！',
          text: '毎日コツコツ続けられることが、一番の才能だよ！安定したリズムがつかめているね。'
        },
        {
          icon: '⭐',
          title: 'ぶれない集中力！',
          text: 'いつも通りの力をしっかり発揮できたね！安定して解けるのも大切な実力だよ。'
        },
        {
          icon: '🌿',
          title: 'いいペースをつかんでるね！',
          text: '同じ集中力をキープしてやりきったね！この積み重ねが、大きな力にかわっていくよ。'
        },
        {
          icon: '🎯',
          title: 'ナイスキープ！',
          text: '力を安定して出せているね！続けることで、ある日ぐんと記録が伸びる日がやってくるよ。'
        }
      ]);
    }

    // 6. タイムが早くなり正答率も伸びたとき（素直な前進を応援）
    if (timeDiff < 0 || accDiff > 0) {
      return pick([
        {
          icon: '🚀',
          title: '前回の自分をこえられたね！',
          text: '少しずつ確実に前へ進んでるよ！練習の成果がしっかり形になってあらわれたね！'
        },
        {
          icon: '🌈',
          title: 'いいリズムで解けたね！',
          text: '前回の記録を上回ったね！手ごたえを感じながら、楽しくつづけていこう！'
        },
        {
          icon: '✨',
          title: 'ナイスステップアップ！',
          text: '少しずつスピードも正しさも身についてきているよ！次のチャレンジも楽しみだね！'
        }
      ]);
    }

    // 7. その他の場合（自己ベストには届かなかったが挑戦したとき）
    return pick([
      {
        icon: '🌈',
        title: 'ベストはいつでも待っている！',
        text: '記録は波があるのがあたりまえ！今日最後までやりきったことが、何よりすばらしいよ！'
      },
      {
        icon: '✊',
        title: 'ちょうせんするキミが一番！',
        text: 'ベスト更新をめざして立ち向かった勇気が花丸！何度でも再挑戦してみよう！'
      },
      {
        icon: '🌟',
        title: '今日の努力はムダにならない！',
        text: '一歩一歩の積み重ねがキミの力になっているよ。今日も最後までよくがんばりました！'
      }
    ]);
  }

  /**
   * 結果モーダル内の過去記録比較カードを描画
   * @param {Object} comp
   */
  renderComparisonBox(comp) {
    if (!this.resultComparisonBox) return;

    // 前向きな励ましメッセージの選定
    const cheer = this.getCheerMessage(comp);

    if (comp.isFirstTime) {
      this.resultComparisonBox.innerHTML = `
        <div class="comp-card">
          <div class="comp-cheer-section comp-cheer-first">
            <div class="comp-cheer-icon">${cheer.icon}</div>
            <div class="comp-cheer-content">
              <strong class="comp-cheer-title">${cheer.title}</strong>
              <p class="comp-cheer-text">${cheer.text}</p>
            </div>
          </div>
        </div>
      `;
      return;
    }

    let bestBadge = '';
    if (comp.isBestRecord) {
      bestBadge = `
        <div class="comp-badge-best">
          🏆 <strong>自己ベスト更新！</strong> 最高記録達成！
        </div>
      `;
    }

    // 前回とのタイム比較（やさしい言葉遣い）
    let timeText = '';
    if (comp.timeDiffSec !== null) {
      if (comp.timeDiffSec < 0) {
        timeText = `<div class="comp-stat-item"><span class="comp-stat-icon">⚡</span> タイム: 前回より <strong>${Math.abs(comp.timeDiffSec)}秒 短縮！</strong></div>`;
      } else if (comp.timeDiffSec === 0) {
        timeText = `<div class="comp-stat-item"><span class="comp-stat-icon">⏱️</span> タイム: 前回と同じ</div>`;
      } else {
        timeText = `<div class="comp-stat-item text-muted"><span class="comp-stat-icon">⏱️</span> タイム: 前回 ${comp.prevRecord.timeFormatted}（じっくり解いたね）</div>`;
      }
    }

    // 前回との正答率比較（やさしい言葉遣い）
    let accText = '';
    if (comp.accuracyDiff !== null) {
      if (comp.accuracyDiff > 0) {
        accText = `<div class="comp-stat-item"><span class="comp-stat-icon">📈</span> 正とう率: 前回より <strong>+${comp.accuracyDiff}% アップ！</strong></div>`;
      } else if (comp.accuracyDiff === 0) {
        accText = `<div class="comp-stat-item"><span class="comp-stat-icon">🎯</span> 正とう率: 前回をキープ (${comp.prevRecord.accuracyRate}%)</div>`;
      } else {
        accText = `<div class="comp-stat-item text-muted"><span class="comp-stat-icon">✏️</span> 正とう率: 前回 ${comp.prevRecord.accuracyRate}%（見直してみよう！）</div>`;
      }
    }

    // 自己ベスト参考表示（今回がベストでない場合）
    let bestRef = '';
    if (!comp.isBestRecord && comp.bestRecord) {
      bestRef = `<div class="comp-best-ref">👑 自己ベスト: 正とう率 <strong>${comp.bestRecord.accuracyRate}%</strong> (⏱️ ${comp.bestRecord.timeFormatted})</div>`;
    }

    this.resultComparisonBox.innerHTML = `
      <div class="comp-card">
        <!-- 温かい励ましメッセージ -->
        <div class="comp-cheer-section">
          <div class="comp-cheer-icon">${cheer.icon}</div>
          <div class="comp-cheer-content">
            <strong class="comp-cheer-title">${cheer.title}</strong>
            <p class="comp-cheer-text">${cheer.text}</p>
          </div>
        </div>

        ${bestBadge}

        <!-- 数値のやさしい比較 -->
        <div class="comp-details-section">
          <div class="comp-header">📊 前回の自分とくらべると...</div>
          <div class="comp-stats-list">
            ${accText}
            ${timeText}
          </div>
        </div>

        ${bestRef}
      </div>
    `;
  }

  /**
   * 履歴モーダルの一覧描画
   */
  renderHistoryList() {
    const history = this.getHistory();
    const currentGridLabel = `${this.rows}×${this.cols}`;
    const currentOpLabel = this.getOperationLabel();

    // 現在選択中のグリッドサイズ & 演算子の自己ベストを抽出
    const currentSettingHistory = history.filter(rec => {
      const matchGrid = rec.gridLabel === currentGridLabel ||
        (rec.rows === this.rows && rec.cols === this.cols) ||
        (!rec.rows && this.rows === 5 && rec.gridSize === 5);
      const matchOp = (rec.operation === this.operation) || (!rec.operation && this.operation === '+');
      return matchGrid && matchOp;
    });
    const best = this.getBestRecord(currentSettingHistory);

    // 自己ベストカードの描画
    if (this.bestRecordStats) {
      if (best) {
        this.bestRecordStats.innerHTML = `
          <div class="best-stat-item">
            <span class="best-stat-lbl">${currentGridLabel} ${currentOpLabel} 最高正とう率</span>
            <strong class="best-stat-val text-success">${best.accuracyRate}%</strong>
            <span class="best-stat-sub">(${best.correctCount}/${best.totalQuestions} 問)</span>
          </div>
          <div class="best-stat-item">
            <span class="best-stat-lbl">${currentGridLabel} ${currentOpLabel} 最速タイム</span>
            <strong class="best-stat-val text-primary">${best.timeFormatted}</strong>
            <span class="best-stat-sub">${best.date}</span>
          </div>
        `;
      } else {
        this.bestRecordStats.innerHTML = `<span class="text-muted">まだ ${currentGridLabel} ${currentOpLabel} の記録がありません</span>`;
      }
    }

    // 履歴アイテム一覧の描画
    if (this.historyListItems) {
      if (history.length === 0) {
        this.historyListItems.innerHTML = `
          <div class="history-empty">
            <span>📝 まだ記録がありません。100マス計算を解いてみよう！</span>
          </div>
        `;
      } else {
        this.historyListItems.innerHTML = history.map((rec) => {
          const isBest = best && rec.id === best.id;
          const isPerfect = rec.accuracyRate === 100;
          const opName = (rec.operation === '-' || rec.operation === '−')
            ? 'ひきざん'
            : ((rec.operation === '*' || rec.operation === '×') ? 'かけざん' : 'たしざん');
          return `
            <div class="history-row ${isBest ? 'is-best-row' : ''}">
              <div class="history-col-info">
                <span class="h-date">${rec.date}</span>
                <span class="h-mode">${rec.gridLabel} ${opName}</span>
                ${isBest ? '<span class="h-badge-best">🏆 ベスト</span>' : ''}
              </div>
              <div class="history-col-score">
                <span class="h-acc ${isPerfect ? 'text-success' : ''}">${rec.accuracyRate}%</span>
                <span class="h-count">${rec.correctCount}/${rec.totalQuestions}</span>
              </div>
              <div class="history-col-time">
                <span class="h-time">⏱️ ${rec.timeFormatted}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  /**
   * 履歴モーダルを開く
   */
  openHistoryModal() {
    this.renderHistoryList();
    if (this.historyModal) {
      this.historyModal.classList.add('is-open');
      this.historyModal.setAttribute('aria-hidden', 'false');
    }
  }

  /**
   * 履歴モーダルを閉じる
   */
  closeHistoryModal() {
    if (this.historyModal) {
      this.historyModal.classList.remove('is-open');
      this.historyModal.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * 履歴を消去
   */
  clearHistory() {
    if (confirm('これまでの学習きろくをすべて消去しますか？\n（この操作は元に戻せません）')) {
      try {
        localStorage.removeItem(this.historyKey);
      } catch (_) {}
      this.renderHistoryList();
    }
  }

  /**
   * 結果モーダルを閉じる（✕ボタンまたは背景クリック時）
   * 閉じた後は盤面をそのまま見直せる状態（見直しモード）にする
   */
  closeResultModal() {
    if (this.resultModal) {
      this.resultModal.classList.remove('is-open');
      this.resultModal.setAttribute('aria-hidden', 'true');
    }

    // ヘッダーの「おわる」ボタンを「📊 けっか」にして結果モーダルを再度開けるようにする
    if (this.btnQuit) {
      this.btnQuit.textContent = '📊 けっか';
      this.btnQuit.classList.add('is-review-btn');
    }

    // 盤面を正誤表示にしてすぐ確認できるようにする
    this.startReviewMode();
  }

  /**
   * 結果モーダルを閉じ、間違えた問題を見直すモード
   */
  startReviewMode() {
    if (this.resultModal) {
      this.resultModal.classList.remove('is-open');
      this.resultModal.setAttribute('aria-hidden', 'true');
    }

    // ヘッダーの「おわる」ボタンを「📊 けっか」にして結果モーダルを再度開けるようにする
    if (this.btnQuit) {
      this.btnQuit.textContent = '📊 けっか';
      this.btnQuit.classList.add('is-review-btn');
    }

    // ステータスバーに見直し中の案内を表示
    const result = this.gradeTest();
    const counterContainer = document.querySelector('.status-counter');
    if (counterContainer) {
      counterContainer.innerHTML = `<span class="counter-label">みなおし</span> <span class="counter-val"><span class="text-success">⭕ ${result.correctCount}</span> / <span class="text-danger">❌ ${result.incorrectCount}</span></span>`;
    }

    // グリッドの各マスに正誤スタイルと「児童の答え ＆ 正解」を適用
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cellEl = this.getCellElement(r, c);
        const detail = this.details[r][c];
        if (cellEl) {
          cellEl.classList.remove('is-review-correct', 'is-review-incorrect');
          if (detail.isCorrect) {
            cellEl.classList.add('is-review-correct');
            cellEl.innerHTML = `<span class="cell-review-right">${detail.correctAnswer}</span>`;
          } else {
            cellEl.classList.add('is-review-incorrect');
            const studentText = (detail.studentAnswer !== null && detail.studentAnswer !== '') ? detail.studentAnswer : '未';
            cellEl.innerHTML = `
              <span class="cell-review-wrong" title="あなたの答え">${studentText}</span>
              <span class="cell-review-correct-badge" title="せいかい">${detail.correctAnswer}</span>
            `;
          }
        }
      }
    }

    // 最初の間違えた問題、または(0, 0)にフォーカス
    let firstIncorrect = null;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
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

    // ヘッダーのボタンをもとに戻す
    if (this.btnQuit) {
      this.btnQuit.textContent = 'おわる';
      this.btnQuit.classList.remove('is-review-btn');
    }

    // ステータスカウンターをもとに戻す
    const counterContainer = document.querySelector('.status-counter');
    if (counterContainer) {
      counterContainer.innerHTML = `<span class="counter-label">のこり</span> <span class="counter-val"><strong id="progress-count">0</strong> / ${this.totalCells} マス</span>`;
      this.progressCountEl = document.getElementById('progress-count');
    }

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
    this.resetTimer();
    this.startTimer();
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

    // 1タップ修正バーのボタン群（数字タップまたは1文字消去）
    if (this.quickCorrectionBar) {
      this.quickCorrectionBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-correct');
        if (btn) {
          const action = btn.getAttribute('data-action');
          if (action === 'backspace') {
            this.handleCorrectionBackspace();
            return;
          }
          const num = btn.getAttribute('data-num');
          if (num !== null && num !== undefined) {
            this.applyCorrection(num);
          }
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
        this.initCanvas();
        if (this.currentStrokes && this.currentStrokes.length > 0) {
          this.redrawStrokes(this.currentStrokes);
        }
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
        } else {
          // 見直しモード中なら結果モーダルを再表示
          this.showResultModal(this.gradeTest());
        }
      });
    }

    if (this.btnReviewAnswers) {
      this.btnReviewAnswers.addEventListener('click', () => this.startReviewMode());
    }

    if (this.btnRestart) {
      this.btnRestart.addEventListener('click', () => this.restartTest());
    }

    // 結果モーダルの✕ボタンおよび背景クリックで閉じる
    if (this.btnCloseResult) {
      this.btnCloseResult.addEventListener('click', () => this.closeResultModal());
    }
    if (this.resultModal) {
      this.resultModal.addEventListener('click', (e) => {
        if (e.target === this.resultModal) {
          this.closeResultModal();
        }
      });
    }

    // 学習記録（履歴モーダル）のイベントリスナー
    if (this.btnHeaderHistory) {
      this.btnHeaderHistory.addEventListener('click', () => this.openHistoryModal());
    }
    if (this.btnModalHistory) {
      this.btnModalHistory.addEventListener('click', () => this.openHistoryModal());
    }
    if (this.btnCloseHistory) {
      this.btnCloseHistory.addEventListener('click', () => this.closeHistoryModal());
    }
    if (this.btnClearHistory) {
      this.btnClearHistory.addEventListener('click', () => this.clearHistory());
    }
    if (this.historyModal) {
      this.historyModal.addEventListener('click', (e) => {
        if (e.target === this.historyModal) {
          this.closeHistoryModal();
        }
      });
    }

    // きき手（右利き・左利き）切り替えボタン
    if (this.btnHandToggle) {
      this.btnHandToggle.addEventListener('click', () => this.toggleHandPreference());
    }

    // 指導者用グリッドサイズ変更（5x5 / 10x10）
    if (this.selectGridSize) {
      this.selectGridSize.addEventListener('change', () => {
        const val = this.selectGridSize.value;
        const [r, c] = val.split('x').map(Number);
        if (r && c) {
          this.setGridDimensions(r, c);
        }
      });
    }

    // 指導者用演算子変更（＋ たしざん / − ひきざん）
    if (this.selectOperation) {
      this.selectOperation.addEventListener('change', () => {
        this.setOperation(this.selectOperation.value);
      });
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
        if (row < this.rows - 1) this.setActiveCell(row + 1, col);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (row > 0) this.setActiveCell(row - 1, col);
      } else if (e.key >= '0' && e.key <= '9') {
        if (!this.isTestFinished) this.handleKeypadInput(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (!this.isTestFinished) this.clearCurrentCell();
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
