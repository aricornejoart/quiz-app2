/*
MODIFICATION RULES FOR THIS APP
- Preserve existing behavior and visuals unless the request explicitly says otherwise.
- Keep code modular by feature even though this build uses a single JS file.
- Reuse existing state, helpers, and DOM hooks before creating new ones.
- Do not add ad hoc overrides or duplicate logic across unrelated sections.
- When adding a feature, place it in the nearest existing feature section and keep the change narrowly scoped.
- Do not refactor unrelated areas while implementing a feature unless the request explicitly asks for cleanup.
- If behavior must change, document the reason in a nearby comment and keep the blast radius small.
*/

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
        classifyClassCount: 20,
        dataSource: 'google_sheets',
        supabase: {
            url: String(window.STUDY_BUNNY_SUPABASE_CONFIG?.url || '').trim(),
            publishableKey: String(window.STUDY_BUNNY_SUPABASE_CONFIG?.publishableKey || '').trim()
        }
    };

    const DATA_SOURCES = Object.freeze({
        GOOGLE_SHEETS: 'google_sheets',
        SUPABASE: 'supabase',
        FOLDER_DECK: 'folder_deck'
    });

    const state = {
        questions: [],
        questionQueue: [],
        currentIndex: 0,
        questionIdCounter: 0,
        quizListCache: [],
        sourceQuestions: [],
        emptyQuizMessage: '',
        isAppFullscreen: false,

        pendingRetentionJump: false,
        pendingRetentionCorrect: false,
        retentionAnswerLocked: false,
        retentionFinished: false,
        retentionSolvedIds: new Set(),

        pendingMasteryAdvance: false,

        masteryCheckPendingJump: false,
        masteryCheckPendingAdvance: false,
        masteryCheckPendingCheckpointStart: false,
        masteryCheckPendingCheckpointComplete: false,
        masteryCheckInCheckpoint: false,
        masteryCheckFinished: false,
        masteryCheckSegmentQuestions: [],
        masteryCheckSegmentIds: new Set(),
        masteryCheckCheckpointSolvedIds: new Set(),
        masteryCheckResumeQueue: [],
        masteryCheckResumeIndex: 0,
        masteryCheckMasteredIds: new Set(),

        normalFinished: false,
        questionAnswered: false,

        pendingLearningResource: null,
        learningResourcesOverlayOpen: false,

        flashcardFlipped: false,
        flashcardFrontMode: 'term',

        flashcardImageZoomOpen: false,
        currentQuestionType: '',
        activeDataSource: CONFIG.dataSource,
        auth: {
            client: null,
            configured: false,
            initialized: false,
            session: null,
            user: null,
            profile: null,
            supabaseFolders: [],
            managedQuizzes: [],
            quizStudioOpen: false,
            studioQuestionImageDataUrl: '',
            studioQuestionImageLabel: 'No question image selected.',
            studioLearningResourcesImageDataUrl: '',
            studioLearningResourcesImageLabel: 'No learning resources image selected.',
            studioFlashcardTermImageDataUrl: '',
            studioFlashcardTermImageLabel: 'No term image selected.',
            studioFlashcardDefinitionImageDataUrl: '',
            studioFlashcardDefinitionImageLabel: 'No definition image selected.',
            editingQuizId: null,
            editingQuestionId: null,
            editingQuizType: 'multiple_choice',
            studioQuizQuestions: [],
            pendingInsertAfterQuestionId: null,
            currentStudioSection: 'folders',
            lastError: '',
            starringInFlight: false
        }
    };

    const elements = {
        folderSelector: document.getElementById('folderSelector'),
        quizSelector: document.getElementById('quizSelector'),
        mixInput: document.getElementById('mixInput'),
        mixGoBtn: document.getElementById('mixGoBtn'),
        authBtn: document.getElementById('authBtn'),
        authPopup: document.getElementById('authPopup'),
        closeAuthBtn: document.getElementById('closeAuthBtn'),
        authStatus: document.getElementById('authStatus'),
        authSessionSummary: document.getElementById('authSessionSummary'),
        authDisplayName: document.getElementById('authDisplayName'),
        authEmail: document.getElementById('authEmail'),
        authPassword: document.getElementById('authPassword'),
        authSignInBtn: document.getElementById('authSignInBtn'),
        authSignUpBtn: document.getElementById('authSignUpBtn'),
        authSignOutBtn: document.getElementById('authSignOutBtn'),
        openQuizStudioBtn: document.getElementById('openQuizStudioBtn'),
        quizStudioPage: document.getElementById('quizStudioPage'),
        closeQuizStudioBtn: document.getElementById('closeQuizStudioBtn'),
        quizStudioSectionButtons: Array.from(document.querySelectorAll('[data-studio-section-target]')),
        quizStudioSections: Array.from(document.querySelectorAll('[data-studio-section]')),
        creatorStatus: document.getElementById('creatorStatus'),
        studioFolderList: document.getElementById('studioFolderList'),
        studioQuizList: document.getElementById('studioQuizList'),
        importSourceFolderSelect: document.getElementById('importSourceFolderSelect'),
        importSourceQuizSelect: document.getElementById('importSourceQuizSelect'),
        importTargetFolderSelect: document.getElementById('importTargetFolderSelect'),
        importSourceQuizBtn: document.getElementById('importSourceQuizBtn'),
        importEntireFolderSourceSelect: document.getElementById('importEntireFolderSourceSelect'),
        importEntireFolderTargetSelect: document.getElementById('importEntireFolderTargetSelect'),
        importSourceFolderBtn: document.getElementById('importSourceFolderBtn'),
        createFolderName: document.getElementById('createFolderName'),
        createFolderBtn: document.getElementById('createFolderBtn'),
        createQuizFolderSelect: document.getElementById('createQuizFolderSelect'),
        createQuizName: document.getElementById('createQuizName'),
        createQuizTypeSelect: document.getElementById('createQuizTypeSelect'),
        studioQuestionList: document.getElementById('studioQuestionList'),
        studioAddQuestionBtn: document.getElementById('studioAddQuestionBtn'),
        studioDuplicateQuestionBtn: document.getElementById('studioDuplicateQuestionBtn'),
        studioDeleteQuestionBtn: document.getElementById('studioDeleteQuestionBtn'),
        studioMoveQuestionUpBtn: document.getElementById('studioMoveQuestionUpBtn'),
        studioMoveQuestionDownBtn: document.getElementById('studioMoveQuestionDownBtn'),
        createQuestionPrompt: document.getElementById('createQuestionPrompt'),
        createQuestionImageFile: document.getElementById('createQuestionImageFile'),
        createQuestionImageName: document.getElementById('createQuestionImageName'),
        createQuestionImageClearBtn: document.getElementById('createQuestionImageClearBtn'),
        sharedQuestionEditorFields: document.getElementById('sharedQuestionEditorFields'),
        multipleChoiceEditorFields: document.getElementById('multipleChoiceEditorFields'),
        hierarchyEditorFields: document.getElementById('hierarchyEditorFields'),
        classifyEditorFields: document.getElementById('classifyEditorFields'),
        flashcardEditorFields: document.getElementById('flashcardEditorFields'),
        createFlashcardTerm: document.getElementById('createFlashcardTerm'),
        createFlashcardDefinition: document.getElementById('createFlashcardDefinition'),
        createFlashcardTermImageFile: document.getElementById('createFlashcardTermImageFile'),
        createFlashcardTermImageName: document.getElementById('createFlashcardTermImageName'),
        createFlashcardTermImageClearBtn: document.getElementById('createFlashcardTermImageClearBtn'),
        createFlashcardDefinitionImageFile: document.getElementById('createFlashcardDefinitionImageFile'),
        createFlashcardDefinitionImageName: document.getElementById('createFlashcardDefinitionImageName'),
        createFlashcardDefinitionImageClearBtn: document.getElementById('createFlashcardDefinitionImageClearBtn'),
        createLearningResources: document.getElementById('createLearningResources'),
        createLearningResourcesImageFile: document.getElementById('createLearningResourcesImageFile'),
        createLearningResourcesImageName: document.getElementById('createLearningResourcesImageName'),
        createLearningResourcesImageClearBtn: document.getElementById('createLearningResourcesImageClearBtn'),
        createOptionFieldsContainer: document.getElementById('createOptionFieldsContainer'),
        addOptionFieldBtn: document.getElementById('addOptionFieldBtn'),
        removeOptionFieldBtn: document.getElementById('removeOptionFieldBtn'),
        createHierarchyFieldsContainer: document.getElementById('createHierarchyFieldsContainer'),
        addHierarchyItemBtn: document.getElementById('addHierarchyItemBtn'),
        removeHierarchyItemBtn: document.getElementById('removeHierarchyItemBtn'),
        createClassifyCategoriesContainer: document.getElementById('createClassifyCategoriesContainer'),
        createClassifyItemsContainer: document.getElementById('createClassifyItemsContainer'),
        addClassifyCategoryBtn: document.getElementById('addClassifyCategoryBtn'),
        removeClassifyCategoryBtn: document.getElementById('removeClassifyCategoryBtn'),
        addClassifyItemBtn: document.getElementById('addClassifyItemBtn'),
        removeClassifyItemBtn: document.getElementById('removeClassifyItemBtn'),
        createCorrectOptionSelect: document.getElementById('createCorrectOptionSelect'),
        createCorrectExplanation: document.getElementById('createCorrectExplanation'),
        createQuizModeNote: document.getElementById('createQuizModeNote'),
        createQuizBtn: document.getElementById('createQuizBtn'),
        createQuizCancelEditBtn: document.getElementById('createQuizCancelEditBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        fullscreenBtn: document.getElementById('fullscreenBtn'),
        settingsPopup: document.getElementById('settingsPopup'),
        closeSettingsBtn: document.getElementById('closeSettingsBtn'),
        prevBtn: document.getElementById('prevBtn'),
        restartBtn: document.getElementById('restartBtn'),
        nextBtn: document.getElementById('nextBtn'),
        progressTextEl: document.getElementById('progressText'),
        progressSideFeedbackEl: document.getElementById('progressSideFeedback'),

        excludeStarredQuestions: document.getElementById('excludeStarredQuestions'),
        questionStarBtn: document.getElementById('questionStarBtn'),
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

    function mountFloatingPagesToBody() {
        if (elements.quizStudioPage && elements.quizStudioPage.parentElement !== document.body) {
            document.body.appendChild(elements.quizStudioPage);
        }
    }

    // ================= SUPABASE FRONTEND BOOTSTRAP =================
    // This phase keeps Google Sheets as a working source while moving account,
    // folder, and multiple-choice quiz authoring onto Supabase.
    function getSupabaseConfig() {
        const url = CONFIG.supabase.url;
        const publishableKey = CONFIG.supabase.publishableKey;
        const hasPlaceholder = value => !value || /PASTE_YOUR_SUPABASE_/i.test(value);

        return {
            url,
            publishableKey,
            isConfigured: !hasPlaceholder(url) && !hasPlaceholder(publishableKey)
        };
    }

    function getSupabaseClientFactory() {
        return window.supabase?.createClient || null;
    }

    function setAuthStatus(message, variant = 'neutral') {
        if (!elements.authStatus) return;
        elements.authStatus.textContent = message;
        elements.authStatus.classList.remove('is-error', 'is-success');

        if (variant === 'error') {
            elements.authStatus.classList.add('is-error');
        } else if (variant === 'success') {
            elements.authStatus.classList.add('is-success');
        }
    }

    function setCreatorStatus(message, variant = 'neutral') {
        if (!elements.creatorStatus) return;
        elements.creatorStatus.textContent = message;
        elements.creatorStatus.classList.remove('is-error', 'is-success');

        if (variant === 'error') {
            elements.creatorStatus.classList.add('is-error');
        } else if (variant === 'success') {
            elements.creatorStatus.classList.add('is-success');
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function buildStoredHtmlFromPlain(value) {
        const plain = normalizeSheetText(value);
        if (!plain) return '';
        return plain.split('\n').map(escapeHtml).join('<br>');
    }

    function setStudioQuestionImageState(dataUrl = '', label = 'No question image selected.') {
        state.auth.studioQuestionImageDataUrl = normalizeSheetText(dataUrl);
        state.auth.studioQuestionImageLabel = label;

        if (elements.createQuestionImageName) {
            elements.createQuestionImageName.textContent = label;
        }

        if (!dataUrl && elements.createQuestionImageFile) {
            elements.createQuestionImageFile.value = '';
        }
    }

    function setStudioLearningResourcesImageState(dataUrl = '', label = 'No learning resources image selected.') {
        state.auth.studioLearningResourcesImageDataUrl = normalizeSheetText(dataUrl);
        state.auth.studioLearningResourcesImageLabel = label;

        if (elements.createLearningResourcesImageName) {
            elements.createLearningResourcesImageName.textContent = label;
        }

        if (!dataUrl && elements.createLearningResourcesImageFile) {
            elements.createLearningResourcesImageFile.value = '';
        }
    }


    function setStudioFlashcardTermImageState(dataUrl = '', label = 'No term image selected.') {
        state.auth.studioFlashcardTermImageDataUrl = normalizeSheetText(dataUrl);
        state.auth.studioFlashcardTermImageLabel = label;
        if (elements.createFlashcardTermImageName) elements.createFlashcardTermImageName.textContent = label;
        if (!dataUrl && elements.createFlashcardTermImageFile) elements.createFlashcardTermImageFile.value = '';
    }

    function setStudioFlashcardDefinitionImageState(dataUrl = '', label = 'No definition image selected.') {
        state.auth.studioFlashcardDefinitionImageDataUrl = normalizeSheetText(dataUrl);
        state.auth.studioFlashcardDefinitionImageLabel = label;
        if (elements.createFlashcardDefinitionImageName) elements.createFlashcardDefinitionImageName.textContent = label;
        if (!dataUrl && elements.createFlashcardDefinitionImageFile) elements.createFlashcardDefinitionImageFile.value = '';
    }

    function getStudioCurrentQuizType() {
        return normalizeSheetText(state.auth.editingQuizType || elements.createQuizTypeSelect?.value || 'multiple_choice') || 'multiple_choice';
    }

    function isStudioFlashcardMode() {
        return getStudioCurrentQuizType() === 'flashcard';
    }

    function isStudioHierarchyMode() {
        return getStudioCurrentQuizType() === 'hierarchy';
    }

    function isStudioClassifyMode() {
        return getStudioCurrentQuizType() === 'classify';
    }

    function updateStudioEditorTypeUI() {
        const quizType = getStudioCurrentQuizType();
        const isFlashcard = quizType === 'flashcard';
        const isHierarchy = quizType === 'hierarchy';
        const isClassify = quizType === 'classify';
        const isMultipleChoice = quizType === 'multiple_choice';
        if (elements.sharedQuestionEditorFields) elements.sharedQuestionEditorFields.classList.toggle('hidden', isFlashcard);
        if (elements.multipleChoiceEditorFields) elements.multipleChoiceEditorFields.classList.toggle('hidden', !isMultipleChoice);
        if (elements.hierarchyEditorFields) elements.hierarchyEditorFields.classList.toggle('hidden', !isHierarchy);
        if (elements.classifyEditorFields) elements.classifyEditorFields.classList.toggle('hidden', !isClassify);
        if (elements.flashcardEditorFields) elements.flashcardEditorFields.classList.toggle('hidden', !isFlashcard);
        if (elements.createQuizTypeSelect) {
            elements.createQuizTypeSelect.value = quizType;
            elements.createQuizTypeSelect.disabled = !!state.auth.editingQuizId || !(state.auth.configured && !!state.auth.user);
        }
    }

    function populateCreatorFolderSelect() {
        if (!elements.createQuizFolderSelect) return;

        const previousValue = elements.createQuizFolderSelect.value;
        elements.createQuizFolderSelect.innerHTML = '<option value="">No folder</option>';

        state.auth.supabaseFolders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            elements.createQuizFolderSelect.appendChild(option);
        });

        if (previousValue && state.auth.supabaseFolders.some(folder => folder.id === previousValue)) {
            elements.createQuizFolderSelect.value = previousValue;
        }
    }

    function renderFolderManagementList() {
        if (!elements.studioFolderList) return;

        if (!state.auth.client || !state.auth.user?.id) {
            elements.studioFolderList.innerHTML = '<div class="studio-list-empty">Sign in to manage folders.</div>';
            return;
        }

        if (!state.auth.supabaseFolders.length) {
            elements.studioFolderList.innerHTML = '<div class="studio-list-empty">No Supabase folders yet.</div>';
            return;
        }

        elements.studioFolderList.innerHTML = state.auth.supabaseFolders.map(folder => `
            <div class="studio-list-item" data-folder-id="${escapeHtml(folder.id)}">
              <div class="studio-list-meta">
                <div class="studio-list-title">${escapeHtml(folder.name)}</div>
                <div class="studio-list-subtitle">Folder</div>
              </div>
              <div class="studio-list-controls">
                <input class="studio-inline-input" type="text" value="${escapeHtml(folder.name)}" data-folder-rename-input>
                <button type="button" class="auth-action-btn" data-action="save-folder">Save</button>
                <button type="button" class="auth-action-btn auth-secondary-btn" data-action="delete-folder">Delete</button>
              </div>
            </div>
        `).join('');
    }


    function buildStudioFolderSelectOptions(selectedFolderId = '') {
        const normalizedSelected = normalizeSheetText(selectedFolderId);
        const options = ['<option value="">No folder</option>'];
        state.auth.supabaseFolders.forEach(folder => {
            const isSelected = folder.id === normalizedSelected ? ' selected' : '';
            options.push(`<option value="${escapeHtml(folder.id)}"${isSelected}>${escapeHtml(folder.name)}</option>`);
        });
        return options.join('');
    }

    function renderQuizManagementList() {
        if (!elements.studioQuizList) return;

        if (!state.auth.client || !state.auth.user?.id) {
            elements.studioQuizList.innerHTML = '<div class="studio-list-empty">Sign in to manage Supabase quizzes.</div>';
            return;
        }

        if (!state.auth.managedQuizzes.length) {
            elements.studioQuizList.innerHTML = '<div class="studio-list-empty">No Supabase quizzes yet.</div>';
            return;
        }

        elements.studioQuizList.innerHTML = state.auth.managedQuizzes.map(quiz => {
            const folderLabel = quiz.folderName || 'No folder';
            const questionLabel = quiz.questionCount === 1 ? '1 question' : `${quiz.questionCount} questions`;
            const typeLabel = quiz.typeLabel || 'Mixed types';
            const folderOptions = buildStudioFolderSelectOptions(quiz.folderId);
            return `
                <div class="studio-list-item" data-quiz-id="${escapeHtml(quiz.id)}">
                  <div class="studio-list-meta">
                    <div class="studio-list-title">${escapeHtml(quiz.name)}</div>
                    <div class="studio-list-subtitle">${escapeHtml(folderLabel)} · ${escapeHtml(questionLabel)} · ${escapeHtml(typeLabel)}</div>
                  </div>
                  <div class="studio-list-controls">
                    <input class="studio-inline-input" type="text" value="${escapeHtml(quiz.name)}" data-quiz-rename-input>
                    <select class="studio-inline-select" data-quiz-folder-select>${folderOptions}</select>
                    <button type="button" class="auth-action-btn" data-action="save-quiz">Save</button>
                    <button type="button" class="auth-action-btn" data-action="load-quiz">Load</button>
                    <button type="button" class="auth-action-btn" data-action="edit-quiz">Edit</button>
                    <button type="button" class="auth-action-btn auth-secondary-btn" data-action="duplicate-quiz">Duplicate</button>
                    <button type="button" class="auth-action-btn auth-secondary-btn" data-action="delete-quiz">Delete</button>
                  </div>
                </div>
            `;
        }).join('');
    }

    async function loadCreatorFolders() {
        if (!state.auth.client || !state.auth.user?.id) {
            state.auth.supabaseFolders = [];
            populateCreatorFolderSelect();
            renderFolderManagementList();
            return [];
        }

        const { data, error } = await state.auth.client
            .from('folders')
            .select('id, name, sort_order')
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });

        if (error) {
            console.error('Failed to load creator folders:', error);
            state.auth.supabaseFolders = [];
            populateCreatorFolderSelect();
            renderFolderManagementList();
            return [];
        }

        state.auth.supabaseFolders = (data || []).map(folder => ({
            id: folder.id,
            name: normalizeFolderName(folder.name),
            sort_order: Number(folder.sort_order ?? 0)
        }));
        populateCreatorFolderSelect();
        renderFolderManagementList();
        return state.auth.supabaseFolders;
    }

    async function loadManagedSupabaseQuizzes() {
        if (!state.auth.client || !state.auth.user?.id) {
            state.auth.managedQuizzes = [];
            renderQuizManagementList();
            return [];
        }

        try {
            const [{ data: quizzes, error: quizzesError }, { data: questionRows, error: questionsError }] = await Promise.all([
                state.auth.client
                    .from('quizzes')
                    .select('id, folder_id, name, sort_order, is_archived')
                    .order('sort_order', { ascending: true })
                    .order('name', { ascending: true }),
                state.auth.client
                    .from('questions')
                    .select('id, quiz_id, question_type, sort_order')
                    .order('sort_order', { ascending: true })
            ]);

            if (quizzesError) throw quizzesError;
            if (questionsError) throw questionsError;

            const questionMap = new Map();
            (questionRows || []).forEach(row => {
                if (!questionMap.has(row.quiz_id)) {
                    questionMap.set(row.quiz_id, []);
                }
                questionMap.get(row.quiz_id).push(row);
            });

            state.auth.managedQuizzes = (quizzes || []).map(quiz => {
                const folder = state.auth.supabaseFolders.find(item => item.id === quiz.folder_id) || null;
                const rows = questionMap.get(quiz.id) || [];
                const types = rows.map(row => row.question_type);
                const uniqueTypes = Array.from(new Set(types));
                const quizType = uniqueTypes.length === 1 ? uniqueTypes[0] : (rows.length ? 'mixed' : 'multiple_choice');
                const typeLabelMap = {
                    multiple_choice: 'Multiple choice',
                    flashcard: 'Flashcard',
                    hierarchy: 'Hierarchy',
                    classify: 'Classify',
                    mixed: 'Mixed types'
                };
                return {
                    id: quiz.id,
                    name: normalizeSheetText(quiz.name),
                    folderId: quiz.folder_id || '',
                    folderName: folder ? normalizeFolderName(folder.name) : '',
                    questionCount: rows.length,
                    quizType,
                    typeLabel: typeLabelMap[quizType] || 'Mixed types',
                    sortOrder: Number(quiz.sort_order ?? 0),
                    firstQuestionId: rows[0]?.id || ''
                };
            });

            renderQuizManagementList();
            return state.auth.managedQuizzes;
        } catch (error) {
            console.error('Failed to load managed Supabase quizzes:', error);
            state.auth.managedQuizzes = [];
            renderQuizManagementList();
            return [];
        }
    }

    async function refreshStudioManagementData() {
        await loadCreatorFolders();
        await loadManagedSupabaseQuizzes();
    }

    function getGoogleSheetsQuizDescriptors() {
        return state.quizListCache.filter(item => isQuizDescriptor(item) && item.source === DATA_SOURCES.GOOGLE_SHEETS);
    }

    function getGoogleSheetsFolderNames() {
        return Array.from(new Set(getGoogleSheetsQuizDescriptors().map(item => normalizeFolderName(item.folder)))).sort((a, b) => a.localeCompare(b));
    }

    function getGoogleSheetsQuizzesForFolder(folderName) {
        const normalizedFolder = normalizeFolderName(folderName);
        return getGoogleSheetsQuizDescriptors()
            .filter(item => normalizeFolderName(item.folder) === normalizedFolder)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }

    function populateSelectWithFolderOptions(selectEl, folders, placeholder) {
        if (!selectEl) return;
        const previousValue = selectEl.value;
        selectEl.innerHTML = `<option value="">${placeholder}</option>`;
        folders.forEach(folderName => {
            const option = document.createElement('option');
            option.value = folderName;
            option.textContent = folderName;
            selectEl.appendChild(option);
        });
        if (folders.includes(previousValue)) {
            selectEl.value = previousValue;
        }
    }

    function populateSelectWithSupabaseFolderTargets(selectEl, placeholder) {
        if (!selectEl) return;
        const previousValue = selectEl.value;
        selectEl.innerHTML = `<option value="">${placeholder}</option>`;
        state.auth.supabaseFolders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            selectEl.appendChild(option);
        });
        const validIds = new Set(state.auth.supabaseFolders.map(folder => folder.id));
        if (validIds.has(previousValue)) {
            selectEl.value = previousValue;
        }
    }

    function renderGoogleSheetsImportControls() {
        const creatorEnabled = state.auth.configured && !!state.auth.user;
        const sourceFolders = getGoogleSheetsFolderNames();

        populateSelectWithFolderOptions(elements.importSourceFolderSelect, sourceFolders, 'Choose Google Sheets folder');
        populateSelectWithFolderOptions(elements.importEntireFolderSourceSelect, sourceFolders, 'Choose Google Sheets folder');
        populateSelectWithSupabaseFolderTargets(elements.importTargetFolderSelect, 'Use or create source folder name');
        populateSelectWithSupabaseFolderTargets(elements.importEntireFolderTargetSelect, 'Use or create source folder name');

        if (elements.importSourceQuizSelect) {
            const selectedFolder = elements.importSourceFolderSelect?.value || '';
            const previousQuizId = elements.importSourceQuizSelect.value;
            const quizzes = selectedFolder ? getGoogleSheetsQuizzesForFolder(selectedFolder) : [];
            elements.importSourceQuizSelect.innerHTML = '<option value="">Choose quiz</option>';
            quizzes.forEach(quiz => {
                const option = document.createElement('option');
                option.value = quiz.id;
                option.textContent = quiz.name;
                elements.importSourceQuizSelect.appendChild(option);
            });
            if (quizzes.some(quiz => quiz.id === previousQuizId)) {
                elements.importSourceQuizSelect.value = previousQuizId;
            }
            elements.importSourceQuizSelect.disabled = !creatorEnabled || !quizzes.length;
        }

        [
            elements.importSourceFolderSelect,
            elements.importTargetFolderSelect,
            elements.importEntireFolderSourceSelect,
            elements.importEntireFolderTargetSelect
        ].forEach(el => {
            if (!el) return;
            el.disabled = !creatorEnabled || !sourceFolders.length;
        });

        if (elements.importSourceQuizBtn) {
            const canImportSingle = creatorEnabled && !!elements.importSourceFolderSelect?.value && !!elements.importSourceQuizSelect?.value;
            elements.importSourceQuizBtn.disabled = !canImportSingle;
        }

        if (elements.importSourceFolderBtn) {
            const canImportFolder = creatorEnabled && !!elements.importEntireFolderSourceSelect?.value;
            elements.importSourceFolderBtn.disabled = !canImportFolder;
        }
    }

    function updateCreateQuizModeUI() {
        const isEditingQuiz = !!state.auth.editingQuizId;
        const isEditingQuestion = !!state.auth.editingQuestionId;
        const quizType = getStudioCurrentQuizType();
        const itemLabelMap = {
            multiple_choice: 'question',
            flashcard: 'flashcard',
            hierarchy: 'hierarchy question',
            classify: 'classify question'
        };
        const itemPluralMap = {
            multiple_choice: 'questions',
            flashcard: 'flashcards',
            hierarchy: 'hierarchy questions',
            classify: 'classify questions'
        };
        const quizLabelMap = {
            multiple_choice: 'multiple-choice quiz',
            flashcard: 'flashcard quiz',
            hierarchy: 'hierarchy quiz',
            classify: 'classify quiz'
        };
        const itemLabel = itemLabelMap[quizType] || 'question';
        const itemPlural = itemPluralMap[quizType] || 'questions';
        const quizLabel = quizLabelMap[quizType] || 'quiz';
        const itemDisplayMap = { multiple_choice: 'Question', flashcard: 'Flashcard', hierarchy: 'Hierarchy Question', classify: 'Classify Question' };
        const itemDisplay = itemDisplayMap[quizType] || 'Question';

        if (elements.createQuizBtn) {
            elements.createQuizBtn.textContent = !isEditingQuiz
                ? 'Create Quiz'
                : (isEditingQuestion ? `Save ${itemDisplay} Changes` : `Add ${itemDisplay} To Quiz`);
        }

        if (elements.createQuizCancelEditBtn) {
            elements.createQuizCancelEditBtn.disabled = !isEditingQuiz;
            elements.createQuizCancelEditBtn.textContent = 'Start New Quiz';
        }

        if (elements.createQuizModeNote) {
            elements.createQuizModeNote.textContent = !isEditingQuiz
                ? `Creates a ${quizLabel} and saves the current ${itemLabel} into it. After that, you can keep adding, selecting, deleting, and reordering ${itemPlural} inside that same quiz.`
                : (isEditingQuestion
                    ? `Editing the selected ${itemLabel} inside this quiz. Quiz name and folder changes save at the same time.`
                    : `This quiz is open in the editor. Fill in the fields below to add a new ${itemLabel} to it.`);
        }

        updateStudioEditorTypeUI();
    }

    function createStudioOptionFieldRow(index, optionData = {}) {
        const optionText = normalizeSheetText(optionData.text);
        const optionExplanation = normalizeSheetText(optionData.explanation);
        const wrapper = document.createElement('div');
        wrapper.className = 'studio-option-pair';
        wrapper.dataset.optionIndex = String(index + 1);
        wrapper.innerHTML = `
            <label class="auth-field">
              <span>Option ${index + 1}</span>
              <input type="text" autocomplete="off" placeholder="Answer option ${index + 1}" data-option-text>
            </label>
            <label class="auth-field">
              <span>Option ${index + 1} explanation</span>
              <textarea rows="2" placeholder="Explain option ${index + 1}" data-option-explanation></textarea>
            </label>
        `;
        const textInput = wrapper.querySelector('[data-option-text]');
        const explanationInput = wrapper.querySelector('[data-option-explanation]');
        if (textInput) textInput.value = optionText;
        if (explanationInput) explanationInput.value = optionExplanation;
        return wrapper;
    }

    function syncCorrectOptionSelect(preferredValue = null) {
        if (!elements.createCorrectOptionSelect || !elements.createOptionFieldsContainer) return;

        const optionRows = Array.from(elements.createOptionFieldsContainer.querySelectorAll('[data-option-index]'));
        const previousValue = preferredValue || elements.createCorrectOptionSelect.value || '1';
        elements.createCorrectOptionSelect.innerHTML = '';

        optionRows.forEach((_, index) => {
            const option = document.createElement('option');
            option.value = String(index + 1);
            option.textContent = `Option ${index + 1}`;
            elements.createCorrectOptionSelect.appendChild(option);
        });

        if (!optionRows.length) {
            const option = document.createElement('option');
            option.value = '1';
            option.textContent = 'Option 1';
            elements.createCorrectOptionSelect.appendChild(option);
        }

        const maxValue = String(optionRows.length || 1);
        const nextValue = Number(previousValue) >= 1 && Number(previousValue) <= Number(maxValue)
            ? previousValue
            : '1';
        elements.createCorrectOptionSelect.value = nextValue;
    }

    function renderStudioOptionFields(optionDrafts = null) {
        if (!elements.createOptionFieldsContainer) return;

        const normalizedDrafts = (Array.isArray(optionDrafts) && optionDrafts.length ? optionDrafts : Array.from({ length: 4 }, () => ({ text: '', explanation: '' })))
            .map(draft => ({
                text: normalizeSheetText(draft?.text),
                explanation: normalizeSheetText(draft?.explanation)
            }));

        const safeDrafts = normalizedDrafts.length >= 2 ? normalizedDrafts : [
            ...normalizedDrafts,
            ...Array.from({ length: 2 - normalizedDrafts.length }, () => ({ text: '', explanation: '' }))
        ];

        elements.createOptionFieldsContainer.innerHTML = '';
        safeDrafts.forEach((draft, index) => {
            elements.createOptionFieldsContainer.appendChild(createStudioOptionFieldRow(index, draft));
        });
        syncCorrectOptionSelect();
        updateCreatorUI();
    }

    function getStudioOptionDraftsFromDOM() {
        if (!elements.createOptionFieldsContainer) return [];
        return Array.from(elements.createOptionFieldsContainer.querySelectorAll('[data-option-index]')).map(row => ({
            text: normalizeSheetText(row.querySelector('[data-option-text]')?.value),
            explanation: normalizeSheetText(row.querySelector('[data-option-explanation]')?.value)
        }));
    }

    function addStudioOptionField() {
        const drafts = getStudioOptionDraftsFromDOM();
        drafts.push({ text: '', explanation: '' });
        renderStudioOptionFields(drafts);
        syncCorrectOptionSelect(String(drafts.length));
    }

    function removeStudioOptionField() {
        const drafts = getStudioOptionDraftsFromDOM();
        if (drafts.length <= 2) {
            setCreatorStatus('Multiple-choice quizzes need at least 2 options.', 'error');
            return;
        }
        drafts.pop();
        renderStudioOptionFields(drafts);
    }
    function normalizeHierarchyDrafts(hierarchyDrafts = null) {
        const source = (Array.isArray(hierarchyDrafts) && hierarchyDrafts.length ? hierarchyDrafts : Array.from({ length: 4 }, (_, index) => ({ text: '', position: index + 1 })))
            .map((draft, index) => ({
                text: normalizeSheetText(draft?.text),
                position: Number(draft?.position || index + 1)
            }));

        while (source.length < 2) {
            source.push({ text: '', position: source.length + 1 });
        }

        const used = new Set();
        source.forEach((draft, index) => {
            let nextPosition = Number(draft.position);
            if (!Number.isInteger(nextPosition) || nextPosition < 1 || nextPosition > source.length || used.has(nextPosition)) {
                nextPosition = 1;
                while (used.has(nextPosition) && nextPosition <= source.length) nextPosition += 1;
            }
            if (nextPosition > source.length) {
                nextPosition = index + 1;
                while (used.has(nextPosition) && nextPosition <= source.length) nextPosition += 1;
            }
            draft.position = Math.min(Math.max(nextPosition, 1), source.length);
            used.add(draft.position);
        });

        return source;
    }

    function createStudioHierarchyFieldRow(index, itemData = {}, totalCount = 2) {
        const itemText = normalizeSheetText(itemData.text);
        const positionValue = String(Math.min(Math.max(Number(itemData.position || index + 1), 1), totalCount));
        const wrapper = document.createElement('div');
        wrapper.className = 'studio-option-pair studio-hierarchy-pair';
        wrapper.dataset.hierarchyIndex = String(index + 1);
        wrapper.innerHTML = `
            <label class="auth-field">
              <span>Item ${index + 1}</span>
              <input type="text" autocomplete="off" placeholder="Hierarchy item ${index + 1}" data-hierarchy-text>
            </label>
            <label class="auth-field">
              <span>Correct position</span>
              <select data-hierarchy-position></select>
            </label>
        `;
        const textInput = wrapper.querySelector('[data-hierarchy-text]');
        const positionSelect = wrapper.querySelector('[data-hierarchy-position]');
        if (textInput) textInput.value = itemText;
        if (positionSelect) {
            for (let i = 1; i <= totalCount; i += 1) {
                const option = document.createElement('option');
                option.value = String(i);
                option.textContent = `Position ${i}`;
                positionSelect.appendChild(option);
            }
            positionSelect.value = positionValue;
        }
        return wrapper;
    }

    function renderStudioHierarchyFields(hierarchyDrafts = null) {
        if (!elements.createHierarchyFieldsContainer) return;
        const drafts = normalizeHierarchyDrafts(hierarchyDrafts);
        elements.createHierarchyFieldsContainer.innerHTML = '';
        drafts.forEach((draft, index) => {
            elements.createHierarchyFieldsContainer.appendChild(createStudioHierarchyFieldRow(index, draft, drafts.length));
        });
        updateCreatorUI();
    }

    function getStudioHierarchyDraftsFromDOM() {
        if (!elements.createHierarchyFieldsContainer) return [];
        return Array.from(elements.createHierarchyFieldsContainer.querySelectorAll('[data-hierarchy-index]')).map((row, index) => ({
            text: normalizeSheetText(row.querySelector('[data-hierarchy-text]')?.value),
            position: Number(row.querySelector('[data-hierarchy-position]')?.value || index + 1)
        }));
    }

    function addStudioHierarchyField() {
        const drafts = getStudioHierarchyDraftsFromDOM();
        if (drafts.length >= 10) {
            setCreatorStatus('Hierarchy quizzes support up to 10 items.', 'error');
            return;
        }
        drafts.push({ text: '', position: drafts.length + 1 });
        renderStudioHierarchyFields(drafts);
    }

    function removeStudioHierarchyField() {
        const drafts = getStudioHierarchyDraftsFromDOM();
        if (drafts.length <= 2) {
            setCreatorStatus('Hierarchy quizzes need at least 2 items.', 'error');
            return;
        }
        drafts.pop();
        renderStudioHierarchyFields(drafts);
    }

    function getHierarchyDraftsFromDetailRow(detailRow) {
        const itemTexts = Array.from({ length: 10 }, (_, index) => normalizeSheetText(detailRow?.[`item_${index + 1}_text`])).filter(Boolean);
        const correctOrder = Array.isArray(detailRow?.correct_order_json) ? detailRow.correct_order_json.map(value => Number(value)).filter(value => Number.isInteger(value) && value >= 1) : [];
        const positionMap = new Map();
        correctOrder.forEach((originalIndex, finalIndex) => {
            positionMap.set(originalIndex, finalIndex + 1);
        });
        const drafts = itemTexts.map((text, index) => ({
            text,
            position: positionMap.get(index + 1) || index + 1
        }));
        return normalizeHierarchyDrafts(drafts);
    }

    function normalizeClassifyCategoriesDrafts(categoryDrafts = null) {
        const source = (Array.isArray(categoryDrafts) && categoryDrafts.length ? categoryDrafts : Array.from({ length: 2 }, (_, index) => ({ label: '', imageUrl: '', id: `class_${index + 1}` })))
            .map((draft, index) => ({
                label: normalizeSheetText(draft?.label),
                imageUrl: normalizeSheetText(draft?.imageUrl),
                id: normalizeSheetText(draft?.id) || `class_${index + 1}`
            }))
            .slice(0, CONFIG.classifyClassCount);

        while (source.length < 2) {
            source.push({ label: '', imageUrl: '', id: `class_${source.length + 1}` });
        }

        return source.map((draft, index) => ({ label: draft.label, imageUrl: draft.imageUrl, id: `class_${index + 1}` }));
    }

    function normalizeClassifyItemsDrafts(itemDrafts = null, categories = null) {
        const normalizedCategories = normalizeClassifyCategoriesDrafts(categories);
        const fallbackCategoryId = normalizedCategories[0]?.id || 'class_1';
        const source = (Array.isArray(itemDrafts) && itemDrafts.length ? itemDrafts : Array.from({ length: 2 }, () => ({ text: '', imageUrl: '', categoryId: fallbackCategoryId })))
            .map(draft => ({
                text: normalizeSheetText(draft?.text),
                imageUrl: normalizeSheetText(draft?.imageUrl),
                categoryId: normalizeSheetText(draft?.categoryId) || fallbackCategoryId
            }))
            .slice(0, CONFIG.classifyItemCount);

        while (source.length < 2) {
            source.push({ text: '', imageUrl: '', categoryId: fallbackCategoryId });
        }

        return source.map(draft => ({
            text: draft.text,
            imageUrl: draft.imageUrl,
            categoryId: normalizedCategories.some(category => category.id === draft.categoryId) ? draft.categoryId : fallbackCategoryId
        }));
    }

    function setStudioClassifyRowImageState(wrapper, kind, dataUrl = '', label = '') {
        if (!wrapper) return;
        const normalizedDataUrl = normalizeSheetText(dataUrl);
        const safeLabel = label || (kind === 'category' ? 'No category image selected.' : 'No item image selected.');
        wrapper.dataset[kind === 'category' ? 'classifyCategoryImageUrl' : 'classifyItemImageUrl'] = normalizedDataUrl;

        const fileNameEl = wrapper.querySelector(kind === 'category' ? '[data-classify-category-image-name]' : '[data-classify-item-image-name]');
        if (fileNameEl) {
            fileNameEl.textContent = normalizedDataUrl ? safeLabel : (kind === 'category' ? 'No category image selected.' : 'No item image selected.');
        }

        const previewEl = wrapper.querySelector(kind === 'category' ? '[data-classify-category-image-preview]' : '[data-classify-item-image-preview]');
        if (previewEl) {
            if (normalizedDataUrl) {
                previewEl.src = normalizedDataUrl;
                previewEl.classList.remove('hidden');
            } else {
                previewEl.src = '';
                previewEl.classList.add('hidden');
            }
        }

        const inputEl = wrapper.querySelector(kind === 'category' ? '[data-classify-category-image-file]' : '[data-classify-item-image-file]');
        if (!normalizedDataUrl && inputEl) {
            inputEl.value = '';
        }
    }

    function createStudioClassifyCategoryRow(index, categoryData = {}) {
        const wrapper = document.createElement('div');
        wrapper.className = 'studio-option-pair studio-classify-row';
        wrapper.dataset.classifyCategoryIndex = String(index + 1);
        wrapper.innerHTML = `
            <label class="auth-field">
              <span>Category ${index + 1} text (optional)</span>
              <input type="text" autocomplete="off" placeholder="Category ${index + 1}" data-classify-category-label>
            </label>
            <label class="auth-field">
              <span>Category ${index + 1} image (optional)</span>
              <input type="file" accept="image/*" data-classify-category-image-file>
            </label>
            <div class="studio-file-row">
              <div class="studio-file-name" data-classify-category-image-name>No category image selected.</div>
              <button type="button" class="auth-action-btn auth-secondary-btn studio-clear-btn" data-classify-category-image-clear>Clear</button>
            </div>
            <img class="studio-inline-image-preview hidden" alt="Category image preview" data-classify-category-image-preview>
        `;
        const input = wrapper.querySelector('[data-classify-category-label]');
        if (input) input.value = normalizeSheetText(categoryData.label);
        setStudioClassifyRowImageState(wrapper, 'category', normalizeSheetText(categoryData.imageUrl), normalizeSheetText(categoryData.imageUrl) ? 'Selected image.' : '');
        return wrapper;
    }

    function populateClassifyItemCategorySelect(select, categories, selectedId) {
        if (!select) return;
        select.innerHTML = '';
        categories.forEach((category, index) => {
            const option = document.createElement('option');
            option.value = category.id;
            const fallbackLabel = category.imageUrl ? `Category ${index + 1} (image)` : `Category ${index + 1}`;
            option.textContent = normalizeSheetText(category.label) || fallbackLabel;
            select.appendChild(option);
        });
        select.value = categories.some(category => category.id === selectedId) ? selectedId : (categories[0]?.id || '');
    }

    function createStudioClassifyItemRow(index, itemData = {}, categories = []) {
        const wrapper = document.createElement('div');
        wrapper.className = 'studio-option-pair studio-classify-row';
        wrapper.dataset.classifyItemIndex = String(index + 1);
        wrapper.innerHTML = `
            <label class="auth-field">
              <span>Item ${index + 1} text (optional)</span>
              <input type="text" autocomplete="off" placeholder="Classify item ${index + 1}" data-classify-item-text>
            </label>
            <label class="auth-field">
              <span>Item ${index + 1} image (optional)</span>
              <input type="file" accept="image/*" data-classify-item-image-file>
            </label>
            <div class="studio-file-row">
              <div class="studio-file-name" data-classify-item-image-name>No item image selected.</div>
              <button type="button" class="auth-action-btn auth-secondary-btn studio-clear-btn" data-classify-item-image-clear>Clear</button>
            </div>
            <img class="studio-inline-image-preview hidden" alt="Item image preview" data-classify-item-image-preview>
            <label class="auth-field">
              <span>Correct category</span>
              <select data-classify-item-category></select>
            </label>
        `;
        const input = wrapper.querySelector('[data-classify-item-text]');
        const select = wrapper.querySelector('[data-classify-item-category]');
        if (input) input.value = normalizeSheetText(itemData.text);
        setStudioClassifyRowImageState(wrapper, 'item', normalizeSheetText(itemData.imageUrl), normalizeSheetText(itemData.imageUrl) ? 'Selected image.' : '');
        populateClassifyItemCategorySelect(select, categories, itemData.categoryId);
        return wrapper;
    }

    function getStudioClassifyCategoriesDraftsFromDOM() {
        if (!elements.createClassifyCategoriesContainer) return normalizeClassifyCategoriesDrafts();
        const drafts = Array.from(elements.createClassifyCategoriesContainer.querySelectorAll('[data-classify-category-index]')).map((row, index) => ({
            label: normalizeSheetText(row.querySelector('[data-classify-category-label]')?.value),
            imageUrl: normalizeSheetText(row.dataset.classifyCategoryImageUrl),
            id: `class_${index + 1}`
        }));
        return normalizeClassifyCategoriesDrafts(drafts);
    }

    function getStudioClassifyItemsDraftsFromDOM(categoriesOverride = null) {
        const categories = normalizeClassifyCategoriesDrafts(categoriesOverride || getStudioClassifyCategoriesDraftsFromDOM());
        if (!elements.createClassifyItemsContainer) return normalizeClassifyItemsDrafts([], categories);
        const fallbackCategoryId = categories[0]?.id || 'class_1';
        const actualDrafts = Array.from(elements.createClassifyItemsContainer.querySelectorAll('[data-classify-item-index]')).map(row => ({
            text: normalizeSheetText(row.querySelector('[data-classify-item-text]')?.value),
            imageUrl: normalizeSheetText(row.dataset.classifyItemImageUrl),
            categoryId: normalizeSheetText(row.querySelector('[data-classify-item-category]')?.value) || fallbackCategoryId
        }));
        return normalizeClassifyItemsDrafts(actualDrafts, categories);
    }

    function renderStudioClassifyFields(categoryDrafts = null, itemDrafts = null) {
        if (!elements.createClassifyCategoriesContainer || !elements.createClassifyItemsContainer) return;
        const categories = normalizeClassifyCategoriesDrafts(categoryDrafts);
        const items = normalizeClassifyItemsDrafts(itemDrafts, categories);
        elements.createClassifyCategoriesContainer.innerHTML = '';
        categories.forEach((category, index) => {
            elements.createClassifyCategoriesContainer.appendChild(createStudioClassifyCategoryRow(index, category));
        });
        elements.createClassifyItemsContainer.innerHTML = '';
        items.forEach((item, index) => {
            elements.createClassifyItemsContainer.appendChild(createStudioClassifyItemRow(index, item, categories));
        });
        updateCreatorUI();
    }

    function refreshStudioClassifyItemCategoryOptions() {
        const categories = getStudioClassifyCategoriesDraftsFromDOM();
        if (!elements.createClassifyItemsContainer) return;
        elements.createClassifyItemsContainer.querySelectorAll('[data-classify-item-index]').forEach((row, index) => {
            const select = row.querySelector('[data-classify-item-category]');
            const currentValue = normalizeSheetText(select?.value);
            populateClassifyItemCategorySelect(select, categories, currentValue || categories[0]?.id || `class_${Math.min(index + 1, categories.length)}`);
        });
    }

    function addStudioClassifyCategoryField() {
        const categories = getStudioClassifyCategoriesDraftsFromDOM();
        const items = getStudioClassifyItemsDraftsFromDOM(categories);
        if (categories.length >= CONFIG.classifyClassCount) {
            setCreatorStatus(`Classify quizzes support up to ${CONFIG.classifyClassCount} categories.`, 'error');
            return;
        }
        categories.push({ label: '', imageUrl: '', id: `class_${categories.length + 1}` });
        renderStudioClassifyFields(categories, items);
    }

    function removeStudioClassifyCategoryField() {
        const categories = getStudioClassifyCategoriesDraftsFromDOM();
        const items = getStudioClassifyItemsDraftsFromDOM(categories);
        if (categories.length <= 2) {
            setCreatorStatus('Classify quizzes need at least 2 categories.', 'error');
            return;
        }
        const removed = categories.pop();
        const nextCategories = normalizeClassifyCategoriesDrafts(categories);
        const fallbackCategoryId = nextCategories[0]?.id || 'class_1';
        const nextItems = items.map(item => ({
            text: item.text,
            imageUrl: item.imageUrl,
            categoryId: item.categoryId === removed.id ? fallbackCategoryId : item.categoryId
        }));
        renderStudioClassifyFields(nextCategories, nextItems);
    }

    function addStudioClassifyItemField() {
        const categories = getStudioClassifyCategoriesDraftsFromDOM();
        const items = getStudioClassifyItemsDraftsFromDOM(categories);
        if (items.length >= CONFIG.classifyItemCount) {
            setCreatorStatus(`Classify quizzes support up to ${CONFIG.classifyItemCount} items.`, 'error');
            return;
        }
        items.push({ text: '', imageUrl: '', categoryId: categories[0]?.id || 'class_1' });
        renderStudioClassifyFields(categories, items);
    }

    function removeStudioClassifyItemField() {
        const categories = getStudioClassifyCategoriesDraftsFromDOM();
        const items = getStudioClassifyItemsDraftsFromDOM(categories);
        if (items.length <= 2) {
            setCreatorStatus('Classify quizzes need at least 2 items.', 'error');
            return;
        }
        items.pop();
        renderStudioClassifyFields(categories, items);
    }

    function getClassifyDraftsFromDetailRow(detailRow) {
        const categories = normalizeClassifyCategoriesDrafts((detailRow?.classifications_json || []).map(item => ({ label: item?.label, imageUrl: item?.imageUrl, id: item?.id })));
        const fallbackCategoryId = categories[0]?.id || 'class_1';
        const items = normalizeClassifyItemsDrafts((detailRow?.items_json || []).map(item => ({
            text: normalizeSheetText(item?.text || (item?.kind === 'image' ? '' : item?.raw)),
            imageUrl: normalizeSheetText(item?.imageUrl),
            categoryId: normalizeSheetText(item?.correctClassificationId) || fallbackCategoryId
        })), categories);
        return { categories, items };
    }


    function getMultipleChoiceDraftsFromDetailRow(detailRow) {
        const rawOptions = Array.isArray(detailRow?.options_json)
            ? detailRow.options_json
            : [];

        const normalizedFromJson = rawOptions
            .map(item => ({
                text: normalizeSheetText(item?.text),
                explanation: getStoredTextForDisplay('', item?.explanation_html || '')
            }))
            .filter(item => item.text);

        if (normalizedFromJson.length) {
            return normalizedFromJson;
        }

        return [
            {
                text: normalizeSheetText(detailRow?.option_1_text),
                explanation: getStoredTextForDisplay('', detailRow?.option_1_explanation_html)
            },
            {
                text: normalizeSheetText(detailRow?.option_2_text),
                explanation: getStoredTextForDisplay('', detailRow?.option_2_explanation_html)
            },
            {
                text: normalizeSheetText(detailRow?.option_3_text),
                explanation: getStoredTextForDisplay('', detailRow?.option_3_explanation_html)
            },
            {
                text: normalizeSheetText(detailRow?.option_4_text),
                explanation: getStoredTextForDisplay('', detailRow?.option_4_explanation_html)
            }
        ].filter(item => item.text);
    }

    function getStudioQuestionPreviewLabel(questionRow, index) {
        const questionType = normalizeSheetText(questionRow?.question_type || 'multiple_choice');
        const truncatePreview = value => {
            const normalized = normalizeSheetText(value || '');
            if (!normalized) return '';
            return normalized.length > 60 ? `${normalized.slice(0, 60)}…` : normalized;
        };

        if (questionType === 'flashcard') {
            const term = truncatePreview(questionRow?.term_plain || questionRow?.prompt_plain || '');
            const definition = truncatePreview(questionRow?.definition_plain || '');
            const parts = [];
            if (term) parts.push(`Term: ${term}`);
            if (definition) parts.push(`Definition: ${definition}`);
            if (parts.length) {
                return `Card ${index + 1}: ${parts.join(' • ')}`;
            }
            return `Flashcard ${index + 1}`;
        }

        const prompt = normalizeSheetText(questionRow?.prompt_plain || '');
        const prefix = questionType === 'hierarchy' ? `H${index + 1}` : (questionType === 'classify' ? `C${index + 1}` : `Q${index + 1}`);
        if (prompt) {
            return `${prefix}: ${prompt.length > 90 ? `${prompt.slice(0, 90)}…` : prompt}`;
        }
        return questionType === 'hierarchy' ? `Hierarchy ${index + 1}` : (questionType === 'classify' ? `Classify ${index + 1}` : `Question ${index + 1}`);
    }

    function renderStudioQuestionList() {
        if (!elements.studioQuestionList) return;

        if (!state.auth.user?.id) {
            elements.studioQuestionList.innerHTML = '<div class="studio-list-empty">Sign in to edit quiz questions.</div>';
            return;
        }

        if (!state.auth.editingQuizId) {
            elements.studioQuestionList.innerHTML = '<div class="studio-list-empty">Create a quiz or click Edit on a Supabase quiz to manage multiple questions here.</div>';
            return;
        }

        if (!state.auth.studioQuizQuestions.length) {
            elements.studioQuestionList.innerHTML = '<div class="studio-list-empty">No questions in this quiz yet. Click Add Question, fill in the editor, then save.</div>';
            return;
        }

        elements.studioQuestionList.innerHTML = state.auth.studioQuizQuestions.map((questionRow, index) => {
            const isActive = questionRow.id === state.auth.editingQuestionId;
            const isInsertTarget = questionRow.id === state.auth.pendingInsertAfterQuestionId;
            const questionType = normalizeSheetText(questionRow.question_type || 'multiple_choice');
            const chipPrefix = questionType === 'flashcard' ? 'Card' : (questionType === 'hierarchy' ? 'H' : (questionType === 'classify' ? 'C' : 'Q'));
            const previewLabel = getStudioQuestionPreviewLabel(questionRow, index).replace(/^(Q|H|C)\d+:\s*/, '').replace(/^Card \d+:\s*/, '');
            return `
                <div class="studio-question-list-row">
                  <button
                    type="button"
                    class="studio-question-list-item${isActive ? ' active' : ''}"
                    data-studio-question-id="${escapeHtml(questionRow.id)}"
                    aria-pressed="${isActive ? 'true' : 'false'}"
                  >
                    <span class="studio-question-chip">${escapeHtml(`${chipPrefix}${index + 1}`)}</span>
                    <span class="studio-question-label">${escapeHtml(previewLabel)}</span>
                  </button>
                  <div class="studio-question-insert-row">
                    <button
                      type="button"
                      class="studio-question-insert-btn${isInsertTarget ? ' active' : ''}"
                      data-studio-insert-after-question-id="${escapeHtml(questionRow.id)}"
                      aria-label="Add a new question after ${escapeHtml(`${chipPrefix}${index + 1}`)}"
                      title="Add a new question after this one"
                    >+</button>
                  </div>
                </div>
            `;
        }).join('');
    }

    function clearStudioQuestionInputs(options = {}) {
        if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = '';
        if (elements.createLearningResources) elements.createLearningResources.value = '';
        if (elements.createFlashcardTerm) elements.createFlashcardTerm.value = '';
        if (elements.createFlashcardDefinition) elements.createFlashcardDefinition.value = '';
        renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '' })));
        renderStudioHierarchyFields(Array.from({ length: 4 }, (_, index) => ({ text: '', position: index + 1 })));
        renderStudioClassifyFields(Array.from({ length: 2 }, (_, index) => ({ label: '', id: `class_${index + 1}` })), Array.from({ length: 2 }, () => ({ text: '', categoryId: 'class_1' })));
        if (elements.createCorrectOptionSelect) elements.createCorrectOptionSelect.value = '1';
        if (elements.createCorrectExplanation) elements.createCorrectExplanation.value = '';
        state.auth.editingQuestionId = null;
        if (!options.keepPendingInsert) {
            state.auth.pendingInsertAfterQuestionId = null;
        }
        setStudioQuestionImageState('', 'No question image selected.');
        setStudioLearningResourcesImageState('', 'No learning resources image selected.');
        setStudioFlashcardTermImageState('', 'No term image selected.');
        setStudioFlashcardDefinitionImageState('', 'No definition image selected.');
        renderStudioQuestionList();
        updateCreateQuizModeUI();
    }

    async function getNextQuestionSortOrder(quizId) {
        if (!state.auth.client || !quizId) return 0;

        const { data, error } = await state.auth.client
            .from('questions')
            .select('sort_order')
            .eq('quiz_id', quizId)
            .order('sort_order', { ascending: false })
            .limit(1);

        if (error) throw error;
        return Number(data?.[0]?.sort_order ?? -1) + 1;
    }

    async function loadStudioQuestionListForQuiz(quizId) {
        if (!state.auth.client || !quizId) {
            state.auth.studioQuizQuestions = [];
            renderStudioQuestionList();
            return [];
        }

        const { data, error } = await state.auth.client
            .from('questions')
            .select('id, prompt_plain, question_type, sort_order')
            .eq('quiz_id', quizId)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        const rows = (data || []);
        const flashcardQuestionIds = rows.filter(row => row.question_type === 'flashcard').map(row => row.id);
        const flashcardDetails = flashcardQuestionIds.length ? await loadFlashcardDetailsByQuestionIds(flashcardQuestionIds) : [];
        const flashcardMap = new Map((flashcardDetails || []).map(row => [row.question_id, row]));

        state.auth.studioQuizQuestions = rows.map(row => ({
            id: row.id,
            prompt_plain: normalizeSheetText(row.prompt_plain),
            term_plain: normalizeSheetText(flashcardMap.get(row.id)?.term_plain),
            definition_plain: normalizeSheetText(flashcardMap.get(row.id)?.definition_plain),
            question_type: normalizeSheetText(row.question_type || 'multiple_choice'),
            sort_order: Number(row.sort_order ?? 0)
        }));
        renderStudioQuestionList();
        return state.auth.studioQuizQuestions;
    }

    async function loadStudioQuestionIntoEditor(questionId, options = {}) {
        const suppressStatus = !!options.suppressStatus;
        if (!state.auth.client || !questionId) {
            clearStudioQuestionInputs();
            return;
        }

        const { data: questionRow, error: questionError } = await state.auth.client
            .from('questions')
            .select('id, prompt_html, prompt_plain, image_url, learning_resources_html, learning_resources_image_url, question_type')
            .eq('id', questionId)
            .maybeSingle();

        if (questionError) throw questionError;
        if (!questionRow) {
            throw new Error('Could not load that question into the editor.');
        }

        state.auth.editingQuestionId = questionRow.id;
        state.auth.pendingInsertAfterQuestionId = null;
        state.auth.editingQuizType = normalizeSheetText(questionRow.question_type || state.auth.editingQuizType || 'multiple_choice') || 'multiple_choice';

        if (elements.createLearningResources) {
            elements.createLearningResources.value = getStoredTextForDisplay('', questionRow.learning_resources_html);
        }
        setStudioLearningResourcesImageState(
            normalizeSheetText(questionRow.learning_resources_image_url),
            normalizeSheetText(questionRow.learning_resources_image_url) ? 'Existing learning resources image saved.' : 'No learning resources image selected.'
        );

        if (state.auth.editingQuizType === 'flashcard') {
            const detailRow = await loadFlashcardDetailByQuestionId(questionId);
            if (!detailRow) {
                throw new Error('Could not load that flashcard into the editor.');
            }

            if (elements.createFlashcardTerm) elements.createFlashcardTerm.value = getStoredTextForDisplay(detailRow.term_plain, detailRow.term_html);
            if (elements.createFlashcardDefinition) elements.createFlashcardDefinition.value = getStoredTextForDisplay(detailRow.definition_plain, detailRow.definition_html);
            setStudioFlashcardTermImageState(
                normalizeSheetText(detailRow.term_image_url),
                normalizeSheetText(detailRow.term_image_url) ? 'Existing term image saved.' : 'No term image selected.'
            );
            setStudioFlashcardDefinitionImageState(
                normalizeSheetText(detailRow.definition_image_url),
                normalizeSheetText(detailRow.definition_image_url) ? 'Existing definition image saved.' : 'No definition image selected.'
            );
            setStudioQuestionImageState('', 'No question image selected.');
            if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = '';
            if (elements.createCorrectExplanation) elements.createCorrectExplanation.value = '';
            renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '' })));
            renderStudioHierarchyFields(Array.from({ length: 4 }, (_, index) => ({ text: '', position: index + 1 })));
            if (elements.createCorrectOptionSelect) elements.createCorrectOptionSelect.value = '1';
        } else if (state.auth.editingQuizType === 'hierarchy') {
            const detailRow = await loadHierarchyDetailByQuestionId(questionId);
            if (!detailRow) {
                throw new Error('Could not load that hierarchy question into the editor.');
            }

            if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = getStoredTextForDisplay(questionRow.prompt_plain, questionRow.prompt_html);
            renderStudioHierarchyFields(getHierarchyDraftsFromDetailRow(detailRow));
            renderStudioClassifyFields(Array.from({ length: 2 }, (_, index) => ({ label: '', id: `class_${index + 1}` })), Array.from({ length: 2 }, () => ({ text: '', categoryId: 'class_1' })));
            renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '' })));
            if (elements.createCorrectOptionSelect) elements.createCorrectOptionSelect.value = '1';
            if (elements.createCorrectExplanation) elements.createCorrectExplanation.value = '';

            setStudioQuestionImageState(
                normalizeSheetText(questionRow.image_url),
                normalizeSheetText(questionRow.image_url) ? 'Existing question image saved.' : 'No question image selected.'
            );
            setStudioFlashcardTermImageState('', 'No term image selected.');
            setStudioFlashcardDefinitionImageState('', 'No definition image selected.');
            if (elements.createFlashcardTerm) elements.createFlashcardTerm.value = '';
            if (elements.createFlashcardDefinition) elements.createFlashcardDefinition.value = '';
        } else if (state.auth.editingQuizType === 'classify') {
            const detailRow = await loadClassifyDetailByQuestionId(questionId);
            if (!detailRow) {
                throw new Error('Could not load that classify question into the editor.');
            }

            if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = getStoredTextForDisplay(questionRow.prompt_plain, questionRow.prompt_html);
            const classifyDrafts = getClassifyDraftsFromDetailRow(detailRow);
            renderStudioClassifyFields(classifyDrafts.categories, classifyDrafts.items);
            renderStudioHierarchyFields(Array.from({ length: 4 }, (_, index) => ({ text: '', position: index + 1 })));
            renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '' })));
            if (elements.createCorrectOptionSelect) elements.createCorrectOptionSelect.value = '1';
            if (elements.createCorrectExplanation) elements.createCorrectExplanation.value = '';

            setStudioQuestionImageState(
                normalizeSheetText(questionRow.image_url),
                normalizeSheetText(questionRow.image_url) ? 'Existing question image saved.' : 'No question image selected.'
            );
            setStudioFlashcardTermImageState('', 'No term image selected.');
            setStudioFlashcardDefinitionImageState('', 'No definition image selected.');
            if (elements.createFlashcardTerm) elements.createFlashcardTerm.value = '';
            if (elements.createFlashcardDefinition) elements.createFlashcardDefinition.value = '';
        } else {
            const detailRow = await loadMultipleChoiceDetailByQuestionId(questionId);
            if (!detailRow) {
                throw new Error('Could not load that question into the editor.');
            }

            if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = getStoredTextForDisplay(questionRow.prompt_plain, questionRow.prompt_html);
            if (elements.createCorrectExplanation) elements.createCorrectExplanation.value = getStoredTextForDisplay('', detailRow.correct_explanation_html);
            const optionDrafts = getMultipleChoiceDraftsFromDetailRow(detailRow);
            renderStudioOptionFields(optionDrafts);
            renderStudioHierarchyFields(Array.from({ length: 4 }, (_, index) => ({ text: '', position: index + 1 })));
            const correctIndex = Math.max(0, optionDrafts.findIndex(option => option.text === normalizeSheetText(detailRow.correct_answer)));
            if (elements.createCorrectOptionSelect) {
                elements.createCorrectOptionSelect.value = String(correctIndex + 1);
            }

            setStudioQuestionImageState(
                normalizeSheetText(questionRow.image_url),
                normalizeSheetText(questionRow.image_url) ? 'Existing question image saved.' : 'No question image selected.'
            );
            setStudioFlashcardTermImageState('', 'No term image selected.');
            setStudioFlashcardDefinitionImageState('', 'No definition image selected.');
            if (elements.createFlashcardTerm) elements.createFlashcardTerm.value = '';
            if (elements.createFlashcardDefinition) elements.createFlashcardDefinition.value = '';
        }

        renderStudioQuestionList();
        updateCreateQuizModeUI();
        if (!suppressStatus) {
            const statusLabel = state.auth.editingQuizType === 'flashcard' ? 'Flashcard' : (state.auth.editingQuizType === 'hierarchy' ? 'Hierarchy question' : (state.auth.editingQuizType === 'classify' ? 'Classify question' : 'Question'));
            setCreatorStatus(`${statusLabel} loaded into the editor.`, 'success');
        }
    }

    function beginStudioNewQuestion(insertAfterQuestionId = null) {
        if (!state.auth.editingQuizId) {
            setCreatorStatus('Create a quiz first, then you can add more questions to it.', 'error');
            return;
        }

        const validInsertAfterQuestionId = insertAfterQuestionId && state.auth.studioQuizQuestions.some(question => question.id === insertAfterQuestionId)
            ? insertAfterQuestionId
            : null;

        clearStudioQuestionInputs({ keepPendingInsert: !!validInsertAfterQuestionId });
        state.auth.pendingInsertAfterQuestionId = validInsertAfterQuestionId;
        renderStudioQuestionList();
        updateCreateQuizModeUI();
        setQuizStudioSection('editor');
        const nextItemLabel = getStudioCurrentQuizType() === 'flashcard' ? 'flashcard' : (getStudioCurrentQuizType() === 'hierarchy' ? 'hierarchy question' : (getStudioCurrentQuizType() === 'classify' ? 'classify question' : 'question'));
        if (validInsertAfterQuestionId) {
            setCreatorStatus(`Ready to insert a new ${nextItemLabel} between existing items. Fill in the fields below and save.`, 'success');
        } else {
            setCreatorStatus(`Ready to add a new ${nextItemLabel} to this quiz. Fill in the fields below and save.`, 'success');
        }
    }

    async function reorderStudioQuizQuestionIds(orderedQuestionIds) {
        if (!state.auth.client || !Array.isArray(orderedQuestionIds) || !orderedQuestionIds.length) return;

        const results = await Promise.all(
            orderedQuestionIds.map((questionId, index) => state.auth.client
                .from('questions')
                .update({ sort_order: index })
                .eq('id', questionId))
        );

        for (const result of results) {
            if (result.error) throw result.error;
        }
    }

    async function applyPendingStudioInsertOrder(quizId, newQuestionId) {
        const insertAfterQuestionId = state.auth.pendingInsertAfterQuestionId;
        state.auth.pendingInsertAfterQuestionId = null;

        if (!quizId || !newQuestionId || !insertAfterQuestionId) return;

        const existingIds = state.auth.studioQuizQuestions.map(question => question.id);
        const insertAfterIndex = existingIds.indexOf(insertAfterQuestionId);
        if (insertAfterIndex === -1) return;

        const orderedQuestionIds = [...existingIds];
        orderedQuestionIds.splice(insertAfterIndex + 1, 0, newQuestionId);
        await reorderStudioQuizQuestionIds(orderedQuestionIds);
    }

    async function handleDeleteStudioQuestion() {
        if (!state.auth.client || !state.auth.editingQuizId || !state.auth.editingQuestionId) {
            setCreatorStatus('Select a saved question first.', 'error');
            return;
        }

        if (!confirm('Delete this question from the quiz?')) {
            return;
        }

        const deletedQuestionId = state.auth.editingQuestionId;
        const currentIndex = state.auth.studioQuizQuestions.findIndex(question => question.id === deletedQuestionId);

        const { error } = await state.auth.client
            .from('questions')
            .delete()
            .eq('id', deletedQuestionId);

        if (error) throw error;

        await loadStudioQuestionListForQuiz(state.auth.editingQuizId);
        await refreshStudioManagementData();
        await refreshQuizCatalog({ selectQuizId: `sb:${state.auth.editingQuizId}`, loadSelectedQuiz: true, clearIfMissing: true });

        const nextQuestion = state.auth.studioQuizQuestions[currentIndex] || state.auth.studioQuizQuestions[currentIndex - 1] || null;
        if (nextQuestion) {
            await loadStudioQuestionIntoEditor(nextQuestion.id, { suppressStatus: true });
            setCreatorStatus('Question deleted.', 'success');
            return;
        }

        clearStudioQuestionInputs();
        setCreatorStatus('Question deleted. This quiz currently has no questions.', 'success');
    }

    async function handleMoveStudioQuestion(direction) {
        if (!state.auth.client || !state.auth.editingQuizId || !state.auth.editingQuestionId) {
            setCreatorStatus('Select a saved question first.', 'error');
            return;
        }

        const rows = state.auth.studioQuizQuestions;
        const currentIndex = rows.findIndex(question => question.id === state.auth.editingQuestionId);
        if (currentIndex === -1) {
            setCreatorStatus('Could not find the selected question.', 'error');
            return;
        }

        const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (swapIndex < 0 || swapIndex >= rows.length) {
            setCreatorStatus(direction === 'up' ? 'That question is already first.' : 'That question is already last.', 'error');
            return;
        }

        const currentRow = rows[currentIndex];
        const otherRow = rows[swapIndex];

        const updates = [
            state.auth.client.from('questions').update({ sort_order: otherRow.sort_order }).eq('id', currentRow.id),
            state.auth.client.from('questions').update({ sort_order: currentRow.sort_order }).eq('id', otherRow.id)
        ];

        const [currentUpdate, otherUpdate] = await Promise.all(updates);
        if (currentUpdate.error) throw currentUpdate.error;
        if (otherUpdate.error) throw otherUpdate.error;

        state.auth.pendingInsertAfterQuestionId = null;
        await loadStudioQuestionListForQuiz(state.auth.editingQuizId);
        await refreshStudioManagementData();
        await refreshQuizCatalog({ selectQuizId: `sb:${state.auth.editingQuizId}`, loadSelectedQuiz: true });
        renderStudioQuestionList();
        setCreatorStatus(direction === 'up' ? 'Question moved up.' : 'Question moved down.', 'success');
    }

    async function loadMultipleChoiceDetailsByQuestionIds(questionIds) {
        if (!state.auth.client || !Array.isArray(questionIds) || !questionIds.length) {
            return [];
        }

        const baseSelect = 'question_id, correct_answer, correct_explanation_html, option_1_text, option_1_explanation_html, option_2_text, option_2_explanation_html, option_3_text, option_3_explanation_html, option_4_text, option_4_explanation_html';

        const primary = await state.auth.client
            .from('multiple_choice_questions')
            .select(`${baseSelect}, options_json`)
            .in('question_id', questionIds);

        if (!primary.error) {
            return primary.data || [];
        }

        const missingColumn = /options_json/i.test(primary.error.message || '') || /options_json/i.test(primary.error.details || '');
        if (!missingColumn) {
            throw primary.error;
        }

        const fallback = await state.auth.client
            .from('multiple_choice_questions')
            .select(baseSelect)
            .in('question_id', questionIds);

        if (fallback.error) throw fallback.error;
        return fallback.data || [];
    }

    async function loadMultipleChoiceDetailByQuestionId(questionId) {
        const rows = await loadMultipleChoiceDetailsByQuestionIds([questionId]);
        return rows[0] || null;
    }

    async function loadFlashcardDetailsByQuestionIds(questionIds) {
        if (!state.auth.client || !Array.isArray(questionIds) || !questionIds.length) {
            return [];
        }

        const { data, error } = await state.auth.client
            .from('flashcard_questions')
            .select('question_id, term_html, definition_html, term_plain, definition_plain, term_image_url, definition_image_url')
            .in('question_id', questionIds);

        if (error) throw error;
        return data || [];
    }

    async function loadFlashcardDetailByQuestionId(questionId) {
        const rows = await loadFlashcardDetailsByQuestionIds([questionId]);
        return rows[0] || null;
    }

    async function loadHierarchyDetailsByQuestionIds(questionIds) {
        if (!state.auth.client || !Array.isArray(questionIds) || !questionIds.length) {
            return [];
        }

        const { data, error } = await state.auth.client
            .from('hierarchy_questions')
            .select('question_id, item_1_text, item_2_text, item_3_text, item_4_text, item_5_text, item_6_text, item_7_text, item_8_text, item_9_text, item_10_text, correct_order_json')
            .in('question_id', questionIds);

        if (error) throw error;
        return data || [];
    }

    async function loadHierarchyDetailByQuestionId(questionId) {
        const rows = await loadHierarchyDetailsByQuestionIds([questionId]);
        return rows[0] || null;
    }

    async function loadClassifyDetailsByQuestionIds(questionIds) {
        if (!state.auth.client || !Array.isArray(questionIds) || !questionIds.length) {
            return [];
        }

        const { data, error } = await state.auth.client
            .from('classify_questions')
            .select('question_id, items_json, classifications_json')
            .in('question_id', questionIds);

        if (error) throw error;
        return data || [];
    }

    async function loadClassifyDetailByQuestionId(questionId) {
        const rows = await loadClassifyDetailsByQuestionIds([questionId]);
        return rows[0] || null;
    }

    function setQuizStudioSection(sectionName = 'folders') {
        const nextSection = ['folders', 'manage', 'import', 'editor'].includes(sectionName)
            ? sectionName
            : 'folders';

        state.auth.currentStudioSection = nextSection;

        elements.quizStudioSections.forEach(section => {
            const isActive = section.dataset.studioSection === nextSection;
            section.classList.toggle('hidden', !isActive);
            section.classList.toggle('is-active', isActive);
        });

        elements.quizStudioSectionButtons.forEach(button => {
            const isActive = button.dataset.studioSectionTarget === nextSection;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    function updateCreatorUI() {
        const configured = state.auth.configured;
        const signedIn = !!state.auth.user;
        const creatorEnabled = configured && signedIn;

        [
            elements.createFolderName,
            elements.createFolderBtn,
            elements.importSourceFolderSelect,
            elements.importSourceQuizSelect,
            elements.importTargetFolderSelect,
            elements.importSourceQuizBtn,
            elements.importEntireFolderSourceSelect,
            elements.importEntireFolderTargetSelect,
            elements.importSourceFolderBtn,
            elements.createQuizFolderSelect,
            elements.createQuizName,
            elements.createQuizTypeSelect,
            elements.studioAddQuestionBtn,
            elements.studioDuplicateQuestionBtn,
            elements.studioDeleteQuestionBtn,
            elements.studioMoveQuestionUpBtn,
            elements.studioMoveQuestionDownBtn,
            elements.createQuestionPrompt,
            elements.createQuestionImageFile,
            elements.createQuestionImageClearBtn,
            elements.addHierarchyItemBtn,
            elements.removeHierarchyItemBtn,
            elements.addClassifyCategoryBtn,
            elements.removeClassifyCategoryBtn,
            elements.addClassifyItemBtn,
            elements.removeClassifyItemBtn,
            elements.createFlashcardTerm,
            elements.createFlashcardDefinition,
            elements.createFlashcardTermImageFile,
            elements.createFlashcardTermImageClearBtn,
            elements.createFlashcardDefinitionImageFile,
            elements.createFlashcardDefinitionImageClearBtn,
            elements.createLearningResources,
            elements.createLearningResourcesImageFile,
            elements.createLearningResourcesImageClearBtn,
            elements.addOptionFieldBtn,
            elements.removeOptionFieldBtn,
            elements.createCorrectOptionSelect,
            elements.createCorrectExplanation,
            elements.createQuizBtn,
            elements.createQuizCancelEditBtn,
            elements.openQuizStudioBtn
        ].forEach(el => {
            if (!el) return;
            el.disabled = !creatorEnabled && el !== elements.openQuizStudioBtn;
        });

        if (elements.createOptionFieldsContainer) {
            elements.createOptionFieldsContainer.querySelectorAll('input, textarea').forEach(el => {
                el.disabled = !creatorEnabled;
            });
        }

        if (elements.createHierarchyFieldsContainer) {
            elements.createHierarchyFieldsContainer.querySelectorAll('input, select').forEach(el => {
                el.disabled = !creatorEnabled;
            });
        }

        if (elements.createClassifyCategoriesContainer) {
            elements.createClassifyCategoriesContainer.querySelectorAll('input, button').forEach(el => {
                el.disabled = !creatorEnabled;
            });
        }

        if (elements.createClassifyItemsContainer) {
            elements.createClassifyItemsContainer.querySelectorAll('input, select, button').forEach(el => {
                el.disabled = !creatorEnabled;
            });
        }

        if (elements.openQuizStudioBtn) {
            elements.openQuizStudioBtn.disabled = !creatorEnabled;
        }

        if (!configured) {
            setCreatorStatus('Supabase is not configured yet. Add your URL and publishable key in index.html first.', 'error');
        } else if (!signedIn) {
            setCreatorStatus('Sign in to create and manage Supabase quiz content.');
        } else {
            setCreatorStatus('Signed in. Quiz Studio is ready.', 'success');
        }

        updateCreateQuizModeUI();
        renderFolderManagementList();
        renderQuizManagementList();
        renderGoogleSheetsImportControls();
        renderStudioQuestionList();
    }

    function clearCreatorInputs(options = {}) {
        const keepFolderSelection = !!options.keepFolderSelection;
        if (elements.createFolderName) elements.createFolderName.value = '';
        if (elements.createQuizName) elements.createQuizName.value = '';
        if (!keepFolderSelection && elements.createQuizFolderSelect) {
            elements.createQuizFolderSelect.value = '';
        }

        state.auth.editingQuizId = null;
        state.auth.editingQuizType = normalizeSheetText(elements.createQuizTypeSelect?.value || 'multiple_choice') || 'multiple_choice';
        if (elements.createQuizTypeSelect) {
            elements.createQuizTypeSelect.value = state.auth.editingQuizType;
        }
        state.auth.studioQuizQuestions = [];
        clearStudioQuestionInputs();
        renderStudioQuestionList();
        updateCreateQuizModeUI();
    }

    async function getNextSortOrderForFolder() {
        if (!state.auth.client) return 0;

        const { data, error } = await state.auth.client
            .from('folders')
            .select('sort_order')
            .order('sort_order', { ascending: false })
            .limit(1);

        if (error) throw error;
        return Number(data?.[0]?.sort_order ?? -1) + 1;
    }

    async function getNextQuizSortOrder(folderId) {
        if (!state.auth.client) return 0;

        let query = state.auth.client
            .from('quizzes')
            .select('sort_order')
            .order('sort_order', { ascending: false })
            .limit(1);

        query = folderId ? query.eq('folder_id', folderId) : query.is('folder_id', null);

        const { data, error } = await query;
        if (error) throw error;
        return Number(data?.[0]?.sort_order ?? -1) + 1;
    }

    function getUserDisplayName() {
        const profileName = normalizeSheetText(state.auth.profile?.display_name);
        if (profileName) return profileName;

        const metadataName = normalizeSheetText(state.auth.user?.user_metadata?.display_name);
        if (metadataName) return metadataName;

        const email = normalizeSheetText(state.auth.user?.email);
        return email || 'Signed in';
    }

    function updateAuthUI() {
        const configured = state.auth.configured;
        const signedIn = !!state.auth.user;

        if (elements.authSessionSummary) {
            elements.authSessionSummary.textContent = signedIn
                ? `Signed in as ${getUserDisplayName()}`
                : 'Signed out';
        }

        if (elements.authBtn) {
            elements.authBtn.title = signedIn ? `Account (${getUserDisplayName()})` : 'Account';
            elements.authBtn.setAttribute('aria-label', elements.authBtn.title);
        }

        if (!configured) {
            setAuthStatus('Paste your Supabase URL and publishable key into index.html, then reload.', 'error');
        } else if (signedIn) {
            setAuthStatus('Supabase connected. Session is active.', 'success');
        } else if (state.auth.initialized) {
            setAuthStatus('Supabase connected. Sign in or create an account to continue setup.');
        }

        if (elements.authDisplayName && signedIn && !elements.authDisplayName.value) {
            elements.authDisplayName.value = getUserDisplayName();
        }

        [elements.authEmail, elements.authPassword, elements.authDisplayName, elements.authSignInBtn, elements.authSignUpBtn].forEach(el => {
            if (!el) return;
            el.disabled = !configured;
        });

        if (elements.authSignOutBtn) {
            elements.authSignOutBtn.disabled = !configured || !signedIn;
        }

        updateCreatorUI();
    }

    function openAuthPopup() {
        if (!elements.authPopup) return;
        closeSettingsPopup();
        elements.authPopup.classList.remove('hidden');
        elements.authPopup.setAttribute('aria-hidden', 'false');
        if (elements.authBtn) {
            elements.authBtn.classList.add('active');
        }
        updateAuthUI();
    }

    function closeAuthPopup() {
        if (!elements.authPopup) return;
        elements.authPopup.classList.add('hidden');
        elements.authPopup.setAttribute('aria-hidden', 'true');
        if (elements.authBtn) {
            elements.authBtn.classList.remove('active');
        }
    }

    function toggleAuthPopup() {
        if (!elements.authPopup) return;
        if (elements.authPopup.classList.contains('hidden')) {
            openAuthPopup();
        } else {
            closeAuthPopup();
        }
    }

    function openQuizStudioPage(sectionName = state.auth.currentStudioSection || 'folders') {
        if (!elements.quizStudioPage) return;
        closeAuthPopup();
        elements.quizStudioPage.classList.remove('hidden');
        elements.quizStudioPage.setAttribute('aria-hidden', 'false');
        state.auth.quizStudioOpen = true;
        setQuizStudioSection(sectionName);
        syncBodyScrollLock();
        updateCreatorUI();
    }

    function closeQuizStudioPage() {
        if (!elements.quizStudioPage) return;
        elements.quizStudioPage.classList.add('hidden');
        elements.quizStudioPage.setAttribute('aria-hidden', 'true');
        state.auth.quizStudioOpen = false;
        syncBodyScrollLock();
    }

    async function loadAuthProfile(userId) {
        if (!state.auth.client || !userId) {
            state.auth.profile = null;
            return null;
        }

        const { data, error } = await state.auth.client
            .from('profiles')
            .select('id, email, display_name')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.error(error);
            state.auth.profile = null;
            return null;
        }

        state.auth.profile = data || null;
        return data || null;
    }

    async function refreshQuizCatalog(options = {}) {
        const previousQuizId = elements.quizSelector?.value || '';
        const targetQuizId = options.selectQuizId || previousQuizId;

        await populateFolderDropdown();

        const targetQuiz = state.quizListCache.find(q => q.id === targetQuizId) || null;
        if (!targetQuiz) {
            if (options.clearIfMissing) {
                resetQuizSelector();
                clearActiveQuizSelection();
            }
            return null;
        }

        if (elements.folderSelector) {
            elements.folderSelector.value = targetQuiz.folder;
        }
        populateQuizDropdown(targetQuiz.folder);
        if (elements.quizSelector) {
            elements.quizSelector.value = targetQuiz.id;
        }

        if (options.loadSelectedQuiz) {
            await loadSelectedQuiz(targetQuiz.id);
        }

        return targetQuiz;
    }

    async function syncAuthFromSession(session) {
        state.auth.session = session || null;
        state.auth.user = session?.user || null;

        if (state.auth.user?.id) {
            await loadAuthProfile(state.auth.user.id);
            await refreshStudioManagementData();
        } else {
            state.auth.profile = null;
            state.auth.supabaseFolders = [];
            state.auth.managedQuizzes = [];
            state.auth.currentStudioSection = 'folders';
            clearCreatorInputs();
            populateCreatorFolderSelect();
            renderFolderManagementList();
            renderQuizManagementList();
        }

        updateAuthUI();
        await refreshQuizCatalog();

        if (state.sourceQuestions.length) {
            if (state.auth.user?.id) {
                await hydrateStarredQuestionState(state.sourceQuestions);
            } else {
                state.sourceQuestions.forEach(question => { question.isStarred = false; });
            }
            applyFilteredQuestionsToSession({ resetSession: true });
        }
    }

    async function bootstrapSupabase() {
        const { url, publishableKey, isConfigured } = getSupabaseConfig();
        state.auth.configured = isConfigured;

        if (!isConfigured) {
            updateAuthUI();
            return;
        }

        const factory = getSupabaseClientFactory();
        if (!factory) {
            setAuthStatus('Supabase client library failed to load. Check your connection and reload.', 'error');
            updateAuthUI();
            return;
        }

        try {
            state.auth.client = factory(url, publishableKey);
            state.auth.initialized = true;

            state.auth.client.auth.onAuthStateChange((_event, session) => {
                syncAuthFromSession(session).catch(err => console.error(err));
            });

            const { data, error } = await state.auth.client.auth.getSession();
            if (error) {
                throw error;
            }

            await syncAuthFromSession(data.session);
        } catch (error) {
            console.error(error);
            state.auth.client = null;
            state.auth.initialized = false;
            setAuthStatus('Failed to initialize Supabase. Double-check your URL and publishable key.', 'error');
            updateAuthUI();
        }
    }

    function getAuthFormValues() {
        return {
            email: normalizeSheetText(elements.authEmail?.value).toLowerCase(),
            password: String(elements.authPassword?.value || ''),
            displayName: normalizeSheetText(elements.authDisplayName?.value)
        };
    }

    async function handleAuthSignUp() {
        if (!state.auth.client) return;

        const { email, password, displayName } = getAuthFormValues();
        if (!email || !password) {
            setAuthStatus('Enter an email and password to create an account.', 'error');
            return;
        }

        setAuthStatus('Creating account...');

        const { data, error } = await state.auth.client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: displayName
                }
            }
        });

        if (error) {
            setAuthStatus(error.message || 'Could not create the account.', 'error');
            return;
        }

        if (data.session) {
            setAuthStatus('Account created and signed in.', 'success');
        } else {
            setAuthStatus('Account created. You can now sign in.', 'success');
        }
        updateAuthUI();
    }

    async function handleAuthSignIn() {
        if (!state.auth.client) return;

        const { email, password } = getAuthFormValues();
        if (!email || !password) {
            setAuthStatus('Enter your email and password to sign in.', 'error');
            return;
        }

        setAuthStatus('Signing in...');

        const { error } = await state.auth.client.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            setAuthStatus(error.message || 'Could not sign in.', 'error');
            return;
        }

        setAuthStatus('Signed in successfully.', 'success');
        if (elements.authPassword) {
            elements.authPassword.value = '';
        }
    }

    async function handleAuthSignOut() {
        if (!state.auth.client) return;

        setAuthStatus('Signing out...');
        const { error } = await state.auth.client.auth.signOut();

        if (error) {
            setAuthStatus(error.message || 'Could not sign out.', 'error');
            return;
        }

        state.auth.profile = null;
        closeQuizStudioPage();
        closeAuthPopup();
        setAuthStatus('Signed out.', 'success');
    }

    async function handleStudioFileInput(fileInput, type) {
        const file = fileInput?.files?.[0];
        if (!file) {
            if (type === 'question') {
                setStudioQuestionImageState();
            } else if (type === 'term') {
                setStudioFlashcardTermImageState();
            } else if (type === 'definition') {
                setStudioFlashcardDefinitionImageState();
            } else {
                setStudioLearningResourcesImageState();
            }
            return;
        }

        const dataUrl = await readFileAsDataUrl(file);

        if (type === 'question') {
            setStudioQuestionImageState(dataUrl, `Selected: ${file.name}`);
        } else if (type === 'term') {
            setStudioFlashcardTermImageState(dataUrl, `Selected: ${file.name}`);
        } else if (type === 'definition') {
            setStudioFlashcardDefinitionImageState(dataUrl, `Selected: ${file.name}`);
        } else {
            setStudioLearningResourcesImageState(dataUrl, `Selected: ${file.name}`);
        }
    }

    async function handleCreateFolder() {
        if (!state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before creating a folder.', 'error');
            return;
        }

        const folderName = normalizeSheetText(elements.createFolderName?.value);
        if (!folderName) {
            setCreatorStatus('Enter a folder name first.', 'error');
            return;
        }

        setCreatorStatus('Creating folder...');

        try {
            const sortOrder = await getNextSortOrderForFolder();
            const { error } = await state.auth.client
                .from('folders')
                .insert({
                    user_id: state.auth.user.id,
                    name: folderName,
                    sort_order: sortOrder
                });

            if (error) throw error;

            await refreshStudioManagementData();
            await refreshQuizCatalog();
            if (elements.createQuizFolderSelect) {
                const createdFolder = state.auth.supabaseFolders.find(folder => folder.name === folderName);
                if (createdFolder) {
                    elements.createQuizFolderSelect.value = createdFolder.id;
                }
            }
            if (elements.createFolderName) {
                elements.createFolderName.value = '';
            }
            setCreatorStatus('Folder created.', 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not create the folder.', 'error');
        }
    }

    async function handleSaveMultipleChoiceQuiz() {
        if (!state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before creating or editing a quiz.', 'error');
            return;
        }
        const quizName = normalizeSheetText(elements.createQuizName?.value);
        const prompt = normalizeSheetText(elements.createQuestionPrompt?.value);
        const learningResources = normalizeSheetText(elements.createLearningResources?.value);
        const optionDrafts = getStudioOptionDraftsFromDOM();
        const options = optionDrafts.map(draft => draft.text);
        const explanations = optionDrafts.map(draft => draft.explanation);
        const folderId = normalizeSheetText(elements.createQuizFolderSelect?.value) || null;
        const maxOptionIndex = Math.max(0, options.length - 1);
        const correctIndex = Math.max(0, Math.min(maxOptionIndex, Number(elements.createCorrectOptionSelect?.value || '1') - 1));
        const correctExplanation = normalizeSheetText(elements.createCorrectExplanation?.value);
        const correctAnswer = options[correctIndex];
        if (!quizName) return void setCreatorStatus('Enter a quiz name first.', 'error');
        if (!prompt) return void setCreatorStatus('Enter a question prompt.', 'error');
        if (options.length < 2) return void setCreatorStatus('Add at least 2 answer options.', 'error');
        if (options.some(option => !option)) return void setCreatorStatus('Fill in every answer option before saving.', 'error');
        if (new Set(options).size !== options.length) return void setCreatorStatus('All answer options must be unique.', 'error');
        if (!correctAnswer) return void setCreatorStatus('Choose which option is correct.', 'error');
        const isEditingQuiz = !!state.auth.editingQuizId;
        const isEditingQuestion = !!state.auth.editingQuestionId;
        setCreatorStatus(!isEditingQuiz ? 'Creating quiz...' : (isEditingQuestion ? 'Saving question changes...' : 'Adding question to quiz...'));
        try {
            let quizId = state.auth.editingQuizId;
            let questionId = state.auth.editingQuestionId;
            if (quizId) {
                const { error } = await state.auth.client.from('quizzes').update({ folder_id: folderId, name: quizName }).eq('id', quizId);
                if (error) throw error;
            } else {
                const quizSortOrder = await getNextQuizSortOrder(folderId);
                const { data, error } = await state.auth.client.from('quizzes').insert({ user_id: state.auth.user.id, folder_id: folderId, name: quizName, description: '', sort_order: quizSortOrder, is_archived: false }).select('id').single();
                if (error) throw error;
                quizId = data.id;
            }
            if (!questionId) {
                const questionSortOrder = await getNextQuestionSortOrder(quizId);
                const { data, error } = await state.auth.client.from('questions').insert({ quiz_id: quizId, question_type: 'multiple_choice', prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, image_url: state.auth.studioQuestionImageDataUrl || '', learning_resources_html: buildStoredHtmlFromPlain(learningResources), learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || '', sort_order: questionSortOrder }).select('id').single();
                if (error) throw error;
                questionId = data.id;
            } else {
                const { error } = await state.auth.client.from('questions').update({ prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, image_url: state.auth.studioQuestionImageDataUrl || '', learning_resources_html: buildStoredHtmlFromPlain(learningResources), learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || '' }).eq('id', questionId);
                if (error) throw error;
                state.auth.pendingInsertAfterQuestionId = null;
            }
            const optionPayload = optionDrafts.map(draft => ({ text: draft.text, explanation_html: buildStoredHtmlFromPlain(draft.explanation) }));
            const detailPayload = { question_id: questionId, correct_answer: correctAnswer, correct_explanation_html: buildStoredHtmlFromPlain(correctExplanation), options_json: optionPayload, option_1_text: options[0] || '', option_1_explanation_html: buildStoredHtmlFromPlain(explanations[0] || ''), option_2_text: options[1] || '', option_2_explanation_html: buildStoredHtmlFromPlain(explanations[1] || ''), option_3_text: options[2] || '', option_3_explanation_html: buildStoredHtmlFromPlain(explanations[2] || ''), option_4_text: options[3] || '', option_4_explanation_html: buildStoredHtmlFromPlain(explanations[3] || '') };
            const { error: detailError } = await state.auth.client.from('multiple_choice_questions').upsert(detailPayload, { onConflict: 'question_id' });
            if (detailError) {
                const missingColumn = /options_json/i.test(detailError.message || '') || /options_json/i.test(detailError.details || '');
                if (missingColumn) throw new Error('Run the Phase 6 Supabase migration before saving quizzes with flexible option counts.');
                throw detailError;
            }
            if (!isEditingQuestion) {
                await applyPendingStudioInsertOrder(quizId, questionId);
            }
            state.auth.editingQuizType = 'multiple_choice';
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${quizId}`, loadSelectedQuiz: true });
            await loadQuizIntoEditor(quizId, questionId);
            setCreatorStatus(!isEditingQuiz ? 'Quiz created and first question saved.' : (isEditingQuestion ? 'Question updated.' : 'New question added to the quiz.'), 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not save the quiz.', 'error');
        }
    }

    async function handleSaveFlashcardQuiz() {
        if (!state.auth.client || !state.auth.user?.id) return void setCreatorStatus('Sign in before creating or editing a quiz.', 'error');
        const quizName = normalizeSheetText(elements.createQuizName?.value);
        const folderId = normalizeSheetText(elements.createQuizFolderSelect?.value) || null;
        const term = normalizeSheetText(elements.createFlashcardTerm?.value);
        const definition = normalizeSheetText(elements.createFlashcardDefinition?.value);
        const learningResources = normalizeSheetText(elements.createLearningResources?.value);
        if (!quizName) return void setCreatorStatus('Enter a quiz name first.', 'error');
        if (!term) return void setCreatorStatus('Enter a flashcard term first.', 'error');
        if (!definition) return void setCreatorStatus('Enter a flashcard definition first.', 'error');
        const isEditingQuiz = !!state.auth.editingQuizId;
        const isEditingQuestion = !!state.auth.editingQuestionId;
        setCreatorStatus(!isEditingQuiz ? 'Creating flashcard quiz...' : (isEditingQuestion ? 'Saving flashcard changes...' : 'Adding flashcard to quiz...'));
        try {
            let quizId = state.auth.editingQuizId;
            let questionId = state.auth.editingQuestionId;
            if (quizId) {
                const { error } = await state.auth.client.from('quizzes').update({ folder_id: folderId, name: quizName }).eq('id', quizId);
                if (error) throw error;
            } else {
                const quizSortOrder = await getNextQuizSortOrder(folderId);
                const { data, error } = await state.auth.client.from('quizzes').insert({ user_id: state.auth.user.id, folder_id: folderId, name: quizName, description: '', sort_order: quizSortOrder, is_archived: false }).select('id').single();
                if (error) throw error;
                quizId = data.id;
            }
            if (!questionId) {
                const questionSortOrder = await getNextQuestionSortOrder(quizId);
                const { data, error } = await state.auth.client.from('questions').insert({ quiz_id: quizId, question_type: 'flashcard', prompt_html: buildStoredHtmlFromPlain(term), prompt_plain: term, image_url: '', learning_resources_html: buildStoredHtmlFromPlain(learningResources), learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || '', sort_order: questionSortOrder }).select('id').single();
                if (error) throw error;
                questionId = data.id;
            } else {
                const { error } = await state.auth.client.from('questions').update({ prompt_html: buildStoredHtmlFromPlain(term), prompt_plain: term, image_url: '', learning_resources_html: buildStoredHtmlFromPlain(learningResources), learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || '' }).eq('id', questionId);
                if (error) throw error;
                state.auth.pendingInsertAfterQuestionId = null;
            }
            const detailPayload = { question_id: questionId, term_html: buildStoredHtmlFromPlain(term), definition_html: buildStoredHtmlFromPlain(definition), term_plain: term, definition_plain: definition, term_image_url: state.auth.studioFlashcardTermImageDataUrl || '', definition_image_url: state.auth.studioFlashcardDefinitionImageDataUrl || '' };
            const { error: detailError } = await state.auth.client.from('flashcard_questions').upsert(detailPayload, { onConflict: 'question_id' });
            if (detailError) throw detailError;
            if (!isEditingQuestion) {
                await applyPendingStudioInsertOrder(quizId, questionId);
            }
            state.auth.editingQuizType = 'flashcard';
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${quizId}`, loadSelectedQuiz: true });
            await loadQuizIntoEditor(quizId, questionId);
            setCreatorStatus(!isEditingQuiz ? 'Flashcard quiz created and first card saved.' : (isEditingQuestion ? 'Flashcard updated.' : 'New flashcard added to the quiz.'), 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not save the flashcard quiz.', 'error');
        }
    }

    async function handleSaveHierarchyQuiz() {
        if (!state.auth.client || !state.auth.user?.id) return void setCreatorStatus('Sign in before creating or editing a quiz.', 'error');
        const quizName = normalizeSheetText(elements.createQuizName?.value);
        const folderId = normalizeSheetText(elements.createQuizFolderSelect?.value) || null;
        const prompt = normalizeSheetText(elements.createQuestionPrompt?.value);
        const learningResources = normalizeSheetText(elements.createLearningResources?.value);
        const hierarchyDrafts = getStudioHierarchyDraftsFromDOM();
        const itemTexts = hierarchyDrafts.map(draft => draft.text).filter(Boolean);
        if (!quizName) return void setCreatorStatus('Enter a quiz name first.', 'error');
        if (!prompt) return void setCreatorStatus('Enter a hierarchy prompt first.', 'error');
        if (itemTexts.length < 2) return void setCreatorStatus('Hierarchy quizzes need at least 2 filled items.', 'error');
        if (new Set(itemTexts).size !== itemTexts.length) return void setCreatorStatus('Hierarchy item texts must be unique.', 'error');
        const positions = hierarchyDrafts.map(draft => Number(draft.position));
        if (positions.some(position => !Number.isInteger(position) || position < 1 || position > hierarchyDrafts.length)) return void setCreatorStatus('Each hierarchy item needs a valid position.', 'error');
        if (new Set(positions).size !== positions.length) return void setCreatorStatus('Hierarchy positions must be unique.', 'error');
        const isEditingQuiz = !!state.auth.editingQuizId;
        const isEditingQuestion = !!state.auth.editingQuestionId;
        setCreatorStatus(!isEditingQuiz ? 'Creating hierarchy quiz...' : (isEditingQuestion ? 'Saving hierarchy changes...' : 'Adding hierarchy question to quiz...'));
        try {
            let quizId = state.auth.editingQuizId;
            let questionId = state.auth.editingQuestionId;
            if (quizId) {
                const { error } = await state.auth.client.from('quizzes').update({ folder_id: folderId, name: quizName }).eq('id', quizId);
                if (error) throw error;
            } else {
                const quizSortOrder = await getNextQuizSortOrder(folderId);
                const { data, error } = await state.auth.client.from('quizzes').insert({ user_id: state.auth.user.id, folder_id: folderId, name: quizName, description: '', sort_order: quizSortOrder, is_archived: false }).select('id').single();
                if (error) throw error;
                quizId = data.id;
            }
            if (!questionId) {
                const questionSortOrder = await getNextQuestionSortOrder(quizId);
                const { data, error } = await state.auth.client.from('questions').insert({ quiz_id: quizId, question_type: 'hierarchy', prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, image_url: state.auth.studioQuestionImageDataUrl || '', learning_resources_html: buildStoredHtmlFromPlain(learningResources), learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || '', sort_order: questionSortOrder }).select('id').single();
                if (error) throw error;
                questionId = data.id;
            } else {
                const { error } = await state.auth.client.from('questions').update({ prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, image_url: state.auth.studioQuestionImageDataUrl || '', learning_resources_html: buildStoredHtmlFromPlain(learningResources), learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || '', question_type: 'hierarchy' }).eq('id', questionId);
                if (error) throw error;
                state.auth.pendingInsertAfterQuestionId = null;
            }
            const filledDrafts = hierarchyDrafts.filter(draft => draft.text);
            const correctOrder = filledDrafts
                .map((draft, index) => ({ position: Number(draft.position), originalIndex: index + 1 }))
                .sort((a, b) => a.position - b.position)
                .map(item => item.originalIndex);
            const detailPayload = {
                question_id: questionId,
                correct_order_json: correctOrder,
                item_1_text: filledDrafts[0]?.text || '',
                item_2_text: filledDrafts[1]?.text || '',
                item_3_text: filledDrafts[2]?.text || '',
                item_4_text: filledDrafts[3]?.text || '',
                item_5_text: filledDrafts[4]?.text || '',
                item_6_text: filledDrafts[5]?.text || '',
                item_7_text: filledDrafts[6]?.text || '',
                item_8_text: filledDrafts[7]?.text || '',
                item_9_text: filledDrafts[8]?.text || '',
                item_10_text: filledDrafts[9]?.text || ''
            };
            const { error: detailError } = await state.auth.client.from('hierarchy_questions').upsert(detailPayload, { onConflict: 'question_id' });
            if (detailError) throw detailError;
            if (!isEditingQuestion) {
                await applyPendingStudioInsertOrder(quizId, questionId);
            }
            state.auth.editingQuizType = 'hierarchy';
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${quizId}`, loadSelectedQuiz: true });
            await loadQuizIntoEditor(quizId, questionId);
            setCreatorStatus(!isEditingQuiz ? 'Hierarchy quiz created and first question saved.' : (isEditingQuestion ? 'Hierarchy question updated.' : 'New hierarchy question added to the quiz.'), 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not save the hierarchy quiz.', 'error');
        }
    }

    async function handleSaveClassifyQuiz() {
        if (!state.auth.client || !state.auth.user?.id) return void setCreatorStatus('Sign in before creating or editing a quiz.', 'error');
        const quizName = normalizeSheetText(elements.createQuizName?.value);
        const prompt = normalizeSheetText(elements.createQuestionPrompt?.value);
        const learningResources = normalizeSheetText(elements.createLearningResources?.value);
        const folderId = normalizeSheetText(elements.createQuizFolderSelect?.value) || null;
        const categories = getStudioClassifyCategoriesDraftsFromDOM();
        const items = getStudioClassifyItemsDraftsFromDOM(categories);
        const categoryLabels = categories.map(category => category.label);
        const itemTexts = items.map(item => item.text);
        if (!quizName) return void setCreatorStatus('Enter a quiz name first.', 'error');
        if (!prompt) return void setCreatorStatus('Enter a classify prompt first.', 'error');
        if (categories.some(category => !category.label && !category.imageUrl)) return void setCreatorStatus('Each category needs text, an image, or both before saving.', 'error');
        if (new Set(categoryLabels.filter(Boolean)).size !== categoryLabels.filter(Boolean).length) return void setCreatorStatus('Category text labels must be unique when used.', 'error');
        if (items.some(item => !item.text && !item.imageUrl)) return void setCreatorStatus('Each classify item needs text, an image, or both before saving.', 'error');
        if (new Set(itemTexts.filter(Boolean)).size !== itemTexts.filter(Boolean).length) return void setCreatorStatus('Classify item text labels must be unique when used.', 'error');
        if (items.some(item => !categories.some(category => category.id === item.categoryId))) return void setCreatorStatus('Each classify item needs a valid category.', 'error');
        const isEditingQuiz = !!state.auth.editingQuizId;
        const isEditingQuestion = !!state.auth.editingQuestionId;
        setCreatorStatus(!isEditingQuiz ? 'Creating classify quiz...' : (isEditingQuestion ? 'Saving classify changes...' : 'Adding classify question to quiz...'));
        try {
            let quizId = state.auth.editingQuizId;
            let questionId = state.auth.editingQuestionId;
            if (quizId) {
                const { error } = await state.auth.client.from('quizzes').update({ folder_id: folderId, name: quizName }).eq('id', quizId);
                if (error) throw error;
            } else {
                const quizSortOrder = await getNextQuizSortOrder(folderId);
                const { data, error } = await state.auth.client.from('quizzes').insert({ user_id: state.auth.user.id, folder_id: folderId, name: quizName, description: '', sort_order: quizSortOrder, is_archived: false }).select('id').single();
                if (error) throw error;
                quizId = data.id;
            }
            if (!questionId) {
                const questionSortOrder = await getNextQuestionSortOrder(quizId);
                const { data, error } = await state.auth.client.from('questions').insert({ quiz_id: quizId, question_type: 'classify', prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, image_url: state.auth.studioQuestionImageDataUrl || '', learning_resources_html: buildStoredHtmlFromPlain(learningResources), learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || '', sort_order: questionSortOrder }).select('id').single();
                if (error) throw error;
                questionId = data.id;
            } else {
                const { error } = await state.auth.client.from('questions').update({ prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, image_url: state.auth.studioQuestionImageDataUrl || '', learning_resources_html: buildStoredHtmlFromPlain(learningResources), learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || '', question_type: 'classify' }).eq('id', questionId);
                if (error) throw error;
                state.auth.pendingInsertAfterQuestionId = null;
            }
            const classificationsJson = categories.map((category, index) => ({ label: category.label, imageUrl: category.imageUrl || '', id: category.id }));
            const itemsJson = items.map((item, index) => ({ kind: item.imageUrl ? 'image' : 'text', raw: item.text || `classify_item_${index + 1}`, imageUrl: item.imageUrl || '', text: item.text, dragLabel: item.text || `Image item ${index + 1}`, ariaLabel: item.text ? `Classify item ${item.text}` : `Classify image item ${index + 1}`, correctClassificationId: item.categoryId }));
            const { error: detailError } = await state.auth.client.from('classify_questions').upsert({ question_id: questionId, items_json: itemsJson, classifications_json: classificationsJson }, { onConflict: 'question_id' });
            if (detailError) throw detailError;
            if (!isEditingQuestion) {
                await applyPendingStudioInsertOrder(quizId, questionId);
            }
            state.auth.editingQuizType = 'classify';
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${quizId}`, loadSelectedQuiz: true });
            await loadQuizIntoEditor(quizId, questionId);
            setCreatorStatus(!isEditingQuiz ? 'Classify quiz created and first question saved.' : (isEditingQuestion ? 'Classify question updated.' : 'New classify question added to the quiz.'), 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not save the classify quiz.', 'error');
        }
    }

    async function handleSaveStudioQuiz() {
        if (isStudioFlashcardMode()) return handleSaveFlashcardQuiz();
        if (isStudioHierarchyMode()) return handleSaveHierarchyQuiz();
        if (isStudioClassifyMode()) return handleSaveClassifyQuiz();
        return handleSaveMultipleChoiceQuiz();
    }

    async function handleRenameFolder(folderId, nextName) {
        const folderName = normalizeSheetText(nextName);
        if (!folderName) {
            setCreatorStatus('Folder names cannot be blank.', 'error');
            return;
        }

        try {
            const { error } = await state.auth.client
                .from('folders')
                .update({ name: folderName })
                .eq('id', folderId);

            if (error) throw error;

            await refreshStudioManagementData();
            await refreshQuizCatalog();
            setCreatorStatus('Folder updated.', 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not update the folder.', 'error');
        }
    }

    async function handleDeleteFolder(folderId) {
        if (!confirm('Delete this folder? Quizzes inside it will keep existing but move to no folder.')) {
            return;
        }

        try {
            const { error } = await state.auth.client
                .from('folders')
                .delete()
                .eq('id', folderId);

            if (error) throw error;

            await refreshStudioManagementData();
            await refreshQuizCatalog();
            setCreatorStatus('Folder deleted.', 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not delete the folder.', 'error');
        }
    }

    async function loadQuizIntoEditor(quizId, preferredQuestionId = null) {
        try {
            const managedQuiz = state.auth.managedQuizzes.find(quiz => quiz.id === quizId);
            if (!managedQuiz) {
                setCreatorStatus('Could not find that quiz.', 'error');
                return;
            }

            if (managedQuiz.quizType === 'mixed') {
                setCreatorStatus('Editing is currently limited to single-type Supabase quizzes.', 'error');
                return;
            }

            const { data: quizRow, error: quizError } = await state.auth.client
                .from('quizzes')
                .select('id, folder_id, name')
                .eq('id', quizId)
                .maybeSingle();

            if (quizError) throw quizError;
            if (!quizRow) {
                throw new Error('Could not load the selected quiz for editing.');
            }

            state.auth.editingQuizId = quizRow.id;
            state.auth.pendingInsertAfterQuestionId = null;
            state.auth.editingQuizType = managedQuiz.quizType || 'multiple_choice';
            if (elements.createQuizFolderSelect) elements.createQuizFolderSelect.value = quizRow.folder_id || '';
            if (elements.createQuizName) elements.createQuizName.value = normalizeSheetText(quizRow.name);
            if (elements.createQuizTypeSelect) elements.createQuizTypeSelect.value = state.auth.editingQuizType;

            const questionRows = await loadStudioQuestionListForQuiz(quizRow.id);
            const targetQuestionId = preferredQuestionId || questionRows[0]?.id || null;

            if (targetQuestionId) {
                await loadStudioQuestionIntoEditor(targetQuestionId, { suppressStatus: true });
            } else {
                clearStudioQuestionInputs();
            }

            updateCreateQuizModeUI();
            openQuizStudioPage('editor');
            const nextItemTypeLabel = state.auth.editingQuizType === 'flashcard' ? 'flashcard' : (state.auth.editingQuizType === 'hierarchy' ? 'hierarchy question' : (state.auth.editingQuizType === 'classify' ? 'classify question' : 'question'));
            setCreatorStatus(targetQuestionId ? 'Quiz loaded into the editor.' : `Quiz loaded. Add your first ${nextItemTypeLabel} below.`, 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not load the quiz editor.', 'error');
        }
    }


    async function handleSaveQuizMeta(quizId, nextName, nextFolderId) {
        const quizName = normalizeSheetText(nextName);
        const folderId = normalizeSheetText(nextFolderId) || null;
        if (!quizName) {
            setCreatorStatus('Quiz names cannot be blank.', 'error');
            return;
        }

        try {
            const { error } = await state.auth.client
                .from('quizzes')
                .update({ name: quizName, folder_id: folderId })
                .eq('id', quizId);

            if (error) throw error;

            if (state.auth.editingQuizId === quizId) {
                if (elements.createQuizName) elements.createQuizName.value = quizName;
                if (elements.createQuizFolderSelect) elements.createQuizFolderSelect.value = folderId || '';
            }

            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${quizId}`, loadSelectedQuiz: elements.quizSelector?.value === `sb:${quizId}` });
            setCreatorStatus('Quiz details updated.', 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not update the quiz.', 'error');
        }
    }

    async function duplicateQuestionRecord(sourceQuestionId, targetQuizId, targetSortOrder) {
        const { data: questionRow, error: questionError } = await state.auth.client
            .from('questions')
            .select('prompt_html, prompt_plain, image_url, learning_resources_html, learning_resources_image_url, question_type')
            .eq('id', sourceQuestionId)
            .maybeSingle();

        if (questionError) throw questionError;
        if (!questionRow) throw new Error('Could not load the source question.');

        const { data: insertedQuestion, error: insertQuestionError } = await state.auth.client
            .from('questions')
            .insert({
                quiz_id: targetQuizId,
                question_type: questionRow.question_type,
                prompt_html: questionRow.prompt_html || '',
                prompt_plain: questionRow.prompt_plain || '',
                image_url: questionRow.image_url || '',
                learning_resources_html: questionRow.learning_resources_html || '',
                learning_resources_image_url: questionRow.learning_resources_image_url || '',
                sort_order: targetSortOrder
            })
            .select('id')
            .single();

        if (insertQuestionError) throw insertQuestionError;
        const newQuestionId = insertedQuestion.id;

        if (questionRow.question_type === 'flashcard') {
            const detail = await loadFlashcardDetailByQuestionId(sourceQuestionId);
            if (!detail) throw new Error('Could not load the source flashcard details.');
            const { error } = await state.auth.client.from('flashcard_questions').insert({
                question_id: newQuestionId,
                term_html: detail.term_html || '',
                definition_html: detail.definition_html || '',
                term_plain: detail.term_plain || '',
                definition_plain: detail.definition_plain || '',
                term_image_url: detail.term_image_url || '',
                definition_image_url: detail.definition_image_url || ''
            });
            if (error) throw error;
            return newQuestionId;
        }

        if (questionRow.question_type === 'hierarchy') {
            const detail = await loadHierarchyDetailByQuestionId(sourceQuestionId);
            if (!detail) throw new Error('Could not load the source hierarchy details.');
            const { error } = await state.auth.client.from('hierarchy_questions').insert({
                question_id: newQuestionId,
                item_1_text: detail.item_1_text || '',
                item_2_text: detail.item_2_text || '',
                item_3_text: detail.item_3_text || '',
                item_4_text: detail.item_4_text || '',
                item_5_text: detail.item_5_text || '',
                item_6_text: detail.item_6_text || '',
                item_7_text: detail.item_7_text || '',
                item_8_text: detail.item_8_text || '',
                item_9_text: detail.item_9_text || '',
                item_10_text: detail.item_10_text || '',
                correct_order_json: Array.isArray(detail.correct_order_json) ? detail.correct_order_json : (detail.correct_order_json || [])
            });
            if (error) throw error;
            return newQuestionId;
        }

        if (questionRow.question_type === 'classify') {
            const detail = await loadClassifyDetailByQuestionId(sourceQuestionId);
            if (!detail) throw new Error('Could not load the source classify details.');
            const { error } = await state.auth.client.from('classify_questions').insert({
                question_id: newQuestionId,
                items_json: Array.isArray(detail.items_json) ? detail.items_json : (detail.items_json || []),
                classifications_json: Array.isArray(detail.classifications_json) ? detail.classifications_json : (detail.classifications_json || [])
            });
            if (error) throw error;
            return newQuestionId;
        }

        const detail = await loadMultipleChoiceDetailByQuestionId(sourceQuestionId);
        if (!detail) throw new Error('Could not load the source multiple-choice details.');
        const detailPayload = {
            question_id: newQuestionId,
            correct_answer: detail.correct_answer || '',
            correct_explanation_html: detail.correct_explanation_html || '',
            option_1_text: detail.option_1_text || '',
            option_1_explanation_html: detail.option_1_explanation_html || '',
            option_2_text: detail.option_2_text || '',
            option_2_explanation_html: detail.option_2_explanation_html || '',
            option_3_text: detail.option_3_text || '',
            option_3_explanation_html: detail.option_3_explanation_html || '',
            option_4_text: detail.option_4_text || '',
            option_4_explanation_html: detail.option_4_explanation_html || ''
        };
        if (Object.prototype.hasOwnProperty.call(detail, 'options_json')) {
            detailPayload.options_json = Array.isArray(detail.options_json) ? detail.options_json : [];
        }
        const { error: detailError } = await state.auth.client.from('multiple_choice_questions').insert(detailPayload);
        if (detailError) {
            const missingColumn = /options_json/i.test(detailError.message || '') || /options_json/i.test(detailError.details || '');
            if (!missingColumn) throw detailError;
            const fallbackPayload = { ...detailPayload };
            delete fallbackPayload.options_json;
            const { error: fallbackError } = await state.auth.client.from('multiple_choice_questions').insert(fallbackPayload);
            if (fallbackError) throw fallbackError;
        }
        return newQuestionId;
    }

    async function handleDuplicateStudioQuestion() {
        if (!state.auth.client || !state.auth.editingQuizId || !state.auth.editingQuestionId) {
            setCreatorStatus('Select a saved question first.', 'error');
            return;
        }

        try {
            const nextSortOrder = await getNextQuestionSortOrder(state.auth.editingQuizId);
            const duplicatedQuestionId = await duplicateQuestionRecord(state.auth.editingQuestionId, state.auth.editingQuizId, nextSortOrder);
            await loadStudioQuestionListForQuiz(state.auth.editingQuizId);
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${state.auth.editingQuizId}`, loadSelectedQuiz: true });
            await loadStudioQuestionIntoEditor(duplicatedQuestionId, { suppressStatus: true });
            setCreatorStatus('Question duplicated.', 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not duplicate the question.', 'error');
        }
    }

    async function handleDuplicateQuiz(quizId) {
        if (!state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before duplicating quizzes.', 'error');
            return;
        }

        try {
            const managedQuiz = state.auth.managedQuizzes.find(quiz => quiz.id === quizId);
            if (!managedQuiz) throw new Error('Could not find that quiz.');

            const { data: quizRow, error: quizError } = await state.auth.client
                .from('quizzes')
                .select('id, folder_id, name, description')
                .eq('id', quizId)
                .maybeSingle();
            if (quizError) throw quizError;
            if (!quizRow) throw new Error('Could not load the source quiz.');

            const nextSortOrder = await getNextQuizSortOrder(quizRow.folder_id || null);
            const duplicateName = `${normalizeSheetText(quizRow.name) || 'Untitled Quiz'} (Copy)`;
            const { data: insertedQuiz, error: insertQuizError } = await state.auth.client
                .from('quizzes')
                .insert({
                    user_id: state.auth.user.id,
                    folder_id: quizRow.folder_id || null,
                    name: duplicateName,
                    description: quizRow.description || '',
                    sort_order: nextSortOrder,
                    is_archived: false
                })
                .select('id')
                .single();
            if (insertQuizError) throw insertQuizError;
            const newQuizId = insertedQuiz.id;

            const { data: sourceQuestions, error: sourceQuestionsError } = await state.auth.client
                .from('questions')
                .select('id, sort_order')
                .eq('quiz_id', quizId)
                .order('sort_order', { ascending: true });
            if (sourceQuestionsError) throw sourceQuestionsError;

            for (const [index, question] of (sourceQuestions || []).entries()) {
                await duplicateQuestionRecord(question.id, newQuizId, index);
            }

            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${newQuizId}`, loadSelectedQuiz: false });
            setCreatorStatus('Quiz duplicated.', 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not duplicate the quiz.', 'error');
        }
    }

    async function handleDeleteQuiz(quizId) {
        if (!confirm('Delete this quiz? This will remove its questions for this project.')) {
            return;
        }

        try {
            const { error } = await state.auth.client
                .from('quizzes')
                .delete()
                .eq('id', quizId);

            if (error) throw error;

            if (state.auth.editingQuizId === quizId) {
                clearCreatorInputs();
                state.auth.studioQuizQuestions = [];
                renderStudioQuestionList();
            }

            const currentSelectedWasDeleted = elements.quizSelector?.value === `sb:${quizId}`;
            await refreshStudioManagementData();
            await refreshQuizCatalog({ clearIfMissing: currentSelectedWasDeleted });
            setCreatorStatus('Quiz deleted.', 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not delete the quiz.', 'error');
        }
    }

    async function ensureImportTargetFolderId(targetFolderId, sourceFolderName) {
        const explicitTargetId = normalizeSheetText(targetFolderId);
        if (explicitTargetId) {
            return explicitTargetId;
        }

        const normalizedSourceFolder = normalizeFolderName(sourceFolderName);
        const existingFolder = state.auth.supabaseFolders.find(folder => normalizeFolderName(folder.name) === normalizedSourceFolder) || null;
        if (existingFolder?.id) {
            return existingFolder.id;
        }

        const nextSortOrder = state.auth.supabaseFolders.reduce((maxValue, folder) => Math.max(maxValue, Number(folder.sort_order ?? 0)), -1) + 1;
        const { data, error } = await state.auth.client
            .from('folders')
            .insert({ user_id: state.auth.user.id, name: normalizedSourceFolder, sort_order: nextSortOrder })
            .select('id')
            .single();

        if (error) throw error;
        await refreshStudioManagementData();
        return data?.id || '';
    }

    function getQuestionTypeForImport(question) {
        if (question?.type === 'multiple choice') return 'multiple_choice';
        return normalizeSheetText(question?.type).replace(/\s+/g, '_') || 'multiple_choice';
    }

    async function importMultipleChoiceQuestionToSupabase(quizId, question, sortOrder) {
        const { data, error } = await state.auth.client
            .from('questions')
            .insert({
                quiz_id: quizId,
                question_type: 'multiple_choice',
                prompt_html: buildStoredHtmlFromPlain(question.question),
                prompt_plain: normalizeSheetText(question.question),
                image_url: normalizeSheetText(question.image),
                learning_resources_html: buildStoredHtmlFromPlain(question.learningResources),
                learning_resources_image_url: normalizeSheetText(question.learningResourcesImage),
                sort_order: sortOrder
            })
            .select('id')
            .single();
        if (error) throw error;
        const questionId = data?.id;
        const options = Array.isArray(question.options) ? question.options.map(option => normalizeSheetText(option)).filter(Boolean) : [];
        const explanations = Array.isArray(question.explanations) ? question.explanations.map(value => normalizeSheetText(value)) : [];
        const correctAnswer = normalizeSheetText(question.correct);
        const correctIndex = options.findIndex(option => option === correctAnswer);
        const optionPayload = options.map((optionText, index) => ({ text: optionText, explanation_html: buildStoredHtmlFromPlain(explanations[index] || '') }));
        const detailPayload = {
            question_id: questionId,
            correct_answer: correctAnswer,
            correct_explanation_html: buildStoredHtmlFromPlain(correctIndex >= 0 ? (explanations[correctIndex] || '') : ''),
            options_json: optionPayload,
            option_1_text: options[0] || '',
            option_1_explanation_html: buildStoredHtmlFromPlain(explanations[0] || ''),
            option_2_text: options[1] || '',
            option_2_explanation_html: buildStoredHtmlFromPlain(explanations[1] || ''),
            option_3_text: options[2] || '',
            option_3_explanation_html: buildStoredHtmlFromPlain(explanations[2] || ''),
            option_4_text: options[3] || '',
            option_4_explanation_html: buildStoredHtmlFromPlain(explanations[3] || '')
        };
        const { error: detailError } = await state.auth.client.from('multiple_choice_questions').upsert(detailPayload, { onConflict: 'question_id' });
        if (detailError) {
            const missingColumn = /options_json/i.test(detailError.message || '') || /options_json/i.test(detailError.details || '');
            if (!missingColumn) throw detailError;
            const fallbackPayload = { ...detailPayload };
            delete fallbackPayload.options_json;
            const { error: fallbackError } = await state.auth.client.from('multiple_choice_questions').upsert(fallbackPayload, { onConflict: 'question_id' });
            if (fallbackError) throw fallbackError;
        }
    }

    async function importFlashcardQuestionToSupabase(quizId, question, sortOrder) {
        const term = normalizeSheetText(question.termText);
        const definition = normalizeSheetText(question.definitionText);
        const { data, error } = await state.auth.client
            .from('questions')
            .insert({
                quiz_id: quizId,
                question_type: 'flashcard',
                prompt_html: buildStoredHtmlFromPlain(term),
                prompt_plain: term,
                image_url: '',
                learning_resources_html: buildStoredHtmlFromPlain(question.learningResources),
                learning_resources_image_url: normalizeSheetText(question.learningResourcesImage),
                sort_order: sortOrder
            })
            .select('id')
            .single();
        if (error) throw error;
        const { error: detailError } = await state.auth.client.from('flashcard_questions').upsert({
            question_id: data.id,
            term_html: buildStoredHtmlFromPlain(term),
            definition_html: buildStoredHtmlFromPlain(definition),
            term_plain: term,
            definition_plain: definition,
            term_image_url: normalizeSheetText(question.termImage),
            definition_image_url: normalizeSheetText(question.definitionImage)
        }, { onConflict: 'question_id' });
        if (detailError) throw detailError;
    }

    async function importHierarchyQuestionToSupabase(quizId, question, sortOrder) {
        const { data, error } = await state.auth.client
            .from('questions')
            .insert({
                quiz_id: quizId,
                question_type: 'hierarchy',
                prompt_html: buildStoredHtmlFromPlain(question.question),
                prompt_plain: normalizeSheetText(question.question),
                image_url: normalizeSheetText(question.image),
                learning_resources_html: buildStoredHtmlFromPlain(question.learningResources),
                learning_resources_image_url: normalizeSheetText(question.learningResourcesImage),
                sort_order: sortOrder
            })
            .select('id')
            .single();
        if (error) throw error;
        const itemTexts = Array.isArray(question.options) ? question.options.map(value => normalizeSheetText(value)).slice(0, 10) : [];
        const detailPayload = { question_id: data.id, correct_order_json: Array.isArray(question.correctOrder) ? question.correctOrder : [] };
        Array.from({ length: 10 }, (_, index) => {
            detailPayload[`item_${index + 1}_text`] = itemTexts[index] || '';
        });
        const { error: detailError } = await state.auth.client.from('hierarchy_questions').upsert(detailPayload, { onConflict: 'question_id' });
        if (detailError) throw detailError;
    }

    async function importClassifyQuestionToSupabase(quizId, question, sortOrder) {
        const { data, error } = await state.auth.client
            .from('questions')
            .insert({
                quiz_id: quizId,
                question_type: 'classify',
                prompt_html: buildStoredHtmlFromPlain(question.question),
                prompt_plain: normalizeSheetText(question.question),
                image_url: normalizeSheetText(question.image),
                learning_resources_html: buildStoredHtmlFromPlain(question.learningResources),
                learning_resources_image_url: normalizeSheetText(question.learningResourcesImage),
                sort_order: sortOrder
            })
            .select('id')
            .single();
        if (error) throw error;
        const classificationsJson = Array.isArray(question.classifications) ? question.classifications.map(classification => ({
            label: normalizeSheetText(classification?.label),
            imageUrl: normalizeSheetText(classification?.imageUrl),
            id: normalizeSheetText(classification?.id)
        })).filter(classification => classification.id && (classification.label || classification.imageUrl)) : [];
        const itemsJson = Array.isArray(question.items) ? question.items.map((item, index) => ({
            kind: normalizeSheetText(item?.kind || (item?.imageUrl ? 'image' : 'text')) || 'text',
            raw: normalizeSheetText(item?.raw || item?.text || `classify_item_${index + 1}`),
            imageUrl: normalizeSheetText(item?.imageUrl),
            text: normalizeSheetText(item?.text || item?.raw),
            dragLabel: normalizeSheetText(item?.dragLabel || item?.text || item?.raw || `Image item ${index + 1}`),
            ariaLabel: normalizeSheetText(item?.ariaLabel || (item?.text ? `Classify item ${item.text}` : `Classify image item ${index + 1}`)),
            correctClassificationId: normalizeSheetText(item?.correctClassificationId)
        })) : [];
        const { error: detailError } = await state.auth.client.from('classify_questions').upsert({
            question_id: data.id,
            items_json: itemsJson,
            classifications_json: classificationsJson
        }, { onConflict: 'question_id' });
        if (detailError) throw detailError;
    }

    async function importGoogleSheetsQuestionsToSupabaseQuiz(quizId, questions) {
        for (let index = 0; index < questions.length; index += 1) {
            const question = questions[index];
            const questionType = getQuestionTypeForImport(question);
            if (questionType === 'flashcard') {
                await importFlashcardQuestionToSupabase(quizId, question, index);
            } else if (questionType === 'hierarchy') {
                await importHierarchyQuestionToSupabase(quizId, question, index);
            } else if (questionType === 'classify') {
                await importClassifyQuestionToSupabase(quizId, question, index);
            } else {
                await importMultipleChoiceQuestionToSupabase(quizId, question, index);
            }
        }
    }

    async function importGoogleSheetsQuizDescriptorToSupabase(quizDescriptor, targetFolderId = '') {
        const descriptor = isQuizDescriptor(quizDescriptor) ? quizDescriptor : getQuizBySelectorValue(quizDescriptor);
        if (!descriptor || descriptor.source !== DATA_SOURCES.GOOGLE_SHEETS) {
            throw new Error('Choose a valid Google Sheets quiz to import.');
        }

        const sourceQuestions = await loadQuestionsFromGoogleSheets(descriptor.sheet);
        if (!sourceQuestions.length) {
            throw new Error('The selected Google Sheets quiz does not have importable questions.');
        }

        const quizType = getQuestionTypeForImport(sourceQuestions[0]);
        const invalidMixedTypes = sourceQuestions.some(question => getQuestionTypeForImport(question) !== quizType);
        if (invalidMixedTypes) {
            throw new Error('Mixed-type Google Sheets quizzes are not supported for import yet.');
        }

        const folderId = await ensureImportTargetFolderId(targetFolderId, descriptor.folder);
        const nextSortOrder = state.auth.managedQuizzes
            .filter(quiz => (quiz.folderId || '') === (folderId || ''))
            .reduce((maxValue, quiz) => Math.max(maxValue, Number(quiz.sortOrder ?? 0)), -1) + 1;

        const { data: quizRow, error: quizError } = await state.auth.client
            .from('quizzes')
            .insert({
                user_id: state.auth.user.id,
                folder_id: folderId || null,
                name: descriptor.name,
                description: '',
                sort_order: nextSortOrder,
                is_archived: false
            })
            .select('id')
            .single();
        if (quizError) throw quizError;

        await importGoogleSheetsQuestionsToSupabaseQuiz(quizRow.id, sourceQuestions);
        return { quizId: quizRow.id, quizName: descriptor.name, questionCount: sourceQuestions.length, quizType, folderId };
    }

    async function handleImportGoogleSheetsQuiz() {
        if (!state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before importing Google Sheets quizzes.', 'error');
            return;
        }

        const quizDescriptor = getQuizBySelectorValue(elements.importSourceQuizSelect?.value || '');
        if (!quizDescriptor || quizDescriptor.source !== DATA_SOURCES.GOOGLE_SHEETS) {
            setCreatorStatus('Choose a Google Sheets quiz to import.', 'error');
            return;
        }

        try {
            const targetFolderId = normalizeSheetText(elements.importTargetFolderSelect?.value);
            const result = await importGoogleSheetsQuizDescriptorToSupabase(quizDescriptor, targetFolderId);
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${result.quizId}` });
            renderGoogleSheetsImportControls();
            setQuizStudioSection('manage');
            setCreatorStatus(`Imported "${result.quizName}" into Supabase.`, 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not import the Google Sheets quiz.', 'error');
        }
    }

    async function handleImportGoogleSheetsFolder() {
        if (!state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before importing Google Sheets folders.', 'error');
            return;
        }

        const sourceFolderName = normalizeSheetText(elements.importEntireFolderSourceSelect?.value);
        if (!sourceFolderName) {
            setCreatorStatus('Choose a Google Sheets folder to import.', 'error');
            return;
        }

        const sourceQuizzes = getGoogleSheetsQuizzesForFolder(sourceFolderName);
        if (!sourceQuizzes.length) {
            setCreatorStatus('That Google Sheets folder does not contain importable quizzes.', 'error');
            return;
        }

        try {
            const targetFolderId = await ensureImportTargetFolderId(normalizeSheetText(elements.importEntireFolderTargetSelect?.value), sourceFolderName);
            let importedCount = 0;
            for (const descriptor of sourceQuizzes) {
                await importGoogleSheetsQuizDescriptorToSupabase(descriptor, targetFolderId);
                importedCount += 1;
            }
            await refreshStudioManagementData();
            await refreshQuizCatalog();
            renderGoogleSheetsImportControls();
            setQuizStudioSection('manage');
            setCreatorStatus(`Imported ${importedCount} Google Sheets ${importedCount === 1 ? 'quiz' : 'quizzes'} into Supabase.`, 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not import that Google Sheets folder.', 'error');
        }
    }
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

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve('');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });
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

function isMasteryCheckMode() {
    return document.getElementById('masteryCheckMode').checked;
}

function isSpeedMode() {
    return document.getElementById('rapidMode').checked;
}

function isLearningResourcesMode() {
    return document.getElementById('learningResourcesMode').checked;
}

function isExcludeStarredEnabled() {
    return !!elements.excludeStarredQuestions?.checked;
}

function canPersistQuestionStarState(question = state.questionQueue[state.currentIndex]) {
    return !!(state.auth.client && state.auth.user?.id && question?.sourceQuestionId);
}

function isNormalMode() {
    return !isRetentionMode() && !isRetryMode() && !isMasteryCheckMode();
}

function isStructuredMode() {
    return isRetentionMode() || isRetryMode() || isMasteryCheckMode();
}

function canUseLearningResources() {
    if (!isLearningResourcesMode()) return false;
    if (isMasteryCheckMode()) return true;
    return !isSpeedMode() && (isRetentionMode() || isRetryMode());
}

function hasFlashcardsInDeck() {
    return state.questions.some(q => q.type === 'flashcard');
}

function updateLearningResourcesAvailability() {
    const learningResourcesCheckbox = document.getElementById('learningResourcesMode');
    const learningResourcesSetting = document.getElementById('learningResourcesModeSetting');
    const learningResourcesAllowed = isRetentionMode() || isRetryMode() || isMasteryCheckMode();
    const learningResourcesDisabledForCompatibility = !learningResourcesAllowed || (isSpeedMode() && !isMasteryCheckMode());

    learningResourcesCheckbox.disabled = learningResourcesDisabledForCompatibility;

    if (learningResourcesSetting) {
        learningResourcesSetting.classList.toggle('disabled-setting', learningResourcesDisabledForCompatibility);
    }

    if (!learningResourcesAllowed) {
        learningResourcesCheckbox.checked = false;
        clearPendingLearningResource();
    }

    if (isSpeedMode() && !isMasteryCheckMode() && learningResourcesCheckbox.checked) {
        learningResourcesCheckbox.checked = false;
        clearPendingLearningResource();
    }
}

function updateStarredQuestionAvailability() {
    const starSettingCard = document.getElementById('excludeStarredQuestionsSetting');
    const starSettingHelp = document.getElementById('excludeStarredQuestionsHelp');
    const canUseStarred = !!(state.auth.client && state.auth.user?.id);

    if (elements.excludeStarredQuestions) {
        elements.excludeStarredQuestions.disabled = !canUseStarred;
        if (!canUseStarred) {
            elements.excludeStarredQuestions.checked = false;
        }
    }

    if (starSettingCard) {
        starSettingCard.classList.toggle('disabled-setting', !canUseStarred);
    }

    if (starSettingHelp && !canUseStarred) {
        starSettingHelp.innerText = 'Sign in to use starred-question memory.';
    } else if (starSettingHelp) {
        starSettingHelp.innerText = 'Hides starred questions from the active study deck without removing the saved stars.';
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

function setSettingDisabled(settingId, checkboxId, disabled) {
    const card = document.getElementById(settingId);
    const checkbox = document.getElementById(checkboxId);

    if (checkbox) {
        checkbox.disabled = disabled;
    }

    if (card) {
        card.classList.toggle('disabled-setting', disabled);
    }
}

function updateExclusiveModeAvailability() {
    const retentionActive = isRetentionMode();
    const masteryActive = isRetryMode();
    const masteryCheckActive = isMasteryCheckMode();

    setSettingDisabled('retentionModeSetting', 'retentionMode', masteryActive || masteryCheckActive);
    setSettingDisabled('masteryModeSetting', 'masteryMode', retentionActive || masteryCheckActive);
    setSettingDisabled('masteryCheckModeSetting', 'masteryCheckMode', retentionActive || masteryActive);
}

function updateRapidLearningResourcesCompatibility() {
    const rapidSetting = document.getElementById('rapidModeSetting');
    const rapidCheckbox = document.getElementById('rapidMode');
    const learningResourcesCheckbox = document.getElementById('learningResourcesMode');

    const allowRapidAndLearningTogether = isMasteryCheckMode();
    const rapidDisabled = !allowRapidAndLearningTogether && !!learningResourcesCheckbox?.checked;

    if (rapidCheckbox) {
        rapidCheckbox.disabled = rapidDisabled;
    }

    if (rapidSetting) {
        rapidSetting.classList.toggle('disabled-setting', rapidDisabled);
    }
}

function setNavButtonEnabled(button, enabled) {
    if (!button) return;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

function updateNavigationButtons() {
    const hasQuestions = state.questions.length > 0;

    if (!hasQuestions || state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen || isQuizFinished()) {
        setNavButtonEnabled(elements.prevBtn, false);
        setNavButtonEnabled(elements.nextBtn, false);
        return;
    }

    if (isStructuredMode()) {
        setNavButtonEnabled(elements.prevBtn, false);
        setNavButtonEnabled(elements.nextBtn, state.questionAnswered);
        return;
    }

    setNavButtonEnabled(elements.prevBtn, true);
    setNavButtonEnabled(elements.nextBtn, true);
}

function updateSettingsAvailability() {
    updateExclusiveModeAvailability();
    updateLearningResourcesAvailability();
    updateRapidLearningResourcesCompatibility();
    updateStarredQuestionAvailability();
    updateShuffleAnswersAvailability();
    updateFlashcardFrontSettingVisibility();
    updateFlashcardFrontButtonsUI();
    updateNavigationButtons();
    syncQuestionStarButton();
}

function syncBodyScrollLock() {
    document.body.style.overflow = (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen || state.auth?.quizStudioOpen) ? 'hidden' : '';
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
    updateNavigationButtons();
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
    updateNavigationButtons();
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
    updateNavigationButtons();
}

function closeFlashcardImageOverlay() {
    if (!elements.flashcardImageOverlay || !elements.flashcardZoomImage) return;

    elements.flashcardImageOverlay.classList.add('hidden');
    elements.flashcardImageOverlay.setAttribute('aria-hidden', 'true');
    elements.flashcardZoomImage.src = '';
    elements.flashcardZoomImage.alt = 'Flashcard image';
    state.flashcardImageZoomOpen = false;
    syncBodyScrollLock();
    updateNavigationButtons();
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

function isQuizDescriptor(value) {
    return !!value && typeof value === 'object' && typeof value.source === 'string' && typeof value.id === 'string';
}

function encodeQuizSelectorValue(quizDescriptor) {
    return isQuizDescriptor(quizDescriptor) ? quizDescriptor.id : '';
}

function getQuizBySelectorValue(selectorValue) {
    return state.quizListCache.find(q => q.id === selectorValue) || null;
}

function buildFolderDeckDescriptors(quizDescriptors) {
    const byFolder = new Map();

    quizDescriptors.forEach(quiz => {
        if (!isQuizDescriptor(quiz) || quiz.source === DATA_SOURCES.FOLDER_DECK) return;
        const folderName = normalizeFolderName(quiz.folder);
        if (!byFolder.has(folderName)) {
            byFolder.set(folderName, []);
        }
        byFolder.get(folderName).push(quiz);
    });

    return Array.from(byFolder.entries()).map(([folderName, quizzes]) => ({
        id: `fd:${encodeURIComponent(folderName)}`,
        source: DATA_SOURCES.FOLDER_DECK,
        folder: folderName,
        folderId: '',
        folderSortOrder: quizzes.reduce((minValue, quiz) => Math.min(minValue, Number(quiz.folderSortOrder ?? 0)), Number(quizzes[0]?.folderSortOrder ?? 0)),
        name: 'Study Entire Folder',
        rangeNumber: '',
        sortOrder: -1
    }));
}

async function loadQuestionsForQuizDescriptor(quizDescriptor) {
    if (!isQuizDescriptor(quizDescriptor)) {
        throw new Error('Invalid quiz descriptor');
    }

    if (quizDescriptor.source === DATA_SOURCES.FOLDER_DECK) {
        const memberQuizzes = state.quizListCache.filter(item =>
            isQuizDescriptor(item)
            && item.source !== DATA_SOURCES.FOLDER_DECK
            && normalizeFolderName(item.folder) === normalizeFolderName(quizDescriptor.folder)
        );

        const results = await Promise.all(memberQuizzes.map(item => loadQuestions(item)));
        return results.flat();
    }

    return loadQuestions(quizDescriptor);
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
        selectedQuizzes.map(q => loadQuestionsForQuizDescriptor(q))
    );

    return results.flat();
}

async function hydrateStarredQuestionState(questions) {
    const questionRows = Array.isArray(questions) ? questions : [];

    questionRows.forEach(question => {
        question.isStarred = false;
    });

    const sourceQuestionIds = questionRows
        .map(question => normalizeSheetText(question?.sourceQuestionId))
        .filter(Boolean);

    if (!state.auth.client || !state.auth.user?.id || !sourceQuestionIds.length) {
        return questionRows;
    }

    try {
        const { data, error } = await state.auth.client
            .from('user_question_state')
            .select('question_id, is_starred')
            .eq('user_id', state.auth.user.id)
            .in('question_id', sourceQuestionIds);

        if (error) throw error;

        const starredMap = new Map((data || []).map(row => [normalizeSheetText(row.question_id), !!row.is_starred]));
        questionRows.forEach(question => {
            question.isStarred = !!starredMap.get(normalizeSheetText(question?.sourceQuestionId));
        });
    } catch (error) {
        console.error('Failed to hydrate starred question state:', error);
    }

    return questionRows;
}

function getFilteredSourceQuestions() {
    const sourceQuestions = Array.isArray(state.sourceQuestions) ? state.sourceQuestions : [];
    if (!isExcludeStarredEnabled()) {
        return [...sourceQuestions];
    }
    return sourceQuestions.filter(question => !question.isStarred);
}

function syncQuestionStarButton() {
    const button = elements.questionStarBtn;
    if (!button) return;

    const currentQuestion = state.questionQueue[state.currentIndex] || null;
    const canStar = canPersistQuestionStarState(currentQuestion) && !state.auth.starringInFlight && !isQuizFinished();

    if (!currentQuestion || !canPersistQuestionStarState(currentQuestion) || isQuizFinished()) {
        button.classList.add('hidden');
        button.disabled = true;
        button.innerText = '☆';
        button.classList.remove('starred');
        button.setAttribute('aria-label', 'Star question');
        button.setAttribute('title', 'Star question');
        return;
    }

    button.classList.remove('hidden');
    button.disabled = !canStar;
    button.innerText = currentQuestion.isStarred ? '★' : '☆';
    button.classList.toggle('starred', !!currentQuestion.isStarred);
    button.setAttribute('aria-label', currentQuestion.isStarred ? 'Unstar question' : 'Star question');
    button.setAttribute('title', currentQuestion.isStarred ? 'Unstar question' : 'Star question');
}

function resetPendingStudyAdvanceFlags() {
    state.pendingRetentionJump = false;
    state.pendingRetentionCorrect = false;
    state.retentionAnswerLocked = false;
    state.pendingMasteryAdvance = false;
    state.masteryCheckPendingJump = false;
    state.masteryCheckPendingAdvance = false;
    state.masteryCheckPendingCheckpointStart = false;
    state.masteryCheckPendingCheckpointComplete = false;
}

function applyFilteredQuestionsToSession({ resetSession = true, preserveQuestionId = '' } = {}) {
    const visibleQuestions = getFilteredSourceQuestions();
    state.emptyQuizMessage = '';

    if (resetSession) {
        resetModeState();
    } else {
        resetPendingStudyAdvanceFlags();
    }

    state.questions = [...visibleQuestions];
    state.questionQueue = [...visibleQuestions];

    if (document.getElementById('shuffleQuestions').checked && resetSession) {
        shuffleArray(state.questionQueue);
    }

    if (preserveQuestionId) {
        const preservedIndex = state.questionQueue.findIndex(question => question.id === preserveQuestionId);
        state.currentIndex = preservedIndex >= 0 ? preservedIndex : 0;
    } else if (!resetSession) {
        if (state.currentIndex >= state.questionQueue.length) {
            state.currentIndex = Math.max(0, state.questionQueue.length - 1);
        }
    } else {
        state.currentIndex = 0;
    }

    if (!state.questions.length) {
        state.normalFinished = false;
        state.retentionFinished = false;
        state.masteryCheckFinished = false;
        state.emptyQuizMessage = isExcludeStarredEnabled() && state.sourceQuestions.length
            ? 'All questions in this deck are currently starred and excluded.'
            : 'This quiz has no questions.';
    }

    updateSettingsAvailability();
    showQuestion();
}

async function applyLoadedQuestions(newQuestions) {
    const hydratedQuestions = await hydrateStarredQuestionState(newQuestions);
    state.sourceQuestions = [...hydratedQuestions];
    applyFilteredQuestionsToSession({ resetSession: true });
}

function normalizeFolderName(value) {
    return normalizeSheetText(value) || 'Uncategorized';
}

function htmlToDisplayText(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    const temp = document.createElement('div');
    temp.innerHTML = raw;
    return normalizeSheetText(temp.textContent || temp.innerText || '');
}

function getStoredTextForDisplay(plainValue, htmlValue) {
    const plain = normalizeSheetText(plainValue);
    if (plain) return plain;
    return htmlToDisplayText(htmlValue);
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

    if (elements.questionStarBtn) {
        elements.questionStarBtn.classList.add('hidden');
        elements.questionStarBtn.disabled = true;
    }

    elements.questionTextEl.style.display = 'block';
    elements.questionTextEl.innerText = message;
    elements.optionsContainer.style.display = 'none';
    elements.imageContainer.style.display = '';
    elements.questionImage.style.display = 'none';
    elements.questionImage.src = '';

    clearFeedback();
    updateProgress();
    updateNavigationButtons();
    syncQuestionStarButton();
}

function clearActiveQuizSelection(message = 'Choose a folder and a quiz.') {
    state.questions = [];
    state.questionQueue = [];
    state.sourceQuestions = [];
    state.emptyQuizMessage = '';
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
function createGoogleSheetsQuizDescriptor(row) {
    const sheet = getCellValue(row.c?.[0]);
    const name = getCellValue(row.c?.[1]);

    if (!sheet || !name) {
        return null;
    }

    return {
        id: `gs:${sheet}`,
        source: DATA_SOURCES.GOOGLE_SHEETS,
        sourceQuizId: sheet,
        sheet,
        name,
        rangeNumber: getCellValue(row.c?.[2]),
        folder: normalizeFolderName(getCellValue(row.c?.[3]))
    };
}

async function loadQuizListFromGoogleSheets() {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?sheet=Config`);
    const text = await res.text();
    const json = parseGoogleSheetResponse(text);

    return json.table.rows
        .map(createGoogleSheetsQuizDescriptor)
        .filter(Boolean);
}

async function loadQuizListFromSupabase() {
    if (!state.auth.client || !state.auth.user?.id) {
        return [];
    }

    try {
        const [{ data: folders, error: foldersError }, { data: quizzes, error: quizzesError }, { data: questionRows, error: questionsError }] = await Promise.all([
            state.auth.client
                .from('folders')
                .select('id, name, sort_order')
                .order('sort_order', { ascending: true })
                .order('name', { ascending: true }),
            state.auth.client
                .from('quizzes')
                .select('id, folder_id, name, sort_order, is_archived')
                .eq('is_archived', false)
                .order('sort_order', { ascending: true })
                .order('name', { ascending: true }),
            state.auth.client
                .from('questions')
                .select('quiz_id, question_type')
        ]);

        if (foldersError) throw foldersError;
        if (quizzesError) throw quizzesError;
        if (questionsError) throw questionsError;

        const folderMap = new Map((folders || []).map(folder => [folder.id, folder]));
        const quizTypeMap = new Map();

        (questionRows || []).forEach(row => {
            if (!quizTypeMap.has(row.quiz_id)) {
                quizTypeMap.set(row.quiz_id, []);
            }
            quizTypeMap.get(row.quiz_id).push(row.question_type);
        });

        return (quizzes || [])
            .filter(quiz => {
                const types = quizTypeMap.get(quiz.id) || [];
                return types.length > 0 && types.every(type => type === 'multiple_choice' || type === 'flashcard' || type === 'hierarchy' || type === 'classify');
            })
            .map(quiz => {
                const types = quizTypeMap.get(quiz.id) || [];
                const quizType = types[0] || 'multiple_choice';
                const folder = folderMap.get(quiz.folder_id) || null;
                return {
                    id: `sb:${quiz.id}`,
                    source: DATA_SOURCES.SUPABASE,
                    sourceQuizId: quiz.id,
                    quizType,
                    folderId: quiz.folder_id || '',
                    folder: normalizeFolderName(folder?.name),
                    folderSortOrder: Number(folder?.sort_order ?? 0),
                    name: normalizeSheetText(quiz.name),
                    rangeNumber: '',
                    sortOrder: Number(quiz.sort_order ?? 0)
                };
            })
            .sort((a, b) => {
                if (a.folderSortOrder !== b.folderSortOrder) {
                    return a.folderSortOrder - b.folderSortOrder;
                }
                if (a.folder !== b.folder) {
                    return a.folder.localeCompare(b.folder);
                }
                if (a.sortOrder !== b.sortOrder) {
                    return a.sortOrder - b.sortOrder;
                }
                return a.name.localeCompare(b.name);
            });
    } catch (error) {
        console.error('Failed to load Supabase quiz list:', error);
        return [];
    }
}

async function loadQuestionsFromSupabase(quizDescriptor) {
    if (!state.auth.client || !quizDescriptor?.sourceQuizId) {
        return [];
    }

    try {
        const { data: questionRows, error: questionsError } = await state.auth.client
            .from('questions')
            .select('id, prompt_html, prompt_plain, image_url, learning_resources_html, learning_resources_image_url, sort_order, question_type')
            .eq('quiz_id', quizDescriptor.sourceQuizId)
            .order('sort_order', { ascending: true });
        if (questionsError) throw questionsError;
        const rows = questionRows || [];
        const questionIds = rows.map(row => row.id).filter(Boolean);
        if (!questionIds.length) return [];
        const quizType = normalizeSheetText(quizDescriptor.quizType || rows[0]?.question_type || 'multiple_choice');
        if (quizType === 'flashcard') {
            const detailRows = await loadFlashcardDetailsByQuestionIds(questionIds);
            const detailMap = new Map((detailRows || []).map(row => [row.question_id, row]));
            return rows.map(row => {
                const detail = detailMap.get(row.id);
                if (!detail) return null;
                return {
                    id: `q_${state.questionIdCounter++}`,
                    sourceQuestionId: row.id,
                    type: 'flashcard',
                    termText: getStoredTextForDisplay(detail.term_plain, detail.term_html),
                    definitionText: getStoredTextForDisplay(detail.definition_plain, detail.definition_html),
                    termImage: normalizeSheetText(detail.term_image_url),
                    definitionImage: normalizeSheetText(detail.definition_image_url),
                    learningResources: getStoredTextForDisplay('', row.learning_resources_html),
                    learningResourcesImage: normalizeSheetText(row.learning_resources_image_url)
                };
            }).filter(Boolean);
        }
        if (quizType === 'hierarchy') {
            const detailRows = await loadHierarchyDetailsByQuestionIds(questionIds);
            const detailMap = new Map((detailRows || []).map(row => [row.question_id, row]));
            return rows.map(row => {
                const detail = detailMap.get(row.id);
                if (!detail) return null;
                const itemDrafts = getHierarchyDraftsFromDetailRow(detail);
                const sortedByOriginalIndex = itemDrafts
                    .map((draft, index) => ({ ...draft, originalIndex: index + 1 }))
                    .sort((a, b) => a.originalIndex - b.originalIndex);
                const correctOrder = itemDrafts
                    .map((draft, index) => ({ position: Number(draft.position || index + 1), originalIndex: index + 1 }))
                    .sort((a, b) => a.position - b.position)
                    .map(item => item.originalIndex);
                return {
                    id: `q_${state.questionIdCounter++}`,
                    sourceQuestionId: row.id,
                    question: getStoredTextForDisplay(row.prompt_plain, row.prompt_html),
                    type: 'hierarchy',
                    options: sortedByOriginalIndex.map(item => item.text),
                    correctOrder,
                    image: normalizeSheetText(row.image_url),
                    learningResources: getStoredTextForDisplay('', row.learning_resources_html),
                    learningResourcesImage: normalizeSheetText(row.learning_resources_image_url)
                };
            }).filter(Boolean);
        }
        if (quizType === 'classify') {
            const detailRows = await loadClassifyDetailsByQuestionIds(questionIds);
            const detailMap = new Map((detailRows || []).map(row => [row.question_id, row]));
            return rows.map(row => {
                const detail = detailMap.get(row.id);
                if (!detail) return null;
                const items = Array.isArray(detail.items_json) ? detail.items_json.map(item => ({
                    kind: normalizeSheetText(item?.kind || (item?.imageUrl ? 'image' : 'text')) || 'text',
                    raw: normalizeSheetText(item?.raw || item?.text),
                    imageUrl: normalizeSheetText(item?.imageUrl),
                    text: normalizeSheetText(item?.text || item?.raw),
                    dragLabel: normalizeSheetText(item?.dragLabel || item?.text || item?.raw || 'Image item'),
                    ariaLabel: normalizeSheetText(item?.ariaLabel || `Classify item ${item?.text || item?.raw || 'image'}`),
                    correctClassificationId: normalizeSheetText(item?.correctClassificationId)
                })) : [];
                const classifications = Array.isArray(detail.classifications_json) ? detail.classifications_json.map(classification => ({
                    label: normalizeSheetText(classification?.label),
                    imageUrl: normalizeSheetText(classification?.imageUrl),
                    id: normalizeSheetText(classification?.id)
                })).filter(classification => classification.id && (classification.label || classification.imageUrl)) : [];
                return {
                    id: `q_${state.questionIdCounter++}`,
                    sourceQuestionId: row.id,
                    question: getStoredTextForDisplay(row.prompt_plain, row.prompt_html),
                    type: 'classify',
                    items,
                    classifications,
                    image: normalizeSheetText(row.image_url),
                    learningResources: getStoredTextForDisplay('', row.learning_resources_html),
                    learningResourcesImage: normalizeSheetText(row.learning_resources_image_url)
                };
            }).filter(Boolean);
        }
        const detailRows = await loadMultipleChoiceDetailsByQuestionIds(questionIds);
        const detailMap = new Map((detailRows || []).map(row => [row.question_id, row]));
        return rows.map(row => {
            const detail = detailMap.get(row.id);
            if (!detail) return null;
            const optionDrafts = getMultipleChoiceDraftsFromDetailRow(detail);
            const options = optionDrafts.map(draft => draft.text);
            const explanations = optionDrafts.map(draft => draft.explanation);
            const correctAnswer = normalizeSheetText(detail.correct_answer);
            const correctIndex = options.findIndex(option => option === correctAnswer);
            if (correctIndex >= 0 && !explanations[correctIndex]) {
                explanations[correctIndex] = getStoredTextForDisplay('', detail.correct_explanation_html);
            }
            return {
                id: `q_${state.questionIdCounter++}`,
                sourceQuestionId: row.id,
                question: getStoredTextForDisplay(row.prompt_plain, row.prompt_html),
                type: 'multiple choice',
                options,
                correct: correctAnswer,
                explanations,
                image: normalizeSheetText(row.image_url),
                learningResources: getStoredTextForDisplay('', row.learning_resources_html),
                learningResourcesImage: normalizeSheetText(row.learning_resources_image_url)
            };
        }).filter(Boolean);
    } catch (error) {
        console.error('Failed to load Supabase quiz questions:', error);
        return [];
    }
}

async function loadQuizList() {
    const [googleSheetsQuizzes, supabaseQuizzes] = await Promise.all([
        loadQuizListFromGoogleSheets(),
        loadQuizListFromSupabase()
    ]);

    const quizDescriptors = [...supabaseQuizzes, ...googleSheetsQuizzes];
    const folderDeckDescriptors = buildFolderDeckDescriptors(quizDescriptors);

    return [...quizDescriptors, ...folderDeckDescriptors];
}

async function loadQuestions(quizReference) {
    if (isQuizDescriptor(quizReference)) {
        if (quizReference.source === DATA_SOURCES.SUPABASE) {
            return loadQuestionsFromSupabase(quizReference);
        }

        return loadQuestionsFromGoogleSheets(quizReference.sheet);
    }

    if (state.activeDataSource === DATA_SOURCES.SUPABASE) {
        return loadQuestionsFromSupabase(quizReference);
    }

    return loadQuestionsFromGoogleSheets(quizReference);
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
    renderGoogleSheetsImportControls();

    return state.quizListCache;
}

function populateQuizDropdown(folderName) {
    resetQuizSelector();

    if (!folderName) {
        return [];
    }

    const quizzesForFolder = state.quizListCache
        .filter(q => q.folder === folderName)
        .sort((a, b) => {
            if (a.source === DATA_SOURCES.FOLDER_DECK && b.source !== DATA_SOURCES.FOLDER_DECK) return -1;
            if (a.source !== DATA_SOURCES.FOLDER_DECK && b.source === DATA_SOURCES.FOLDER_DECK) return 1;
            if (Number(a.sortOrder ?? 0) !== Number(b.sortOrder ?? 0)) {
                return Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
            }
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

    quizzesForFolder.forEach(q => {
        const opt = document.createElement('option');
        opt.value = encodeQuizSelectorValue(q);
        opt.innerText = q.source === DATA_SOURCES.FOLDER_DECK ? 'Study Entire Folder' : q.name;
        elements.quizSelector.appendChild(opt);
    });

    elements.quizSelector.disabled = quizzesForFolder.length === 0;
    return quizzesForFolder;
}

async function loadSelectedQuiz(selectorValue) {
    const selectedQuiz = getQuizBySelectorValue(selectorValue);

    if (!selectedQuiz) {
        throw new Error('Quiz not found');
    }

    const loadedQuestions = await loadQuestionsForQuizDescriptor(selectedQuiz);

    if (!loadedQuestions.length) {
        throw new Error('No state.questions found');
    }

    await applyLoadedQuestions(loadedQuestions);
}

// ================= LOAD QUESTIONS =================
async function loadQuestionsFromGoogleSheets(sheetName) {
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
    elements.optionsContainer.querySelectorAll('.explanation').forEach(exp => {
        exp.innerText = '';
    });
}

function clearOptionFeedback() {
    elements.optionsContainer.querySelectorAll('.option-feedback').forEach(fb => {
        fb.innerText = '';
        fb.classList.remove('correct-mark', 'incorrect-mark');
    });
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
    if (elements.questionStarBtn) {
        elements.questionStarBtn.classList.add('hidden');
    }
}

function getMasteryCheckRemainingCount() {
    if (!isMasteryCheckMode()) return 0;
    if (state.masteryCheckFinished) return 0;

    if (state.masteryCheckInCheckpoint) {
        return Math.max(0, state.masteryCheckResumeQueue.length - state.currentIndex);
    }

    return Math.max(0, state.questionQueue.length - state.currentIndex);
}

function resetMasteryCheckState() {
    state.masteryCheckPendingJump = false;
    state.masteryCheckPendingAdvance = false;
    state.masteryCheckPendingCheckpointStart = false;
    state.masteryCheckPendingCheckpointComplete = false;
    state.masteryCheckInCheckpoint = false;
    state.masteryCheckFinished = false;
    state.masteryCheckSegmentQuestions = [];
    state.masteryCheckSegmentIds = new Set();
    state.masteryCheckCheckpointSolvedIds = new Set();
    state.masteryCheckResumeQueue = [];
    state.masteryCheckResumeIndex = 0;
    state.masteryCheckMasteredIds = new Set();
}

function startMasteryCheckCheckpoint() {
    const checkpointQuestions = [...state.masteryCheckSegmentQuestions];
    const checkpointIds = new Set(checkpointQuestions.map(question => question.id));

    state.masteryCheckResumeQueue = [...state.questionQueue];
    state.masteryCheckResumeIndex = state.questionQueue
        .slice(0, state.currentIndex + 1)
        .filter(question => !checkpointIds.has(question.id)).length;

    state.questionQueue = checkpointQuestions;
    state.currentIndex = 0;
    state.masteryCheckInCheckpoint = true;
    state.masteryCheckCheckpointSolvedIds = new Set();
    state.masteryCheckPendingCheckpointStart = false;
    state.masteryCheckPendingCheckpointComplete = false;
    state.masteryCheckPendingAdvance = false;
    state.masteryCheckPendingJump = false;
    state.masteryCheckSegmentQuestions = [];
    state.masteryCheckSegmentIds = new Set();
}

function finishMasteryCheckCheckpoint() {
    const masteredIds = new Set(state.questionQueue.map(question => question.id));

    masteredIds.forEach(id => state.masteryCheckMasteredIds.add(id));

    const filteredQueue = state.masteryCheckResumeQueue.filter(question => !masteredIds.has(question.id));

    state.questionQueue = filteredQueue;
    state.currentIndex = filteredQueue.length ? Math.min(state.masteryCheckResumeIndex, filteredQueue.length - 1) : 0;
    state.masteryCheckInCheckpoint = false;
    state.masteryCheckCheckpointSolvedIds = new Set();
    state.masteryCheckResumeQueue = [];
    state.masteryCheckResumeIndex = 0;
    state.masteryCheckPendingCheckpointComplete = false;
    state.masteryCheckPendingAdvance = false;
    state.masteryCheckPendingJump = false;

    if (filteredQueue.length === 0) {
        state.masteryCheckFinished = true;
    }
}

// ================= FEEDBACK HELPER =================
function setFeedback(text, isCorrect) {
    const fb = elements.progressSideFeedbackEl;
    if (!fb) return;

    fb.innerText = text;
    fb.classList.remove('correct', 'incorrect');
    fb.classList.add(isCorrect ? 'correct' : 'incorrect');
}

async function persistQuestionStarState(question, isStarred) {
    if (!canPersistQuestionStarState(question)) {
        return false;
    }

    const payload = {
        user_id: state.auth.user.id,
        question_id: question.sourceQuestionId,
        is_starred: !!isStarred
    };

    const { error } = await state.auth.client
        .from('user_question_state')
        .upsert(payload, { onConflict: 'user_id,question_id' });

    if (error) throw error;
    return true;
}

function applyQuestionStarStateAcrossDeck(sourceQuestionId, isStarred) {
    const targetId = normalizeSheetText(sourceQuestionId);
    if (!targetId) return;

    const applyState = question => {
        if (normalizeSheetText(question?.sourceQuestionId) === targetId) {
            question.isStarred = !!isStarred;
        }
    };

    state.sourceQuestions.forEach(applyState);
    state.questions.forEach(applyState);
    state.questionQueue.forEach(applyState);
}

async function toggleCurrentQuestionStarState() {
    const currentQuestion = state.questionQueue[state.currentIndex];
    if (!canPersistQuestionStarState(currentQuestion) || state.auth.starringInFlight) {
        return;
    }

    const nextStarred = !currentQuestion.isStarred;
    state.auth.starringInFlight = true;
    syncQuestionStarButton();

    try {
        await persistQuestionStarState(currentQuestion, nextStarred);
        applyQuestionStarStateAcrossDeck(currentQuestion.sourceQuestionId, nextStarred);

        if (nextStarred && isExcludeStarredEnabled()) {
            applyFilteredQuestionsToSession({ resetSession: false });
        } else {
            syncQuestionStarButton();
            updateProgress();
        }
    } catch (error) {
        console.error('Could not update question star state:', error);
    } finally {
        state.auth.starringInFlight = false;
        syncQuestionStarButton();
    }
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

    updateNavigationButtons();
}

// ================= PROGRESS =================
function getMasteryCheckCompletedForProgressBar(total) {
    if (!isMasteryCheckMode()) return 0;
    if (state.masteryCheckFinished) return total;

    const masteredCount = state.masteryCheckMasteredIds.size;
    return masteredCount + state.currentIndex;
}

function updateProgress() {
    const total = state.questions.length;
    const progressFillEl = document.getElementById('progressFill');
    let remaining = 0;
    let completed = 0;
    let percent = 0;
    let useReviewProgressAppearance = false;

    if (isRetentionMode()) {
        remaining = state.retentionFinished ? 0 : (state.questionQueue.length - state.currentIndex);
        completed = total - remaining;
        percent = total > 0 ? (completed / total) * 100 : 0;
    } else if (isRetryMode()) {
        remaining = state.questionQueue.length;
        completed = total - remaining;
        percent = total > 0 ? (completed / total) * 100 : 0;
    } else if (isMasteryCheckMode()) {
        remaining = state.masteryCheckFinished ? 0 : getMasteryCheckRemainingCount();

        if (state.masteryCheckInCheckpoint) {
            const checkpointTotal = state.questionQueue.length;
            completed = state.currentIndex;
            percent = checkpointTotal > 0 ? (completed / checkpointTotal) * 100 : 0;
            useReviewProgressAppearance = true;
        } else {
            completed = getMasteryCheckCompletedForProgressBar(total);
            percent = total > 0 ? (completed / total) * 100 : 0;
        }
    } else {
        remaining = state.normalFinished ? 0 : (state.questionQueue.length - state.currentIndex);
        completed = total - remaining;
        percent = total > 0 ? (completed / total) * 100 : 0;
    }

    if (remaining < 0) remaining = 0;
    if (remaining > total) remaining = total;
    if (completed < 0) completed = 0;
    if (completed > total) completed = total;
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    elements.progressTextEl.innerText = isNarrowIPhoneViewport() ? `${remaining}` : `${remaining} remaining`;

    if (progressFillEl) {
        progressFillEl.style.width = `${percent}%`;
        progressFillEl.style.background = useReviewProgressAppearance ? '#f4c542' : '';
    }
}

// ================= FINISH CHECK =================
function isQuizFinished() {
    if (isRetentionMode()) return state.retentionFinished;
    if (isRetryMode()) return state.questionQueue.length === 0;
    if (isMasteryCheckMode()) return state.masteryCheckFinished;
    return state.normalFinished;
}

// ================= SHOW QUESTION =================
function showQuestion() {
    if (!state.questions.length) {
        renderSelectionPrompt(state.emptyQuizMessage || 'Choose a folder and a quiz.');
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
        updateNavigationButtons();
        syncQuestionStarButton();
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
        updateNavigationButtons();
        syncQuestionStarButton();
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
    updateNavigationButtons();
    syncQuestionStarButton();
}

// ================= MULTIPLE CHOICE =================
function ensureMultipleChoiceOptionBlocks(count) {
    const container = elements.optionsContainer;
    const getBlocks = () => Array.from(container.querySelectorAll('.option-block'));
    let blocks = getBlocks();

    while (blocks.length < count) {
        const block = document.createElement('div');
        block.className = 'option-block';
        block.innerHTML = `
            <div class="option-row">
              <button class="optionBtn" type="button"></button>
              <div class="option-feedback"></div>
            </div>
            <div class="explanation"></div>
        `;
        container.appendChild(block);
        blocks = getBlocks();
    }

    blocks.forEach((block, index) => {
        block.style.display = index < count ? '' : 'none';
    });

    return getBlocks();
}

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

    const blocks = ensureMultipleChoiceOptionBlocks(Math.max(options.length, 1));

    blocks.forEach((block, index) => {
        const btn = block.querySelector('.optionBtn');
        const exp = block.querySelector('.explanation');
        const fb = block.querySelector('.option-feedback');
        const optionValue = options[index] || '';

        if (index < options.length && btn && exp && fb) {
            block.style.display = '';
            btn.style.display = 'block';
            btn.innerText = optionValue;
            btn.disabled = false;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
            btn.classList.remove('option-correct', 'option-incorrect');
            btn.onclick = () => checkAnswer(optionValue, explanations);
            exp.innerText = '';
            fb.innerText = '';
            fb.classList.remove('correct-mark', 'incorrect-mark');
        } else {
            block.style.display = 'none';
            if (btn) {
                btn.style.display = 'none';
                btn.innerText = '';
                btn.classList.remove('option-correct', 'option-incorrect');
                btn.onclick = null;
            }
            if (exp) exp.innerText = '';
            if (fb) {
                fb.innerText = '';
                fb.classList.remove('correct-mark', 'incorrect-mark');
            }
        }
    });
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

    if (isMasteryCheckMode()) {
        state.masteryCheckPendingJump = true;
        state.masteryCheckPendingAdvance = false;
        state.masteryCheckPendingCheckpointComplete = false;
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

    if (isMasteryCheckMode()) {
        state.masteryCheckPendingJump = false;

        if (state.masteryCheckInCheckpoint) {
            state.masteryCheckCheckpointSolvedIds.add(q.id);

            if (state.masteryCheckCheckpointSolvedIds.size === state.questionQueue.length) {
                state.masteryCheckPendingCheckpointComplete = true;
                state.masteryCheckPendingAdvance = false;
            } else {
                state.masteryCheckPendingAdvance = true;
            }

            return;
        }

        if (!state.masteryCheckSegmentIds.has(q.id) && !state.masteryCheckMasteredIds.has(q.id)) {
            state.masteryCheckSegmentIds.add(q.id);
            state.masteryCheckSegmentQuestions.push(q);
        }

        const atCheckpointBoundary = state.masteryCheckSegmentQuestions.length >= 10;
        const atEndOfRemainingPool = state.currentIndex >= state.questionQueue.length - 1;

        if (atCheckpointBoundary || (atEndOfRemainingPool && state.masteryCheckSegmentQuestions.length > 0)) {
            state.masteryCheckPendingCheckpointStart = true;
            state.masteryCheckPendingAdvance = false;
        } else {
            state.masteryCheckPendingAdvance = true;
        }

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

    elements.optionsContainer.querySelectorAll('.option-block').forEach((block, i) => {
        if (block.style.display === 'none') return;
        const btn = block.querySelector('.optionBtn');
        const explanationEl = block.querySelector('.explanation');
        const feedbackEl = block.querySelector('.option-feedback');
        if (!btn || !explanationEl || !feedbackEl) return;

        btn.classList.remove('option-correct', 'option-incorrect');
        explanationEl.innerText = explanations[i] || '';

        if (btn.innerText === q.correct) {
            btn.classList.add('option-correct');
        } else if (btn.innerText === selected && !isCorrect) {
            btn.classList.add('option-incorrect');
        }

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

        if (item.imageUrl) {
            btn.classList.add('is-image-item');

            const img = document.createElement('img');
            img.className = 'classify-item-image';
            img.src = item.imageUrl;
            img.alt = item.text || 'Classify image item';
            img.draggable = false;
            content.appendChild(img);

            if (item.text) {
                const textSpan = document.createElement('div');
                textSpan.className = 'classify-item-text classify-item-image-text';
                textSpan.innerText = item.text;
                content.appendChild(textSpan);
            }

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
            if (classification.imageUrl) {
                const headerImageWrap = document.createElement('div');
                headerImageWrap.className = 'classify-category-header-image-wrap';

                const headerImg = document.createElement('img');
                headerImg.className = 'classify-category-header-image';
                headerImg.src = classification.imageUrl;
                headerImg.alt = classification.label || 'Category image';
                headerImageWrap.appendChild(headerImg);

                const zoomBtn = document.createElement('button');
                zoomBtn.type = 'button';
                zoomBtn.className = 'classify-item-zoom-btn classify-category-zoom-btn';
                zoomBtn.setAttribute('aria-label', 'Zoom category image');
                zoomBtn.setAttribute('title', 'Zoom image');
                zoomBtn.innerText = '⤢';

                const stopZoomTrigger = e => {
                    e.preventDefault();
                    e.stopPropagation();
                };

                zoomBtn.addEventListener('pointerdown', stopZoomTrigger);
                zoomBtn.addEventListener('click', e => {
                    stopZoomTrigger(e);
                    openFlashcardImageOverlay(classification.imageUrl, classification.label || 'Category image');
                });

                headerImageWrap.appendChild(zoomBtn);
                header.appendChild(headerImageWrap);
            }
            if (classification.label) {
                const headerText = document.createElement('div');
                headerText.className = 'classify-category-header-text';
                headerText.innerText = classification.label;
                header.appendChild(headerText);
            } else if (!classification.imageUrl) {
                header.innerText = 'Category';
            }

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

    if (isMasteryCheckMode()) {
        if (state.masteryCheckPendingJump) {
            state.currentIndex = Math.max(0, state.currentIndex - 3);
            state.masteryCheckPendingJump = false;
            state.masteryCheckPendingAdvance = false;
            showQuestion();
            showPendingLearningResourceIfAny();
            return;
        }

        if (state.masteryCheckPendingCheckpointComplete) {
            finishMasteryCheckCheckpoint();
            showQuestion();
            showPendingLearningResourceIfAny();
            return;
        }

        if (state.masteryCheckPendingCheckpointStart) {
            startMasteryCheckCheckpoint();
            showQuestion();
            showPendingLearningResourceIfAny();
            return;
        }

        if (state.masteryCheckPendingAdvance) {
            state.masteryCheckPendingAdvance = false;

            if (state.currentIndex < state.questionQueue.length - 1) {
                state.currentIndex++;
            } else if (!state.masteryCheckInCheckpoint && state.masteryCheckSegmentQuestions.length === 0) {
                state.masteryCheckFinished = true;
            }

            showQuestion();
            showPendingLearningResourceIfAny();
            return;
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

    if (isMasteryCheckMode()) {
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
    resetMasteryCheckState();

    state.normalFinished = false;
    state.questionAnswered = false;
    state.flashcardFlipped = false;
    state.currentQuestionType = '';
    state.emptyQuizMessage = '';
    updateViewportClasses();

    clearPendingLearningResource();
    closeLearningResourcesOverlay();
    closeFlashcardImageOverlay();
}

// ================= RESTART =================
function restartQuiz() {
    if (!state.sourceQuestions.length && !state.questions.length) {
        clearActiveQuizSelection();
        return;
    }

    if (state.sourceQuestions.length) {
        applyFilteredQuestionsToSession({ resetSession: true });
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
        document.getElementById('masteryCheckMode').checked = false;
    }
    updateSettingsAvailability();
    restartQuiz();
};

document.getElementById('masteryMode').onchange = e => {
    if (e.target.checked) {
        document.getElementById('retentionMode').checked = false;
        document.getElementById('masteryCheckMode').checked = false;
    }
    updateSettingsAvailability();
    restartQuiz();
};

document.getElementById('masteryCheckMode').onchange = e => {
    if (e.target.checked) {
        document.getElementById('retentionMode').checked = false;
        document.getElementById('masteryMode').checked = false;
    }
    updateSettingsAvailability();
    restartQuiz();
};

document.getElementById('rapidMode').onchange = e => {
    if (e.target.checked && isLearningResourcesMode() && !isMasteryCheckMode()) {
        document.getElementById('learningResourcesMode').checked = false;
    }
    updateSettingsAvailability();
    restartQuiz();
};

document.getElementById('learningResourcesMode').onchange = e => {
    if (e.target.checked && isSpeedMode() && !isMasteryCheckMode()) {
        document.getElementById('rapidMode').checked = false;
    }
    updateSettingsAvailability();
};

if (elements.excludeStarredQuestions) {
    elements.excludeStarredQuestions.addEventListener('change', () => {
        if (!state.sourceQuestions.length) {
            updateSettingsAvailability();
            return;
        }
        applyFilteredQuestionsToSession({ resetSession: true });
    });
}

if (elements.questionStarBtn) {
    elements.questionStarBtn.addEventListener('click', () => {
        toggleCurrentQuestionStarState().catch(err => {
            console.error(err);
        });
    });
}

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

    clearActiveQuizSelection('Choose a quiz or study the whole folder.');
});

elements.quizSelector.addEventListener('change', async e => {
    setMixValidState(true);

    const selectedQuiz = e.target.value;

    if (!selectedQuiz) {
        clearActiveQuizSelection(elements.folderSelector.value ? 'Choose a quiz or study the whole folder.' : 'Choose a folder and a quiz.');
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

if (elements.authBtn) {
    elements.authBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleAuthPopup();
    });
}

if (elements.closeAuthBtn) {
    elements.closeAuthBtn.addEventListener('click', e => {
        e.stopPropagation();
        closeAuthPopup();
    });
}

if (elements.authSignInBtn) {
    elements.authSignInBtn.addEventListener('click', () => {
        handleAuthSignIn().catch(err => {
            console.error(err);
            setAuthStatus('Sign in failed.', 'error');
        });
    });
}

if (elements.authSignUpBtn) {
    elements.authSignUpBtn.addEventListener('click', () => {
        handleAuthSignUp().catch(err => {
            console.error(err);
            setAuthStatus('Sign up failed.', 'error');
        });
    });
}

if (elements.authSignOutBtn) {
    elements.authSignOutBtn.addEventListener('click', () => {
        handleAuthSignOut().catch(err => {
            console.error(err);
            setAuthStatus('Sign out failed.', 'error');
        });
    });
}

if (elements.createFolderBtn) {
    elements.createFolderBtn.addEventListener('click', () => {
        handleCreateFolder().catch(err => {
            console.error(err);
            setCreatorStatus('Could not create the folder.', 'error');
        });
    });
}

if (elements.openQuizStudioBtn) {
    elements.openQuizStudioBtn.addEventListener('click', () => {
        openQuizStudioPage('folders');
    });
}

elements.quizStudioSectionButtons.forEach(button => {
    button.addEventListener('click', () => {
        setQuizStudioSection(button.dataset.studioSectionTarget || 'folders');
    });
});

if (elements.closeQuizStudioBtn) {
    elements.closeQuizStudioBtn.addEventListener('click', () => {
        closeQuizStudioPage();
    });
}

if (elements.quizStudioPage) {
    elements.quizStudioPage.addEventListener('click', e => {
        if (e.target === elements.quizStudioPage) {
            closeQuizStudioPage();
        }
    });
}

if (elements.addOptionFieldBtn) {
    elements.addOptionFieldBtn.addEventListener('click', () => {
        addStudioOptionField();
    });
}

if (elements.removeOptionFieldBtn) {
    elements.removeOptionFieldBtn.addEventListener('click', () => {
        removeStudioOptionField();
    });
}

if (elements.addHierarchyItemBtn) {
    elements.addHierarchyItemBtn.addEventListener('click', () => {
        addStudioHierarchyField();
    });
}

if (elements.removeHierarchyItemBtn) {
    elements.removeHierarchyItemBtn.addEventListener('click', () => {
        removeStudioHierarchyField();
    });
}

if (elements.addClassifyCategoryBtn) {
    elements.addClassifyCategoryBtn.addEventListener('click', () => {
        addStudioClassifyCategoryField();
    });
}

if (elements.removeClassifyCategoryBtn) {
    elements.removeClassifyCategoryBtn.addEventListener('click', () => {
        removeStudioClassifyCategoryField();
    });
}

if (elements.addClassifyItemBtn) {
    elements.addClassifyItemBtn.addEventListener('click', () => {
        addStudioClassifyItemField();
    });
}

if (elements.removeClassifyItemBtn) {
    elements.removeClassifyItemBtn.addEventListener('click', () => {
        removeStudioClassifyItemField();
    });
}

if (elements.createClassifyCategoriesContainer) {
    elements.createClassifyCategoriesContainer.addEventListener('change', event => {
        const fileInput = event.target.closest('[data-classify-category-image-file]');
        if (!fileInput) return;
        const row = fileInput.closest('[data-classify-category-index]');
        readFileAsDataUrl(fileInput.files?.[0]).then(dataUrl => {
            setStudioClassifyRowImageState(row, 'category', dataUrl, fileInput.files?.[0] ? `Selected: ${fileInput.files[0].name}` : '');
            refreshStudioClassifyItemCategoryOptions();
        }).catch(err => {
            console.error(err);
            setCreatorStatus('Could not load the category image.', 'error');
        });
    });

    elements.createClassifyCategoriesContainer.addEventListener('click', event => {
        const clearBtn = event.target.closest('[data-classify-category-image-clear]');
        if (!clearBtn) return;
        const row = clearBtn.closest('[data-classify-category-index]');
        setStudioClassifyRowImageState(row, 'category');
        refreshStudioClassifyItemCategoryOptions();
    });

    elements.createClassifyCategoriesContainer.addEventListener('input', event => {
        if (event.target.closest('[data-classify-category-label]')) {
            refreshStudioClassifyItemCategoryOptions();
        }
    });
}

if (elements.createClassifyItemsContainer) {
    elements.createClassifyItemsContainer.addEventListener('change', event => {
        const fileInput = event.target.closest('[data-classify-item-image-file]');
        if (!fileInput) return;
        const row = fileInput.closest('[data-classify-item-index]');
        readFileAsDataUrl(fileInput.files?.[0]).then(dataUrl => {
            setStudioClassifyRowImageState(row, 'item', dataUrl, fileInput.files?.[0] ? `Selected: ${fileInput.files[0].name}` : '');
        }).catch(err => {
            console.error(err);
            setCreatorStatus('Could not load the item image.', 'error');
        });
    });

    elements.createClassifyItemsContainer.addEventListener('click', event => {
        const clearBtn = event.target.closest('[data-classify-item-image-clear]');
        if (!clearBtn) return;
        const row = clearBtn.closest('[data-classify-item-index]');
        setStudioClassifyRowImageState(row, 'item');
    });
}

if (elements.createQuizTypeSelect) {
    elements.createQuizTypeSelect.addEventListener('change', () => {
        if (state.auth.editingQuizId) {
            elements.createQuizTypeSelect.value = state.auth.editingQuizType;
            return;
        }
        state.auth.editingQuizType = normalizeSheetText(elements.createQuizTypeSelect.value || 'multiple_choice') || 'multiple_choice';
        updateCreateQuizModeUI();
    });
}

if (elements.createQuizBtn) {
    elements.createQuizBtn.addEventListener('click', () => {
        handleSaveStudioQuiz().catch(err => {
            console.error(err);
            setCreatorStatus('Could not save the quiz.', 'error');
        });
    });
}

if (elements.createQuizCancelEditBtn) {
    elements.createQuizCancelEditBtn.addEventListener('click', () => {
        clearCreatorInputs();
        setQuizStudioSection('editor');
        setCreatorStatus('Ready to create a new quiz.');
    });
}

if (elements.studioAddQuestionBtn) {
    elements.studioAddQuestionBtn.addEventListener('click', () => {
        beginStudioNewQuestion();
    });
}

if (elements.studioDuplicateQuestionBtn) {
    elements.studioDuplicateQuestionBtn.addEventListener('click', () => {
        handleDuplicateStudioQuestion().catch(err => {
            console.error(err);
            setCreatorStatus('Could not duplicate the question.', 'error');
        });
    });
}

if (elements.studioDeleteQuestionBtn) {
    elements.studioDeleteQuestionBtn.addEventListener('click', () => {
        handleDeleteStudioQuestion().catch(err => {
            console.error(err);
            setCreatorStatus('Could not delete the question.', 'error');
        });
    });
}

if (elements.studioMoveQuestionUpBtn) {
    elements.studioMoveQuestionUpBtn.addEventListener('click', () => {
        handleMoveStudioQuestion('up').catch(err => {
            console.error(err);
            setCreatorStatus('Could not move the question.', 'error');
        });
    });
}

if (elements.studioMoveQuestionDownBtn) {
    elements.studioMoveQuestionDownBtn.addEventListener('click', () => {
        handleMoveStudioQuestion('down').catch(err => {
            console.error(err);
            setCreatorStatus('Could not move the question.', 'error');
        });
    });
}

if (elements.studioQuestionList) {
    elements.studioQuestionList.addEventListener('click', e => {
        const insertButton = e.target.closest('[data-studio-insert-after-question-id]');
        if (insertButton) {
            beginStudioNewQuestion(insertButton.dataset.studioInsertAfterQuestionId);
            return;
        }

        const button = e.target.closest('[data-studio-question-id]');
        if (!button) return;

        loadStudioQuestionIntoEditor(button.dataset.studioQuestionId).catch(err => {
            console.error(err);
            setCreatorStatus('Could not load that question.', 'error');
        });
    });
}

if (elements.createQuestionImageFile) {
    elements.createQuestionImageFile.addEventListener('change', () => {
        handleStudioFileInput(elements.createQuestionImageFile, 'question').catch(err => {
            console.error(err);
            setCreatorStatus('Could not load the question image.', 'error');
        });
    });
}

if (elements.createQuestionImageClearBtn) {
    elements.createQuestionImageClearBtn.addEventListener('click', () => {
        setStudioQuestionImageState();
    });
}

if (elements.createLearningResourcesImageFile) {
    elements.createLearningResourcesImageFile.addEventListener('change', () => {
        handleStudioFileInput(elements.createLearningResourcesImageFile, 'learning').catch(err => {
            console.error(err);
            setCreatorStatus('Could not load the learning resources image.', 'error');
        });
    });
}

if (elements.createLearningResourcesImageClearBtn) {
    elements.createLearningResourcesImageClearBtn.addEventListener('click', () => {
        setStudioLearningResourcesImageState();
    });
}


if (elements.createFlashcardTermImageClearBtn) {
    elements.createFlashcardTermImageClearBtn.addEventListener('click', () => {
        setStudioFlashcardTermImageState();
    });
}

if (elements.createFlashcardDefinitionImageClearBtn) {
    elements.createFlashcardDefinitionImageClearBtn.addEventListener('click', () => {
        setStudioFlashcardDefinitionImageState();
    });
}

if (elements.studioFolderList) {
    elements.studioFolderList.addEventListener('click', e => {
        const item = e.target.closest('[data-folder-id]');
        if (!item) return;

        const folderId = item.dataset.folderId;
        if (e.target.matches('[data-action="save-folder"]')) {
            const input = item.querySelector('[data-folder-rename-input]');
            handleRenameFolder(folderId, input?.value || '').catch(err => {
                console.error(err);
                setCreatorStatus('Could not update the folder.', 'error');
            });
        }

        if (e.target.matches('[data-action="delete-folder"]')) {
            handleDeleteFolder(folderId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not delete the folder.', 'error');
            });
        }
    });
}

if (elements.studioQuizList) {
    elements.studioQuizList.addEventListener('click', e => {
        const item = e.target.closest('[data-quiz-id]');
        if (!item) return;

        const quizId = item.dataset.quizId;
        if (e.target.matches('[data-action="save-quiz"]')) {
            const nameInput = item.querySelector('[data-quiz-rename-input]');
            const folderSelect = item.querySelector('[data-quiz-folder-select]');
            handleSaveQuizMeta(quizId, nameInput?.value || '', folderSelect?.value || '').catch(err => {
                console.error(err);
                setCreatorStatus('Could not update the quiz.', 'error');
            });
        }

        if (e.target.matches('[data-action="edit-quiz"]')) {
            loadQuizIntoEditor(quizId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not load the quiz editor.', 'error');
            });
        }

        if (e.target.matches('[data-action="duplicate-quiz"]')) {
            handleDuplicateQuiz(quizId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not duplicate the quiz.', 'error');
            });
        }

        if (e.target.matches('[data-action="delete-quiz"]')) {
            handleDeleteQuiz(quizId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not delete the quiz.', 'error');
            });
        }

        if (e.target.matches('[data-action="load-quiz"]')) {
            refreshQuizCatalog({ selectQuizId: `sb:${quizId}`, loadSelectedQuiz: true }).catch(err => {
                console.error(err);
                setCreatorStatus('Could not load the quiz into the study view.', 'error');
            });
        }
    });
}

if (elements.importSourceFolderSelect) {
    elements.importSourceFolderSelect.addEventListener('change', () => {
        renderGoogleSheetsImportControls();
    });
}

if (elements.importEntireFolderSourceSelect) {
    elements.importEntireFolderSourceSelect.addEventListener('change', () => {
        renderGoogleSheetsImportControls();
    });
}

if (elements.importSourceQuizBtn) {
    elements.importSourceQuizBtn.addEventListener('click', () => {
        handleImportGoogleSheetsQuiz().catch(err => {
            console.error(err);
            setCreatorStatus('Could not import the Google Sheets quiz.', 'error');
        });
    });
}

if (elements.importSourceFolderBtn) {
    elements.importSourceFolderBtn.addEventListener('click', () => {
        handleImportGoogleSheetsFolder().catch(err => {
            console.error(err);
            setCreatorStatus('Could not import the Google Sheets folder.', 'error');
        });
    });
}

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

    if (elements.authPopup && !elements.authPopup.classList.contains('hidden') && !elements.authPopup.contains(e.target) && e.target !== elements.authBtn) {
        closeAuthPopup();
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

        if (elements.authPopup && !elements.authPopup.classList.contains('hidden')) {
            closeAuthPopup();
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
        mountFloatingPagesToBody();
        renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '' })));
        applyResponsiveControlText();
        updateViewportClasses();
        updateAuthUI();
        await bootstrapSupabase();

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
