/**
 * まなびノート - 高精度ストローク幾何＆位相特徴解析エンジン (v2)
 * 小学生および大人の自然な手書き数字（0〜9および2桁）を、
 * 位相特徴（閉ループ・交差・端点）とグリッド密度マトリクスにより高い精度で判定する純JavaScriptエンジン
 */

class StrokeRecognizer {
  /**
   * ストローク群から数字を推定
   * @param {Array<{points: Array<{x: number, y: number, time: number}>}>} strokes 
   * @returns {{ answer: string, confidence: number, candidates: string[] }}
   */
  recognize(strokes) {
    if (!strokes || strokes.length === 0) {
      return { answer: '', confidence: 0, candidates: [] };
    }

    // ノイズ除去（極小ストロークや点が1つだけのものを除外）
    const validStrokes = strokes
      .map(s => ({
        points: this.simplifyPoints(s.points || [])
      }))
      .filter(s => s.points.length >= 2);

    if (validStrokes.length === 0) {
      return { answer: '', confidence: 0, candidates: [] };
    }

    // 2桁判定（左右に離れた複数ストロークのクラスタリング）
    const multiDigit = this.checkMultiDigit(validStrokes);
    if (multiDigit) {
      return multiDigit;
    }

    // 単一文字の認識
    return this.recognizeSingleDigit(validStrokes);
  }

  /**
   * 点列の単純化・等間隔化（サンプリングによる平滑化）
   */
  simplifyPoints(points) {
    if (points.length <= 2) return points;
    const res = [points[0]];
    let last = points[0];

    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(points[i].x - last.x, points[i].y - last.y);
      if (d >= 3) { // 3px以上の変化のみ採用
        res.push(points[i]);
        last = points[i];
      }
    }
    return res;
  }

  /**
   * 2桁判定（左右に明確に離れている場合）
   */
  checkMultiDigit(strokes) {
    if (strokes.length < 2) return null;

    const boxes = strokes.map(s => this.getBoundingBox(s.points));
    const globalBox = this.getGlobalBox(boxes);
    const totalW = globalBox.maxX - globalBox.minX;
    const totalH = globalBox.maxY - globalBox.minY;

    // 縦横比が明らかに横長（アスペクト比 < 0.9 かつ 幅が十分広い）
    if (totalW < totalH * 0.75 || totalW < 50) return null;

    // ストロークをX座標の重心でソート
    const strokeCenters = strokes.map((s, i) => ({
      stroke: s,
      box: boxes[i],
      cx: (boxes[i].minX + boxes[i].maxX) / 2
    })).sort((a, b) => a.cx - b.cx);

    const midX = (globalBox.minX + globalBox.maxX) / 2;
    const leftStrokes = strokeCenters.filter(s => s.cx < midX).map(s => s.stroke);
    const rightStrokes = strokeCenters.filter(s => s.cx >= midX).map(s => s.stroke);

    if (leftStrokes.length > 0 && rightStrokes.length > 0) {
      const leftRes = this.recognizeSingleDigit(leftStrokes);
      const rightRes = this.recognizeSingleDigit(rightStrokes);

      if (leftRes.answer !== '' && rightRes.answer !== '') {
        const combined = `${leftRes.answer}${rightRes.answer}`;
        return {
          answer: combined,
          confidence: (leftRes.confidence + rightRes.confidence) / 2,
          candidates: [combined, rightRes.answer]
        };
      }
    }
    return null;
  }

  /**
   * 単一数字の認識コアアルゴリズム
   */
  recognizeSingleDigit(strokes) {
    let allPoints = [];
    strokes.forEach(s => {
      allPoints = allPoints.concat(s.points);
    });

    const box = this.getBoundingBox(allPoints);
    const W = Math.max(box.maxX - box.minX, 1);
    const H = Math.max(box.maxY - box.minY, 1);

    if (W < 4 && H < 4) {
      return { answer: '', confidence: 0, candidates: [] };
    }

    const strokeCount = strokes.length;
    const aspectRatio = H / W; // 縦長比率

    // 10クラス（0〜9）のスコア初期化
    const scores = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 };

    // --- 特徴1: 縦横比（極端な縦長は「1」） ---
    if (aspectRatio > 2.2) {
      scores['1'] += 45;
    } else if (aspectRatio > 1.6) {
      scores['1'] += 25;
      scores['7'] += 10;
    }

    // --- 特徴2: 閉ループ（穴）の検出と位置 ---
    const loops = this.detectLoops(strokes, box);
    // loops: { count: number, topLoop: boolean, bottomLoop: boolean, fullLoop: boolean }

    if (loops.fullLoop) {
      scores['0'] += 50;
      scores['8'] += 20;
    } else if (loops.count >= 2) {
      scores['8'] += 55;
      scores['0'] += 15;
      scores['3'] += 10;
    } else if (loops.topLoop && !loops.bottomLoop) {
      scores['9'] += 45;
      scores['4'] += 15;
    } else if (loops.bottomLoop && !loops.topLoop) {
      scores['6'] += 45;
      scores['5'] += 10;
      scores['0'] += 10;
    }

    // --- 特徴3: ストローク数 ---
    if (strokeCount === 2) {
      scores['4'] += 30; // 4は2画が多い
      scores['5'] += 25; // 5も2画が多い（本体＋上の横棒）
      scores['7'] += 15; // 7に横棒を入れる書き癖
      scores['1'] += -20;
      scores['0'] += -20;
    } else if (strokeCount === 1) {
      scores['1'] += 10;
      scores['2'] += 15;
      scores['3'] += 15;
      scores['6'] += 15;
      scores['7'] += 15;
      scores['8'] += 15;
      scores['9'] += 15;
      scores['0'] += 15;
    }

    // --- 特徴4: 始点・終点の位置（正規化座標 0.0〜1.0） ---
    const firstStroke = strokes[0].points;
    const startPt = {
      x: (firstStroke[0].x - box.minX) / W,
      y: (firstStroke[0].y - box.minY) / H
    };
    const lastStroke = strokes[strokes.length - 1].points;
    const endPt = {
      x: (lastStroke[lastStroke.length - 1].x - box.minX) / W,
      y: (lastStroke[lastStroke.length - 1].y - box.minY) / H
    };

    // 【1】始点が上、終点が下、左右の振れ幅が小さい
    const xVariance = this.calculateXVariance(allPoints, box);
    if (strokeCount === 1 && startPt.y < 0.3 && endPt.y > 0.7 && xVariance < 0.25) {
      scores['1'] += 35;
    }

    // 【7】上部に水平成分（左から右）、そこから斜め下へ
    const horizontalTop = this.hasTopHorizontalStroke(firstStroke, box);
    if (horizontalTop && endPt.y > 0.65 && !loops.fullLoop) {
      scores['7'] += 40;
    }

    // 【2】始点が左上〜中上、終点が右下（水平に右へ抜ける）
    const endsRightBottom = endPt.y > 0.75 && endPt.x > 0.55;
    const hasBottomHorizontal = this.hasBottomHorizontalStroke(lastStroke, box);
    if (endsRightBottom || hasBottomHorizontal) {
      scores['2'] += 35;
    }

    // 【3】右側に2つの膨らみ（山）、左側が開いている
    const bumps = this.countRightBumps(firstStroke, box);
    if (bumps >= 2 && !loops.fullLoop && endPt.x < 0.6) {
      scores['3'] += 40;
    }

    // 【5】上部に角または横棒、下部に半円（右へ膨らむ）
    if (strokeCount <= 2 && this.hasFiveShape(strokes, box)) {
      scores['5'] += 35;
    }

    // 【4】縦線貫通または交差
    if (this.hasFourIntersection(strokes, box)) {
      scores['4'] += 40;
    }

    // 【8】中央のくびれ
    if (this.hasWaistCrossing(allPoints, box)) {
      scores['8'] += 35;
    }

    // --- 特徴5: 3×3 ゾーン密度分布照合 ---
    const gridDensity = this.computeGridDensity(allPoints, box);
    this.applyGridDensityScores(gridDensity, scores);

    // スコア順にソート
    const sorted = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    const bestAnswer = sorted[0];
    const topScore = scores[bestAnswer];
    const secondScore = scores[sorted[1]];

    // 確信度の算出 (0.5〜0.98)
    const confidence = Math.min(0.98, Math.max(0.5, (topScore - secondScore) / 40 + 0.6));

    return {
      answer: bestAnswer,
      confidence: Number(confidence.toFixed(2)),
      candidates: sorted.slice(0, 3)
    };
  }

  /**
   * 外接矩形
   */
  getBoundingBox(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  getGlobalBox(boxes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    boxes.forEach(b => {
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    });
    return { minX, minY, maxX, maxY };
  }

  /**
   * ループ（穴）の検出
   */
  detectLoops(strokes, box) {
    const H = box.maxY - box.minY;
    const W = box.maxX - box.minX;
    let count = 0;
    let topLoop = false;
    let bottomLoop = false;
    let fullLoop = false;

    strokes.forEach(stroke => {
      const pts = stroke.points;
      if (pts.length < 8) return;

      const start = pts[0];
      const end = pts[pts.length - 1];
      const dist = Math.hypot(end.x - start.x, end.y - start.y);

      // 始点と終点が近い場合
      if (dist < Math.max(W, H) * 0.35) {
        count++;
        // 内部に十分な面積があるか
        const strokeBox = this.getBoundingBox(pts);
        if (strokeBox.maxY - strokeBox.minY > H * 0.65) {
          fullLoop = true;
        }
      }

      // 自己交差（途中で交わって輪を作っているか）
      for (let i = 0; i < pts.length - 8; i += 2) {
        for (let j = i + 8; j < pts.length; j += 2) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d < 12) {
            const loopY = (pts[i].y + pts[j].y) / 2;
            const normY = (loopY - box.minY) / (H || 1);
            if (normY < 0.5) topLoop = true;
            if (normY > 0.5) bottomLoop = true;
            count++;
            return;
          }
        }
      }
    });

    return { count, topLoop, bottomLoop, fullLoop };
  }

  /**
   * X座標の散らばり（垂直直線の判定）
   */
  calculateXVariance(points, box) {
    const W = box.maxX - box.minX;
    if (W === 0) return 0;
    const midX = (box.minX + box.maxX) / 2;
    let sumDiff = 0;
    points.forEach(p => {
      sumDiff += Math.abs(p.x - midX);
    });
    return (sumDiff / points.length) / W;
  }

  /**
   * 上部水平線の有無（7用）
   */
  hasTopHorizontalStroke(points, box) {
    if (points.length < 6) return false;
    const W = box.maxX - box.minX;
    const H = box.maxY - box.minY;

    // 最初の1/3区間を調査
    const part = points.slice(0, Math.floor(points.length * 0.35));
    if (part.length < 2) return false;

    const start = part[0];
    const end = part[part.length - 1];
    const dx = end.x - start.x;
    const dy = Math.abs(end.y - start.y);

    // 左から右へ進み、縦のブレが小さい
    return (dx > W * 0.35) && (dy < H * 0.25) && (start.y < box.minY + H * 0.4);
  }

  /**
   * 下部水平線の有無（2用）
   */
  hasBottomHorizontalStroke(points, box) {
    if (points.length < 6) return false;
    const W = box.maxX - box.minX;
    const H = box.maxY - box.minY;

    // 最後の1/3区間を調査
    const part = points.slice(Math.floor(points.length * 0.65));
    if (part.length < 2) return false;

    const start = part[0];
    const end = part[part.length - 1];
    const dx = end.x - start.x;
    const dy = Math.abs(end.y - start.y);

    return (dx > W * 0.3) && (dy < H * 0.25) && (end.y > box.minY + H * 0.7);
  }

  /**
   * 右側の山（3の円弧）カウント
   */
  countRightBumps(points, box) {
    if (points.length < 10) return 0;
    const midX = (box.minX + box.maxX) / 2;
    let bumps = 0;
    let movingRight = false;

    for (let i = 2; i < points.length; i++) {
      const dx = points[i].x - points[i - 2].x;
      if (dx > 3 && !movingRight && points[i].x > midX) {
        movingRight = true;
      } else if (dx < -3 && movingRight) {
        movingRight = false;
        bumps++;
      }
    }
    return bumps;
  }

  /**
   * 4の交差判定
   */
  hasFourIntersection(strokes, box) {
    if (strokes.length === 2) {
      // 1画目がL字、2画目が縦線
      const s1 = strokes[0].points;
      const s2 = strokes[1].points;
      const s2Box = this.getBoundingBox(s2);
      const s2Aspect = (s2Box.maxY - s2Box.minY) / (s2Box.maxX - s2Box.minX || 1);
      if (s2Aspect > 1.8 && s2Box.maxY > box.maxY - (box.maxY - box.minY) * 0.2) {
        return true;
      }
    }
    return false;
  }

  /**
   * 5の形状判定
   */
  hasFiveShape(strokes, box) {
    const H = box.maxY - box.minY;
    const W = box.maxX - box.minX;

    if (strokes.length === 2) {
      const b1 = this.getBoundingBox(strokes[0].points);
      const b2 = this.getBoundingBox(strokes[1].points);
      // 上に水平線、下に本体
      if (b2.minY < box.minY + H * 0.35 && (b2.maxX - b2.minX) > W * 0.4) {
        return true;
      }
    }
    return false;
  }

  /**
   * 8のウエスト交差判定
   */
  hasWaistCrossing(points, box) {
    const H = box.maxY - box.minY;
    const midY = (box.minY + box.maxY) / 2;
    const bandH = H * 0.2;

    const waistPts = points.filter(p => Math.abs(p.y - midY) < bandH);
    if (waistPts.length < 4) return false;

    let minX = Math.min(...waistPts.map(p => p.x));
    let maxX = Math.max(...waistPts.map(p => p.x));
    const waistW = maxX - minX;
    const totalW = box.maxX - box.minX;

    return waistW < totalW * 0.65;
  }

  /**
   * 3×3 ゾーン密度マトリクスの算出
   */
  computeGridDensity(points, box) {
    const density = Array(9).fill(0);
    const W = box.maxX - box.minX || 1;
    const H = box.maxY - box.minY || 1;

    points.forEach(p => {
      const col = Math.min(2, Math.floor(((p.x - box.minX) / W) * 3));
      const row = Math.min(2, Math.floor(((p.y - box.minY) / H) * 3));
      density[row * 3 + col]++;
    });

    const total = points.length || 1;
    return density.map(count => count / total);
  }

  /**
   * 密度マトリクスによるスコアリング補助
   */
  applyGridDensityScores(d, scores) {
    // 中央列（d[1], d[4], d[7]）に集中している → 1
    if (d[1] + d[4] + d[7] > 0.6) {
      scores['1'] += 20;
    }
    // 上部（d[0], d[1], d[2]）と下部（d[6], d[7], d[8]）にインクが多く、中央空洞 → 0
    if (d[4] < 0.08 && d[0] > 0.08 && d[2] > 0.08 && d[6] > 0.08 && d[8] > 0.08) {
      scores['0'] += 25;
    }
    // 右上（d[2]）と右下（d[8]）にインクが多い → 3
    if (d[2] > 0.15 && d[8] > 0.15 && d[0] < 0.15) {
      scores['3'] += 15;
    }
    // 左上（d[0]）と右上（d[2]）に多く、左下（d[6]）が空 → 7
    if (d[0] + d[1] + d[2] > 0.4 && d[6] < 0.05) {
      scores['7'] += 15;
    }
  }
}

// ブラウザグローバルへエクスポート
window.StrokeRecognizer = StrokeRecognizer;
