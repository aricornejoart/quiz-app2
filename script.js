(() => {
    'use strict';

    /**
     * Central configuration and app state.
     * The quiz logic is intentionally preserved while the mutable globals are
     * grouped into predictable objects for easier maintenance.
     */
    const CONFIG = {
        sheetId: '16bOgCaHG0Y450hwfl6tiHgAgTTxdxTVuMDhWLZbdD4E',
        speedDelay: 300,
        classifyItemCount: 20,
        classifyClassCount: 20
    };

    const state = {
        questions: [],
        questionQueue: [],
        currentIndex: 0,
        questionIdCounter: 0,
        quizListCache: [],
        isAppFullscreen: false,

        pendingRetentionJump: false,
        pendingRetentionCorrect: false,
        retentionAnswerLocked: false,
        retentionFinished: false,
        retentionSolvedIds: new Set(),

        pendingMasteryAdvance: false,

        normalFinished: false,
        questionAnswered: false,

        pendingLearningResource: null,
        learningResourcesOverlayOpen: false,

        flashcardFlipped: false,
        flashcardFrontMode: 'term',

        flashcardImageZoomOpen: false,
        currentQuestionType: ''
    };

    const elements = {
        folderSelector: document.getElementById('folderSelector'),
        quizSelector: document.getElementById('quizSelector'),
        mixInput: document.getElementById('mixInput'),
        mixGoBtn: document.getElementById('mixGoBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        fullscreenBtn: document.getElementById('fullscreenBtn'),
        settingsPopup: document.getElementById('settingsPopup'),
        closeSettingsBtn: document.getElementById('closeSettingsBtn'),
        prevBtn: document.getElementById('prevBtn'),
        restartBtn: document.getElementById('restartBtn'),
        nextBtn: document.getElementById('nextBtn'),
        progressTextEl: document.getElementById('progressText'),
        progressSideFeedbackEl: document.getElementById('progressSideFeedback'),

        learningResourcesOverlay: document.getElementById('learningResourcesOverlay'),
        closeLearningResourcesBtn: document.getElementById('closeLearningResourcesBtn'),
        learningResourcesBody: document.getElementById('learningResourcesBody'),
        learningResourcesContent: document.getElementById('learningResourcesContent'),
        learningResourcesImageEl: document.getElementById('learningResourcesImage'),
        learningResourcesImagePanel: document.getElementById('learningResourcesImagePanel'),
        learningResourcesTextPanel: document.getElementById('learningResourcesTextPanel'),

        questionTextEl: document.getElementById('questionText'),
        questionImage: document.getElementById('questionImage'),
        imageContainer: document.querySelector('.image-container'),
        optionsContainer: document.querySelector('.options'),
        questionContainer: document.querySelector('.question-container'),

        flashcardFrontSetting: document.getElementById('flashcardFrontSetting'),
        termFrontBtn: document.getElementById('termFrontBtn'),
        definitionFrontBtn: document.getElementById('definitionFrontBtn'),

        flashcardImageOverlay: document.getElementById('flashcardImageOverlay'),
        closeFlashcardImageBtn: document.getElementById('closeFlashcardImageBtn'),
        flashcardImageViewport: document.getElementById('flashcardImageViewport'),
        flashcardZoomImage: document.getElementById('flashcardZoomImage'),

        settingHelpButtons: Array.from(document.querySelectorAll('.setting-help-btn'))
    };

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

function normalizeClassificationId(value) {
    return normalizeSheetText(value);
}

function parseClassifyItemValue(value) {
    const raw = normalizeSheetText(value);
    if (!raw) return null;

    if (raw.toLowerCase().startsWith('img:')) {
        const imageUrl = normalizeSheetText(raw.slice(4));
        if (!imageUrl) return null;
        return {
            kind: 'image',
            raw,
            imageUrl,
            text: '',
            dragLabel: 'Image item',
            ariaLabel: 'Classify image item'
        };
    }

    return {
        kind: 'text',
        raw,
        imageUrl: '',
        text: raw,
        dragLabel: raw,
        ariaLabel: `Classify item ${raw}`
    };
}

// ================= MODE HELPERS =================
function isRetentionMode() {
    return document.getElementById('retentionMode').checked;
}

function isRetryMode() {
    return document.getElementById('masteryMode').checked;
}

function isSpeedMode() {
    return document.getElementById('rapidMode').checked;
}

function isLearningResourcesMode() {
    return document.getElementById('learningResourcesMode').checked;
}

function isNormalMode() {
    return !isRetentionMode() && !isRetryMode();
}

function canUseLearningResources() {
    return isLearningResourcesMode() && !isSpeedMode() && (isRetentionMode() || isRetryMode());
}

function hasFlashcardsInDeck() {
    return state.questions.some(q => q.type === 'flashcard');
}

function updateLearningResourcesAvailability() {
    const learningResourcesCheckbox = document.getElementById('learningResourcesMode');
    const learningResourcesSetting = document.getElementById('learningResourcesModeSetting');
    const learningResourcesAllowed = isRetentionMode() || isRetryMode();

    learningResourcesCheckbox.disabled = !learningResourcesAllowed;

    if (learningResourcesSetting) {
        learningResourcesSetting.classList.toggle('disabled-setting', !learningResourcesAllowed);
    }

    if (!learningResourcesAllowed) {
        learningResourcesCheckbox.checked = false;
        clearPendingLearningResource();
    }
}

function updateShuffleAnswersAvailability() {
    const shuffleAnswersCheckbox = document.getElementById('shuffleAnswers');
    const shuffleAnswersSetting = document.getElementById('shuffleAnswersSetting');
    const supportsAnswerShuffle = state.questions.some(q =>
        q.type === 'multiple choice' || q.type === 'hierarchy' || q.type === 'classify'
    );

    shuffleAnswersCheckbox.disabled = !supportsAnswerShuffle;

    if (shuffleAnswersSetting) {
        shuffleAnswersSetting.classList.toggle('disabled-setting', !supportsAnswerShuffle);
    }

    if (!supportsAnswerShuffle) {
        shuffleAnswersCheckbox.checked = false;
    }
}

function updateFlashcardFrontSettingVisibility() {
    if (!elements.flashcardFrontSetting) return;
    elements.flashcardFrontSetting.classList.toggle('hidden', !hasFlashcardsInDeck());
}

function updateFlashcardFrontButtonsUI() {
    if (!elements.termFrontBtn || !elements.definitionFrontBtn) return;

    elements.termFrontBtn.classList.toggle('active', state.flashcardFrontMode === 'term');
    elements.definitionFrontBtn.classList.toggle('active', state.flashcardFrontMode === 'definition');
}

function updateSettingsAvailability() {
    updateLearningResourcesAvailability();
    updateShuffleAnswersAvailability();
    updateFlashcardFrontSettingVisibility();
    updateFlashcardFrontButtonsUI();
}

function syncBodyScrollLock() {
    document.body.style.overflow = (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) ? 'hidden' : '';
}

function isNarrowIPhoneViewport() {
    return window.matchMedia('(max-width: 440px), (max-height: 440px) and (orientation: landscape)').matches;
}

function updateViewportClasses() {
    document.body.classList.toggle('narrow-iphone-layout', isNarrowIPhoneViewport());
    document.body.classList.toggle('active-question-flashcard', state.currentQuestionType === 'flashcard');
    document.body.classList.toggle('active-question-classify', state.currentQuestionType === 'classify');
}

function applyResponsiveControlText() {
    const useCompactIcons = isNarrowIPhoneViewport();

    elements.prevBtn.innerText = useCompactIcons ? '←' : 'Previous';
    elements.restartBtn.innerText = useCompactIcons ? '↻' : 'Restart';
    elements.nextBtn.innerText = useCompactIcons ? '→' : 'Next';

    elements.prevBtn.setAttribute('aria-label', 'Previous');
    elements.restartBtn.setAttribute('aria-label', 'Restart');
    elements.nextBtn.setAttribute('aria-label', 'Next');

    elements.prevBtn.setAttribute('title', 'Previous');
    elements.restartBtn.setAttribute('title', 'Restart');
    elements.nextBtn.setAttribute('title', 'Next');
}

function clearFlashcardSwipeFeedback() {
    const feedback = document.getElementById('flashcardSwipeFeedback');
    if (!feedback) return;

    feedback.innerText = '';
    feedback.classList.remove('show', 'know', 'dont-know');
}

function setFlashcardSwipeFeedback(kind) {
    const feedback = document.getElementById('flashcardSwipeFeedback');
    if (!feedback) return;

    if (kind === 'know') {
        feedback.innerText = 'Know';
        feedback.classList.add('show', 'know');
        feedback.classList.remove('dont-know');
        return;
    }

    if (kind === 'dont-know') {
        feedback.innerText = "Didn't know";
        feedback.classList.add('show', 'dont-know');
        feedback.classList.remove('know');
        return;
    }

    clearFlashcardSwipeFeedback();
}

function handleViewportChange() {
    updateViewportClasses();
    applyResponsiveControlText();
    updateProgress();
}

// ================= SETTINGS / FULLSCREEN UI =================
function openSettingsPopup() {
    elements.settingsPopup.classList.remove('hidden');
    elements.settingsBtn.classList.add('active');
}

function closeSettingsPopup() {
    elements.settingsPopup.classList.add('hidden');
    elements.settingsBtn.classList.remove('active');
    closeAllSettingHelpTooltips();
}

function toggleSettingsPopup() {
    if (elements.settingsPopup.classList.contains('hidden')) {
        openSettingsPopup();
    } else {
        closeSettingsPopup();
    }
}

function closeAllSettingHelpTooltips() {
    elements.settingHelpButtons.forEach(btn => {
        const tooltipId = btn.dataset.helpTarget;
        const tooltip = tooltipId ? document.getElementById(tooltipId) : null;
        btn.setAttribute('aria-expanded', 'false');
        if (tooltip) {
            tooltip.classList.add('hidden');
        }
    });
}

function toggleSettingHelpTooltip(button) {
    if (!button) return;

    const tooltipId = button.dataset.helpTarget;
    const tooltip = tooltipId ? document.getElementById(tooltipId) : null;
    if (!tooltip) return;

    const willOpen = tooltip.classList.contains('hidden');
    closeAllSettingHelpTooltips();

    if (willOpen) {
        tooltip.classList.remove('hidden');
        button.setAttribute('aria-expanded', 'true');
    }
}

function enterFullscreenMode() {
    state.isAppFullscreen = true;
    document.body.classList.add('fullscreen-mode');
    elements.fullscreenBtn.classList.add('active');
    elements.fullscreenBtn.setAttribute('title', 'Exit Fullscreen');
    handleViewportChange();
}

function exitFullscreenMode() {
    state.isAppFullscreen = false;
    document.body.classList.remove('fullscreen-mode');
    elements.fullscreenBtn.classList.remove('active');
    elements.fullscreenBtn.setAttribute('title', 'Fullscreen');
    handleViewportChange();
}

function toggleFullscreenMode() {
    if (state.isAppFullscreen) {
        exitFullscreenMode();
    } else {
        enterFullscreenMode();
    }
}

// ================= LEARNING RESOURCES UI =================
function clearPendingLearningResource() {
    state.pendingLearningResource = null;
}

function queueLearningResourceIfEligible(question) {
    const text = normalizeSheetText(question?.learningResources);
    const imageUrl = normalizeSheetText(question?.learningResourcesImage);

    if (!canUseLearningResources() || (!text && !imageUrl)) {
        state.pendingLearningResource = null;
        return;
    }

    state.pendingLearningResource = {
        text,
        imageUrl
    };
}

function openLearningResourcesOverlay(hintData) {
    if (!hintData) return;

    const text = normalizeSheetText(hintData.text);
    const imageUrl = normalizeSheetText(hintData.imageUrl);
    const hasText = !!text;
    const hasImage = !!imageUrl;

    if (!hasText && !hasImage) return;

    elements.learningResourcesContent.innerText = text;
    elements.learningResourcesImageEl.src = '';
    elements.learningResourcesImageEl.alt = 'Learning resource image';
    elements.learningResourcesImagePanel.classList.add('hidden');

    elements.learningResourcesBody.classList.remove('text-only', 'image-only', 'text-image');

    if (hasImage) {
        elements.learningResourcesImageEl.src = imageUrl;
        elements.learningResourcesImagePanel.classList.remove('hidden');
    }

    if (hasText && hasImage) {
        elements.learningResourcesBody.classList.add('text-image');
        elements.learningResourcesTextPanel.classList.remove('hidden');
        elements.learningResourcesImagePanel.classList.remove('hidden');
    } else if (hasText) {
        elements.learningResourcesBody.classList.add('text-only');
        elements.learningResourcesTextPanel.classList.remove('hidden');
        elements.learningResourcesImagePanel.classList.add('hidden');
    } else {
        elements.learningResourcesBody.classList.add('image-only');
        elements.learningResourcesTextPanel.classList.add('hidden');
        elements.learningResourcesImagePanel.classList.remove('hidden');
    }

    elements.learningResourcesOverlay.classList.remove('hidden');
    elements.learningResourcesOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hint-open');
    state.learningResourcesOverlayOpen = true;
    syncBodyScrollLock();
}

function closeLearningResourcesOverlay() {
    elements.learningResourcesOverlay.classList.add('hidden');
    elements.learningResourcesOverlay.setAttribute('aria-hidden', 'true');
    elements.learningResourcesContent.innerText = '';
    elements.learningResourcesImageEl.src = '';
    elements.learningResourcesTextPanel.classList.remove('hidden');
    elements.learningResourcesImagePanel.classList.add('hidden');
    elements.learningResourcesBody.classList.remove('text-only', 'image-only', 'text-image');
    document.body.classList.remove('hint-open');
    state.learningResourcesOverlayOpen = false;
    clearPendingLearningResource();
    syncBodyScrollLock();
}

function showPendingLearningResourceIfAny() {
    if (!state.pendingLearningResource) return;
    openLearningResourcesOverlay(state.pendingLearningResource);
}

// ================= FLASHCARD IMAGE ZOOM UI =================
function openFlashcardImageOverlay(src, alt = 'Flashcard image') {
    if (!src || !elements.flashcardImageOverlay || !elements.flashcardZoomImage || state.learningResourcesOverlayOpen) return;

    elements.flashcardZoomImage.src = src;
    elements.flashcardZoomImage.alt = alt;

    if (elements.flashcardImageViewport) {
        elements.flashcardImageViewport.scrollTop = 0;
        elements.flashcardImageViewport.scrollLeft = 0;
    }

    elements.flashcardImageOverlay.classList.remove('hidden');
    elements.flashcardImageOverlay.setAttribute('aria-hidden', 'false');
    state.flashcardImageZoomOpen = true;
    syncBodyScrollLock();
}

function closeFlashcardImageOverlay() {
    if (!elements.flashcardImageOverlay || !elements.flashcardZoomImage) return;

    elements.flashcardImageOverlay.classList.add('hidden');
    elements.flashcardImageOverlay.setAttribute('aria-hidden', 'true');
    elements.flashcardZoomImage.src = '';
    elements.flashcardZoomImage.alt = 'Flashcard image';
    state.flashcardImageZoomOpen = false;
    syncBodyScrollLock();
}

// ================= MIX HELPERS =================
function setMixValidState(isValid) {
    elements.mixInput.classList.toggle('invalid', !isValid);
}

function normalizeMixInput(value) {
    return value.replace(/\s+/g, '');
}

function parseMixRange(rawValue) {
    const cleaned = normalizeMixInput(rawValue);

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

    state.quizListCache.forEach(q => {
        if (q.rangeNumber !== null && q.rangeNumber !== undefined && q.rangeNumber !== '') {
            map.set(Number(q.rangeNumber), q);
        }
    });

    return map;
}

async function loadMixedQuestionsFromInput(rawValue) {
    const parsed = parseMixRange(rawValue);
    if (!parsed.valid || parsed.numbers.length === 0) {
        throw new Error('Invalid mix input');
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
    state.questions = newQuestions;
    state.questionQueue = [...state.questions];

    if (document.getElementById('shuffleQuestions').checked) {
        shuffleArray(state.questionQueue);
    }

    resetModeState();
    updateSettingsAvailability();
    showQuestion();
}

function normalizeFolderName(value) {
    return normalizeSheetText(value) || 'Uncategorized';
}

function resetQuizSelector() {
    elements.quizSelector.innerHTML = '<option value="">Choose quiz</option>';
    elements.quizSelector.value = '';
    elements.quizSelector.disabled = true;
}

function renderSelectionPrompt(message = 'Choose a folder and a quiz.') {
    clearQuestionUI();
    state.currentQuestionType = '';
    updateViewportClasses();

    elements.questionTextEl.style.display = 'block';
    elements.questionTextEl.innerText = message;
    elements.optionsContainer.style.display = 'none';
    elements.imageContainer.style.display = '';
    elements.questionImage.style.display = 'none';
    elements.questionImage.src = '';

    clearFeedback();
    updateProgress();
}

function clearActiveQuizSelection(message = 'Choose a folder and a quiz.') {
    state.questions = [];
    state.questionQueue = [];
    resetModeState();
    updateSettingsAvailability();
    renderSelectionPrompt(message);
}

function getFolderNames() {
    const seen = new Set();
    const folders = [];

    state.quizListCache.forEach(q => {
        if (!seen.has(q.folder)) {
            seen.add(q.folder);
            folders.push(q.folder);
        }
    });

    return folders;
}

// ================= LOAD QUIZ LIST =================
async function loadQuizList() {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?sheet=Config`);
    const text = await res.text();
    const json = parseGoogleSheetResponse(text);

    return json.table.rows.map(r => ({
        sheet: getCellValue(r.c?.[0]),
        name: getCellValue(r.c?.[1]),
        rangeNumber: getCellValue(r.c?.[2]),
        folder: normalizeFolderName(getCellValue(r.c?.[3]))
    })).filter(q => q.sheet && q.name);
}

// ================= DROPDOWNS =================
async function populateFolderDropdown() {
    state.quizListCache = await loadQuizList();
    elements.folderSelector.innerHTML = '<option value="">Choose folder</option>';

    getFolderNames().forEach(folderName => {
        const opt = document.createElement('option');
        opt.value = folderName;
        opt.innerText = folderName;
        elements.folderSelector.appendChild(opt);
    });

    elements.folderSelector.value = '';
    resetQuizSelector();

    return state.quizListCache;
}

function populateQuizDropdown(folderName) {
    resetQuizSelector();

    if (!folderName) {
        return [];
    }

    const quizzesForFolder = state.quizListCache.filter(q => q.folder === folderName);

    quizzesForFolder.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.sheet;
        opt.innerText = q.name;
        elements.quizSelector.appendChild(opt);
    });

    elements.quizSelector.disabled = quizzesForFolder.length === 0;
    return quizzesForFolder;
}

async function loadSelectedQuiz(sheetName) {
    const loadedQuestions = await loadQuestions(sheetName);

    if (!loadedQuestions.length) {
        throw new Error('No state.questions found');
    }

    await applyLoadedQuestions(loadedQuestions);
}

// ================= LOAD QUESTIONS =================
async function loadQuestions(sheetName) {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}`);
    const text = await res.text();
    const json = parseGoogleSheetResponse(text);
    const rows = json.table.rows;

    const type = getCellValue(rows[0]?.c?.[1]).toLowerCase();

    if (type === 'hierarchy') {
        return rows.map(r => {
            const c = r.c || [];
            return {
                id: `q_${state.questionIdCounter++}`,
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
                learningResources: getCellValue(c[23]),
                learningResourcesImage: getCellValue(c[24])
            };
        }).filter(q => q.question && q.question.toLowerCase() !== 'question');
    }

    if (type === 'flashcard') {
        return rows.slice(1).map(r => {
            const c = r.c || [];
            return {
                id: `q_${state.questionIdCounter++}`,
                type: 'flashcard',
                termText: getCellValue(c[0]),
                definitionText: getCellValue(c[2]),
                termImage: getCellValue(c[3]),
                definitionImage: getCellValue(c[4]),
                learningResources: getCellValue(c[5]),
                learningResourcesImage: getCellValue(c[6])
            };
        }).filter(q => q.termText || q.definitionText || q.termImage || q.definitionImage);
    }

    if (type === 'classify') {
        return rows.map(r => {
            const c = r.c || [];
            const classLabelsStartCol = 2 + (CONFIG.classifyItemCount * 2);
            const classIdsStartCol = classLabelsStartCol + CONFIG.classifyClassCount;
            const imageCol = classIdsStartCol + CONFIG.classifyClassCount;
            const learningResourceCol = imageCol + 1;
            const learningResourceImageCol = imageCol + 2;

            const items = Array.from({ length: CONFIG.classifyItemCount }, (_, i) => {
                const itemCol = 2 + (i * 2);
                const itemClassIdCol = itemCol + 1;
                const parsedItem = parseClassifyItemValue(getCellValue(c[itemCol]));
                if (!parsedItem) return null;

                return {
                    ...parsedItem,
                    correctClassificationId: normalizeClassificationId(getCellValue(c[itemClassIdCol]))
                };
            }).filter(Boolean);

            const classifications = Array.from({ length: CONFIG.classifyClassCount }, (_, i) => ({
                label: getCellValue(c[classLabelsStartCol + i]),
                id: normalizeClassificationId(getCellValue(c[classIdsStartCol + i]))
            })).filter(classification => classification.label && classification.id);

            return {
                id: `q_${state.questionIdCounter++}`,
                question: getCellValue(c[0]),
                type: 'classify',
                items,
                classifications,
                image: getCellValue(c[imageCol]),
                learningResources: getCellValue(c[learningResourceCol]),
                learningResourcesImage: getCellValue(c[learningResourceImageCol])
            };
        }).filter(q =>
            q.question &&
            q.question.toLowerCase() !== 'question' &&
            q.items.length > 0 &&
            q.classifications.length > 0
        );
    }

    return rows.map(r => {
        const c = r.c || [];
        return {
            id: `q_${state.questionIdCounter++}`,
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
            learningResources: getCellValue(c[12]),
            learningResourcesImage: getCellValue(c[13])
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

function setFlashcardInteractionEnabled(enabled) {
    const card = document.getElementById('flashcardCard');
    if (card) {
        card.classList.toggle('disabled', !enabled);
    }

    document.querySelectorAll('.flashcard-grade-btn').forEach(btn => {
        btn.disabled = !enabled;
        btn.style.pointerEvents = enabled ? 'auto' : 'none';
        btn.style.opacity = enabled ? '1' : '0.7';
    });
}

function setClassifyInteractionEnabled(enabled) {
    const submit = document.getElementById('classifySubmit');
    if (submit) {
        submit.disabled = !enabled;
        submit.style.pointerEvents = enabled ? 'auto' : 'none';
        submit.style.opacity = enabled ? '1' : '0.65';
    }

    document.querySelectorAll('.classify-item').forEach(btn => {
        btn.disabled = !enabled;
        btn.style.pointerEvents = enabled ? 'auto' : 'none';
        btn.style.opacity = enabled ? '1' : '0.85';
    });

    document.querySelectorAll('.classify-drop-target').forEach(target => {
        target.classList.toggle('disabled', !enabled);
    });
}

// ================= UI RESET HELPERS =================
function clearFeedback() {
    const fb = elements.progressSideFeedbackEl;
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

function clearOptionButtonStateClasses() {
    document.querySelectorAll('.optionBtn').forEach(btn => {
        btn.classList.remove('option-correct', 'option-incorrect');
    });
}

function removeHierarchyUI() {
    const oldHierarchy = document.getElementById('hierarchyContainer');
    if (oldHierarchy) oldHierarchy.remove();

    const oldSubmit = document.getElementById('hierarchySubmit');
    if (oldSubmit) oldSubmit.remove();
}

function removeClassifyUI() {
    const oldClassify = document.getElementById('classifyContainer');
    if (oldClassify) oldClassify.remove();

    const oldSubmit = document.getElementById('classifySubmit');
    if (oldSubmit) oldSubmit.remove();
}

function removeFlashcardUI() {
    const oldContainer = document.getElementById('flashcardContainer');
    if (oldContainer) oldContainer.remove();

    const oldGradeRow = document.getElementById('flashcardGradeRow');
    if (oldGradeRow) oldGradeRow.remove();

}

function clearQuestionUI() {
    clearFeedback();
    clearExplanations();
    clearOptionFeedback();
    clearOptionButtonStateClasses();
    clearFlashcardSwipeFeedback();
    removeHierarchyUI();
    removeClassifyUI();
    removeFlashcardUI();
    elements.questionImage.classList.remove('zoomed');
}

// ================= FEEDBACK HELPER =================
function setFeedback(text, isCorrect) {
    const fb = elements.progressSideFeedbackEl;
    if (!fb) return;

    fb.innerText = text;
    fb.classList.remove('correct', 'incorrect');
    fb.classList.add(isCorrect ? 'correct' : 'incorrect');
}

function applyQuestionOutcome(q, isCorrect, options = {}) {
    const { useSideFeedback = true } = options;

    if (isCorrect) {
        clearPendingLearningResource();
        if (useSideFeedback) {
            setFeedback('Correct!', true);
        } else {
            clearFeedback();
        }
        handleCorrectAnswer();
    } else {
        queueLearningResourceIfEligible(q);
        if (useSideFeedback) {
            setFeedback('Incorrect!', false);
        } else {
            clearFeedback();
        }
        handleWrongAnswer();
    }

    if (isRetryMode()) {
        updateProgress();
    }
}

// ================= PROGRESS =================
function updateProgress() {
    const total = state.questions.length;
    let remaining = 0;

    if (isRetentionMode()) {
        remaining = state.retentionFinished ? 0 : (state.questionQueue.length - state.currentIndex);
    } else if (isRetryMode()) {
        remaining = state.questionQueue.length;
    } else {
        remaining = state.normalFinished ? 0 : (state.questionQueue.length - state.currentIndex);
    }

    if (remaining < 0) remaining = 0;
    if (remaining > total) remaining = total;

    const completed = total - remaining;
    const percent = total > 0 ? (completed / total) * 100 : 0;

    elements.progressTextEl.innerText = isNarrowIPhoneViewport() ? `${remaining}` : `${remaining} remaining`;
    document.getElementById('progressFill').style.width = `${percent}%`;
}

// ================= FINISH CHECK =================
function isQuizFinished() {
    if (isRetentionMode()) return state.retentionFinished;
    if (isRetryMode()) return state.questionQueue.length === 0;
    return state.normalFinished;
}

// ================= SHOW QUESTION =================
function showQuestion() {
    if (!state.questions.length) {
        renderSelectionPrompt();
        return;
    }

    clearQuestionUI();
    state.questionAnswered = false;
    state.flashcardFlipped = false;

    if (isRetentionMode()) {
        state.retentionAnswerLocked = false;
    }

    if (isQuizFinished()) {
        elements.questionTextEl.style.display = 'block';
        elements.questionTextEl.innerText = 'Quiz Finished!';
        elements.optionsContainer.style.display = 'none';
        elements.imageContainer.style.display = '';
        elements.questionImage.style.display = 'none';
        elements.questionImage.src = '';
        state.currentQuestionType = '';
        updateViewportClasses();
        updateProgress();
        return;
    }

    if (state.currentIndex < 0) state.currentIndex = 0;
    if (state.currentIndex >= state.questionQueue.length) state.currentIndex = state.questionQueue.length - 1;

    const q = state.questionQueue[state.currentIndex];
    state.currentQuestionType = q.type || '';
    updateViewportClasses();
    elements.optionsContainer.style.display = 'none';

    if (q.type === 'flashcard') {
        elements.questionTextEl.innerText = '';
        elements.questionTextEl.style.display = 'none';
        elements.imageContainer.style.display = 'none';
        elements.questionImage.style.display = 'none';
        elements.questionImage.src = '';
        showFlashcard(q);
        updateProgress();
        return;
    }

    elements.questionTextEl.style.display = 'block';
    elements.questionTextEl.innerText = q.question;
    elements.imageContainer.style.display = '';
    elements.questionImage.style.display = q.image ? 'block' : 'none';
    elements.questionImage.src = q.image || '';

    if (q.type === 'multiple choice') {
        showMC(q);
    } else if (q.type === 'hierarchy') {
        showHierarchy(q);
    } else if (q.type === 'classify') {
        showClassify(q);
    }

    updateProgress();
}

// ================= MULTIPLE CHOICE =================
function showMC(q) {
    const container = elements.optionsContainer;
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
            btn.classList.remove('option-correct', 'option-incorrect');
            btn.onclick = () => checkAnswer(options[i], explanations);
            exp.innerText = '';
            if (fb) {
                fb.innerText = '';
                fb.classList.remove('correct-mark', 'incorrect-mark');
            }
        } else {
            btn.style.display = 'none';
            btn.innerText = '';
            btn.classList.remove('option-correct', 'option-incorrect');
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
    const q = state.questionQueue[state.currentIndex];

    if (isRetentionMode()) {
        state.retentionSolvedIds.delete(q.id);
        state.pendingRetentionJump = true;
        state.pendingRetentionCorrect = false;
        state.retentionAnswerLocked = true;
        return;
    }

    if (isRetryMode()) {
        const wrongQuestion = q;

        state.questionQueue.splice(state.currentIndex, 1);

        let insertIndex = state.currentIndex + 3;
        if (insertIndex > state.questionQueue.length) {
            insertIndex = state.questionQueue.length;
        }

        state.questionQueue.splice(insertIndex, 0, wrongQuestion);
        state.pendingMasteryAdvance = true;
        return;
    }
}

// ================= CORRECT ANSWER LOGIC =================
function handleCorrectAnswer() {
    const q = state.questionQueue[state.currentIndex];

    if (isRetentionMode()) {
        state.retentionSolvedIds.add(q.id);
        state.pendingRetentionCorrect = true;
        state.pendingRetentionJump = false;
        state.retentionAnswerLocked = true;
        return;
    }

    if (isRetryMode()) {
        state.questionQueue.splice(state.currentIndex, 1);

        if (state.questionQueue.length === 0) {
            state.currentIndex = 0;
        }

        state.pendingMasteryAdvance = true;
        return;
    }
}

// ================= ANSWER =================
function checkAnswer(selected, explanations) {
    if (isQuizFinished()) return;
    if (state.questionAnswered) return;
    if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return;
    if (isRetentionMode() && state.retentionAnswerLocked) return;

    state.questionAnswered = true;
    setOptionButtonsEnabled(false);

    const q = state.questionQueue[state.currentIndex];
    const isCorrect = selected === q.correct;

    document.querySelectorAll('.optionBtn').forEach((btn, i) => {
        const feedbackEl = document.getElementById(`optionFeedback${i + 1}`);
        btn.classList.remove('option-correct', 'option-incorrect');

        if (explanations[i]) {
            document.getElementById(`explanation${i + 1}`).innerText = explanations[i];
        }

        if (btn.innerText === q.correct) {
            btn.classList.add('option-correct');
        } else if (btn.innerText === selected && !isCorrect) {
            btn.classList.add('option-incorrect');
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

    applyQuestionOutcome(q, isCorrect);

    if (isSpeedMode()) {
        setTimeout(nextQuestion, CONFIG.speedDelay);
    }
}

// ================= FLASHCARDS =================
function getFlashcardSideData(q, side) {
    if (side === 'definition') {
        return {
            sideName: 'Definition',
            text: normalizeSheetText(q.definitionText),
            imageUrl: normalizeSheetText(q.definitionImage)
        };
    }

    return {
        sideName: 'Term',
        text: normalizeSheetText(q.termText),
        imageUrl: normalizeSheetText(q.termImage)
    };
}

function toggleFlashcardFlip() {
    if (state.learningResourcesOverlayOpen) return;
    if (state.flashcardImageZoomOpen) return;
    if (state.questionAnswered) return;

    state.flashcardFlipped = !state.flashcardFlipped;

    const card = document.getElementById('flashcardCard');
    if (card) {
        card.classList.toggle('is-flipped', state.flashcardFlipped);
    }
}

function buildFlashcardFace(sideData, faceClass) {
    const face = document.createElement('div');
    face.className = `flashcard-face ${faceClass}`;

    const content = document.createElement('div');
    content.className = 'flashcard-side-content';

    const hasText = !!sideData.text;
    const hasImage = !!sideData.imageUrl;

    if (hasText && hasImage) {
        content.classList.add('split');
    } else if (hasText) {
        content.classList.add('text-only');
    } else if (hasImage) {
        content.classList.add('image-only');
    } else {
        content.classList.add('text-only');
    }

    if (hasText) {
        const text = document.createElement('div');
        text.className = 'flashcard-side-text';
        text.innerText = sideData.text;
        content.appendChild(text);
    }

    if (hasImage) {
        const imageWrap = document.createElement('div');
        imageWrap.className = 'flashcard-side-image-wrap';

        const img = document.createElement('img');
        img.className = 'flashcard-side-image';
        img.src = sideData.imageUrl;
        img.alt = `${sideData.sideName} image`;

        const zoomBtn = document.createElement('button');
        zoomBtn.type = 'button';
        zoomBtn.className = 'flashcard-image-zoom-btn';
        zoomBtn.setAttribute('aria-label', 'Zoom image');
        zoomBtn.setAttribute('title', 'Zoom image');
        zoomBtn.innerText = '⤢';

        zoomBtn.addEventListener('pointerdown', e => {
            e.stopPropagation();
        });

        zoomBtn.addEventListener('pointerup', e => {
            e.stopPropagation();
        });

        zoomBtn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            openFlashcardImageOverlay(sideData.imageUrl, `${sideData.sideName} image`);
        });

        imageWrap.appendChild(img);
        imageWrap.appendChild(zoomBtn);
        content.appendChild(imageWrap);
    }

    if (!hasText && !hasImage) {
        const empty = document.createElement('div');
        empty.className = 'flashcard-placeholder';
        empty.innerText = 'No content on this side.';
        content.appendChild(empty);
    }

    face.appendChild(content);
    return face;
}

function enableFlashcardGesture(card, onKnow, onDontKnow) {
    let tracking = false;
    let startX = 0;
    let startY = 0;
    let activePointerId = null;

    function clearSwipeBorderState() {
        card.classList.remove('swiping-know', 'swiping-dont-know');
    }

    function setSwipeBorderState(kind) {
        clearSwipeBorderState();
        if (kind === 'know') {
            card.classList.add('swiping-know');
        } else if (kind === 'dont-know') {
            card.classList.add('swiping-dont-know');
        }
    }

    function resetCardPosition() {
        card.style.transition = 'transform 0.18s ease';
        card.style.transform = '';
        clearSwipeBorderState();
    }

    function endTracking() {
        tracking = false;
        activePointerId = null;
    }

    function finishInteraction(e, cancelled = false) {
        if (!tracking) return;
        if (activePointerId !== null && e.pointerId !== activePointerId) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const isTap = Math.abs(dx) < 10 && Math.abs(dy) < 10;
        const isSwipe = Math.abs(dx) >= 70 && Math.abs(dx) > Math.abs(dy) * 1.2;

        try {
            if (card.hasPointerCapture(e.pointerId)) {
                card.releasePointerCapture(e.pointerId);
            }
        } catch (err) {
            // ignore pointer capture release failures
        }

        endTracking();
        resetCardPosition();

        if (cancelled || state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen || state.questionAnswered) {
            clearFlashcardSwipeFeedback();
            clearSwipeBorderState();
            return;
        }

        if (isSwipe) {
            setSwipeBorderState(dx > 0 ? 'know' : 'dont-know');
            setFlashcardSwipeFeedback(dx > 0 ? 'know' : 'dont-know');
            setTimeout(() => {
                if (dx > 0) {
                    onKnow();
                } else {
                    onDontKnow();
                }
            }, 90);
            return;
        }

        clearFlashcardSwipeFeedback();

        if (isTap) {
            toggleFlashcardFlip();
        }
    }

    card.addEventListener('pointerdown', e => {
        if (state.learningResourcesOverlayOpen) return;
        if (state.flashcardImageZoomOpen) return;
        if (state.questionAnswered) return;
        if (e.button !== undefined && e.button !== 0) return;

        tracking = true;
        startX = e.clientX;
        startY = e.clientY;
        activePointerId = e.pointerId;
        card.style.transition = 'none';
        clearFlashcardSwipeFeedback();
        clearSwipeBorderState();

        try {
            card.setPointerCapture(e.pointerId);
        } catch (err) {
            // ignore pointer capture failures
        }
    });

    card.addEventListener('pointermove', e => {
        if (!tracking) return;
        if (activePointerId !== null && e.pointerId !== activePointerId) return;
        if (state.questionAnswered) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (Math.abs(dx) > Math.abs(dy)) {
            e.preventDefault();
        }

        const limitedDx = Math.max(-52, Math.min(52, dx * 0.24));
        card.style.transform = `translateX(${limitedDx}px)`;

        if (Math.abs(dx) >= 18 && Math.abs(dx) > Math.abs(dy)) {
            const swipeKind = dx > 0 ? 'know' : 'dont-know';
            setSwipeBorderState(swipeKind);
            setFlashcardSwipeFeedback(swipeKind);
        } else {
            clearSwipeBorderState();
            clearFlashcardSwipeFeedback();
        }
    }, { passive: false });

    card.addEventListener('pointerup', e => finishInteraction(e));
    card.addEventListener('pointercancel', e => finishInteraction(e, true));
}

function gradeFlashcard(knewIt) {
    if (isQuizFinished()) return;
    if (state.questionAnswered) return;
    if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return;
    if (isRetentionMode() && state.retentionAnswerLocked) return;

    const q = state.questionQueue[state.currentIndex];
    state.questionAnswered = true;
    setFlashcardInteractionEnabled(false);
    applyQuestionOutcome(q, knewIt);
    nextQuestion();
}

function showFlashcard(q) {
    const frontSide = state.flashcardFrontMode === 'term'
        ? getFlashcardSideData(q, 'term')
        : getFlashcardSideData(q, 'definition');

    const backSide = state.flashcardFrontMode === 'term'
        ? getFlashcardSideData(q, 'definition')
        : getFlashcardSideData(q, 'term');

    const container = document.createElement('div');
    container.id = 'flashcardContainer';
    container.className = 'flashcard-container';

    const card = document.createElement('div');
    card.id = 'flashcardCard';
    card.className = 'flashcard-card';
    if (state.flashcardFlipped) {
        card.classList.add('is-flipped');
    }

    const cardInner = document.createElement('div');
    cardInner.className = 'flashcard-card-inner';

    cardInner.appendChild(buildFlashcardFace(frontSide, 'front'));
    cardInner.appendChild(buildFlashcardFace(backSide, 'back'));
    card.appendChild(cardInner);
    container.appendChild(card);


    const swipeFeedback = document.createElement('div');
    swipeFeedback.id = 'flashcardSwipeFeedback';
    swipeFeedback.className = 'flashcard-swipe-feedback';
    container.appendChild(swipeFeedback);

    const gradeRow = document.createElement('div');
    gradeRow.id = 'flashcardGradeRow';
    gradeRow.className = 'flashcard-grade-row';

    const didntKnowBtn = document.createElement('button');
    didntKnowBtn.type = 'button';
    didntKnowBtn.className = 'flashcard-grade-btn wrong flashcard-side-btn left';
    didntKnowBtn.innerText = '✖';
    didntKnowBtn.onclick = () => gradeFlashcard(false);

    const knowBtn = document.createElement('button');
    knowBtn.type = 'button';
    knowBtn.className = 'flashcard-grade-btn correct flashcard-side-btn right';
    knowBtn.innerText = '✔';
    knowBtn.onclick = () => gradeFlashcard(true);

    gradeRow.appendChild(didntKnowBtn);
    gradeRow.appendChild(knowBtn);
    container.appendChild(gradeRow);

    elements.questionContainer.appendChild(container);

    enableFlashcardGesture(card, () => gradeFlashcard(true), () => gradeFlashcard(false));
    setFlashcardInteractionEnabled(true);
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
            if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return;
            if (item.dataset.dragDisabled === 'true') return;
            if (state.questionAnswered) return;
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
            if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return;
            if (state.questionAnswered) return;

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
            if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return;
            if (state.questionAnswered) return;

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

    elements.questionContainer.appendChild(container);

    const submit = document.createElement('button');
    submit.id = 'hierarchySubmit';
    submit.innerText = 'Submit';

    submit.onclick = () => {
        if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return;
        if (state.questionAnswered) return;
        if (isRetentionMode() && state.retentionAnswerLocked) return;

        state.questionAnswered = true;
        setHierarchyInteractionEnabled(false);

        const rows = [...container.children];
        let allCorrect = true;

        rows.forEach((r, i) => {
            const itemEl = r.querySelector('.hierarchy-item');
            const text = itemEl.innerText;
            const fb = r.querySelector('.hierarchy-feedback');

            itemEl.classList.remove('option-correct', 'option-incorrect');
            fb.classList.remove('correct-mark', 'incorrect-mark');

            if (q.options.indexOf(text) === q.correctOrder[i] - 1) {
                itemEl.classList.add('option-correct');
                fb.innerText = '✔';
                fb.classList.add('correct-mark');
            } else {
                itemEl.classList.add('option-incorrect');
                fb.innerText = '✖';
                fb.classList.add('incorrect-mark');
                allCorrect = false;
            }
        });

        applyQuestionOutcome(q, allCorrect);

        if (isSpeedMode()) {
            setTimeout(nextQuestion, CONFIG.speedDelay);
        }
    };

    elements.questionContainer.appendChild(submit);

    enableHierarchyDrag(container);
    setHierarchyInteractionEnabled(true);
}


// ================= CLASSIFY =================
function showClassify(q) {
    const container = document.createElement('div');
    container.id = 'classifyContainer';
    container.className = 'classify-container';

    const layout = document.createElement('div');
    layout.className = 'classify-layout';
    container.appendChild(layout);

    const bank = document.createElement('div');
    bank.className = 'classify-column classify-bank-column classify-drop-target';
    bank.dataset.classificationId = '';
    bank.setAttribute('role', 'button');
    bank.setAttribute('tabindex', '0');
    layout.appendChild(bank);

    const bankItems = document.createElement('div');
    bankItems.className = 'classify-bank-items';
    bank.appendChild(bankItems);

    const classesColumn = document.createElement('div');
    classesColumn.className = 'classify-column classify-classes-column';
    layout.appendChild(classesColumn);

    const categoryGrid = document.createElement('div');
    categoryGrid.className = 'classify-category-grid';
    classesColumn.appendChild(categoryGrid);

    const submit = document.createElement('button');
    submit.id = 'classifySubmit';
    submit.type = 'button';
    submit.innerText = 'Submit';

    const items = q.items.map((item, index) => ({
        ...item,
        runtimeKey: `classify_item_${index}`,
        dragLabel: item.dragLabel || item.text || 'Item',
        ariaLabel: item.ariaLabel || (item.text ? `Classify item ${item.text}` : 'Classify item')
    }));

    if (document.getElementById('shuffleAnswers').checked) {
        shuffleArray(items);
    }

    const placements = new Map();
    let selectedItemKey = null;
    let suppressClickRuntimeKey = null;
    let dragState = null;

    function preserveWindowScroll(fn) {
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        fn();
        window.scrollTo(scrollX, scrollY);
    }

    function getClassifyScrollState() {
        return {
            bankScrollTop: bank.scrollTop,
            bankScrollLeft: bank.scrollLeft,
            classesScrollTop: classesColumn.scrollTop,
            classesScrollLeft: classesColumn.scrollLeft
        };
    }

    function restoreClassifyScrollState(scrollState) {
        if (!scrollState) return;

        const applyScrollState = () => {
            bank.scrollTop = scrollState.bankScrollTop;
            bank.scrollLeft = scrollState.bankScrollLeft;
            classesColumn.scrollTop = scrollState.classesScrollTop;
            classesColumn.scrollLeft = scrollState.classesScrollLeft;
        };

        applyScrollState();
        requestAnimationFrame(applyScrollState);
    }

    function renderClassifyStatePreservingScroll() {
        const scrollState = getClassifyScrollState();
        renderClassifyState();
        restoreClassifyScrollState(scrollState);
    }

    function getDropTargetFromPoint(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        const target = el ? el.closest('.classify-drop-target') : null;
        if (!target || target.classList.contains('disabled')) return null;
        return target;
    }

    function clearDropHover() {
        container.querySelectorAll('.classify-drop-target.drag-hover').forEach(target => {
            target.classList.remove('drag-hover');
        });
    }

    function updateDropHover(target) {
        clearDropHover();
        if (target) {
            target.classList.add('drag-hover');
        }
    }

    function cleanupDragState() {
        if (!dragState) return;

        window.removeEventListener('pointermove', onDragPointerMove);
        window.removeEventListener('pointerup', onDragPointerUp);
        window.removeEventListener('pointercancel', onDragPointerUp);

        if (dragState.ghost && dragState.ghost.parentNode) {
            dragState.ghost.parentNode.removeChild(dragState.ghost);
        }

        if (dragState.sourceEl) {
            dragState.sourceEl.classList.remove('drag-source');
        }

        document.body.classList.remove('classify-dragging');
        clearDropHover();
        dragState = null;
    }

    function startDragVisual() {
        if (!dragState || dragState.dragging) return;

        dragState.dragging = true;
        document.body.classList.add('classify-dragging');

        const ghost = document.createElement('div');
        ghost.className = 'classify-drag-ghost';
        ghost.innerText = dragState.itemText;

        const rect = dragState.sourceRect;
        ghost.style.width = `${Math.max(rect.width, 140)}px`;
        ghost.style.left = `${dragState.lastClientX - dragState.offsetX}px`;
        ghost.style.top = `${dragState.lastClientY - dragState.offsetY}px`;

        document.body.appendChild(ghost);
        dragState.ghost = ghost;

        if (dragState.sourceEl) {
            dragState.sourceEl.classList.add('drag-source');
        }
    }

    function moveSelectedItemTo(classificationId) {
        if (state.questionAnswered) return;
        if (!selectedItemKey) return;

        placements.set(selectedItemKey, normalizeClassificationId(classificationId));
        selectedItemKey = null;
        preserveWindowScroll(() => renderClassifyStatePreservingScroll());
    }

    function handleDroppedItem(runtimeKey, classificationId) {
        placements.set(runtimeKey, normalizeClassificationId(classificationId));
        selectedItemKey = null;
        preserveWindowScroll(() => renderClassifyStatePreservingScroll());
    }

    function createItemButton(item) {
        const btn = document.createElement('div');
        btn.className = 'classify-item';
        btn.dataset.runtimeKey = item.runtimeKey;
        btn.setAttribute('role', 'button');
        btn.setAttribute('tabindex', state.questionAnswered ? '-1' : '0');
        btn.setAttribute('aria-label', item.ariaLabel || 'Classify item');

        const content = document.createElement('div');
        content.className = 'classify-item-content';

        if (item.kind === 'image' && item.imageUrl) {
            btn.classList.add('is-image-item');

            const img = document.createElement('img');
            img.className = 'classify-item-image';
            img.src = item.imageUrl;
            img.alt = item.text || 'Classify image item';
            img.draggable = false;
            content.appendChild(img);

            const zoomBtn = document.createElement('button');
            zoomBtn.type = 'button';
            zoomBtn.className = 'classify-item-zoom-btn';
            zoomBtn.setAttribute('aria-label', 'Zoom item image');
            zoomBtn.setAttribute('title', 'Zoom image');
            zoomBtn.innerText = '⤢';

            const stopZoomTrigger = e => {
                e.preventDefault();
                e.stopPropagation();
            };

            zoomBtn.addEventListener('pointerdown', stopZoomTrigger);
            zoomBtn.addEventListener('click', e => {
                stopZoomTrigger(e);
                openFlashcardImageOverlay(item.imageUrl, item.text || 'Classify image item');
            });

            btn.appendChild(zoomBtn);
        } else {
            const textSpan = document.createElement('div');
            textSpan.className = 'classify-item-text';
            textSpan.innerText = item.text;
            content.appendChild(textSpan);
        }

        btn.appendChild(content);

        if (selectedItemKey === item.runtimeKey) {
            btn.classList.add('selected');
        }

        if (state.questionAnswered) {
            const placedId = normalizeClassificationId(placements.get(item.runtimeKey));
            const correctId = normalizeClassificationId(item.correctClassificationId);

            if (placedId && placedId === correctId) {
                btn.classList.add('option-correct');
            } else {
                btn.classList.add('option-incorrect');
            }
        }

        btn.addEventListener('pointerdown', e => {
            if (state.questionAnswered) return;
            if (e.button !== undefined && e.button !== 0 && e.pointerType !== 'touch' && e.pointerType !== 'pen') return;

            cleanupDragState();

            const rect = btn.getBoundingClientRect();
            dragState = {
                pointerId: e.pointerId,
                runtimeKey: item.runtimeKey,
                itemText: item.dragLabel || item.text || 'Item',
                sourceEl: btn,
                sourceRect: rect,
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
                startX: e.clientX,
                startY: e.clientY,
                lastClientX: e.clientX,
                lastClientY: e.clientY,
                dragging: false,
                ghost: null
            };

            window.addEventListener('pointermove', onDragPointerMove, { passive: false });
            window.addEventListener('pointerup', onDragPointerUp);
            window.addEventListener('pointercancel', onDragPointerUp);
        });

        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            btn.blur();

            if (state.questionAnswered) return;
            if (suppressClickRuntimeKey === item.runtimeKey) {
                suppressClickRuntimeKey = null;
                return;
            }

            selectedItemKey = selectedItemKey === item.runtimeKey ? null : item.runtimeKey;
            preserveWindowScroll(() => renderClassifyStatePreservingScroll());
        });

        btn.addEventListener('keydown', e => {
            if (state.questionAnswered) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                btn.click();
            }
        });

        return btn;
    }

    function renderClassifyState() {
        categoryGrid.innerHTML = '';
        bankItems.innerHTML = '';

        const activeClassificationId = selectedItemKey
            ? normalizeClassificationId(placements.get(selectedItemKey))
            : null;

        q.classifications.forEach(classification => {
            const box = document.createElement('div');
            box.className = 'classify-category classify-drop-target';
            box.dataset.classificationId = classification.id;
            box.setAttribute('role', 'button');
            box.setAttribute('tabindex', '0');

            if (!state.questionAnswered && selectedItemKey) {
                box.classList.add('is-ready');
                if (activeClassificationId === classification.id) {
                    box.classList.add('is-active');
                }
            }

            const header = document.createElement('div');
            header.className = 'classify-category-header';
            header.innerText = classification.label;

            const itemWrap = document.createElement('div');
            itemWrap.className = 'classify-category-items';

            items
                .filter(item => normalizeClassificationId(placements.get(item.runtimeKey)) === classification.id)
                .forEach(item => {
                    itemWrap.appendChild(createItemButton(item));
                });

            box.addEventListener('click', () => moveSelectedItemTo(classification.id));
            box.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    moveSelectedItemTo(classification.id);
                }
            });

            box.appendChild(header);
            box.appendChild(itemWrap);
            categoryGrid.appendChild(box);
        });

        items
            .filter(item => !normalizeClassificationId(placements.get(item.runtimeKey)))
            .forEach(item => {
                bankItems.appendChild(createItemButton(item));
            });

        bank.classList.toggle('is-active', !state.questionAnswered && !!selectedItemKey && !activeClassificationId);
        bank.classList.toggle('is-ready', !state.questionAnswered && !!selectedItemKey);
    }

    function onDragPointerMove(e) {
        if (!dragState || e.pointerId !== dragState.pointerId || state.questionAnswered) return;

        dragState.lastClientX = e.clientX;
        dragState.lastClientY = e.clientY;

        const moveX = e.clientX - dragState.startX;
        const moveY = e.clientY - dragState.startY;
        const movedEnough = Math.abs(moveX) > 6 || Math.abs(moveY) > 6;

        if (!dragState.dragging && !movedEnough) {
            return;
        }

        if (!dragState.dragging) {
            startDragVisual();
            suppressClickRuntimeKey = dragState.runtimeKey;
        }

        e.preventDefault();

        if (dragState.ghost) {
            dragState.ghost.style.left = `${e.clientX - dragState.offsetX}px`;
            dragState.ghost.style.top = `${e.clientY - dragState.offsetY}px`;
        }

        updateDropHover(getDropTargetFromPoint(e.clientX, e.clientY));
    }

    function onDragPointerUp(e) {
        if (!dragState || e.pointerId !== dragState.pointerId) return;

        const finishedDrag = dragState.dragging;
        const runtimeKey = dragState.runtimeKey;
        const target = finishedDrag ? getDropTargetFromPoint(e.clientX, e.clientY) : null;

        cleanupDragState();

        if (!finishedDrag) {
            return;
        }

        if (target) {
            handleDroppedItem(runtimeKey, target.dataset.classificationId || '');
        }
    }

    bank.addEventListener('click', () => moveSelectedItemTo(''));
    bank.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            moveSelectedItemTo('');
        }
    });

    function handleClassifySubmit(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return;
        if (state.questionAnswered) return;
        if (isRetentionMode() && state.retentionAnswerLocked) return;

        state.questionAnswered = true;
        selectedItemKey = null;
        cleanupDragState();

        const allCorrect = items.every(item => {
            const placedId = normalizeClassificationId(placements.get(item.runtimeKey));
            const correctId = normalizeClassificationId(item.correctClassificationId);
            return placedId && placedId === correctId;
        });

        preserveWindowScroll(() => renderClassifyStatePreservingScroll());
        setClassifyInteractionEnabled(false);
        applyQuestionOutcome(q, allCorrect);

        if (isSpeedMode()) {
            setTimeout(nextQuestion, CONFIG.speedDelay);
        }
    }

    submit.addEventListener('click', handleClassifySubmit);
    submit.addEventListener('pointerup', e => {
        if (e.pointerType === 'touch' || e.pointerType === 'pen') {
            handleClassifySubmit(e);
        }
    });
    submit.addEventListener('touchend', handleClassifySubmit, { passive: false });

    elements.questionContainer.appendChild(container);
    elements.questionContainer.appendChild(submit);

    renderClassifyState();
    setClassifyInteractionEnabled(true);
}

// ================= NAV =================
function nextQuestion() {
    if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return;

    clearFeedback();
    clearExplanations();

    if (isQuizFinished()) {
        showQuestion();
        showPendingLearningResourceIfAny();
        return;
    }

    if (isRetentionMode()) {
        if (state.pendingRetentionJump) {
            state.currentIndex = Math.max(0, state.currentIndex - 3);
            state.pendingRetentionJump = false;
            state.pendingRetentionCorrect = false;
            state.retentionAnswerLocked = false;
            showQuestion();
            showPendingLearningResourceIfAny();
            return;
        }

        if (state.pendingRetentionCorrect) {
            if (state.currentIndex < state.questionQueue.length - 1) {
                state.currentIndex++;
            } else if (state.retentionSolvedIds.size === state.questionQueue.length) {
                state.retentionFinished = true;
            }

            state.pendingRetentionCorrect = false;
            state.retentionAnswerLocked = false;
            showQuestion();
            showPendingLearningResourceIfAny();
            return;
        }

        if (state.currentIndex < state.questionQueue.length - 1) {
            state.currentIndex++;
        } else if (state.retentionSolvedIds.size === state.questionQueue.length) {
            state.retentionFinished = true;
        }

        state.retentionAnswerLocked = false;
        showQuestion();
        showPendingLearningResourceIfAny();
        return;
    }

    if (isRetryMode()) {
        if (state.questionQueue.length === 0) {
            showQuestion();
            showPendingLearningResourceIfAny();
            return;
        }

        if (state.pendingMasteryAdvance) {
            state.pendingMasteryAdvance = false;

            if (state.currentIndex >= state.questionQueue.length) {
                state.currentIndex = Math.max(0, state.questionQueue.length - 1);
            }

            showQuestion();
            showPendingLearningResourceIfAny();
            return;
        }

        if (state.currentIndex < state.questionQueue.length - 1) {
            state.currentIndex++;
        }

        showQuestion();
        showPendingLearningResourceIfAny();
        return;
    }

    if (state.currentIndex < state.questionQueue.length - 1) {
        state.currentIndex++;
    } else {
        state.normalFinished = true;
    }

    showQuestion();
    clearPendingLearningResource();
}

function prevQuestion() {
    if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return;

    clearFeedback();
    clearExplanations();
    clearPendingLearningResource();
    state.flashcardFlipped = false;

    if (isRetentionMode()) {
        state.pendingRetentionJump = false;
        state.pendingRetentionCorrect = false;
        state.retentionAnswerLocked = false;

        if (state.retentionFinished) {
            state.retentionFinished = false;
            state.currentIndex = Math.max(0, state.questionQueue.length - 1);
            showQuestion();
            return;
        }

        if (state.currentIndex > 0) {
            state.currentIndex--;
        }

        showQuestion();
        return;
    }

    if (isRetryMode()) {
        if (state.pendingMasteryAdvance) {
            state.pendingMasteryAdvance = false;
        }

        if (state.currentIndex > 0) {
            state.currentIndex--;
        }

        showQuestion();
        return;
    }

    if (state.normalFinished) {
        state.normalFinished = false;
        state.currentIndex = Math.max(0, state.questionQueue.length - 1);
        showQuestion();
        return;
    }

    if (state.currentIndex > 0) {
        state.currentIndex--;
    }

    showQuestion();
}

// ================= RESET STATE =================
function resetModeState() {
    state.currentIndex = 0;

    state.pendingRetentionJump = false;
    state.pendingRetentionCorrect = false;
    state.retentionAnswerLocked = false;
    state.retentionFinished = false;
    state.retentionSolvedIds = new Set();

    state.pendingMasteryAdvance = false;

    state.normalFinished = false;
    state.questionAnswered = false;
    state.flashcardFlipped = false;
    state.currentQuestionType = '';
    updateViewportClasses();

    clearPendingLearningResource();
    closeLearningResourcesOverlay();
    closeFlashcardImageOverlay();
}

// ================= RESTART =================
function restartQuiz() {
    if (!state.questions.length) {
        clearActiveQuizSelection();
        return;
    }

    resetModeState();
    state.questionQueue = [...state.questions];

    if (document.getElementById('shuffleQuestions').checked) {
        shuffleArray(state.questionQueue);
    }

    updateSettingsAvailability();
    showQuestion();
}

// ================= EVENTS =================
elements.nextBtn.onclick = nextQuestion;
elements.prevBtn.onclick = prevQuestion;
elements.restartBtn.onclick = restartQuiz;

document.getElementById('retentionMode').onchange = e => {
    if (e.target.checked) {
        document.getElementById('masteryMode').checked = false;
    }
    updateSettingsAvailability();
    restartQuiz();
};

document.getElementById('masteryMode').onchange = e => {
    if (e.target.checked) {
        document.getElementById('retentionMode').checked = false;
    }
    updateSettingsAvailability();
    restartQuiz();
};

document.getElementById('rapidMode').onchange = e => {
    if (e.target.checked && isLearningResourcesMode()) {
        document.getElementById('learningResourcesMode').checked = false;
    }
    updateSettingsAvailability();
    restartQuiz();
};

document.getElementById('learningResourcesMode').onchange = e => {
    if (e.target.checked && isSpeedMode()) {
        document.getElementById('rapidMode').checked = false;
    }
};

elements.mixInput.addEventListener('input', () => {
    setMixValidState(true);
});

elements.mixInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        elements.mixGoBtn.click();
    }
});

elements.mixGoBtn.addEventListener('click', async () => {
    const rawValue = elements.mixInput.value.trim();

    if (!rawValue) {
        setMixValidState(true);
        return;
    }

    try {
        const mixedQuestions = await loadMixedQuestionsFromInput(rawValue);

        if (!mixedQuestions.length) {
            throw new Error('No state.questions found');
        }

        setMixValidState(true);
        await applyLoadedQuestions(mixedQuestions);
    } catch (err) {
        console.error(err);
        setMixValidState(false);
    }
});

elements.folderSelector.addEventListener('change', e => {
    setMixValidState(true);

    const selectedFolder = e.target.value;
    populateQuizDropdown(selectedFolder);

    if (!selectedFolder) {
        clearActiveQuizSelection();
        return;
    }

    clearActiveQuizSelection('Choose a quiz.');
});

elements.quizSelector.addEventListener('change', async e => {
    setMixValidState(true);

    const selectedQuiz = e.target.value;

    if (!selectedQuiz) {
        clearActiveQuizSelection(elements.folderSelector.value ? 'Choose a quiz.' : 'Choose a folder and a quiz.');
        return;
    }

    elements.mixInput.value = '';

    try {
        await loadSelectedQuiz(selectedQuiz);
    } catch (err) {
        console.error(err);
        clearActiveQuizSelection('Failed to load quiz.');
    }
});

elements.settingsBtn.addEventListener('click', e => {
    e.stopPropagation();
    toggleSettingsPopup();
});

elements.closeSettingsBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeSettingsPopup();
});

elements.settingsPopup.addEventListener('click', e => {
    e.stopPropagation();
});

elements.settingHelpButtons.forEach(button => {
    button.addEventListener('click', e => {
        e.stopPropagation();
        toggleSettingHelpTooltip(button);
    });
});

elements.settingsPopup.addEventListener('click', e => {
    const clickedHelpButton = e.target.closest('.setting-help-btn');
    const clickedTooltip = e.target.closest('.setting-help-tooltip');

    if (!clickedHelpButton && !clickedTooltip) {
        closeAllSettingHelpTooltips();
    }
});

elements.fullscreenBtn.addEventListener('click', () => {
    toggleFullscreenMode();
});

elements.closeLearningResourcesBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeLearningResourcesOverlay();
});

if (elements.closeFlashcardImageBtn) {
    elements.closeFlashcardImageBtn.addEventListener('click', e => {
        e.stopPropagation();
        closeFlashcardImageOverlay();
    });
}

if (elements.flashcardImageOverlay) {
    elements.flashcardImageOverlay.addEventListener('click', e => {
        if (e.target === elements.flashcardImageOverlay) {
            closeFlashcardImageOverlay();
        }
    });
}

if (elements.termFrontBtn) {
    elements.termFrontBtn.addEventListener('click', () => {
        if (state.flashcardFrontMode === 'term') return;
        state.flashcardFrontMode = 'term';
        state.flashcardFlipped = false;
        updateFlashcardFrontButtonsUI();
        showQuestion();
    });
}

if (elements.definitionFrontBtn) {
    elements.definitionFrontBtn.addEventListener('click', () => {
        if (state.flashcardFrontMode === 'definition') return;
        state.flashcardFrontMode = 'definition';
        state.flashcardFlipped = false;
        updateFlashcardFrontButtonsUI();
        showQuestion();
    });
}

document.addEventListener('click', e => {
    if (!elements.settingsPopup.classList.contains('hidden') && !elements.settingsPopup.contains(e.target) && e.target !== elements.settingsBtn) {
        closeSettingsPopup();
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (state.flashcardImageZoomOpen) {
            closeFlashcardImageOverlay();
            return;
        }

        if (state.learningResourcesOverlayOpen) {
            closeLearningResourcesOverlay();
            return;
        }

        const hasOpenHelpTooltip = elements.settingHelpButtons.some(btn => btn.getAttribute('aria-expanded') === 'true');
        if (hasOpenHelpTooltip) {
            closeAllSettingHelpTooltips();
            return;
        }

        if (state.isAppFullscreen) {
            exitFullscreenMode();
        }
        closeSettingsPopup();
    }
});

window.addEventListener('resize', handleViewportChange);
window.addEventListener('orientationchange', handleViewportChange);

// ================= INIT =================
(async function () {
    try {
        applyResponsiveControlText();
        updateViewportClasses();

        const list = await populateFolderDropdown();

        if (!list.length) {
            elements.questionTextEl.innerText = 'No quizzes found.';
            return;
        }

        clearActiveQuizSelection();
        handleViewportChange();
    } catch (err) {
        console.error(err);
        elements.questionTextEl.innerText = 'Failed to load quiz list.';
    }
})();

// ================= IMAGE ZOOM =================
elements.questionImage.onclick = function () {
    if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return;
    this.classList.toggle('zoomed');
};
})();
