// ================= CONFIG =================
const sheetId = '16bOgCaHG0Y450hwfl6tiHgAgTTxdxTVuMDhWLZbdD4E';

// ================= SETTINGS =================
let SPEED_DELAY = 500;

// ================= GLOBAL STATE =================
let questions = [];
let questionQueue = [];
let currentIndex = 0;
let questionIdCounter = 0;

// penalty mode state
let pendingPenaltyJump = false;
let pendingPenaltyCorrect = false;
let penaltyAnswerLocked = false;
let penaltyFinished = false;
let penaltySolvedIds = new Set();

// normal mode state
let normalFinished = false;

// answer lock state
let questionAnswered = false;

const quizSelector = document.getElementById('quizSelector');

// ================= MODE HELPERS =================
function isPenaltyMode() {
    return document.getElementById('penaltyMode').checked;
}

function isRetryMode() {
    return document.getElementById('retryWrong').checked;
}

function isSpeedMode() {
    return document.getElementById('speedMode').checked;
}

function isNormalMode() {
    return !isPenaltyMode() && !isRetryMode();
}

// ================= LOAD QUIZ LIST =================
async function loadQuizList() {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=Config`);
    const text = await res.text();
    const json = JSON.parse(text.match(/(?<=\().*(?=\);)/s)[0]);

    return json.table.rows.slice(1).map(r => ({
        sheet: r.c[0]?.v || '',
        name: r.c[1]?.v || ''
    })).filter(q => q.sheet && q.name);
}

// ================= DROPDOWN =================
async function populateQuizDropdown() {
    const list = await loadQuizList();
    quizSelector.innerHTML = '';

    list.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.sheet;
        opt.innerText = q.name;
        quizSelector.appendChild(opt);
    });

    return list;
}

// ================= LOAD QUESTIONS =================
async function loadQuestions(sheetName) {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${sheetName}`);
    const text = await res.text();
    const json = JSON.parse(text.match(/(?<=\().*(?=\);)/s)[0]);
    const rows = json.table.rows;

    const type = rows[0].c[1]?.v?.toString().toLowerCase() || '';

    if (type === 'hierarchy') {
        return rows.map(r => {
            const c = r.c || [];
            return {
                id: `q_${questionIdCounter++}`,
                question: c[0]?.v || '',
                type: 'hierarchy',
                options: [c[2]?.v, c[3]?.v, c[4]?.v, c[5]?.v, c[6]?.v, c[7]?.v, c[8]?.v, c[9]?.v, c[10]?.v, c[11]?.v].filter(Boolean),
                correctOrder: [c[12]?.v, c[13]?.v, c[14]?.v, c[15]?.v, c[16]?.v, c[17]?.v, c[18]?.v, c[19]?.v, c[20]?.v, c[21]?.v]
                    .map(n => n ? Number(n) : null)
                    .filter(n => n !== null),
                image: c[22]?.v || ''
            };
        }).filter(q => q.question && q.question.toLowerCase() !== 'question');
    }

    return rows.map(r => {
        const c = r.c || [];
        return {
            id: `q_${questionIdCounter++}`,
            question: c[0]?.v || '',
            type: 'multiple choice',
            options: [c[2]?.v, c[3]?.v, c[4]?.v, c[5]?.v].filter(Boolean),
            correct: c[6]?.v || '',
            explanations: [c[7]?.v, c[8]?.v, c[9]?.v, c[10]?.v],
            image: c[11]?.v || ''
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
    const fb = document.getElementById('feedback');
    fb.innerText = '';
    fb.classList.remove('correct', 'incorrect');
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
            fb.style.color = '';
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
    const fb = document.getElementById('feedback');
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
                fb.style.color = '';
            }
        } else {
            btn.style.display = 'none';
            btn.innerText = '';
            btn.onclick = null;
            exp.innerText = '';
            if (fb) {
                fb.innerText = '';
                fb.style.color = '';
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

        currentIndex = Math.max(-1, currentIndex - 1);
        return;
    }

    // normal mode: do not remove or move on answer click
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

        if (currentIndex >= questionQueue.length && questionQueue.length > 0) {
            currentIndex = questionQueue.length - 1;
        }

        if (questionQueue.length === 0) {
            currentIndex = 0;
        }

        return;
    }

    // normal mode: do not remove on answer click
}

// ================= ANSWER =================
function checkAnswer(selected, explanations) {
    if (isQuizFinished()) return;
    if (questionAnswered) return;
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
            if (btn.innerText === q.correct) {
                feedbackEl.innerText = '✔';
                feedbackEl.style.color = '#4caf50';
            } else if (btn.innerText === selected && !isCorrect) {
                feedbackEl.innerText = '✖';
                feedbackEl.style.color = '#ff6b6b';
            } else {
                feedbackEl.innerText = '';
                feedbackEl.style.color = '';
            }
        }
    });

    if (isCorrect) {
        setFeedback('Correct!', true);
        handleCorrectAnswer();
    } else {
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
        if (questionAnswered) return;
        if (isPenaltyMode() && penaltyAnswerLocked) return;

        questionAnswered = true;
        setHierarchyInteractionEnabled(false);

        const rows = [...container.children];
        let allCorrect = true;

        rows.forEach((r, i) => {
            const text = r.querySelector('.hierarchy-item').innerText;
            const fb = r.querySelector('.hierarchy-feedback');

            if (q.options.indexOf(text) === q.correctOrder[i] - 1) {
                fb.innerText = '✔';
                fb.style.color = '#4caf50';
            } else {
                fb.innerText = '✖';
                fb.style.color = '#ff6b6b';
                allCorrect = false;
            }
        });

        if (allCorrect) {
            setFeedback('Correct!', true);
            handleCorrectAnswer();
        } else {
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
    clearFeedback();
    clearExplanations();

    if (isQuizFinished()) {
        showQuestion();
        return;
    }

    if (isPenaltyMode()) {
        if (pendingPenaltyJump) {
            currentIndex = Math.max(0, currentIndex - 3);
            pendingPenaltyJump = false;
            pendingPenaltyCorrect = false;
            penaltyAnswerLocked = false;
            showQuestion();
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
            return;
        }

        if (currentIndex < questionQueue.length - 1) {
            currentIndex++;
        } else if (penaltySolvedIds.size === questionQueue.length) {
            penaltyFinished = true;
        }

        penaltyAnswerLocked = false;
        showQuestion();
        return;
    }

    if (isRetryMode()) {
        if (questionQueue.length === 0) {
            showQuestion();
            return;
        }

        if (currentIndex < questionQueue.length - 1) {
            currentIndex++;
        }

        showQuestion();
        return;
    }

    // normal mode
    if (currentIndex < questionQueue.length - 1) {
        currentIndex++;
    } else {
        normalFinished = true;
    }

    showQuestion();
}

function prevQuestion() {
    clearFeedback();
    clearExplanations();

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
        if (currentIndex > 0) {
            currentIndex--;
        }

        showQuestion();
        return;
    }

    // normal mode
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

    normalFinished = false;
    questionAnswered = false;
}

// ================= RESTART =================
function restartQuiz() {
    resetModeState();
    questionQueue = [...questions];

    if (document.getElementById('shuffleQuestions').checked) {
        shuffleArray(questionQueue);
    }

    showQuestion();
}

// ================= EVENTS =================
document.getElementById('nextBtn').onclick = nextQuestion;
document.getElementById('prevBtn').onclick = prevQuestion;
document.getElementById('restartBtn').onclick = restartQuiz;

document.getElementById('penaltyMode').onchange = e => {
    if (e.target.checked) {
        document.getElementById('retryWrong').checked = false;
    }
    restartQuiz();
};

document.getElementById('retryWrong').onchange = e => {
    if (e.target.checked) {
        document.getElementById('penaltyMode').checked = false;
    }
    restartQuiz();
};

// ================= QUIZ CHANGE =================
quizSelector.addEventListener('change', async e => {
    questions = await loadQuestions(e.target.value);
    questionQueue = [...questions];

    if (document.getElementById('shuffleQuestions').checked) {
        shuffleArray(questionQueue);
    }

    resetModeState();
    showQuestion();
});

// ================= INIT =================
(async function () {
    const list = await populateQuizDropdown();
    quizSelector.value = list[0].sheet;

    questions = await loadQuestions(list[0].sheet);
    questionQueue = [...questions];

    if (document.getElementById('shuffleQuestions').checked) {
        shuffleArray(questionQueue);
    }

    resetModeState();
    showQuestion();
})();

// ================= IMAGE ZOOM =================
document.getElementById('questionImage').onclick = function () {
    this.classList.toggle('zoomed');
};