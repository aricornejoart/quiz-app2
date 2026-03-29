// ================= CONFIG =================
const sheetId = '16bOgCaHG0Y450hwfl6tiHgAgTTxdxTVuMDhWLZbdD4E';

// ================= SETTINGS =================
let SPEED_DELAY = 300;

// ================= GLOBAL STATE =================
let questions = [];
let questionQueue = [];
let currentIndex = 0;
let questionIdCounter = 0;
let quizListCache = [];
let isAppFullscreen = false;

// penalty mode state
let pendingPenaltyJump = false;
let pendingPenaltyCorrect = false;
let penaltyAnswerLocked = false;
let penaltyFinished = false;
let penaltySolvedIds = new Set();

// mastery mode state
let pendingMasteryAdvance = false;

// normal mode state
let normalFinished = false;

// answer lock state
let questionAnswered = false;

// hints state
let pendingHint = null;
let hintOverlayOpen = false;

const quizSelector = document.getElementById('quizSelector');
const combineInput = document.getElementById('combineInput');
const combineGoBtn = document.getElementById('combineGoBtn');
const settingsBtn = document.getElementById('settingsBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const settingsPopup = document.getElementById('settingsPopup');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

const hintOverlay = document.getElementById('hintOverlay');
const closeHintBtn = document.getElementById('closeHintBtn');
const hintBody = document.getElementById('hintBody');
const hintContent = document.getElementById('hintContent');
const hintImage = document.getElementById('hintImage');
const hintImagePanel = document.getElementById('hintImagePanel');
const hintTextPanel = document.getElementById('hintTextPanel');

// ================= SHEETS PARSER =================
function parseGoogleSheetResponse(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
        throw new Error('Could not parse Google Sheets response');
    }
    return JSON.parse(text.substring(start, end + 1));
}

// ================= SHEETS CELL HELPERS =================
function normalizeSheetText(value) {
    return String(value ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\u00A0/g, ' ')
        .trim();
}

function getCellValue(cell) {
    if (!cell) return '';

    if (cell.v !== null && cell.v !== undefined) {
        return normalizeSheetText(cell.v);
    }

    if (cell.f !== null && cell.f !== undefined) {
        return normalizeSheetText(cell.f);
    }

    return '';
}

// ================= MODE HELPERS =================
function isPenaltyMode() {
    return document.getElementById('penaltyMode').checked;
}

function isRetryMode() {
    return document.getElementById('masteryMode').checked;
}

function isSpeedMode() {
    return document.getElementById('rapidMode').checked;
}

function isHintsMode() {
    return document.getElementById('hintsMode').checked;
}

function isNormalMode() {
    return !isPenaltyMode() && !isRetryMode();
}

function canUseHints() {
    return isHintsMode() && !isSpeedMode() && (isPenaltyMode() || isRetryMode());
}

function updateHintsAvailability() {
    const hintsCheckbox = document.getElementById('hintsMode');
    const hintsLabel = document.getElementById('hintsModeLabel');
    const hintsAllowed = isPenaltyMode() || isRetryMode();

    hintsCheckbox.disabled = !hintsAllowed;
    hintsLabel.classList.toggle('disabled-setting', !hintsAllowed);

    if (!hintsAllowed) {
        hintsCheckbox.checked = false;
        clearPendingHint();
    }
}

// ================= SETTINGS / FULLSCREEN UI =================
function openSettingsPopup() {
    settingsPopup.classList.remove('hidden');
    settingsBtn.classList.add('active');
}

function closeSettingsPopup() {
    settingsPopup.classList.add('hidden');
    settingsBtn.classList.remove('active');
}

function toggleSettingsPopup() {
    if (settingsPopup.classList.contains('hidden')) {
        openSettingsPopup();
    } else {
        closeSettingsPopup();
    }
}

function enterFullscreenMode() {
    isAppFullscreen = true;
    document.body.classList.add('fullscreen-mode');
    fullscreenBtn.classList.add('active');
    fullscreenBtn.setAttribute('title', 'Exit Fullscreen');
}

function exitFullscreenMode() {
    isAppFullscreen = false;
    document.body.classList.remove('fullscreen-mode');
    fullscreenBtn.classList.remove('active');
    fullscreenBtn.setAttribute('title', 'Fullscreen');
}

function toggleFullscreenMode() {
    if (isAppFullscreen) {
        exitFullscreenMode();
    } else {
        enterFullscreenMode();
    }
}

// ================= HINTS UI =================
function clearPendingHint() {
    pendingHint = null;
}

function queueHintIfEligible(question) {
    const text = normalizeSheetText(question?.hintText);
    const imageUrl = normalizeSheetText(question?.hintImage);

    if (!canUseHints() || (!text && !imageUrl)) {
        pendingHint = null;
        return;
    }

    pendingHint = {
        text,
        imageUrl
    };
}

function openHintOverlay(hintData) {
    if (!hintData) return;

    const text = normalizeSheetText(hintData.text);
    const imageUrl = normalizeSheetText(hintData.imageUrl);
    const hasText = !!text;
    const hasImage = !!imageUrl;

    if (!hasText && !hasImage) return;

    hintContent.innerText = text;
    hintImage.src = '';
    hintImage.alt = 'Hint image';
    hintImagePanel.classList.add('hidden');

    hintBody.classList.remove('text-only', 'image-only', 'text-image');

    if (hasImage) {
        hintImage.src = imageUrl;
        hintImagePanel.classList.remove('hidden');
    }

    if (hasText && hasImage) {
        hintBody.classList.add('text-image');
        hintTextPanel.classList.remove('hidden');
        hintImagePanel.classList.remove('hidden');
    } else if (hasText) {
        hintBody.classList.add('text-only');
        hintTextPanel.classList.remove('hidden');
        hintImagePanel.classList.add('hidden');
    } else {
        hintBody.classList.add('image-only');
        hintTextPanel.classList.add('hidden');
        hintImagePanel.classList.remove('hidden');
    }

    hintOverlay.classList.remove('hidden');
    hintOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hint-open');
    hintOverlayOpen = true;
}

function closeHintOverlay() {
    hintOverlay.classList.add('hidden');
    hintOverlay.setAttribute('aria-hidden', 'true');
    hintContent.innerText = '';
    hintImage.src = '';
    hintTextPanel.classList.remove('hidden');
    hintImagePanel.classList.add('hidden');
    hintBody.classList.remove('text-only', 'image-only', 'text-image');
    document.body.classList.remove('hint-open');
    hintOverlayOpen = false;
    clearPendingHint();
}

function showPendingHintIfAny() {
    if (!pendingHint) return;
    openHintOverlay(pendingHint);
}

// ================= COMBINE HELPERS =================
function setCombineValidState(isValid) {
    combineInput.classList.toggle('invalid', !isValid);
}

function normalizeCombineInput(value) {
    return value.replace(/\s+/g, '');
}

function parseCombineRange(rawValue) {
    const cleaned = normalizeCombineInput(rawValue);

    if (!cleaned) {
        return { valid: false, numbers: [] };
    }

    const parts = cleaned.split(',');
    const numbers = [];
    const seen = new Set();

    for (const part of parts) {
        if (!part) {
            return { valid: false, numbers: [] };
        }

        if (/^\d+$/.test(part)) {
            const num = Number(part);
            if (num <= 0) return { valid: false, numbers: [] };
            if (!seen.has(num)) {
                seen.add(num);
                numbers.push(num);
            }
            continue;
        }

        if (/^\d+-\d+$/.test(part)) {
            const [startRaw, endRaw] = part.split('-');
            const start = Number(startRaw);
            const end = Number(endRaw);

            if (start <= 0 || end <= 0 || start > end) {
                return { valid: false, numbers: [] };
            }

            for (let n = start; n <= end; n++) {
                if (!seen.has(n)) {
                    seen.add(n);
                    numbers.push(n);
                }
            }
            continue;
        }

        return { valid: false, numbers: [] };
    }

    return { valid: true, numbers };
}

function getQuizMapByRangeNumber() {
    const map = new Map();

    quizListCache.forEach(q => {
        if (q.rangeNumber !== null && q.rangeNumber !== undefined && q.rangeNumber !== '') {
            map.set(Number(q.rangeNumber), q);
        }
    });

    return map;
}

async function loadCombinedQuestionsFromInput(rawValue) {
    const parsed = parseCombineRange(rawValue);
    if (!parsed.valid || parsed.numbers.length === 0) {
        throw new Error('Invalid combine input');
    }

    const quizMap = getQuizMapByRangeNumber();
    const selectedQuizzes = [];

    for (const num of parsed.numbers) {
        const match = quizMap.get(num);
        if (!match) {
            throw new Error(`Range number ${num} not found`);
        }
        selectedQuizzes.push(match);
    }

    const results = await Promise.all(
        selectedQuizzes.map(q => loadQuestions(q.sheet))
    );

    return results.flat();
}

async function applyLoadedQuestions(newQuestions) {
    questions = newQuestions;
    questionQueue = [...questions];

    if (document.getElementById('shuffleQuestions').checked) {
        shuffleArray(questionQueue);
    }

    resetModeState();
    showQuestion();
}

// ================= LOAD QUIZ LIST =================
async function loadQuizList() {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=Config`);
    const text = await res.text();
    const json = parseGoogleSheetResponse(text);

    return json.table.rows.map(r => ({
        sheet: getCellValue(r.c?.[0]),
        name: getCellValue(r.c?.[1]),
        rangeNumber: getCellValue(r.c?.[2])
    })).filter(q => q.sheet && q.name);
}

// ================= DROPDOWN =================
async function populateQuizDropdown() {
    quizListCache = await loadQuizList();
    quizSelector.innerHTML = '';

    quizListCache.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.sheet;
        opt.innerText = q.name;
        quizSelector.appendChild(opt);
    });

    return quizListCache;
}

// ================= LOAD QUESTIONS =================
async function loadQuestions(sheetName) {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}`);
    const text = await res.text();
    const json = parseGoogleSheetResponse(text);
    const rows = json.table.rows;

    const type = getCellValue(rows[0]?.c?.[1]).toLowerCase();

    if (type === 'hierarchy') {
        return rows.map(r => {
            const c = r.c || [];
            return {
                id: `q_${questionIdCounter++}`,
                question: getCellValue(c[0]),
                type: 'hierarchy',
                options: [
                    getCellValue(c[2]),
                    getCellValue(c[3]),
                    getCellValue(c[4]),
                    getCellValue(c[5]),
                    getCellValue(c[6]),
                    getCellValue(c[7]),
                    getCellValue(c[8]),
                    getCellValue(c[9]),
                    getCellValue(c[10]),
                    getCellValue(c[11])
                ].filter(Boolean),
                correctOrder: [
                    getCellValue(c[12]),
                    getCellValue(c[13]),
                    getCellValue(c[14]),
                    getCellValue(c[15]),
                    getCellValue(c[16]),
                    getCellValue(c[17]),
                    getCellValue(c[18]),
                    getCellValue(c[19]),
                    getCellValue(c[20]),
                    getCellValue(c[21])
                ]
                    .map(n => n ? Number(n) : null)
                    .filter(n => n !== null),
                image: getCellValue(c[22]),
                hintText: getCellValue(c[23]),   // X
                hintImage: getCellValue(c[24])   // Y
            };
        }).filter(q => q.question && q.question.toLowerCase() !== 'question');
    }

    return rows.map(r => {
        const c = r.c || [];
        return {
            id: `q_${questionIdCounter++}`,
            question: getCellValue(c[0]),
            type: 'multiple choice',
            options: [
                getCellValue(c[2]),
                getCellValue(c[3]),
                getCellValue(c[4]),
                getCellValue(c[5])
            ].filter(Boolean),
            correct: getCellValue(c[6]),
            explanations: [
                getCellValue(c[7]),
                getCellValue(c[8]),
                getCellValue(c[9]),
                getCellValue(c[10])
            ],
            image: getCellValue(c[11]),
            hintText: getCellValue(c[12]),      // M
            hintImage: getCellValue(c[13])      // N
        };
    }).filter(q => q.question && q.question.toLowerCase() !== 'question');
}

// ================= SHUFFLE =================
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ================= ANSWER LOCK HELPERS =================
function setOptionButtonsEnabled(enabled) {
    document.querySelectorAll('.optionBtn').forEach(btn => {
        btn.disabled = !enabled;
        btn.style.pointerEvents = enabled ? 'auto' : 'none';
        btn.style.opacity = enabled ? '1' : '0.65';
    });
}

function setHierarchyInteractionEnabled(enabled) {
    const submit = document.getElementById('hierarchySubmit');
    if (submit) {
        submit.disabled = !enabled;
        submit.style.pointerEvents = enabled ? 'auto' : 'none';
        submit.style.opacity = enabled ? '1' : '0.65';
    }

    document.querySelectorAll('.hierarchy-arrow').forEach(btn => {
        btn.disabled = !enabled;
        btn.style.pointerEvents = enabled ? 'auto' : 'none';
        btn.style.opacity = enabled ? '1' : '0.65';
    });

    document.querySelectorAll('.hierarchy-item').forEach(item => {
        item.dataset.dragDisabled = enabled ? 'false' : 'true';
        item.style.cursor = enabled ? 'grab' : 'default';
        item.style.opacity = enabled ? '1' : '0.8';
    });
}

// ================= UI RESET HELPERS =================
function clearFeedback() {
    const fb = document.getElementById('progressSideFeedback');
    if (fb) {
        fb.innerText = '';
        fb.classList.remove('correct', 'incorrect');
    }
}

function clearExplanations() {
    for (let i = 1; i <= 4; i++) {
        const exp = document.getElementById(`explanation${i}`);
        if (exp) exp.innerText = '';
    }
}

function clearOptionFeedback() {
    for (let i = 1; i <= 4; i++) {
        const fb = document.getElementById(`optionFeedback${i}`);
        if (fb) {
            fb.innerText = '';
            fb.classList.remove('correct-mark', 'incorrect-mark');
        }
    }
}

function removeHierarchyUI() {
    const oldHierarchy = document.getElementById('hierarchyContainer');
    if (oldHierarchy) oldHierarchy.remove();

    const oldSubmit = document.getElementById('hierarchySubmit');
    if (oldSubmit) oldSubmit.remove();
}

function clearQuestionUI() {
    clearFeedback();
    clearExplanations();
    clearOptionFeedback();
    removeHierarchyUI();
}

// ================= FEEDBACK HELPER =================
function setFeedback(text, isCorrect) {
    const fb = document.getElementById('progressSideFeedback');
    if (!fb) return;

    fb.innerText = text;
    fb.classList.remove('correct', 'incorrect');
    fb.classList.add(isCorrect ? 'correct' : 'incorrect');
}

// ================= PROGRESS =================
function updateProgress() {
    const total = questions.length;
    let remaining = 0;

    if (isPenaltyMode()) {
        remaining = penaltyFinished ? 0 : (questionQueue.length - currentIndex);
    } else if (isRetryMode()) {
        remaining = questionQueue.length;
    } else {
        remaining = normalFinished ? 0 : (questionQueue.length - currentIndex);
    }

    if (remaining < 0) remaining = 0;
    if (remaining > total) remaining = total;

    const completed = total - remaining;
    const percent = total > 0 ? (completed / total) * 100 : 0;

    document.getElementById('progressText').innerText = `${remaining} remaining`;
    document.getElementById('progressFill').style.width = `${percent}%`;
}

// ================= FINISH CHECK =================
function isQuizFinished() {
    if (isPenaltyMode()) return penaltyFinished;
    if (isRetryMode()) return questionQueue.length === 0;
    return normalFinished;
}

// ================= SHOW QUESTION =================
function showQuestion() {
    clearQuestionUI();
    questionAnswered = false;

    if (isPenaltyMode()) {
        penaltyAnswerLocked = false;
    }

    if (isQuizFinished()) {
        document.getElementById('questionText').innerText = 'Quiz Finished!';
        document.querySelector('.options').style.display = 'none';

        const img = document.getElementById('questionImage');
        img.style.display = 'none';
        img.src = '';

        updateProgress();
        return;
    }

    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= questionQueue.length) currentIndex = questionQueue.length - 1;

    const q = questionQueue[currentIndex];
    document.getElementById('questionText').innerText = q.question;

    const img = document.getElementById('questionImage');
    img.style.display = q.image ? 'block' : 'none';
    img.src = q.image || '';

    document.querySelector('.options').style.display = 'none';

    if (q.type === 'multiple choice') {
        showMC(q);
    } else {
        showHierarchy(q);
    }

    updateProgress();
}

// ================= MULTIPLE CHOICE =================
function showMC(q) {
    const container = document.querySelector('.options');
    container.style.display = 'flex';

    let options = [...q.options];
    let explanations = [...(q.explanations || [])];

    if (document.getElementById('shuffleAnswers').checked) {
        const combo = options.map((o, i) => ({
            o,
            e: explanations[i]
        }));
        shuffleArray(combo);
        options = combo.map(x => x.o);
        explanations = combo.map(x => x.e);
    }

    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`option${i + 1}`);
        const exp = document.getElementById(`explanation${i + 1}`);
        const fb = document.getElementById(`optionFeedback${i + 1}`);

        if (options[i]) {
            btn.style.display = 'block';
            btn.innerText = options[i];
            btn.disabled = false;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
            btn.onclick = () => checkAnswer(options[i], explanations);
            exp.innerText = '';
            if (fb) {
                fb.innerText = '';
                fb.classList.remove('correct-mark', 'incorrect-mark');
            }
        } else {
            btn.style.display = 'none';
            btn.innerText = '';
            btn.onclick = null;
            exp.innerText = '';
            if (fb) {
                fb.innerText = '';
                fb.classList.remove('correct-mark', 'incorrect-mark');
            }
        }
    }
}

// ================= WRONG ANSWER LOGIC =================
function handleWrongAnswer() {
    const q = questionQueue[currentIndex];

    if (isPenaltyMode()) {
        penaltySolvedIds.delete(q.id);
        pendingPenaltyJump = true;
        pendingPenaltyCorrect = false;
        penaltyAnswerLocked = true;
        return;
    }

    if (isRetryMode()) {
        const wrongQuestion = q;

        questionQueue.splice(currentIndex, 1);

        let insertIndex = currentIndex + 3;
        if (insertIndex > questionQueue.length) {
            insertIndex = questionQueue.length;
        }

        questionQueue.splice(insertIndex, 0, wrongQuestion);
        pendingMasteryAdvance = true;
        return;
    }
}

// ================= CORRECT ANSWER LOGIC =================
function handleCorrectAnswer() {
    const q = questionQueue[currentIndex];

    if (isPenaltyMode()) {
        penaltySolvedIds.add(q.id);
        pendingPenaltyCorrect = true;
        pendingPenaltyJump = false;
        penaltyAnswerLocked = true;
        return;
    }

    if (isRetryMode()) {
        questionQueue.splice(currentIndex, 1);

        if (questionQueue.length === 0) {
            currentIndex = 0;
        }

        pendingMasteryAdvance = true;
        return;
    }
}

// ================= ANSWER =================
function checkAnswer(selected, explanations) {
    if (isQuizFinished()) return;
    if (questionAnswered) return;
    if (hintOverlayOpen) return;
    if (isPenaltyMode() && penaltyAnswerLocked) return;

    questionAnswered = true;
    setOptionButtonsEnabled(false);

    const q = questionQueue[currentIndex];
    const isCorrect = selected === q.correct;

    document.querySelectorAll('.optionBtn').forEach((btn, i) => {
        const feedbackEl = document.getElementById(`optionFeedback${i + 1}`);

        if (explanations[i]) {
            document.getElementById(`explanation${i + 1}`).innerText = explanations[i];
        }

        if (feedbackEl) {
            feedbackEl.classList.remove('correct-mark', 'incorrect-mark');

            if (btn.innerText === q.correct) {
                feedbackEl.innerText = '✔';
                feedbackEl.classList.add('correct-mark');
            } else if (btn.innerText === selected && !isCorrect) {
                feedbackEl.innerText = '✖';
                feedbackEl.classList.add('incorrect-mark');
            } else {
                feedbackEl.innerText = '';
            }
        }
    });

    if (isCorrect) {
        clearPendingHint();
        setFeedback('Correct!', true);
        handleCorrectAnswer();
    } else {
        queueHintIfEligible(q);
        setFeedback('Incorrect!', false);
        handleWrongAnswer();
    }

    if (isRetryMode()) {
        updateProgress();
    }

    if (isSpeedMode()) {
        setTimeout(nextQuestion, SPEED_DELAY);
    }
}

// ================= HIERARCHY DRAG =================
function enableHierarchyDrag(container) {
    let draggedRow = null;
    let placeholder = null;
    let dragOffsetY = 0;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragging = false;

    function clearDropIndicators() {
        Array.from(container.children).forEach(row => {
            row.style.borderTop = '';
            row.style.borderBottom = '';
        });
        if (placeholder) {
            placeholder.style.background = 'rgba(124,108,255,0.18)';
            placeholder.style.border = '2px dashed #7c6cff';
        }
    }

    function finishDrag() {
        if (!draggedRow) return;

        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        clearDropIndicators();

        if (placeholder && placeholder.parentNode === container) {
            container.replaceChild(draggedRow, placeholder);
        }

        draggedRow.style.position = '';
        draggedRow.style.left = '';
        draggedRow.style.top = '';
        draggedRow.style.width = '';
        draggedRow.style.zIndex = '';
        draggedRow.style.pointerEvents = '';
        draggedRow.style.opacity = '';
        draggedRow.style.transform = '';
        draggedRow.style.boxShadow = '';
        draggedRow.style.cursor = 'default';

        draggedRow = null;
        placeholder = null;
        dragging = false;
    }

    function onPointerMove(e) {
        if (!draggedRow) return;

        if (!dragging) {
            const movedEnough = Math.abs(e.clientY - dragStartY) > 4 || Math.abs(e.clientX - dragStartX) > 4;
            if (!movedEnough) return;
            dragging = true;
        }

        e.preventDefault();

        draggedRow.style.top = `${e.clientY - dragOffsetY}px`;
        draggedRow.style.left = `${container.getBoundingClientRect().left}px`;

        clearDropIndicators();

        const rows = Array.from(container.children).filter(row => row !== placeholder);

        if (rows.length === 0) {
            container.appendChild(placeholder);
            return;
        }

        let placed = false;

        for (const row of rows) {
            const rect = row.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if (e.clientY < midpoint) {
                row.style.borderTop = '3px solid #7c6cff';
                container.insertBefore(placeholder, row);
                placed = true;
                break;
            }
        }

        if (!placed) {
            const lastRow = rows[rows.length - 1];
            lastRow.style.borderBottom = '3px solid #7c6cff';
            container.appendChild(placeholder);
        }
    }

    function onPointerUp() {
        finishDrag();
    }

    container.querySelectorAll('.hierarchy-item').forEach(item => {
        item.addEventListener('pointerdown', e => {
            if (hintOverlayOpen) return;
            if (item.dataset.dragDisabled === 'true') return;
            if (questionAnswered) return;
            if (e.button !== undefined && e.button !== 0) return;

            const row = item.closest('.hierarchy-row');
            if (!row) return;

            e.preventDefault();

            draggedRow = row;
            dragging = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rowRect = row.getBoundingClientRect();
            dragOffsetY = e.clientY - rowRect.top;

            placeholder = document.createElement('div');
            placeholder.className = 'hierarchy-placeholder';
            placeholder.style.height = `${rowRect.height}px`;
            placeholder.style.border = '2px dashed #7c6cff';
            placeholder.style.borderRadius = '8px';
            placeholder.style.background = 'rgba(124,108,255,0.18)';
            placeholder.style.boxSizing = 'border-box';

            container.replaceChild(placeholder, row);
            container.appendChild(row);

            draggedRow.style.position = 'fixed';
            draggedRow.style.left = `${rowRect.left}px`;
            draggedRow.style.top = `${rowRect.top}px`;
            draggedRow.style.width = `${rowRect.width}px`;
            draggedRow.style.zIndex = '9999';
            draggedRow.style.pointerEvents = 'none';
            draggedRow.style.opacity = '0.92';
            draggedRow.style.transform = 'scale(1.01)';
            draggedRow.style.boxShadow = '0 8px 20px rgba(0,0,0,0.35)';
            draggedRow.style.cursor = 'grabbing';

            window.addEventListener('pointermove', onPointerMove, { passive: false });
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerUp);
        });
    });
}

// ================= HIERARCHY =================
function showHierarchy(q) {
    const container = document.createElement('div');
    container.id = 'hierarchyContainer';

    let options = [...q.options];
    if (document.getElementById('shuffleAnswers').checked) {
        shuffleArray(options);
    }

    options.forEach(opt => {
        const row = document.createElement('div');
        row.className = 'hierarchy-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '10px';
        row.style.borderRadius = '8px';
        row.style.transition = 'border 0.12s ease, background 0.12s ease';

        const arrows = document.createElement('div');
        arrows.style.display = 'flex';
        arrows.style.flexDirection = 'column';
        arrows.style.alignItems = 'center';
        arrows.style.gap = '4px';

        const up = document.createElement('button');
        up.type = 'button';
        up.innerText = '^';
        up.className = 'hierarchy-arrow';
        up.onclick = e => {
            e.stopPropagation();
            if (hintOverlayOpen) return;
            if (questionAnswered) return;

            const prev = row.previousElementSibling;
            if (prev && prev.querySelector('.hierarchy-item')) {
                container.insertBefore(row, prev);
            }
        };

        const down = document.createElement('button');
        down.type = 'button';
        down.innerText = '^';
        down.className = 'hierarchy-arrow down-arrow';
        down.onclick = e => {
            e.stopPropagation();
            if (hintOverlayOpen) return;
            if (questionAnswered) return;

            const next = row.nextElementSibling;
            if (next && next.querySelector('.hierarchy-item')) {
                container.insertBefore(next, row);
            }
        };

        arrows.appendChild(up);
        arrows.appendChild(down);

        const item = document.createElement('div');
        item.className = 'hierarchy-item';
        item.innerText = opt;
        item.style.flex = '1';
        item.style.touchAction = 'none';
        item.style.userSelect = 'none';
        item.style.webkitUserSelect = 'none';
        item.style.cursor = 'grab';
        item.dataset.dragDisabled = 'false';

        const fb = document.createElement('div');
        fb.className = 'hierarchy-feedback';

        row.appendChild(arrows);
        row.appendChild(item);
        row.appendChild(fb);

        container.appendChild(row);
    });

    document.querySelector('.question-container').appendChild(container);

    const submit = document.createElement('button');
    submit.id = 'hierarchySubmit';
    submit.innerText = 'Submit';

    submit.onclick = () => {
        if (hintOverlayOpen) return;
        if (questionAnswered) return;
        if (isPenaltyMode() && penaltyAnswerLocked) return;

        questionAnswered = true;
        setHierarchyInteractionEnabled(false);

        const rows = [...container.children];
        let allCorrect = true;

        rows.forEach((r, i) => {
            const text = r.querySelector('.hierarchy-item').innerText;
            const fb = r.querySelector('.hierarchy-feedback');

            fb.classList.remove('correct-mark', 'incorrect-mark');

            if (q.options.indexOf(text) === q.correctOrder[i] - 1) {
                fb.innerText = '✔';
                fb.classList.add('correct-mark');
            } else {
                fb.innerText = '✖';
                fb.classList.add('incorrect-mark');
                allCorrect = false;
            }
        });

        if (allCorrect) {
            clearPendingHint();
            setFeedback('Correct!', true);
            handleCorrectAnswer();
        } else {
            queueHintIfEligible(q);
            setFeedback('Incorrect!', false);
            handleWrongAnswer();
        }

        if (isRetryMode()) {
            updateProgress();
        }

        if (isSpeedMode()) {
            setTimeout(nextQuestion, SPEED_DELAY);
        }
    };

    document.querySelector('.question-container').appendChild(submit);

    enableHierarchyDrag(container);
    setHierarchyInteractionEnabled(true);
}

// ================= NAV =================
function nextQuestion() {
    if (hintOverlayOpen) return;

    clearFeedback();
    clearExplanations();

    if (isQuizFinished()) {
        showQuestion();
        showPendingHintIfAny();
        return;
    }

    if (isPenaltyMode()) {
        if (pendingPenaltyJump) {
            currentIndex = Math.max(0, currentIndex - 3);
            pendingPenaltyJump = false;
            pendingPenaltyCorrect = false;
            penaltyAnswerLocked = false;
            showQuestion();
            showPendingHintIfAny();
            return;
        }

        if (pendingPenaltyCorrect) {
            if (currentIndex < questionQueue.length - 1) {
                currentIndex++;
            } else if (penaltySolvedIds.size === questionQueue.length) {
                penaltyFinished = true;
            }

            pendingPenaltyCorrect = false;
            penaltyAnswerLocked = false;
            showQuestion();
            showPendingHintIfAny();
            return;
        }

        if (currentIndex < questionQueue.length - 1) {
            currentIndex++;
        } else if (penaltySolvedIds.size === questionQueue.length) {
            penaltyFinished = true;
        }

        penaltyAnswerLocked = false;
        showQuestion();
        showPendingHintIfAny();
        return;
    }

    if (isRetryMode()) {
        if (questionQueue.length === 0) {
            showQuestion();
            showPendingHintIfAny();
            return;
        }

        if (pendingMasteryAdvance) {
            pendingMasteryAdvance = false;

            if (currentIndex >= questionQueue.length) {
                currentIndex = Math.max(0, questionQueue.length - 1);
            }

            showQuestion();
            showPendingHintIfAny();
            return;
        }

        if (currentIndex < questionQueue.length - 1) {
            currentIndex++;
        }

        showQuestion();
        showPendingHintIfAny();
        return;
    }

    if (currentIndex < questionQueue.length - 1) {
        currentIndex++;
    } else {
        normalFinished = true;
    }

    showQuestion();
    clearPendingHint();
}

function prevQuestion() {
    if (hintOverlayOpen) return;

    clearFeedback();
    clearExplanations();
    clearPendingHint();

    if (isPenaltyMode()) {
        pendingPenaltyJump = false;
        pendingPenaltyCorrect = false;
        penaltyAnswerLocked = false;

        if (penaltyFinished) {
            penaltyFinished = false;
            currentIndex = Math.max(0, questionQueue.length - 1);
            showQuestion();
            return;
        }

        if (currentIndex > 0) {
            currentIndex--;
        }

        showQuestion();
        return;
    }

    if (isRetryMode()) {
        if (pendingMasteryAdvance) {
            pendingMasteryAdvance = false;
        }

        if (currentIndex > 0) {
            currentIndex--;
        }

        showQuestion();
        return;
    }

    if (normalFinished) {
        normalFinished = false;
        currentIndex = Math.max(0, questionQueue.length - 1);
        showQuestion();
        return;
    }

    if (currentIndex > 0) {
        currentIndex--;
    }

    showQuestion();
}

// ================= RESET STATE =================
function resetModeState() {
    currentIndex = 0;

    pendingPenaltyJump = false;
    pendingPenaltyCorrect = false;
    penaltyAnswerLocked = false;
    penaltyFinished = false;
    penaltySolvedIds = new Set();

    pendingMasteryAdvance = false;

    normalFinished = false;
    questionAnswered = false;

    clearPendingHint();
    closeHintOverlay();
}

// ================= RESTART =================
function restartQuiz() {
    resetModeState();
    questionQueue = [...questions];

    if (document.getElementById('shuffleQuestions').checked) {
        shuffleArray(questionQueue);
    }

    updateHintsAvailability();
    showQuestion();
}

// ================= EVENTS =================
document.getElementById('nextBtn').onclick = nextQuestion;
document.getElementById('prevBtn').onclick = prevQuestion;
document.getElementById('restartBtn').onclick = restartQuiz;

document.getElementById('penaltyMode').onchange = e => {
    if (e.target.checked) {
        document.getElementById('masteryMode').checked = false;
    }
    updateHintsAvailability();
    restartQuiz();
};

document.getElementById('masteryMode').onchange = e => {
    if (e.target.checked) {
        document.getElementById('penaltyMode').checked = false;
    }
    updateHintsAvailability();
    restartQuiz();
};

document.getElementById('rapidMode').onchange = e => {
    if (e.target.checked && isHintsMode()) {
        document.getElementById('hintsMode').checked = false;
    }
    updateHintsAvailability();
    restartQuiz();
};

document.getElementById('hintsMode').onchange = e => {
    if (e.target.checked && isSpeedMode()) {
        document.getElementById('rapidMode').checked = false;
    }
};

combineInput.addEventListener('input', () => {
    setCombineValidState(true);
});

combineInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        combineGoBtn.click();
    }
});

combineGoBtn.addEventListener('click', async () => {
    const rawValue = combineInput.value.trim();

    if (!rawValue) {
        setCombineValidState(true);
        return;
    }

    try {
        const combinedQuestions = await loadCombinedQuestionsFromInput(rawValue);

        if (!combinedQuestions.length) {
            throw new Error('No questions found');
        }

        setCombineValidState(true);
        await applyLoadedQuestions(combinedQuestions);
        updateHintsAvailability();
    } catch (err) {
        console.error(err);
        setCombineValidState(false);
    }
});

quizSelector.addEventListener('change', async e => {
    if (combineInput.value.trim()) {
        return;
    }

    setCombineValidState(true);

    questions = await loadQuestions(e.target.value);
    questionQueue = [...questions];

    if (document.getElementById('shuffleQuestions').checked) {
        shuffleArray(questionQueue);
    }

    resetModeState();
    updateHintsAvailability();
    showQuestion();
});

settingsBtn.addEventListener('click', e => {
    e.stopPropagation();
    toggleSettingsPopup();
});

closeSettingsBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeSettingsPopup();
});

settingsPopup.addEventListener('click', e => {
    e.stopPropagation();
});

fullscreenBtn.addEventListener('click', () => {
    toggleFullscreenMode();
});

closeHintBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeHintOverlay();
});

document.addEventListener('click', e => {
    if (!settingsPopup.classList.contains('hidden') && !settingsPopup.contains(e.target) && e.target !== settingsBtn) {
        closeSettingsPopup();
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (hintOverlayOpen) {
            closeHintOverlay();
            return;
        }

        if (isAppFullscreen) {
            exitFullscreenMode();
        }
        closeSettingsPopup();
    }
});

// ================= INIT =================
(async function () {
    try {
        const list = await populateQuizDropdown();

        if (!list.length) {
            document.getElementById('questionText').innerText = 'No quizzes found.';
            return;
        }

        quizSelector.value = list[0].sheet;

        questions = await loadQuestions(list[0].sheet);
        questionQueue = [...questions];

        if (document.getElementById('shuffleQuestions').checked) {
            shuffleArray(questionQueue);
        }

        resetModeState();
        updateHintsAvailability();
        showQuestion();
    } catch (err) {
        console.error(err);
        document.getElementById('questionText').innerText = 'Failed to load quiz.';
    }
})();

// ================= IMAGE ZOOM =================
document.getElementById('questionImage').onclick = function () {
    if (hintOverlayOpen) return;
    this.classList.toggle('zoomed');
};