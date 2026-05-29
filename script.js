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
        studioAutosaveDelayMs: 10 * 60 * 1000,
        studyTimerStorageKey: 'studyBunnyTimerSettingsV1',
        autoStarStorageKey: 'studyBunnyAutoStarSettingsV1',
        unstarOnWrongStorageKey: 'studyBunnyUnstarOnWrongSettingsV1',
        hideAnswerFeedbackStorageKey: 'studyBunnyHideAnswerFeedbackSettingsV1',
        globalShuffleAnswersStorageKey: 'studyBunnyGlobalShuffleAnswersSettingsV1',
        classifyItemCount: 50,
        classifyClassCount: 50,
        dataSource: 'google_sheets',
        supabase: {
            url: String(window.STUDY_BUNNY_SUPABASE_CONFIG?.url || '').trim(),
            publishableKey: String(window.STUDY_BUNNY_SUPABASE_CONFIG?.publishableKey || '').trim()
        },
        mediaAssets: {
            bucketName: 'study-bunny-media',
            referencePrefix: 'sb-media:',
            signedUrlExpiresIn: 3600
        }
    };

    const DATA_SOURCES = Object.freeze({
        GOOGLE_SHEETS: 'google_sheets',
        SUPABASE: 'supabase',
        FOLDER_DECK: 'folder_deck'
    });

    const QUIZ_CHALLENGES = Object.freeze([
        {
            key: 'mastery_shuffle_answers',
            mode: 'mastery',
            title: 'Mastery Challenge',
            shortLabel: 'M',
            trophy: '🏆',
            description: 'Complete Mastery mode with locked challenge settings.'
        },
        {
            key: 'retention_shuffle_answers',
            mode: 'retention',
            title: 'Retention Challenge',
            shortLabel: 'R',
            trophy: '🏆',
            description: 'Complete Retention mode with locked challenge settings.'
        },
        {
            key: 'mastery_check_shuffle_answers',
            mode: 'mastery_check',
            title: 'Mastery Check Challenge',
            shortLabel: 'C',
            trophy: '🏆',
            description: 'Complete Mastery Check with locked challenge settings.'
        },
        {
            key: 'progress_shuffle_answers',
            mode: 'progress',
            title: 'Progress Challenge',
            shortLabel: 'P',
            trophy: '🏆',
            description: 'Complete Progress mode with locked challenge settings.'
        }
    ]);

    const QUIZ_CHALLENGE_GRAND_KEY = 'all_shuffle_mode_trophies';
    const QUIZ_CHALLENGE_TABLE = 'user_quiz_challenge_achievements';
    const STUDIO_ACTIVITY_TABLE = 'user_studio_activity';

    const STUDIO_PENDING_NEW_FLASHCARD_ID = '__pending_new_flashcard__';
    const STUDIO_LOCAL_FLASHCARD_PREFIX = '__local_flashcard__';
    const STUDIO_FOCUS_NEW_QUESTION_ID = '__studio_focus_new_question__';

    const state = {
        questions: [],
        questionQueue: [],
        currentIndex: 0,
        questionIdCounter: 0,
        quizListCache: [],
        googleSheetsImportQuizzes: [],
        sourceQuestions: [],
        emptyQuizMessage: '',
        activeQuizDescriptor: null,
        activeQuizChallenge: null,
        studyTimer: {
            enabled: false,
            scope: 'question',
            preset: '60',
            customSeconds: 60,
            activeKey: '',
            deadlineMs: 0,
            remainingMs: 0,
            intervalId: null,
            expired: false,
            sessionToken: 0
        },
        autoStar: {
            enabled: false,
            preset: '5',
            customSeconds: 5,
            currentAttemptKey: '',
            currentQuestionKey: '',
            questionStartedAt: 0,
            disqualifiedQuestionKeys: new Set(),
            pendingQuestionKeys: new Set(),
            excludedQuestionKeys: new Set()
        },
        unstarOnWrong: {
            enabled: false,
            pendingQuestionKeys: new Set()
        },
        answerFeedback: {
            hidden: false
        },
        globalShuffleAnswers: {
            enabled: false
        },
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
        progressRetryActive: false,
        progressWrongQuestionMap: new Map(),
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
            quizChallengeAchievements: new Map(),
            quizChallengeUnavailable: false,
            studioActivity: { quizzes: new Map(), folders: new Map(), unavailable: false },
            expandedQuizChallengeIds: new Set(),
            openQuizActionMenuId: '',
            studioQuizSearchQuery: '',
            studioQuizFolderFilterId: '',
            studioFolderSearchQuery: '',
            quizStudioOpen: false,
            studioQuestionImageDataUrl: '',
            studioQuestionImageLabel: 'No question image selected.',
            studioQuestionImagePanelOpen: false,
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
            currentStudioSection: 'home',
            lastError: '',
            starringInFlight: false,
            studioQuestionSearchQuery: '',
            studioQuestionStarredOnly: false,
            studioActiveBuildUpString: '',
            studioFocusedBuildUpString: '',
            studioFocusedQuestionId: '',
            studioHasUnsavedChanges: false,
            studioAutosaveTimerId: null,
            studioAutosaveInFlight: false,
            studioQuestionDrafts: new Map(),
            studioAutosaveQuiet: false,
            studioDraggingQuestionId: null,
            studioPendingNewQuestionRow: null,
            localFlashcardDraftCounter: 0,
            backupImportPayload: null,
            backupImportFileName: '',
            mediaSignedUrlCache: new Map(),
            mathChemToolsExpanded: false,
            expandedOptionImageRows: new Set(),
            expandedClassifyCategoryImageRows: new Set(),
            expandedClassifyItemImageRows: new Set(),
            studioDiagramDraggingIndex: null,
            studioDiagramLabels: [],
            studioDiagramSharing: {
                useSharedImage: false,
                useSharedLabels: false,
                sharedImageUrl: '',
                sharedImageLabel: '',
                sharedImageName: '',
                sharedLabels: [],
                sourceQuestionId: '',
                questionOverride: false
            }
        }
    };

    const elements = {
        folderSelector: document.getElementById('folderSelector'),
        quizSelector: document.getElementById('quizSelector'),
        authBtn: document.getElementById('authBtn'),
        studioHomeBtn: document.getElementById('studioHomeBtn'),
        authPopup: document.getElementById('authPopup'),
        closeAuthBtn: document.getElementById('closeAuthBtn'),
        authStatus: document.getElementById('authStatus'),
        authSessionSummary: document.getElementById('authSessionSummary'),
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
        studioRecentQuizList: document.getElementById('studioRecentQuizList'),
        studioRecentFolderList: document.getElementById('studioRecentFolderList'),
        studioProgressPanel: document.getElementById('studioProgressPanel'),
        studioFolderSearchInput: document.getElementById('studioFolderSearchInput'),
        studioQuizSearchInput: document.getElementById('studioQuizSearchInput'),
        studioQuizFolderFilterSelect: document.getElementById('studioQuizFolderFilterSelect'),
        studioQuizClearFiltersBtn: document.getElementById('studioQuizClearFiltersBtn'),
        studioQuizFilterStatus: document.getElementById('studioQuizFilterStatus'),
        exportQuizSelect: document.getElementById('exportQuizSelect'),
        exportFolderSelect: document.getElementById('exportFolderSelect'),
        exportQuizBtn: document.getElementById('exportQuizBtn'),
        exportFolderBtn: document.getElementById('exportFolderBtn'),
        exportAllBtn: document.getElementById('exportAllBtn'),
        importBackupFile: document.getElementById('importBackupFile'),
        previewBackupImportBtn: document.getElementById('previewBackupImportBtn'),
        importBackupBtn: document.getElementById('importBackupBtn'),
        importBackupPreview: document.getElementById('importBackupPreview'),
        studioTemplateDownloadButtons: Array.from(document.querySelectorAll('[data-template-download]')),
        studioFolderList: document.getElementById('studioFolderList'),
        studioQuizList: document.getElementById('studioQuizList'),
        importSourceFolderSelect: document.getElementById('importSourceFolderSelect'),
        importSourceQuizSelect: document.getElementById('importSourceQuizSelect'),
        importSourceDestinationModeSelect: document.getElementById('importSourceDestinationModeSelect'),
        importSourceAppendQuizField: document.getElementById('importSourceAppendQuizField'),
        importSourceAppendQuizSelect: document.getElementById('importSourceAppendQuizSelect'),
        importSourceTargetFolderField: document.getElementById('importSourceTargetFolderField'),
        importTargetFolderSelect: document.getElementById('importTargetFolderSelect'),
        importSourceQuizBtn: document.getElementById('importSourceQuizBtn'),
        importEntireFolderSourceSelect: document.getElementById('importEntireFolderSourceSelect'),
        importEntireFolderTargetSelect: document.getElementById('importEntireFolderTargetSelect'),
        importSourceFolderBtn: document.getElementById('importSourceFolderBtn'),
        importTemplateSheetInput: document.getElementById('importTemplateSheetInput'),
        importTemplateTabInput: document.getElementById('importTemplateTabInput'),
        importTemplateDestinationModeSelect: document.getElementById('importTemplateDestinationModeSelect'),
        importTemplateAppendQuizField: document.getElementById('importTemplateAppendQuizField'),
        importTemplateAppendQuizSelect: document.getElementById('importTemplateAppendQuizSelect'),
        importTemplateQuizNameField: document.getElementById('importTemplateQuizNameField'),
        importTemplateQuizNameInput: document.getElementById('importTemplateQuizNameInput'),
        importTemplateTargetFolderField: document.getElementById('importTemplateTargetFolderField'),
        importTemplateTargetFolderSelect: document.getElementById('importTemplateTargetFolderSelect'),
        importTemplateSheetBtn: document.getElementById('importTemplateSheetBtn'),
        createFolderName: document.getElementById('createFolderName'),
        createFolderBtn: document.getElementById('createFolderBtn'),
        createQuizFolderSelect: document.getElementById('createQuizFolderSelect'),
        createQuizFolderNewBtn: document.getElementById('createQuizFolderNewBtn'),
        createQuizFolderInlineCreator: document.getElementById('createQuizFolderInlineCreator'),
        createQuizNewFolderName: document.getElementById('createQuizNewFolderName'),
        createQuizNewFolderCreateBtn: document.getElementById('createQuizNewFolderCreateBtn'),
        createQuizNewFolderCancelBtn: document.getElementById('createQuizNewFolderCancelBtn'),
        createQuizName: document.getElementById('createQuizName'),
        createQuizTypeSelect: document.getElementById('createQuizTypeSelect'),
        studioQuestionList: document.getElementById('studioQuestionList'),
        studioQuestionSearchInput: document.getElementById('studioQuestionSearchInput'),
        studioQuestionStarredOnly: document.getElementById('studioQuestionStarredOnly'),
        studioQuestionJumpInput: document.getElementById('studioQuestionJumpInput'),
        studioQuestionJumpBtn: document.getElementById('studioQuestionJumpBtn'),
        studioUnsavedChangesIndicator: document.getElementById('studioUnsavedChangesIndicator'),
        studioStudyQuizBtn: document.getElementById('studioStudyQuizBtn'),
        studioQuestionPositionLabel: document.getElementById('studioQuestionPositionLabel'),
        studioPrevQuestionBtn: document.getElementById('studioPrevQuestionBtn'),
        studioNextQuestionBtn: document.getElementById('studioNextQuestionBtn'),
        studioPrevQuestionBottomBtn: document.getElementById('studioPrevQuestionBottomBtn'),
        studioNextQuestionBottomBtn: document.getElementById('studioNextQuestionBottomBtn'),
        studioAddQuestionBtn: document.getElementById('studioAddQuestionBtn'),
        studioAddQuestionBottomBtn: document.getElementById('studioAddQuestionBottomBtn'),
        studioDuplicateQuestionBtn: document.getElementById('studioDuplicateQuestionBtn'),
        studioDuplicateQuestionBottomBtn: document.getElementById('studioDuplicateQuestionBottomBtn'),
        studioDeleteQuestionBtn: document.getElementById('studioDeleteQuestionBtn'),
        studioMoveQuestionUpBtn: document.getElementById('studioMoveQuestionUpBtn'),
        studioMoveQuestionDownBtn: document.getElementById('studioMoveQuestionDownBtn'),
        createQuestionPrompt: document.getElementById('createQuestionPrompt'),
        createQuestionImageToggleRow: document.getElementById('createQuestionImageToggleRow'),
        createQuestionImageToggleBtn: document.getElementById('createQuestionImageToggleBtn'),
        createQuestionImagePanel: document.getElementById('createQuestionImagePanel'),
        createQuestionImageFile: document.getElementById('createQuestionImageFile'),
        createQuestionImageName: document.getElementById('createQuestionImageName'),
        createQuestionImageClearBtn: document.getElementById('createQuestionImageClearBtn'),
        sharedQuestionEditorFields: document.getElementById('sharedQuestionEditorFields'),
        multipleChoiceEditorFields: document.getElementById('multipleChoiceEditorFields'),
        hierarchyEditorFields: document.getElementById('hierarchyEditorFields'),
        classifyEditorFields: document.getElementById('classifyEditorFields'),
        diagramEditorFields: document.getElementById('diagramEditorFields'),
        studioDiagramPreview: document.getElementById('studioDiagramPreview'),
        studioDiagramPreviewImage: document.getElementById('studioDiagramPreviewImage'),
        studioDiagramPreviewWrap: document.getElementById('studioDiagramPreviewWrap'),
        studioDiagramLabelLayer: document.getElementById('studioDiagramLabelLayer'),
        studioDiagramEmptyState: document.getElementById('studioDiagramEmptyState'),
        diagramLabelList: document.getElementById('diagramLabelList'),
        addDiagramLabelBtn: document.getElementById('addDiagramLabelBtn'),
        removeDiagramLabelBtn: document.getElementById('removeDiagramLabelBtn'),
        useSharedDiagramImage: document.getElementById('useSharedDiagramImage'),
        reuseSharedDiagramLabels: document.getElementById('reuseSharedDiagramLabels'),
        overrideSharedDiagramQuestion: document.getElementById('overrideSharedDiagramQuestion'),
        goToSharedDiagramSourceBtn: document.getElementById('goToSharedDiagramSourceBtn'),
        diagramSharingStatus: document.getElementById('diagramSharingStatus'),
        flashcardEditorFields: document.getElementById('flashcardEditorFields'),
        createFlashcardTerm: document.getElementById('createFlashcardTerm'),
        createFlashcardDefinition: document.getElementById('createFlashcardDefinition'),
        createFlashcardTermImageFile: document.getElementById('createFlashcardTermImageFile'),
        createFlashcardTermImageName: document.getElementById('createFlashcardTermImageName'),
        createFlashcardTermImageClearBtn: document.getElementById('createFlashcardTermImageClearBtn'),
        createFlashcardDefinitionImageFile: document.getElementById('createFlashcardDefinitionImageFile'),
        createFlashcardDefinitionImageName: document.getElementById('createFlashcardDefinitionImageName'),
        createFlashcardDefinitionImageClearBtn: document.getElementById('createFlashcardDefinitionImageClearBtn'),
        flashcardRichToolbar: document.getElementById('flashcardRichToolbar'),
        createFlashcardFontFamilyBtn: document.getElementById('createFlashcardFontFamilyBtn'),
        createFlashcardFontSizeBtn: document.getElementById('createFlashcardFontSizeBtn'),
        createFlashcardJustifyBtn: document.getElementById('createFlashcardJustifyBtn'),
        createFlashcardColorBtn: document.getElementById('createFlashcardColorBtn'),
        createFlashcardColor: document.getElementById('createFlashcardColor'),
        flashcardRichControls: Array.from(document.querySelectorAll('[data-flashcard-rich-control]')),
        flashcardRichMenuTriggers: Array.from(document.querySelectorAll('[data-flashcard-rich-menu-trigger]')),
        flashcardRichMenus: Array.from(document.querySelectorAll('[data-flashcard-rich-menu]')),
        flashcardRichStyleButtons: Array.from(document.querySelectorAll('[data-flashcard-rich-style]')),
        flashcardRichCommandChoices: Array.from(document.querySelectorAll('[data-flashcard-rich-command-choice]')),
        createLearningResources: document.getElementById('createLearningResources'),
        createLearningResourcesFontFamilyBtn: document.getElementById('createLearningResourcesFontFamilyBtn'),
        createLearningResourcesFontSizeBtn: document.getElementById('createLearningResourcesFontSizeBtn'),
        createLearningResourcesJustifyBtn: document.getElementById('createLearningResourcesJustifyBtn'),
        createLearningResourcesColorBtn: document.getElementById('createLearningResourcesColorBtn'),
        createLearningResourcesColor: document.getElementById('createLearningResourcesColor'),
        createLearningResourcesRichControls: Array.from(document.querySelectorAll('[data-learning-rich-control]')),
        createLearningResourcesRichMenuTriggers: Array.from(document.querySelectorAll('[data-rich-menu-trigger]')),
        createLearningResourcesRichMenus: Array.from(document.querySelectorAll('[data-rich-menu]')),
        createLearningResourcesRichStyleButtons: Array.from(document.querySelectorAll('[data-rich-style]')),
        createLearningResourcesRichCommandChoices: Array.from(document.querySelectorAll('[data-rich-command-choice]')),
        createLearningResourcesImageFile: document.getElementById('createLearningResourcesImageFile'),
        createLearningResourcesImageName: document.getElementById('createLearningResourcesImageName'),
        createLearningResourcesImageClearBtn: document.getElementById('createLearningResourcesImageClearBtn'),
        createOptionFieldsContainer: document.getElementById('createOptionFieldsContainer'),
        toggleMathChemToolsBtn: document.getElementById('toggleMathChemToolsBtn'),
        studioMathChemTools: document.getElementById('studioMathChemTools'),
        studioMathChemTabButtons: Array.from(document.querySelectorAll('[data-math-chem-tab]')),
        studioMathChemPanels: Array.from(document.querySelectorAll('[data-math-chem-panel]')),
        studioMathChemControls: Array.from(document.querySelectorAll('#studioMathChemTools input, #studioMathChemTools button')),
        mathChemFractionNumerator: document.getElementById('mathChemFractionNumerator'),
        mathChemFractionDenominator: document.getElementById('mathChemFractionDenominator'),
        insertMathChemFractionBtn: document.getElementById('insertMathChemFractionBtn'),
        mathChemSuperscriptInput: document.getElementById('mathChemSuperscriptInput'),
        insertMathChemSuperscriptBtn: document.getElementById('insertMathChemSuperscriptBtn'),
        mathChemSubscriptInput: document.getElementById('mathChemSubscriptInput'),
        insertMathChemSubscriptBtn: document.getElementById('insertMathChemSubscriptBtn'),
        addOptionFieldBtn: document.getElementById('addOptionFieldBtn'),
        addOptionInlineBtn: document.getElementById('addOptionInlineBtn'),
        removeOptionFieldBtn: document.getElementById('removeOptionFieldBtn'),
        studioEditorActionSaveBtn: document.getElementById('studioEditorActionSaveBtn'),
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
        timerMode: document.getElementById('timerMode'),
        timerScopeSelect: document.getElementById('timerScopeSelect'),
        timerPresetSelect: document.getElementById('timerPresetSelect'),
        timerCustomSeconds: document.getElementById('timerCustomSeconds'),
        timerCustomRow: document.getElementById('timerCustomRow'),
        timerDetails: document.getElementById('timerDetails'),
        autoStarMode: document.getElementById('autoStarMode'),
        autoStarPresetSelect: document.getElementById('autoStarPresetSelect'),
        autoStarCustomSeconds: document.getElementById('autoStarCustomSeconds'),
        autoStarCustomRow: document.getElementById('autoStarCustomRow'),
        autoStarDetails: document.getElementById('autoStarDetails'),
        unstarOnWrongMode: document.getElementById('unstarOnWrongMode'),
        hideAnswerFeedbackMode: document.getElementById('hideAnswerFeedbackMode'),
        globalShuffleAnswers: document.getElementById('globalShuffleAnswers'),
        allowBuildUp: document.getElementById('allowBuildUp'),

        excludeStarredQuestions: document.getElementById('excludeStarredQuestions'),
        onlyStarredQuestions: document.getElementById('onlyStarredQuestions'),
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
        diagramStudyImageWrap: document.getElementById('diagramStudyImageWrap'),
        diagramStudyLabelLayer: document.getElementById('diagramStudyLabelLayer'),
        imageContainer: document.querySelector('.image-container'),
        optionsContainer: document.querySelector('.options'),
        questionContainer: document.querySelector('.question-container'),
        quizArea: document.querySelector('.quiz-area'),

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
    // Supabase owns signed-in study data, authoring, starred state,
    // and private media. Google Sheets remains an import source only.
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
        if (state.auth.studioAutosaveQuiet && variant !== 'error') return;
        if (!elements.creatorStatus) return;
        elements.creatorStatus.textContent = message;
        elements.creatorStatus.classList.remove('is-error', 'is-success');

        if (variant === 'error') {
            elements.creatorStatus.classList.add('is-error');
        } else if (variant === 'success') {
            elements.creatorStatus.classList.add('is-success');
        }
    }

    function setCreatorProgressStatus(action, detail = '') {
        const safeAction = normalizeSheetText(action);
        const safeDetail = normalizeSheetText(detail);
        if (!safeAction) return;
        setCreatorStatus(safeDetail ? `${safeAction}… ${safeDetail}` : `${safeAction}…`, 'neutral');
    }

    function createStudioEmptyState(title, message, actions = []) {
        const actionMarkup = actions.length
            ? `<div class="studio-empty-actions">${actions.map(action => `
                <button type="button" class="auth-action-btn${action.secondary ? ' auth-secondary-btn' : ''}" data-studio-empty-action="${escapeHtml(action.action)}">${escapeHtml(action.label)}</button>
            `).join('')}</div>`
            : '';

        return `
            <div class="studio-empty-state">
              <div class="studio-empty-title">${escapeHtml(title)}</div>
              <div class="studio-empty-message">${escapeHtml(message)}</div>
              ${actionMarkup}
            </div>
        `;
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


    // ================= MATH/CHEM TEXT HELPERS =================
    // Phase 22M stores author-entered formulas as plain text, while a small
    // controlled marker renders horizontal fractions in study mode.
    const MATH_CHEM_FRACTION_PATTERN = /\{\{frac:([^{}|]*)\|([^{}|]*)\}\}/g;
    const MATH_CHEM_SUPERSCRIPT_MAP = Object.freeze({
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
        'n': 'ⁿ', 'i': 'ⁱ'
    });
    const MATH_CHEM_SUBSCRIPT_MAP = Object.freeze({
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
        '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
        'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
        'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
        'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
        'v': 'ᵥ', 'x': 'ₓ'
    });
    const MATH_CHEM_SUPERSCRIPT_REVERSE_MAP = Object.freeze(Object.fromEntries(Object.entries(MATH_CHEM_SUPERSCRIPT_MAP).map(([base, script]) => [script, base])));
    const MATH_CHEM_SUBSCRIPT_REVERSE_MAP = Object.freeze(Object.fromEntries(Object.entries(MATH_CHEM_SUBSCRIPT_MAP).map(([base, script]) => [script, base])));
    const MATH_CHEM_MARKER_PATTERN = /\{\{frac:([^{}|]*)\|([^{}|]*)\}\}|\{\{(sup|sub):([^{}]*)\}\}/g;
    const MATH_CHEM_SCRIPT_MARKER_PATTERN = /\{\{(sup|sub):([^{}]*)\}\}/g;

    function escapeDisplayText(value) {
        return escapeHtml(value).replace(/\n/g, '<br>');
    }

    function normalizeMathChemMarkerPart(value) {
        return normalizeSheetText(value)
            .replace(/[{}]/g, '')
            .replace(/\|/g, '/')
            .trim();
    }

    function buildMathChemFractionMarker(numerator, denominator) {
        const top = normalizeMathChemMarkerPart(numerator);
        const bottom = normalizeMathChemMarkerPart(denominator);
        if (!top || !bottom) return '';
        return `{{frac:${top}|${bottom}}}`;
    }

    function buildMathChemScriptMarker(kind, value) {
        const safeKind = kind === 'sub' ? 'sub' : 'sup';
        const text = normalizeMathChemMarkerPart(value);
        if (!text) return '';
        return `{{${safeKind}:${text}}}`;
    }

    function renderMathChemScriptHtml(kind, value) {
        const safeKind = kind === 'sub' ? 'sub' : 'sup';
        const text = normalizeMathChemMarkerPart(value);
        if (!text) return '';
        return `<span class="math-chem-script math-chem-${safeKind}">${escapeHtml(text)}</span>`;
    }

    function convertMathChemScriptMarkerToUnicode(kind, value) {
        const text = normalizeMathChemMarkerPart(value);
        if (!text) return '';
        return convertMathChemScriptText(text, kind === 'sub' ? MATH_CHEM_SUBSCRIPT_MAP : MATH_CHEM_SUPERSCRIPT_MAP);
    }

    function displayMathChemTextForEditor(value) {
        return String(value ?? '').replace(MATH_CHEM_SCRIPT_MARKER_PATTERN, (_match, kind, scriptText) => convertMathChemScriptMarkerToUnicode(kind, scriptText));
    }

    function normalizeAuthoredMathChemText(value) {
        return displayMathChemTextForEditor(normalizeSheetText(value));
    }

    function renderMathChemPlainTextToHtml(value) {
        const raw = String(value ?? '');
        if (!raw) return '';
        let html = '';
        let buffer = '';
        let scriptKind = '';

        const flush = () => {
            if (!buffer) return;
            html += scriptKind ? renderMathChemScriptHtml(scriptKind, buffer) : escapeDisplayText(buffer);
            buffer = '';
            scriptKind = '';
        };

        Array.from(raw).forEach(char => {
            const superscriptBase = MATH_CHEM_SUPERSCRIPT_REVERSE_MAP[char];
            const subscriptBase = MATH_CHEM_SUBSCRIPT_REVERSE_MAP[char];
            const nextKind = superscriptBase ? 'sup' : (subscriptBase ? 'sub' : '');
            const nextChar = superscriptBase || subscriptBase || char;
            if (nextKind) {
                if (scriptKind && scriptKind !== nextKind) flush();
                if (!scriptKind && buffer) flush();
                scriptKind = nextKind;
                buffer += nextChar;
                return;
            }
            if (scriptKind) flush();
            buffer += nextChar;
        });
        flush();
        return html;
    }

    function renderMathChemTextToHtml(value) {
        const raw = String(value ?? '');
        if (!raw) return '';

        let html = '';
        let lastIndex = 0;
        raw.replace(MATH_CHEM_MARKER_PATTERN, (match, numerator, denominator, scriptKind, scriptText, offset) => {
            html += renderMathChemPlainTextToHtml(raw.slice(lastIndex, offset));
            if (match.startsWith('{{frac:')) {
                html += `<span class="math-chem-fraction" aria-label="${escapeHtml(`${numerator} over ${denominator}`)}"><span class="math-chem-fraction-top">${renderMathChemPlainTextToHtml(numerator)}</span><span class="math-chem-fraction-line"></span><span class="math-chem-fraction-bottom">${renderMathChemPlainTextToHtml(denominator)}</span></span>`;
            } else {
                html += renderMathChemScriptHtml(scriptKind, scriptText);
            }
            lastIndex = offset + match.length;
            return match;
        });
        html += renderMathChemPlainTextToHtml(raw.slice(lastIndex));
        return html;
    }

    function setMathChemFormattedText(element, value) {
        if (!element) return;
        element.innerHTML = renderMathChemTextToHtml(value);
    }

    function convertMathChemScriptText(value, map) {
        return String(value ?? '').split('').map(char => map[char] || map[char.toLowerCase()] || char).join('');
    }

    function convertToMathChemSuperscript(value) {
        return convertMathChemScriptMarkerToUnicode('sup', value);
    }

    function convertToMathChemSubscript(value) {
        return convertMathChemScriptMarkerToUnicode('sub', value);
    }

    let lastMathChemInsertTarget = null;

    function isMathChemInsertTarget(target) {
        return !!target && target.matches?.('#createQuestionPrompt, #createCorrectExplanation, [data-option-text], [data-option-explanation], [data-diagram-label-text]');
    }

    function getMathChemInsertTarget() {
        const active = document.activeElement;
        if (isMathChemInsertTarget(active)) {
            lastMathChemInsertTarget = active;
            return active;
        }
        if (isMathChemInsertTarget(lastMathChemInsertTarget) && document.body.contains(lastMathChemInsertTarget) && !lastMathChemInsertTarget.disabled) {
            return lastMathChemInsertTarget;
        }
        return elements.createQuestionPrompt || null;
    }

    function insertMathChemTextAtTarget(text) {
        const insertText = String(text ?? '');
        if (!insertText) return false;
        const target = getMathChemInsertTarget();
        if (!target || target.disabled) {
            setCreatorStatus('Click a question, answer, explanation, or diagram label field before inserting math or chemistry text.', 'error');
            return false;
        }

        target.focus();
        const start = Number.isInteger(target.selectionStart) ? target.selectionStart : target.value.length;
        const end = Number.isInteger(target.selectionEnd) ? target.selectionEnd : start;
        const value = String(target.value ?? '');
        target.value = value.slice(0, start) + insertText + value.slice(end);
        const nextCursor = start + insertText.length;
        if (typeof target.setSelectionRange === 'function') {
            target.setSelectionRange(nextCursor, nextCursor);
        }
        target.dispatchEvent(new Event('input', { bubbles: true }));
        lastMathChemInsertTarget = target;
        return true;
    }

    function setActiveMathChemPanel(panelName) {
        const activePanelName = normalizeSheetText(panelName) || 'common';
        elements.studioMathChemTabButtons.forEach(button => {
            const isActive = button.dataset.mathChemTab === activePanelName;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        elements.studioMathChemPanels.forEach(panel => {
            panel.classList.toggle('hidden', panel.dataset.mathChemPanel !== activePanelName);
        });
    }


    function studioCurrentTypeSupportsMathChemTools(quizType = getStudioCurrentQuizType()) {
        return quizType === 'multiple_choice' || quizType === 'diagrams';
    }

    function updateMathChemToolsVisibility(supportsMathChemTools = studioCurrentTypeSupportsMathChemTools()) {
        if (!supportsMathChemTools) {
            state.auth.mathChemToolsExpanded = false;
        }

        if (elements.toggleMathChemToolsBtn) {
            elements.toggleMathChemToolsBtn.classList.toggle('hidden', !supportsMathChemTools);
            elements.toggleMathChemToolsBtn.textContent = state.auth.mathChemToolsExpanded ? 'Hide Math/Chem Tools' : 'Show Math/Chem Tools';
            elements.toggleMathChemToolsBtn.setAttribute('aria-expanded', String(!!state.auth.mathChemToolsExpanded));
        }

        if (elements.studioMathChemTools) {
            elements.studioMathChemTools.classList.toggle('hidden', !(supportsMathChemTools && state.auth.mathChemToolsExpanded));
        }
    }

    function setMathChemToolsExpanded(isExpanded) {
        state.auth.mathChemToolsExpanded = !!isExpanded;
        updateMathChemToolsVisibility();
    }

    function insertMathChemFractionFromControls() {
        const marker = buildMathChemFractionMarker(elements.mathChemFractionNumerator?.value, elements.mathChemFractionDenominator?.value);
        if (!marker) {
            setCreatorStatus('Enter both a fraction top and bottom first.', 'error');
            return;
        }
        if (insertMathChemTextAtTarget(marker)) {
            if (elements.mathChemFractionNumerator) elements.mathChemFractionNumerator.value = '';
            if (elements.mathChemFractionDenominator) elements.mathChemFractionDenominator.value = '';
        }
    }

    function insertMathChemScriptFromControl(input, converter, label) {
        const raw = normalizeSheetText(input?.value);
        if (!raw) {
            setCreatorStatus(`Enter ${label} text first.`, 'error');
            return;
        }
        if (insertMathChemTextAtTarget(converter(raw)) && input) {
            input.value = '';
        }
    }

    // ================= RICH LEARNING RESOURCES HELPERS =================
    // Learning Resources may store safe, limited HTML. All other authored text
    // keeps the existing plain-text-to-HTML behavior.
    const LEARNING_RESOURCES_ALLOWED_FONTS = new Set(['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS']);
    const LEARNING_RESOURCES_ALLOWED_ALIGNMENTS = new Set(['left', 'center', 'right']);
    const LEARNING_RESOURCES_FONT_SIZE_MAP = {
        '1': '10px',
        '2': '12px',
        '3': '15px',
        '4': '18px',
        '5': '22px',
        '6': '26px',
        '7': '32px'
    };
    const LEARNING_RESOURCES_ALLOWED_FONT_SIZES = new Set(['8', '9', '10', '11', '12', '13', '14', '15', '16', '18', '20', '22', '24', '28', '32']);
    const RICH_TEXT_LEGACY_BASELINE_FONT_SIZE = '15px';
    const RICH_TEXT_DEFAULT_FONT_SIZE = '18px';
    const RICH_TEXT_BASE_FONT_SIZE = 18;

    function isLegacyRichDefaultFontSize(value) {
        return normalizeLearningResourcesFontSize(value) === RICH_TEXT_LEGACY_BASELINE_FONT_SIZE;
    }

    function isRichDefaultEditorFontSize(value) {
        return normalizeLearningResourcesFontSize(value) === RICH_TEXT_DEFAULT_FONT_SIZE;
    }

    function isManualRichFontSizeElement(el) {
        return normalizeSheetText(el?.getAttribute?.('data-sb-font-size')).toLowerCase() === 'manual';
    }

    function cleanupEmptyRichStyleAttribute(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
        if (!normalizeSheetText(el.getAttribute('style'))) el.removeAttribute('style');
    }

    function isSafeLearningResourceColor(value) {
        const color = normalizeSheetText(value);
        if (!color) return false;
        return /^#[0-9a-f]{3,8}$/i.test(color)
            || /^rgba?\(\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*,\s*[0-9.]+%?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)
            || /^hsla?\(\s*[0-9.]+(?:deg)?\s*,\s*[0-9.]+%\s*,\s*[0-9.]+%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)
            || /^[a-z]+$/i.test(color);
    }

    function normalizeLearningResourcesFontSize(value) {
        const raw = normalizeSheetText(value).trim();
        if (!raw) return '';

        const mappedRaw = normalizeSheetText(LEARNING_RESOURCES_FONT_SIZE_MAP[raw] || raw).trim();
        const calcMatch = mappedRaw.match(/^calc\(\s*var\(\s*--sb-rich-base-size(?:\s*,\s*18px)?\s*\)\s*\*\s*([0-9.]+)\s*\)$/i);
        if (calcMatch) {
            const computedPx = Math.round(Number(calcMatch[1]) * RICH_TEXT_BASE_FONT_SIZE);
            const computedRaw = String(computedPx);
            return LEARNING_RESOURCES_ALLOWED_FONT_SIZES.has(computedRaw) ? computedRaw + 'px' : '';
        }

        const emMatch = mappedRaw.match(/^([0-9.]+)em$/i);
        if (emMatch) {
            const computedPx = Math.round(Number(emMatch[1]) * RICH_TEXT_BASE_FONT_SIZE);
            const computedRaw = String(computedPx);
            return LEARNING_RESOURCES_ALLOWED_FONT_SIZES.has(computedRaw) ? computedRaw + 'px' : '';
        }

        const pxMatch = mappedRaw.match(/^([0-9.]+)(?:px)?$/i);
        if (!pxMatch) return '';
        const numeric = Number(pxMatch[1]);
        if (!Number.isFinite(numeric)) return '';
        const normalizedRaw = String(Math.round(numeric));
        return Math.abs(numeric - Math.round(numeric)) < 0.001 && LEARNING_RESOURCES_ALLOWED_FONT_SIZES.has(normalizedRaw)
            ? normalizedRaw + 'px'
            : '';
    }

    function toLearningResourcesRelativeFontSize(value) {
        const normalizedPx = normalizeLearningResourcesFontSize(value);
        if (!normalizedPx) return '';
        const numericPx = Number(normalizedPx.replace(/px$/i, ''));
        if (!Number.isFinite(numericPx) || numericPx <= 0) return '';
        const scale = Number((numericPx / RICH_TEXT_BASE_FONT_SIZE).toFixed(4));
        return `calc(var(--sb-rich-base-size, ${RICH_TEXT_DEFAULT_FONT_SIZE}) * ${scale})`;
    }

    function sanitizeLearningResourcesHtml(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return '';

        const template = document.createElement('template');
        template.innerHTML = raw;
        const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SPAN', 'FONT']);

        const sanitizeNode = node => {
            if (node.nodeType === Node.TEXT_NODE) {
                return document.createTextNode(node.textContent || '');
            }
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return document.createDocumentFragment();
            }

            const sourceTag = node.tagName.toUpperCase();
            const targetTag = allowedTags.has(sourceTag)
                ? (sourceTag === 'FONT' ? 'span' : sourceTag.toLowerCase())
                : 'span';
            const el = document.createElement(targetTag);
            const styleParts = [];
            const sourceStyle = node.style || {};

            const sourceColor = sourceStyle.color || node.getAttribute('color') || '';
            if (isSafeLearningResourceColor(sourceColor)) {
                styleParts.push(`color: ${sourceColor}`);
            }

            const sourceBackgroundColor = sourceStyle.backgroundColor || '';
            if (isSafeLearningResourceColor(sourceBackgroundColor)) {
                styleParts.push(`background-color: ${sourceBackgroundColor}`);
            }

            const sourceAlign = normalizeSheetText(sourceStyle.textAlign || node.getAttribute('align')).toLowerCase();
            if (LEARNING_RESOURCES_ALLOWED_ALIGNMENTS.has(sourceAlign)) {
                styleParts.push(`text-align: ${sourceAlign}`);
            }

            const sourceWeight = normalizeRichStyleValue('fontWeight', sourceStyle.fontWeight || '');
            if (sourceWeight === 'bold' || sourceWeight === 'normal') {
                styleParts.push(`font-weight: ${sourceWeight}`);
            }

            const sourceItalic = normalizeRichStyleValue('fontStyle', sourceStyle.fontStyle || '');
            if (sourceItalic === 'italic' || sourceItalic === 'normal') {
                styleParts.push(`font-style: ${sourceItalic}`);
            }

            const sourceDecoration = normalizeRichStyleValue('textDecoration', sourceStyle.textDecoration || sourceStyle.textDecorationLine || '');
            if (sourceDecoration === 'underline' || sourceDecoration === 'none') {
                styleParts.push(`text-decoration: ${sourceDecoration}`);
            }

            const sourceFontFamily = normalizeSheetText((sourceStyle.fontFamily || node.getAttribute('face') || '').replace(/["']/g, ''));
            if (LEARNING_RESOURCES_ALLOWED_FONTS.has(sourceFontFamily)) {
                styleParts.push(`font-family: ${sourceFontFamily}`);
            }

            const sourceSize = normalizeSheetText(node.getAttribute('size')) || normalizeSheetText(sourceStyle.fontSize);
            const mappedSize = normalizeRichStyleValue('fontSize', sourceSize);
            const hasManualFontSizeMarker = isManualRichFontSizeElement(node);
            const isUnmarkedLegacyDefault = isLegacyRichDefaultFontSize(sourceSize) && !hasManualFontSizeMarker;
            if (mappedSize && !isUnmarkedLegacyDefault && (hasManualFontSizeMarker || !isRichDefaultEditorFontSize(mappedSize))) {
                styleParts.push(`font-size: ${mappedSize}`);
                el.setAttribute('data-sb-font-size', 'manual');
            }

            if (styleParts.length) {
                el.setAttribute('style', styleParts.join('; '));
            }

            Array.from(node.childNodes).forEach(child => {
                el.appendChild(sanitizeNode(child));
            });
            return el;
        };

        const wrapper = document.createElement('div');
        Array.from(template.content.childNodes).forEach(node => wrapper.appendChild(sanitizeNode(node)));
        return wrapper.innerHTML.trim();
    }

    function getRichEditorHtml(editorEl) {
        if (!editorEl) return '';
        const sanitizedHtml = sanitizeLearningResourcesHtml(editorEl.innerHTML || '');
        return htmlToDisplayText(sanitizedHtml) ? sanitizedHtml : '';
    }

    function getRichEditorPlain(editorEl) {
        return htmlToDisplayText(getRichEditorHtml(editorEl));
    }

    function setRichEditorHtml(editorEl, htmlValue = '', plainFallback = '') {
        if (!editorEl) return;
        const sanitizedHtml = sanitizeLearningResourcesHtml(htmlValue);
        editorEl.innerHTML = sanitizedHtml || buildStoredHtmlFromPlain(plainFallback);
    }

    function bindRichValueProperty(editorEl) {
        if (!editorEl || Object.prototype.hasOwnProperty.call(editorEl, '__studyBunnyRichValueBound')) return;
        Object.defineProperty(editorEl, '__studyBunnyRichValueBound', { value: true });
        Object.defineProperty(editorEl, 'value', {
            configurable: true,
            get() { return getRichEditorPlain(editorEl); },
            set(value) { setRichEditorHtml(editorEl, '', value); }
        });
    }

    function getLearningResourcesEditorHtml() { return getRichEditorHtml(elements.createLearningResources); }
    function getLearningResourcesEditorPlain() { return getRichEditorPlain(elements.createLearningResources); }
    function setLearningResourcesEditorHtml(htmlValue = '', plainFallback = '') { setRichEditorHtml(elements.createLearningResources, htmlValue, plainFallback); }
    function getFlashcardTermEditorHtml() { return getRichEditorHtml(elements.createFlashcardTerm); }
    function getFlashcardDefinitionEditorHtml() { return getRichEditorHtml(elements.createFlashcardDefinition); }
    function setFlashcardTermEditorHtml(htmlValue = '', plainFallback = '') { setRichEditorHtml(elements.createFlashcardTerm, htmlValue, plainFallback); }
    function setFlashcardDefinitionEditorHtml(htmlValue = '', plainFallback = '') { setRichEditorHtml(elements.createFlashcardDefinition, htmlValue, plainFallback); }

    function dispatchRichEditorInput(editorEl) {
        if (editorEl) editorEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function isRichEditorEditable(editorEl) {
        return !!editorEl && editorEl.getAttribute('contenteditable') !== 'false';
    }

    function getSafeRichInlineStyles(styleDraft = {}) {
        const safeStyles = {};
        const fontFamily = normalizeSheetText(styleDraft.fontFamily || '').replace(/["']/g, '');
        if (fontFamily && LEARNING_RESOURCES_ALLOWED_FONTS.has(fontFamily)) safeStyles.fontFamily = fontFamily;
        const fontSize = normalizeRichStyleValue('fontSize', styleDraft.fontSize || '');
        if (fontSize) safeStyles.fontSize = fontSize;
        const color = normalizeSheetText(styleDraft.color || '');
        if (color && isSafeLearningResourceColor(color)) safeStyles.color = color;
        const fontWeight = normalizeRichStyleValue('fontWeight', styleDraft.fontWeight || '');
        if (fontWeight) safeStyles.fontWeight = fontWeight;
        const fontStyle = normalizeRichStyleValue('fontStyle', styleDraft.fontStyle || '');
        if (fontStyle) safeStyles.fontStyle = fontStyle;
        const textDecoration = normalizeRichStyleValue('textDecoration', styleDraft.textDecoration || '');
        if (textDecoration) safeStyles.textDecoration = textDecoration;
        return safeStyles;
    }


    function normalizeRichStyleValue(property, value) {
        const raw = normalizeSheetText(value);
        if (!raw) return '';
        if (property === 'fontFamily') {
            const family = raw.replace(/["']/g, '');
            return LEARNING_RESOURCES_ALLOWED_FONTS.has(family) ? family : '';
        }
        if (property === 'fontSize') {
            return toLearningResourcesRelativeFontSize(raw);
        }
        if (property === 'color') return isSafeLearningResourceColor(raw) ? raw : '';
        if (property === 'fontWeight') {
            const weight = raw.toLowerCase();
            if (weight === 'normal' || weight === '400' || Number(weight) < 600) return 'normal';
            return weight === 'bold' || Number(weight) >= 600 ? 'bold' : '';
        }
        if (property === 'fontStyle') {
            const fontStyle = raw.toLowerCase();
            if (fontStyle === 'normal') return 'normal';
            return fontStyle === 'italic' ? 'italic' : '';
        }
        if (property === 'textDecoration') {
            const decoration = raw.toLowerCase();
            if (decoration === 'none') return 'none';
            return decoration.includes('underline') ? 'underline' : '';
        }
        return '';
    }


    function getRichElementInlineStyles(el) {
        const styles = {};
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return styles;
        const tagName = el.tagName.toUpperCase();
        if (tagName === 'B' || tagName === 'STRONG') styles.fontWeight = 'bold';
        if (tagName === 'I' || tagName === 'EM') styles.fontStyle = 'italic';
        if (tagName === 'U') styles.textDecoration = 'underline';
        const sourceStyle = el.style || {};
        const candidates = {
            color: sourceStyle.color || el.getAttribute('color') || '',
            fontSize: sourceStyle.fontSize || el.getAttribute('size') || '',
            fontFamily: (sourceStyle.fontFamily || el.getAttribute('face') || '').replace(/["']/g, ''),
            fontWeight: sourceStyle.fontWeight || '',
            fontStyle: sourceStyle.fontStyle || '',
            textDecoration: sourceStyle.textDecoration || sourceStyle.textDecorationLine || ''
        };
        Object.entries(candidates).forEach(([property, value]) => {
            const normalized = normalizeRichStyleValue(property, value);
            if (!normalized) return;
            if (property === 'fontSize') {
                if (isLegacyRichDefaultFontSize(value) && !isManualRichFontSizeElement(el)) return;
                if (isRichDefaultEditorFontSize(normalized) && !isManualRichFontSizeElement(el)) return;
            }
            styles[property] = normalized;
        });
        return styles;
    }

    function getRichInheritedInlineStyles(node, editorEl) {
        const styles = {};
        const path = [];
        let current = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        while (current && current !== editorEl && current.nodeType === Node.ELEMENT_NODE) {
            path.push(current);
            current = current.parentElement;
        }
        path.reverse().forEach(el => Object.assign(styles, getRichElementInlineStyles(el)));
        return styles;
    }

    function applyRichStyleMapToElement(el, styles = {}, overwrite = true) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
        Object.entries(styles).forEach(([property, value]) => {
            const normalizedValue = normalizeRichStyleValue(property, value);
            if (!normalizedValue) return;
            if (overwrite || !el.style[property]) {
                el.style[property] = normalizedValue;
                if (property === 'fontSize') el.setAttribute('data-sb-font-size', 'manual');
            }
        });
    }

    function normalizeRichBaseStylesForTarget(baseStyles = {}, targetStyles = {}) {
        const nextStyles = { ...baseStyles };
        if (nextStyles.fontSize && isLegacyRichDefaultFontSize(nextStyles.fontSize)) {
            delete nextStyles.fontSize;
        }
        return nextStyles;
    }

    function normalizeLegacyRichDefaultFontSize(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        const nodeFontSize = node.style?.fontSize || '';
        if (isLegacyRichDefaultFontSize(nodeFontSize) && !isManualRichFontSizeElement(node)) {
            node.style.removeProperty('font-size');
            node.removeAttribute('data-sb-font-size');
            cleanupEmptyRichStyleAttribute(node);
        } else if (nodeFontSize && isRichDefaultEditorFontSize(nodeFontSize) && !isManualRichFontSizeElement(node)) {
            node.style.removeProperty('font-size');
            cleanupEmptyRichStyleAttribute(node);
        } else if (nodeFontSize) {
            const normalizedFontSize = normalizeRichStyleValue('fontSize', nodeFontSize);
            if (normalizedFontSize && node.style.fontSize !== normalizedFontSize) {
                node.style.fontSize = normalizedFontSize;
                node.setAttribute('data-sb-font-size', 'manual');
            }
        }
        Array.from(node.childNodes).forEach(normalizeLegacyRichDefaultFontSize);
    }

    function wrapRichTextNode(node, baseStyles = {}, targetStyles = {}) {
        const span = document.createElement('span');
        applyRichStyleMapToElement(span, { ...baseStyles, ...targetStyles }, true);
        span.appendChild(node);
        return span;
    }

    function applyTargetStylesToRichNode(node, targetStyles = {}) {
        if (!node) return node;
        if (node.nodeType === Node.TEXT_NODE) return node;
        if (node.nodeType !== Node.ELEMENT_NODE) return node;
        applyRichStyleMapToElement(node, targetStyles, true);
        Array.from(node.childNodes).forEach(child => {
            const nextChild = applyTargetStylesToRichNode(child, targetStyles);
            if (nextChild !== child) child.replaceWith(nextChild);
        });
        return node;
    }

    function buildStrictRichStyledFragment(fragment, baseStyles = {}, targetStyles = {}) {
        const nextFragment = document.createDocumentFragment();
        const safeBaseStyles = normalizeRichBaseStylesForTarget(baseStyles, targetStyles);
        Array.from(fragment.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                nextFragment.appendChild(wrapRichTextNode(node, safeBaseStyles, targetStyles));
                return;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (!targetStyles.fontSize) normalizeLegacyRichDefaultFontSize(node);
                applyRichStyleMapToElement(node, safeBaseStyles, false);
                nextFragment.appendChild(applyTargetStylesToRichNode(node, targetStyles));
                return;
            }
            nextFragment.appendChild(node);
        });
        return nextFragment;
    }

    function saveRichEditorSelection(editorEl, stateBag) {
        if (!editorEl || !stateBag) return;
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (editorEl.contains(range.commonAncestorContainer) || editorEl === range.commonAncestorContainer) {
            stateBag.savedRange = range.cloneRange();
            stateBag.editor = editorEl;
        }
    }

    function restoreRichEditorSelection(editorEl, stateBag) {
        if (!editorEl || !stateBag?.savedRange) return false;
        const range = stateBag.savedRange;
        if (!(editorEl.contains(range.commonAncestorContainer) || editorEl === range.commonAncestorContainer)) return false;
        const selection = window.getSelection();
        if (!selection) return false;
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
    }

    function applyRichInlineStyle(editorEl, stateBag, styleDraft = {}) {
        if (!isRichEditorEditable(editorEl)) return;
        editorEl.focus();
        restoreRichEditorSelection(editorEl, stateBag);
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (!(editorEl.contains(range.commonAncestorContainer) || editorEl === range.commonAncestorContainer)) return;
        const safeStyles = getSafeRichInlineStyles(styleDraft);
        if (!Object.keys(safeStyles).length) return;

        const baseStyles = normalizeRichBaseStylesForTarget(getRichInheritedInlineStyles(range.startContainer, editorEl), safeStyles);
        const nextRange = document.createRange();

        if (range.collapsed) {
            const span = document.createElement('span');
            applyRichStyleMapToElement(span, { ...baseStyles, ...safeStyles }, true);
            const marker = document.createTextNode('​');
            span.appendChild(marker);
            range.insertNode(span);
            nextRange.setStart(marker, marker.textContent.length);
            nextRange.collapse(true);
        } else {
            const styledFragment = buildStrictRichStyledFragment(range.extractContents(), baseStyles, safeStyles);
            const anchor = document.createTextNode('');
            range.insertNode(anchor);
            anchor.parentNode.insertBefore(styledFragment, anchor);
            nextRange.setStartBefore(anchor);
            nextRange.setEndBefore(anchor);
            anchor.remove();
        }

        selection.removeAllRanges();
        selection.addRange(nextRange);
        saveRichEditorSelection(editorEl, stateBag);
        dispatchRichEditorInput(editorEl);
    }

    function getRichSelectionCurrentStyles(editorEl, range) {
        if (!editorEl || !range) return {};
        const currentStyles = getRichInheritedInlineStyles(range.startContainer, editorEl);
        const sourceEl = range.startContainer?.nodeType === Node.ELEMENT_NODE
            ? range.startContainer
            : range.startContainer?.parentElement;
        if (sourceEl && sourceEl !== editorEl && editorEl.contains(sourceEl)) {
            const computed = window.getComputedStyle(sourceEl);
            if (!currentStyles.fontWeight) currentStyles.fontWeight = normalizeRichStyleValue('fontWeight', computed.fontWeight || '');
            if (!currentStyles.fontStyle) currentStyles.fontStyle = normalizeRichStyleValue('fontStyle', computed.fontStyle || '');
            if (!currentStyles.textDecoration) currentStyles.textDecoration = normalizeRichStyleValue('textDecoration', computed.textDecorationLine || computed.textDecoration || '');
            if (!currentStyles.fontSize) currentStyles.fontSize = normalizeRichStyleValue('fontSize', computed.fontSize || '');
        }
        if (!currentStyles.fontSize || isLegacyRichDefaultFontSize(currentStyles.fontSize)) {
            currentStyles.fontSize = normalizeRichStyleValue('fontSize', RICH_TEXT_DEFAULT_FONT_SIZE);
        }
        return currentStyles;
    }

    function isRichStyleActive(currentStyles = {}, property, activeValue) {
        const normalizedCurrent = normalizeRichStyleValue(property, currentStyles[property] || '');
        const normalizedActive = normalizeRichStyleValue(property, activeValue);
        return !!normalizedCurrent && normalizedCurrent === normalizedActive;
    }

    function applyRichInlineToggle(editorEl, stateBag, property, activeValue, inactiveValue) {
        if (!isRichEditorEditable(editorEl)) return;
        editorEl.focus();
        restoreRichEditorSelection(editorEl, stateBag);
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (!(editorEl.contains(range.commonAncestorContainer) || editorEl === range.commonAncestorContainer)) return;
        const currentStyles = getRichSelectionCurrentStyles(editorEl, range);
        const nextValue = isRichStyleActive(currentStyles, property, activeValue) ? inactiveValue : activeValue;
        applyRichInlineStyle(editorEl, stateBag, { [property]: nextValue });
    }

    function applyRichEditorCommand(editorEl, stateBag, command, value = null) {
        if (!isRichEditorEditable(editorEl)) return;
        const normalizedCommand = normalizeSheetText(command);
        if (normalizedCommand === 'bold') return applyRichInlineToggle(editorEl, stateBag, 'fontWeight', 'bold', 'normal');
        if (normalizedCommand === 'italic') return applyRichInlineToggle(editorEl, stateBag, 'fontStyle', 'italic', 'normal');
        if (normalizedCommand === 'underline') return applyRichInlineToggle(editorEl, stateBag, 'textDecoration', 'underline', 'none');
        editorEl.focus();
        restoreRichEditorSelection(editorEl, stateBag);
        document.execCommand(normalizedCommand, false, value);
        saveRichEditorSelection(editorEl, stateBag);
        dispatchRichEditorInput(editorEl);
    }

    const learningResourcesRichState = { savedRange: null, editor: null };
    const flashcardRichState = { savedRange: null, editor: null };

    function saveLearningResourcesSelection() { saveRichEditorSelection(elements.createLearningResources, learningResourcesRichState); }
    function applyLearningResourcesFormat(command, value = null) { applyRichEditorCommand(elements.createLearningResources, learningResourcesRichState, command, value); }
    function applyLearningResourcesInlineStyle(styleDraft = {}) { applyRichInlineStyle(elements.createLearningResources, learningResourcesRichState, styleDraft); }
    function getActiveFlashcardRichEditor() { return (flashcardRichState.editor && document.body.contains(flashcardRichState.editor)) ? flashcardRichState.editor : (elements.createFlashcardTerm || elements.createFlashcardDefinition || null); }
    function saveFlashcardRichSelection(editorEl = null) { const target = editorEl || getActiveFlashcardRichEditor(); if (target) { flashcardRichState.editor = target; saveRichEditorSelection(target, flashcardRichState); } }
    function applyFlashcardRichFormat(command, value = null) { applyRichEditorCommand(getActiveFlashcardRichEditor(), flashcardRichState, command, value); }
    function applyFlashcardRichInlineStyle(styleDraft = {}) { applyRichInlineStyle(getActiveFlashcardRichEditor(), flashcardRichState, styleDraft); }

    bindRichValueProperty(elements.createFlashcardTerm);
    bindRichValueProperty(elements.createFlashcardDefinition);

    function downloadTextFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function csvCell(value) {
        return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }

    function rowsToCsv(rows) {
        return rows.map(row => row.map(csvCell).join(',')).join('\n');
    }

    function buildStudyBunnyTemplateRows(type, variant = 'blank') {
        const isExample = variant === 'example';
        if (type === 'flashcard') {
            const rows = [['Term', 'flashcard', 'Definition', 'Term image URL', 'Definition image URL', 'Learning resources', 'Learning resources image URL']];
            if (isExample) rows.push(['Cell membrane', '', 'A selectively permeable barrier around the cell.', '', '', 'Review phospholipid bilayer structure and membrane proteins.', '']);
            return rows;
        }
        if (type === 'hierarchy') {
            const rows = [[
                'Question', 'hierarchy',
                ...Array.from({ length: 10 }, (_, index) => `Item ${index + 1}`),
                ...Array.from({ length: 10 }, (_, index) => `Correct position ${index + 1}`),
                'Question image URL', 'Learning resources', 'Learning resources image URL'
            ]];
            if (isExample) rows.push(['Put these biological organization levels in order from smallest to largest.', '', 'Cell', 'Tissue', 'Organ', 'Organ system', 'Organism', '', '', '', '', '', 1, 2, 3, 4, 5, '', '', '', '', '', '', 'Remember: cells build tissues, tissues build organs, organs build systems.', '']);
            return rows;
        }
        if (type === 'classify') {
            const itemHeaders = Array.from({ length: CONFIG.classifyItemCount }, (_, index) => [`Item ${index + 1}`, `Item ${index + 1} class ID`]).flat();
            const classLabelHeaders = Array.from({ length: CONFIG.classifyClassCount }, (_, index) => `Class ${index + 1} label`);
            const classIdHeaders = Array.from({ length: CONFIG.classifyClassCount }, (_, index) => `Class ${index + 1} ID`);
            const rows = [['Question', 'classify', ...itemHeaders, ...classLabelHeaders, ...classIdHeaders, 'Question image URL', 'Learning resources', 'Learning resources image URL']];
            if (isExample) {
                const itemValues = Array.from({ length: CONFIG.classifyItemCount }, () => ['', '']);
                itemValues[0] = 'Mitochondria'; itemValues[1] = 'organelle';
                itemValues[2] = 'Nucleus'; itemValues[3] = 'organelle';
                itemValues[4] = 'Diffusion'; itemValues[5] = 'process';
                itemValues[6] = 'Osmosis'; itemValues[7] = 'process';
                const classLabels = Array.from({ length: CONFIG.classifyClassCount }, () => '');
                const classIds = Array.from({ length: CONFIG.classifyClassCount }, () => '');
                classLabels[0] = 'Organelle'; classLabels[1] = 'Process';
                classIds[0] = 'organelle'; classIds[1] = 'process';
                rows.push(['Classify each item.', '', ...itemValues, ...classLabels, ...classIds, '', 'Match each item to the best category.', '']);
            }
            return rows;
        }
        const rows = [[
            'Question', 'multiple choice', 'section', 'build_up',
            'option_1', 'option_2', 'option_3', 'option_4', 'option_5', 'option_6',
            'correct_option',
            'option_1_explanation', 'option_2_explanation', 'option_3_explanation', 'option_4_explanation', 'option_5_explanation', 'option_6_explanation',
            'Question image URL', 'Learning resources', 'Learning resources image URL'
        ]];
        if (isExample) rows.push([
            'Which organelle makes most cellular ATP?', '', '7.1', 'cell-organelle-case-1',
            'Nucleus', 'Mitochondria', 'Ribosome', 'Golgi apparatus', 'Chloroplast', 'Lysosome',
            '2',
            'The nucleus stores DNA.', 'Mitochondria produce most ATP during cellular respiration.', 'Ribosomes build proteins.', 'The Golgi modifies and packages molecules.', 'Chloroplasts perform photosynthesis in plant cells.', 'Lysosomes digest cellular waste.',
            '', 'Review cellular respiration and organelle functions. Add more option_7, option_8, etc. columns if needed.', ''
        ]);
        return rows;
    }

    function downloadStudyBunnyTemplate(type, variant = 'blank') {
        const safeType = ['multiple_choice', 'flashcard', 'hierarchy', 'classify', 'diagrams'].includes(type) ? type : 'multiple_choice';
        const safeVariant = variant === 'example' ? 'example' : 'blank';
        const rows = buildStudyBunnyTemplateRows(safeType, safeVariant);
        const csv = rowsToCsv(rows);
        const label = safeType.replace(/_/g, '-');
        downloadTextFile(csv, `study-bunny-${safeVariant}-${label}-template.csv`, 'text/csv;charset=utf-8');
        setCreatorStatus(`Downloaded ${safeVariant} ${label.replace(/-/g, ' ')} template.`, 'success');
    }


    // ================= SUPABASE PRIVATE MEDIA ASSETS =================
    // New uploads are stored in a private Supabase Storage bucket. Existing
    // external URLs and older data URLs still render so old decks remain usable.
    function isDataUrl(value) {
        return /^data:/i.test(normalizeSheetText(value));
    }

    function isSupabaseMediaReference(value) {
        return normalizeSheetText(value).startsWith(CONFIG.mediaAssets.referencePrefix);
    }

    function buildSupabaseMediaReference(assetId) {
        const normalizedId = normalizeSheetText(assetId);
        return normalizedId ? `${CONFIG.mediaAssets.referencePrefix}${normalizedId}` : '';
    }

    function getSupabaseMediaAssetId(value) {
        const normalizedValue = normalizeSheetText(value);
        if (!isSupabaseMediaReference(normalizedValue)) return '';
        return normalizedValue.slice(CONFIG.mediaAssets.referencePrefix.length);
    }

    function createMediaAssetId() {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
            const randomValue = Math.random() * 16 | 0;
            const value = character === 'x' ? randomValue : ((randomValue & 0x3) | 0x8);
            return value.toString(16);
        });
    }

    function collectSupabaseMediaReferences(value, refs = new Set()) {
        if (!value) return refs;
        if (typeof value === 'string') {
            if (isSupabaseMediaReference(value)) refs.add(value);
            return refs;
        }
        if (Array.isArray(value)) {
            value.forEach(item => collectSupabaseMediaReferences(item, refs));
            return refs;
        }
        if (typeof value === 'object') {
            Object.values(value).forEach(item => collectSupabaseMediaReferences(item, refs));
        }
        return refs;
    }

    function replaceSupabaseMediaReferences(value, replacementMap) {
        if (!value) return value;
        if (typeof value === 'string') {
            return isSupabaseMediaReference(value) ? (replacementMap.get(value) || '') : value;
        }
        if (Array.isArray(value)) {
            return value.map(item => replaceSupabaseMediaReferences(item, replacementMap));
        }
        if (typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceSupabaseMediaReferences(item, replacementMap)]));
        }
        return value;
    }

    function getDataUrlBlob(dataUrl) {
        const normalizedDataUrl = normalizeSheetText(dataUrl);
        const match = normalizedDataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/i);
        if (!match) {
            throw new Error('Could not read that image file.');
        }

        const mimeType = normalizeSheetText(match[1] || 'application/octet-stream');
        const isBase64 = !!match[2];
        const rawData = match[3] || '';
        const byteString = isBase64 ? window.atob(rawData) : decodeURIComponent(rawData);
        const bytes = new Uint8Array(byteString.length);
        for (let index = 0; index < byteString.length; index += 1) {
            bytes[index] = byteString.charCodeAt(index);
        }
        return new Blob([bytes], { type: mimeType });
    }

    function getMediaExtensionFromMime(mimeType) {
        const normalizedMime = normalizeSheetText(mimeType).toLowerCase();
        const extensionMap = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/svg+xml': 'svg',
            'image/bmp': 'bmp',
            'image/avif': 'avif'
        };
        return extensionMap[normalizedMime] || 'bin';
    }

    function sanitizeStorageFileName(value, fallback = 'image') {
        const normalizedName = normalizeSheetText(value)
            .replace(/^Selected:\s*/i, '')
            .replace(/[^a-z0-9._-]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
        return normalizedName || fallback;
    }

    function getSafeMediaFileName(originalName, mimeType, usageContext = 'image') {
        const sanitizedOriginal = sanitizeStorageFileName(originalName, '');
        if (sanitizedOriginal && /\.[a-z0-9]+$/i.test(sanitizedOriginal)) {
            return sanitizedOriginal;
        }
        const baseName = sanitizeStorageFileName(sanitizedOriginal || usageContext || 'image', 'image').replace(/\.[a-z0-9]+$/i, '');
        return `${baseName}.${getMediaExtensionFromMime(mimeType)}`;
    }

    function getPhase18StorageErrorMessage(error) {
        const message = normalizeSheetText(error?.message || error?.details || error);
        if (/media_assets|study-bunny-media|bucket|storage/i.test(message)) {
            return 'Run the Phase 18 Supabase Storage migration before saving private images.';
        }
        return message || 'Could not save the image to Supabase Storage.';
    }

    async function uploadDataUrlToPrivateMediaAsset(dataUrl, options = {}) {
        const normalizedDataUrl = normalizeSheetText(dataUrl);
        if (!normalizedDataUrl || !isDataUrl(normalizedDataUrl)) return normalizedDataUrl;
        if (!state.auth.client || !state.auth.user?.id) {
            throw new Error('Sign in before saving images.');
        }

        const blob = getDataUrlBlob(normalizedDataUrl);
        const mimeType = blob.type || 'application/octet-stream';
        const assetId = createMediaAssetId();
        const fileName = getSafeMediaFileName(options.originalName || options.label || '', mimeType, options.usageContext || 'image');
        const objectPath = `${state.auth.user.id}/${assetId}/${fileName}`;
        const bucketName = CONFIG.mediaAssets.bucketName;

        const { error: uploadError } = await state.auth.client.storage
            .from(bucketName)
            .upload(objectPath, blob, {
                contentType: mimeType,
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            throw new Error(getPhase18StorageErrorMessage(uploadError));
        }

        const mediaPayload = {
            id: assetId,
            user_id: state.auth.user.id,
            bucket_name: bucketName,
            object_path: objectPath,
            original_name: fileName,
            mime_type: mimeType,
            size_bytes: blob.size,
            quiz_id: options.quizId || null,
            question_id: options.questionId || null,
            usage_context: normalizeSheetText(options.usageContext || '')
        };

        const { error: assetError } = await state.auth.client
            .from('media_assets')
            .insert(mediaPayload);

        if (assetError) {
            await state.auth.client.storage.from(bucketName).remove([objectPath]);
            throw new Error(getPhase18StorageErrorMessage(assetError));
        }

        return buildSupabaseMediaReference(assetId);
    }

    async function savePrivateMediaValue(value, options = {}) {
        const normalizedValue = normalizeSheetText(value);
        if (!normalizedValue || !isDataUrl(normalizedValue)) return normalizedValue;
        return uploadDataUrlToPrivateMediaAsset(normalizedValue, options);
    }

    async function anchorSupabaseMediaReferenceToQuestion(value, options = {}) {
        const normalizedValue = normalizeSheetText(value);
        const questionId = normalizeSheetText(options.questionId);
        if (!isSupabaseMediaReference(normalizedValue) || !state.auth.client || !state.auth.user?.id || !questionId) {
            return normalizedValue;
        }

        const assetId = getSupabaseMediaAssetId(normalizedValue);
        if (!assetId) return normalizedValue;

        const payload = {
            question_id: questionId,
            quiz_id: options.quizId || null
        };
        const usageContext = normalizeSheetText(options.usageContext);
        if (usageContext) payload.usage_context = usageContext;

        const { error } = await state.auth.client
            .from('media_assets')
            .update(payload)
            .eq('id', assetId)
            .eq('user_id', state.auth.user.id);

        if (error) {
            throw new Error(getPhase18StorageErrorMessage(error) || 'Could not link the shared diagram image to its source question.');
        }

        state.auth.mediaSignedUrlCache?.delete(assetId);
        return normalizedValue;
    }

    async function savePrivateMediaValues(valueMap, options = {}) {
        const entries = Object.entries(valueMap || {});
        const savedEntries = [];
        for (const [key, value] of entries) {
            savedEntries.push([
                key,
                await savePrivateMediaValue(value, {
                    ...options,
                    usageContext: key,
                    label: options.labels?.[key] || key
                })
            ]);
        }
        return Object.fromEntries(savedEntries);
    }

    async function createSignedMediaUrlMap(refs) {
        if (!state.auth.client || !refs?.length) return new Map();

        const uniqueRefs = Array.from(new Set(refs.filter(isSupabaseMediaReference)));
        const now = Date.now();
        const resolvedMap = new Map();
        const idsToLoad = [];

        uniqueRefs.forEach(ref => {
            const assetId = getSupabaseMediaAssetId(ref);
            const cached = state.auth.mediaSignedUrlCache?.get(assetId);
            if (cached?.url && cached.expiresAt > now + 60000) {
                resolvedMap.set(ref, cached.url);
            } else if (assetId) {
                idsToLoad.push(assetId);
            }
        });

        if (!idsToLoad.length) return resolvedMap;

        const { data: assets, error } = await state.auth.client
            .from('media_assets')
            .select('id, bucket_name, object_path')
            .in('id', idsToLoad);

        if (error || !assets?.length) {
            if (error) console.error('Failed to load media asset metadata:', error);
            return resolvedMap;
        }

        const assetsByBucket = new Map();
        assets.forEach(asset => {
            const bucketName = asset.bucket_name || CONFIG.mediaAssets.bucketName;
            if (!assetsByBucket.has(bucketName)) assetsByBucket.set(bucketName, []);
            assetsByBucket.get(bucketName).push(asset);
        });

        for (const [bucketName, bucketAssets] of assetsByBucket.entries()) {
            const paths = bucketAssets.map(asset => asset.object_path).filter(Boolean);
            if (!paths.length) continue;
            const { data: signedUrls, error: signedError } = await state.auth.client.storage
                .from(bucketName)
                .createSignedUrls(paths, CONFIG.mediaAssets.signedUrlExpiresIn);

            if (signedError) {
                console.error('Failed to create signed media URLs:', signedError);
                continue;
            }

            (signedUrls || []).forEach((signedItem, index) => {
                const asset = bucketAssets[index];
                const signedUrl = signedItem?.signedUrl || signedItem?.signedURL || '';
                if (!asset?.id || !signedUrl) return;
                const ref = buildSupabaseMediaReference(asset.id);
                resolvedMap.set(ref, signedUrl);
                state.auth.mediaSignedUrlCache?.set(asset.id, {
                    url: signedUrl,
                    expiresAt: now + (CONFIG.mediaAssets.signedUrlExpiresIn * 1000)
                });
            });
        }

        return resolvedMap;
    }

    async function resolveSupabaseMediaValue(value) {
        const normalizedValue = normalizeSheetText(value);
        if (!isSupabaseMediaReference(normalizedValue)) return normalizedValue;
        const urlMap = await createSignedMediaUrlMap([normalizedValue]);
        return urlMap.get(normalizedValue) || '';
    }

    async function resolveSupabaseMediaReferences(value) {
        const refs = Array.from(collectSupabaseMediaReferences(value));
        if (!refs.length) return value;
        const urlMap = await createSignedMediaUrlMap(refs);
        return replaceSupabaseMediaReferences(value, urlMap);
    }

    async function verifySupabaseMediaReferenceIsLoadable(value) {
        const normalizedValue = normalizeSheetText(value);
        if (!isSupabaseMediaReference(normalizedValue)) return true;
        try {
            return !!(await resolveSupabaseMediaValue(normalizedValue));
        } catch (error) {
            console.error('Could not verify private media reference:', error);
            return false;
        }
    }


    function createStudyLoadDiagnosticError(message, details = {}) {
        const error = new Error(normalizeSheetText(message) || 'Could not load that quiz for study.');
        error.name = 'StudyLoadDiagnosticError';
        error.studyLoadDiagnostic = true;
        error.details = details || {};
        return error;
    }

    function getStudyLoadErrorMessage(error) {
        const message = normalizeSheetText(error?.message || error);
        if (error?.studyLoadDiagnostic && message) {
            return `Study load issue: ${message}`;
        }
        return message ? `Study load issue: ${message}` : 'Could not load the quiz into the study view.';
    }

    function assertExpectedDetailRowsForStudyLoad(questionIds, detailRows, detailLabel, quizName = '') {
        const expectedIds = (questionIds || []).map(normalizeSheetText).filter(Boolean);
        const foundIds = new Set((detailRows || []).map(row => normalizeSheetText(row?.question_id)).filter(Boolean));
        const missingIds = expectedIds.filter(id => !foundIds.has(id));
        if (!missingIds.length) return;
        const quizPart = normalizeSheetText(quizName) ? ` for "${normalizeSheetText(quizName)}"` : '';
        throw createStudyLoadDiagnosticError(`${missingIds.length} of ${expectedIds.length} ${detailLabel} question detail row(s) are missing${quizPart}. Open the quiz in the editor and re-save the affected questions, or check the matching Supabase detail table.`, {
            detailLabel,
            expectedCount: expectedIds.length,
            foundCount: foundIds.size,
            missingQuestionIds: missingIds.slice(0, 10)
        });
    }

    async function resolveSupabaseMediaReferencesForStudyLoad(value, contextLabel = 'This quiz') {
        const refs = Array.from(collectSupabaseMediaReferences(value));
        if (!refs.length) return value;
        const urlMap = await createSignedMediaUrlMap(refs);
        const missingRefs = refs.filter(ref => !urlMap.has(ref));
        if (missingRefs.length) {
            throw createStudyLoadDiagnosticError(`${contextLabel} has ${missingRefs.length} private image/media reference(s) that could not be loaded. The media_assets row or Storage object may be missing.`, {
                contextLabel,
                missingMediaRefs: missingRefs.slice(0, 10)
            });
        }
        return replaceSupabaseMediaReferences(value, urlMap);
    }

    function setPreviewImageSource(previewEl, sourceValue, callbacks = {}) {
        if (!previewEl) return;
        const normalizedSource = normalizeSheetText(sourceValue);
        previewEl.dataset.mediaPreviewSource = normalizedSource;
        previewEl.onload = null;
        previewEl.onerror = null;
        previewEl.src = '';
        previewEl.classList.add('hidden');

        const applySource = displaySource => {
            previewEl.onload = () => {
                if (previewEl.dataset.mediaPreviewSource !== normalizedSource) return;
                callbacks.onLoad?.(normalizedSource);
            };
            previewEl.onerror = () => {
                if (previewEl.dataset.mediaPreviewSource !== normalizedSource) return;
                previewEl.classList.add('hidden');
                callbacks.onError?.(normalizedSource);
            };
            previewEl.src = displaySource;
            previewEl.classList.remove('hidden');
        };

        if (!normalizedSource) return;

        if (!isSupabaseMediaReference(normalizedSource)) {
            applySource(normalizedSource);
            return;
        }

        resolveSupabaseMediaValue(normalizedSource).then(signedUrl => {
            if (previewEl.dataset.mediaPreviewSource !== normalizedSource) return;
            if (!signedUrl) {
                callbacks.onError?.(normalizedSource);
                return;
            }
            applySource(signedUrl);
        }).catch(error => {
            console.error('Could not load private image preview:', error);
            if (previewEl.dataset.mediaPreviewSource === normalizedSource) {
                callbacks.onError?.(normalizedSource);
            }
        });
    }


    function getOptionAnswerValue(optionDraft = {}) {
        return normalizeSheetText(optionDraft.text) || normalizeSheetText(optionDraft.imageUrl);
    }

    function getOptionImageLabel(optionDraft = {}, index = 0) {
        const label = normalizeSheetText(optionDraft.imageLabel || optionDraft.label);
        if (label) return label;
        return normalizeSheetText(optionDraft.imageUrl) ? `Option ${index + 1} image selected.` : 'No option image selected.';
    }

    function collectOptionImageRows() {
        if (!elements.createOptionFieldsContainer) return [];
        return Array.from(elements.createOptionFieldsContainer.querySelectorAll('[data-option-index]'));
    }

    function updateStudioOptionImageToggle(row) {
        if (!row) return;
        const optionIndex = Number(row.dataset.optionIndex || 0) || 0;
        const panel = row.querySelector('[data-option-image-panel]');
        const toggle = row.querySelector('[data-option-image-toggle]');
        const imageInput = row.querySelector('[data-option-image-url]');
        if (!toggle) return;
        const isOpen = !!panel && !panel.classList.contains('hidden');
        const hasImage = !!normalizeSheetText(imageInput?.value || '');
        toggle.classList.toggle('has-image', hasImage);
        toggle.textContent = isOpen ? 'Hide Image' : (hasImage ? 'Edit Image' : 'Add Image');
        toggle.title = isOpen
            ? `Hide Option ${optionIndex} image controls`
            : (hasImage ? `Edit Option ${optionIndex} image` : `Add Option ${optionIndex} image`);
        toggle.setAttribute('aria-label', toggle.title);
        toggle.setAttribute('aria-expanded', String(isOpen));
    }

    function setStudioOptionImageState(row, value = '', label = '') {
        if (!row) return;
        const optionIndex = Number(row.dataset.optionIndex || 0) || 0;
        const normalizedValue = normalizeSheetText(value);
        const nextLabel = label || (normalizedValue ? `Option ${optionIndex} image selected.` : 'No option image selected.');
        const imageInput = row.querySelector('[data-option-image-url]');
        const imageLabel = row.querySelector('[data-option-image-name]');
        const imageFile = row.querySelector('[data-option-image-file]');
        const imagePreview = row.querySelector('[data-option-image-preview]');

        if (imageInput) {
            imageInput.value = normalizedValue;
            imageInput.dataset.optionImageLabel = nextLabel;
        }
        if (imageLabel) imageLabel.textContent = nextLabel;
        if (!normalizedValue && imageFile) imageFile.value = '';
        updateStudioOptionImageToggle(row);
        if (imagePreview) setPreviewImageSource(imagePreview, normalizedValue);
    }

    function setStudioOptionImagePanelOpen(row, forceOpen = null) {
        if (!row) return;
        const optionIndex = row.dataset.optionIndex || '';
        const panel = row.querySelector('[data-option-image-panel]');
        const toggle = row.querySelector('[data-option-image-toggle]');
        if (!panel || !toggle) return;
        const nextOpen = forceOpen === null ? panel.classList.contains('hidden') : !!forceOpen;
        panel.classList.toggle('hidden', !nextOpen);
        if (nextOpen) {
            state.auth.expandedOptionImageRows.add(optionIndex);
            const imageInput = row.querySelector('[data-option-image-url]');
            const imagePreview = row.querySelector('[data-option-image-preview]');
            if (imagePreview) setPreviewImageSource(imagePreview, imageInput?.value || '');
        } else {
            state.auth.expandedOptionImageRows.delete(optionIndex);
        }
        updateStudioOptionImageToggle(row);
    }

    async function handleStudioOptionImageFileInput(fileInput) {
        const row = fileInput?.closest('[data-option-index]');
        const optionIndex = Number(row?.dataset.optionIndex || 0) || 0;
        const file = fileInput?.files?.[0];
        if (!row) return;
        if (!file) {
            setStudioOptionImageState(row, '', 'No option image selected.');
            return;
        }
        const dataUrl = await readFileAsDataUrl(file);
        setStudioOptionImageState(row, dataUrl, `Selected: ${file.name}`);
        setStudioDirtyState(true);
        setStudioOptionImagePanelOpen(row, true);
    }

    async function saveOptionImageValues(quizId, questionId, optionDrafts = []) {
        const savedDrafts = [];
        for (let index = 0; index < optionDrafts.length; index += 1) {
            const draft = optionDrafts[index] || {};
            const imageUrl = await savePrivateMediaValue(draft.imageUrl || '', {
                quizId,
                questionId,
                usageContext: `multiple_choice_option_${index + 1}_image`,
                label: draft.imageLabel || draft.text || `option-${index + 1}-image`
            });
            savedDrafts.push({
                ...draft,
                imageUrl
            });
        }
        return savedDrafts;
    }

    function getDiagramLabelName(index = 0) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (index < alphabet.length) return alphabet[index];
        return `${alphabet[index % alphabet.length]}${Math.floor(index / alphabet.length) + 1}`;
    }

    function normalizeDiagramLabels(labels = []) {
        const source = Array.isArray(labels) ? labels : [];
        return source.map((label, index) => ({
            label: displayMathChemTextForEditor(normalizeSheetText(label?.label || label?.text || getDiagramLabelName(index))) || getDiagramLabelName(index),
            x: Math.min(100, Math.max(0, Number(label?.x ?? label?.left ?? 50) || 50)),
            y: Math.min(100, Math.max(0, Number(label?.y ?? label?.top ?? 50) || 50))
        })).filter(label => label.label);
    }

    const STUDY_BUNNY_QUIZ_META_PREFIX = 'STUDY_BUNNY_META:';

    function createDefaultDiagramSharingState() {
        return {
            useSharedImage: false,
            useSharedLabels: false,
            sharedImageUrl: '',
            sharedImageLabel: '',
            sharedImageName: '',
            sharedLabels: [],
            sourceQuestionId: '',
            questionOverride: false
        };
    }

    function parseQuizMetadata(description = '') {
        const raw = String(description ?? '').trim();
        if (!raw.startsWith(STUDY_BUNNY_QUIZ_META_PREFIX)) return {};
        try {
            const parsed = JSON.parse(raw.slice(STUDY_BUNNY_QUIZ_META_PREFIX.length));
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.warn('Could not parse Study Bunny quiz metadata:', error);
            return {};
        }
    }

    function buildQuizDescriptionFromMetadata(metadata = {}) {
        const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
        return `${STUDY_BUNNY_QUIZ_META_PREFIX}${JSON.stringify(safeMetadata)}`;
    }

    function getSelectedFileNameFromLabel(label = '') {
        const text = normalizeSheetText(label);
        const selectedMatch = text.match(/^Selected:\s*(.+)$/i);
        return normalizeSheetText(selectedMatch?.[1] || '');
    }

    function getSharedDiagramImageName(sharing = state.auth.studioDiagramSharing || {}) {
        const explicitName = normalizeSheetText(sharing.sharedImageName || sharing.sharedImageFileName);
        if (explicitName) return explicitName;
        return getSelectedFileNameFromLabel(sharing.sharedImageLabel);
    }

    function getDiagramSharingSourceQuestionId(sharing = state.auth.studioDiagramSharing || {}) {
        return normalizeSheetText(sharing.sourceQuestionId || sharing.sharedSourceQuestionId || sharing.source_question_id);
    }

    function getStudioQuestionRowsSnapshot(rows = state.auth.studioQuizQuestions || []) {
        return Array.isArray(rows) ? rows : [];
    }

    function getStudioQuestionRowById(questionId = '', rows = state.auth.studioQuizQuestions || []) {
        const targetId = normalizeSheetText(questionId);
        if (!targetId) return null;
        return getStudioQuestionRowsSnapshot(rows).find(question => normalizeSheetText(question?.id) === targetId) || null;
    }

    function getFirstStudioQuestionId(rows = state.auth.studioQuizQuestions || []) {
        return normalizeSheetText(getStudioQuestionRowsSnapshot(rows)[0]?.id);
    }

    function getStudioQuestionNumber(questionId = '') {
        const targetId = normalizeSheetText(questionId);
        if (!targetId) return 0;
        const rows = getStudioQuestionRowsSnapshot();
        const index = rows.findIndex(question => normalizeSheetText(question?.id) === targetId);
        return index >= 0 ? index + 1 : 0;
    }

    function getStudioQuestionDisplayLabel(questionId = '') {
        const number = getStudioQuestionNumber(questionId);
        return number ? `Question ${number}` : 'the source question';
    }

    function canEditStudioSharedDiagramSettings(sharing = state.auth.studioDiagramSharing || {}) {
        const sourceQuestionId = getDiagramSharingSourceQuestionId(sharing);
        if (!sourceQuestionId) return true;
        return normalizeSheetText(state.auth.editingQuestionId) === sourceQuestionId;
    }

    function isCurrentStudioSharedDiagramSource(sharing = state.auth.studioDiagramSharing || {}) {
        const sourceQuestionId = getDiagramSharingSourceQuestionId(sharing);
        return !!sourceQuestionId && normalizeSheetText(state.auth.editingQuestionId) === sourceQuestionId;
    }

    function getSharedDiagramImageStatusLabel(sharing = state.auth.studioDiagramSharing || {}) {
        const fileName = getSharedDiagramImageName(sharing);
        if (fileName) return `Shared diagram image: ${fileName}`;
        const label = normalizeSheetText(sharing.sharedImageLabel);
        if (label && !/^Shared diagram image saved\.?$/i.test(label)) return label;
        return normalizeSheetText(sharing.sharedImageUrl) ? 'Shared diagram image saved.' : 'No diagram image selected.';
    }

    function remapDiagramSharingSourceQuestionId(description = '', idMap = new Map()) {
        if (!idMap?.size) return description;
        const metadata = parseQuizMetadata(description);
        const diagramSharing = metadata.diagramSharing;
        if (!diagramSharing || typeof diagramSharing !== 'object') return description;
        const sourceQuestionId = getDiagramSharingSourceQuestionId(diagramSharing);
        const nextSourceQuestionId = sourceQuestionId ? normalizeSheetText(idMap.get(sourceQuestionId)) : '';
        if (!nextSourceQuestionId || nextSourceQuestionId === sourceQuestionId) return description;
        metadata.diagramSharing = { ...diagramSharing, sourceQuestionId: nextSourceQuestionId };
        return buildQuizDescriptionFromMetadata(metadata);
    }

    function getDiagramSharingFromDescription(description = '') {
        const metadata = parseQuizMetadata(description);
        const diagramSharing = metadata.diagramSharing || {};
        return {
            ...createDefaultDiagramSharingState(),
            useSharedImage: !!diagramSharing.useSharedImage,
            useSharedLabels: !!diagramSharing.useSharedLabels,
            sharedImageUrl: normalizeSheetText(diagramSharing.sharedImageUrl),
            sharedImageLabel: normalizeSheetText(diagramSharing.sharedImageLabel),
            sharedImageName: getSharedDiagramImageName(diagramSharing),
            sharedLabels: normalizeDiagramLabels(diagramSharing.sharedLabels || diagramSharing.labels || []),
            sourceQuestionId: getDiagramSharingSourceQuestionId(diagramSharing)
        };
    }

    function setDiagramSharingInDescription(description = '', diagramSharingDraft = {}) {
        const metadata = parseQuizMetadata(description);
        const safeDraft = {
            useSharedImage: !!diagramSharingDraft.useSharedImage,
            useSharedLabels: !!diagramSharingDraft.useSharedLabels,
            sharedImageUrl: normalizeSheetText(diagramSharingDraft.sharedImageUrl),
            sharedImageLabel: normalizeSheetText(diagramSharingDraft.sharedImageLabel),
            sharedImageName: getSharedDiagramImageName(diagramSharingDraft),
            sharedLabels: normalizeDiagramLabels(diagramSharingDraft.sharedLabels || []),
            sourceQuestionId: getDiagramSharingSourceQuestionId(diagramSharingDraft)
        };
        metadata.diagramSharing = safeDraft;
        return buildQuizDescriptionFromMetadata(metadata);
    }

    function collectQuizDescriptionMediaReferences(description = '', refs = new Set()) {
        return collectSupabaseMediaReferences(parseQuizMetadata(description), refs);
    }

    async function cloneQuizDescriptionMediaReferences(description = '', options = {}) {
        const metadata = parseQuizMetadata(description);
        if (!Object.keys(metadata).length) return normalizeSheetText(description);
        const clonedMetadata = await cloneMediaRefsInObject(metadata, options);
        return buildQuizDescriptionFromMetadata(clonedMetadata);
    }

    async function restoreQuizDescriptionMediaReferences(description = '', options = {}) {
        const metadata = parseQuizMetadata(description);
        if (!Object.keys(metadata).length) return normalizeSheetText(description);
        const restoredMetadata = await restoreBackupMediaRefsInObject(metadata, options);
        return buildQuizDescriptionFromMetadata(restoredMetadata);
    }

    function getDiagramOptionsJsonObject(detailRow) {
        const optionsJson = detailRow?.options_json;
        return optionsJson && typeof optionsJson === 'object' && !Array.isArray(optionsJson) ? optionsJson : {};
    }

    function getDiagramQuestionOverrideFromDetailRow(detailRow) {
        return !!getDiagramOptionsJsonObject(detailRow).diagramQuestionOverride;
    }

    function getStudioDiagramSharingDraft() {
        const currentSharing = state.auth.studioDiagramSharing || createDefaultDiagramSharingState();
        const canEditSharedSettings = canEditStudioSharedDiagramSettings(currentSharing);
        return {
            ...currentSharing,
            useSharedImage: canEditSharedSettings ? !!elements.useSharedDiagramImage?.checked : !!currentSharing.useSharedImage,
            useSharedLabels: canEditSharedSettings ? !!elements.reuseSharedDiagramLabels?.checked : !!currentSharing.useSharedLabels,
            questionOverride: !!elements.overrideSharedDiagramQuestion?.checked
        };
    }

    function updateDiagramSharingControls() {
        const sharing = state.auth.studioDiagramSharing || createDefaultDiagramSharingState();
        const sourceQuestionId = getDiagramSharingSourceQuestionId(sharing);
        const hasSource = !!sourceQuestionId;
        const isSource = isCurrentStudioSharedDiagramSource(sharing);
        const canEditSharedSettings = canEditStudioSharedDiagramSettings(sharing);
        if (elements.useSharedDiagramImage) {
            elements.useSharedDiagramImage.checked = !!sharing.useSharedImage;
            elements.useSharedDiagramImage.disabled = !canEditSharedSettings;
        }
        if (elements.reuseSharedDiagramLabels) {
            elements.reuseSharedDiagramLabels.checked = !!sharing.useSharedLabels;
            elements.reuseSharedDiagramLabels.disabled = !sharing.useSharedImage || !canEditSharedSettings;
        }
        if (elements.overrideSharedDiagramQuestion) {
            elements.overrideSharedDiagramQuestion.checked = !!sharing.questionOverride && !isSource;
            elements.overrideSharedDiagramQuestion.disabled = !sharing.useSharedImage || isSource;
        }
        if (elements.goToSharedDiagramSourceBtn) {
            const showSourceJump = hasSource && !isSource;
            elements.goToSharedDiagramSourceBtn.classList.toggle('hidden', !showSourceJump);
            elements.goToSharedDiagramSourceBtn.disabled = !showSourceJump;
            elements.goToSharedDiagramSourceBtn.textContent = showSourceJump ? `Go to ${getStudioQuestionDisplayLabel(sourceQuestionId)}` : 'Go to source question';
        }
        if (elements.diagramSharingStatus) {
            const hasSharedImage = !!normalizeSheetText(sharing.sharedImageUrl);
            const hasSharedLabels = normalizeDiagramLabels(sharing.sharedLabels || []).length > 0;
            const fileName = getSharedDiagramImageName(sharing);
            const fileText = hasSharedImage
                ? `File: ${fileName || 'saved shared image'}.`
                : 'File: none selected yet.';
            const sourceText = hasSource
                ? `${isSource ? 'This question controls the shared diagram.' : `Shared diagram controlled by ${getStudioQuestionDisplayLabel(sourceQuestionId)}.`}`
                : 'No shared diagram source has been saved yet.';
            const labelText = sharing.useSharedLabels
                ? `Shared labels ${hasSharedLabels ? 'saved' : 'not saved yet'}.`
                : 'Labels remain per-question unless shared labels are enabled.';
            elements.diagramSharingStatus.textContent = sharing.useSharedImage
                ? `${sourceText} ${fileText} ${labelText}`
                : 'Sharing is optional. Turn on a shared image from the source question to use one uploaded diagram across this quiz.';
        }
    }

    function setStudioDiagramSharingState(nextSharing = {}) {
        state.auth.studioDiagramSharing = {
            ...createDefaultDiagramSharingState(),
            ...(state.auth.studioDiagramSharing || {}),
            ...nextSharing,
            sharedImageName: getSharedDiagramImageName({ ...(state.auth.studioDiagramSharing || {}), ...nextSharing }),
            sourceQuestionId: getDiagramSharingSourceQuestionId({ ...(state.auth.studioDiagramSharing || {}), ...nextSharing }),
            sharedLabels: normalizeDiagramLabels(nextSharing.sharedLabels ?? state.auth.studioDiagramSharing?.sharedLabels ?? [])
        };
        if (isCurrentStudioSharedDiagramSource(state.auth.studioDiagramSharing)) {
            state.auth.studioDiagramSharing.questionOverride = false;
        }
        updateDiagramSharingControls();
    }

    async function persistStudioDiagramSharingState(quizId = state.auth.editingQuizId, nextSharing = state.auth.studioDiagramSharing || {}) {
        if (!state.auth.client || !quizId) return;
        const { data: quizRow, error: quizError } = await state.auth.client
            .from('quizzes')
            .select('description')
            .eq('id', quizId)
            .maybeSingle();
        if (quizError) throw quizError;
        const currentDescription = normalizeSheetText(quizRow?.description);
        const previousDescriptionRefs = collectQuizDescriptionMediaReferences(currentDescription);
        const nextDescription = setDiagramSharingInDescription(currentDescription, nextSharing);
        const { error: descriptionError } = await state.auth.client
            .from('quizzes')
            .update({ description: nextDescription })
            .eq('id', quizId);
        if (descriptionError) throw descriptionError;
        setStudioDiagramSharingState(nextSharing);
        await deleteReplacedMediaReferences(previousDescriptionRefs, nextDescription, { protectedValue: nextDescription });
    }

    function getFirstDiagramQuestionId(rows = state.auth.studioQuizQuestions || []) {
        const match = getStudioQuestionRowsSnapshot(rows).find(question => normalizeSheetText(question?.question_type) === 'diagrams');
        return normalizeSheetText(match?.id);
    }

    async function ensureSharedDiagramSourceQuestionForRows(quizId = state.auth.editingQuizId, rows = state.auth.studioQuizQuestions || [], options = {}) {
        const sharing = state.auth.studioDiagramSharing || createDefaultDiagramSharingState();
        if (!sharing.useSharedImage) return sharing;
        const sourceQuestionId = getDiagramSharingSourceQuestionId(sharing);
        const sourceStillExists = !!sourceQuestionId && !!getStudioQuestionRowById(sourceQuestionId, rows);
        if (sourceStillExists) return sharing;

        const fallbackSourceQuestionId = getFirstDiagramQuestionId(rows);
        const nextSharing = fallbackSourceQuestionId
            ? { ...sharing, sourceQuestionId: fallbackSourceQuestionId, questionOverride: false }
            : {
                ...sharing,
                useSharedImage: false,
                useSharedLabels: false,
                sharedImageUrl: '',
                sharedImageLabel: '',
                sharedImageName: '',
                sharedLabels: [],
                sourceQuestionId: '',
                questionOverride: false
            };
        if (options.persist !== false && quizId) {
            await persistStudioDiagramSharingState(quizId, nextSharing);
        } else {
            setStudioDiagramSharingState(nextSharing);
        }
        return nextSharing;
    }

    function isUsingSharedDiagramImage() {
        const sharing = getStudioDiagramSharingDraft();
        return !!(sharing.useSharedImage && !sharing.questionOverride);
    }

    function isUsingSharedDiagramLabels() {
        const sharing = getStudioDiagramSharingDraft();
        return !!(sharing.useSharedImage && sharing.useSharedLabels && !sharing.questionOverride);
    }

    function getEffectiveStudioDiagramImage(questionImage = '') {
        const sharing = state.auth.studioDiagramSharing || createDefaultDiagramSharingState();
        return sharing.useSharedImage && !sharing.questionOverride
            ? normalizeSheetText(sharing.sharedImageUrl || questionImage)
            : normalizeSheetText(questionImage);
    }

    function getEffectiveStudioDiagramLabels(questionLabels = []) {
        const sharing = state.auth.studioDiagramSharing || createDefaultDiagramSharingState();
        return sharing.useSharedImage && sharing.useSharedLabels && !sharing.questionOverride
            ? normalizeDiagramLabels(sharing.sharedLabels || questionLabels)
            : normalizeDiagramLabels(questionLabels);
    }

    function getOptionsJsonOptions(optionsJson) {
        if (Array.isArray(optionsJson)) return optionsJson;
        if (optionsJson && typeof optionsJson === 'object' && Array.isArray(optionsJson.options)) return optionsJson.options;
        return [];
    }

    function getDiagramLabelsFromDetailRow(detailRow) {
        const optionsJson = getDiagramOptionsJsonObject(detailRow);
        return normalizeDiagramLabels(optionsJson.diagramLabels || optionsJson.labels || []);
    }

    function getStudioDiagramLabelsFromDOM() {
        if (!elements.diagramLabelList) return [];
        return normalizeDiagramLabels(Array.from(elements.diagramLabelList.querySelectorAll('[data-diagram-label-row]')).map((row, index) => ({
            label: normalizeAuthoredMathChemText(row.querySelector('[data-diagram-label-text]')?.value) || getDiagramLabelName(index),
            x: Number(row.querySelector('[data-diagram-label-x]')?.value || 50),
            y: Number(row.querySelector('[data-diagram-label-y]')?.value || 50)
        })));
    }

    function getStudioDiagramImageLoadFailureMessage(sourceValue = state.auth.studioQuestionImageDataUrl) {
        const sharing = state.auth.studioDiagramSharing || createDefaultDiagramSharingState();
        const isSharedImage = sharing.useSharedImage
            && !sharing.questionOverride
            && normalizeSheetText(sourceValue)
            && normalizeSheetText(sourceValue) === normalizeSheetText(sharing.sharedImageUrl);
        if (isSharedImage) {
            const fileName = getSharedDiagramImageName(sharing);
            return `Shared diagram image${fileName ? ` (${fileName})` : ''} could not load. Re-upload it from the shared source question.`;
        }
        return 'Saved diagram image could not load. Re-upload the image.';
    }

    function setStudioDiagramPreviewAvailability(hasLoadedImage) {
        if (elements.studioDiagramEmptyState) {
            elements.studioDiagramEmptyState.classList.toggle('hidden', !!hasLoadedImage);
        }
        if (elements.studioDiagramPreview) {
            elements.studioDiagramPreview.classList.toggle('has-image', !!hasLoadedImage);
        }
    }

    function updateStudioDiagramPreviewImage() {
        const imageSource = normalizeSheetText(state.auth.studioQuestionImageDataUrl);
        const hasImage = !!imageSource;
        if (elements.studioDiagramEmptyState) {
            elements.studioDiagramEmptyState.textContent = hasImage
                ? 'Loading diagram image…'
                : 'No diagram image selected. You can still save this as a regular multiple-choice-style question.';
        }
        setStudioDiagramPreviewAvailability(false);
        if (elements.studioDiagramPreviewImage) {
            setPreviewImageSource(elements.studioDiagramPreviewImage, imageSource, {
                onLoad: () => setStudioDiagramPreviewAvailability(true),
                onError: sourceValue => {
                    const message = getStudioDiagramImageLoadFailureMessage(sourceValue);
                    if (elements.studioDiagramEmptyState) {
                        elements.studioDiagramEmptyState.textContent = message;
                    }
                    if (elements.createQuestionImageName && normalizeSheetText(state.auth.studioQuestionImageDataUrl) === normalizeSheetText(sourceValue)) {
                        elements.createQuestionImageName.textContent = message;
                    }
                    setStudioDiagramPreviewAvailability(false);
                }
            });
        }
    }

    function getDiagramLabelClampBounds(index = null) {
        const wrap = elements.studioDiagramPreviewWrap || elements.studioDiagramPreview;
        const rect = wrap?.getBoundingClientRect?.();
        if (!rect?.width || !rect?.height) {
            return { minX: 3, maxX: 97, minY: 3, maxY: 97 };
        }

        let markerRect = null;
        if (index !== null && elements.studioDiagramLabelLayer) {
            markerRect = elements.studioDiagramLabelLayer
                .querySelector(`[data-diagram-label-index="${index}"]`)
                ?.getBoundingClientRect?.() || null;
        }

        const markerWidth = markerRect?.width || 20;
        const markerHeight = markerRect?.height || 20;
        const minX = Math.min(50, Math.max(0, ((markerWidth / 2) / rect.width) * 100));
        const minY = Math.min(50, Math.max(0, ((markerHeight / 2) / rect.height) * 100));
        return {
            minX,
            maxX: 100 - minX,
            minY,
            maxY: 100 - minY
        };
    }

    function clampDiagramLabelPosition(x, y, index = null) {
        const bounds = getDiagramLabelClampBounds(index);
        return {
            x: Math.min(bounds.maxX, Math.max(bounds.minX, Number(x) || 0)),
            y: Math.min(bounds.maxY, Math.max(bounds.minY, Number(y) || 0))
        };
    }

    function syncStudioDiagramMarkersFromRows() {
        const labels = getStudioDiagramLabelsFromDOM();
        state.auth.studioDiagramLabels = labels;
        if (!elements.studioDiagramLabelLayer) return;
        elements.studioDiagramLabelLayer.innerHTML = labels.map((item, index) => `
            <button type="button" class="studio-diagram-label-marker" data-diagram-label-index="${index}" style="left:${item.x}%; top:${item.y}%;" title="Drag label ${escapeHtml(displayMathChemTextForEditor(item.label))}">${renderMathChemTextToHtml(item.label)}</button>
        `).join('');
    }

    function renderStudioDiagramLabels(labels = null) {
        const drafts = labels === null ? normalizeDiagramLabels([{ label: 'A', x: 50, y: 50 }]) : normalizeDiagramLabels(labels || []);
        state.auth.studioDiagramLabels = drafts;
        if (elements.diagramLabelList) {
            elements.diagramLabelList.innerHTML = drafts.map((item, index) => `
                <div class="studio-diagram-label-row" data-diagram-label-row data-diagram-label-index="${index}">
                  <input type="text" autocomplete="off" value="${escapeHtml(displayMathChemTextForEditor(item.label))}" aria-label="Diagram label ${index + 1}" data-diagram-label-text>
                  <label><span>X%</span><input type="number" min="0" max="100" step="0.1" value="${Number(item.x).toFixed(1)}" data-diagram-label-x></label>
                  <label><span>Y%</span><input type="number" min="0" max="100" step="0.1" value="${Number(item.y).toFixed(1)}" data-diagram-label-y></label>
                  <button type="button" class="auth-action-btn auth-secondary-btn studio-diagram-label-delete" data-diagram-label-delete aria-label="Delete label ${escapeHtml(displayMathChemTextForEditor(item.label))}">Delete</button>
                </div>
            `).join('');
        }
        updateStudioDiagramPreviewImage();
        syncStudioDiagramMarkersFromRows();
    }

    function addStudioDiagramLabel() {
        const labels = getStudioDiagramLabelsFromDOM();
        labels.push({ label: getDiagramLabelName(labels.length), x: 50, y: 50 });
        renderStudioDiagramLabels(labels);
        setStudioDirtyState(true);
    }

    function removeLastStudioDiagramLabel() {
        const labels = getStudioDiagramLabelsFromDOM();
        labels.pop();
        renderStudioDiagramLabels(labels);
        setStudioDirtyState(true);
    }

    function updateStudioDiagramLabelPosition(index, x, y) {
        const row = elements.diagramLabelList?.querySelector(`[data-diagram-label-row][data-diagram-label-index="${index}"]`);
        if (!row) return;
        const xInput = row.querySelector('[data-diagram-label-x]');
        const yInput = row.querySelector('[data-diagram-label-y]');
        const safePosition = clampDiagramLabelPosition(x, y, index);
        if (xInput) xInput.value = safePosition.x.toFixed(1);
        if (yInput) yInput.value = safePosition.y.toFixed(1);
        syncStudioDiagramMarkersFromRows();
        setStudioDirtyState(true);
    }

    function renderDiagramStudyLabels(labels = []) {
        const layer = elements.diagramStudyLabelLayer;
        if (!layer) return;
        const drafts = normalizeDiagramLabels(labels);
        layer.innerHTML = drafts.map(item => `
            <span class="diagram-study-label" style="left:${item.x}%; top:${item.y}%;">${renderMathChemTextToHtml(item.label)}</span>
        `).join('');
        layer.classList.toggle('hidden', !drafts.length);
        layer.setAttribute('aria-hidden', drafts.length ? 'false' : 'true');
    }

    function clearDiagramStudyLabels() {
        if (!elements.diagramStudyLabelLayer) return;
        elements.diagramStudyLabelLayer.innerHTML = '';
        elements.diagramStudyLabelLayer.classList.add('hidden');
        elements.diagramStudyLabelLayer.setAttribute('aria-hidden', 'true');
    }

    async function replaceMediaRefsForCopiedValue(value, options = {}) {
        const normalizedValue = normalizeSheetText(value);
        if (!isSupabaseMediaReference(normalizedValue)) return normalizedValue;
        const sourceAssetId = getSupabaseMediaAssetId(normalizedValue);
        if (!sourceAssetId || !state.auth.client || !state.auth.user?.id) return normalizedValue;

        const { data: sourceAsset, error: sourceError } = await state.auth.client
            .from('media_assets')
            .select('id, bucket_name, object_path, original_name, mime_type, size_bytes, usage_context')
            .eq('id', sourceAssetId)
            .maybeSingle();

        if (sourceError || !sourceAsset?.object_path) {
            if (sourceError) console.error('Could not load source media asset for duplication:', sourceError);
            return normalizedValue;
        }

        const bucketName = sourceAsset.bucket_name || CONFIG.mediaAssets.bucketName;
        const newAssetId = createMediaAssetId();
        const fileName = getSafeMediaFileName(sourceAsset.original_name || '', sourceAsset.mime_type || '', options.usageContext || sourceAsset.usage_context || 'image');
        const newObjectPath = `${state.auth.user.id}/${newAssetId}/${fileName}`;
        const { error: copyError } = await state.auth.client.storage
            .from(bucketName)
            .copy(sourceAsset.object_path, newObjectPath);

        if (copyError) {
            console.error('Could not copy media asset for duplication:', copyError);
            return normalizedValue;
        }

        const { error: insertError } = await state.auth.client
            .from('media_assets')
            .insert({
                id: newAssetId,
                user_id: state.auth.user.id,
                bucket_name: bucketName,
                object_path: newObjectPath,
                original_name: fileName,
                mime_type: sourceAsset.mime_type || '',
                size_bytes: sourceAsset.size_bytes || null,
                quiz_id: options.quizId || null,
                question_id: options.questionId || null,
                usage_context: normalizeSheetText(options.usageContext || sourceAsset.usage_context || '')
            });

        if (insertError) {
            await state.auth.client.storage.from(bucketName).remove([newObjectPath]);
            console.error('Could not save duplicated media asset metadata:', insertError);
            return normalizedValue;
        }

        return buildSupabaseMediaReference(newAssetId);
    }

    async function cloneMediaRefsInObject(value, options = {}) {
        if (!value) return value;
        if (typeof value === 'string') {
            return replaceMediaRefsForCopiedValue(value, options);
        }
        if (Array.isArray(value)) {
            const clonedItems = [];
            for (const item of value) {
                clonedItems.push(await cloneMediaRefsInObject(item, options));
            }
            return clonedItems;
        }
        if (typeof value === 'object') {
            const clonedEntries = [];
            for (const [key, item] of Object.entries(value)) {
                clonedEntries.push([key, await cloneMediaRefsInObject(item, { ...options, usageContext: key })]);
            }
            return Object.fromEntries(clonedEntries);
        }
        return value;
    }

    async function getQuestionMediaReferences(questionId) {
        if (!state.auth.client || !questionId) return new Set();
        const refs = new Set();
        const { data: questionRow, error: questionError } = await state.auth.client
            .from('questions')
            .select('id, question_type, image_url, learning_resources_image_url')
            .eq('id', questionId)
            .maybeSingle();

        if (questionError || !questionRow) {
            if (questionError) console.error('Could not load question media before delete:', questionError);
            return refs;
        }

        collectSupabaseMediaReferences(questionRow.image_url, refs);
        collectSupabaseMediaReferences(questionRow.learning_resources_image_url, refs);

        if (questionRow.question_type === 'flashcard') {
            const detail = await loadFlashcardDetailByQuestionId(questionId);
            collectSupabaseMediaReferences(detail?.term_image_url, refs);
            collectSupabaseMediaReferences(detail?.definition_image_url, refs);
        } else if (questionRow.question_type === 'classify') {
            const detail = await loadClassifyDetailByQuestionId(questionId);
            collectSupabaseMediaReferences(detail?.items_json, refs);
            collectSupabaseMediaReferences(detail?.classifications_json, refs);
        } else if (questionRow.question_type === 'multiple_choice' || questionRow.question_type === 'diagrams') {
            const detail = await loadMultipleChoiceDetailByQuestionId(questionId);
            collectSupabaseMediaReferences(detail?.options_json, refs);
        }

        return refs;
    }

    async function deleteSupabaseMediaReferences(refs, options = {}) {
        const protectedRefs = collectSupabaseMediaReferences(options.protectedValue, new Set(options.protectedRefs || []));
        const assetIds = Array.from(new Set(Array.from(refs || [])
            .filter(ref => !protectedRefs.has(ref))
            .map(getSupabaseMediaAssetId)
            .filter(Boolean)));
        if (!state.auth.client || !assetIds.length) return;

        const { data: assets, error } = await state.auth.client
            .from('media_assets')
            .select('id, bucket_name, object_path')
            .in('id', assetIds);

        if (error) {
            console.error('Could not load media assets for deletion:', error);
            return;
        }

        const assetsByBucket = new Map();
        (assets || []).forEach(asset => {
            const bucketName = asset.bucket_name || CONFIG.mediaAssets.bucketName;
            if (!assetsByBucket.has(bucketName)) assetsByBucket.set(bucketName, []);
            assetsByBucket.get(bucketName).push(asset.object_path);
            state.auth.mediaSignedUrlCache?.delete(asset.id);
        });

        for (const [bucketName, paths] of assetsByBucket.entries()) {
            const safePaths = paths.filter(Boolean);
            if (!safePaths.length) continue;
            const { error: removeError } = await state.auth.client.storage.from(bucketName).remove(safePaths);
            if (removeError) console.error('Could not delete media files:', removeError);
        }

        const { error: deleteError } = await state.auth.client
            .from('media_assets')
            .delete()
            .in('id', assetIds);
        if (deleteError) console.error('Could not delete media asset rows:', deleteError);
    }

    async function deleteMediaForQuestion(questionId) {
        const refs = await getQuestionMediaReferences(questionId);
        await deleteSupabaseMediaReferences(refs);
    }

    async function getQuizMediaReferences(quizId, onProgress = null) {
        const refs = new Set();
        if (!state.auth.client || !quizId) return refs;
        const [{ data: quizRow, error: quizError }, { data: questionRows, error }] = await Promise.all([
            state.auth.client
                .from('quizzes')
                .select('description')
                .eq('id', quizId)
                .maybeSingle(),
            state.auth.client
                .from('questions')
                .select('id')
                .eq('quiz_id', quizId)
        ]);
        if (quizError) {
            console.error('Could not load quiz shared media before delete:', quizError);
        } else {
            collectQuizDescriptionMediaReferences(quizRow?.description, refs);
        }
        if (error) {
            console.error('Could not load quiz media before delete:', error);
            return refs;
        }

        const questions = questionRows || [];
        if (typeof onProgress === 'function') {
            onProgress({ current: 0, total: questions.length });
        }
        for (let index = 0; index < questions.length; index += 1) {
            const questionRefs = await getQuestionMediaReferences(questions[index].id);
            questionRefs.forEach(ref => refs.add(ref));
            if (typeof onProgress === 'function') {
                onProgress({ current: index + 1, total: questions.length });
            }
        }
        return refs;
    }

    async function deleteMediaForQuiz(quizId) {
        const refs = await getQuizMediaReferences(quizId);
        await deleteSupabaseMediaReferences(refs);
    }

    async function deleteReplacedMediaReferences(previousRefs, nextValue, options = {}) {
        const oldRefs = Array.from(previousRefs || []);
        if (!oldRefs.length) return;
        const nextRefs = collectSupabaseMediaReferences(nextValue);
        const protectedRefs = collectSupabaseMediaReferences(options.protectedValue, new Set(options.protectedRefs || []));
        const refsToDelete = new Set(oldRefs.filter(ref => !nextRefs.has(ref) && !protectedRefs.has(ref)));
        await deleteSupabaseMediaReferences(refsToDelete, { protectedRefs });
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

        updateStudioQuestionImagePanelUI();
        updateStudioDiagramPreviewImage();
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

    function isStudioDiagramsMode() {
        return getStudioCurrentQuizType() === 'diagrams';
    }

    function hasStudioQuestionImageValue() {
        return !!normalizeSheetText(state.auth.studioQuestionImageDataUrl);
    }

    function updateStudioQuestionImagePanelUI() {
        const collapseForClassify = isStudioClassifyMode();
        const hasImage = hasStudioQuestionImageValue();
        const isOpen = !collapseForClassify || !!state.auth.studioQuestionImagePanelOpen;

        if (elements.createQuestionImageToggleRow) {
            elements.createQuestionImageToggleRow.classList.toggle('hidden', !collapseForClassify);
        }
        if (elements.createQuestionImagePanel) {
            elements.createQuestionImagePanel.classList.toggle('hidden', collapseForClassify && !isOpen);
        }
        if (elements.createQuestionImageToggleBtn) {
            elements.createQuestionImageToggleBtn.classList.toggle('has-image', hasImage);
            elements.createQuestionImageToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            elements.createQuestionImageToggleBtn.textContent = isOpen ? 'Hide Image' : (hasImage ? 'Edit Image' : 'Image');
            elements.createQuestionImageToggleBtn.title = isOpen
                ? 'Hide Classification question image controls'
                : (hasImage ? 'Edit Classification question image' : 'Show Classification question image controls');
            elements.createQuestionImageToggleBtn.setAttribute('aria-label', elements.createQuestionImageToggleBtn.title);
        }
    }

    function setStudioQuestionImagePanelOpen(forceOpen = null) {
        state.auth.studioQuestionImagePanelOpen = typeof forceOpen === 'boolean'
            ? forceOpen
            : !state.auth.studioQuestionImagePanelOpen;
        updateStudioQuestionImagePanelUI();
    }

    function updateStudioEditorTypeUI() {
        const quizType = getStudioCurrentQuizType();
        const isFlashcard = quizType === 'flashcard';
        const isHierarchy = quizType === 'hierarchy';
        const isClassify = quizType === 'classify';
        const isDiagrams = quizType === 'diagrams';
        const isMultipleChoice = quizType === 'multiple_choice';
        const usesMultipleChoiceOptions = isMultipleChoice || isDiagrams;
        if (elements.sharedQuestionEditorFields) elements.sharedQuestionEditorFields.classList.toggle('hidden', isFlashcard);
        if (elements.multipleChoiceEditorFields) elements.multipleChoiceEditorFields.classList.toggle('hidden', !usesMultipleChoiceOptions);
        if (elements.hierarchyEditorFields) elements.hierarchyEditorFields.classList.toggle('hidden', !isHierarchy);
        if (elements.classifyEditorFields) elements.classifyEditorFields.classList.toggle('hidden', !isClassify);
        if (elements.diagramEditorFields) elements.diagramEditorFields.classList.toggle('hidden', !isDiagrams);
        if (elements.flashcardEditorFields) elements.flashcardEditorFields.classList.toggle('hidden', !isFlashcard);
        updateStudioQuestionImagePanelUI();
        updateDiagramSharingControls();
        [elements.addOptionFieldBtn, elements.addOptionInlineBtn, elements.removeOptionFieldBtn].forEach(button => {
            if (button) button.classList.toggle('hidden', !usesMultipleChoiceOptions);
        });
        updateMathChemToolsVisibility(usesMultipleChoiceOptions);
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

    function getStudioFolderSearchQuery() {
        return normalizeSheetText(state.auth.studioFolderSearchQuery || elements.studioFolderSearchInput?.value || '').toLowerCase();
    }

    function getStudioQuizSearchQuery() {
        return normalizeSheetText(state.auth.studioQuizSearchQuery || elements.studioQuizSearchInput?.value || '').toLowerCase();
    }

    function getStudioQuizFolderFilterId() {
        return normalizeSheetText(state.auth.studioQuizFolderFilterId || elements.studioQuizFolderFilterSelect?.value || '');
    }

    function getFolderQuizStats(folderId = '') {
        const normalizedFolderId = normalizeSheetText(folderId);
        const quizzes = state.auth.managedQuizzes.filter(quiz => normalizeSheetText(quiz.folderId) === normalizedFolderId);
        return {
            quizCount: quizzes.length,
            questionCount: quizzes.reduce((total, quiz) => total + Number(quiz.questionCount || 0), 0)
        };
    }

    function populateStudioQuizFolderFilter() {
        if (!elements.studioQuizFolderFilterSelect) return;
        const previousValue = getStudioQuizFolderFilterId();
        const options = ['<option value="">All folders</option>', '<option value="__none__">No folder</option>'];
        state.auth.supabaseFolders.forEach(folder => {
            const isSelected = folder.id === previousValue ? ' selected' : '';
            options.push(`<option value="${escapeHtml(folder.id)}"${isSelected}>${escapeHtml(folder.name)}</option>`);
        });
        elements.studioQuizFolderFilterSelect.innerHTML = options.join('');
        const validIds = new Set(['', '__none__', ...state.auth.supabaseFolders.map(folder => folder.id)]);
        if (validIds.has(previousValue)) {
            elements.studioQuizFolderFilterSelect.value = previousValue;
        } else {
            elements.studioQuizFolderFilterSelect.value = '';
            state.auth.studioQuizFolderFilterId = '';
        }
    }

    function getFilteredManagedQuizzes() {
        const searchQuery = getStudioQuizSearchQuery();
        const folderFilterId = getStudioQuizFolderFilterId();
        return [...state.auth.managedQuizzes].filter(quiz => {
            if (folderFilterId === '__none__' && normalizeSheetText(quiz.folderId)) return false;
            if (folderFilterId && folderFilterId !== '__none__' && normalizeSheetText(quiz.folderId) !== folderFilterId) return false;
            if (!searchQuery) return true;
            const haystack = `${quiz.name || ''} ${quiz.folderName || ''}`.toLowerCase();
            return haystack.includes(searchQuery);
        });
    }

    function updateStudioQuizFilterStatus(renderedCount = 0) {
        if (!elements.studioQuizFilterStatus) return;
        const searchQuery = getStudioQuizSearchQuery();
        const folderFilterId = getStudioQuizFolderFilterId();
        const folderName = folderFilterId === '__none__'
            ? 'No folder'
            : state.auth.supabaseFolders.find(folder => folder.id === folderFilterId)?.name || '';
        const parts = [];
        if (folderFilterId) parts.push(`Folder: ${folderName || 'Unknown folder'}`);
        if (searchQuery) parts.push(`Search: ${searchQuery}`);
        if (!parts.length) {
            elements.studioQuizFilterStatus.classList.add('hidden');
            elements.studioQuizFilterStatus.textContent = '';
            if (elements.studioQuizClearFiltersBtn) elements.studioQuizClearFiltersBtn.disabled = true;
            return;
        }
        elements.studioQuizFilterStatus.classList.remove('hidden');
        elements.studioQuizFilterStatus.textContent = `Showing ${renderedCount} matching quiz${renderedCount === 1 ? '' : 'zes'} · ${parts.join(' · ')}`;
        if (elements.studioQuizClearFiltersBtn) elements.studioQuizClearFiltersBtn.disabled = false;
    }

    async function openManageQuizzesForFolder(folderId = '') {
        const normalizedFolderId = normalizeSheetText(folderId);
        state.auth.studioQuizFolderFilterId = normalizedFolderId;
        state.auth.studioQuizSearchQuery = '';
        if (elements.studioQuizSearchInput) elements.studioQuizSearchInput.value = '';
        populateStudioQuizFolderFilter();
        if (elements.studioQuizFolderFilterSelect) elements.studioQuizFolderFilterSelect.value = normalizedFolderId;
        renderQuizManagementList();
        await recordStudioFolderActivity(normalizedFolderId, 'opened_folder_filter');
        await setQuizStudioSection('manage');
    }

    function renderFolderManagementList() {
        if (!elements.studioFolderList) return;

        if (!state.auth.client || !state.auth.user?.id) {
            elements.studioFolderList.innerHTML = createStudioEmptyState('Sign in required', 'Sign in before managing your private folders.', [{ label: 'Open Account', action: 'open-auth' }]);
            return;
        }

        if (!state.auth.supabaseFolders.length) {
            elements.studioFolderList.innerHTML = createStudioEmptyState('No folders yet', 'Create your first folder to organize quizzes by class, unit, or chapter.', [{ label: 'Create Folder', action: 'focus-create-folder' }, { label: 'Import Templates', action: 'open-import', secondary: true }]);
            return;
        }

        const searchQuery = getStudioFolderSearchQuery();
        const foldersToRender = state.auth.supabaseFolders.filter(folder => !searchQuery || String(folder.name || '').toLowerCase().includes(searchQuery));
        if (!foldersToRender.length) {
            elements.studioFolderList.innerHTML = createStudioEmptyState('No matching folders', 'Clear or change the folder search to see more folders.', [{ label: 'Clear Search', action: 'clear-folder-search' }]);
            return;
        }

        elements.studioFolderList.innerHTML = foldersToRender.map(folder => {
            const stats = getFolderQuizStats(folder.id);
            const quizLabel = stats.quizCount === 1 ? '1 quiz' : `${stats.quizCount} quizzes`;
            const questionLabel = stats.questionCount === 1 ? '1 question' : `${stats.questionCount} questions`;
            return `
            <div class="studio-list-item" data-folder-id="${escapeHtml(folder.id)}">
              <div class="studio-list-meta">
                <div class="studio-list-title">${escapeHtml(folder.name)}</div>
                <div class="studio-list-subtitle">${escapeHtml(quizLabel)} · ${escapeHtml(questionLabel)}</div>
              </div>
              <div class="studio-list-controls">
                <input class="studio-inline-input" type="text" value="${escapeHtml(folder.name)}" data-folder-rename-input>
                <button type="button" class="auth-action-btn" data-action="view-folder-quizzes">View Quizzes</button>
                <button type="button" class="auth-action-btn" data-action="save-folder">Save</button>
                <button type="button" class="auth-action-btn auth-secondary-btn" data-action="delete-folder">Delete</button>
              </div>
            </div>
        `;
        }).join('');
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

    // ================= QUIZ CHALLENGE TROPHIES =================
    function getQuizChallengeDefinition(challengeKey = '') {
        const normalizedKey = normalizeSheetText(challengeKey);
        return QUIZ_CHALLENGES.find(challenge => challenge.key === normalizedKey) || null;
    }

    function getQuizChallengeAchievementMap(quizId = '') {
        const normalizedQuizId = normalizeSheetText(quizId);
        if (!normalizedQuizId) return new Map();
        return state.auth.quizChallengeAchievements.get(normalizedQuizId) || new Map();
    }

    function hasQuizChallengeAchievement(quizId = '', challengeKey = '') {
        return getQuizChallengeAchievementMap(quizId).has(normalizeSheetText(challengeKey));
    }

    function setQuizChallengeAchievementLocal(quizId = '', challengeKey = '', completedAt = new Date().toISOString()) {
        const normalizedQuizId = normalizeSheetText(quizId);
        const normalizedKey = normalizeSheetText(challengeKey);
        if (!normalizedQuizId || !normalizedKey) return;
        if (!state.auth.quizChallengeAchievements.has(normalizedQuizId)) {
            state.auth.quizChallengeAchievements.set(normalizedQuizId, new Map());
        }
        state.auth.quizChallengeAchievements.get(normalizedQuizId).set(normalizedKey, completedAt);
    }

    function isQuizChallengeGrandUnlocked(quizId = '') {
        return QUIZ_CHALLENGES.every(challenge => hasQuizChallengeAchievement(quizId, challenge.key));
    }

    function canQuizUseChallengeSettings(quiz = {}) {
        const quizType = normalizeSheetText(quiz.quizType || quiz.type || '');
        if (!Number(quiz.questionCount || 0)) return false;
        return quizType !== 'flashcard';
    }

    function renderQuizChallengeBadges(quiz) {
        const quizId = normalizeSheetText(quiz?.id);
        if (!quizId) return '';
        const badgeHtml = QUIZ_CHALLENGES.map(challenge => {
            const unlocked = hasQuizChallengeAchievement(quizId, challenge.key);
            const label = `${challenge.title}: ${unlocked ? 'unlocked' : 'locked'}`;
            return `<span class="quiz-challenge-badge${unlocked ? ' unlocked' : ''}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><span class="quiz-challenge-badge-icon">${unlocked ? '🏆' : '○'}</span><span>${escapeHtml(challenge.shortLabel)}</span></span>`;
        }).join('');
        const grandUnlocked = isQuizChallengeGrandUnlocked(quizId);
        const grandLabel = `Grand Trophy: ${grandUnlocked ? 'unlocked' : 'locked'}`;
        return `<div class="quiz-challenge-badges" aria-label="Quiz challenge trophies">${badgeHtml}<span class="quiz-challenge-badge grand${grandUnlocked ? ' unlocked' : ''}" title="${escapeHtml(grandLabel)}" aria-label="${escapeHtml(grandLabel)}"><span class="quiz-challenge-badge-icon">${grandUnlocked ? '🌟' : '☆'}</span><span>All</span></span></div>`;
    }

    function renderQuizChallengePanel(quiz) {
        const quizId = normalizeSheetText(quiz?.id);
        const canStart = canQuizUseChallengeSettings(quiz);
        const disabledReason = canStart ? '' : 'Challenges require a quiz type with answer choices so the challenge settings can be locked.';
        const tableNote = state.auth.quizChallengeUnavailable
            ? 'Supabase challenge table is not available yet; install the Phase 22BG SQL before trophies can save permanently.'
            : '';
        const challengeRows = QUIZ_CHALLENGES.map(challenge => {
            const unlocked = hasQuizChallengeAchievement(quizId, challenge.key);
            return `
                <div class="quiz-challenge-row${unlocked ? ' completed' : ''}">
                  <div class="quiz-challenge-row-main">
                    <div class="quiz-challenge-row-title"><span>${unlocked ? '🏆' : '○'}</span> ${escapeHtml(challenge.title)}</div>
                    <div class="quiz-challenge-row-description">${escapeHtml(challenge.description)}</div>
                  </div>
                  <button type="button" class="auth-action-btn quiz-challenge-begin-btn" data-action="begin-challenge" data-challenge-key="${escapeHtml(challenge.key)}"${!canStart ? ' disabled' : ''}>Begin Challenge</button>
                </div>
            `;
        }).join('');
        const grandUnlocked = isQuizChallengeGrandUnlocked(quizId);
        return `
            <div class="quiz-challenge-panel">
              <div class="quiz-challenge-panel-heading">
                <span>Challenges</span>
                <span class="quiz-challenge-grand${grandUnlocked ? ' unlocked' : ''}">${grandUnlocked ? '🌟 Grand Trophy unlocked' : '☆ Grand Trophy locked'}</span>
              </div>
              ${tableNote ? `<div class="quiz-challenge-note quiz-challenge-warning">${escapeHtml(tableNote)}</div>` : ''}
              ${disabledReason ? `<div class="quiz-challenge-note">${escapeHtml(disabledReason)}</div>` : `<div class="quiz-challenge-note">Begin a challenge to lock the required mode, Shuffle Questions, and Shuffle Answers until the attempt is finished.</div>`}
              <div class="quiz-challenge-list">${challengeRows}</div>
            </div>
        `;
    }

    async function loadQuizChallengeAchievementsFromSupabase() {
        state.auth.quizChallengeAchievements = new Map();
        state.auth.quizChallengeUnavailable = false;

        if (!state.auth.client || !state.auth.user?.id) {
            return state.auth.quizChallengeAchievements;
        }

        try {
            const { data, error } = await state.auth.client
                .from(QUIZ_CHALLENGE_TABLE)
                .select('quiz_id, challenge_key, completed_at')
                .eq('user_id', state.auth.user.id);

            if (error) throw error;

            (data || []).forEach(row => {
                setQuizChallengeAchievementLocal(row.quiz_id, row.challenge_key, row.completed_at || 'completed');
            });
        } catch (error) {
            state.auth.quizChallengeUnavailable = true;
            console.warn('Quiz challenge achievements table unavailable:', error);
        }

        return state.auth.quizChallengeAchievements;
    }

    function setStudioActivityLocal(entityType = '', entityId = '', payload = {}) {
        const type = normalizeSheetText(entityType);
        const id = normalizeSheetText(entityId);
        if (!type || !id) return;
        const bucket = type === 'folder' ? state.auth.studioActivity.folders : state.auth.studioActivity.quizzes;
        bucket.set(id, {
            entityType: type,
            entityId: id,
            folderId: normalizeSheetText(payload.folderId),
            lastActiveAt: normalizeSheetText(payload.lastActiveAt) || new Date().toISOString(),
            lastActiveReason: normalizeSheetText(payload.lastActiveReason) || 'opened'
        });
    }

    function getStudioActivityTime(entityType = '', entityId = '', fallback = '') {
        const type = normalizeSheetText(entityType);
        const id = normalizeSheetText(entityId);
        const bucket = type === 'folder' ? state.auth.studioActivity.folders : state.auth.studioActivity.quizzes;
        const activityTime = getStudioUpdatedTime(bucket.get(id)?.lastActiveAt);
        return activityTime || getStudioUpdatedTime(fallback);
    }

    async function loadStudioActivityFromSupabase() {
        state.auth.studioActivity.quizzes = new Map();
        state.auth.studioActivity.folders = new Map();
        state.auth.studioActivity.unavailable = false;

        if (!state.auth.client || !state.auth.user?.id) {
            return state.auth.studioActivity;
        }

        try {
            const { data, error } = await state.auth.client
                .from(STUDIO_ACTIVITY_TABLE)
                .select('entity_type, entity_id, folder_id, last_active_at, last_active_reason')
                .eq('user_id', state.auth.user.id);

            if (error) throw error;

            (data || []).forEach(row => {
                setStudioActivityLocal(row.entity_type, row.entity_id, {
                    folderId: row.folder_id,
                    lastActiveAt: row.last_active_at,
                    lastActiveReason: row.last_active_reason
                });
            });
        } catch (error) {
            state.auth.studioActivity.unavailable = true;
            console.warn('Studio activity table unavailable:', error);
        }

        return state.auth.studioActivity;
    }

    async function recordStudioActivity(entityType = '', entityId = '', reason = 'opened', options = {}) {
        const type = normalizeSheetText(entityType);
        const id = normalizeSheetText(entityId);
        if (!type || !id || !['quiz', 'folder'].includes(type)) return null;

        const quiz = type === 'quiz' ? state.auth.managedQuizzes.find(item => item.id === id) : null;
        const folderId = type === 'folder'
            ? id
            : normalizeSheetText(options.folderId || quiz?.folderId);
        const now = new Date().toISOString();
        const payload = {
            user_id: state.auth.user?.id,
            entity_type: type,
            entity_id: id,
            folder_id: folderId || null,
            last_active_at: now,
            last_active_reason: normalizeSheetText(reason) || 'opened',
            updated_at: now
        };

        setStudioActivityLocal(type, id, {
            folderId,
            lastActiveAt: now,
            lastActiveReason: payload.last_active_reason
        });
        if (type === 'quiz' && folderId) {
            setStudioActivityLocal('folder', folderId, {
                folderId,
                lastActiveAt: now,
                lastActiveReason: `quiz_${payload.last_active_reason}`
            });
        }
        renderStudioHomeDashboard();

        if (!state.auth.client || !state.auth.user?.id || state.auth.studioActivity.unavailable) {
            return payload;
        }

        try {
            const { error } = await state.auth.client
                .from(STUDIO_ACTIVITY_TABLE)
                .upsert(payload, { onConflict: 'user_id,entity_type,entity_id' });
            if (error) throw error;

            if (type === 'quiz' && folderId) {
                const folderPayload = {
                    user_id: state.auth.user.id,
                    entity_type: 'folder',
                    entity_id: folderId,
                    folder_id: folderId,
                    last_active_at: now,
                    last_active_reason: `quiz_${payload.last_active_reason}`,
                    updated_at: now
                };
                const { error: folderError } = await state.auth.client
                    .from(STUDIO_ACTIVITY_TABLE)
                    .upsert(folderPayload, { onConflict: 'user_id,entity_type,entity_id' });
                if (folderError) throw folderError;
            }
        } catch (error) {
            state.auth.studioActivity.unavailable = true;
            console.warn('Could not save Studio activity:', error);
        }
        return payload;
    }

    function recordStudioQuizActivity(quizId = '', reason = 'opened') {
        return recordStudioActivity('quiz', quizId, reason);
    }

    function recordStudioFolderActivity(folderId = '', reason = 'opened') {
        return recordStudioActivity('folder', folderId, reason);
    }

    async function persistQuizChallengeAchievement(quizId = '', challengeKey = '') {
        const normalizedQuizId = normalizeSheetText(quizId);
        const normalizedKey = normalizeSheetText(challengeKey);
        if (!normalizedQuizId || !normalizedKey || !state.auth.client || !state.auth.user?.id) {
            throw new Error('Challenge trophies require a signed-in Supabase user.');
        }

        const now = new Date().toISOString();
        const payload = {
            user_id: state.auth.user.id,
            quiz_id: normalizedQuizId,
            challenge_key: normalizedKey,
            completed_at: now,
            settings_snapshot: {
                phase: '22BJ',
                mode: getQuizChallengeDefinition(normalizedKey)?.mode || '',
                shuffleQuestions: true,
                shuffleAnswers: true
            },
            updated_at: now
        };

        const { error } = await state.auth.client
            .from(QUIZ_CHALLENGE_TABLE)
            .upsert(payload, { onConflict: 'user_id,quiz_id,challenge_key' });

        if (error) throw error;
        setQuizChallengeAchievementLocal(normalizedQuizId, normalizedKey, now);
        return payload;
    }

    function isActiveQuizChallenge() {
        return !!state.activeQuizChallenge?.challengeKey;
    }

    function clearActiveQuizChallenge() {
        state.activeQuizChallenge = null;
        updateSettingsAvailability();
    }

    function setChallengeModeSettings(challenge) {
        const retentionMode = document.getElementById('retentionMode');
        const masteryMode = document.getElementById('masteryMode');
        const masteryCheckMode = document.getElementById('masteryCheckMode');
        const progressMode = document.getElementById('progressMode');
        const shuffleQuestions = document.getElementById('shuffleQuestions');
        const shuffleAnswers = document.getElementById('shuffleAnswers');
        if (retentionMode) retentionMode.checked = challenge.mode === 'retention';
        if (masteryMode) masteryMode.checked = challenge.mode === 'mastery';
        if (masteryCheckMode) masteryCheckMode.checked = challenge.mode === 'mastery_check';
        if (progressMode) progressMode.checked = challenge.mode === 'progress';
        if (shuffleQuestions) shuffleQuestions.checked = true;
        if (shuffleAnswers) shuffleAnswers.checked = true;
    }

    async function beginQuizChallenge(quizId = '', challengeKey = '') {
        const normalizedQuizId = normalizeSheetText(quizId);
        const challenge = getQuizChallengeDefinition(challengeKey);
        if (!normalizedQuizId || !challenge) {
            setCreatorStatus('Could not start that challenge.', 'error');
            return null;
        }

        const managedQuiz = state.auth.managedQuizzes.find(quiz => quiz.id === normalizedQuizId) || null;
        if (!managedQuiz || !canQuizUseChallengeSettings(managedQuiz)) {
            setCreatorStatus('That quiz cannot start challenges because its question type does not support the required challenge settings.', 'error');
            return null;
        }


        if (state.auth.studioHasUnsavedChanges) {
            const saved = await autosaveStudioChanges({ reason: 'start this challenge', allowCreate: true });
            if (!saved) return null;
        }

        setChallengeModeSettings(challenge);
        const targetQuiz = await refreshQuizCatalog({ selectQuizId: `sb:${normalizedQuizId}`, loadSelectedQuiz: false });
        if (!targetQuiz) throw new Error('Quiz not found');

        state.activeQuizChallenge = {
            quizId: normalizedQuizId,
            challengeKey: challenge.key,
            mode: challenge.mode,
            startedAt: new Date().toISOString(),
            completionInFlight: false,
            completed: false
        };

        try {
            await loadSelectedQuiz(targetQuiz.id, { preserveChallenge: true });
        } catch (error) {
            state.activeQuizChallenge = null;
            updateSettingsAvailability();
            throw error;
        }
        updateSettingsAvailability();
        await closeQuizStudioPage(true);
        setFeedback('Challenge started!', true);
        return targetQuiz;
    }

    function isActiveChallengeComplete() {
        const activeChallenge = state.activeQuizChallenge;
        if (!activeChallenge?.challengeKey) return false;
        const challenge = getQuizChallengeDefinition(activeChallenge.challengeKey);
        if (!challenge) return false;

        if (challenge.mode === 'progress') {
            return isProgressMode() && state.normalFinished && getProgressMissedQuestions().length === 0;
        }
        if (challenge.mode === 'mastery') {
            return isRetryMode() && state.questionQueue.length === 0;
        }
        if (challenge.mode === 'retention') {
            return isRetentionMode() && state.retentionFinished;
        }
        if (challenge.mode === 'mastery_check') {
            return isMasteryCheckMode() && state.masteryCheckFinished;
        }
        return false;
    }

    function renderQuizChallengeCompleteMessage(challenge, grandUnlocked = false, saved = true) {
        elements.questionTextEl.style.display = 'block';
        elements.questionTextEl.innerText = `🏆 ${challenge.title} Complete!`;
        elements.optionsContainer.style.display = 'flex';
        elements.optionsContainer.innerHTML = '';

        const summary = document.createElement('div');
        summary.className = 'quiz-challenge-complete-summary';

        const message = document.createElement('div');
        message.className = 'quiz-challenge-complete-message';
        message.innerText = saved
            ? `You mastered this challenge. ${challenge.title.replace(' Challenge', '')} Trophy unlocked.`
            : `Challenge complete, but the trophy could not be saved permanently. Check the Supabase challenge table setup.`;
        summary.appendChild(message);

        if (grandUnlocked) {
            const grand = document.createElement('div');
            grand.className = 'quiz-challenge-grand-message';
            grand.innerText = '🌟 Grand Trophy unlocked! You completed every challenge for this quiz.';
            summary.appendChild(grand);
        }

        elements.optionsContainer.appendChild(summary);
    }

    function maybeCompleteActiveQuizChallenge() {
        const activeChallenge = state.activeQuizChallenge;
        if (!activeChallenge?.challengeKey || activeChallenge.completionInFlight || activeChallenge.completed) return;
        if (!isActiveChallengeComplete()) return;

        const challenge = getQuizChallengeDefinition(activeChallenge.challengeKey);
        if (!challenge) return;

        activeChallenge.completionInFlight = true;
        persistQuizChallengeAchievement(activeChallenge.quizId, activeChallenge.challengeKey)
            .then(() => {
                activeChallenge.completed = true;
                const grandUnlocked = isQuizChallengeGrandUnlocked(activeChallenge.quizId);
                renderQuizChallengeCompleteMessage(challenge, grandUnlocked, true);
                state.activeQuizChallenge = null;
                renderQuizManagementList();
            })
            .catch(error => {
                console.error('Could not save quiz challenge trophy:', error);
                renderQuizChallengeCompleteMessage(challenge, false, false);
                state.activeQuizChallenge = null;
            })
            .finally(() => {
                activeChallenge.completionInFlight = false;
                updateSettingsAvailability();
            });
    }

    function maybeAutoFinishActiveQuizChallengeAfterAnswer() {
        const activeChallenge = state.activeQuizChallenge;
        if (!activeChallenge?.challengeKey || activeChallenge.completed || activeChallenge.completionInFlight) return false;

        const challenge = getQuizChallengeDefinition(activeChallenge.challengeKey);
        if (!challenge) return false;

        if (challenge.mode === 'progress' && isProgressMode() && state.currentIndex >= state.questionQueue.length - 1 && !state.normalFinished) {
            state.normalFinished = true;
            showQuestion();
            clearPendingLearningResource();
            return true;
        }

        if (challenge.mode === 'mastery' && isRetryMode() && state.questionQueue.length === 0) {
            showQuestion();
            showPendingLearningResourceIfAny();
            return true;
        }

        if (
            challenge.mode === 'retention' &&
            isRetentionMode() &&
            state.pendingRetentionCorrect &&
            state.currentIndex >= state.questionQueue.length - 1 &&
            state.retentionSolvedIds.size === state.questionQueue.length
        ) {
            state.retentionFinished = true;
            state.pendingRetentionCorrect = false;
            state.pendingRetentionJump = false;
            state.retentionAnswerLocked = false;
            showQuestion();
            showPendingLearningResourceIfAny();
            return true;
        }

        if (challenge.mode === 'mastery_check' && isMasteryCheckMode()) {
            if (state.masteryCheckPendingCheckpointComplete) {
                finishMasteryCheckCheckpoint();
                showQuestion();
                showPendingLearningResourceIfAny();
                return true;
            }

            if (
                state.masteryCheckPendingAdvance &&
                state.currentIndex >= state.questionQueue.length - 1 &&
                !state.masteryCheckInCheckpoint &&
                state.masteryCheckSegmentQuestions.length === 0
            ) {
                state.masteryCheckPendingAdvance = false;
                state.masteryCheckFinished = true;
                showQuestion();
                showPendingLearningResourceIfAny();
                return true;
            }
        }

        return false;
    }

    async function resetStarredQuestionsForQuiz(quizId = '') {
        const normalizedQuizId = normalizeSheetText(quizId);
        if (!normalizedQuizId || !state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before resetting starred questions.', 'error');
            return;
        }

        const managedQuiz = state.auth.managedQuizzes.find(quiz => quiz.id === normalizedQuizId) || null;
        if (!managedQuiz) {
            setCreatorStatus('Could not find that quiz.', 'error');
            return;
        }

        if (!confirm(`Reset all starred questions for "${managedQuiz.name || 'this quiz'}"?`)) {
            return;
        }

        setCreatorStatus('Resetting starred questions...');

        try {
            let questionIds = Array.isArray(managedQuiz.questionIds) ? managedQuiz.questionIds.filter(Boolean) : [];
            if (!questionIds.length) {
                const { data, error } = await state.auth.client
                    .from('questions')
                    .select('id')
                    .eq('quiz_id', normalizedQuizId);
                if (error) throw error;
                questionIds = (data || []).map(row => row.id).filter(Boolean);
            }

            if (!questionIds.length) {
                setCreatorStatus('That quiz has no questions to reset.', 'error');
                return;
            }

            const { error } = await state.auth.client
                .from('user_question_state')
                .update({ is_starred: false })
                .eq('user_id', state.auth.user.id)
                .in('question_id', questionIds);

            if (error) throw error;

            const resetIdSet = new Set(questionIds.map(id => normalizeSheetText(id)).filter(Boolean));
            const applyReset = question => {
                if (resetIdSet.has(normalizeSheetText(question?.sourceQuestionId))) {
                    question.isStarred = false;
                }
            };
            state.sourceQuestions.forEach(applyReset);
            state.questions.forEach(applyReset);
            state.questionQueue.forEach(applyReset);
            if (state.auth.editingQuizId === normalizedQuizId) {
                state.auth.studioQuizQuestions.forEach(question => { question.isStarred = false; });
                renderStudioQuestionList();
            }
            syncQuestionStarButton();
            updateProgress();

            setCreatorStatus('Starred questions reset for this quiz.', 'success');
        } catch (error) {
            console.error('Could not reset starred questions:', error);
            setCreatorStatus(error.message || 'Could not reset starred questions.', 'error');
        }
    }


    async function getManagedQuizQuestionIds(managedQuiz, quizId = '') {
        let questionIds = Array.isArray(managedQuiz?.questionIds) ? managedQuiz.questionIds.filter(Boolean) : [];
        if (questionIds.length || !state.auth.client || !quizId) return questionIds;

        const { data, error } = await state.auth.client
            .from('questions')
            .select('id')
            .eq('quiz_id', quizId);
        if (error) throw error;
        return (data || []).map(row => row.id).filter(Boolean);
    }

    async function loadStarredQuestionIdsForQuiz(managedQuiz, quizId = '') {
        const questionIds = await getManagedQuizQuestionIds(managedQuiz, quizId);
        if (!questionIds.length || !state.auth.client || !state.auth.user?.id) return [];

        const { data, error } = await state.auth.client
            .from('user_question_state')
            .select('question_id, is_starred')
            .eq('user_id', state.auth.user.id)
            .eq('is_starred', true)
            .in('question_id', questionIds);
        if (error) throw error;

        const validQuestionIds = new Set(questionIds.map(id => normalizeSheetText(id)).filter(Boolean));
        return Array.from(new Set((data || [])
            .map(row => normalizeSheetText(row.question_id))
            .filter(questionId => questionId && validQuestionIds.has(questionId))));
    }

    async function deleteStarredQuestionsForQuiz(quizId = '') {
        const normalizedQuizId = normalizeSheetText(quizId);
        if (!normalizedQuizId || !state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before deleting starred questions.', 'error');
            return;
        }

        const managedQuiz = state.auth.managedQuizzes.find(quiz => quiz.id === normalizedQuizId) || null;
        if (!managedQuiz) {
            setCreatorStatus('Could not find that quiz.', 'error');
            return;
        }

        let starredQuestionIds = [];
        try {
            starredQuestionIds = await loadStarredQuestionIdsForQuiz(managedQuiz, normalizedQuizId);
        } catch (error) {
            console.error('Could not load starred questions before delete:', error);
            setCreatorStatus(error.message || 'Could not load starred questions for this quiz.', 'error');
            return;
        }

        if (!starredQuestionIds.length) {
            setCreatorStatus('This quiz has no starred questions to delete.', 'error');
            return;
        }

        const countLabel = starredQuestionIds.length === 1 ? '1 starred question' : `${starredQuestionIds.length} starred questions`;
        if (!confirm(`Delete ${countLabel} from "${managedQuiz.name || 'this quiz'}"? This cannot be undone.`)) {
            return;
        }

        setCreatorStatus('Deleting starred questions...');

        try {
            const mediaRefsToDelete = new Set();
            for (let index = 0; index < starredQuestionIds.length; index += 1) {
                const refs = await getQuestionMediaReferences(starredQuestionIds[index]);
                refs.forEach(ref => mediaRefsToDelete.add(ref));
            }

            const { error } = await state.auth.client
                .from('questions')
                .delete()
                .in('id', starredQuestionIds);
            if (error) throw error;

            await deleteSupabaseMediaReferences(mediaRefsToDelete);

            const deletedIdSet = new Set(starredQuestionIds.map(id => normalizeSheetText(id)).filter(Boolean));
            const removeDeletedSourceQuestion = question => !deletedIdSet.has(normalizeSheetText(question?.sourceQuestionId));
            state.sourceQuestions = state.sourceQuestions.filter(removeDeletedSourceQuestion);
            state.questions = state.questions.filter(removeDeletedSourceQuestion);
            state.questionQueue = state.questionQueue.filter(removeDeletedSourceQuestion);

            if (state.auth.editingQuizId === normalizedQuizId) {
                const remainingRows = await loadStudioQuestionListForQuiz(normalizedQuizId);
                const nextRow = remainingRows.find(row => row.id === state.auth.editingQuestionId) || remainingRows[0] || null;
                if (nextRow) {
                    await loadStudioQuestionIntoEditor(nextRow.id, { suppressStatus: true, force: true });
                } else {
                    clearStudioQuestionInputs();
                }
            }

            syncQuestionStarButton();
            updateProgress();
            await refreshStudioManagementData();
            const selectedQuizValue = elements.quizSelector?.value || '';
            const selectedWasTargetQuiz = selectedQuizValue === `sb:${normalizedQuizId}`;
            await refreshQuizCatalog({ selectQuizId: selectedWasTargetQuiz ? `sb:${normalizedQuizId}` : selectedQuizValue, loadSelectedQuiz: selectedWasTargetQuiz, clearIfMissing: false });

            setCreatorStatus(`${countLabel} deleted.`, 'success');
        } catch (error) {
            console.error('Could not delete starred questions:', error);
            setCreatorStatus(error.message || 'Could not delete starred questions.', 'error');
        }
    }

    function renderQuizManagementList() {
        if (!elements.studioQuizList) return;

        if (!state.auth.client || !state.auth.user?.id) {
            elements.studioQuizList.innerHTML = createStudioEmptyState('Sign in required', 'Sign in before managing your private Supabase quizzes.', [{ label: 'Open Account', action: 'open-auth' }]);
            return;
        }

        if (!state.auth.managedQuizzes.length) {
            elements.studioQuizList.innerHTML = createStudioEmptyState('No quizzes yet', 'Create a quiz in the editor or import a Google Sheet/template to get started.', [{ label: 'Create Quiz', action: 'open-editor' }, { label: 'Import Templates', action: 'open-import', secondary: true }]);
            return;
        }

        populateStudioQuizFolderFilter();

        const quizzesToRender = getFilteredManagedQuizzes().sort(sortStudioRecentItems);
        updateStudioQuizFilterStatus(quizzesToRender.length);

        if (!quizzesToRender.length) {
            elements.studioQuizList.innerHTML = createStudioEmptyState('No matching quizzes', 'Clear or change your quiz search/folder filter to see more quizzes.', [{ label: 'Clear Filters', action: 'clear-quiz-filters' }]);
            return;
        }

        elements.studioQuizList.innerHTML = quizzesToRender.map(quiz => {
            const folderLabel = quiz.folderName || 'No folder';
            const questionLabel = quiz.questionCount === 1 ? '1 question' : `${quiz.questionCount} questions`;
            const typeLabel = quiz.typeLabel || 'Mixed types';
            const folderOptions = buildStudioFolderSelectOptions(quiz.folderId);
            const challengeBadges = renderQuizChallengeBadges(quiz);
            const challengesExpanded = state.auth.expandedQuizChallengeIds.has(quiz.id);
            const unlockedChallengeCount = QUIZ_CHALLENGES.filter(challenge => hasQuizChallengeAchievement(quiz.id, challenge.key)).length;
            const challengePanel = challengesExpanded ? renderQuizChallengePanel(quiz) : '';
            const challengeButtonLabel = challengesExpanded ? 'Hide Challenges' : `Challenges ${unlockedChallengeCount}/${QUIZ_CHALLENGES.length}`;
            const actionMenuOpen = state.auth.openQuizActionMenuId === quiz.id;
            return `
                <div class="studio-list-item" data-quiz-id="${escapeHtml(quiz.id)}">
                  <div class="studio-list-meta">
                    <div class="studio-list-title-row">
                      <div class="studio-list-title">${escapeHtml(quiz.name)}</div>
                      ${challengeBadges}
                    </div>
                    <div class="studio-list-subtitle">${escapeHtml(folderLabel)} · ${escapeHtml(questionLabel)} · ${escapeHtml(typeLabel)}</div>
                  </div>
                  <div class="studio-list-controls">
                    <input class="studio-inline-input" type="text" value="${escapeHtml(quiz.name)}" data-quiz-rename-input>
                    <select class="studio-inline-select" data-quiz-folder-select>${folderOptions}</select>
                    <button type="button" class="auth-action-btn" data-action="save-quiz">Save</button>
                    <button type="button" class="auth-action-btn auth-secondary-btn quiz-challenge-toggle-btn" data-action="toggle-challenges" aria-expanded="${challengesExpanded ? 'true' : 'false'}">${escapeHtml(challengeButtonLabel)}</button>
                    <button type="button" class="auth-action-btn" data-action="load-quiz">Study</button>
                    <button type="button" class="auth-action-btn" data-action="edit-quiz">Edit</button>
                    <div class="studio-quiz-actions-menu-wrap">
                      <button type="button" class="auth-action-btn auth-secondary-btn studio-quiz-actions-toggle" data-action="toggle-quiz-actions" aria-haspopup="menu" aria-expanded="${actionMenuOpen ? 'true' : 'false'}" aria-label="More actions for ${escapeHtml(quiz.name)}">...</button>
                      <div class="studio-quiz-actions-menu${actionMenuOpen ? ' open' : ''}" role="menu">
                        <button type="button" role="menuitem" data-action="reset-starred">Reset Stars</button>
                        <button type="button" role="menuitem" data-action="delete-starred">Delete Stars</button>
                        <button type="button" role="menuitem" data-action="duplicate-quiz">Duplicate</button>
                        <button type="button" role="menuitem" data-action="delete-quiz">Delete</button>
                      </div>
                    </div>
                  </div>
                  ${challengePanel}
                </div>
            `;
        }).join('');
    }

    function getStudioUpdatedTime(value) {
        const timestamp = Date.parse(value || '');
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function formatStudioUpdatedLabel(value) {
        const timestamp = getStudioUpdatedTime(value);
        if (!timestamp) return 'No update date yet';
        return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp));
    }

    function sortStudioRecentItems(a, b) {
        const updatedDelta = getStudioUpdatedTime(b.updatedAt) - getStudioUpdatedTime(a.updatedAt);
        if (updatedDelta) return updatedDelta;

        const sortDelta = Number(b.sortOrder ?? b.sort_order ?? 0) - Number(a.sortOrder ?? a.sort_order ?? 0);
        if (sortDelta) return sortDelta;

        return String(a.name || '').localeCompare(String(b.name || ''));
    }

    function sortStudioActiveItems(entityType = 'quiz') {
        return (a, b) => {
            const activeDelta = getStudioActivityTime(entityType, b.id, b.updatedAt) - getStudioActivityTime(entityType, a.id, a.updatedAt);
            if (activeDelta) return activeDelta;
            return sortStudioRecentItems(a, b);
        };
    }

    function getStudioActiveLabel(entityType = 'quiz', item = {}) {
        const timestamp = getStudioActivityTime(entityType, item.id, item.updatedAt);
        return timestamp ? formatStudioUpdatedLabel(new Date(timestamp).toISOString()) : 'No activity yet';
    }

    function getStudioQuizTypeCounts() {
        return state.auth.managedQuizzes.reduce((counts, quiz) => {
            const key = quiz.quizType || 'mixed';
            counts[key] = (counts[key] || 0) + 1;
            return counts;
        }, { multiple_choice: 0, flashcard: 0, hierarchy: 0, classify: 0, diagrams: 0, mixed: 0 });
    }


    function populateExportBackupControls() {
        const creatorEnabled = state.auth.configured && !!state.auth.user;

        if (elements.exportQuizSelect) {
            const previousValue = elements.exportQuizSelect.value;
            elements.exportQuizSelect.innerHTML = '<option value="">Choose quiz</option>';
            [...state.auth.managedQuizzes]
                .sort((a, b) => String(a.folderName || '').localeCompare(String(b.folderName || '')) || String(a.name || '').localeCompare(String(b.name || '')))
                .forEach(quiz => {
                    const option = document.createElement('option');
                    option.value = quiz.id;
                    option.textContent = quiz.folderName ? `${quiz.folderName} / ${quiz.name}` : quiz.name;
                    elements.exportQuizSelect.appendChild(option);
                });
            if (previousValue && state.auth.managedQuizzes.some(quiz => quiz.id === previousValue)) {
                elements.exportQuizSelect.value = previousValue;
            }
            elements.exportQuizSelect.disabled = !creatorEnabled || !state.auth.managedQuizzes.length;
        }

        if (elements.exportFolderSelect) {
            const previousValue = elements.exportFolderSelect.value;
            elements.exportFolderSelect.innerHTML = '<option value="">Choose folder</option>';
            [...state.auth.supabaseFolders]
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                .forEach(folder => {
                    const option = document.createElement('option');
                    option.value = folder.id;
                    option.textContent = folder.name;
                    elements.exportFolderSelect.appendChild(option);
                });
            if (previousValue && state.auth.supabaseFolders.some(folder => folder.id === previousValue)) {
                elements.exportFolderSelect.value = previousValue;
            }
            elements.exportFolderSelect.disabled = !creatorEnabled || !state.auth.supabaseFolders.length;
        }

        if (elements.exportQuizBtn) {
            elements.exportQuizBtn.disabled = !creatorEnabled || !elements.exportQuizSelect?.value;
        }
        if (elements.exportFolderBtn) {
            elements.exportFolderBtn.disabled = !creatorEnabled || !elements.exportFolderSelect?.value;
        }
        if (elements.exportAllBtn) {
            elements.exportAllBtn.disabled = !creatorEnabled || (!state.auth.supabaseFolders.length && !state.auth.managedQuizzes.length);
        }
        if (elements.importBackupFile) {
            elements.importBackupFile.disabled = !creatorEnabled;
        }
        if (elements.previewBackupImportBtn) {
            elements.previewBackupImportBtn.disabled = !creatorEnabled || !elements.importBackupFile?.files?.length;
        }
        if (elements.importBackupBtn) {
            elements.importBackupBtn.disabled = !creatorEnabled || !state.auth.backupImportPayload;
        }
    }

    function renderStudioHomeDashboard() {
        const signedIn = !!state.auth.user;

        if (elements.studioRecentQuizList) {
            if (!signedIn) {
                elements.studioRecentQuizList.innerHTML = createStudioEmptyState('Sign in required', 'Sign in to see recent quizzes from your private library.', [{ label: 'Open Account', action: 'open-auth' }]);
            } else if (!state.auth.managedQuizzes.length) {
                elements.studioRecentQuizList.innerHTML = createStudioEmptyState('No recent quizzes yet', 'Create or import a quiz and it will appear here for quick access.', [{ label: 'Create Quiz', action: 'open-editor' }, { label: 'Import Templates', action: 'open-import', secondary: true }]);
            } else {
                elements.studioRecentQuizList.innerHTML = [...state.auth.managedQuizzes]
                    .sort(sortStudioActiveItems('quiz'))
                    .slice(0, 5)
                    .map(quiz => {
                        const folderLabel = quiz.folderName || 'No folder';
                        const questionLabel = quiz.questionCount === 1 ? '1 question' : `${quiz.questionCount} questions`;
                        const typeLabel = quiz.typeLabel || 'Mixed types';
                        return `
                            <div class="studio-list-item studio-dashboard-item" data-home-quiz-id="${escapeHtml(quiz.id)}">
                              <div class="studio-list-meta">
                                <div class="studio-list-title">${escapeHtml(quiz.name)}</div>
                                <div class="studio-list-subtitle">${escapeHtml(folderLabel)} · ${escapeHtml(questionLabel)} · ${escapeHtml(typeLabel)} · Active ${escapeHtml(getStudioActiveLabel('quiz', quiz))}</div>
                              </div>
                              <div class="studio-list-controls">
                                <button type="button" class="auth-action-btn" data-home-action="edit-quiz">Edit</button>
                                <button type="button" class="auth-action-btn auth-secondary-btn" data-home-action="study-quiz">Study</button>
                              </div>
                            </div>
                        `;
                    }).join('');
            }
        }

        if (elements.studioRecentFolderList) {
            if (!signedIn) {
                elements.studioRecentFolderList.innerHTML = createStudioEmptyState('Sign in required', 'Sign in to see folders from your private library.', [{ label: 'Open Account', action: 'open-auth' }]);
            } else if (!state.auth.supabaseFolders.length) {
                elements.studioRecentFolderList.innerHTML = createStudioEmptyState('No folders yet', 'Create folders to organize your quizzes and improve the Studio dashboard.', [{ label: 'Create Folder', action: 'open-folders' }, { label: 'Import Templates', action: 'open-import', secondary: true }]);
            } else {
                const folderRows = state.auth.supabaseFolders.map(folder => {
                    const quizzes = state.auth.managedQuizzes.filter(quiz => quiz.folderId === folder.id);
                    const quizCount = quizzes.length;
                    const questionCount = quizzes.reduce((total, quiz) => total + Number(quiz.questionCount || 0), 0);
                    const mostRecentQuizTime = quizzes.reduce((maxValue, quiz) => Math.max(maxValue, getStudioActivityTime('quiz', quiz.id, quiz.updatedAt)), 0);
                    const folderTime = Math.max(getStudioActivityTime('folder', folder.id, folder.updatedAt), mostRecentQuizTime);
                    return {
                        ...folder,
                        quizCount,
                        questionCount,
                        updatedAt: folderTime ? new Date(folderTime).toISOString() : folder.updatedAt
                    };
                });

                elements.studioRecentFolderList.innerHTML = folderRows
                    .sort(sortStudioActiveItems('folder'))
                    .slice(0, 5)
                    .map(folder => {
                        const quizLabel = folder.quizCount === 1 ? '1 quiz' : `${folder.quizCount} quizzes`;
                        const questionLabel = folder.questionCount === 1 ? '1 question' : `${folder.questionCount} questions`;
                        return `
                            <div class="studio-list-item studio-dashboard-item" data-home-folder-id="${escapeHtml(folder.id)}">
                              <div class="studio-list-meta">
                                <div class="studio-list-title">${escapeHtml(folder.name)}</div>
                                <div class="studio-list-subtitle">${escapeHtml(quizLabel)} · ${escapeHtml(questionLabel)} · Active ${escapeHtml(getStudioActiveLabel('folder', folder))}</div>
                              </div>
                              <div class="studio-list-controls">
                                <button type="button" class="auth-action-btn" data-home-action="open-folder">Manage</button>
                              </div>
                            </div>
                        `;
                    }).join('');
            }
        }

        if (elements.studioProgressPanel) {
            if (!signedIn) {
                elements.studioProgressPanel.innerHTML = createStudioEmptyState('Sign in required', 'Sign in to see your library overview.', [{ label: 'Open Account', action: 'open-auth' }]);
                return;
            }

            const folderCount = state.auth.supabaseFolders.length;
            const quizCount = state.auth.managedQuizzes.length;
            const questionCount = state.auth.managedQuizzes.reduce((total, quiz) => total + Number(quiz.questionCount || 0), 0);
            const typeCounts = getStudioQuizTypeCounts();
            const cards = [
                ['Folders', folderCount],
                ['Quizzes', quizCount],
                ['Questions', questionCount],
                ['Multiple Choice', typeCounts.multiple_choice || 0],
                ['Flashcards', typeCounts.flashcard || 0],
                ['Hierarchy', typeCounts.hierarchy || 0],
                ['Classify', typeCounts.classify || 0],
                ['Diagrams', typeCounts.diagrams || 0],
                ['Mixed Type', typeCounts.mixed || 0]
            ];

            elements.studioProgressPanel.innerHTML = cards.map(([label, value]) => `
                <div class="studio-progress-card">
                  <span>${escapeHtml(label)}</span>
                  <strong>${escapeHtml(value)}</strong>
                </div>
            `).join('');
        }
    }

    async function loadCreatorFolders() {
        if (!state.auth.client || !state.auth.user?.id) {
            state.auth.supabaseFolders = [];
            populateCreatorFolderSelect();
            populateStudioQuizFolderFilter();
            renderFolderManagementList();
            renderStudioHomeDashboard();
            return [];
        }

        let folderResult = await state.auth.client
            .from('folders')
            .select('id, name, sort_order, updated_at')
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });

        if (folderResult.error && /updated_at/i.test(folderResult.error.message || '')) {
            folderResult = await state.auth.client
                .from('folders')
                .select('id, name, sort_order')
                .order('sort_order', { ascending: true })
                .order('name', { ascending: true });
        }

        const { data, error } = folderResult;
        if (error) {
            console.error('Failed to load creator folders:', error);
            state.auth.supabaseFolders = [];
            populateCreatorFolderSelect();
            populateStudioQuizFolderFilter();
            renderFolderManagementList();
            renderStudioHomeDashboard();
            return [];
        }

        state.auth.supabaseFolders = (data || []).map(folder => ({
            id: folder.id,
            name: normalizeFolderName(folder.name),
            sort_order: Number(folder.sort_order ?? 0),
            updatedAt: normalizeSheetText(folder.updated_at)
        }));
        populateCreatorFolderSelect();
        populateStudioQuizFolderFilter();
        renderFolderManagementList();
        renderStudioHomeDashboard();
        populateExportBackupControls();
        return state.auth.supabaseFolders;
    }

    async function loadManagedSupabaseQuizzes() {
        if (!state.auth.client || !state.auth.user?.id) {
            state.auth.managedQuizzes = [];
            renderQuizManagementList();
            renderStudioHomeDashboard();
            return [];
        }

        try {
            const [quizResult, questionRows] = await Promise.all([
                state.auth.client
                    .from('quizzes')
                    .select('id, folder_id, name, description, sort_order, is_archived, updated_at')
                    .order('sort_order', { ascending: true })
                    .order('name', { ascending: true }),
                fetchAllSupabaseRows(
                    () => state.auth.client
                        .from('questions')
                        .select('id, quiz_id, question_type, sort_order')
                        .order('quiz_id', { ascending: true })
                        .order('sort_order', { ascending: true }),
                    { label: 'managed quiz question rows' }
                )
            ]);

            let { data: quizzes, error: quizzesError } = quizResult;
            if (quizzesError && /updated_at/i.test(quizzesError.message || '')) {
                const { data: fallbackQuizzes, error: fallbackQuizzesError } = await state.auth.client
                    .from('quizzes')
                    .select('id, folder_id, name, description, sort_order, is_archived')
                    .order('sort_order', { ascending: true })
                    .order('name', { ascending: true });
                if (fallbackQuizzesError) throw fallbackQuizzesError;
                quizzes = fallbackQuizzes;
            } else if (quizzesError) {
                throw quizzesError;
            }

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
                    diagrams: 'Diagrams',
                    mixed: 'Mixed types'
                };
                return {
                    id: quiz.id,
                    name: normalizeSheetText(quiz.name),
                    folderId: quiz.folder_id || '',
                    folderName: folder ? normalizeFolderName(folder.name) : '',
                    questionCount: rows.length,
                    questionIds: rows.map(row => row.id).filter(Boolean),
                    quizType,
                    typeLabel: typeLabelMap[quizType] || 'Mixed types',
                    sortOrder: Number(quiz.sort_order ?? 0),
                    updatedAt: normalizeSheetText(quiz.updated_at),
                    firstQuestionId: rows[0]?.id || ''
                };
            });

            await loadQuizChallengeAchievementsFromSupabase();
            await loadStudioActivityFromSupabase();
            renderQuizManagementList();
            renderStudioHomeDashboard();
            populateExportBackupControls();
            return state.auth.managedQuizzes;
        } catch (error) {
            console.error('Failed to load managed Supabase quizzes:', error);
            state.auth.managedQuizzes = [];
            state.auth.quizChallengeAchievements = new Map();
            renderQuizManagementList();
            renderStudioHomeDashboard();
            return [];
        }
    }

    async function refreshStudioManagementData() {
        await loadCreatorFolders();
        await loadManagedSupabaseQuizzes();
        await loadGoogleSheetsImportCatalog();
        renderStudioHomeDashboard();
        populateExportBackupControls();
    }

    function getGoogleSheetsQuizDescriptors() {
        return (state.googleSheetsImportQuizzes || []).filter(item => isQuizDescriptor(item) && item.source === DATA_SOURCES.GOOGLE_SHEETS);
    }

    function getGoogleSheetsQuizDescriptorById(selectorValue = '') {
        const normalizedValue = normalizeSheetText(selectorValue);
        if (!normalizedValue) return null;
        return getGoogleSheetsQuizDescriptors().find(item => item.id === normalizedValue || encodeQuizSelectorValue(item) === normalizedValue) || null;
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

    function populateSelectWithSupabaseQuizTargets(selectEl, placeholder) {
        if (!selectEl) return;
        const previousValue = normalizeSheetText(selectEl.value);
        selectEl.innerHTML = `<option value="">${placeholder}</option>`;
        const sortedQuizzes = [...state.auth.managedQuizzes].sort(sortStudioRecentItems);
        sortedQuizzes.forEach(quiz => {
            const option = document.createElement('option');
            option.value = quiz.id;
            const countLabel = quiz.questionCount === 1 ? '1 question' : `${quiz.questionCount || 0} questions`;
            option.textContent = `${quiz.name} (${quiz.typeLabel || 'Unknown type'}, ${countLabel})`;
            if (quiz.quizType === 'mixed') {
                option.disabled = true;
                option.textContent += ' — cannot append mixed-type quiz';
            }
            selectEl.appendChild(option);
        });
        const validIds = new Set(sortedQuizzes.filter(quiz => quiz.quizType !== 'mixed').map(quiz => quiz.id));
        if (validIds.has(previousValue)) {
            selectEl.value = previousValue;
        }
    }

    function isImportAppendMode(selectEl) {
        return normalizeSheetText(selectEl?.value) === 'append';
    }

    function renderGoogleSheetsImportControls() {
        const creatorEnabled = state.auth.configured && !!state.auth.user;
        const sourceFolders = getGoogleSheetsFolderNames();

        populateSelectWithFolderOptions(elements.importSourceFolderSelect, sourceFolders, 'Choose Google Sheets folder');
        populateSelectWithFolderOptions(elements.importEntireFolderSourceSelect, sourceFolders, 'Choose Google Sheets folder');
        populateSelectWithSupabaseFolderTargets(elements.importTargetFolderSelect, 'Use or create source folder name');
        populateSelectWithSupabaseFolderTargets(elements.importEntireFolderTargetSelect, 'Use or create source folder name');
        populateSelectWithSupabaseFolderTargets(elements.importTemplateTargetFolderSelect, 'No folder');
        populateSelectWithSupabaseQuizTargets(elements.importSourceAppendQuizSelect, 'Choose existing quiz');
        populateSelectWithSupabaseQuizTargets(elements.importTemplateAppendQuizSelect, 'Choose existing quiz');

        const sourceAppendMode = isImportAppendMode(elements.importSourceDestinationModeSelect);
        const templateAppendMode = isImportAppendMode(elements.importTemplateDestinationModeSelect);
        elements.importSourceAppendQuizField?.classList.toggle('hidden', !sourceAppendMode);
        elements.importSourceTargetFolderField?.classList.toggle('hidden', sourceAppendMode);
        elements.importTemplateAppendQuizField?.classList.toggle('hidden', !templateAppendMode);
        elements.importTemplateQuizNameField?.classList.toggle('hidden', templateAppendMode);
        elements.importTemplateTargetFolderField?.classList.toggle('hidden', templateAppendMode);

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
            elements.importEntireFolderSourceSelect,
            elements.importEntireFolderTargetSelect
        ].forEach(el => {
            if (!el) return;
            el.disabled = !creatorEnabled || !sourceFolders.length;
        });

        if (elements.importTargetFolderSelect) {
            elements.importTargetFolderSelect.disabled = !creatorEnabled || !sourceFolders.length || sourceAppendMode;
        }
        if (elements.importSourceDestinationModeSelect) {
            elements.importSourceDestinationModeSelect.disabled = !creatorEnabled;
        }
        if (elements.importSourceAppendQuizSelect) {
            elements.importSourceAppendQuizSelect.disabled = !creatorEnabled || !sourceAppendMode || !state.auth.managedQuizzes.length;
        }
        if (elements.importTemplateSheetInput) {
            elements.importTemplateSheetInput.disabled = !creatorEnabled;
        }
        if (elements.importTemplateTabInput) {
            elements.importTemplateTabInput.disabled = !creatorEnabled;
        }
        if (elements.importTemplateDestinationModeSelect) {
            elements.importTemplateDestinationModeSelect.disabled = !creatorEnabled;
        }
        if (elements.importTemplateAppendQuizSelect) {
            elements.importTemplateAppendQuizSelect.disabled = !creatorEnabled || !templateAppendMode || !state.auth.managedQuizzes.length;
        }
        if (elements.importTemplateQuizNameInput) {
            elements.importTemplateQuizNameInput.disabled = !creatorEnabled || templateAppendMode;
        }
        if (elements.importTemplateTargetFolderSelect) {
            elements.importTemplateTargetFolderSelect.disabled = !creatorEnabled || templateAppendMode;
        }

        if (elements.importSourceQuizBtn) {
            const hasAppendTarget = !sourceAppendMode || !!normalizeSheetText(elements.importSourceAppendQuizSelect?.value);
            const canImportSingle = creatorEnabled && !!elements.importSourceFolderSelect?.value && !!elements.importSourceQuizSelect?.value && hasAppendTarget;
            elements.importSourceQuizBtn.textContent = sourceAppendMode ? 'Add Questions to Quiz' : 'Import into Supabase';
            elements.importSourceQuizBtn.disabled = !canImportSingle;
        }

        if (elements.importSourceFolderBtn) {
            const canImportFolder = creatorEnabled && !!elements.importEntireFolderSourceSelect?.value;
            elements.importSourceFolderBtn.disabled = !canImportFolder;
        }

        if (elements.importTemplateSheetBtn) {
            const hasSheetInput = !!normalizeSheetText(elements.importTemplateSheetInput?.value);
            const hasTabInput = !!normalizeSheetText(elements.importTemplateTabInput?.value);
            const hasAppendTarget = !templateAppendMode || !!normalizeSheetText(elements.importTemplateAppendQuizSelect?.value);
            elements.importTemplateSheetBtn.textContent = templateAppendMode ? 'Add Questions to Quiz' : 'Import Sheet Template';
            elements.importTemplateSheetBtn.disabled = !(creatorEnabled && hasSheetInput && hasTabInput && hasAppendTarget);
        }
    }

    function updateCreateQuizModeUI() {
        const isEditingQuiz = !!state.auth.editingQuizId;
        const quizName = normalizeSheetText(elements.createQuizName?.value);
        const creatorEnabled = !!state.auth.configured && !!state.auth.user?.id;

        const canSaveChanges = creatorEnabled && !!quizName;
        [elements.createQuizBtn, elements.studioEditorActionSaveBtn].forEach(button => {
            if (!button) return;
            button.textContent = 'Save Changes';
            button.disabled = !canSaveChanges;
            button.title = canSaveChanges
                ? 'Save the current quiz changes.'
                : 'Enter a quiz name before saving.';
        });

        if (elements.createQuizCancelEditBtn) {
            elements.createQuizCancelEditBtn.textContent = 'Create Quiz';
            elements.createQuizCancelEditBtn.disabled = !creatorEnabled || !isEditingQuiz;
            elements.createQuizCancelEditBtn.title = isEditingQuiz
                ? 'Start a new quiz in the editor.'
                : 'Save this quiz before starting another one.';
        }

        if (elements.studioStudyQuizBtn) {
            const canStudyOpenQuiz = isEditingQuiz && creatorEnabled;
            elements.studioStudyQuizBtn.disabled = !canStudyOpenQuiz;
            elements.studioStudyQuizBtn.title = canStudyOpenQuiz
                ? 'Study the quiz currently open in the editor.'
                : 'Save this quiz before studying it.';
        }

        updateStudioEditorTypeUI();
        updateStudioQuestionNavigationUI();
    }

    function getStudioQuestionNavigationInfo() {
        const rows = Array.isArray(state.auth.studioQuizQuestions) ? state.auth.studioQuizQuestions : [];
        const quizType = getStudioCurrentQuizType();
        const itemLabel = quizType === 'flashcard' ? 'Card' : 'Question';
        const savedIndex = state.auth.editingQuestionId
            ? rows.findIndex(question => question.id === state.auth.editingQuestionId)
            : -1;
        const isNewDraft = !!state.auth.editingQuizId && !state.auth.editingQuestionId;
        let virtualIndex = savedIndex;

        if (isNewDraft) {
            const insertAfterId = state.auth.pendingInsertAfterQuestionId;
            if (insertAfterId) {
                const insertAfterIndex = rows.findIndex(question => question.id === insertAfterId);
                virtualIndex = insertAfterIndex === -1 ? rows.length : insertAfterIndex + 1;
            } else {
                virtualIndex = rows.length;
            }
        }

        return { rows, itemLabel, savedIndex, isNewDraft, virtualIndex };
    }

    function updateStudioQuestionNavigationUI() {
        const info = getStudioQuestionNavigationInfo();
        const { rows, itemLabel, savedIndex, isNewDraft, virtualIndex } = info;
        let labelText = `New ${itemLabel}`;

        if (!state.auth.editingQuizId) {
            labelText = `No ${itemLabel.toLowerCase()} selected`;
        } else if (savedIndex !== -1) {
            labelText = `${itemLabel} ${savedIndex + 1} of ${rows.length}`;
        } else if (isNewDraft) {
            labelText = `New ${itemLabel}`;
        } else if (!rows.length) {
            labelText = `No ${itemLabel.toLowerCase()}s yet`;
        }

        if (elements.studioQuestionPositionLabel) {
            elements.studioQuestionPositionLabel.textContent = labelText;
        }

        const creatorReady = !!(state.auth.configured && state.auth.user?.id);
        const hasQuiz = creatorReady && !!state.auth.editingQuizId;
        const canNavigatePrevious = hasQuiz && rows.length > 0 && virtualIndex > 0;
        const nextTargetIndex = isNewDraft ? virtualIndex : virtualIndex + 1;
        const canNavigateNext = hasQuiz && rows.length > 0 && nextTargetIndex >= 0 && nextTargetIndex < rows.length;

        [elements.studioPrevQuestionBtn, elements.studioPrevQuestionBottomBtn].forEach(button => {
            if (!button) return;
            button.disabled = !canNavigatePrevious;
        });

        [elements.studioNextQuestionBtn, elements.studioNextQuestionBottomBtn].forEach(button => {
            if (!button) return;
            button.disabled = !canNavigateNext;
        });
    }

    function getStudioQuestionNavigationTargetId(direction) {
        const info = getStudioQuestionNavigationInfo();
        const { rows, isNewDraft, virtualIndex } = info;
        const targetIndex = direction === 'previous'
            ? virtualIndex - 1
            : (isNewDraft ? virtualIndex : virtualIndex + 1);

        return rows[targetIndex]?.id || '';
    }

    async function handleStudioNavigateQuestion(direction) {
        const targetId = getStudioQuestionNavigationTargetId(direction);
        if (!targetId) {
            setCreatorStatus(direction === 'previous' ? 'No previous question available.' : 'No next question available.', 'error');
            updateStudioQuestionNavigationUI();
            return;
        }

        await loadStudioQuestionIntoEditor(targetId);
    }

    function createStudioOptionFieldRow(index, optionData = {}) {
        const optionText = displayMathChemTextForEditor(normalizeSheetText(optionData.text));
        const optionExplanation = displayMathChemTextForEditor(normalizeSheetText(optionData.explanation));
        const optionImageUrl = normalizeSheetText(optionData.imageUrl);
        const optionImageLabel = getOptionImageLabel(optionData, index);
        const optionNumber = index + 1;
        const isImagePanelOpen = state.auth.expandedOptionImageRows.has(String(optionNumber));
        const wrapper = document.createElement('div');
        wrapper.className = 'studio-option-pair';
        wrapper.dataset.optionIndex = String(optionNumber);
        wrapper.innerHTML = `
            <label class="auth-field studio-option-text-field">
              <span class="studio-option-label-row">
                <span>Option ${optionNumber}</span>
                <span class="studio-option-label-actions">
                  <button type="button" class="studio-option-image-toggle${optionImageUrl ? ' has-image' : ''}" data-option-image-toggle aria-expanded="${isImagePanelOpen ? 'true' : 'false'}" aria-label="${isImagePanelOpen ? `Hide Option ${optionNumber} image controls` : (optionImageUrl ? `Edit Option ${optionNumber} image` : `Add Option ${optionNumber} image`)}" title="${isImagePanelOpen ? `Hide Option ${optionNumber} image controls` : (optionImageUrl ? `Edit Option ${optionNumber} image` : `Add Option ${optionNumber} image`)}">${isImagePanelOpen ? 'Hide Image' : (optionImageUrl ? 'Edit Image' : 'Add Image')}</button>
                  <button type="button" class="studio-option-delete-btn" data-option-delete aria-label="Delete Option ${optionNumber}" title="Delete Option ${optionNumber}">×</button>
                </span>
              </span>
              <input type="text" autocomplete="off" placeholder="Answer option ${optionNumber}" data-option-text>
            </label>
            <div class="studio-option-image-panel${isImagePanelOpen ? '' : ' hidden'}" data-option-image-panel>
              <input type="hidden" data-option-image-url>
              <label class="auth-field studio-option-image-field">
                <span>Option ${optionNumber} image</span>
                <input type="file" accept="image/*" data-option-image-file>
              </label>
              <div class="studio-file-row studio-option-image-row">
                <div class="studio-file-name" data-option-image-name>${escapeHtml(optionImageLabel)}</div>
                <button type="button" class="auth-action-btn auth-secondary-btn studio-clear-btn" data-option-image-clear>Clear</button>
              </div>
              <img class="studio-option-image-preview hidden" alt="Option ${optionNumber} image preview" data-option-image-preview>
            </div>
            <label class="auth-field">
              <span>Option ${optionNumber} explanation</span>
              <textarea rows="2" placeholder="Explain option ${optionNumber}" data-option-explanation></textarea>
            </label>
        `;
        const textInput = wrapper.querySelector('[data-option-text]');
        const explanationInput = wrapper.querySelector('[data-option-explanation]');
        const imageInput = wrapper.querySelector('[data-option-image-url]');
        const imagePreview = wrapper.querySelector('[data-option-image-preview]');
        if (textInput) textInput.value = optionText;
        if (explanationInput) explanationInput.value = optionExplanation;
        if (imageInput) {
            imageInput.value = optionImageUrl;
            imageInput.dataset.optionImageLabel = optionImageLabel;
        }
        if (imagePreview && optionImageUrl && isImagePanelOpen) {
            setPreviewImageSource(imagePreview, optionImageUrl);
        }
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
                explanation: normalizeSheetText(draft?.explanation),
                imageUrl: normalizeSheetText(draft?.imageUrl),
                imageLabel: normalizeSheetText(draft?.imageLabel || draft?.label)
            }));

        const safeDrafts = normalizedDrafts.length >= 2 ? normalizedDrafts : [
            ...normalizedDrafts,
            ...Array.from({ length: 2 - normalizedDrafts.length }, () => ({ text: '', explanation: '', imageUrl: '', imageLabel: '' }))
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
        return Array.from(elements.createOptionFieldsContainer.querySelectorAll('[data-option-index]')).map(row => {
            const imageInput = row.querySelector('[data-option-image-url]');
            return {
                text: normalizeAuthoredMathChemText(row.querySelector('[data-option-text]')?.value),
                explanation: normalizeAuthoredMathChemText(row.querySelector('[data-option-explanation]')?.value),
                imageUrl: normalizeSheetText(imageInput?.value),
                imageLabel: normalizeSheetText(imageInput?.dataset.optionImageLabel)
            };
        });
    }

    function addStudioOptionField() {
        const drafts = getStudioOptionDraftsFromDOM();
        drafts.push({ text: '', explanation: '', imageUrl: '', imageLabel: '' });
        renderStudioOptionFields(drafts);
        syncCorrectOptionSelect(String(drafts.length));
        setStudioDirtyState(true);
    }

    function removeStudioOptionField() {
        const drafts = getStudioOptionDraftsFromDOM();
        if (drafts.length <= 2) {
            setCreatorStatus('Multiple-choice quizzes need at least 2 options.', 'error');
            return;
        }
        const previousCorrect = Number(elements.createCorrectOptionSelect?.value || 1);
        drafts.pop();
        renderStudioOptionFields(drafts);
        if (previousCorrect > drafts.length) {
            syncCorrectOptionSelect('1');
            setCreatorStatus('Deleted the selected correct option. Choose the correct option again.', 'error');
        } else {
            syncCorrectOptionSelect(String(previousCorrect));
        }
        setStudioDirtyState(true);
    }

    function removeStudioOptionFieldAt(optionNumber) {
        const drafts = getStudioOptionDraftsFromDOM();
        const index = Number(optionNumber) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= drafts.length) return;
        if (drafts.length <= 2) {
            setCreatorStatus('Multiple-choice quizzes need at least 2 options.', 'error');
            return;
        }

        const previousCorrect = Number(elements.createCorrectOptionSelect?.value || 1);
        drafts.splice(index, 1);
        renderStudioOptionFields(drafts);

        let nextCorrect = previousCorrect;
        if (previousCorrect === optionNumber) {
            nextCorrect = 1;
            setCreatorStatus('Deleted the selected correct option. Choose the correct option again.', 'error');
        } else if (previousCorrect > optionNumber) {
            nextCorrect = previousCorrect - 1;
        }

        syncCorrectOptionSelect(String(Math.max(1, Math.min(nextCorrect, drafts.length))));
        setStudioDirtyState(true);
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

    function getStudioClassifyRowImageConfig(kind) {
        const isCategory = kind === 'category';
        return {
            indexDataset: isCategory ? 'classifyCategoryIndex' : 'classifyItemIndex',
            imageDataset: isCategory ? 'classifyCategoryImageUrl' : 'classifyItemImageUrl',
            expandedRows: isCategory ? state.auth.expandedClassifyCategoryImageRows : state.auth.expandedClassifyItemImageRows,
            toggleSelector: isCategory ? '[data-classify-category-image-toggle]' : '[data-classify-item-image-toggle]',
            panelSelector: isCategory ? '[data-classify-category-image-panel]' : '[data-classify-item-image-panel]',
            fileSelector: isCategory ? '[data-classify-category-image-file]' : '[data-classify-item-image-file]',
            nameSelector: isCategory ? '[data-classify-category-image-name]' : '[data-classify-item-image-name]',
            previewSelector: isCategory ? '[data-classify-category-image-preview]' : '[data-classify-item-image-preview]',
            emptyLabel: isCategory ? 'No category image selected.' : 'No item image selected.',
            subjectLabel: isCategory ? 'Category' : 'Item'
        };
    }

    function updateStudioClassifyRowImageToggle(wrapper, kind) {
        if (!wrapper) return;
        const config = getStudioClassifyRowImageConfig(kind);
        const rowIndex = Number(wrapper.dataset[config.indexDataset] || 0) || 0;
        const panel = wrapper.querySelector(config.panelSelector);
        const toggle = wrapper.querySelector(config.toggleSelector);
        if (!toggle) return;
        const hasImage = !!normalizeSheetText(wrapper.dataset[config.imageDataset]);
        const isOpen = !!panel && !panel.classList.contains('hidden');
        toggle.classList.toggle('has-image', hasImage);
        toggle.textContent = isOpen ? 'Hide Image' : (hasImage ? 'Edit Image' : 'Image');
        toggle.title = isOpen
            ? `Hide ${config.subjectLabel} ${rowIndex} image controls`
            : (hasImage ? `Edit ${config.subjectLabel} ${rowIndex} image` : `Show ${config.subjectLabel} ${rowIndex} image controls`);
        toggle.setAttribute('aria-label', toggle.title);
        toggle.setAttribute('aria-expanded', String(isOpen));
    }

    function setStudioClassifyRowImagePanelOpen(wrapper, kind, forceOpen = null) {
        if (!wrapper) return;
        const config = getStudioClassifyRowImageConfig(kind);
        const rowIndex = wrapper.dataset[config.indexDataset] || '';
        const panel = wrapper.querySelector(config.panelSelector);
        if (!panel) return;
        const nextOpen = forceOpen === null ? panel.classList.contains('hidden') : !!forceOpen;
        panel.classList.toggle('hidden', !nextOpen);
        if (nextOpen) {
            config.expandedRows.add(rowIndex);
            const previewEl = wrapper.querySelector(config.previewSelector);
            if (previewEl) setPreviewImageSource(previewEl, wrapper.dataset[config.imageDataset] || '');
        } else {
            config.expandedRows.delete(rowIndex);
        }
        updateStudioClassifyRowImageToggle(wrapper, kind);
    }

    function setStudioClassifyRowImageState(wrapper, kind, dataUrl = '', label = '') {
        if (!wrapper) return;
        const config = getStudioClassifyRowImageConfig(kind);
        const normalizedDataUrl = normalizeSheetText(dataUrl);
        const safeLabel = label || config.emptyLabel;
        wrapper.dataset[config.imageDataset] = normalizedDataUrl;

        const fileNameEl = wrapper.querySelector(config.nameSelector);
        if (fileNameEl) {
            fileNameEl.textContent = normalizedDataUrl ? safeLabel : config.emptyLabel;
        }

        const previewEl = wrapper.querySelector(config.previewSelector);
        setPreviewImageSource(previewEl, normalizedDataUrl);

        const inputEl = wrapper.querySelector(config.fileSelector);
        if (!normalizedDataUrl && inputEl) {
            inputEl.value = '';
        }
        updateStudioClassifyRowImageToggle(wrapper, kind);
    }

    function createStudioClassifyCategoryRow(index, categoryData = {}) {
        const wrapper = document.createElement('div');
        wrapper.className = 'studio-option-pair studio-classify-row';
        wrapper.dataset.classifyCategoryIndex = String(index + 1);
        const categoryImageUrl = normalizeSheetText(categoryData.imageUrl);
        const isImagePanelOpen = state.auth.expandedClassifyCategoryImageRows.has(String(index + 1));
        wrapper.innerHTML = `
            <label class="auth-field">
              <span class="studio-option-label-row">
                <span>Category ${index + 1} text (optional)</span>
                <span class="studio-option-label-actions">
                  <button type="button" class="studio-option-image-toggle${categoryImageUrl ? ' has-image' : ''}" data-classify-category-image-toggle aria-expanded="${isImagePanelOpen ? 'true' : 'false'}" aria-label="${isImagePanelOpen ? `Hide Category ${index + 1} image controls` : (categoryImageUrl ? `Edit Category ${index + 1} image` : `Show Category ${index + 1} image controls`)}" title="${isImagePanelOpen ? `Hide Category ${index + 1} image controls` : (categoryImageUrl ? `Edit Category ${index + 1} image` : `Show Category ${index + 1} image controls`)}">${isImagePanelOpen ? 'Hide Image' : (categoryImageUrl ? 'Edit Image' : 'Image')}</button>
                </span>
              </span>
              <input type="text" autocomplete="off" placeholder="Category ${index + 1}" data-classify-category-label>
            </label>
            <div class="studio-option-image-panel${isImagePanelOpen ? '' : ' hidden'}" data-classify-category-image-panel>
              <label class="auth-field">
                <span>Category ${index + 1} image (optional)</span>
                <input type="file" accept="image/*" data-classify-category-image-file>
              </label>
              <div class="studio-file-row studio-option-image-row">
                <div class="studio-file-name" data-classify-category-image-name>No category image selected.</div>
                <button type="button" class="auth-action-btn auth-secondary-btn studio-clear-btn" data-classify-category-image-clear>Clear</button>
              </div>
              <img class="studio-inline-image-preview hidden" alt="Category image preview" data-classify-category-image-preview>
            </div>
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
        const itemImageUrl = normalizeSheetText(itemData.imageUrl);
        const isImagePanelOpen = state.auth.expandedClassifyItemImageRows.has(String(index + 1));
        wrapper.innerHTML = `
            <label class="auth-field">
              <span class="studio-option-label-row">
                <span>Item ${index + 1} text (optional)</span>
                <span class="studio-option-label-actions">
                  <button type="button" class="studio-option-image-toggle${itemImageUrl ? ' has-image' : ''}" data-classify-item-image-toggle aria-expanded="${isImagePanelOpen ? 'true' : 'false'}" aria-label="${isImagePanelOpen ? `Hide Item ${index + 1} image controls` : (itemImageUrl ? `Edit Item ${index + 1} image` : `Show Item ${index + 1} image controls`)}" title="${isImagePanelOpen ? `Hide Item ${index + 1} image controls` : (itemImageUrl ? `Edit Item ${index + 1} image` : `Show Item ${index + 1} image controls`)}">${isImagePanelOpen ? 'Hide Image' : (itemImageUrl ? 'Edit Image' : 'Image')}</button>
                </span>
              </span>
              <input type="text" autocomplete="off" placeholder="Classify item ${index + 1}" data-classify-item-text>
            </label>
            <div class="studio-option-image-panel${isImagePanelOpen ? '' : ' hidden'}" data-classify-item-image-panel>
              <label class="auth-field">
                <span>Item ${index + 1} image (optional)</span>
                <input type="file" accept="image/*" data-classify-item-image-file>
              </label>
              <div class="studio-file-row studio-option-image-row">
                <div class="studio-file-name" data-classify-item-image-name>No item image selected.</div>
                <button type="button" class="auth-action-btn auth-secondary-btn studio-clear-btn" data-classify-item-image-clear>Clear</button>
              </div>
              <img class="studio-inline-image-preview hidden" alt="Item image preview" data-classify-item-image-preview>
            </div>
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
        const rawCategories = Array.isArray(detailRow?.classifications_json)
            ? detailRow.classifications_json.map(item => ({
                label: normalizeSheetText(item?.label),
                imageUrl: normalizeSheetText(item?.imageUrl),
                id: normalizeSheetText(item?.id)
            }))
            : [];
        const categories = normalizeClassifyCategoriesDrafts(rawCategories);
        const fallbackCategoryId = categories[0]?.id || 'class_1';
        const categoryIdMap = new Map();
        rawCategories.forEach((category, index) => {
            const nextCategoryId = categories[index]?.id || `class_${index + 1}`;
            const originalId = normalizeSheetText(category?.id);
            if (originalId) categoryIdMap.set(originalId, nextCategoryId);
            categoryIdMap.set(`class_${index + 1}`, nextCategoryId);
        });
        const items = normalizeClassifyItemsDrafts((detailRow?.items_json || []).map(item => {
            const savedCategoryId = normalizeSheetText(item?.correctClassificationId);
            return {
                text: normalizeSheetText(item?.text || (item?.kind === 'image' ? '' : item?.raw)),
                imageUrl: normalizeSheetText(item?.imageUrl),
                categoryId: categoryIdMap.get(savedCategoryId) || savedCategoryId || fallbackCategoryId
            };
        }), categories);
        return { categories, items };
    }


    function createEmptyMultipleChoiceDetailRow() {
        return {
            correct_answer: '',
            correct_explanation_html: '',
            option_1_text: '',
            option_1_explanation_html: '',
            option_2_text: '',
            option_2_explanation_html: '',
            option_3_text: '',
            option_3_explanation_html: '',
            option_4_text: '',
            option_4_explanation_html: '',
            options_json: []
        };
    }

    function getMultipleChoiceDraftsFromDetailRow(detailRow) {
        const rawOptions = getOptionsJsonOptions(detailRow?.options_json);

        const normalizedFromJson = rawOptions
            .map(item => ({
                text: displayMathChemTextForEditor(normalizeSheetText(item?.text)),
                explanation: getStoredTextForDisplay('', item?.explanation_html || ''),
                imageUrl: normalizeSheetText(item?.imageUrl || item?.image_url),
                imageLabel: normalizeSheetText(item?.imageLabel || item?.image_label)
            }))
            .filter(item => item.text || item.imageUrl);

        if (normalizedFromJson.length) {
            return normalizedFromJson;
        }

        return [
            {
                text: displayMathChemTextForEditor(normalizeSheetText(detailRow?.option_1_text)),
                explanation: getStoredTextForDisplay('', detailRow?.option_1_explanation_html),
                imageUrl: ''
            },
            {
                text: displayMathChemTextForEditor(normalizeSheetText(detailRow?.option_2_text)),
                explanation: getStoredTextForDisplay('', detailRow?.option_2_explanation_html),
                imageUrl: ''
            },
            {
                text: displayMathChemTextForEditor(normalizeSheetText(detailRow?.option_3_text)),
                explanation: getStoredTextForDisplay('', detailRow?.option_3_explanation_html),
                imageUrl: ''
            },
            {
                text: displayMathChemTextForEditor(normalizeSheetText(detailRow?.option_4_text)),
                explanation: getStoredTextForDisplay('', detailRow?.option_4_explanation_html),
                imageUrl: ''
            }
        ].filter(item => item.text || item.imageUrl);
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

        const prompt = displayMathChemTextForEditor(normalizeSheetText(questionRow?.prompt_plain || ''));
        const prefix = questionType === 'hierarchy' ? `H${index + 1}` : (questionType === 'classify' ? `C${index + 1}` : (questionType === 'diagrams' ? `D${index + 1}` : `Q${index + 1}`));
        if (prompt) {
            return `${prefix}: ${prompt.length > 90 ? `${prompt.slice(0, 90)}…` : prompt}`;
        }
        return questionType === 'hierarchy' ? `Hierarchy ${index + 1}` : (questionType === 'classify' ? `Classify ${index + 1}` : (questionType === 'diagrams' ? `Diagram ${index + 1}` : `Question ${index + 1}`));
    }


    function updateStudioUnsavedChangesIndicator() {
        if (!elements.studioUnsavedChangesIndicator) return;
        elements.studioUnsavedChangesIndicator.classList.toggle('hidden', !state.auth.studioHasUnsavedChanges);
    }

    function clearStudioAutosaveTimer() {
        if (!state.auth.studioAutosaveTimerId) return;
        clearTimeout(state.auth.studioAutosaveTimerId);
        state.auth.studioAutosaveTimerId = null;
    }

    function canRunTimedStudioAutosave() {
        return !!(
            state.auth.quizStudioOpen &&
            state.auth.currentStudioSection === 'editor' &&
            state.auth.studioHasUnsavedChanges &&
            state.auth.client &&
            state.auth.user?.id &&
            state.auth.editingQuizId &&
            (state.auth.editingQuestionId || hasStudioQuestionDrafts())
        );
    }

    function scheduleStudioAutosave() {
        clearStudioAutosaveTimer();
        if (!state.auth.studioHasUnsavedChanges || !state.auth.quizStudioOpen) return;

        state.auth.studioAutosaveTimerId = window.setTimeout(() => {
            state.auth.studioAutosaveTimerId = null;
            if (!canRunTimedStudioAutosave()) {
                if (state.auth.studioHasUnsavedChanges) scheduleStudioAutosave();
                return;
            }

            autosaveStudioChanges({ reason: 'timer', allowCreate: false, quiet: true }).catch(error => {
                console.error('Timed Quiz Studio autosave failed:', error);
                if (state.auth.studioHasUnsavedChanges) scheduleStudioAutosave();
            });
        }, CONFIG.studioAutosaveDelayMs);
    }

    function setStudioDirtyState(isDirty) {
        state.auth.studioHasUnsavedChanges = !!isDirty;
        updateStudioUnsavedChangesIndicator();

        if (state.auth.studioHasUnsavedChanges) {
            scheduleStudioAutosave();
        } else {
            clearStudioAutosaveTimer();
        }
    }

    function confirmDiscardStudioChanges(actionLabel = 'continue') {
        if (!state.auth.studioHasUnsavedChanges) return true;
        return window.confirm(`You have unsaved Quiz Studio changes. Discard them and ${actionLabel}?`);
    }

    async function autosaveStudioChanges(options = {}) {
        if (!state.auth.studioHasUnsavedChanges) return true;
        if (state.auth.studioAutosaveInFlight) return false;

        const allowCreate = options.allowCreate !== false;
        if (!allowCreate && (!state.auth.editingQuizId || !state.auth.editingQuestionId)) {
            scheduleStudioAutosave();
            return false;
        }

        if (!state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before saving Quiz Studio changes.', 'error');
            return false;
        }

        state.auth.studioAutosaveInFlight = true;
        state.auth.studioAutosaveQuiet = !!options.quiet;
        clearStudioAutosaveTimer();

        try {
            if (!options.quiet) {
                setCreatorStatus('Autosaving Quiz Studio changes...');
            }

            if (hasStudioQuestionDrafts()) {
                await saveStudioCachedDrafts();
            } else {
                await handleSaveStudioEditorChanges();
            }
            const saved = !state.auth.studioHasUnsavedChanges && !hasStudioQuestionDrafts();

            if (!saved && !options.quiet) {
                setCreatorStatus('Fix the editor fields before leaving this quiz.', 'error');
            }

            return saved;
        } catch (error) {
            console.error('Quiz Studio autosave failed:', error);
            if (!options.quiet) {
                setCreatorStatus(error.message || 'Could not autosave Quiz Studio changes.', 'error');
            }
            return false;
        } finally {
            state.auth.studioAutosaveQuiet = false;
            state.auth.studioAutosaveInFlight = false;
            if (state.auth.studioHasUnsavedChanges) {
                scheduleStudioAutosave();
            }
        }
    }

    function isStudioLocalFlashcardId(questionId) {
        return normalizeSheetText(questionId).startsWith(STUDIO_LOCAL_FLASHCARD_PREFIX);
    }

    function createStudioLocalFlashcardId() {
        state.auth.localFlashcardDraftCounter = Number(state.auth.localFlashcardDraftCounter || 0) + 1;
        return `${STUDIO_LOCAL_FLASHCARD_PREFIX}${Date.now()}_${state.auth.localFlashcardDraftCounter}`;
    }

    function getStudioLocalFlashcardRows(sourceRows = state.auth.studioQuizQuestions) {
        return (sourceRows || []).filter(row => isStudioLocalFlashcardId(row?.id) && normalizeSheetText(row?.question_type || 'flashcard') === 'flashcard');
    }

    function hasStudioLocalFlashcardDrafts() {
        return getStudioLocalFlashcardRows().length > 0;
    }

    function hasPendingFlashcardDraftContent() {
        const pendingRow = getStudioPendingFlashcardRow();
        if (!pendingRow) return false;
        return !!normalizeSheetText(pendingRow.term_plain || pendingRow.prompt_plain || pendingRow.definition_plain);
    }

    function syncStudioFlashcardInlineRowsToState() {
        if (!isStudioFlashcardMode() || !elements.studioQuestionList) return false;
        let changed = false;

        elements.studioQuestionList.querySelectorAll('[data-studio-flashcard-term-id]').forEach(field => {
            const questionId = normalizeSheetText(field.dataset.studioFlashcardTermId);
            const row = state.auth.studioQuizQuestions.find(question => question.id === questionId);
            if (!row) return;
            const value = field.value;
            if (row.term_plain !== value || row.prompt_plain !== value) {
                row.term_plain = value;
                row.prompt_plain = value;
                row.term_html = buildStoredHtmlFromPlain(value);
                changed = true;
            }
            if (questionId === state.auth.editingQuestionId && elements.createFlashcardTerm && elements.createFlashcardTerm !== document.activeElement) {
                elements.createFlashcardTerm.value = value;
            }
        });

        elements.studioQuestionList.querySelectorAll('[data-studio-flashcard-definition-id]').forEach(field => {
            const questionId = normalizeSheetText(field.dataset.studioFlashcardDefinitionId);
            const row = state.auth.studioQuizQuestions.find(question => question.id === questionId);
            if (!row) return;
            const value = field.value;
            if (row.definition_plain !== value) {
                row.definition_plain = value;
                row.definition_html = buildStoredHtmlFromPlain(value);
                changed = true;
            }
            if (questionId === state.auth.editingQuestionId && elements.createFlashcardDefinition && elements.createFlashcardDefinition !== document.activeElement) {
                elements.createFlashcardDefinition.value = value;
            }
        });

        const pendingRow = getStudioPendingFlashcardRow();
        const pendingTerm = elements.studioQuestionList.querySelector('[data-studio-pending-flashcard-term]');
        if (pendingRow && pendingTerm) {
            const value = pendingTerm.value;
            if (pendingRow.term_plain !== value || pendingRow.prompt_plain !== value) {
                pendingRow.term_plain = value;
                pendingRow.prompt_plain = value;
                pendingRow.term_html = buildStoredHtmlFromPlain(value);
                changed = true;
            }
            if (!state.auth.editingQuestionId && elements.createFlashcardTerm && elements.createFlashcardTerm !== document.activeElement) {
                elements.createFlashcardTerm.value = value;
            }
        }

        const pendingDefinition = elements.studioQuestionList.querySelector('[data-studio-pending-flashcard-definition]');
        if (pendingRow && pendingDefinition) {
            const value = pendingDefinition.value;
            if (pendingRow.definition_plain !== value) {
                pendingRow.definition_plain = value;
                pendingRow.definition_html = buildStoredHtmlFromPlain(value);
                changed = true;
            }
            if (!state.auth.editingQuestionId && elements.createFlashcardDefinition && elements.createFlashcardDefinition !== document.activeElement) {
                elements.createFlashcardDefinition.value = value;
            }
        }

        return changed;
    }

    function buildLocalFlashcardDraftFromEditor(rowId = createStudioLocalFlashcardId()) {
        const term = normalizeSheetText(elements.createFlashcardTerm?.value);
        const definition = normalizeSheetText(elements.createFlashcardDefinition?.value);
        return {
            id: rowId,
            question_type: 'flashcard',
            prompt_plain: term,
            term_plain: term,
            term_html: getFlashcardTermEditorHtml(),
            definition_plain: definition,
            definition_html: getFlashcardDefinitionEditorHtml(),
            learning_resources_html: getLearningResourcesEditorHtml(),
            learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || '',
            learning_resources_image_label: state.auth.studioLearningResourcesImageLabel || '',
            term_image_url: state.auth.studioFlashcardTermImageDataUrl || '',
            term_image_label: state.auth.studioFlashcardTermImageLabel || '',
            definition_image_url: state.auth.studioFlashcardDefinitionImageDataUrl || '',
            definition_image_label: state.auth.studioFlashcardDefinitionImageLabel || '',
            sort_order: Number.MAX_SAFE_INTEGER,
            is_local_draft: true
        };
    }

    function syncLocalFlashcardDraftFromEditor() {
        if (!isStudioLocalFlashcardId(state.auth.editingQuestionId)) return false;
        const row = state.auth.studioQuizQuestions.find(item => item.id === state.auth.editingQuestionId);
        if (!row) return false;
        Object.assign(row, buildLocalFlashcardDraftFromEditor(row.id));
        renderStudioQuestionList();
        updateStudioUnsavedChangesIndicator();
        return true;
    }

    function promotePendingFlashcardToLocalDraft() {
        const pendingRow = getStudioPendingFlashcardRow();
        if (!pendingRow || isStudioFlashcardEditorBlank()) return false;
        const localRow = buildLocalFlashcardDraftFromEditor(createStudioLocalFlashcardId());
        const insertAfterId = state.auth.pendingInsertAfterQuestionId;
        const insertIndex = insertAfterId ? state.auth.studioQuizQuestions.findIndex(question => question.id === insertAfterId) : -1;
        if (insertIndex !== -1) {
            state.auth.studioQuizQuestions.splice(insertIndex + 1, 0, localRow);
        } else {
            state.auth.studioQuizQuestions.push(localRow);
        }
        state.auth.studioPendingNewQuestionRow = null;
        return true;
    }

    function cacheCurrentFlashcardDraftForNavigation() {
        if (!isStudioFlashcardMode()) return false;
        if (isStudioLocalFlashcardId(state.auth.editingQuestionId)) {
            return syncLocalFlashcardDraftFromEditor();
        }
        if (!state.auth.editingQuestionId && getStudioPendingFlashcardRow() && !isStudioFlashcardEditorBlank()) {
            return promotePendingFlashcardToLocalDraft();
        }
        return false;
    }

    function hasStudioQuestionDrafts() {
        return !!state.auth.studioQuestionDrafts?.size || hasStudioLocalFlashcardDrafts() || hasPendingFlashcardDraftContent();
    }

    function clearStudioQuestionDraft(questionId) {
        const key = normalizeSheetText(questionId);
        if (!key || !state.auth.studioQuestionDrafts) return;
        state.auth.studioQuestionDrafts.delete(key);
    }

    function getStudioQuestionDraftFromEditor() {
        const questionId = normalizeSheetText(state.auth.editingQuestionId);
        if (!questionId) return null;
        const questionType = getStudioCurrentQuizType();
        const draft = {
            questionId,
            questionType,
            prompt: normalizeAuthoredMathChemText(elements.createQuestionPrompt?.value),
            questionImage: state.auth.studioQuestionImageDataUrl || '',
            questionImageLabel: state.auth.studioQuestionImageLabel || '',
            learningResourcesHtml: getLearningResourcesEditorHtml(),
            learningResourcesImage: state.auth.studioLearningResourcesImageDataUrl || '',
            learningResourcesImageLabel: state.auth.studioLearningResourcesImageLabel || ''
        };

        if (questionType === 'flashcard') {
            draft.term = normalizeSheetText(elements.createFlashcardTerm?.value);
            draft.termHtml = getFlashcardTermEditorHtml();
            draft.definition = normalizeSheetText(elements.createFlashcardDefinition?.value);
            draft.definitionHtml = getFlashcardDefinitionEditorHtml();
            draft.termImage = state.auth.studioFlashcardTermImageDataUrl || '';
            draft.termImageLabel = state.auth.studioFlashcardTermImageLabel || '';
            draft.definitionImage = state.auth.studioFlashcardDefinitionImageDataUrl || '';
            draft.definitionImageLabel = state.auth.studioFlashcardDefinitionImageLabel || '';
        } else if (questionType === 'hierarchy') {
            draft.hierarchyDrafts = getStudioHierarchyDraftsFromDOM();
        } else if (questionType === 'classify') {
            const categories = getStudioClassifyCategoriesDraftsFromDOM();
            draft.classifyCategories = categories;
            draft.classifyItems = getStudioClassifyItemsDraftsFromDOM(categories);
        } else if (questionType === 'diagrams') {
            draft.diagramLabels = getStudioDiagramLabelsFromDOM();
            draft.options = getStudioOptionDraftsFromDOM();
            draft.correctOption = normalizeSheetText(elements.createCorrectOptionSelect?.value || '1') || '1';
            draft.correctExplanation = normalizeAuthoredMathChemText(elements.createCorrectExplanation?.value);
            draft.expandedOptionImageRows = Array.from(state.auth.expandedOptionImageRows || []);
        } else {
            draft.options = getStudioOptionDraftsFromDOM();
            draft.correctOption = normalizeSheetText(elements.createCorrectOptionSelect?.value || '1') || '1';
            draft.correctExplanation = normalizeAuthoredMathChemText(elements.createCorrectExplanation?.value);
            draft.expandedOptionImageRows = Array.from(state.auth.expandedOptionImageRows || []);
        }

        return draft;
    }

    function cacheCurrentStudioQuestionDraft() {
        if (!state.auth.studioHasUnsavedChanges) return;
        syncStudioFlashcardInlineRowsToState();
        if (cacheCurrentFlashcardDraftForNavigation()) {
            renderStudioQuestionList();
            updateStudioUnsavedChangesIndicator();
            return;
        }
        if (!state.auth.editingQuestionId) return;
        const draft = getStudioQuestionDraftFromEditor();
        if (!draft?.questionId) return;
        state.auth.studioQuestionDrafts.set(draft.questionId, draft);
        renderStudioQuestionList();
        updateStudioUnsavedChangesIndicator();
    }

    function applyStudioQuestionDraft(draft) {
        if (!draft) return;
        if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = draft.prompt || '';
        state.auth.studioQuestionImagePanelOpen = false;
        state.auth.expandedClassifyCategoryImageRows.clear();
        state.auth.expandedClassifyItemImageRows.clear();
        setLearningResourcesEditorHtml(draft.learningResourcesHtml || '', '');
        setStudioQuestionImageState(draft.questionImage || '', draft.questionImageLabel || (draft.questionImage ? 'Existing question image saved.' : 'No question image selected.'));
        setStudioLearningResourcesImageState(draft.learningResourcesImage || '', draft.learningResourcesImageLabel || (draft.learningResourcesImage ? 'Existing learning resources image saved.' : 'No learning resources image selected.'));

        if (draft.questionType === 'flashcard') {
            setFlashcardTermEditorHtml(draft.termHtml || '', draft.term || '');
            setFlashcardDefinitionEditorHtml(draft.definitionHtml || '', draft.definition || '');
            setStudioFlashcardTermImageState(draft.termImage || '', draft.termImageLabel || (draft.termImage ? 'Existing term image saved.' : 'No term image selected.'));
            setStudioFlashcardDefinitionImageState(draft.definitionImage || '', draft.definitionImageLabel || (draft.definitionImage ? 'Existing definition image saved.' : 'No definition image selected.'));
        } else if (draft.questionType === 'hierarchy') {
            renderStudioHierarchyFields(draft.hierarchyDrafts || null);
        } else if (draft.questionType === 'classify') {
            renderStudioClassifyFields(draft.classifyCategories || null, draft.classifyItems || null);
        } else if (draft.questionType === 'diagrams') {
            renderStudioDiagramLabels(draft.diagramLabels || null);
            state.auth.expandedOptionImageRows = new Set(draft.expandedOptionImageRows || []);
            renderStudioOptionFields(draft.options || null);
            syncCorrectOptionSelect(draft.correctOption || '1');
            if (elements.createCorrectExplanation) elements.createCorrectExplanation.value = draft.correctExplanation || '';
        } else {
            state.auth.expandedOptionImageRows = new Set(draft.expandedOptionImageRows || []);
            renderStudioOptionFields(draft.options || null);
            syncCorrectOptionSelect(draft.correctOption || '1');
            if (elements.createCorrectExplanation) elements.createCorrectExplanation.value = draft.correctExplanation || '';
        }
    }

    function loadStudioLocalFlashcardIntoEditor(questionId, options = {}) {
        const row = state.auth.studioQuizQuestions.find(item => item.id === questionId && isStudioLocalFlashcardId(item.id));
        if (!row) return false;
        if (state.auth.studioHasUnsavedChanges) {
            cacheCurrentStudioQuestionDraft();
        }
        state.auth.editingQuestionId = row.id;
        syncStudioQuestionFocusToEditor();
        state.auth.editingQuizType = 'flashcard';
        state.auth.pendingInsertAfterQuestionId = null;
        state.auth.studioPendingNewQuestionRow = null;
        state.auth.expandedOptionImageRows.clear();
        state.auth.expandedClassifyCategoryImageRows.clear();
        state.auth.expandedClassifyItemImageRows.clear();
        if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = normalizeSheetText(row.term_plain || row.prompt_plain);
        setFlashcardTermEditorHtml(row.term_html || '', normalizeSheetText(row.term_plain || row.prompt_plain));
        setFlashcardDefinitionEditorHtml(row.definition_html || '', normalizeSheetText(row.definition_plain));
        setLearningResourcesEditorHtml(row.learning_resources_html || '', '');
        setStudioLearningResourcesImageState(row.learning_resources_image_url || '', row.learning_resources_image_label || (row.learning_resources_image_url ? 'Existing learning resources image saved.' : 'No learning resources image selected.'));
        setStudioQuestionImageState('', 'No question image selected.');
        setStudioFlashcardTermImageState(row.term_image_url || '', row.term_image_label || (row.term_image_url ? 'Existing term image saved.' : 'No term image selected.'));
        setStudioFlashcardDefinitionImageState(row.definition_image_url || '', row.definition_image_label || (row.definition_image_url ? 'Existing definition image saved.' : 'No definition image selected.'));
        renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '', imageUrl: '', imageLabel: '' })));
        renderStudioHierarchyFields(Array.from({ length: 4 }, (_, index) => ({ text: '', position: index + 1 })));
        renderStudioClassifyFields(Array.from({ length: 2 }, (_, index) => ({ label: '', id: `class_${index + 1}` })), Array.from({ length: 2 }, () => ({ text: '', categoryId: 'class_1' })));
        renderStudioQuestionList();
        updateCreateQuizModeUI();
        setStudioDirtyState(true);
        if (!options.suppressStatus) {
            setCreatorStatus('Unsaved flashcard loaded into the editor.', 'success');
        }
        return true;
    }

    async function saveStudioLocalFlashcardDraftRows(sourceRows = getStudioLocalFlashcardRows(), orderRows = state.auth.studioQuizQuestions) {
        const localRows = (sourceRows || []).filter(row => isStudioLocalFlashcardId(row?.id));
        if (!localRows.length) return [];
        if (!state.auth.client || !state.auth.user?.id) throw new Error('Sign in before saving flashcards.');
        const quizId = state.auth.editingQuizId;
        const quizName = normalizeSheetText(elements.createQuizName?.value);
        const folderId = normalizeSheetText(elements.createQuizFolderSelect?.value) || null;
        if (!quizId) throw new Error('Save or open a flashcard quiz before adding cards.');
        if (!quizName) throw new Error('Enter a quiz name first.');

        const { error: quizError } = await state.auth.client.from('quizzes').update({ folder_id: folderId, name: quizName }).eq('id', quizId);
        if (quizError) throw quizError;

        let nextSortOrder = await getNextQuestionSortOrder(quizId);
        const savedIds = [];
        const localIdToSavedId = new Map();
        for (const row of localRows) {
            const term = normalizeSheetText(row.term_plain || row.prompt_plain);
            const definition = normalizeSheetText(row.definition_plain);
            if (!term || !definition) {
                throw new Error('Each unsaved flashcard needs both a term and a definition before saving.');
            }
            const learningResourcesHtml = sanitizeLearningResourcesHtml(row.learning_resources_html || '');
            const { data, error } = await state.auth.client.from('questions').insert({
                quiz_id: quizId,
                question_type: 'flashcard',
                prompt_html: sanitizeLearningResourcesHtml(row.term_html || '') || buildStoredHtmlFromPlain(term),
                prompt_plain: term,
                image_url: '',
                learning_resources_html: learningResourcesHtml,
                learning_resources_image_url: '',
                sort_order: nextSortOrder++
            }).select('id').single();
            if (error) throw error;
            const questionId = data.id;
            const savedSharedMedia = await saveSharedQuestionMediaValues(quizId, questionId, {
                image_url: '',
                learning_resources_image_url: row.learning_resources_image_url || ''
            });
            const { error: mediaUpdateError } = await state.auth.client.from('questions').update({
                learning_resources_image_url: savedSharedMedia.learning_resources_image_url || ''
            }).eq('id', questionId);
            if (mediaUpdateError) throw mediaUpdateError;
            const savedFlashcardMedia = await saveFlashcardMediaValues(quizId, questionId, {
                term_image_url: row.term_image_url || '',
                definition_image_url: row.definition_image_url || ''
            });
            const detailPayload = {
                question_id: questionId,
                term_html: sanitizeLearningResourcesHtml(row.term_html || '') || buildStoredHtmlFromPlain(term),
                definition_html: sanitizeLearningResourcesHtml(row.definition_html || '') || buildStoredHtmlFromPlain(definition),
                term_plain: term,
                definition_plain: definition,
                term_image_url: savedFlashcardMedia.term_image_url || '',
                definition_image_url: savedFlashcardMedia.definition_image_url || ''
            };
            const { error: detailError } = await state.auth.client.from('flashcard_questions').upsert(detailPayload, { onConflict: 'question_id' });
            if (detailError) throw detailError;
            savedIds.push(questionId);
            localIdToSavedId.set(row.id, questionId);
        }

        const orderedQuestionIds = (orderRows || state.auth.studioQuizQuestions)
            .map(row => localIdToSavedId.get(row.id) || row.id)
            .filter(questionId => questionId && !isStudioLocalFlashcardId(questionId));
        if (orderedQuestionIds.length) {
            await reorderStudioQuizQuestionIds(orderedQuestionIds);
        }

        state.auth.studioQuizQuestions = state.auth.studioQuizQuestions.filter(row => !isStudioLocalFlashcardId(row.id));
        state.auth.studioPendingNewQuestionRow = null;
        return savedIds;
    }

    async function saveStudioFlashcardQuestionDraftDirect(questionId, draft = {}) {
        const normalizedQuestionId = normalizeSheetText(questionId);
        if (!normalizedQuestionId || isStudioLocalFlashcardId(normalizedQuestionId)) return '';
        if (!state.auth.client || !state.auth.user?.id) throw new Error('Sign in before saving flashcards.');
        const quizId = state.auth.editingQuizId;
        const quizName = normalizeSheetText(elements.createQuizName?.value);
        const folderId = normalizeSheetText(elements.createQuizFolderSelect?.value) || null;
        const term = normalizeSheetText(draft.term || draft.prompt || '');
        const definition = normalizeSheetText(draft.definition || '');
        const termHtml = sanitizeLearningResourcesHtml(draft.termHtml || '') || buildStoredHtmlFromPlain(term);
        const definitionHtml = sanitizeLearningResourcesHtml(draft.definitionHtml || '') || buildStoredHtmlFromPlain(definition);
        const learningResourcesHtml = sanitizeLearningResourcesHtml(draft.learningResourcesHtml || '');

        if (!quizId) throw new Error('Save or open a flashcard quiz before updating cards.');
        if (!quizName) throw new Error('Enter a quiz name first.');
        if (!term) throw new Error('Enter a flashcard term first.');
        if (!definition) throw new Error('Enter a flashcard definition first.');

        const previousMediaRefs = await getQuestionMediaReferences(normalizedQuestionId);
        const savedLearningResourcesImage = await savePrivateMediaValue(draft.learningResourcesImage || '', {
            quizId,
            questionId: normalizedQuestionId,
            usageContext: 'learning_resources_image_url',
            label: draft.learningResourcesImageLabel || 'learning resources image'
        });
        const savedTermImage = await savePrivateMediaValue(draft.termImage || '', {
            quizId,
            questionId: normalizedQuestionId,
            usageContext: 'term_image_url',
            label: draft.termImageLabel || 'term image'
        });
        const savedDefinitionImage = await savePrivateMediaValue(draft.definitionImage || '', {
            quizId,
            questionId: normalizedQuestionId,
            usageContext: 'definition_image_url',
            label: draft.definitionImageLabel || 'definition image'
        });

        const { error: quizError } = await state.auth.client.from('quizzes').update({ folder_id: folderId, name: quizName }).eq('id', quizId);
        if (quizError) throw quizError;

        const { error: questionError } = await state.auth.client.from('questions').update({
            prompt_html: termHtml,
            prompt_plain: term,
            image_url: '',
            learning_resources_html: learningResourcesHtml,
            learning_resources_image_url: savedLearningResourcesImage || ''
        }).eq('id', normalizedQuestionId);
        if (questionError) throw questionError;

        const { error: detailError } = await state.auth.client.from('flashcard_questions').upsert({
            question_id: normalizedQuestionId,
            term_html: termHtml,
            definition_html: definitionHtml,
            term_plain: term,
            definition_plain: definition,
            term_image_url: savedTermImage || '',
            definition_image_url: savedDefinitionImage || ''
        }, { onConflict: 'question_id' });
        if (detailError) throw detailError;

        await deleteReplacedMediaReferences(previousMediaRefs, {
            image_url: '',
            learning_resources_image_url: savedLearningResourcesImage || '',
            term_image_url: savedTermImage || '',
            definition_image_url: savedDefinitionImage || ''
        });

        const row = state.auth.studioQuizQuestions.find(question => question.id === normalizedQuestionId);
        if (row) {
            row.prompt_plain = term;
            row.term_plain = term;
            row.term_html = termHtml;
            row.definition_plain = definition;
            row.definition_html = definitionHtml;
            row.learning_resources_html = learningResourcesHtml;
            row.learning_resources_image_url = savedLearningResourcesImage || '';
            row.term_image_url = savedTermImage || '';
            row.definition_image_url = savedDefinitionImage || '';
        }

        clearStudioQuestionDraft(normalizedQuestionId);
        return normalizedQuestionId;
    }

    async function saveStudioCachedDrafts() {
        syncStudioFlashcardInlineRowsToState();
        cacheCurrentStudioQuestionDraft();
        const flashcardOrderSnapshot = state.auth.studioQuizQuestions.map(row => ({ id: row.id }));
        const draftEntries = Array.from(state.auth.studioQuestionDrafts.entries());
        const localFlashcardRows = getStudioLocalFlashcardRows().map(row => ({ ...row }));
        const flashcardDraftEntries = draftEntries.filter(([, draft]) => draft?.questionType === 'flashcard');
        const otherDraftEntries = draftEntries.filter(([, draft]) => draft?.questionType !== 'flashcard');

        for (const [questionId, draft] of flashcardDraftEntries) {
            try {
                await saveStudioFlashcardQuestionDraftDirect(questionId, draft);
            } catch (error) {
                state.auth.studioQuestionDrafts.set(questionId, draft);
                throw error;
            }
        }

        for (const [questionId, draft] of otherDraftEntries) {
            try {
                await loadStudioQuestionIntoEditor(questionId, { force: true, suppressStatus: true, skipDraftRestore: true });
                applyStudioQuestionDraft(draft);
                setStudioDirtyState(true);
                await handleSaveStudioQuiz({ skipCachedDrafts: true });
                if (state.auth.studioQuestionDrafts.has(questionId)) {
                    throw new Error('Fix the editor fields before leaving this quiz.');
                }
            } catch (error) {
                state.auth.studioQuestionDrafts.set(questionId, draft);
                throw error;
            }
        }
        const savedLocalIds = await saveStudioLocalFlashcardDraftRows(localFlashcardRows, flashcardOrderSnapshot);
        if (savedLocalIds.length && state.auth.editingQuizId) {
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${state.auth.editingQuizId}`, loadSelectedQuiz: true });
            await loadQuizIntoEditor(state.auth.editingQuizId, savedLocalIds[savedLocalIds.length - 1], { force: true });
        } else if (flashcardDraftEntries.length) {
            renderStudioQuestionList();
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${state.auth.editingQuizId}` });
        }
        setStudioDirtyState(false);
    }

    function getStudioPendingFlashcardRow() {
        if (!state.auth.editingQuizId || getStudioCurrentQuizType() !== 'flashcard') return null;
        const row = state.auth.studioPendingNewQuestionRow;
        if (!row || row.question_type !== 'flashcard') return null;
        return row;
    }

    function focusStudioPendingFlashcardTerm() {
        const pendingInlineField = elements.studioQuestionList?.querySelector('[data-studio-pending-flashcard-term]');
        if (pendingInlineField) {
            pendingInlineField.focus();
            return;
        }
        if (elements.createFlashcardTerm) {
            elements.createFlashcardTerm.focus();
        }
    }

    function isStudioFlashcardEditorBlank() {
        const term = normalizeSheetText(elements.createFlashcardTerm?.value);
        const definition = normalizeSheetText(elements.createFlashcardDefinition?.value);
        const learningResources = getLearningResourcesEditorPlain();
        return !term
            && !definition
            && !learningResources
            && !state.auth.studioFlashcardTermImageDataUrl
            && !state.auth.studioFlashcardDefinitionImageDataUrl
            && !state.auth.studioLearningResourcesImageDataUrl;
    }

    async function handleStudioFlashcardAddCard() {
        if (!isStudioFlashcardMode()) {
            await beginStudioNewQuestion();
            return;
        }

        if (state.auth.studioHasUnsavedChanges && !isStudioFlashcardEditorBlank()) {
            cacheCurrentFlashcardDraftForNavigation();
        }

        await beginStudioNewQuestion();
        focusStudioPendingFlashcardTerm();
    }

    function getStudioListRowsWithPendingDraft() {
        const rows = [...state.auth.studioQuizQuestions];
        const pendingRow = getStudioPendingFlashcardRow();
        if (!pendingRow) return rows;

        const insertAfterId = state.auth.pendingInsertAfterQuestionId;
        if (insertAfterId) {
            const insertIndex = rows.findIndex(question => question.id === insertAfterId);
            if (insertIndex !== -1) {
                rows.splice(insertIndex + 1, 0, pendingRow);
                return rows;
            }
        }

        rows.push(pendingRow);
        return rows;
    }

    function getFilteredStudioQuizQuestions() {
        const query = normalizeSheetText(state.auth.studioQuestionSearchQuery || '').toLowerCase();
        if (!query) {
            return state.auth.studioQuizQuestions;
        }

        return state.auth.studioQuizQuestions.filter((questionRow, index) => {
            const preview = getStudioQuestionPreviewLabel(questionRow, index).toLowerCase();
            return preview.includes(query);
        });
    }

    function isStudioQuestionFocusMode() {
        return !!normalizeSheetText(state.auth.studioFocusedQuestionId);
    }

    function clearStudioQuestionFocusMode(options = {}) {
        if (!state.auth.studioFocusedQuestionId && !options.forceRender) return;
        state.auth.studioFocusedQuestionId = '';
        renderStudioQuestionList();
        updateStudioQuestionNavigationUI();
        if (options.status !== false) {
            setCreatorStatus('Showing all questions in this quiz.', 'success');
        }
    }

    function getStudioQuestionBuildUpValue(questionRow = {}) {
        return normalizeBuildUpValue(questionRow?.buildUp || questionRow?.build_up || questionRow?.buildUpGroup || questionRow?.build_up_group);
    }

    function isSameBuildUpString(firstValue = '', secondValue = '') {
        const first = normalizeBuildUpValue(firstValue).toLowerCase();
        const second = normalizeBuildUpValue(secondValue).toLowerCase();
        return !!first && !!second && first === second;
    }

    function isStudioBuildUpEditMode() {
        return getStudioCurrentQuizType() === 'multiple_choice' && !!normalizeBuildUpValue(state.auth.studioActiveBuildUpString || '');
    }

    function clearStudioBuildUpEditMode(options = {}) {
        if (!state.auth.studioActiveBuildUpString && !options.forceRender) return;
        state.auth.studioActiveBuildUpString = '';
        renderStudioQuestionList();
        updateStudioQuestionNavigationUI();
        if (options.status !== false) {
            setCreatorStatus('Build Up string editing closed.', 'success');
        }
    }

    function isStudioBuildUpFocusMode() {
        return getStudioCurrentQuizType() === 'multiple_choice' && !!normalizeBuildUpValue(state.auth.studioFocusedBuildUpString || '');
    }

    function clearStudioBuildUpFocusMode(options = {}) {
        if (!state.auth.studioFocusedBuildUpString && !options.forceRender) return;
        state.auth.studioFocusedBuildUpString = '';
        renderStudioQuestionList();
        updateStudioQuestionNavigationUI();
        if (options.status !== false) {
            setCreatorStatus('Showing all questions in this quiz.', 'success');
        }
    }

    function clearStudioQuestionListFocusModes(options = {}) {
        const hadFocus = !!state.auth.studioFocusedQuestionId || !!state.auth.studioFocusedBuildUpString;
        state.auth.studioFocusedQuestionId = '';
        state.auth.studioFocusedBuildUpString = '';
        if (hadFocus || options.forceRender) {
            renderStudioQuestionList();
            updateStudioQuestionNavigationUI();
        }
        if ((hadFocus || options.forceRender) && options.status !== false) {
            setCreatorStatus('Showing all questions in this quiz.', 'success');
        }
    }

    function setStudioBuildUpFocusMode(buildUpValue, options = {}) {
        const normalizedBuildUp = normalizeBuildUpValue(buildUpValue);
        if (!normalizedBuildUp) {
            clearStudioBuildUpFocusMode(options);
            return;
        }
        state.auth.studioActiveBuildUpString = '';
        state.auth.studioFocusedQuestionId = '';
        state.auth.studioFocusedBuildUpString = normalizedBuildUp;
        state.auth.studioQuestionSearchQuery = '';
        state.auth.studioQuestionStarredOnly = false;
        if (elements.studioQuestionSearchInput) elements.studioQuestionSearchInput.value = '';
        syncStudioQuestionStarredFilterButton();
        renderStudioQuestionList();
        updateStudioQuestionNavigationUI();
        if (options.status !== false) {
            setCreatorStatus(`Focusing Build Up string "${normalizedBuildUp}".`, 'success');
        }
    }

    function setStudioBuildUpEditMode(buildUpValue, options = {}) {
        const normalizedBuildUp = normalizeBuildUpValue(buildUpValue);
        if (!normalizedBuildUp) {
            clearStudioBuildUpEditMode(options);
            return;
        }
        state.auth.studioActiveBuildUpString = normalizedBuildUp;
        state.auth.studioFocusedBuildUpString = '';
        state.auth.studioFocusedQuestionId = '';
        state.auth.studioQuestionSearchQuery = '';
        state.auth.studioQuestionStarredOnly = false;
        if (elements.studioQuestionSearchInput) elements.studioQuestionSearchInput.value = '';
        syncStudioQuestionStarredFilterButton();
        renderStudioQuestionList();
        updateStudioQuestionNavigationUI();
        if (options.status !== false) {
            setCreatorStatus(`Editing Build Up string "${normalizedBuildUp}". Use Add and Remove to choose its questions.`, 'success');
        }
    }

    function getNextStudioBuildUpStringName() {
        const used = new Set((state.auth.studioQuizQuestions || [])
            .map(question => getStudioQuestionBuildUpValue(question).toLowerCase())
            .filter(Boolean));
        let index = 1;
        while (used.has(`string-${index}`)) index += 1;
        return `string-${index}`;
    }

    function normalizeOptionsJsonForBuildUpUpdate(detailRow = {}) {
        const rawOptions = getOptionsJsonOptions(detailRow?.options_json);
        const sourceOptions = rawOptions.length
            ? rawOptions
            : getMultipleChoiceDraftsFromDetailRow(detailRow).map((draft, index) => ({
                text: normalizeAuthoredMathChemText(draft.text),
                explanation_html: buildStoredHtmlFromPlain(draft.explanation),
                imageUrl: normalizeSheetText(draft.imageUrl),
                imageLabel: normalizeSheetText(draft.imageLabel) || getOptionImageLabel(draft, index)
            }));
        return sourceOptions.map((option, index) => ({
            text: normalizeSheetText(option?.text),
            explanation_html: normalizeSheetText(option?.explanation_html || buildStoredHtmlFromPlain(option?.explanation || '')),
            imageUrl: normalizeSheetText(option?.imageUrl || option?.image_url),
            imageLabel: normalizeSheetText(option?.imageLabel || option?.image_label) || getOptionImageLabel(option, index)
        })).filter(option => option.text || option.imageUrl);
    }

    async function updateStudioQuestionBuildUpString(questionId, nextBuildUpValue = '') {
        const normalizedQuestionId = normalizeSheetText(questionId);
        if (!state.auth.client || !state.auth.editingQuizId || !normalizedQuestionId) {
            throw new Error('Select a saved multiple-choice question first.');
        }
        const questionRow = state.auth.studioQuizQuestions.find(question => normalizeSheetText(question.id) === normalizedQuestionId);
        if (!questionRow || normalizeSheetText(questionRow.question_type || 'multiple_choice') !== 'multiple_choice') {
            throw new Error('Build Up strings are only available for multiple-choice questions.');
        }
        const detail = await loadMultipleChoiceDetailByQuestionId(normalizedQuestionId);
        if (!detail) throw new Error("Could not load this question's multiple-choice details.");
        const optionPayload = normalizeOptionsJsonForBuildUpUpdate(detail);
        const nextBuildUp = normalizeBuildUpValue(nextBuildUpValue);
        const nextOptionsJson = buildMultipleChoiceOptionsJsonPayload(optionPayload, nextBuildUp);
        const { error } = await state.auth.client
            .from('multiple_choice_questions')
            .update({ options_json: nextOptionsJson })
            .eq('question_id', normalizedQuestionId);
        if (error) {
            const missingColumn = /options_json/i.test(error.message || '') || /options_json/i.test(error.details || '');
            if (missingColumn) throw new Error('Run the Phase 6 Supabase migration before editing Build Up strings.');
            throw error;
        }
        questionRow.buildUp = nextBuildUp;
        return nextBuildUp;
    }

    async function handleStudioBuildUpStringButton(questionId) {
        const normalizedQuestionId = normalizeSheetText(questionId);
        const questionRow = getStudioQuestionRowById(normalizedQuestionId);
        if (!questionRow) throw new Error('Could not find that question.');
        let buildUpValue = getStudioQuestionBuildUpValue(questionRow);
        if (!buildUpValue) {
            buildUpValue = await updateStudioQuestionBuildUpString(normalizedQuestionId, getNextStudioBuildUpStringName());
        }
        setStudioBuildUpEditMode(buildUpValue);
    }

    async function handleStudioBuildUpAddQuestion(questionId) {
        const activeBuildUp = normalizeBuildUpValue(state.auth.studioActiveBuildUpString || '');
        if (!activeBuildUp) throw new Error('Open a Build Up string first.');
        const questionRow = getStudioQuestionRowById(questionId);
        const existingBuildUp = getStudioQuestionBuildUpValue(questionRow);
        if (existingBuildUp && !isSameBuildUpString(existingBuildUp, activeBuildUp)) {
            throw new Error('This question is already in another string. Remove it from that string before adding it here.');
        }
        await updateStudioQuestionBuildUpString(questionId, activeBuildUp);
        renderStudioQuestionList();
        setCreatorStatus('Question added to this Build Up string.', 'success');
    }

    async function handleStudioBuildUpRemoveQuestion(questionId) {
        const activeBuildUp = normalizeBuildUpValue(state.auth.studioActiveBuildUpString || '');
        if (!activeBuildUp) throw new Error('Open a Build Up string first.');
        const questionRow = getStudioQuestionRowById(questionId);
        if (!isSameBuildUpString(getStudioQuestionBuildUpValue(questionRow), activeBuildUp)) {
            setCreatorStatus('That question is not in this Build Up string.', 'error');
            return;
        }
        await updateStudioQuestionBuildUpString(questionId, '');
        const remaining = (state.auth.studioQuizQuestions || []).some(question => isSameBuildUpString(getStudioQuestionBuildUpValue(question), activeBuildUp));
        if (!remaining) {
            state.auth.studioActiveBuildUpString = '';
            renderStudioQuestionList();
            setCreatorStatus('Question removed. That Build Up string is now empty.', 'success');
            return;
        }
        renderStudioQuestionList();
        setCreatorStatus('Question removed from this Build Up string.', 'success');
    }

    function syncStudioQuestionStarredFilterButton() {
        if (!elements.studioQuestionStarredOnly) return;
        const active = !!state.auth.studioQuestionStarredOnly;
        elements.studioQuestionStarredOnly.classList.toggle('active', active);
        elements.studioQuestionStarredOnly.setAttribute('aria-pressed', active ? 'true' : 'false');
        elements.studioQuestionStarredOnly.title = active ? 'Clear starred-only filter' : 'Show only starred questions';
    }

    function setStudioQuestionFocusMode(questionId, options = {}) {
        const normalizedQuestionId = normalizeSheetText(questionId);
        if (!normalizedQuestionId) {
            clearStudioQuestionFocusMode(options);
            return;
        }

        state.auth.studioActiveBuildUpString = '';
        state.auth.studioFocusedBuildUpString = '';
        state.auth.studioFocusedQuestionId = normalizedQuestionId;
        state.auth.studioQuestionSearchQuery = '';
        if (elements.studioQuestionSearchInput) {
            elements.studioQuestionSearchInput.value = '';
        }
        renderStudioQuestionList();
        updateStudioQuestionNavigationUI();
        if (options.status !== false) {
            setCreatorStatus('Focus mode is showing only the current question.', 'success');
        }
    }

    function syncStudioQuestionFocusToEditor() {
        if (!isStudioQuestionFocusMode()) return;
        state.auth.studioFocusedQuestionId = normalizeSheetText(state.auth.editingQuestionId) || STUDIO_FOCUS_NEW_QUESTION_ID;
        state.auth.studioQuestionSearchQuery = '';
        if (elements.studioQuestionSearchInput) {
            elements.studioQuestionSearchInput.value = '';
        }
    }

    function getStudioQuestionChipLabel(questionType, index) {
        return String(index + 1);
    }

    function getStudioQuestionNavigationName(questionType, index) {
        const normalizedType = normalizeSheetText(questionType || 'multiple_choice');
        if (normalizedType === 'flashcard') return `Card ${index + 1}`;
        return `Question ${index + 1}`;
    }

    function autosizeStudioFlashcardInlineTextarea(field) {
        if (!field) return;
        field.style.height = 'auto';
        field.style.height = `${Math.max(field.scrollHeight, 56)}px`;
    }

    function autosizeStudioFlashcardInlineTextareas(root = elements.studioQuestionList) {
        if (!root) return;
        root.querySelectorAll('.studio-flashcard-inline-field textarea').forEach(autosizeStudioFlashcardInlineTextarea);
    }

    function revealStudioQuestionInList(questionId, options = {}) {
        const normalizedQuestionId = normalizeSheetText(questionId);
        if (!normalizedQuestionId || !elements.studioQuestionList) return;
        const reveal = () => {
            const row = Array.from(elements.studioQuestionList.querySelectorAll('[data-studio-row-question-id]'))
                .find(item => normalizeSheetText(item.getAttribute('data-studio-row-question-id')) === normalizedQuestionId);
            if (!row) return;
            row.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: options.instant ? 'auto' : 'smooth' });
            if (options.focusListButton) {
                const button = row.querySelector('[data-studio-question-id]');
                if (button && typeof button.focus === 'function') {
                    button.focus({ preventScroll: true });
                }
            }
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(reveal);
        } else {
            setTimeout(reveal, 0);
        }
    }

    function renderStudioQuestionList() {
        syncStudioQuestionStarredFilterButton();
        if (!elements.studioQuestionList) return;

        if (!state.auth.user?.id) {
            elements.studioQuestionList.innerHTML = '<div class="studio-list-empty">Sign in to edit quiz questions.</div>';
            updateStudioQuestionNavigationUI();
            return;
        }

        if (!state.auth.editingQuizId) {
            elements.studioQuestionList.innerHTML = '<div class="studio-list-empty">Create a quiz or click Edit on a Supabase quiz to manage multiple questions here.</div>';
            updateStudioQuestionNavigationUI();
            return;
        }

        const displayRows = getStudioListRowsWithPendingDraft();
        if (!displayRows.length) {
            elements.studioQuestionList.innerHTML = '<div class="studio-list-empty">No questions in this quiz yet. Click Add Question, fill in the editor, then save.</div>';
            updateStudioQuestionNavigationUI();
            return;
        }

        const editingType = getStudioCurrentQuizType();
        const activeBuildUpString = normalizeBuildUpValue(state.auth.studioActiveBuildUpString || '');
        const focusedBuildUpString = normalizeBuildUpValue(state.auth.studioFocusedBuildUpString || '');
        const buildUpEditActive = editingType === 'multiple_choice' && !!activeBuildUpString;
        let buildUpFocusActive = !buildUpEditActive && editingType === 'multiple_choice' && !!focusedBuildUpString;
        if (activeBuildUpString && editingType !== 'multiple_choice') {
            state.auth.studioActiveBuildUpString = '';
        }
        if (focusedBuildUpString && editingType !== 'multiple_choice') {
            state.auth.studioFocusedBuildUpString = '';
            buildUpFocusActive = false;
        }
        const query = normalizeSheetText(state.auth.studioQuestionSearchQuery || '').toLowerCase();
        const focusQuestionId = normalizeSheetText(state.auth.studioFocusedQuestionId || '');
        const focusModeActive = !buildUpEditActive && !buildUpFocusActive && !!focusQuestionId;
        const focusNewDraftActive = focusModeActive && focusQuestionId === STUDIO_FOCUS_NEW_QUESTION_ID;
        const starredOnlyFilter = !buildUpEditActive && !buildUpFocusActive && !!state.auth.studioQuestionStarredOnly;
        let filteredQuestions = displayRows;

        if (buildUpEditActive) {
            filteredQuestions = displayRows.filter(questionRow => normalizeSheetText(questionRow.question_type || 'multiple_choice') === 'multiple_choice');
        } else if (buildUpFocusActive) {
            if (query) {
                state.auth.studioQuestionSearchQuery = '';
                if (elements.studioQuestionSearchInput) elements.studioQuestionSearchInput.value = '';
            }
            filteredQuestions = displayRows.filter(questionRow => isSameBuildUpString(getStudioQuestionBuildUpValue(questionRow), focusedBuildUpString));
        } else if (focusModeActive) {
            if (query) {
                state.auth.studioQuestionSearchQuery = '';
                if (elements.studioQuestionSearchInput) elements.studioQuestionSearchInput.value = '';
            }
            filteredQuestions = focusNewDraftActive
                ? []
                : displayRows.filter(questionRow => questionRow.id === focusQuestionId);
        } else {
            if (starredOnlyFilter) {
                filteredQuestions = filteredQuestions.filter(questionRow => !!questionRow.isStarred);
            }
            if (query) {
                filteredQuestions = filteredQuestions.filter((questionRow, filteredIndex) => {
                    let previewIndex = state.auth.studioQuizQuestions.findIndex(question => question.id === questionRow.id);
                    if (previewIndex === -1) previewIndex = filteredIndex;
                    const preview = getStudioQuestionPreviewLabel(questionRow, previewIndex).toLowerCase();
                    return preview.includes(query);
                });
            }
        }

        if (!filteredQuestions.length && !focusNewDraftActive) {
            const emptyLabel = buildUpEditActive
                ? '<div class="studio-list-empty">This quiz has no multiple-choice questions available for Build Up string editing.</div>'
                : (buildUpFocusActive
                    ? '<div class="studio-list-empty">This Build Up string is not visible anymore. <button type="button" class="studio-focus-show-all-inline" data-studio-show-all-questions="true">Show All</button></div>'
                    : (focusModeActive
                        ? '<div class="studio-list-empty">Focused question is not visible anymore. <button type="button" class="studio-focus-show-all-inline" data-studio-show-all-questions="true">Show All</button></div>'
                        : (starredOnlyFilter && !query
                            ? '<div class="studio-list-empty">No starred questions in this quiz.</div>'
                            : '<div class="studio-list-empty">No questions match your search.</div>')));
            elements.studioQuestionList.innerHTML = emptyLabel;
            updateStudioQuestionNavigationUI();
            return;
        }
        const sharedDiagramSourceQuestionId = editingType === 'diagrams' ? getDiagramSharingSourceQuestionId(state.auth.studioDiagramSharing) : '';
        const buildUpEditorBannerHtml = buildUpEditActive
            ? `<div class="studio-build-up-editor-banner">
                <div><strong>Editing String:</strong> ${escapeHtml(activeBuildUpString)} <span>Add or remove multiple-choice questions below. Normal question order controls the Build Up order.</span></div>
                <button type="button" class="studio-build-up-done-btn" data-studio-build-up-clear="true">Done</button>
              </div>`
            : '';
        let rowsHtml = buildUpEditorBannerHtml + filteredQuestions.map((questionRow, filteredIndex) => {
            let index = displayRows.findIndex(question => question.id === questionRow.id);
            if (index === -1) index = filteredIndex;
            const isPendingRow = questionRow.id === STUDIO_PENDING_NEW_FLASHCARD_ID;
            const isLocalFlashcardRow = isStudioLocalFlashcardId(questionRow.id);
            const isUnsavedFlashcardRow = isPendingRow || isLocalFlashcardRow;
            const isActive = questionRow.id === state.auth.editingQuestionId || (isPendingRow && !state.auth.editingQuestionId && editingType === 'flashcard');
            const isInsertTarget = questionRow.id === state.auth.pendingInsertAfterQuestionId;
            const questionType = normalizeSheetText(questionRow.question_type || 'multiple_choice');
            const chipLabel = getStudioQuestionChipLabel(questionType, index);
            const navigationName = getStudioQuestionNavigationName(questionType, index);
            const previewLabel = getStudioQuestionPreviewLabel(questionRow, index).replace(/^(Q|H|C)\d+:\s*/, '').replace(/^Card \d+:\s*/, '');
            const isSharedDiagramSource = !!sharedDiagramSourceQuestionId && questionRow.id === sharedDiagramSourceQuestionId;
            const sharedDiagramSourceBadge = isSharedDiagramSource ? '<span class="studio-question-shared-source-badge">Shared source</span>' : '';
            const dragTitle = questionType === 'flashcard' ? 'Drag to reorder this card' : 'Drag to reorder this question';
            const questionBuildUpValue = getStudioQuestionBuildUpValue(questionRow);
            const stringFocusControlHtml = questionBuildUpValue && !buildUpEditActive && !focusModeActive
                ? `<button type="button" class="studio-question-focus-btn studio-question-focus-string-btn" data-studio-focus-build-up-string="${escapeHtml(questionBuildUpValue)}" title="Focus this Build Up string">String Focus</button>`
                : '';
            const focusControlHtml = (focusModeActive || buildUpFocusActive)
                ? `<span class="studio-question-focus-badge${buildUpFocusActive ? ' string-focus' : ''}">${buildUpFocusActive ? 'String Focus' : 'Focused'}</span><button type="button" class="studio-question-focus-btn" data-studio-show-all-questions="true">Show All</button>`
                : `<button type="button" class="studio-question-focus-btn" data-studio-focus-question-id="${escapeHtml(questionRow.id)}">Focus</button>${stringFocusControlHtml}`;
            const isStarredRow = !!questionRow.isStarred;
            const starBadgeHtml = isStarredRow
                ? '<span class="studio-question-list-star" title="Starred question" aria-label="Starred question">★</span>'
                : '';
            const isBuildUpQuestionRow = editingType === 'multiple_choice' && questionType === 'multiple_choice' && !isPendingRow && !isLocalFlashcardRow;
            const isActiveBuildUpMember = buildUpEditActive && isSameBuildUpString(questionBuildUpValue, activeBuildUpString);
            const isFocusedBuildUpMember = buildUpFocusActive && isSameBuildUpString(questionBuildUpValue, focusedBuildUpString);
            const isOtherBuildUpMember = buildUpEditActive && !!questionBuildUpValue && !isActiveBuildUpMember;
            const buildUpBadgeHtml = questionBuildUpValue
                ? `<span class="studio-build-up-badge${isActiveBuildUpMember ? ' active' : ''}" title="Build Up string: ${escapeHtml(questionBuildUpValue)}">String</span>`
                : '';
            const buildUpControlHtml = isBuildUpQuestionRow
                ? (buildUpEditActive
                    ? `<span class="studio-build-up-edit-actions" aria-label="Build Up string actions">
                        ${buildUpBadgeHtml}
                        <button type="button" class="studio-build-up-action-btn add" data-studio-build-up-add-question-id="${escapeHtml(questionRow.id)}" ${isActiveBuildUpMember || isOtherBuildUpMember ? 'disabled' : ''} title="${escapeHtml(isOtherBuildUpMember ? 'This question is already in another string' : (isActiveBuildUpMember ? 'Already in this string' : 'Add to this string'))}">Add</button>
                        <button type="button" class="studio-build-up-action-btn remove" data-studio-build-up-remove-question-id="${escapeHtml(questionRow.id)}" ${isActiveBuildUpMember ? '' : 'disabled'} title="${escapeHtml(isActiveBuildUpMember ? 'Remove from this string' : 'This question is not in this string')}">Remove</button>
                      </span>`
                    : `<button type="button" class="studio-build-up-string-btn${questionBuildUpValue ? ' has-string' : ''}" data-studio-build-up-string-question-id="${escapeHtml(questionRow.id)}" title="${escapeHtml(questionBuildUpValue ? `Edit Build Up string: ${questionBuildUpValue}` : 'Create a Build Up string from this question')}">${questionBuildUpValue ? 'Edit String' : 'String'}</button>${buildUpBadgeHtml}`)
                : '';

            let itemContent = '';
            if (editingType === 'flashcard' && questionType === 'flashcard') {
                const termValue = escapeHtml(normalizeSheetText(questionRow.term_plain || questionRow.prompt_plain || ''));
                const definitionValue = escapeHtml(normalizeSheetText(questionRow.definition_plain || ''));
                const termAttr = isPendingRow ? 'data-studio-pending-flashcard-term="true"' : `data-studio-flashcard-term-id="${escapeHtml(questionRow.id)}"`;
                const definitionAttr = isPendingRow ? 'data-studio-pending-flashcard-definition="true"' : `data-studio-flashcard-definition-id="${escapeHtml(questionRow.id)}"`;
                itemContent = `
                    <div class="studio-question-content-stack">
                      <div class="studio-question-focus-row">${focusControlHtml}${buildUpControlHtml}</div>
                      <div class="studio-flashcard-inline-fields">
                        <label class="studio-flashcard-inline-field">
                          <span>Term</span>
                          <textarea rows="2" ${termAttr} placeholder="Term">${termValue}</textarea>
                        </label>
                        <label class="studio-flashcard-inline-field">
                          <span>Definition</span>
                          <textarea rows="2" ${definitionAttr} placeholder="Definition">${definitionValue}</textarea>
                        </label>
                      </div>
                    </div>
                `;
            } else {
                itemContent = `
                    <div class="studio-question-content-stack">
                      <div class="studio-question-focus-row">${focusControlHtml}${buildUpControlHtml}</div>
                      <button
                        type="button"
                        class="studio-question-list-main"
                        data-studio-question-id="${escapeHtml(questionRow.id)}"
                        aria-pressed="${isActive ? 'true' : 'false'}"
                      >
                        <span class="studio-question-label">${escapeHtml(previewLabel)}</span>
                        ${sharedDiagramSourceBadge}
                      </button>
                    </div>
                `;
            }

            const rowDropAttr = isPendingRow ? '' : `data-studio-drop-question-id="${escapeHtml(questionRow.id)}"`;
            const handleAttrs = isUnsavedFlashcardRow || focusModeActive
                ? 'disabled'
                : `data-studio-drag-question-id="${escapeHtml(questionRow.id)}"`;
            const deleteAttrs = isPendingRow
                ? 'data-studio-discard-pending-card="true"'
                : (isLocalFlashcardRow ? `data-studio-discard-local-card="${escapeHtml(questionRow.id)}"` : `data-studio-delete-question-id="${escapeHtml(questionRow.id)}"`);
            const deleteLabel = isUnsavedFlashcardRow ? 'Discard new card' : `Delete ${navigationName}`;
            const deleteTitle = isUnsavedFlashcardRow ? 'Discard this unsaved card' : `Delete this ${questionType === 'flashcard' ? 'card' : 'question'}`;
            const insertLabel = questionType === 'flashcard' ? `Add a new card after ${navigationName}` : `Add a new question after ${navigationName}`;

            return `
                <div class="studio-question-list-row">
                  <div
                    class="studio-question-list-item${isActive ? ' active' : ''}${isStarredRow ? ' starred' : ''}${isActiveBuildUpMember || isFocusedBuildUpMember ? ' build-up-member' : ''}${state.auth.studioDraggingQuestionId === questionRow.id ? ' dragging' : ''}"
                    data-studio-row-question-id="${escapeHtml(questionRow.id)}"
                    ${isLocalFlashcardRow ? '' : rowDropAttr}
                  >
                    ${starBadgeHtml}
                    <div class="studio-question-row-controls" aria-label="${escapeHtml(navigationName)} controls">
                      <span class="studio-question-chip">${escapeHtml(chipLabel)}</span>
                      <button
                        type="button"
                        class="studio-question-row-handle"
                        ${handleAttrs}
                        title="${escapeHtml(focusModeActive ? 'Show all questions before reordering' : (isPendingRow ? 'Save the new card before reordering' : dragTitle))}"
                        aria-label="${escapeHtml(focusModeActive ? 'Show all questions before reordering' : (isPendingRow ? 'Save the new card before reordering' : dragTitle))}"
                      >☰</button>
                      <button
                        type="button"
                        class="studio-question-row-delete"
                        ${deleteAttrs}
                        aria-label="${escapeHtml(deleteLabel)}"
                        title="${escapeHtml(deleteTitle)}"
                      >🗑</button>
                    </div>
                    ${itemContent}
                  </div>
                  ${isPendingRow ? '' : `<div class="studio-question-insert-row">
                    <button
                      type="button"
                      class="studio-question-insert-btn${isInsertTarget ? ' active' : ''}"
                      data-studio-insert-after-question-id="${escapeHtml(questionRow.id)}"
                      aria-label="${escapeHtml(insertLabel)}"
                      title="Add a new ${questionType === 'flashcard' ? 'card' : 'question'} after this one"
                    >+</button>
                  </div>`}
                </div>
            `;
        }).join('');

        if (focusNewDraftActive) {
            const newItemLabel = editingType === 'flashcard' ? 'New Card' : 'New Question';
            rowsHtml = `
                <div class="studio-question-list-row">
                  <div class="studio-question-list-item active" data-studio-row-question-id="${STUDIO_FOCUS_NEW_QUESTION_ID}">
                    <div class="studio-question-row-controls" aria-label="${newItemLabel} controls">
                      <span class="studio-question-chip">New</span>
                    </div>
                    <div class="studio-question-content-stack">
                      <div class="studio-question-focus-row">
                        <span class="studio-question-focus-badge">Focused</span>
                        <button type="button" class="studio-question-focus-btn" data-studio-show-all-questions="true">Show All</button>
                      </div>
                      <div class="studio-question-label">${newItemLabel} is open in the editor below.</div>
                    </div>
                  </div>
                </div>
            `;
        }

        const addTailHtml = editingType === 'flashcard'
            ? `
                <div class="studio-question-tail-action studio-question-tail-actions">
                  <button type="button" class="auth-action-btn auth-secondary-btn studio-save-tail-btn" data-studio-save-tail-card="true">Save Changes</button>
                  <button type="button" class="auth-action-btn studio-add-tail-btn" data-studio-add-tail-card="true">Add Card</button>
                </div>
              `
            : '';

        elements.studioQuestionList.innerHTML = `${rowsHtml}${addTailHtml}`;
        autosizeStudioFlashcardInlineTextareas();
        updateStudioQuestionNavigationUI();
    }

    function clearStudioQuestionInputs(options = {}) {
        state.auth.expandedOptionImageRows.clear();
        state.auth.expandedClassifyCategoryImageRows.clear();
        state.auth.expandedClassifyItemImageRows.clear();
        state.auth.studioQuestionImagePanelOpen = false;
        if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = '';
        setLearningResourcesEditorHtml('', '');
        if (elements.createFlashcardTerm) elements.createFlashcardTerm.value = '';
        if (elements.createFlashcardDefinition) elements.createFlashcardDefinition.value = '';
        renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '', imageUrl: '', imageLabel: '' })));
        renderStudioHierarchyFields(Array.from({ length: 4 }, (_, index) => ({ text: '', position: index + 1 })));
        renderStudioClassifyFields(Array.from({ length: 2 }, (_, index) => ({ label: '', id: `class_${index + 1}` })), Array.from({ length: 2 }, () => ({ text: '', categoryId: 'class_1' })));
        if (getStudioCurrentQuizType() === 'diagrams' && state.auth.studioDiagramSharing?.useSharedImage && !state.auth.studioDiagramSharing?.questionOverride) {
            renderStudioDiagramLabels(state.auth.studioDiagramSharing.useSharedLabels ? state.auth.studioDiagramSharing.sharedLabels : []);
        } else {
            renderStudioDiagramLabels([]);
        }
        if (elements.createCorrectOptionSelect) elements.createCorrectOptionSelect.value = '1';
        if (elements.createCorrectExplanation) elements.createCorrectExplanation.value = '';
        state.auth.editingQuestionId = null;
        if (!options.keepPendingInsert) {
            state.auth.pendingInsertAfterQuestionId = null;
        }
        if (!options.keepPendingDraft) {
            state.auth.studioPendingNewQuestionRow = null;
        }
        if (getStudioCurrentQuizType() === 'diagrams' && state.auth.studioDiagramSharing?.useSharedImage && !state.auth.studioDiagramSharing?.questionOverride) {
            const sharedImageUrl = normalizeSheetText(state.auth.studioDiagramSharing.sharedImageUrl);
            setStudioQuestionImageState(sharedImageUrl, sharedImageUrl ? getSharedDiagramImageStatusLabel(state.auth.studioDiagramSharing) : 'No diagram image selected.');
        } else {
            setStudioQuestionImageState('', 'No question image selected.');
        }
        setStudioLearningResourcesImageState('', 'No learning resources image selected.');
        setStudioFlashcardTermImageState('', 'No term image selected.');
        setStudioFlashcardDefinitionImageState('', 'No definition image selected.');
        renderStudioQuestionList();
        updateCreateQuizModeUI();
        setStudioDirtyState(false);
        if (options.revealInList) {
            revealStudioQuestionInList(questionRow.id, { focusListButton: !!options.focusListButton });
        }
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
            .select('id, prompt_plain, question_type, sort_order, image_url')
            .eq('quiz_id', quizId)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        const rows = (data || []);
        const questionIds = rows.map(row => row.id).filter(Boolean);
        const flashcardQuestionIds = rows.filter(row => row.question_type === 'flashcard').map(row => row.id);
        const multipleChoiceQuestionIds = rows.filter(row => row.question_type === 'multiple_choice').map(row => row.id);
        const [flashcardDetails, multipleChoiceDetails, starredStateRows] = await Promise.all([
            flashcardQuestionIds.length ? loadFlashcardDetailsByQuestionIds(flashcardQuestionIds) : [],
            multipleChoiceQuestionIds.length ? loadMultipleChoiceDetailsByQuestionIds(multipleChoiceQuestionIds) : [],
            (questionIds.length && state.auth.user?.id)
                ? state.auth.client
                    .from('user_question_state')
                    .select('question_id, is_starred')
                    .eq('user_id', state.auth.user.id)
                    .in('question_id', questionIds)
                : Promise.resolve({ data: [], error: null })
        ]);
        if (starredStateRows?.error) throw starredStateRows.error;
        const flashcardMap = new Map((flashcardDetails || []).map(row => [row.question_id, row]));
        const multipleChoiceBuildUpMap = new Map((multipleChoiceDetails || []).map(row => [normalizeSheetText(row.question_id), getBuildUpValueFromOptionsJson(row.options_json)]));
        const starredMap = new Map((starredStateRows?.data || []).map(row => [normalizeSheetText(row.question_id), !!row.is_starred]));

        state.auth.studioQuizQuestions = rows.map(row => ({
            id: row.id,
            prompt_plain: normalizeSheetText(row.prompt_plain),
            term_plain: normalizeSheetText(flashcardMap.get(row.id)?.term_plain),
            term_html: normalizeSheetText(flashcardMap.get(row.id)?.term_html),
            definition_plain: normalizeSheetText(flashcardMap.get(row.id)?.definition_plain),
            definition_html: normalizeSheetText(flashcardMap.get(row.id)?.definition_html),
            question_type: normalizeSheetText(row.question_type || 'multiple_choice'),
            image_url: normalizeSheetText(row.image_url),
            sort_order: Number(row.sort_order ?? 0),
            buildUp: multipleChoiceBuildUpMap.get(normalizeSheetText(row.id)) || '',
            isStarred: !!starredMap.get(normalizeSheetText(row.id))
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
        if (isStudioLocalFlashcardId(questionId)) {
            loadStudioLocalFlashcardIntoEditor(questionId, options);
            return;
        }
        if (!options.force && questionId !== state.auth.editingQuestionId && state.auth.studioHasUnsavedChanges) {
            cacheCurrentStudioQuestionDraft();
        }

        const { data: questionRow, error: questionError } = await state.auth.client
            .from('questions')
            .select('id, prompt_html, prompt_plain, image_url, learning_resources_html, learning_resources_image_url, question_type')
            .eq('id', questionId)
            .maybeSingle();

        if (questionError) throw questionError;
        if (!questionRow) {
            clearStudioQuestionDraft(questionId);
            const fallbackQuestionId = !options.disableMissingQuestionFallback
                ? getStudioQuestionRowsSnapshot().find(question => normalizeSheetText(question?.id) !== normalizeSheetText(questionId))?.id
                : '';
            if (fallbackQuestionId) {
                console.warn('Studio question was missing during editor load; falling back to the next available question.', { missingQuestionId: questionId, fallbackQuestionId });
                await loadStudioQuestionIntoEditor(fallbackQuestionId, {
                    ...options,
                    force: true,
                    suppressStatus: true,
                    disableMissingQuestionFallback: true
                });
                if (!suppressStatus) {
                    setCreatorStatus('That question was no longer available, so the next available question was loaded.', 'neutral');
                }
                return;
            }
            throw new Error('Could not load that question into the editor.');
        }

        state.auth.editingQuestionId = questionRow.id;
        syncStudioQuestionFocusToEditor();
        state.auth.pendingInsertAfterQuestionId = null;
        state.auth.studioPendingNewQuestionRow = null;
        state.auth.editingQuizType = normalizeSheetText(questionRow.question_type || state.auth.editingQuizType || 'multiple_choice') || 'multiple_choice';
        state.auth.expandedOptionImageRows.clear();
        state.auth.expandedClassifyCategoryImageRows.clear();
        state.auth.expandedClassifyItemImageRows.clear();
        state.auth.studioQuestionImagePanelOpen = false;

        setLearningResourcesEditorHtml(questionRow.learning_resources_html, '');
        setStudioLearningResourcesImageState(
            normalizeSheetText(questionRow.learning_resources_image_url),
            normalizeSheetText(questionRow.learning_resources_image_url) ? 'Existing learning resources image saved.' : 'No learning resources image selected.'
        );

        if (state.auth.editingQuizType === 'flashcard') {
            const detailRow = await loadFlashcardDetailByQuestionId(questionId);
            if (!detailRow) {
                throw new Error('Could not load that flashcard into the editor.');
            }

            setFlashcardTermEditorHtml(detailRow.term_html, detailRow.term_plain);
            setFlashcardDefinitionEditorHtml(detailRow.definition_html, detailRow.definition_plain);
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
            renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '', imageUrl: '', imageLabel: '' })));
            renderStudioHierarchyFields(Array.from({ length: 4 }, (_, index) => ({ text: '', position: index + 1 })));
            renderStudioDiagramLabels([]);
            if (elements.createCorrectOptionSelect) elements.createCorrectOptionSelect.value = '1';
        } else if (state.auth.editingQuizType === 'hierarchy') {
            const detailRow = await loadHierarchyDetailByQuestionId(questionId);
            if (!detailRow) {
                throw new Error('Could not load that hierarchy question into the editor.');
            }

            if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = getStoredTextForDisplay(questionRow.prompt_plain, questionRow.prompt_html);
            renderStudioHierarchyFields(getHierarchyDraftsFromDetailRow(detailRow));
            renderStudioClassifyFields(Array.from({ length: 2 }, (_, index) => ({ label: '', id: `class_${index + 1}` })), Array.from({ length: 2 }, () => ({ text: '', categoryId: 'class_1' })));
            renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '', imageUrl: '', imageLabel: '' })));
            renderStudioDiagramLabels([]);
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
            renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '', imageUrl: '', imageLabel: '' })));
            renderStudioDiagramLabels([]);
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
        } else if (state.auth.editingQuizType === 'diagrams') {
            const detailRow = await loadMultipleChoiceDetailByQuestionId(questionId) || createEmptyMultipleChoiceDetailRow();
            const questionOverride = getDiagramQuestionOverrideFromDetailRow(detailRow);
            setStudioDiagramSharingState({ questionOverride });

            if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = getStoredTextForDisplay(questionRow.prompt_plain, questionRow.prompt_html);
            if (elements.createCorrectExplanation) elements.createCorrectExplanation.value = getStoredTextForDisplay('', detailRow.correct_explanation_html);
            const optionDrafts = getMultipleChoiceDraftsFromDetailRow(detailRow);
            renderStudioOptionFields(optionDrafts);
            renderStudioHierarchyFields(Array.from({ length: 4 }, (_, index) => ({ text: '', position: index + 1 })));
            renderStudioClassifyFields(Array.from({ length: 2 }, (_, index) => ({ label: '', id: `class_${index + 1}` })), Array.from({ length: 2 }, () => ({ text: '', categoryId: 'class_1' })));
            const questionDiagramLabels = getDiagramLabelsFromDetailRow(detailRow);
            const effectiveLabels = getEffectiveStudioDiagramLabels(questionDiagramLabels);
            renderStudioDiagramLabels(effectiveLabels);
            const savedCorrectAnswer = normalizeSheetText(detailRow.correct_answer);
            const correctIndex = Math.max(0, optionDrafts.findIndex(option => getOptionAnswerValue(option) === savedCorrectAnswer));
            if (elements.createCorrectOptionSelect) {
                elements.createCorrectOptionSelect.value = String(correctIndex + 1);
            }

            const effectiveDiagramImage = getEffectiveStudioDiagramImage(questionRow.image_url);
            setStudioQuestionImageState(
                effectiveDiagramImage,
                effectiveDiagramImage
                    ? (getDiagramSharingSourceQuestionId(state.auth.studioDiagramSharing) && !questionOverride ? getSharedDiagramImageStatusLabel(state.auth.studioDiagramSharing) : 'Existing diagram image saved.')
                    : 'No diagram image selected.'
            );
            setStudioFlashcardTermImageState('', 'No term image selected.');
            setStudioFlashcardDefinitionImageState('', 'No definition image selected.');
            if (elements.createFlashcardTerm) elements.createFlashcardTerm.value = '';
            if (elements.createFlashcardDefinition) elements.createFlashcardDefinition.value = '';
        } else {
            const detailRow = await loadMultipleChoiceDetailByQuestionId(questionId) || createEmptyMultipleChoiceDetailRow();

            if (elements.createQuestionPrompt) elements.createQuestionPrompt.value = getStoredTextForDisplay(questionRow.prompt_plain, questionRow.prompt_html);
            if (elements.createCorrectExplanation) elements.createCorrectExplanation.value = getStoredTextForDisplay('', detailRow.correct_explanation_html);
            const optionDrafts = getMultipleChoiceDraftsFromDetailRow(detailRow);
            renderStudioOptionFields(optionDrafts);
            renderStudioHierarchyFields(Array.from({ length: 4 }, (_, index) => ({ text: '', position: index + 1 })));
            renderStudioDiagramLabels([]);
            const savedCorrectAnswer = normalizeSheetText(detailRow.correct_answer);
            const correctIndex = Math.max(0, optionDrafts.findIndex(option => getOptionAnswerValue(option) === savedCorrectAnswer));
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
        const cachedDraft = options.skipDraftRestore ? null : state.auth.studioQuestionDrafts.get(questionRow.id);
        if (cachedDraft) {
            applyStudioQuestionDraft(cachedDraft);
            setStudioDirtyState(true);
        } else {
            setStudioDirtyState(hasStudioQuestionDrafts());
        }
        if (!suppressStatus) {
            const statusLabel = state.auth.editingQuizType === 'flashcard' ? 'Flashcard' : (state.auth.editingQuizType === 'hierarchy' ? 'Hierarchy question' : (state.auth.editingQuizType === 'classify' ? 'Classify question' : (state.auth.editingQuizType === 'diagrams' ? 'Diagram question' : 'Question')));
            setCreatorStatus(`${statusLabel} loaded into the editor.`, 'success');
        }
    }

    async function beginStudioNewQuestion(insertAfterQuestionId = null, options = {}) {
        if (state.auth.studioHasUnsavedChanges) {
            cacheCurrentStudioQuestionDraft();
        }
        if (!state.auth.editingQuizId) {
            setCreatorStatus('Click Save Changes first to create this quiz, then you can add more questions to it.', 'error');
            return;
        }

        const validInsertAfterQuestionId = insertAfterQuestionId && state.auth.studioQuizQuestions.some(question => question.id === insertAfterQuestionId)
            ? insertAfterQuestionId
            : null;

        if (isStudioQuestionFocusMode() || options.focusNewQuestion) {
            state.auth.studioFocusedBuildUpString = '';
            state.auth.studioFocusedQuestionId = STUDIO_FOCUS_NEW_QUESTION_ID;
            state.auth.studioQuestionSearchQuery = '';
            if (elements.studioQuestionSearchInput) {
                elements.studioQuestionSearchInput.value = '';
            }
        }
        clearStudioQuestionInputs({ keepPendingInsert: !!validInsertAfterQuestionId, keepPendingDraft: getStudioCurrentQuizType() === 'flashcard' });
        state.auth.pendingInsertAfterQuestionId = validInsertAfterQuestionId;
        state.auth.studioPendingNewQuestionRow = getStudioCurrentQuizType() === 'flashcard'
            ? { id: STUDIO_PENDING_NEW_FLASHCARD_ID, question_type: 'flashcard', prompt_plain: '', term_plain: '', term_html: '', definition_plain: '', definition_html: '' }
            : null;
        renderStudioQuestionList();
        updateCreateQuizModeUI();
        setStudioDirtyState(hasStudioQuestionDrafts());
        await setQuizStudioSection('editor');
        const nextItemLabel = getStudioCurrentQuizType() === 'flashcard' ? 'flashcard' : (getStudioCurrentQuizType() === 'hierarchy' ? 'hierarchy question' : (getStudioCurrentQuizType() === 'classify' ? 'classify question' : (getStudioCurrentQuizType() === 'diagrams' ? 'diagram question' : 'question')));
        if (validInsertAfterQuestionId) {
            setCreatorStatus(`Ready to insert a new ${nextItemLabel} between existing items. Fill in the fields below and save.`, 'success');
        } else {
            setCreatorStatus(`Ready to add a new ${nextItemLabel} to this quiz. Fill in the fields below and save.`, 'success');
        }
    }

    function updateStudioFlashcardDraft(questionId, field, value) {
        const questionRow = state.auth.studioQuizQuestions.find(question => question.id === questionId);
        if (!questionRow) return;

        if (field === 'term') {
            questionRow.term_plain = value;
            questionRow.prompt_plain = value;
            questionRow.term_html = buildStoredHtmlFromPlain(value);
            if (questionId === state.auth.editingQuestionId && elements.createFlashcardTerm) {
                elements.createFlashcardTerm.value = value;
            }
        } else if (field === 'definition') {
            questionRow.definition_plain = value;
            questionRow.definition_html = buildStoredHtmlFromPlain(value);
            if (questionId === state.auth.editingQuestionId && elements.createFlashcardDefinition) {
                elements.createFlashcardDefinition.value = value;
            }
        }

        setStudioDirtyState(true);
    }

    async function reorderStudioQuestionBeforeTarget(draggedQuestionId, targetQuestionId) {
        if (!state.auth.client || !draggedQuestionId || !targetQuestionId || draggedQuestionId === targetQuestionId) return;
        if (state.auth.studioHasUnsavedChanges) {
            cacheCurrentStudioQuestionDraft();
        }

        const orderedQuestionIds = state.auth.studioQuizQuestions.map(question => question.id);
        const draggedIndex = orderedQuestionIds.indexOf(draggedQuestionId);
        const targetIndex = orderedQuestionIds.indexOf(targetQuestionId);
        if (draggedIndex === -1 || targetIndex === -1) return;

        orderedQuestionIds.splice(draggedIndex, 1);
        const nextTargetIndex = orderedQuestionIds.indexOf(targetQuestionId);
        orderedQuestionIds.splice(nextTargetIndex, 0, draggedQuestionId);

        await reorderStudioQuizQuestionIds(orderedQuestionIds);
        await loadStudioQuestionListForQuiz(state.auth.editingQuizId);
        renderStudioQuestionList();
        setCreatorStatus('Question order updated.', 'success');
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

    async function handleDeleteStudioQuestion(questionId = state.auth.editingQuestionId) {
        if (!state.auth.client || !state.auth.editingQuizId || !questionId) {
            setCreatorStatus('Select a saved question first.', 'error');
            return;
        }

        const isDeletingCurrentQuestion = questionId === state.auth.editingQuestionId;
        if (state.auth.studioHasUnsavedChanges && !isDeletingCurrentQuestion) {
            cacheCurrentStudioQuestionDraft();
        }

        const sourceQuestionId = getDiagramSharingSourceQuestionId(state.auth.studioDiagramSharing);
        const isDeletingSharedDiagramSource = !!sourceQuestionId && sourceQuestionId === questionId;
        const deleteMessage = isDeletingSharedDiagramSource
            ? 'Delete this question from the quiz? This question controls the shared diagram. The shared source will move to the next Diagram question, or sharing will be removed if none remain.'
            : 'Delete this question from the quiz?';
        if (!confirm(deleteMessage)) {
            return;
        }

        const deletedQuestionId = questionId;
        const currentIndex = state.auth.studioQuizQuestions.findIndex(question => question.id === deletedQuestionId);

        const mediaRefsToDelete = await getQuestionMediaReferences(deletedQuestionId);

        const { error } = await state.auth.client
            .from('questions')
            .delete()
            .eq('id', deletedQuestionId);

        if (error) throw error;

        await loadStudioQuestionListForQuiz(state.auth.editingQuizId);
        if (isDeletingSharedDiagramSource) {
            await ensureSharedDiagramSourceQuestionForRows(state.auth.editingQuizId, state.auth.studioQuizQuestions);
        }
        await deleteSupabaseMediaReferences(mediaRefsToDelete, {
            protectedValue: state.auth.studioDiagramSharing?.useSharedImage ? state.auth.studioDiagramSharing : null
        });
        await refreshStudioManagementData();
        await refreshQuizCatalog({ selectQuizId: `sb:${state.auth.editingQuizId}`, loadSelectedQuiz: true, clearIfMissing: true });

        const shouldKeepCurrentSelection = state.auth.editingQuestionId && state.auth.editingQuestionId !== deletedQuestionId;
        const nextQuestion = shouldKeepCurrentSelection
            ? state.auth.studioQuizQuestions.find(question => question.id === state.auth.editingQuestionId)
            : (state.auth.studioQuizQuestions[currentIndex] || state.auth.studioQuizQuestions[currentIndex - 1] || null);

        if (nextQuestion) {
            await loadStudioQuestionIntoEditor(nextQuestion.id, { suppressStatus: true, force: true });
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
        if (state.auth.studioHasUnsavedChanges) {
            cacheCurrentStudioQuestionDraft();
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

    async function setQuizStudioSection(sectionName = 'home', options = {}) {
        const nextSection = ['home', 'folders', 'manage', 'backup', 'import', 'editor'].includes(sectionName)
            ? sectionName
            : 'home';

        if (!options.force && nextSection !== state.auth.currentStudioSection && state.auth.currentStudioSection === 'editor' && state.auth.studioHasUnsavedChanges) {
            const saved = await autosaveStudioChanges({ reason: `switch to the ${nextSection} section`, allowCreate: true });
            if (!saved) return false;
        }

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
        return true;
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
            elements.importSourceDestinationModeSelect,
            elements.importSourceAppendQuizSelect,
            elements.importTargetFolderSelect,
            elements.importSourceQuizBtn,
            elements.importEntireFolderSourceSelect,
            elements.importEntireFolderTargetSelect,
            elements.importSourceFolderBtn,
            elements.importTemplateSheetInput,
            elements.importTemplateTabInput,
            elements.importTemplateDestinationModeSelect,
            elements.importTemplateAppendQuizSelect,
            elements.importTemplateQuizNameInput,
            elements.importTemplateTargetFolderSelect,
            elements.importTemplateSheetBtn,
            elements.exportQuizSelect,
            elements.exportFolderSelect,
            elements.exportQuizBtn,
            elements.exportFolderBtn,
            elements.exportAllBtn,
            elements.importBackupFile,
            elements.previewBackupImportBtn,
            elements.importBackupBtn,
            elements.createQuizFolderSelect,
            elements.createQuizFolderNewBtn,
            elements.createQuizNewFolderName,
            elements.createQuizNewFolderCreateBtn,
            elements.createQuizNewFolderCancelBtn,
            elements.createQuizName,
            elements.createQuizTypeSelect,
            elements.studioQuestionSearchInput,
            elements.studioQuestionJumpInput,
            elements.studioQuestionJumpBtn,
            elements.studioStudyQuizBtn,
            elements.studioPrevQuestionBtn,
            elements.studioNextQuestionBtn,
            elements.studioPrevQuestionBottomBtn,
            elements.studioNextQuestionBottomBtn,
            elements.studioAddQuestionBtn,
            elements.studioAddQuestionBottomBtn,
            elements.studioDuplicateQuestionBtn,
            elements.studioDuplicateQuestionBottomBtn,
            elements.studioDeleteQuestionBtn,
            elements.studioMoveQuestionUpBtn,
            elements.studioMoveQuestionDownBtn,
            elements.createQuestionPrompt,
            elements.createQuestionImageToggleBtn,
            elements.createQuestionImageFile,
            elements.createQuestionImageClearBtn,
            elements.addHierarchyItemBtn,
            elements.removeHierarchyItemBtn,
            elements.addClassifyCategoryBtn,
            elements.removeClassifyCategoryBtn,
            elements.addClassifyItemBtn,
            elements.removeClassifyItemBtn,
            elements.addDiagramLabelBtn,
            elements.removeDiagramLabelBtn,
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
            elements.addOptionInlineBtn,
            elements.removeOptionFieldBtn,
            elements.studioEditorActionSaveBtn,
            elements.createCorrectOptionSelect,
            elements.createCorrectExplanation,
            elements.toggleMathChemToolsBtn,
            elements.createQuizBtn,
            elements.createQuizCancelEditBtn,
            elements.openQuizStudioBtn
        ].forEach(el => {
            if (!el) return;
            el.disabled = !creatorEnabled && el !== elements.openQuizStudioBtn;
        });

        elements.studioTemplateDownloadButtons.forEach(button => {
            button.disabled = !creatorEnabled;
        });

        elements.createLearningResourcesRichControls.forEach(control => {
            control.disabled = !creatorEnabled;
        });

        elements.flashcardRichControls.forEach(control => {
            control.disabled = !creatorEnabled;
        });

        elements.studioMathChemControls.forEach(control => {
            control.disabled = !creatorEnabled;
        });

        if (elements.createLearningResources) {
            elements.createLearningResources.setAttribute('contenteditable', creatorEnabled ? 'true' : 'false');
            elements.createLearningResources.classList.toggle('disabled', !creatorEnabled);
        }

        [elements.createFlashcardTerm, elements.createFlashcardDefinition].forEach(editorEl => {
            if (!editorEl) return;
            editorEl.setAttribute('contenteditable', creatorEnabled ? 'true' : 'false');
            editorEl.classList.toggle('disabled', !creatorEnabled);
        });

        if (elements.createOptionFieldsContainer) {
            elements.createOptionFieldsContainer.querySelectorAll('input, textarea, button').forEach(el => {
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

        if (elements.diagramLabelList) {
            elements.diagramLabelList.querySelectorAll('input, button').forEach(el => {
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
        populateExportBackupControls();
        renderStudioQuestionList();
    }

    function clearCreatorInputs(options = {}) {
        const keepFolderSelection = !!options.keepFolderSelection;
        if (elements.createFolderName) elements.createFolderName.value = '';
        if (elements.createQuizName) elements.createQuizName.value = '';
        if (!keepFolderSelection && elements.createQuizFolderSelect) {
            elements.createQuizFolderSelect.value = '';
        }
        state.auth.studioQuestionSearchQuery = '';
        state.auth.studioQuestionStarredOnly = false;
        state.auth.studioActiveBuildUpString = '';
        state.auth.studioFocusedBuildUpString = '';
        state.auth.studioFocusedQuestionId = '';
        if (elements.studioQuestionSearchInput) elements.studioQuestionSearchInput.value = '';
        syncStudioQuestionStarredFilterButton();
        if (elements.studioQuestionJumpInput) elements.studioQuestionJumpInput.value = '';
        setEditorInlineFolderCreatorOpen(false);

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

    function getStudioQuizMetaDraft() {
        return {
            name: normalizeSheetText(elements.createQuizName?.value),
            folderId: normalizeSheetText(elements.createQuizFolderSelect?.value) || null,
            quizType: getStudioCurrentQuizType()
        };
    }

    function isCurrentStudioQuestionBlank() {
        const quizType = getStudioCurrentQuizType();
        const hasLearningResourceImage = !!normalizeSheetText(state.auth.studioLearningResourcesImageDataUrl);
        const hasLearningResources = !!getLearningResourcesEditorPlain() || hasLearningResourceImage;

        if (quizType === 'flashcard') {
            return !normalizeSheetText(elements.createFlashcardTerm?.value)
                && !normalizeSheetText(elements.createFlashcardDefinition?.value)
                && !normalizeSheetText(state.auth.studioFlashcardTermImageDataUrl)
                && !normalizeSheetText(state.auth.studioFlashcardDefinitionImageDataUrl)
                && !hasLearningResources;
        }

        if (quizType === 'hierarchy') {
            return !normalizeSheetText(elements.createQuestionPrompt?.value)
                && !normalizeSheetText(state.auth.studioQuestionImageDataUrl)
                && !hasLearningResources
                && !getStudioHierarchyDraftsFromDOM().some(draft => normalizeSheetText(draft.text));
        }

        if (quizType === 'classify') {
            const categories = getStudioClassifyCategoriesDraftsFromDOM();
            const items = getStudioClassifyItemsDraftsFromDOM(categories);
            return !normalizeSheetText(elements.createQuestionPrompt?.value)
                && !normalizeSheetText(state.auth.studioQuestionImageDataUrl)
                && !hasLearningResources
                && !categories.some(category => normalizeSheetText(category.label) || normalizeSheetText(category.imageUrl))
                && !items.some(item => normalizeSheetText(item.text) || normalizeSheetText(item.imageUrl));
        }

        if (quizType === 'diagrams') {
            return !normalizeSheetText(elements.createQuestionPrompt?.value)
                && !normalizeSheetText(elements.createCorrectExplanation?.value)
                && !normalizeSheetText(state.auth.studioQuestionImageDataUrl)
                && !hasLearningResources
                && !getStudioDiagramLabelsFromDOM().some(label => normalizeSheetText(label.label))
                && !getStudioOptionDraftsFromDOM().some(option => normalizeSheetText(option.text) || normalizeSheetText(option.explanation) || normalizeSheetText(option.imageUrl));
        }

        return !normalizeSheetText(elements.createQuestionPrompt?.value)
            && !normalizeSheetText(elements.createCorrectExplanation?.value)
            && !normalizeSheetText(state.auth.studioQuestionImageDataUrl)
            && !hasLearningResources
            && !getStudioOptionDraftsFromDOM().some(option => normalizeSheetText(option.text) || normalizeSheetText(option.explanation) || normalizeSheetText(option.imageUrl));
    }

    function isCurrentStudioQuestionReadyToSave() {
        const quizType = getStudioCurrentQuizType();

        if (quizType === 'flashcard') {
            return !!normalizeSheetText(elements.createFlashcardTerm?.value)
                && !!normalizeSheetText(elements.createFlashcardDefinition?.value);
        }

        if (quizType === 'hierarchy') {
            const prompt = normalizeAuthoredMathChemText(elements.createQuestionPrompt?.value);
            const hierarchyDrafts = getStudioHierarchyDraftsFromDOM();
            const itemTexts = hierarchyDrafts.map(draft => normalizeSheetText(draft.text)).filter(Boolean);
            const positions = hierarchyDrafts.map(draft => Number(draft.position));
            return !!prompt
                && itemTexts.length >= 2
                && new Set(itemTexts).size === itemTexts.length
                && !positions.some(position => !Number.isInteger(position) || position < 1 || position > hierarchyDrafts.length)
                && new Set(positions).size === positions.length;
        }

        if (quizType === 'classify') {
            const categories = getStudioClassifyCategoriesDraftsFromDOM();
            const items = getStudioClassifyItemsDraftsFromDOM(categories);
            const categoryLabels = categories.map(category => normalizeSheetText(category.label));
            const itemTexts = items.map(item => normalizeSheetText(item.text));
            return !!normalizeSheetText(elements.createQuestionPrompt?.value)
                && !categories.some(category => !normalizeSheetText(category.label) && !normalizeSheetText(category.imageUrl))
                && new Set(categoryLabels.filter(Boolean)).size === categoryLabels.filter(Boolean).length
                && !items.some(item => !normalizeSheetText(item.text) && !normalizeSheetText(item.imageUrl))
                && new Set(itemTexts.filter(Boolean)).size === itemTexts.filter(Boolean).length
                && !items.some(item => !categories.some(category => category.id === item.categoryId));
        }

        if (quizType === 'diagrams') {
            const optionDrafts = getStudioOptionDraftsFromDOM();
            const optionAnswerValues = optionDrafts.map(getOptionAnswerValue);
            const maxOptionIndex = Math.max(0, optionDrafts.length - 1);
            const correctIndex = Math.max(0, Math.min(maxOptionIndex, Number(elements.createCorrectOptionSelect?.value || '1') - 1));
            const labels = getStudioDiagramLabelsFromDOM();
            return !!normalizeSheetText(elements.createQuestionPrompt?.value)
                && optionDrafts.length >= 2
                && !optionAnswerValues.some(value => !value)
                && new Set(optionAnswerValues).size === optionAnswerValues.length
                && !!optionAnswerValues[correctIndex];
        }

        const optionDrafts = getStudioOptionDraftsFromDOM();
        const optionAnswerValues = optionDrafts.map(getOptionAnswerValue);
        const maxOptionIndex = Math.max(0, optionDrafts.length - 1);
        const correctIndex = Math.max(0, Math.min(maxOptionIndex, Number(elements.createCorrectOptionSelect?.value || '1') - 1));
        return !!normalizeSheetText(elements.createQuestionPrompt?.value)
            && optionDrafts.length >= 2
            && !optionAnswerValues.some(value => !value)
            && new Set(optionAnswerValues).size === optionAnswerValues.length
            && !!optionAnswerValues[correctIndex];
    }

    async function saveQuizShellFromEditor(options = {}) {
        if (!state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before creating or editing a quiz.', 'error');
            return '';
        }

        const { name, folderId, quizType } = getStudioQuizMetaDraft();
        if (!name) {
            setCreatorStatus('Enter a quiz name first.', 'error');
            return '';
        }

        if (state.auth.editingQuizId) {
            const { error } = await state.auth.client
                .from('quizzes')
                .update({ folder_id: folderId, name })
                .eq('id', state.auth.editingQuizId);
            if (error) throw error;
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${state.auth.editingQuizId}`, loadSelectedQuiz: elements.quizSelector?.value === `sb:${state.auth.editingQuizId}` });
            return state.auth.editingQuizId;
        }

        if (!options.quiet) {
            setCreatorStatus('Creating quiz...');
        }

        const quizSortOrder = await getNextQuizSortOrder(folderId);
        const { data, error } = await state.auth.client
            .from('quizzes')
            .insert({
                user_id: state.auth.user.id,
                folder_id: folderId,
                name,
                description: '',
                sort_order: quizSortOrder,
                is_archived: false
            })
            .select('id')
            .single();
        if (error) throw error;

        state.auth.editingQuizId = data.id;
        state.auth.editingQuizType = quizType;
        state.auth.pendingInsertAfterQuestionId = null;
        if (elements.createQuizTypeSelect) {
            elements.createQuizTypeSelect.value = quizType;
        }

        await refreshStudioManagementData();
        await refreshQuizCatalog({ selectQuizId: `sb:${data.id}`, loadSelectedQuiz: false });
        updateCreateQuizModeUI();
        return data.id;
    }

    function getUserDisplayName() {
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
            setAuthStatus('Supabase connected. Sign in to use Study Bunny or create an account.');
        }

        if (elements.authEmail) {
            elements.authEmail.disabled = !configured || signedIn;
            if (signedIn) elements.authEmail.value = normalizeSheetText(state.auth.user?.email);
        }

        if (elements.authPassword) {
            elements.authPassword.disabled = !configured || signedIn;
            if (signedIn) elements.authPassword.value = '';
        }

        [elements.authSignInBtn, elements.authSignUpBtn].forEach(el => {
            if (!el) return;
            el.disabled = !configured || signedIn;
        });

        if (elements.authSignOutBtn) {
            elements.authSignOutBtn.disabled = !configured || !signedIn;
        }

        renderStudioHomeDashboard();
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
        setQuizStudioSection(sectionName, { force: true }).catch(err => {
            console.error(err);
            setCreatorStatus('Could not open Quiz Studio section.', 'error');
        });
        syncBodyScrollLock();
        updateCreatorUI();
        updateStudioUnsavedChangesIndicator();
    }

    async function closeQuizStudioPage(force = false) {
        if (!elements.quizStudioPage) return true;
        if (!force && state.auth.studioHasUnsavedChanges) {
            const saved = await autosaveStudioChanges({ reason: 'close Quiz Studio', allowCreate: true });
            if (!saved) return false;
        }
        elements.quizStudioPage.classList.add('hidden');
        elements.quizStudioPage.setAttribute('aria-hidden', 'true');
        state.auth.quizStudioOpen = false;
        syncBodyScrollLock();
        return true;
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

    async function fetchAllSupabaseRows(buildQuery, options = {}) {
        const pageSize = Number(options.pageSize || 1000);
        const label = normalizeSheetText(options.label || 'Supabase rows');
        const maxRows = Number(options.maxRows || 50000);
        const rows = [];
        let from = 0;

        while (true) {
            const to = from + pageSize - 1;
            const { data, error } = await buildQuery().range(from, to);
            if (error) throw error;

            const pageRows = Array.isArray(data) ? data : [];
            rows.push(...pageRows);

            if (pageRows.length < pageSize) break;
            from += pageSize;
            if (rows.length >= maxRows) {
                throw new Error(`${label} exceeded the safe read limit of ${maxRows}.`);
            }
        }

        return rows;
    }

    async function refreshQuizCatalog(options = {}) {
        const previousQuizId = elements.quizSelector?.value || '';
        const targetQuizId = options.selectQuizId || previousQuizId;

        await populateFolderDropdown();

        const targetQuiz = getQuizBySelectorValue(targetQuizId);
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
            elements.quizSelector.value = encodeQuizSelectorValue(targetQuiz);
        }

        if (options.loadSelectedQuiz) {
            await loadSelectedQuiz(targetQuiz.id);
        }

        return targetQuiz;
    }

    async function studySupabaseQuizFromStudio(quizId) {
        const normalizedQuizId = normalizeSheetText(quizId);
        if (!normalizedQuizId) return null;

        if (!state.auth.user?.id) {
            setCreatorStatus('Sign in before studying a quiz.', 'error');
            return null;
        }

        if (state.auth.studioHasUnsavedChanges) {
            const saved = await autosaveStudioChanges({ reason: 'study this quiz', allowCreate: true });
            if (!saved) return null;
        }

        const targetQuiz = await refreshQuizCatalog({ selectQuizId: `sb:${normalizedQuizId}`, loadSelectedQuiz: true });
        if (!targetQuiz) {
            throw new Error('Quiz not found');
        }

        await recordStudioQuizActivity(normalizedQuizId, 'studied');
        await closeQuizStudioPage(true);
        return targetQuiz;
    }


    // ================= QUIZ STUDIO BACKUP EXPORTS / SAFE IMPORTS =================
    // Phase 20A exports read-only JSON backups. Phase 20B imports those backups
    // as new copies only; it must not overwrite, merge, or delete existing rows.
    function getBackupDateStamp() {
        return new Date().toISOString().slice(0, 10);
    }

    function getBackupSlug(value, fallback = 'backup') {
        const normalized = normalizeSheetText(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
        return normalized || fallback;
    }

    function cloneJsonSafe(value) {
        if (value === undefined) return null;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value;
        }
    }

    function normalizeBackupIdList(value) {
        if (value == null) return [];

        const source = Array.isArray(value)
            ? value
            : (typeof value !== 'string' && typeof value[Symbol.iterator] === 'function'
                ? Array.from(value)
                : [value]);

        return Array.from(new Set(source.map(normalizeSheetText).filter(Boolean)));
    }

    function downloadJsonFile(payload, filename) {
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function loadQuizRowsForBackup(quizIds) {
        const safeQuizIds = normalizeBackupIdList(quizIds);
        if (!state.auth.client || !safeQuizIds.length) return [];

        let result = await state.auth.client
            .from('quizzes')
            .select('id, folder_id, name, description, sort_order, is_archived, updated_at')
            .in('id', safeQuizIds);

        if (result.error && /updated_at/i.test(result.error.message || '')) {
            result = await state.auth.client
                .from('quizzes')
                .select('id, folder_id, name, description, sort_order, is_archived')
                .in('id', safeQuizIds);
        }

        if (result.error) throw result.error;

        const managedOrder = new Map(state.auth.managedQuizzes.map((quiz, index) => [quiz.id, index]));
        return (result.data || []).sort((a, b) => {
            const aIndex = managedOrder.has(a.id) ? managedOrder.get(a.id) : Number.MAX_SAFE_INTEGER;
            const bIndex = managedOrder.has(b.id) ? managedOrder.get(b.id) : Number.MAX_SAFE_INTEGER;
            if (aIndex !== bIndex) return aIndex - bIndex;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
    }

    async function loadQuestionRowsForBackup(quizIds) {
        const safeQuizIds = normalizeBackupIdList(quizIds);
        if (!state.auth.client || !safeQuizIds.length) return [];

        const { data, error } = await state.auth.client
            .from('questions')
            .select('id, quiz_id, prompt_html, prompt_plain, image_url, learning_resources_html, learning_resources_image_url, question_type, sort_order')
            .in('quiz_id', safeQuizIds)
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    async function loadQuestionStateRowsForBackup(questionIds) {
        const safeQuestionIds = normalizeBackupIdList(questionIds);
        if (!state.auth.client || !state.auth.user?.id || !safeQuestionIds.length) return [];

        const { data, error } = await state.auth.client
            .from('user_question_state')
            .select('question_id, is_starred')
            .eq('user_id', state.auth.user.id)
            .in('question_id', safeQuestionIds);

        if (error) {
            console.error('Could not include starred-question state in backup:', error);
            return [];
        }
        return data || [];
    }

    async function loadMediaAssetRowsForBackup(refs) {
        const assetIds = Array.from(new Set(Array.from(refs || []).map(getSupabaseMediaAssetId).filter(Boolean)));
        if (!state.auth.client || !assetIds.length) return [];

        let result = await state.auth.client
            .from('media_assets')
            .select('id, bucket_name, object_path, original_name, mime_type, size_bytes, quiz_id, question_id, usage_context, created_at, updated_at')
            .in('id', assetIds);

        if (result.error && /created_at|updated_at/i.test(result.error.message || '')) {
            result = await state.auth.client
                .from('media_assets')
                .select('id, bucket_name, object_path, original_name, mime_type, size_bytes, quiz_id, question_id, usage_context')
                .in('id', assetIds);
        }

        if (result.error) {
            console.error('Could not include media asset metadata in backup:', result.error);
            return [];
        }

        const idOrder = new Map(assetIds.map((id, index) => [id, index]));
        return (result.data || []).sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
    }

    function createBackupFolderRows(folderIds) {
        const safeFolderIds = new Set(normalizeBackupIdList(folderIds));
        return state.auth.supabaseFolders
            .filter(folder => safeFolderIds.has(folder.id))
            .sort(sortStudioRecentItems)
            .map(folder => ({
                id: folder.id,
                name: folder.name,
                sort_order: Number(folder.sort_order ?? 0),
                updated_at: normalizeSheetText(folder.updatedAt)
            }));
    }

    function createQuestionDetailBackup(questionRow, detailMaps) {
        const questionType = normalizeSheetText(questionRow.question_type || 'multiple_choice') || 'multiple_choice';
        const detailMap = detailMaps[questionType] || new Map();
        const detailRow = detailMap.get(questionRow.id) || null;
        return cloneJsonSafe(detailRow);
    }

    async function buildStudyBunnyBackupPayload(options = {}) {
        if (!state.auth.client || !state.auth.user?.id) {
            throw new Error('Sign in before exporting backups.');
        }

        const scope = options.scope || 'all';
        const requestedQuizIds = normalizeBackupIdList(options.quizIds);
        const requestedFolderIds = normalizeBackupIdList(options.folderIds);
        const quizRows = await loadQuizRowsForBackup(requestedQuizIds);
        const quizIds = quizRows.map(quiz => quiz.id);
        const questionRows = await loadQuestionRowsForBackup(quizIds);
        const questionIds = questionRows.map(question => question.id);

        const questionIdsByType = questionRows.reduce((groups, question) => {
            const type = normalizeSheetText(question.question_type || 'multiple_choice') || 'multiple_choice';
            if (!groups[type]) groups[type] = [];
            groups[type].push(question.id);
            return groups;
        }, {});

        const multipleChoiceBackupIds = [
            ...(questionIdsByType.multiple_choice || []),
            ...(questionIdsByType.diagrams || [])
        ];
        const [multipleChoiceDetails, flashcardDetails, hierarchyDetails, classifyDetails, questionStateRows] = await Promise.all([
            loadMultipleChoiceDetailsByQuestionIds(multipleChoiceBackupIds),
            loadFlashcardDetailsByQuestionIds(questionIdsByType.flashcard || []),
            loadHierarchyDetailsByQuestionIds(questionIdsByType.hierarchy || []),
            loadClassifyDetailsByQuestionIds(questionIdsByType.classify || []),
            loadQuestionStateRowsForBackup(questionIds)
        ]);

        const detailMaps = {
            multiple_choice: new Map((multipleChoiceDetails || []).map(row => [row.question_id, row])),
            diagrams: new Map((multipleChoiceDetails || []).map(row => [row.question_id, row])),
            flashcard: new Map((flashcardDetails || []).map(row => [row.question_id, row])),
            hierarchy: new Map((hierarchyDetails || []).map(row => [row.question_id, row])),
            classify: new Map((classifyDetails || []).map(row => [row.question_id, row]))
        };
        const stateMap = new Map((questionStateRows || []).map(row => [row.question_id, row]));
        const questionsByQuiz = new Map();
        const allMediaRefs = new Set();

        questionRows.forEach(questionRow => {
            const detail = createQuestionDetailBackup(questionRow, detailMaps);
            const questionState = stateMap.get(questionRow.id) || null;
            const mediaRefs = new Set();
            collectSupabaseMediaReferences(questionRow.image_url, mediaRefs);
            collectSupabaseMediaReferences(questionRow.learning_resources_image_url, mediaRefs);
            collectSupabaseMediaReferences(detail, mediaRefs);
            mediaRefs.forEach(ref => allMediaRefs.add(ref));

            const backupQuestion = {
                id: questionRow.id,
                quiz_id: questionRow.quiz_id,
                question_type: normalizeSheetText(questionRow.question_type || 'multiple_choice') || 'multiple_choice',
                sort_order: Number(questionRow.sort_order ?? 0),
                prompt_plain: normalizeSheetText(questionRow.prompt_plain),
                prompt_html: normalizeSheetText(questionRow.prompt_html),
                image_url: normalizeSheetText(questionRow.image_url),
                learning_resources_html: normalizeSheetText(questionRow.learning_resources_html),
                learning_resources_image_url: normalizeSheetText(questionRow.learning_resources_image_url),
                detail,
                question_state: questionState ? { is_starred: !!questionState.is_starred } : null,
                media_references: Array.from(mediaRefs)
            };

            if (!questionsByQuiz.has(questionRow.quiz_id)) questionsByQuiz.set(questionRow.quiz_id, []);
            questionsByQuiz.get(questionRow.quiz_id).push(backupQuestion);
        });

        const folderIds = new Set(requestedFolderIds);
        quizRows.forEach(quiz => {
            if (quiz.folder_id) folderIds.add(quiz.folder_id);
            collectQuizDescriptionMediaReferences(quiz.description, allMediaRefs);
        });
        const folderRows = createBackupFolderRows(folderIds);
        const folderMap = new Map(folderRows.map(folder => [folder.id, folder]));
        const managedQuizMap = new Map(state.auth.managedQuizzes.map(quiz => [quiz.id, quiz]));

        const quizzes = quizRows.map(quiz => {
            const questions = (questionsByQuiz.get(quiz.id) || []).sort((a, b) => a.sort_order - b.sort_order);
            const managedQuiz = managedQuizMap.get(quiz.id) || null;
            return {
                id: quiz.id,
                folder_id: quiz.folder_id || null,
                folder_name: folderMap.get(quiz.folder_id)?.name || managedQuiz?.folderName || '',
                name: normalizeSheetText(quiz.name),
                description: normalizeSheetText(quiz.description),
                sort_order: Number(quiz.sort_order ?? 0),
                is_archived: !!quiz.is_archived,
                updated_at: normalizeSheetText(quiz.updated_at || managedQuiz?.updatedAt),
                quiz_type: managedQuiz?.quizType || (questions[0]?.question_type || 'multiple_choice'),
                type_label: managedQuiz?.typeLabel || '',
                question_count: questions.length,
                questions
            };
        });

        const mediaAssets = await loadMediaAssetRowsForBackup(allMediaRefs);
        const starredCount = Array.from(stateMap.values()).filter(row => !!row.is_starred).length;

        return {
            format: 'study-bunny-supabase-json',
            version: 1,
            phase: '20A-export-only',
            scope,
            exported_at: new Date().toISOString(),
            exported_by: normalizeSheetText(state.auth.user?.email),
            notes: [
                'This backup is export-only JSON. It does not change Supabase.',
                'Private Supabase Storage images are included as sb-media references and media_assets metadata, not copied image files.',
                'Restore/import from this backup should be handled by a later migration-safe phase.'
            ],
            summary: {
                folder_count: folderRows.length,
                quiz_count: quizzes.length,
                question_count: questionRows.length,
                starred_question_count: starredCount,
                media_asset_count: mediaAssets.length
            },
            folders: folderRows,
            quizzes,
            media_assets: mediaAssets.map(cloneJsonSafe)
        };
    }

    async function exportQuizBackup() {
        if (state.auth.studioHasUnsavedChanges) {
            const saved = await autosaveStudioChanges({ reason: 'export this quiz backup', allowCreate: true });
            if (!saved) return;
        }
        const quizId = normalizeSheetText(elements.exportQuizSelect?.value);
        if (!quizId) {
            setCreatorStatus('Choose a quiz to export.', 'error');
            return;
        }
        const quiz = state.auth.managedQuizzes.find(item => item.id === quizId);
        if (!quiz) {
            setCreatorStatus('Could not find that quiz.', 'error');
            return;
        }

        setCreatorStatus('Preparing quiz backup...', 'neutral');
        const payload = await buildStudyBunnyBackupPayload({ scope: 'quiz', quizIds: [quizId] });
        downloadJsonFile(payload, `study-bunny-quiz-${getBackupSlug(quiz.name, 'quiz')}-${getBackupDateStamp()}.json`);
        setCreatorStatus('Quiz backup downloaded.', 'success');
    }

    async function exportFolderBackup() {
        if (state.auth.studioHasUnsavedChanges) {
            const saved = await autosaveStudioChanges({ reason: 'export this folder backup', allowCreate: true });
            if (!saved) return;
        }
        const folderId = normalizeSheetText(elements.exportFolderSelect?.value);
        if (!folderId) {
            setCreatorStatus('Choose a folder to export.', 'error');
            return;
        }
        const folder = state.auth.supabaseFolders.find(item => item.id === folderId);
        if (!folder) {
            setCreatorStatus('Could not find that folder.', 'error');
            return;
        }

        const quizIds = state.auth.managedQuizzes
            .filter(quiz => quiz.folderId === folderId)
            .map(quiz => quiz.id);

        setCreatorStatus('Preparing folder backup...', 'neutral');
        const payload = await buildStudyBunnyBackupPayload({ scope: 'folder', folderIds: [folderId], quizIds });
        downloadJsonFile(payload, `study-bunny-folder-${getBackupSlug(folder.name, 'folder')}-${getBackupDateStamp()}.json`);
        setCreatorStatus('Folder backup downloaded.', 'success');
    }

    async function exportAllBackup() {
        if (state.auth.studioHasUnsavedChanges) {
            const saved = await autosaveStudioChanges({ reason: 'export the full backup', allowCreate: true });
            if (!saved) return;
        }
        const quizIds = state.auth.managedQuizzes.map(quiz => quiz.id);
        const folderIds = state.auth.supabaseFolders.map(folder => folder.id);
        if (!quizIds.length && !folderIds.length) {
            setCreatorStatus('There is no Supabase library content to export yet.', 'error');
            return;
        }

        setCreatorStatus('Preparing full library backup...', 'neutral');
        const payload = await buildStudyBunnyBackupPayload({ scope: 'all', folderIds, quizIds });
        downloadJsonFile(payload, `study-bunny-full-backup-${getBackupDateStamp()}.json`);
        setCreatorStatus('Full library backup downloaded.', 'success');
    }

    function getBackupImportArrays(payload = {}) {
        return {
            folders: Array.isArray(payload.folders) ? payload.folders : [],
            quizzes: Array.isArray(payload.quizzes) ? payload.quizzes : [],
            mediaAssets: Array.isArray(payload.media_assets) ? payload.media_assets : []
        };
    }

    function normalizeBackupJsonArray(value) {
        if (Array.isArray(value)) return cloneJsonSafe(value);
        if (typeof value === 'string' && normalizeSheetText(value)) {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                return [];
            }
        }
        return [];
    }

    function validateBackupImportPayload(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('Choose a valid Study Bunny JSON backup file.');
        }
        if (normalizeSheetText(payload.format) !== 'study-bunny-supabase-json') {
            throw new Error('This does not look like a Study Bunny Supabase JSON backup.');
        }
        const version = Number(payload.version || 0);
        if (!Number.isFinite(version) || version < 1) {
            throw new Error('This backup version is not supported.');
        }
        const { folders, quizzes } = getBackupImportArrays(payload);
        if (!folders.length && !quizzes.length) {
            throw new Error('This backup does not contain any folders or quizzes to import.');
        }
        quizzes.forEach((quiz, quizIndex) => {
            if (!quiz || typeof quiz !== 'object') {
                throw new Error(`Quiz backup item ${quizIndex + 1} is invalid.`);
            }
            if (!Array.isArray(quiz.questions)) {
                throw new Error(`The quiz "${normalizeSheetText(quiz.name) || quizIndex + 1}" is missing its questions array.`);
            }
        });
        return payload;
    }

    function getBackupImportSummary(payload = {}) {
        const { folders, quizzes, mediaAssets } = getBackupImportArrays(payload);
        const questionCount = quizzes.reduce((total, quiz) => total + (Array.isArray(quiz.questions) ? quiz.questions.length : 0), 0);
        const starredCount = quizzes.reduce((total, quiz) => {
            const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
            return total + questions.filter(question => !!question?.question_state?.is_starred).length;
        }, 0);
        const mediaRefs = collectSupabaseMediaReferences(payload);
        return {
            folderCount: folders.length,
            quizCount: quizzes.length,
            questionCount,
            starredCount,
            mediaReferenceCount: mediaRefs.size,
            mediaAssetCount: mediaAssets.length
        };
    }

    function resetBackupImportState(message = 'Choose a backup file to preview before importing.') {
        state.auth.backupImportPayload = null;
        state.auth.backupImportFileName = '';
        if (elements.importBackupPreview) {
            elements.importBackupPreview.textContent = message;
            elements.importBackupPreview.classList.remove('is-error', 'is-success');
        }
        populateExportBackupControls();
    }

    function renderBackupImportPreview(payload, fileName = '') {
        const summary = getBackupImportSummary(payload);
        if (!elements.importBackupPreview) return;
        elements.importBackupPreview.classList.remove('is-error');
        elements.importBackupPreview.classList.add('is-success');
        elements.importBackupPreview.innerHTML = `
            <div class="studio-backup-preview-title">Ready to import as a new copy</div>
            <div class="studio-backup-preview-note">${escapeHtml(fileName || 'Selected backup')} will create new folders/quizzes only. Existing content will not be overwritten or deleted.</div>
            <div class="studio-progress-grid studio-backup-summary-grid">
              <div class="studio-progress-card"><span>Folders</span><strong>${summary.folderCount}</strong></div>
              <div class="studio-progress-card"><span>Quizzes</span><strong>${summary.quizCount}</strong></div>
              <div class="studio-progress-card"><span>Questions</span><strong>${summary.questionCount}</strong></div>
              <div class="studio-progress-card"><span>Starred</span><strong>${summary.starredCount}</strong></div>
              <div class="studio-progress-card"><span>Media refs</span><strong>${summary.mediaReferenceCount}</strong></div>
              <div class="studio-progress-card"><span>Media metadata</span><strong>${summary.mediaAssetCount}</strong></div>
            </div>
            <div class="studio-backup-preview-note">Private image files are cloned when the original <code>sb-media</code> references still exist in this Supabase project. Missing private media references may remain as references but cannot recreate deleted Storage files.</div>
        `;
    }

    async function readAndPreviewBackupImportFile() {
        if (state.auth.studioHasUnsavedChanges) {
            const saved = await autosaveStudioChanges({ reason: 'preview a backup import', allowCreate: true });
            if (!saved) return;
        }
        if (!state.auth.client || !state.auth.user?.id) {
            throw new Error('Sign in before importing a backup.');
        }
        const file = elements.importBackupFile?.files?.[0];
        if (!file) {
            throw new Error('Choose a Study Bunny JSON backup file first.');
        }
        const text = await readFileAsText(file);
        let payload;
        try {
            payload = JSON.parse(text);
        } catch (error) {
            throw new Error('Could not read that JSON file. Choose an exported Study Bunny backup.');
        }
        validateBackupImportPayload(payload);
        state.auth.backupImportPayload = payload;
        state.auth.backupImportFileName = file.name || 'backup.json';
        renderBackupImportPreview(payload, state.auth.backupImportFileName);
        populateExportBackupControls();
        setCreatorStatus('Backup preview ready. Review it, then import as a new copy.', 'success');
        return payload;
    }

    function getBackupFoldersForImport(payload = {}) {
        const { folders, quizzes } = getBackupImportArrays(payload);
        const folderMap = new Map();
        folders.forEach(folder => {
            const id = normalizeSheetText(folder?.id);
            const name = normalizeSheetText(folder?.name);
            if (id || name) {
                folderMap.set(id || `name:${name}`, { id, name: name || 'Imported Folder', sort_order: Number(folder?.sort_order ?? 0) });
            }
        });
        quizzes.forEach(quiz => {
            const id = normalizeSheetText(quiz?.folder_id);
            if (id && !folderMap.has(id)) {
                folderMap.set(id, { id, name: normalizeSheetText(quiz?.folder_name) || 'Imported Folder', sort_order: 0 });
            }
        });
        return Array.from(folderMap.values()).sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || String(a.name || '').localeCompare(String(b.name || '')));
    }

    function reserveImportedCopyName(rawName, usedNames, fallback = 'Imported Item') {
        const baseName = normalizeSheetText(rawName) || fallback;
        const lower = value => normalizeSheetText(value).toLowerCase();
        const needsPrefix = usedNames.has(lower(baseName));
        const preferred = needsPrefix ? `Imported - ${baseName}` : baseName;
        let candidate = preferred;
        let suffix = 2;
        while (usedNames.has(lower(candidate))) {
            candidate = `${preferred} (${suffix})`;
            suffix += 1;
        }
        usedNames.add(lower(candidate));
        return candidate;
    }

    async function importBackupFoldersAsCopies(payload = {}) {
        const folderRows = getBackupFoldersForImport(payload);
        const folderIdMap = new Map();
        if (!folderRows.length) return { folderIdMap, createdCount: 0 };

        const usedFolderNames = new Set(state.auth.supabaseFolders.map(folder => normalizeSheetText(folder.name).toLowerCase()).filter(Boolean));
        let sortOrder = await getNextSortOrderForFolder();
        let createdCount = 0;

        for (const folder of folderRows) {
            const folderName = reserveImportedCopyName(folder.name, usedFolderNames, 'Imported Folder');
            const { data, error } = await state.auth.client
                .from('folders')
                .insert({
                    user_id: state.auth.user.id,
                    name: folderName,
                    sort_order: sortOrder
                })
                .select('id')
                .single();
            if (error) throw error;
            sortOrder += 1;
            createdCount += 1;
            const oldId = normalizeSheetText(folder.id);
            if (oldId) folderIdMap.set(oldId, data.id);
        }
        return { folderIdMap, createdCount };
    }

    function createImportQuizSortOrderGetter() {
        const nextByFolder = new Map();
        return folderId => {
            const key = normalizeSheetText(folderId);
            if (!nextByFolder.has(key)) {
                const currentMax = state.auth.managedQuizzes
                    .filter(quiz => normalizeSheetText(quiz.folderId) === key)
                    .reduce((maxValue, quiz) => Math.max(maxValue, Number(quiz.sortOrder ?? -1)), -1);
                nextByFolder.set(key, currentMax + 1);
            }
            const next = nextByFolder.get(key);
            nextByFolder.set(key, next + 1);
            return next;
        };
    }

    async function restoreBackupMediaValue(value, options = {}) {
        const normalizedValue = normalizeSheetText(value);
        if (!normalizedValue) return '';
        if (isDataUrl(normalizedValue)) {
            return savePrivateMediaValue(normalizedValue, options);
        }
        if (isSupabaseMediaReference(normalizedValue)) {
            return replaceMediaRefsForCopiedValue(normalizedValue, options);
        }
        return normalizedValue;
    }

    async function restoreBackupMediaRefsInObject(value, options = {}) {
        if (!value) return value;
        if (typeof value === 'string') {
            if (isDataUrl(value) || isSupabaseMediaReference(value)) {
                return restoreBackupMediaValue(value, options);
            }
            return normalizeSheetText(value);
        }
        if (Array.isArray(value)) {
            const restoredItems = [];
            for (let index = 0; index < value.length; index += 1) {
                restoredItems.push(await restoreBackupMediaRefsInObject(value[index], { ...options, usageContext: `${options.usageContext || 'backup_media'}_${index + 1}` }));
            }
            return restoredItems;
        }
        if (typeof value === 'object') {
            const restoredEntries = [];
            for (const [key, item] of Object.entries(value)) {
                restoredEntries.push([key, await restoreBackupMediaRefsInObject(item, { ...options, usageContext: key })]);
            }
            return Object.fromEntries(restoredEntries);
        }
        return value;
    }

    async function insertBackupMultipleChoiceDetail(quizId, questionId, detail = {}) {
        const sourceOptionJson = detail.options_json || [];
        const sourceOptions = getOptionsJsonOptions(sourceOptionJson);
        const restoredOptionJson = sourceOptions.length || (sourceOptionJson && typeof sourceOptionJson === 'object')
            ? await restoreBackupMediaRefsInObject(sourceOptionJson, { quizId, questionId, usageContext: 'multiple_choice_option_image' })
            : [];
        const restoredOptions = getOptionsJsonOptions(restoredOptionJson);
        const optionJson = restoredOptions.map((option, index) => ({
            text: normalizeSheetText(option?.text),
            explanation_html: normalizeSheetText(option?.explanation_html),
            imageUrl: normalizeSheetText(option?.imageUrl || option?.image_url),
            imageLabel: normalizeSheetText(option?.imageLabel || option?.image_label) || getOptionImageLabel(option, index)
        }));
        const normalizedOptionsJson = restoredOptionJson && typeof restoredOptionJson === 'object' && !Array.isArray(restoredOptionJson)
            ? { ...restoredOptionJson, options: optionJson, diagramLabels: normalizeDiagramLabels(restoredOptionJson.diagramLabels || restoredOptionJson.labels || []) }
            : optionJson;
        let correctAnswer = normalizeSheetText(detail.correct_answer);
        const sourceCorrectIndex = sourceOptions.findIndex(option => getOptionAnswerValue({
            text: normalizeSheetText(option?.text),
            imageUrl: normalizeSheetText(option?.imageUrl || option?.image_url)
        }) === correctAnswer);
        if (sourceCorrectIndex >= 0 && optionJson[sourceCorrectIndex]) {
            correctAnswer = getOptionAnswerValue(optionJson[sourceCorrectIndex]);
        }
        const payload = {
            question_id: questionId,
            correct_answer: correctAnswer,
            correct_explanation_html: normalizeSheetText(detail.correct_explanation_html),
            option_1_text: normalizeSheetText(detail.option_1_text),
            option_1_explanation_html: normalizeSheetText(detail.option_1_explanation_html),
            option_2_text: normalizeSheetText(detail.option_2_text),
            option_2_explanation_html: normalizeSheetText(detail.option_2_explanation_html),
            option_3_text: normalizeSheetText(detail.option_3_text),
            option_3_explanation_html: normalizeSheetText(detail.option_3_explanation_html),
            option_4_text: normalizeSheetText(detail.option_4_text),
            option_4_explanation_html: normalizeSheetText(detail.option_4_explanation_html)
        };
        if (Object.prototype.hasOwnProperty.call(detail, 'options_json')) {
            payload.options_json = normalizedOptionsJson;
        }
        const { error } = await state.auth.client.from('multiple_choice_questions').insert(payload);
        if (error) {
            const missingColumn = /options_json/i.test(error.message || '') || /options_json/i.test(error.details || '');
            if (!missingColumn) throw error;
            const fallbackPayload = { ...payload };
            delete fallbackPayload.options_json;
            const { error: fallbackError } = await state.auth.client.from('multiple_choice_questions').insert(fallbackPayload);
            if (fallbackError) throw fallbackError;
        }
    }

    async function insertBackupFlashcardDetail(quizId, questionId, question = {}, detail = {}) {
        const termImageUrl = await restoreBackupMediaValue(detail.term_image_url, { quizId, questionId, usageContext: 'term_image_url' });
        const definitionImageUrl = await restoreBackupMediaValue(detail.definition_image_url, { quizId, questionId, usageContext: 'definition_image_url' });
        const { error } = await state.auth.client.from('flashcard_questions').insert({
            question_id: questionId,
            term_html: normalizeSheetText(detail.term_html || question.prompt_html),
            definition_html: normalizeSheetText(detail.definition_html),
            term_plain: normalizeSheetText(detail.term_plain || question.prompt_plain),
            definition_plain: normalizeSheetText(detail.definition_plain),
            term_image_url: termImageUrl || '',
            definition_image_url: definitionImageUrl || ''
        });
        if (error) throw error;
    }

    async function insertBackupHierarchyDetail(questionId, detail = {}) {
        const payload = {
            question_id: questionId,
            item_1_text: normalizeSheetText(detail.item_1_text),
            item_2_text: normalizeSheetText(detail.item_2_text),
            item_3_text: normalizeSheetText(detail.item_3_text),
            item_4_text: normalizeSheetText(detail.item_4_text),
            item_5_text: normalizeSheetText(detail.item_5_text),
            item_6_text: normalizeSheetText(detail.item_6_text),
            item_7_text: normalizeSheetText(detail.item_7_text),
            item_8_text: normalizeSheetText(detail.item_8_text),
            item_9_text: normalizeSheetText(detail.item_9_text),
            item_10_text: normalizeSheetText(detail.item_10_text),
            correct_order_json: Array.isArray(detail.correct_order_json) ? detail.correct_order_json : []
        };
        const { error } = await state.auth.client.from('hierarchy_questions').insert(payload);
        if (error) throw error;
    }

    async function insertBackupClassifyDetail(quizId, questionId, detail = {}) {
        const restored = await restoreBackupMediaRefsInObject({
            items_json: normalizeBackupJsonArray(detail.items_json),
            classifications_json: normalizeBackupJsonArray(detail.classifications_json)
        }, { quizId, questionId, usageContext: 'classify_media' });
        const { error } = await state.auth.client.from('classify_questions').insert({
            question_id: questionId,
            items_json: restored.items_json || [],
            classifications_json: restored.classifications_json || []
        });
        if (error) throw error;
    }

    async function importBackupQuestionAsCopy(quizId, backupQuestion = {}, sortOrder = 0, stats = {}) {
        const questionType = normalizeSheetText(backupQuestion.question_type || 'multiple_choice') || 'multiple_choice';
        const supportedTypes = new Set(['multiple_choice', 'flashcard', 'hierarchy', 'classify', 'diagrams']);
        if (!supportedTypes.has(questionType)) {
            throw new Error(`Unsupported backup question type: ${questionType}`);
        }

        const { data: questionRow, error: questionError } = await state.auth.client
            .from('questions')
            .insert({
                quiz_id: quizId,
                question_type: questionType,
                prompt_html: normalizeSheetText(backupQuestion.prompt_html),
                prompt_plain: normalizeSheetText(backupQuestion.prompt_plain),
                image_url: '',
                learning_resources_html: normalizeSheetText(backupQuestion.learning_resources_html),
                learning_resources_image_url: '',
                sort_order: sortOrder
            })
            .select('id')
            .single();
        if (questionError) throw questionError;
        const questionId = questionRow.id;

        const sharedMedia = {
            image_url: await restoreBackupMediaValue(backupQuestion.image_url, { quizId, questionId, usageContext: 'image_url' }),
            learning_resources_image_url: await restoreBackupMediaValue(backupQuestion.learning_resources_image_url, { quizId, questionId, usageContext: 'learning_resources_image_url' })
        };
        const { error: mediaUpdateError } = await state.auth.client.from('questions').update(sharedMedia).eq('id', questionId);
        if (mediaUpdateError) throw mediaUpdateError;

        const detail = backupQuestion.detail && typeof backupQuestion.detail === 'object' ? backupQuestion.detail : {};
        if (questionType === 'flashcard') {
            await insertBackupFlashcardDetail(quizId, questionId, backupQuestion, detail);
        } else if (questionType === 'hierarchy') {
            await insertBackupHierarchyDetail(questionId, detail);
        } else if (questionType === 'classify') {
            await insertBackupClassifyDetail(quizId, questionId, detail);
        } else {
            await insertBackupMultipleChoiceDetail(quizId, questionId, detail);
        }

        if (backupQuestion.question_state?.is_starred) {
            const { error: stateError } = await state.auth.client
                .from('user_question_state')
                .upsert({ user_id: state.auth.user.id, question_id: questionId, is_starred: true }, { onConflict: 'user_id,question_id' });
            if (stateError) {
                console.error('Could not restore starred state for imported question:', stateError);
            } else {
                stats.starredQuestions = (stats.starredQuestions || 0) + 1;
            }
        }
        stats.questions = (stats.questions || 0) + 1;
        return questionId;
    }

    async function importBackupAsNewCopy() {
        if (state.auth.studioHasUnsavedChanges) {
            const saved = await autosaveStudioChanges({ reason: 'import a backup', allowCreate: true });
            if (!saved) return;
        }
        if (!state.auth.client || !state.auth.user?.id) {
            throw new Error('Sign in before importing a backup.');
        }
        let payload = state.auth.backupImportPayload;
        if (!payload) {
            payload = await readAndPreviewBackupImportFile();
        }
        validateBackupImportPayload(payload);
        const { quizzes } = getBackupImportArrays(payload);
        const stats = { folders: 0, quizzes: 0, questions: 0, starredQuestions: 0 };
        if (elements.importBackupBtn) elements.importBackupBtn.disabled = true;
        setCreatorProgressStatus('Importing backup', 'creating folders');

        const { folderIdMap, createdCount } = await importBackupFoldersAsCopies(payload);
        stats.folders = createdCount;
        const nextQuizSortOrder = createImportQuizSortOrderGetter();
        const usedQuizNames = new Set(state.auth.managedQuizzes.map(quiz => normalizeSheetText(quiz.name).toLowerCase()).filter(Boolean));
        const importedQuizIds = [];

        for (let quizIndex = 0; quizIndex < quizzes.length; quizIndex += 1) {
            const backupQuiz = quizzes[quizIndex];
            const sourceFolderId = normalizeSheetText(backupQuiz.folder_id);
            const targetFolderId = sourceFolderId ? (folderIdMap.get(sourceFolderId) || null) : null;
            const quizName = reserveImportedCopyName(backupQuiz.name, usedQuizNames, 'Imported Quiz');
            const quizPosition = `${quizIndex + 1} of ${quizzes.length}`;
            setCreatorProgressStatus('Importing backup', `quiz ${quizPosition}: ${quizName}`);
            const { data: quizRow, error: quizError } = await state.auth.client
                .from('quizzes')
                .insert({
                    user_id: state.auth.user.id,
                    folder_id: targetFolderId,
                    name: quizName,
                    description: '',
                    sort_order: nextQuizSortOrder(targetFolderId),
                    is_archived: false
                })
                .select('id')
                .single();
            if (quizError) throw quizError;
            const newQuizId = quizRow.id;
            let restoredDescription = '';
            if (normalizeSheetText(backupQuiz.description)) {
                restoredDescription = await restoreQuizDescriptionMediaReferences(backupQuiz.description, { quizId: newQuizId, questionId: null, usageContext: 'quiz_description' });
                const { error: descriptionError } = await state.auth.client
                    .from('quizzes')
                    .update({ description: restoredDescription || '' })
                    .eq('id', newQuizId);
                if (descriptionError) throw descriptionError;
            }
            importedQuizIds.push(newQuizId);
            stats.quizzes += 1;

            const questions = Array.isArray(backupQuiz.questions) ? [...backupQuiz.questions] : [];
            questions.sort((a, b) => Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0));
            const importedQuestionIdMap = new Map();
            for (let index = 0; index < questions.length; index += 1) {
                setCreatorProgressStatus('Importing backup', `quiz ${quizPosition}, question ${index + 1} of ${questions.length}`);
                const importedQuestionId = await importBackupQuestionAsCopy(newQuizId, questions[index], index, stats);
                const sourceBackupQuestionId = normalizeSheetText(questions[index]?.id);
                if (sourceBackupQuestionId && importedQuestionId) importedQuestionIdMap.set(sourceBackupQuestionId, importedQuestionId);
            }
            const remappedDescription = remapDiagramSharingSourceQuestionId(restoredDescription, importedQuestionIdMap);
            if (remappedDescription !== restoredDescription) {
                const { error: remapDescriptionError } = await state.auth.client
                    .from('quizzes')
                    .update({ description: remappedDescription || '' })
                    .eq('id', newQuizId);
                if (remapDescriptionError) throw remapDescriptionError;
            }
        }

        setCreatorProgressStatus('Importing backup', 'refreshing Quiz Studio');
        await refreshStudioManagementData();
        await refreshQuizCatalog({ selectQuizId: importedQuizIds[0] ? `sb:${importedQuizIds[0]}` : undefined, loadSelectedQuiz: false });
        state.auth.backupImportPayload = null;
        state.auth.backupImportFileName = '';
        if (elements.importBackupFile) elements.importBackupFile.value = '';
        populateExportBackupControls();
        renderStudioHomeDashboard();
        setCreatorStatus(`Imported backup as new copies: ${stats.folders} folders, ${stats.quizzes} quizzes, ${stats.questions} questions.`, 'success');
        if (elements.importBackupPreview) {
            elements.importBackupPreview.classList.add('is-success');
            elements.importBackupPreview.insertAdjacentHTML('beforeend', `<div class="studio-backup-preview-note">Import complete. Restored starred questions: ${stats.starredQuestions || 0}.</div>`);
        }
    }

    async function syncAuthFromSession(session) {
        const previousUserId = normalizeSheetText(state.auth.user?.id);
        const nextUserId = normalizeSheetText(session?.user?.id);
        const sameSignedInUser = !!previousUserId && !!nextUserId && previousUserId === nextUserId;
        const activeQuizWasLoaded = !!state.activeQuizDescriptor && Array.isArray(state.sourceQuestions) && state.sourceQuestions.length > 0;

        state.auth.session = session || null;
        state.auth.user = session?.user || null;

        if (state.auth.user?.id) {
            await loadAuthProfile(state.auth.user.id);
            await refreshStudioManagementData();
        } else {
            state.auth.profile = null;
            state.auth.supabaseFolders = [];
            state.auth.managedQuizzes = [];
            state.auth.quizChallengeAchievements = new Map();
            state.auth.quizChallengeUnavailable = false;
            state.googleSheetsImportQuizzes = [];
            state.auth.currentStudioSection = 'home';
            state.auth.backupImportPayload = null;
            state.auth.backupImportFileName = '';
            clearCreatorInputs();
            populateCreatorFolderSelect();
            populateStudioQuizFolderFilter();
            renderFolderManagementList();
            renderQuizManagementList();
            renderStudioHomeDashboard();
        }

        updateAuthUI();
        await refreshQuizCatalog();

        if (!state.auth.user?.id) {
            clearActiveQuizSelection('Sign in to load your quizzes.');
            return;
        }

        if (previousUserId && nextUserId && previousUserId !== nextUserId) {
            clearActiveQuizSelection('Choose a folder and a quiz.');
            return;
        }

        if (state.sourceQuestions.length) {
            if (state.auth.user?.id) {
                await hydrateStarredQuestionState(state.sourceQuestions);
            } else {
                state.sourceQuestions.forEach(question => { question.isStarred = false; });
            }

            if (sameSignedInUser && activeQuizWasLoaded) {
                syncQuestionStarButton();
                return;
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
            password: String(elements.authPassword?.value || '')
        };
    }

    async function handleAuthSignUp() {
        if (!state.auth.client) return;

        const { email, password } = getAuthFormValues();
        if (!email || !password) {
            setAuthStatus('Enter an email and password to create an account.', 'error');
            return;
        }

        setAuthStatus('Creating account...');

        const { data, error } = await state.auth.client.auth.signUp({
            email,
            password
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

        if (state.auth.studioHasUnsavedChanges) {
            const closed = await closeQuizStudioPage();
            if (!closed) {
                setAuthStatus('Save your Quiz Studio changes before signing out.', 'error');
                return;
            }
        } else {
            await closeQuizStudioPage(true);
        }

        setAuthStatus('Signing out...');
        const { error } = await state.auth.client.auth.signOut();

        if (error) {
            setAuthStatus(error.message || 'Could not sign out.', 'error');
            return;
        }

        state.auth.profile = null;
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
            setStudioQuestionImagePanelOpen(true);
            setStudioQuestionImageState(dataUrl, `Selected: ${file.name}`);
        } else if (type === 'term') {
            setStudioFlashcardTermImageState(dataUrl, `Selected: ${file.name}`);
        } else if (type === 'definition') {
            setStudioFlashcardDefinitionImageState(dataUrl, `Selected: ${file.name}`);
        } else {
            setStudioLearningResourcesImageState(dataUrl, `Selected: ${file.name}`);
        }
    }

    async function createSupabaseFolderByName(folderName) {
        if (!state.auth.client || !state.auth.user?.id) {
            throw new Error('Sign in before creating a folder.');
        }

        const normalizedName = normalizeFolderName(folderName);
        if (!normalizedName) {
            throw new Error('Enter a folder name first.');
        }

        const sortOrder = await getNextSortOrderForFolder();
        const { data, error } = await state.auth.client
            .from('folders')
            .insert({
                user_id: state.auth.user.id,
                name: normalizedName,
                sort_order: sortOrder
            })
            .select('id, name, sort_order')
            .single();

        if (error) throw error;
        return data;
    }

    function setEditorInlineFolderCreatorOpen(isOpen = false, options = {}) {
        if (!elements.createQuizFolderInlineCreator) return;
        elements.createQuizFolderInlineCreator.classList.toggle('hidden', !isOpen);
        if (!isOpen && !options.keepValue && elements.createQuizNewFolderName) {
            elements.createQuizNewFolderName.value = '';
        }
        if (isOpen && options.focus !== false && elements.createQuizNewFolderName) {
            window.requestAnimationFrame(() => elements.createQuizNewFolderName.focus());
        }
    }

    async function handleCreateFolder() {
        const folderName = normalizeSheetText(elements.createFolderName?.value);
        if (!folderName) {
            setCreatorStatus('Enter a folder name first.', 'error');
            return;
        }

        setCreatorStatus('Creating folder...');

        try {
            const createdFolder = await createSupabaseFolderByName(folderName);
            await refreshStudioManagementData();
            await refreshQuizCatalog();
            if (elements.createQuizFolderSelect && createdFolder?.id) {
                elements.createQuizFolderSelect.value = createdFolder.id;
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

    async function handleCreateFolderFromEditor() {
        const folderName = normalizeSheetText(elements.createQuizNewFolderName?.value);
        if (!folderName) {
            setCreatorStatus('Enter a new folder name first.', 'error');
            elements.createQuizNewFolderName?.focus();
            return;
        }

        setCreatorStatus('Creating folder...');

        try {
            const createdFolder = await createSupabaseFolderByName(folderName);
            await refreshStudioManagementData();
            await refreshQuizCatalog();
            if (elements.createQuizFolderSelect && createdFolder?.id) {
                elements.createQuizFolderSelect.value = createdFolder.id;
                setStudioDirtyState(true);
            }
            setEditorInlineFolderCreatorOpen(false);
            setCreatorStatus('Folder created and selected.', 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not create the folder.', 'error');
        }
    }

    async function saveSharedQuestionMediaValues(quizId, questionId, values = {}) {
        const saved = await savePrivateMediaValues({
            image_url: values.image_url || '',
            learning_resources_image_url: values.learning_resources_image_url || ''
        }, {
            quizId,
            questionId,
            labels: {
                image_url: state.auth.studioQuestionImageLabel,
                learning_resources_image_url: state.auth.studioLearningResourcesImageLabel
            }
        });
        return saved;
    }

    async function saveFlashcardMediaValues(quizId, questionId, values = {}) {
        const saved = await savePrivateMediaValues({
            term_image_url: values.term_image_url || '',
            definition_image_url: values.definition_image_url || ''
        }, {
            quizId,
            questionId,
            labels: {
                term_image_url: state.auth.studioFlashcardTermImageLabel,
                definition_image_url: state.auth.studioFlashcardDefinitionImageLabel
            }
        });
        return saved;
    }

    async function saveClassifyDraftMediaValues(quizId, questionId, categories, items) {
        const savedCategories = [];
        for (let index = 0; index < categories.length; index += 1) {
            const category = categories[index];
            savedCategories.push({
                ...category,
                imageUrl: await savePrivateMediaValue(category.imageUrl, {
                    quizId,
                    questionId,
                    usageContext: `classify_category_${index + 1}_image`,
                    label: category.label || `category-${index + 1}`
                })
            });
        }

        const savedItems = [];
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            savedItems.push({
                ...item,
                imageUrl: await savePrivateMediaValue(item.imageUrl, {
                    quizId,
                    questionId,
                    usageContext: `classify_item_${index + 1}_image`,
                    label: item.text || `classify-item-${index + 1}`
                })
            });
        }

        return { categories: savedCategories, items: savedItems };
    }

    async function handleSaveMultipleChoiceQuiz() {
        if (!state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before creating or editing a quiz.', 'error');
            return;
        }
        const quizName = normalizeSheetText(elements.createQuizName?.value);
        const prompt = normalizeAuthoredMathChemText(elements.createQuestionPrompt?.value);
        const learningResourcesHtml = getLearningResourcesEditorHtml();
        const learningResources = getLearningResourcesEditorPlain();
        const quizType = getStudioCurrentQuizType();
        const isDiagramQuestion = quizType === 'diagrams';
        const diagramLabels = isDiagramQuestion ? getStudioDiagramLabelsFromDOM() : [];
        const diagramSharingDraft = isDiagramQuestion ? getStudioDiagramSharingDraft() : createDefaultDiagramSharingState();
        if (!diagramSharingDraft.useSharedImage) {
            diagramSharingDraft.useSharedLabels = false;
            diagramSharingDraft.questionOverride = false;
        }
        const optionDrafts = getStudioOptionDraftsFromDOM();
        const options = optionDrafts.map(draft => draft.text);
        const explanations = optionDrafts.map(draft => draft.explanation);
        const optionAnswerValues = optionDrafts.map(getOptionAnswerValue);
        const folderId = normalizeSheetText(elements.createQuizFolderSelect?.value) || null;
        const maxOptionIndex = Math.max(0, options.length - 1);
        const correctIndex = Math.max(0, Math.min(maxOptionIndex, Number(elements.createCorrectOptionSelect?.value || '1') - 1));
        const correctExplanation = normalizeAuthoredMathChemText(elements.createCorrectExplanation?.value);
        const correctAnswer = optionAnswerValues[correctIndex];
        if (!quizName) return void setCreatorStatus('Enter a quiz name first.', 'error');
        if (!prompt) return void setCreatorStatus('Enter a question prompt.', 'error');
        if (optionDrafts.length < 2) return void setCreatorStatus('Add at least 2 answer options.', 'error');
        if (optionAnswerValues.some(value => !value)) return void setCreatorStatus('Each answer option needs text or an image before saving.', 'error');
        if (new Set(optionAnswerValues).size !== optionAnswerValues.length) return void setCreatorStatus('All answer options must be unique.', 'error');
        if (!correctAnswer) return void setCreatorStatus('Choose which option is correct.', 'error');
        const isEditingQuiz = !!state.auth.editingQuizId;
        const isEditingQuestion = !!state.auth.editingQuestionId;
        setCreatorStatus(!isEditingQuiz ? (isDiagramQuestion ? 'Creating diagrams quiz...' : 'Creating quiz...') : (isEditingQuestion ? (isDiagramQuestion ? 'Saving diagram changes...' : 'Saving question changes...') : (isDiagramQuestion ? 'Adding diagram question to quiz...' : 'Adding question to quiz...')));
        try {
            let quizId = state.auth.editingQuizId;
            let questionId = state.auth.editingQuestionId;
            let currentQuizDescription = '';
            const previousMediaRefs = questionId ? await getQuestionMediaReferences(questionId) : new Set();
            let previousQuizDescriptionMediaRefs = new Set();
            if (quizId) {
                const { data: existingQuizRow, error: existingQuizError } = await state.auth.client.from('quizzes').select('description').eq('id', quizId).maybeSingle();
                if (existingQuizError) throw existingQuizError;
                currentQuizDescription = normalizeSheetText(existingQuizRow?.description);
                previousQuizDescriptionMediaRefs = collectQuizDescriptionMediaReferences(currentQuizDescription);
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
                const { data, error } = await state.auth.client.from('questions').insert({ quiz_id: quizId, question_type: isDiagramQuestion ? 'diagrams' : 'multiple_choice', prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, image_url: '', learning_resources_html: learningResourcesHtml, learning_resources_image_url: '', sort_order: questionSortOrder }).select('id').single();
                if (error) throw error;
                questionId = data.id;
            } else {
                const { error } = await state.auth.client.from('questions').update({ prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, learning_resources_html: learningResourcesHtml, question_type: isDiagramQuestion ? 'diagrams' : 'multiple_choice' }).eq('id', questionId);
                if (error) throw error;
                state.auth.pendingInsertAfterQuestionId = null;
            }
            let questionDiagramImageValue = state.auth.studioQuestionImageDataUrl || '';
            let diagramLabelsForQuestion = diagramLabels;
            let nextDiagramSharing = {
                ...state.auth.studioDiagramSharing,
                ...diagramSharingDraft,
                sharedLabels: normalizeDiagramLabels(state.auth.studioDiagramSharing?.sharedLabels || []),
                sourceQuestionId: getDiagramSharingSourceQuestionId(state.auth.studioDiagramSharing)
            };
            let shouldVerifySharedImageAfterCleanup = false;

            if (isDiagramQuestion) {
                const existingSourceQuestionId = getDiagramSharingSourceQuestionId(state.auth.studioDiagramSharing);
                const currentQuestionIsSource = !!existingSourceQuestionId && existingSourceQuestionId === questionId;
                const canEditSharedSettings = !existingSourceQuestionId || currentQuestionIsSource;

                if (!canEditSharedSettings) {
                    nextDiagramSharing = {
                        ...state.auth.studioDiagramSharing,
                        questionOverride: !!diagramSharingDraft.questionOverride
                    };
                } else if (nextDiagramSharing.useSharedImage) {
                    nextDiagramSharing.sourceQuestionId = existingSourceQuestionId || questionId;
                    if (nextDiagramSharing.sourceQuestionId === questionId) {
                        nextDiagramSharing.questionOverride = false;
                    }
                } else {
                    nextDiagramSharing = {
                        ...nextDiagramSharing,
                        useSharedLabels: false,
                        sharedImageUrl: '',
                        sharedImageLabel: '',
                        sharedImageName: '',
                        sharedLabels: [],
                        sourceQuestionId: '',
                        questionOverride: false
                    };
                }

                const editingSharedSource = canEditSharedSettings && nextDiagramSharing.useSharedImage && getDiagramSharingSourceQuestionId(nextDiagramSharing) === questionId;
                if (editingSharedSource) {
                    const sharedImageCandidate = normalizeSheetText(questionDiagramImageValue || nextDiagramSharing.sharedImageUrl);
                    const nextSharedImageName = getSelectedFileNameFromLabel(state.auth.studioQuestionImageLabel) || getSharedDiagramImageName(nextDiagramSharing);
                    let savedSharedDiagramImage = await savePrivateMediaValue(sharedImageCandidate, {
                        quizId,
                        questionId,
                        usageContext: 'diagram_shared_image',
                        label: state.auth.studioQuestionImageLabel || nextDiagramSharing.sharedImageLabel || 'shared diagram image'
                    });
                    savedSharedDiagramImage = await anchorSupabaseMediaReferenceToQuestion(savedSharedDiagramImage, {
                        quizId,
                        questionId,
                        usageContext: 'diagram_shared_image'
                    });
                    const sharedDiagramImageIsLoadable = await verifySupabaseMediaReferenceIsLoadable(savedSharedDiagramImage);
                    if (savedSharedDiagramImage && !sharedDiagramImageIsLoadable) {
                        throw new Error('The shared diagram image was saved, but Study Bunny could not prepare it for preview. Re-upload the image from the shared source question.');
                    }
                    shouldVerifySharedImageAfterCleanup = !!savedSharedDiagramImage;
                    nextDiagramSharing.sharedImageUrl = savedSharedDiagramImage || '';
                    nextDiagramSharing.sharedImageName = savedSharedDiagramImage ? nextSharedImageName : '';
                    nextDiagramSharing.sharedImageLabel = nextDiagramSharing.sharedImageUrl
                        ? (nextSharedImageName ? `Selected: ${nextSharedImageName}` : (state.auth.studioQuestionImageLabel || nextDiagramSharing.sharedImageLabel || 'Shared diagram image saved.'))
                        : '';
                    if (nextDiagramSharing.useSharedLabels) {
                        nextDiagramSharing.sharedLabels = normalizeDiagramLabels(diagramLabels);
                        diagramLabelsForQuestion = [];
                    }
                    questionDiagramImageValue = nextDiagramSharing.sharedImageUrl;
                } else if (nextDiagramSharing.useSharedImage && !nextDiagramSharing.questionOverride) {
                    questionDiagramImageValue = '';
                    diagramLabelsForQuestion = nextDiagramSharing.useSharedLabels ? [] : diagramLabelsForQuestion;
                }
            }

            if (isDiagramQuestion) {
                setStudioDiagramSharingState(nextDiagramSharing);
                const nextDescription = setDiagramSharingInDescription(currentQuizDescription, nextDiagramSharing);
                const { error: descriptionError } = await state.auth.client.from('quizzes').update({ description: nextDescription }).eq('id', quizId);
                if (descriptionError) throw descriptionError;
                currentQuizDescription = nextDescription;
            }

            const savedSharedMedia = await saveSharedQuestionMediaValues(quizId, questionId, {
                image_url: isDiagramQuestion ? questionDiagramImageValue : (state.auth.studioQuestionImageDataUrl || ''),
                learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || ''
            });
            const { error: mediaUpdateError } = await state.auth.client.from('questions').update({
                image_url: savedSharedMedia.image_url || '',
                learning_resources_image_url: savedSharedMedia.learning_resources_image_url || ''
            }).eq('id', questionId);
            if (mediaUpdateError) throw mediaUpdateError;

            const savedOptionDrafts = await saveOptionImageValues(quizId, questionId, optionDrafts);
            const savedOptions = savedOptionDrafts.map(draft => draft.text);
            const savedExplanations = savedOptionDrafts.map(draft => draft.explanation);
            const savedOptionAnswerValues = savedOptionDrafts.map(getOptionAnswerValue);
            const savedCorrectAnswer = savedOptionAnswerValues[correctIndex] || correctAnswer;
            const existingBuildUpValue = (!isDiagramQuestion && isEditingQuestion) ? await getMultipleChoiceBuildUpByQuestionId(questionId) : '';
            const optionPayload = savedOptionDrafts.map((draft, index) => ({
                text: draft.text,
                explanation_html: buildStoredHtmlFromPlain(draft.explanation),
                imageUrl: draft.imageUrl || '',
                imageLabel: draft.imageLabel || getOptionImageLabel(draft, index)
            }));
            const optionsJsonPayload = isDiagramQuestion
                ? { options: optionPayload, diagramLabels: diagramLabelsForQuestion, diagramQuestionOverride: !!nextDiagramSharing.questionOverride }
                : buildMultipleChoiceOptionsJsonPayload(optionPayload, existingBuildUpValue);
            const detailPayload = { question_id: questionId, correct_answer: savedCorrectAnswer, correct_explanation_html: buildStoredHtmlFromPlain(correctExplanation), options_json: optionsJsonPayload, option_1_text: savedOptions[0] || '', option_1_explanation_html: buildStoredHtmlFromPlain(savedExplanations[0] || ''), option_2_text: savedOptions[1] || '', option_2_explanation_html: buildStoredHtmlFromPlain(savedExplanations[1] || ''), option_3_text: savedOptions[2] || '', option_3_explanation_html: buildStoredHtmlFromPlain(savedExplanations[2] || ''), option_4_text: savedOptions[3] || '', option_4_explanation_html: buildStoredHtmlFromPlain(savedExplanations[3] || '') };
            const { error: detailError } = await state.auth.client.from('multiple_choice_questions').upsert(detailPayload, { onConflict: 'question_id' });
            if (detailError) {
                const missingColumn = /options_json/i.test(detailError.message || '') || /options_json/i.test(detailError.details || '');
                if (missingColumn) throw new Error('Run the Phase 6 Supabase migration before saving quizzes with flexible option counts.');
                throw detailError;
            }
            const mediaReplacementBaseline = new Set([...previousMediaRefs, ...previousQuizDescriptionMediaRefs]);
            await deleteReplacedMediaReferences(mediaReplacementBaseline, { ...savedSharedMedia, options_json: optionsJsonPayload, quiz_description: currentQuizDescription }, { protectedValue: currentQuizDescription });
            const finalSharedImageRef = shouldVerifySharedImageAfterCleanup ? normalizeSheetText(nextDiagramSharing.sharedImageUrl) : '';
            if (finalSharedImageRef && !(await verifySupabaseMediaReferenceIsLoadable(finalSharedImageRef))) {
                throw new Error('The shared diagram image was saved, but Study Bunny could not reload it after cleanup. Re-upload the image from the shared source question.');
            }
            if (!isEditingQuestion) {
                await applyPendingStudioInsertOrder(quizId, questionId);
            }
            state.auth.editingQuizType = isDiagramQuestion ? 'diagrams' : 'multiple_choice';
            clearStudioQuestionDraft(questionId);
            setStudioDirtyState(hasStudioQuestionDrafts());
            state.auth.studioPendingNewQuestionRow = null;
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${quizId}`, loadSelectedQuiz: true });
            await loadQuizIntoEditor(quizId, questionId, { force: true });
            setCreatorStatus(!isEditingQuiz ? (isDiagramQuestion ? 'Diagrams quiz created and first question saved.' : 'Quiz created and first question saved.') : (isEditingQuestion ? (isDiagramQuestion ? 'Diagram question updated.' : 'Question updated.') : (isDiagramQuestion ? 'New diagram question added to the quiz.' : 'New question added to the quiz.')), 'success');
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
        const termHtml = getFlashcardTermEditorHtml() || buildStoredHtmlFromPlain(term);
        const definitionHtml = getFlashcardDefinitionEditorHtml() || buildStoredHtmlFromPlain(definition);
        const learningResourcesHtml = getLearningResourcesEditorHtml();
        const learningResources = getLearningResourcesEditorPlain();
        if (!quizName) return void setCreatorStatus('Enter a quiz name first.', 'error');
        if (!term) return void setCreatorStatus('Enter a flashcard term first.', 'error');
        if (!definition) return void setCreatorStatus('Enter a flashcard definition first.', 'error');
        const isEditingQuiz = !!state.auth.editingQuizId;
        const isEditingQuestion = !!state.auth.editingQuestionId && !isStudioLocalFlashcardId(state.auth.editingQuestionId);
        setCreatorStatus(!isEditingQuiz ? 'Creating flashcard quiz...' : (isEditingQuestion ? 'Saving flashcard changes...' : 'Adding flashcard to quiz...'));
        try {
            let quizId = state.auth.editingQuizId;
            let questionId = isEditingQuestion ? state.auth.editingQuestionId : '';
            const previousMediaRefs = questionId ? await getQuestionMediaReferences(questionId) : new Set();
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
                const { data, error } = await state.auth.client.from('questions').insert({ quiz_id: quizId, question_type: 'flashcard', prompt_html: termHtml, prompt_plain: term, image_url: '', learning_resources_html: learningResourcesHtml, learning_resources_image_url: '', sort_order: questionSortOrder }).select('id').single();
                if (error) throw error;
                questionId = data.id;
            } else {
                const { error } = await state.auth.client.from('questions').update({ prompt_html: termHtml, prompt_plain: term, image_url: '', learning_resources_html: learningResourcesHtml }).eq('id', questionId);
                if (error) throw error;
                state.auth.pendingInsertAfterQuestionId = null;
            }
            const savedSharedMedia = await saveSharedQuestionMediaValues(quizId, questionId, {
                image_url: '',
                learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || ''
            });
            const { error: mediaUpdateError } = await state.auth.client.from('questions').update({
                learning_resources_image_url: savedSharedMedia.learning_resources_image_url || ''
            }).eq('id', questionId);
            if (mediaUpdateError) throw mediaUpdateError;
            const savedFlashcardMedia = await saveFlashcardMediaValues(quizId, questionId, {
                term_image_url: state.auth.studioFlashcardTermImageDataUrl || '',
                definition_image_url: state.auth.studioFlashcardDefinitionImageDataUrl || ''
            });
            const detailPayload = { question_id: questionId, term_html: termHtml, definition_html: definitionHtml, term_plain: term, definition_plain: definition, term_image_url: savedFlashcardMedia.term_image_url || '', definition_image_url: savedFlashcardMedia.definition_image_url || '' };
            const { error: detailError } = await state.auth.client.from('flashcard_questions').upsert(detailPayload, { onConflict: 'question_id' });
            if (detailError) throw detailError;
            await deleteReplacedMediaReferences(previousMediaRefs, { ...savedSharedMedia, ...savedFlashcardMedia });
            if (!isEditingQuestion) {
                await applyPendingStudioInsertOrder(quizId, questionId);
            }
            state.auth.editingQuizType = 'flashcard';
            clearStudioQuestionDraft(questionId);
            setStudioDirtyState(hasStudioQuestionDrafts());
            state.auth.studioPendingNewQuestionRow = null;
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${quizId}`, loadSelectedQuiz: true });
            await loadQuizIntoEditor(quizId, questionId, { force: true });
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
        const prompt = normalizeAuthoredMathChemText(elements.createQuestionPrompt?.value);
        const learningResourcesHtml = getLearningResourcesEditorHtml();
        const learningResources = getLearningResourcesEditorPlain();
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
            const previousMediaRefs = questionId ? await getQuestionMediaReferences(questionId) : new Set();
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
                const { data, error } = await state.auth.client.from('questions').insert({ quiz_id: quizId, question_type: 'hierarchy', prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, image_url: '', learning_resources_html: learningResourcesHtml, learning_resources_image_url: '', sort_order: questionSortOrder }).select('id').single();
                if (error) throw error;
                questionId = data.id;
            } else {
                const { error } = await state.auth.client.from('questions').update({ prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, learning_resources_html: learningResourcesHtml, question_type: 'hierarchy' }).eq('id', questionId);
                if (error) throw error;
                state.auth.pendingInsertAfterQuestionId = null;
            }
            const savedSharedMedia = await saveSharedQuestionMediaValues(quizId, questionId, {
                image_url: state.auth.studioQuestionImageDataUrl || '',
                learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || ''
            });
            const { error: mediaUpdateError } = await state.auth.client.from('questions').update({
                image_url: savedSharedMedia.image_url || '',
                learning_resources_image_url: savedSharedMedia.learning_resources_image_url || ''
            }).eq('id', questionId);
            if (mediaUpdateError) throw mediaUpdateError;

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
            await deleteReplacedMediaReferences(previousMediaRefs, savedSharedMedia);
            if (!isEditingQuestion) {
                await applyPendingStudioInsertOrder(quizId, questionId);
            }
            state.auth.editingQuizType = 'hierarchy';
            clearStudioQuestionDraft(questionId);
            setStudioDirtyState(hasStudioQuestionDrafts());
            state.auth.studioPendingNewQuestionRow = null;
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${quizId}`, loadSelectedQuiz: true });
            await loadQuizIntoEditor(quizId, questionId, { force: true });
            setCreatorStatus(!isEditingQuiz ? 'Hierarchy quiz created and first question saved.' : (isEditingQuestion ? 'Hierarchy question updated.' : 'New hierarchy question added to the quiz.'), 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not save the hierarchy quiz.', 'error');
        }
    }

    async function handleSaveClassifyQuiz() {
        if (!state.auth.client || !state.auth.user?.id) return void setCreatorStatus('Sign in before creating or editing a quiz.', 'error');
        const quizName = normalizeSheetText(elements.createQuizName?.value);
        const prompt = normalizeAuthoredMathChemText(elements.createQuestionPrompt?.value);
        const learningResourcesHtml = getLearningResourcesEditorHtml();
        const learningResources = getLearningResourcesEditorPlain();
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
            const previousMediaRefs = questionId ? await getQuestionMediaReferences(questionId) : new Set();
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
                const { data, error } = await state.auth.client.from('questions').insert({ quiz_id: quizId, question_type: 'classify', prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, image_url: '', learning_resources_html: learningResourcesHtml, learning_resources_image_url: '', sort_order: questionSortOrder }).select('id').single();
                if (error) throw error;
                questionId = data.id;
            } else {
                const { error } = await state.auth.client.from('questions').update({ prompt_html: buildStoredHtmlFromPlain(prompt), prompt_plain: prompt, learning_resources_html: learningResourcesHtml, question_type: 'classify' }).eq('id', questionId);
                if (error) throw error;
                state.auth.pendingInsertAfterQuestionId = null;
            }
            const savedSharedMedia = await saveSharedQuestionMediaValues(quizId, questionId, {
                image_url: state.auth.studioQuestionImageDataUrl || '',
                learning_resources_image_url: state.auth.studioLearningResourcesImageDataUrl || ''
            });
            const { error: mediaUpdateError } = await state.auth.client.from('questions').update({
                image_url: savedSharedMedia.image_url || '',
                learning_resources_image_url: savedSharedMedia.learning_resources_image_url || ''
            }).eq('id', questionId);
            if (mediaUpdateError) throw mediaUpdateError;
            const classifyMediaDrafts = await saveClassifyDraftMediaValues(quizId, questionId, categories, items);
            const classificationsJson = classifyMediaDrafts.categories.map((category, index) => ({ label: category.label, imageUrl: category.imageUrl || '', id: category.id }));
            const itemsJson = classifyMediaDrafts.items.map((item, index) => ({ kind: item.imageUrl ? 'image' : 'text', raw: item.text || `classify_item_${index + 1}`, imageUrl: item.imageUrl || '', text: item.text, dragLabel: item.text || `Image item ${index + 1}`, ariaLabel: item.text ? `Classify item ${item.text}` : `Classify image item ${index + 1}`, correctClassificationId: item.categoryId }));
            const { error: detailError } = await state.auth.client.from('classify_questions').upsert({ question_id: questionId, items_json: itemsJson, classifications_json: classificationsJson }, { onConflict: 'question_id' });
            if (detailError) throw detailError;
            await deleteReplacedMediaReferences(previousMediaRefs, { ...savedSharedMedia, classificationsJson, itemsJson });
            if (!isEditingQuestion) {
                await applyPendingStudioInsertOrder(quizId, questionId);
            }
            state.auth.editingQuizType = 'classify';
            clearStudioQuestionDraft(questionId);
            setStudioDirtyState(hasStudioQuestionDrafts());
            state.auth.studioPendingNewQuestionRow = null;
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${quizId}`, loadSelectedQuiz: true });
            await loadQuizIntoEditor(quizId, questionId, { force: true });
            setCreatorStatus(!isEditingQuiz ? 'Classify quiz created and first question saved.' : (isEditingQuestion ? 'Classify question updated.' : 'New classify question added to the quiz.'), 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not save the classify quiz.', 'error');
        }
    }

    async function handleSaveStudioQuiz(options = {}) {
        if (isStudioFlashcardMode()) {
            if (!options.skipCachedDrafts) {
                syncStudioFlashcardInlineRowsToState();
                if (hasStudioQuestionDrafts() || state.auth.studioHasUnsavedChanges || isStudioLocalFlashcardId(state.auth.editingQuestionId)) {
                    return saveStudioCachedDrafts();
                }
            }
            return handleSaveFlashcardQuiz();
        }
        if (isStudioHierarchyMode()) return handleSaveHierarchyQuiz();
        if (isStudioClassifyMode()) return handleSaveClassifyQuiz();
        return handleSaveMultipleChoiceQuiz();
    }

    async function handleSaveStudioEditorChanges() {
        if (!state.auth.editingQuizId) {
            const isBlankQuestion = isCurrentStudioQuestionBlank();
            const canSaveQuestionNow = isCurrentStudioQuestionReadyToSave();
            const quizId = await saveQuizShellFromEditor({ quiet: canSaveQuestionNow });
            if (!quizId) return;

            if (canSaveQuestionNow) {
                await handleSaveStudioQuiz();
                return;
            }

            setStudioDirtyState(!isBlankQuestion || hasStudioQuestionDrafts());
            updateCreateQuizModeUI();
            const itemLabel = getStudioCurrentQuizType() === 'flashcard' ? 'card' : 'question';
            setCreatorStatus(
                isBlankQuestion
                    ? `Quiz created. Add your first ${itemLabel} below.`
                    : `Quiz created. Finish the current ${itemLabel}, then click Save Changes again to save it.`,
                'success'
            );
            return;
        }

        if (!state.auth.editingQuestionId && isCurrentStudioQuestionBlank() && !hasStudioQuestionDrafts()) {
            await saveQuizShellFromEditor();
            setStudioDirtyState(false);
            updateCreateQuizModeUI();
            setCreatorStatus('Quiz details saved.', 'success');
            return;
        }

        await handleSaveStudioQuiz();
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

    async function loadFolderDeleteTargets(folderId) {
        const normalizedFolderId = normalizeSheetText(folderId);
        if (!normalizedFolderId || !state.auth.client || !state.auth.user?.id) {
            throw new Error('Sign in before deleting folders.');
        }

        const cachedFolder = state.auth.supabaseFolders.find(folder => folder.id === normalizedFolderId) || null;
        let folderName = cachedFolder?.name || '';
        if (!folderName) {
            const { data: folderRow, error: folderError } = await state.auth.client
                .from('folders')
                .select('id, name')
                .eq('id', normalizedFolderId)
                .maybeSingle();
            if (folderError) throw folderError;
            folderName = normalizeFolderName(folderRow?.name || 'this folder');
        }

        const quizRows = await fetchAllSupabaseRows(
            () => state.auth.client
                .from('quizzes')
                .select('id, name')
                .eq('folder_id', normalizedFolderId),
            { label: 'folder quizzes' }
        );
        const quizIds = Array.from(new Set((quizRows || []).map(row => normalizeSheetText(row.id)).filter(Boolean)));
        const questionRows = quizIds.length
            ? await fetchAllSupabaseRows(
                () => state.auth.client
                    .from('questions')
                    .select('id, quiz_id')
                    .in('quiz_id', quizIds),
                { label: 'folder questions' }
            )
            : [];

        return {
            folderId: normalizedFolderId,
            folderName: folderName || 'this folder',
            quizIds,
            quizCount: quizIds.length,
            questionIds: Array.from(new Set((questionRows || []).map(row => normalizeSheetText(row.id)).filter(Boolean))),
            questionCount: (questionRows || []).length
        };
    }

    async function deleteStudioActivityForDeletedFolder(folderId, quizIds = []) {
        if (!state.auth.client || !state.auth.user?.id) return;
        if (state.auth.studioActivity?.unavailable) return;

        try {
            const safeQuizIds = Array.from(new Set((quizIds || []).map(normalizeSheetText).filter(Boolean)));
            if (safeQuizIds.length) {
                const { error: quizActivityError } = await state.auth.client
                    .from(STUDIO_ACTIVITY_TABLE)
                    .delete()
                    .eq('user_id', state.auth.user.id)
                    .eq('entity_type', 'quiz')
                    .in('entity_id', safeQuizIds);
                if (quizActivityError) throw quizActivityError;
            }

            const { error: folderActivityError } = await state.auth.client
                .from(STUDIO_ACTIVITY_TABLE)
                .delete()
                .eq('user_id', state.auth.user.id)
                .eq('entity_type', 'folder')
                .eq('entity_id', folderId);
            if (folderActivityError) throw folderActivityError;
        } catch (error) {
            console.warn('Could not delete Studio activity rows for deleted folder:', error);
            state.auth.studioActivity.unavailable = true;
        }
    }

    async function deleteChallengeRowsForQuizzes(quizIds = []) {
        if (!state.auth.client || !state.auth.user?.id) return;
        const safeQuizIds = Array.from(new Set((quizIds || []).map(normalizeSheetText).filter(Boolean)));
        if (!safeQuizIds.length || state.auth.quizChallengeUnavailable) return;

        const { error } = await state.auth.client
            .from(QUIZ_CHALLENGE_TABLE)
            .delete()
            .eq('user_id', state.auth.user.id)
            .in('quiz_id', safeQuizIds);

        if (error) {
            console.warn('Could not delete challenge rows before folder cascade delete:', error);
            state.auth.quizChallengeUnavailable = true;
        }
    }

    function clearDeletedFolderLocalState(targets) {
        const deletedQuizIds = new Set((targets?.quizIds || []).map(normalizeSheetText).filter(Boolean));
        const deletedQuestionIds = new Set((targets?.questionIds || []).map(normalizeSheetText).filter(Boolean));

        deletedQuizIds.forEach(quizId => {
            state.auth.quizChallengeAchievements.delete(quizId);
            state.auth.studioActivity?.quizzes?.delete(quizId);
        });
        if (targets?.folderId) {
            state.auth.studioActivity?.folders?.delete(targets.folderId);
        }

        if (deletedQuestionIds.size) {
            const keepQuestion = question => !deletedQuestionIds.has(normalizeSheetText(question?.sourceQuestionId));
            state.sourceQuestions = state.sourceQuestions.filter(keepQuestion);
            state.questions = state.questions.filter(keepQuestion);
            state.questionQueue = state.questionQueue.filter(keepQuestion);
        }

        if (state.auth.editingQuizId && deletedQuizIds.has(normalizeSheetText(state.auth.editingQuizId))) {
            clearCreatorInputs();
            state.auth.studioQuizQuestions = [];
            state.auth.studioHasUnsavedChanges = false;
            renderStudioQuestionList();
        }

        if (normalizeSheetText(state.auth.studioQuizFolderFilterId) === targets?.folderId) {
            state.auth.studioQuizFolderFilterId = '';
        }
    }

    async function handleDeleteFolder(folderId) {
        let targets = null;
        try {
            targets = await loadFolderDeleteTargets(folderId);
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not inspect the folder before deleting.', 'error');
            return;
        }

        const quizLabel = targets.quizCount === 1 ? '1 quiz' : `${targets.quizCount} quizzes`;
        const questionLabel = targets.questionCount === 1 ? '1 question' : `${targets.questionCount} questions`;
        const confirmMessage = targets.quizCount
            ? `Delete folder "${targets.folderName}" and all contents? This will permanently delete ${quizLabel} and ${questionLabel}. This cannot be undone.`
            : `Delete folder "${targets.folderName}"? This folder has no quizzes. This cannot be undone.`;
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            setCreatorProgressStatus('Deleting folder', targets.quizCount ? 'checking linked media' : 'removing empty folder');
            const mediaRefsToDelete = new Set();
            for (let index = 0; index < targets.quizIds.length; index += 1) {
                const quizId = targets.quizIds[index];
                setCreatorProgressStatus('Deleting folder', `checking quiz media ${index + 1} of ${targets.quizIds.length}`);
                const refs = await getQuizMediaReferences(quizId);
                refs.forEach(ref => mediaRefsToDelete.add(ref));
            }

            if (targets.quizIds.length) {
                await deleteChallengeRowsForQuizzes(targets.quizIds);
                await deleteStudioActivityForDeletedFolder(targets.folderId, targets.quizIds);

                setCreatorProgressStatus('Deleting folder', `removing ${quizLabel}`);
                const { error: quizDeleteError } = await state.auth.client
                    .from('quizzes')
                    .delete()
                    .in('id', targets.quizIds);
                if (quizDeleteError) throw quizDeleteError;
            } else {
                await deleteStudioActivityForDeletedFolder(targets.folderId, []);
            }

            setCreatorProgressStatus('Deleting folder', 'removing folder');
            const { error: folderDeleteError } = await state.auth.client
                .from('folders')
                .delete()
                .eq('id', targets.folderId);
            if (folderDeleteError) throw folderDeleteError;

            const mediaCount = mediaRefsToDelete.size;
            setCreatorProgressStatus('Deleting folder', mediaCount ? `cleaning ${mediaCount} linked ${mediaCount === 1 ? 'media file' : 'media files'}` : 'no linked media to clean');
            await deleteSupabaseMediaReferences(mediaRefsToDelete);

            clearDeletedFolderLocalState(targets);
            syncQuestionStarButton();
            updateProgress();

            setCreatorProgressStatus('Deleting folder', 'refreshing Quiz Studio');
            const selectedQuizValue = elements.quizSelector?.value || '';
            const selectedQuizId = normalizeSheetText(selectedQuizValue).startsWith('sb:') ? selectedQuizValue.slice(3) : '';
            const selectedFolderValue = normalizeFolderName(elements.folderSelector?.value || '');
            const currentSelectedWasDeleted = !!selectedQuizId && targets.quizIds.includes(selectedQuizId);
            const currentFolderDeckWasDeleted = selectedQuizValue.startsWith('fd:') && selectedFolderValue === normalizeFolderName(targets.folderName);
            await refreshStudioManagementData();
            await refreshQuizCatalog({ clearIfMissing: currentSelectedWasDeleted || currentFolderDeckWasDeleted });
            setCreatorStatus(`Folder deleted with ${quizLabel} and ${questionLabel}.`, 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not delete the folder and its contents.', 'error');
        }
    }

    async function loadQuizIntoEditor(quizId, preferredQuestionId = null, options = {}) {
        try {
            if (!options.force && state.auth.studioHasUnsavedChanges) {
                const saved = await autosaveStudioChanges({ reason: 'load a different quiz', allowCreate: true });
                if (!saved) return;
            }
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
                .select('id, folder_id, name, description')
                .eq('id', quizId)
                .maybeSingle();

            if (quizError) throw quizError;
            if (!quizRow) {
                throw new Error('Could not load the selected quiz for editing.');
            }

            state.auth.editingQuizId = quizRow.id;
            state.auth.pendingInsertAfterQuestionId = null;
            state.auth.editingQuizType = managedQuiz.quizType || 'multiple_choice';
            setStudioDiagramSharingState({
                ...getDiagramSharingFromDescription(quizRow.description || ''),
                questionOverride: false
            });
            state.auth.studioQuestionSearchQuery = '';
            state.auth.studioQuestionStarredOnly = false;
            state.auth.studioActiveBuildUpString = '';
            state.auth.studioFocusedBuildUpString = '';
            state.auth.studioFocusedQuestionId = '';
            if (elements.studioQuestionSearchInput) elements.studioQuestionSearchInput.value = '';
            syncStudioQuestionStarredFilterButton();
            if (elements.studioQuestionJumpInput) elements.studioQuestionJumpInput.value = '';
            if (elements.createQuizFolderSelect) elements.createQuizFolderSelect.value = quizRow.folder_id || '';
            if (elements.createQuizName) elements.createQuizName.value = normalizeSheetText(quizRow.name);
            if (elements.createQuizTypeSelect) elements.createQuizTypeSelect.value = state.auth.editingQuizType;

            const questionRows = await loadStudioQuestionListForQuiz(quizRow.id);
            await ensureSharedDiagramSourceQuestionForRows(quizRow.id, questionRows);
            const repairedSharing = state.auth.studioDiagramSharing || createDefaultDiagramSharingState();
            const repairedSourceQuestionId = getDiagramSharingSourceQuestionId(repairedSharing);
            const repairedSourceRow = repairedSourceQuestionId
                ? questionRows.find(question => normalizeSheetText(question?.id) === repairedSourceQuestionId)
                : null;
            if (state.auth.editingQuizType === 'diagrams'
                && repairedSharing.useSharedImage
                && !normalizeSheetText(repairedSharing.sharedImageUrl)
                && normalizeSheetText(repairedSourceRow?.image_url)) {
                await persistStudioDiagramSharingState(quizRow.id, {
                    ...repairedSharing,
                    sharedImageUrl: normalizeSheetText(repairedSourceRow.image_url),
                    sharedImageLabel: repairedSharing.sharedImageLabel || 'Shared diagram image recovered from source question.',
                    sharedImageName: getSharedDiagramImageName(repairedSharing)
                });
            }
            const sourceQuestionId = getDiagramSharingSourceQuestionId(state.auth.studioDiagramSharing);
            const normalizedPreferredQuestionId = normalizeSheetText(preferredQuestionId);
            const preferredQuestionStillExists = !!getStudioQuestionRowById(normalizedPreferredQuestionId, questionRows);
            const sourceQuestionStillExists = !!getStudioQuestionRowById(sourceQuestionId, questionRows);
            const targetQuestionId = preferredQuestionStillExists
                ? normalizedPreferredQuestionId
                : (sourceQuestionStillExists ? sourceQuestionId : (getFirstStudioQuestionId(questionRows) || null));
            if (normalizedPreferredQuestionId && !preferredQuestionStillExists) {
                console.warn('Preferred question was not found while loading the quiz editor; loading a valid question instead.', { preferredQuestionId: normalizedPreferredQuestionId, targetQuestionId });
                clearStudioQuestionDraft(normalizedPreferredQuestionId);
            }

            if (targetQuestionId) {
                await loadStudioQuestionIntoEditor(targetQuestionId, { suppressStatus: true });
            } else {
                clearStudioQuestionInputs();
            }

            updateCreateQuizModeUI();
            openQuizStudioPage('editor');
            recordStudioQuizActivity(quizRow.id, 'edited').catch(err => console.warn(err));
            const nextItemTypeLabel = state.auth.editingQuizType === 'flashcard' ? 'flashcard' : (state.auth.editingQuizType === 'hierarchy' ? 'hierarchy question' : (state.auth.editingQuizType === 'classify' ? 'classify question' : (state.auth.editingQuizType === 'diagrams' ? 'diagram question' : 'question')));
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

            await recordStudioQuizActivity(quizId, 'metadata_updated');
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
                image_url: '',
                learning_resources_html: questionRow.learning_resources_html || '',
                learning_resources_image_url: '',
                sort_order: targetSortOrder
            })
            .select('id')
            .single();

        if (insertQuestionError) throw insertQuestionError;
        const newQuestionId = insertedQuestion.id;

        const clonedQuestionMedia = await cloneMediaRefsInObject({
            image_url: questionRow.image_url || '',
            learning_resources_image_url: questionRow.learning_resources_image_url || ''
        }, { quizId: targetQuizId, questionId: newQuestionId });
        const { error: mediaUpdateError } = await state.auth.client.from('questions').update({
            image_url: clonedQuestionMedia.image_url || '',
            learning_resources_image_url: clonedQuestionMedia.learning_resources_image_url || ''
        }).eq('id', newQuestionId);
        if (mediaUpdateError) throw mediaUpdateError;

        if (questionRow.question_type === 'flashcard') {
            const detail = await loadFlashcardDetailByQuestionId(sourceQuestionId);
            if (!detail) throw new Error('Could not load the source flashcard details.');
            const clonedFlashcardMedia = await cloneMediaRefsInObject({
                term_image_url: detail.term_image_url || '',
                definition_image_url: detail.definition_image_url || ''
            }, { quizId: targetQuizId, questionId: newQuestionId });
            const { error } = await state.auth.client.from('flashcard_questions').insert({
                question_id: newQuestionId,
                term_html: detail.term_html || '',
                definition_html: detail.definition_html || '',
                term_plain: detail.term_plain || '',
                definition_plain: detail.definition_plain || '',
                term_image_url: clonedFlashcardMedia.term_image_url || '',
                definition_image_url: clonedFlashcardMedia.definition_image_url || ''
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
            const clonedClassifyMedia = await cloneMediaRefsInObject({
                items_json: Array.isArray(detail.items_json) ? detail.items_json : (detail.items_json || []),
                classifications_json: Array.isArray(detail.classifications_json) ? detail.classifications_json : (detail.classifications_json || [])
            }, { quizId: targetQuizId, questionId: newQuestionId });
            const { error } = await state.auth.client.from('classify_questions').insert({
                question_id: newQuestionId,
                items_json: clonedClassifyMedia.items_json || [],
                classifications_json: clonedClassifyMedia.classifications_json || []
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
            const sourceOptionsJson = detail.options_json || [];
            const sourceOptions = getOptionsJsonOptions(sourceOptionsJson);
            const clonedOptionsJson = await cloneMediaRefsInObject(sourceOptionsJson, {
                quizId: targetQuizId,
                questionId: newQuestionId,
                usageContext: 'multiple_choice_option_image'
            });
            detailPayload.options_json = clonedOptionsJson;
            const clonedOptions = getOptionsJsonOptions(clonedOptionsJson);
            const sourceCorrectAnswer = normalizeSheetText(detail.correct_answer);
            const sourceCorrectIndex = sourceOptions.findIndex(option => getOptionAnswerValue({
                text: normalizeSheetText(option?.text),
                imageUrl: normalizeSheetText(option?.imageUrl || option?.image_url)
            }) === sourceCorrectAnswer);
            if (sourceCorrectIndex >= 0) {
                const clonedCorrectOption = clonedOptions[sourceCorrectIndex] || {};
                detailPayload.correct_answer = getOptionAnswerValue({
                    text: normalizeSheetText(clonedCorrectOption?.text),
                    imageUrl: normalizeSheetText(clonedCorrectOption?.imageUrl || clonedCorrectOption?.image_url)
                });
            }
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
        if (state.auth.studioHasUnsavedChanges) {
            cacheCurrentStudioQuestionDraft();
        }

        try {
            const nextSortOrder = await getNextQuestionSortOrder(state.auth.editingQuizId);
            const duplicatedQuestionId = await duplicateQuestionRecord(state.auth.editingQuestionId, state.auth.editingQuizId, nextSortOrder);
            await loadStudioQuestionListForQuiz(state.auth.editingQuizId);
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${state.auth.editingQuizId}`, loadSelectedQuiz: true });
            await loadStudioQuestionIntoEditor(duplicatedQuestionId, { suppressStatus: true, revealInList: true, focusListButton: true });
            setCreatorStatus('Question duplicated and opened.', 'success');
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
                    description: '',
                    sort_order: nextSortOrder,
                    is_archived: false
                })
                .select('id')
                .single();
            if (insertQuizError) throw insertQuizError;
            const newQuizId = insertedQuiz.id;

            let clonedDescription = '';
            if (normalizeSheetText(quizRow.description)) {
                clonedDescription = await cloneQuizDescriptionMediaReferences(quizRow.description, { quizId: newQuizId, questionId: null });
                const { error: descriptionCloneError } = await state.auth.client
                    .from('quizzes')
                    .update({ description: clonedDescription || '' })
                    .eq('id', newQuizId);
                if (descriptionCloneError) throw descriptionCloneError;
            }

            const { data: sourceQuestions, error: sourceQuestionsError } = await state.auth.client
                .from('questions')
                .select('id, sort_order')
                .eq('quiz_id', quizId)
                .order('sort_order', { ascending: true });
            if (sourceQuestionsError) throw sourceQuestionsError;

            const duplicatedQuestionIdMap = new Map();
            for (const [index, question] of (sourceQuestions || []).entries()) {
                const duplicatedQuestionId = await duplicateQuestionRecord(question.id, newQuizId, index);
                duplicatedQuestionIdMap.set(question.id, duplicatedQuestionId);
            }
            const remappedDescription = remapDiagramSharingSourceQuestionId(clonedDescription, duplicatedQuestionIdMap);
            if (remappedDescription !== clonedDescription) {
                const { error: sourceRemapError } = await state.auth.client
                    .from('quizzes')
                    .update({ description: remappedDescription || '' })
                    .eq('id', newQuizId);
                if (sourceRemapError) throw sourceRemapError;
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
            setCreatorProgressStatus('Deleting quiz', 'checking linked media');
            const mediaRefsToDelete = await getQuizMediaReferences(quizId, ({ current, total }) => {
                if (total) {
                    setCreatorProgressStatus('Deleting quiz', `checking media ${current} of ${total}`);
                }
            });
            const mediaCount = mediaRefsToDelete.size;

            setCreatorProgressStatus('Deleting quiz', 'removing quiz data');
            const { error } = await state.auth.client
                .from('quizzes')
                .delete()
                .eq('id', quizId);

            if (error) throw error;
            setCreatorProgressStatus('Deleting quiz', mediaCount ? `cleaning ${mediaCount} linked ${mediaCount === 1 ? 'media file' : 'media files'}` : 'no linked media to clean');
            await deleteSupabaseMediaReferences(mediaRefsToDelete);

            if (state.auth.editingQuizId === quizId) {
                clearCreatorInputs();
                state.auth.studioQuizQuestions = [];
                renderStudioQuestionList();
            }

            setCreatorProgressStatus('Deleting quiz', 'refreshing Quiz Studio');
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

    function getImportQuizTypeLabel(quizType = '') {
        const labels = {
            multiple_choice: 'Multiple Choice',
            flashcard: 'Flashcard',
            hierarchy: 'Hierarchy',
            classify: 'Classify',
            diagrams: 'Diagrams',
            mixed: 'Mixed types'
        };
        return labels[quizType] || normalizeSheetText(quizType).replace(/_/g, ' ') || 'Unknown type';
    }

    function normalizeSupabaseQuizId(value = '') {
        const normalized = normalizeSheetText(value);
        return normalized.startsWith('sb:') ? normalized.slice(3) : normalized;
    }

    async function getImportAppendTargetContext(quizId) {
        const normalizedQuizId = normalizeSupabaseQuizId(quizId);
        if (!normalizedQuizId) {
            throw new Error('Choose the existing quiz you want to add questions to.');
        }

        let managedQuiz = state.auth.managedQuizzes.find(quiz => quiz.id === normalizedQuizId) || null;
        if (!managedQuiz) {
            await loadManagedSupabaseQuizzes();
            managedQuiz = state.auth.managedQuizzes.find(quiz => quiz.id === normalizedQuizId) || null;
        }
        if (!managedQuiz) {
            throw new Error('Could not find that existing quiz. Refresh Quiz Studio and try again.');
        }

        const rows = await fetchAllSupabaseRows(
            () => state.auth.client
                .from('questions')
                .select('id, question_type, sort_order')
                .eq('quiz_id', normalizedQuizId)
                .order('sort_order', { ascending: true }),
            { label: 'append target question rows' }
        );
        const questionRows = Array.isArray(rows) ? rows : [];
        const types = questionRows.map(row => normalizeSheetText(row.question_type || 'multiple_choice') || 'multiple_choice');
        const uniqueTypes = Array.from(new Set(types));
        const quizType = uniqueTypes.length === 1
            ? uniqueTypes[0]
            : (questionRows.length ? 'mixed' : (managedQuiz.quizType || 'multiple_choice'));
        const maxSortOrder = questionRows.reduce((maxValue, row, index) => {
            const sortOrder = Number(row.sort_order);
            return Math.max(maxValue, Number.isFinite(sortOrder) ? sortOrder : index);
        }, -1);

        return {
            quizId: normalizedQuizId,
            quizName: managedQuiz.name,
            quizType,
            questionCount: questionRows.length,
            maxSortOrder,
            folderId: managedQuiz.folderId || ''
        };
    }

    function validateImportAppendTarget(appendContext, sourceQuizType) {
        if (!appendContext?.quizId) {
            throw new Error('Choose the existing quiz you want to add questions to.');
        }
        if (appendContext.quizType === 'mixed') {
            throw new Error(`Cannot add questions to "${appendContext.quizName}" because it already contains mixed question types.`);
        }
        if (appendContext.questionCount > 0 && appendContext.quizType !== sourceQuizType) {
            throw new Error(`Cannot add ${getImportQuizTypeLabel(sourceQuizType)} questions to "${appendContext.quizName}" because that quiz is ${getImportQuizTypeLabel(appendContext.quizType)}.`);
        }
    }

    function validateGoogleSheetImportQuestions(sourceQuestions, contextLabel = 'Google Sheet tab') {
        if (!Array.isArray(sourceQuestions) || !sourceQuestions.length) {
            throw new Error(`${contextLabel} does not have importable questions.`);
        }

        const quizType = getQuestionTypeForImport(sourceQuestions[0]);
        const invalidMixedTypes = sourceQuestions.some(question => getQuestionTypeForImport(question) !== quizType);
        if (invalidMixedTypes) {
            throw new Error('Mixed-type Google Sheet tabs are not supported yet. Keep one quiz type per tab.');
        }

        sourceQuestions.forEach((question, index) => {
            const rowLabel = `Row ${index + 2}`;
            if (quizType === 'flashcard') {
                if (!normalizeSheetText(question.termText) || !normalizeSheetText(question.definitionText)) {
                    throw new Error(`${rowLabel}: flashcards need both a term and a definition.`);
                }
                return;
            }

            if (!normalizeSheetText(question.question)) {
                throw new Error(`${rowLabel}: enter a question prompt.`);
            }

            if (quizType === 'hierarchy') {
                const options = Array.isArray(question.options) ? question.options.map(normalizeSheetText).filter(Boolean) : [];
                const order = Array.isArray(question.correctOrder) ? question.correctOrder : [];
                if (options.length < 2) {
                    throw new Error(`${rowLabel}: hierarchy questions need at least 2 items.`);
                }
                if (order.length !== options.length) {
                    throw new Error(`${rowLabel}: hierarchy correct-order columns must include one position for each item.`);
                }
                if (order.some(value => !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > options.length)) {
                    throw new Error(`${rowLabel}: hierarchy positions must be whole numbers from 1 to ${options.length}.`);
                }
                if (new Set(order.map(Number)).size !== order.length) {
                    throw new Error(`${rowLabel}: hierarchy positions must be unique.`);
                }
                return;
            }

            if (quizType === 'classify') {
                const classifications = Array.isArray(question.classifications) ? question.classifications : [];
                const items = Array.isArray(question.items) ? question.items : [];
                const classIds = new Set(classifications.map(item => normalizeClassificationId(item.id)).filter(Boolean));
                if (!classifications.length || !classIds.size) {
                    throw new Error(`${rowLabel}: classify questions need at least one class label and class ID.`);
                }
                if (!items.length) {
                    throw new Error(`${rowLabel}: classify questions need at least one item.`);
                }
                const missingClass = items.find(item => !classIds.has(normalizeClassificationId(item.correctClassificationId)));
                if (missingClass) {
                    throw new Error(`${rowLabel}: each classify item needs a class ID that matches one of the class ID columns.`);
                }
                return;
            }

            const options = Array.isArray(question.options) ? question.options.map(normalizeSheetText).filter(Boolean) : [];
            const correctAnswer = normalizeSheetText(question.correct);
            if (options.length < 2) {
                throw new Error(`${rowLabel}: multiple-choice questions need at least 2 filled option columns.`);
            }
            if (!correctAnswer) {
                throw new Error(`${rowLabel}: enter a correct answer or a valid correct_option number.`);
            }
            if (!options.includes(correctAnswer)) {
                throw new Error(`${rowLabel}: correct answer must exactly match an option, or correct_option must point to a filled option column.`);
            }
        });

        return quizType;
    }

    async function importMultipleChoiceQuestionToSupabase(quizId, question, sortOrder) {
        const { data, error } = await state.auth.client
            .from('questions')
            .insert({
                quiz_id: quizId,
                question_type: 'multiple_choice',
                prompt_html: buildStoredHtmlFromPlain(question.question),
                prompt_plain: normalizeSheetText(question.question),
                image_url: '',
                learning_resources_html: buildStoredHtmlFromPlain(question.learningResources),
                learning_resources_image_url: '',
                sort_order: sortOrder
            })
            .select('id')
            .single();
        if (error) throw error;
        const questionId = data?.id;
        const savedSharedMedia = await savePrivateMediaValues({
            image_url: normalizeSheetText(question.image),
            learning_resources_image_url: normalizeSheetText(question.learningResourcesImage)
        }, { quizId, questionId });
        const { error: mediaUpdateError } = await state.auth.client.from('questions').update({
            image_url: savedSharedMedia.image_url || '',
            learning_resources_image_url: savedSharedMedia.learning_resources_image_url || ''
        }).eq('id', questionId);
        if (mediaUpdateError) throw mediaUpdateError;
        const options = Array.isArray(question.options) ? question.options.map(option => normalizeSheetText(option)).filter(Boolean) : [];
        const explanations = Array.isArray(question.explanations) ? question.explanations.map(value => normalizeSheetText(value)) : [];
        const correctAnswer = normalizeSheetText(question.correct);
        const correctIndex = options.findIndex(option => option === correctAnswer);
        const optionPayload = options.map((optionText, index) => ({ text: optionText, explanation_html: buildStoredHtmlFromPlain(explanations[index] || '') }));
        const optionsJsonPayload = buildMultipleChoiceOptionsJsonPayload(optionPayload, question.buildUp);
        const detailPayload = {
            question_id: questionId,
            correct_answer: correctAnswer,
            correct_explanation_html: buildStoredHtmlFromPlain(correctIndex >= 0 ? (explanations[correctIndex] || '') : ''),
            options_json: optionsJsonPayload,
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
                learning_resources_image_url: '',
                sort_order: sortOrder
            })
            .select('id')
            .single();
        if (error) throw error;
        const questionId = data.id;
        const savedSharedMedia = await savePrivateMediaValues({
            learning_resources_image_url: normalizeSheetText(question.learningResourcesImage)
        }, { quizId, questionId });
        const { error: mediaUpdateError } = await state.auth.client.from('questions').update({
            learning_resources_image_url: savedSharedMedia.learning_resources_image_url || ''
        }).eq('id', questionId);
        if (mediaUpdateError) throw mediaUpdateError;
        const savedFlashcardMedia = await savePrivateMediaValues({
            term_image_url: normalizeSheetText(question.termImage),
            definition_image_url: normalizeSheetText(question.definitionImage)
        }, { quizId, questionId });
        const { error: detailError } = await state.auth.client.from('flashcard_questions').upsert({
            question_id: questionId,
            term_html: buildStoredHtmlFromPlain(term),
            definition_html: buildStoredHtmlFromPlain(definition),
            term_plain: term,
            definition_plain: definition,
            term_image_url: savedFlashcardMedia.term_image_url || '',
            definition_image_url: savedFlashcardMedia.definition_image_url || ''
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
                image_url: '',
                learning_resources_html: buildStoredHtmlFromPlain(question.learningResources),
                learning_resources_image_url: '',
                sort_order: sortOrder
            })
            .select('id')
            .single();
        if (error) throw error;
        const questionId = data.id;
        const savedSharedMedia = await savePrivateMediaValues({
            image_url: normalizeSheetText(question.image),
            learning_resources_image_url: normalizeSheetText(question.learningResourcesImage)
        }, { quizId, questionId });
        const { error: mediaUpdateError } = await state.auth.client.from('questions').update({
            image_url: savedSharedMedia.image_url || '',
            learning_resources_image_url: savedSharedMedia.learning_resources_image_url || ''
        }).eq('id', questionId);
        if (mediaUpdateError) throw mediaUpdateError;
        const itemTexts = Array.isArray(question.options) ? question.options.map(value => normalizeSheetText(value)).slice(0, 10) : [];
        const detailPayload = { question_id: questionId, correct_order_json: Array.isArray(question.correctOrder) ? question.correctOrder : [] };
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
                image_url: '',
                learning_resources_html: buildStoredHtmlFromPlain(question.learningResources),
                learning_resources_image_url: '',
                sort_order: sortOrder
            })
            .select('id')
            .single();
        if (error) throw error;
        const questionId = data.id;
        const savedSharedMedia = await savePrivateMediaValues({
            image_url: normalizeSheetText(question.image),
            learning_resources_image_url: normalizeSheetText(question.learningResourcesImage)
        }, { quizId, questionId });
        const { error: mediaUpdateError } = await state.auth.client.from('questions').update({
            image_url: savedSharedMedia.image_url || '',
            learning_resources_image_url: savedSharedMedia.learning_resources_image_url || ''
        }).eq('id', questionId);
        if (mediaUpdateError) throw mediaUpdateError;
        const sourceClassifications = Array.isArray(question.classifications) ? question.classifications.map(classification => ({
            label: normalizeSheetText(classification?.label),
            imageUrl: normalizeSheetText(classification?.imageUrl),
            id: normalizeSheetText(classification?.id)
        })).filter(classification => classification.id && (classification.label || classification.imageUrl)) : [];
        const sourceItems = Array.isArray(question.items) ? question.items.map((item, index) => ({
            kind: normalizeSheetText(item?.kind || (item?.imageUrl ? 'image' : 'text')) || 'text',
            raw: normalizeSheetText(item?.raw || item?.text || `classify_item_${index + 1}`),
            imageUrl: normalizeSheetText(item?.imageUrl),
            text: normalizeSheetText(item?.text || item?.raw),
            dragLabel: normalizeSheetText(item?.dragLabel || item?.text || item?.raw || `Image item ${index + 1}`),
            ariaLabel: normalizeSheetText(item?.ariaLabel || (item?.text ? `Classify item ${item.text}` : `Classify image item ${index + 1}`)),
            correctClassificationId: normalizeSheetText(item?.correctClassificationId)
        })) : [];
        const classifyMediaDrafts = await saveClassifyDraftMediaValues(quizId, questionId, sourceClassifications, sourceItems);
        const classificationsJson = classifyMediaDrafts.categories;
        const itemsJson = classifyMediaDrafts.items;
        const { error: detailError } = await state.auth.client.from('classify_questions').upsert({
            question_id: questionId,
            items_json: itemsJson,
            classifications_json: classificationsJson
        }, { onConflict: 'question_id' });
        if (detailError) throw detailError;
    }

    async function importGoogleSheetsQuestionsToSupabaseQuiz(quizId, questions, options = {}) {
        const total = questions.length;
        const startSortOrder = Number.isFinite(Number(options.startSortOrder)) ? Number(options.startSortOrder) : 0;
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        if (onProgress) onProgress({ phase: 'questions-start', current: 0, total });
        for (let index = 0; index < total; index += 1) {
            const question = questions[index];
            const sortOrder = startSortOrder + index;
            const questionType = getQuestionTypeForImport(question);
            if (onProgress) onProgress({ phase: 'question', current: index + 1, total, questionType });
            if (questionType === 'flashcard') {
                await importFlashcardQuestionToSupabase(quizId, question, sortOrder);
            } else if (questionType === 'hierarchy') {
                await importHierarchyQuestionToSupabase(quizId, question, sortOrder);
            } else if (questionType === 'classify') {
                await importClassifyQuestionToSupabase(quizId, question, sortOrder);
            } else {
                await importMultipleChoiceQuestionToSupabase(quizId, question, sortOrder);
            }
            if (onProgress) onProgress({ phase: 'question-complete', current: index + 1, total, questionType });
        }
    }

    function setImportProgressFromEvent(operationLabel, progress = {}) {
        const current = Number(progress.current || 0);
        const total = Number(progress.total || 0);
        if (progress.phase === 'reading') {
            setCreatorProgressStatus(operationLabel, 'reading source questions');
        } else if (progress.phase === 'creating-quiz') {
            setCreatorProgressStatus(operationLabel, 'creating quiz');
        } else if (progress.phase === 'appending-quiz') {
            setCreatorProgressStatus(operationLabel, 'checking existing quiz');
        } else if ((progress.phase === 'question' || progress.phase === 'question-complete') && total) {
            setCreatorProgressStatus(operationLabel, `adding question ${current} of ${total}`);
        } else if (progress.phase === 'refreshing') {
            setCreatorProgressStatus(operationLabel, 'refreshing Quiz Studio');
        }
    }

    async function importGoogleSheetsQuizDescriptorToSupabase(quizDescriptor, targetFolderId = '', options = {}) {
        const descriptor = isQuizDescriptor(quizDescriptor) ? quizDescriptor : getQuizBySelectorValue(quizDescriptor);
        if (!descriptor || descriptor.source !== DATA_SOURCES.GOOGLE_SHEETS) {
            throw new Error('Choose a valid Google Sheets quiz to import.');
        }

        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        if (onProgress) onProgress({ phase: 'reading', quizName: descriptor.name });
        const sourceQuestions = await loadQuestionsFromGoogleSheets(descriptor.sheet);
        const quizType = validateGoogleSheetImportQuestions(sourceQuestions, 'The selected Google Sheets quiz');

        const appendToQuizId = normalizeSupabaseQuizId(options.appendToQuizId);
        if (appendToQuizId) {
            const appendContext = await getImportAppendTargetContext(appendToQuizId);
            validateImportAppendTarget(appendContext, quizType);
            if (onProgress) onProgress({ phase: 'appending-quiz', quizName: appendContext.quizName, total: sourceQuestions.length });
            await importGoogleSheetsQuestionsToSupabaseQuiz(appendContext.quizId, sourceQuestions, {
                startSortOrder: appendContext.maxSortOrder + 1,
                onProgress: progress => onProgress?.({ ...progress, quizName: appendContext.quizName })
            });
            return {
                quizId: appendContext.quizId,
                quizName: appendContext.quizName,
                sourceQuizName: descriptor.name,
                questionCount: sourceQuestions.length,
                totalQuestionCount: appendContext.questionCount + sourceQuestions.length,
                quizType,
                folderId: appendContext.folderId,
                appended: true
            };
        }

        if (onProgress) onProgress({ phase: 'creating-quiz', quizName: descriptor.name, total: sourceQuestions.length });
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

        await importGoogleSheetsQuestionsToSupabaseQuiz(quizRow.id, sourceQuestions, {
            onProgress: progress => onProgress?.({ ...progress, quizName: descriptor.name })
        });
        return { quizId: quizRow.id, quizName: descriptor.name, questionCount: sourceQuestions.length, quizType, folderId };
    }



    function normalizeImportSectionValue(value) {
        return normalizeSheetText(value).replace(/^'+/, '').replace(/\s+/g, ' ');
    }

    function normalizeBuildUpValue(value) {
        return normalizeSheetText(value).replace(/^'+/, '').replace(/\s+/g, ' ');
    }

    function getBuildUpValueFromOptionsJson(optionsJson) {
        if (!optionsJson || typeof optionsJson !== 'object') return '';
        if (!Array.isArray(optionsJson)) {
            return normalizeBuildUpValue(
                optionsJson.buildUp
                || optionsJson.build_up
                || optionsJson.buildUpGroup
                || optionsJson.build_up_group
            );
        }
        const optionWithBuildUp = optionsJson.find(item => normalizeBuildUpValue(item?.buildUp || item?.build_up || item?.buildUpGroup || item?.build_up_group));
        return normalizeBuildUpValue(
            optionWithBuildUp?.buildUp
            || optionWithBuildUp?.build_up
            || optionWithBuildUp?.buildUpGroup
            || optionWithBuildUp?.build_up_group
        );
    }

    function buildMultipleChoiceOptionsJsonPayload(optionPayload = [], buildUpValue = '') {
        const normalizedBuildUp = normalizeBuildUpValue(buildUpValue);
        return normalizedBuildUp
            ? { options: optionPayload, buildUp: normalizedBuildUp }
            : optionPayload;
    }

    async function getMultipleChoiceBuildUpByQuestionId(questionId = '') {
        const normalizedQuestionId = normalizeSheetText(questionId);
        if (!normalizedQuestionId) return '';
        try {
            const detail = await loadMultipleChoiceDetailByQuestionId(normalizedQuestionId);
            return getBuildUpValueFromOptionsJson(detail?.options_json);
        } catch (error) {
            console.warn('Could not load existing Build Up string metadata:', error);
            return '';
        }
    }

    function getSectionedImportGroups(sourceQuestions = []) {
        const groups = [];
        const groupMap = new Map();
        sourceQuestions.forEach(question => {
            const section = normalizeImportSectionValue(question?.section);
            const key = section || '__unsectioned__';
            if (!groupMap.has(key)) {
                const group = { section, questions: [] };
                groupMap.set(key, group);
                groups.push(group);
            }
            groupMap.get(key).questions.push(question);
        });
        return groups;
    }

    function buildSectionedImportQuizName(baseQuizName, fallbackQuizName, section = '') {
        const resolvedBase = normalizeSheetText(baseQuizName) || normalizeSheetText(fallbackQuizName) || 'Imported quiz';
        const resolvedSection = normalizeImportSectionValue(section);
        return resolvedSection ? `${resolvedBase} - ${resolvedSection}` : resolvedBase;
    }

    async function importGoogleSheetTemplateToSupabase(sheetInput, sheetTabName, quizName, targetFolderId = '', options = {}) {
        const sheetId = extractGoogleSheetId(sheetInput);
        if (!sheetId) {
            throw new Error('Paste a valid Google Sheets URL or sheet ID.');
        }

        const resolvedTabName = normalizeSheetText(sheetTabName);
        if (!resolvedTabName) {
            throw new Error('Enter the Google Sheets tab name from your template.');
        }

        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        if (onProgress) onProgress({ phase: 'reading', quizName: resolvedTabName });
        const sourceQuestions = await loadQuestionsFromGoogleSheetDocument(sheetId, resolvedTabName);
        const quizType = validateGoogleSheetImportQuestions(sourceQuestions, 'That Google Sheet tab');

        const appendToQuizId = normalizeSupabaseQuizId(options.appendToQuizId);
        if (appendToQuizId) {
            const appendContext = await getImportAppendTargetContext(appendToQuizId);
            validateImportAppendTarget(appendContext, quizType);
            if (onProgress) onProgress({ phase: 'appending-quiz', quizName: appendContext.quizName, total: sourceQuestions.length });
            await importGoogleSheetsQuestionsToSupabaseQuiz(appendContext.quizId, sourceQuestions, {
                startSortOrder: appendContext.maxSortOrder + 1,
                onProgress: progress => onProgress?.({ ...progress, quizName: appendContext.quizName })
            });
            return {
                quizId: appendContext.quizId,
                quizName: appendContext.quizName,
                sourceQuizName: resolvedTabName,
                questionCount: sourceQuestions.length,
                totalQuestionCount: appendContext.questionCount + sourceQuestions.length,
                quizType,
                folderId: appendContext.folderId,
                appended: true
            };
        }

        const folderId = normalizeSheetText(targetFolderId);
        const nextSortOrder = state.auth.managedQuizzes
            .filter(quiz => (quiz.folderId || '') === (folderId || ''))
            .reduce((maxValue, quiz) => Math.max(maxValue, Number(quiz.sortOrder ?? 0)), -1) + 1;
        const sectionGroups = getSectionedImportGroups(sourceQuestions);
        const createdQuizzes = [];

        for (let groupIndex = 0; groupIndex < sectionGroups.length; groupIndex += 1) {
            const group = sectionGroups[groupIndex];
            const finalQuizName = buildSectionedImportQuizName(quizName, resolvedTabName, group.section);
            if (onProgress) {
                onProgress({
                    phase: 'creating-quiz',
                    quizName: finalQuizName,
                    total: group.questions.length,
                    groupCurrent: groupIndex + 1,
                    groupTotal: sectionGroups.length
                });
            }

            const { data: quizRow, error: quizError } = await state.auth.client
                .from('quizzes')
                .insert({
                    user_id: state.auth.user.id,
                    folder_id: folderId || null,
                    name: finalQuizName,
                    description: '',
                    sort_order: nextSortOrder + groupIndex,
                    is_archived: false
                })
                .select('id')
                .single();
            if (quizError) throw quizError;

            await importGoogleSheetsQuestionsToSupabaseQuiz(quizRow.id, group.questions, {
                onProgress: progress => onProgress?.({
                    ...progress,
                    quizName: finalQuizName,
                    groupCurrent: groupIndex + 1,
                    groupTotal: sectionGroups.length
                })
            });
            createdQuizzes.push({
                quizId: quizRow.id,
                quizName: finalQuizName,
                section: group.section,
                questionCount: group.questions.length
            });
        }

        const firstCreatedQuiz = createdQuizzes[0] || null;
        return {
            quizId: firstCreatedQuiz?.quizId || '',
            quizName: firstCreatedQuiz?.quizName || '',
            questionCount: sourceQuestions.length,
            quizType,
            folderId,
            quizzes: createdQuizzes,
            createdQuizCount: createdQuizzes.length,
            sectioned: createdQuizzes.some(item => normalizeImportSectionValue(item.section))
        };
    }

    async function handleImportGoogleSheetsQuiz() {
        if (!state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before importing Google Sheets quizzes.', 'error');
            return;
        }

        const quizDescriptor = getGoogleSheetsQuizDescriptorById(elements.importSourceQuizSelect?.value || '');
        if (!quizDescriptor || quizDescriptor.source !== DATA_SOURCES.GOOGLE_SHEETS) {
            setCreatorStatus('Choose a Google Sheets quiz to import.', 'error');
            return;
        }

        try {
            const appendToQuizId = isImportAppendMode(elements.importSourceDestinationModeSelect)
                ? normalizeSheetText(elements.importSourceAppendQuizSelect?.value)
                : '';
            const targetFolderId = normalizeSheetText(elements.importTargetFolderSelect?.value);
            const result = await importGoogleSheetsQuizDescriptorToSupabase(quizDescriptor, targetFolderId, {
                appendToQuizId,
                onProgress: progress => setImportProgressFromEvent(appendToQuizId ? 'Adding questions' : 'Importing quiz', progress)
            });
            setCreatorProgressStatus(appendToQuizId ? 'Adding questions' : 'Importing quiz', 'refreshing Quiz Studio');
            await refreshStudioManagementData();
            await refreshQuizCatalog({ selectQuizId: `sb:${result.quizId}` });
            renderGoogleSheetsImportControls();
            await setQuizStudioSection('manage');
            if (result.appended) {
                setCreatorStatus(`Added ${result.questionCount} ${result.questionCount === 1 ? 'question' : 'questions'} to "${result.quizName}".`, 'success');
            } else {
                setCreatorStatus(`Imported "${result.quizName}" into Supabase.`, 'success');
            }
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
            for (let index = 0; index < sourceQuizzes.length; index += 1) {
                const descriptor = sourceQuizzes[index];
                const quizPosition = `${index + 1} of ${sourceQuizzes.length}`;
                setCreatorProgressStatus('Importing folder', `quiz ${quizPosition}: ${normalizeSheetText(descriptor.name) || 'Untitled quiz'}`);
                await importGoogleSheetsQuizDescriptorToSupabase(descriptor, targetFolderId, {
                    onProgress: progress => {
                        if ((progress.phase === 'question' || progress.phase === 'question-complete') && progress.total) {
                            setCreatorProgressStatus('Importing folder', `quiz ${quizPosition}, question ${progress.current} of ${progress.total}`);
                        } else if (progress.phase === 'reading') {
                            setCreatorProgressStatus('Importing folder', `quiz ${quizPosition}: reading source questions`);
                        } else if (progress.phase === 'creating-quiz') {
                            setCreatorProgressStatus('Importing folder', `quiz ${quizPosition}: creating quiz`);
                        }
                    }
                });
                importedCount += 1;
            }
            setCreatorProgressStatus('Importing folder', 'refreshing Quiz Studio');
            await refreshStudioManagementData();
            await refreshQuizCatalog();
            renderGoogleSheetsImportControls();
            await setQuizStudioSection('manage');
            setCreatorStatus(`Imported ${importedCount} Google Sheets ${importedCount === 1 ? 'quiz' : 'quizzes'} into Supabase.`, 'success');
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not import that Google Sheets folder.', 'error');
        }
    }


    async function handleImportGoogleSheetTemplate() {
        if (!state.auth.client || !state.auth.user?.id) {
            setCreatorStatus('Sign in before importing a Google Sheet template.', 'error');
            return;
        }

        try {
            const appendToQuizId = isImportAppendMode(elements.importTemplateDestinationModeSelect)
                ? normalizeSheetText(elements.importTemplateAppendQuizSelect?.value)
                : '';
            const result = await importGoogleSheetTemplateToSupabase(
                elements.importTemplateSheetInput?.value,
                elements.importTemplateTabInput?.value,
                elements.importTemplateQuizNameInput?.value,
                normalizeSheetText(elements.importTemplateTargetFolderSelect?.value),
                {
                    appendToQuizId,
                    onProgress: progress => setImportProgressFromEvent(appendToQuizId ? 'Adding questions' : 'Importing template', progress)
                }
            );
            setCreatorProgressStatus(appendToQuizId ? 'Adding questions' : 'Importing template', 'refreshing Quiz Studio');
            await refreshStudioManagementData();
            await refreshQuizCatalog(result.quizId ? { selectQuizId: `sb:${result.quizId}` } : {});
            renderGoogleSheetsImportControls();
            await setQuizStudioSection('manage');
            if (result.appended) {
                setCreatorStatus(`Added ${result.questionCount} ${result.questionCount === 1 ? 'question' : 'questions'} to "${result.quizName}".`, 'success');
            } else if (result.sectioned && result.createdQuizCount > 1) {
                const sectionSummary = result.quizzes.map(item => `${item.section || 'base'} (${item.questionCount})`).join(', ');
                setCreatorStatus(`Imported ${result.createdQuizCount} section quizzes from the Google Sheet template: ${sectionSummary}.`, 'success');
            } else {
                setCreatorStatus(`Imported "${result.quizName}" from the Google Sheet template.`, 'success');
            }
        } catch (error) {
            console.error(error);
            setCreatorStatus(error.message || 'Could not import that Google Sheet template.', 'error');
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

function extractGoogleSheetId(value) {
    const raw = normalizeSheetText(value);
    if (!raw) return '';

    const urlMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i) || raw.match(/\/d\/([a-zA-Z0-9-_]+)/i);
    if (urlMatch?.[1]) {
        return urlMatch[1];
    }

    if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) {
        return raw;
    }

    return '';
}

async function fetchGoogleSheetRows(sheetId, sheetName) {
    const resolvedSheetId = normalizeSheetText(sheetId);
    const resolvedSheetName = normalizeSheetText(sheetName);
    if (!resolvedSheetId || !resolvedSheetName) {
        throw new Error('Enter a valid Google Sheet ID/URL and sheet tab name.');
    }

    const response = await fetch(`https://docs.google.com/spreadsheets/d/${resolvedSheetId}/gviz/tq?sheet=${encodeURIComponent(resolvedSheetName)}`);
    const text = await response.text();
    return parseGoogleSheetResponse(text).table.rows || [];
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

function getSectionCellValue(cell) {
    if (!cell) return '';

    if (cell.f !== null && cell.f !== undefined) {
        return normalizeSheetText(cell.f);
    }

    if (cell.v !== null && cell.v !== undefined) {
        return normalizeSheetText(cell.v);
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

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve('');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
        reader.readAsText(file);
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

function isProgressMode() {
    return document.getElementById('progressMode')?.checked || false;
}

function isSpeedMode() {
    return document.getElementById('rapidMode').checked;
}

function isLearningResourcesMode() {
    return document.getElementById('learningResourcesMode').checked;
}

function isAnswerFeedbackHidden() {
    return !!state.answerFeedback.hidden;
}

function isExcludeStarredEnabled() {
    return !!elements.excludeStarredQuestions?.checked;
}

function isOnlyStarredEnabled() {
    return !!elements.onlyStarredQuestions?.checked;
}

// ================= STUDY TIMER HELPERS =================
function sanitizeStudyTimerSeconds(value, fallback = 60) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, 24 * 60 * 60);
}

function getStudyTimerDurationSeconds() {
    if (!state.studyTimer.enabled) return 0;
    if (state.studyTimer.preset === 'custom') {
        return sanitizeStudyTimerSeconds(state.studyTimer.customSeconds, 60);
    }
    return sanitizeStudyTimerSeconds(state.studyTimer.preset, 60);
}

function formatStudyTimerDuration(ms) {
    const safeMs = Math.max(0, Number(ms) || 0);
    const totalSeconds = Math.ceil(safeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getStudyTimerDisplayText() {
    if (!state.studyTimer.enabled || !state.studyTimer.activeKey || isQuizFinished()) return '';
    return `⏱ ${formatStudyTimerDuration(state.studyTimer.remainingMs)}`;
}

function getStudyTimerSessionBaseKey() {
    const descriptor = state.activeQuizDescriptor || {};
    const descriptorKey = normalizeSheetText(descriptor.id || descriptor.sheetName || descriptor.name || descriptor.folder || 'active');
    return `${state.studyTimer.scope}:${descriptorKey}:${state.studyTimer.sessionToken}`;
}

function getCurrentQuestionTimerKey(question) {
    const q = question || state.questionQueue[state.currentIndex] || {};
    const qKey = normalizeSheetText(q.id || q.sourceQuestionId || `index_${state.currentIndex}`);
    return `${getStudyTimerSessionBaseKey()}:question:${qKey}:${state.currentIndex}`;
}

function stopStudyTimer({ clearDisplay = true } = {}) {
    if (state.studyTimer.intervalId) {
        clearInterval(state.studyTimer.intervalId);
        state.studyTimer.intervalId = null;
    }
    state.studyTimer.activeKey = '';
    state.studyTimer.deadlineMs = 0;
    state.studyTimer.remainingMs = 0;
    state.studyTimer.expired = false;
    if (clearDisplay) updateProgress();
}

function tickStudyTimer() {
    if (!state.studyTimer.enabled || !state.studyTimer.activeKey) return;
    state.studyTimer.remainingMs = Math.max(0, state.studyTimer.deadlineMs - Date.now());
    updateProgress();
    if (state.studyTimer.remainingMs <= 0 && !state.studyTimer.expired) {
        state.studyTimer.expired = true;
        handleStudyTimerExpired();
    }
}

function startStudyTimer(key, durationSeconds) {
    const safeDuration = sanitizeStudyTimerSeconds(durationSeconds, 60);
    if (!key || safeDuration <= 0) return;

    if (state.studyTimer.activeKey === key && state.studyTimer.intervalId) {
        tickStudyTimer();
        return;
    }

    if (state.studyTimer.intervalId) {
        clearInterval(state.studyTimer.intervalId);
    }

    state.studyTimer.activeKey = key;
    state.studyTimer.deadlineMs = Date.now() + safeDuration * 1000;
    state.studyTimer.remainingMs = safeDuration * 1000;
    state.studyTimer.expired = false;
    state.studyTimer.intervalId = setInterval(tickStudyTimer, 250);
    tickStudyTimer();
}

function syncStudyTimerForCurrentQuestion() {
    if (!state.studyTimer.enabled || !state.questions.length || isQuizFinished()) {
        stopStudyTimer({ clearDisplay: false });
        return;
    }

    const durationSeconds = getStudyTimerDurationSeconds();
    if (!durationSeconds) {
        stopStudyTimer({ clearDisplay: false });
        return;
    }

    const currentQuestion = state.questionQueue[state.currentIndex];
    if (!currentQuestion) {
        stopStudyTimer({ clearDisplay: false });
        return;
    }

    const scope = state.studyTimer.scope === 'folder' || state.studyTimer.scope === 'quiz' ? state.studyTimer.scope : 'question';
    const key = scope === 'question' ? getCurrentQuestionTimerKey(currentQuestion) : getStudyTimerSessionBaseKey();
    startStudyTimer(key, durationSeconds);
}

function disableCurrentQuestionInteractionsForTimer() {
    setOptionButtonsEnabled(false);
    setHierarchyInteractionEnabled(false);
    setClassifyInteractionEnabled(false);
    setFlashcardInteractionEnabled(false);
}

function markCurrentTimerQuestionWrong() {
    const q = state.questionQueue[state.currentIndex];
    if (!q || state.questionAnswered || isQuizFinished()) return;

    state.questionAnswered = true;
    disableCurrentQuestionInteractionsForTimer();
    applyQuestionOutcome(q, false, { useSideFeedback: false });
    setFeedback('Time expired!', false);

    if (isSpeedMode()) {
        setTimeout(nextQuestion, CONFIG.speedDelay);
    }
}

function markRemainingProgressQuestionsMissed() {
    if (!isProgressMode()) return;
    for (let index = state.currentIndex; index < state.questionQueue.length; index += 1) {
        const question = state.questionQueue[index];
        if (question) recordProgressModeOutcome(question, false);
    }
}

function finishStudyTimerSession() {
    if (isQuizFinished()) return;
    markRemainingProgressQuestionsMissed();

    if (isRetentionMode()) {
        state.retentionFinished = true;
    } else if (isRetryMode()) {
        state.questionQueue = [];
        state.currentIndex = 0;
    } else if (isMasteryCheckMode()) {
        state.masteryCheckFinished = true;
    } else {
        state.normalFinished = true;
    }

    setFeedback('Time expired!', false);
    showQuestion();
}

function handleStudyTimerExpired() {
    if (!state.studyTimer.enabled || isQuizFinished()) return;
    if (state.studyTimer.scope === 'question') {
        markCurrentTimerQuestionWrong();
    } else {
        finishStudyTimerSession();
    }
}

function serializeStudyTimerSettings() {
    return {
        enabled: !!state.studyTimer.enabled,
        scope: ['folder', 'quiz', 'question'].includes(state.studyTimer.scope) ? state.studyTimer.scope : 'question',
        preset: ['30', '60', '1800', '3600', 'custom'].includes(String(state.studyTimer.preset)) ? String(state.studyTimer.preset) : '60',
        customSeconds: sanitizeStudyTimerSeconds(state.studyTimer.customSeconds, 60)
    };
}

function saveStudyTimerSettings() {
    try {
        localStorage.setItem(CONFIG.studyTimerStorageKey, JSON.stringify(serializeStudyTimerSettings()));
    } catch (err) {
        console.warn('Could not save timer settings:', err);
    }
}

function loadStudyTimerSettings() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(CONFIG.studyTimerStorageKey) || 'null');
    } catch (err) {
        saved = null;
    }

    if (saved && typeof saved === 'object') {
        state.studyTimer.enabled = !!saved.enabled;
        state.studyTimer.scope = ['folder', 'quiz', 'question'].includes(saved.scope) ? saved.scope : 'question';
        state.studyTimer.preset = ['30', '60', '1800', '3600', 'custom'].includes(String(saved.preset)) ? String(saved.preset) : '60';
        state.studyTimer.customSeconds = sanitizeStudyTimerSeconds(saved.customSeconds, 60);
    }

    syncStudyTimerSettingsUI();
}

function syncStudyTimerSettingsUI() {
    if (elements.timerMode) elements.timerMode.checked = !!state.studyTimer.enabled;
    if (elements.timerScopeSelect) elements.timerScopeSelect.value = state.studyTimer.scope;
    if (elements.timerPresetSelect) elements.timerPresetSelect.value = state.studyTimer.preset;
    if (elements.timerCustomSeconds) elements.timerCustomSeconds.value = String(state.studyTimer.customSeconds || 60);

    const showDetails = !!state.studyTimer.enabled;
    const showCustom = state.studyTimer.preset === 'custom';
    if (elements.timerDetails) elements.timerDetails.classList.toggle('hidden', !showDetails);
    if (elements.timerCustomRow) elements.timerCustomRow.classList.toggle('hidden', !showDetails || !showCustom);
}

function readStudyTimerSettingsFromUI() {
    state.studyTimer.enabled = !!elements.timerMode?.checked;
    state.studyTimer.scope = ['folder', 'quiz', 'question'].includes(elements.timerScopeSelect?.value) ? elements.timerScopeSelect.value : 'question';
    state.studyTimer.preset = ['30', '60', '1800', '3600', 'custom'].includes(String(elements.timerPresetSelect?.value)) ? String(elements.timerPresetSelect.value) : '60';
    state.studyTimer.customSeconds = sanitizeStudyTimerSeconds(elements.timerCustomSeconds?.value, state.studyTimer.customSeconds || 60);
    syncStudyTimerSettingsUI();
    saveStudyTimerSettings();
}

function restartStudyTimerAfterSettingsChange() {
    state.studyTimer.sessionToken += 1;
    stopStudyTimer({ clearDisplay: false });
    syncStudyTimerForCurrentQuestion();
    updateProgress();
}

// ================= AUTO-STAR HELPERS =================
function sanitizeAutoStarSeconds(value, fallback = 5) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, 24 * 60 * 60);
}

function getAutoStarThresholdSeconds() {
    if (!state.autoStar.enabled) return 0;
    if (state.autoStar.preset === 'custom') {
        return sanitizeAutoStarSeconds(state.autoStar.customSeconds, 5);
    }
    return sanitizeAutoStarSeconds(state.autoStar.preset, 5);
}

function serializeAutoStarSettings() {
    return {
        enabled: !!state.autoStar.enabled,
        preset: ['5', '10', '30', '60', 'custom'].includes(String(state.autoStar.preset)) ? String(state.autoStar.preset) : '5',
        customSeconds: sanitizeAutoStarSeconds(state.autoStar.customSeconds, 5)
    };
}

function saveAutoStarSettings() {
    try {
        localStorage.setItem(CONFIG.autoStarStorageKey, JSON.stringify(serializeAutoStarSettings()));
    } catch (err) {
        console.warn('Could not save Auto-Star settings:', err);
    }
}

function loadAutoStarSettings() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(CONFIG.autoStarStorageKey) || 'null');
    } catch (err) {
        saved = null;
    }

    if (saved && typeof saved === 'object') {
        state.autoStar.enabled = !!saved.enabled;
        state.autoStar.preset = ['5', '10', '30', '60', 'custom'].includes(String(saved.preset)) ? String(saved.preset) : '5';
        state.autoStar.customSeconds = sanitizeAutoStarSeconds(saved.customSeconds, 5);
    }

    syncAutoStarSettingsUI();
}

function syncAutoStarSettingsUI() {
    if (elements.autoStarMode) elements.autoStarMode.checked = !!state.autoStar.enabled;
    if (elements.autoStarPresetSelect) elements.autoStarPresetSelect.value = state.autoStar.preset;
    if (elements.autoStarCustomSeconds) elements.autoStarCustomSeconds.value = String(state.autoStar.customSeconds || 5);

    const showDetails = !!state.autoStar.enabled;
    const showCustom = state.autoStar.preset === 'custom';
    if (elements.autoStarDetails) elements.autoStarDetails.classList.toggle('hidden', !showDetails);
    if (elements.autoStarCustomRow) elements.autoStarCustomRow.classList.toggle('hidden', !showDetails || !showCustom);
}

function readAutoStarSettingsFromUI() {
    state.autoStar.enabled = !!elements.autoStarMode?.checked;
    state.autoStar.preset = ['5', '10', '30', '60', 'custom'].includes(String(elements.autoStarPresetSelect?.value)) ? String(elements.autoStarPresetSelect.value) : '5';
    state.autoStar.customSeconds = sanitizeAutoStarSeconds(elements.autoStarCustomSeconds?.value, state.autoStar.customSeconds || 5);
    syncAutoStarSettingsUI();
    saveAutoStarSettings();
}

function getAutoStarQuestionKey(question) {
    return normalizeSheetText(question?.sourceQuestionId || question?.id || '');
}

function startAutoStarQuestionWindow(question) {
    const key = getAutoStarQuestionKey(question);
    state.autoStar.currentQuestionKey = key;
    state.autoStar.currentAttemptKey = key ? `${key}:${state.currentIndex}:${Date.now()}` : '';
    state.autoStar.questionStartedAt = key ? Date.now() : 0;
}

function markAutoStarredQuestionExcludedInSession(question) {
    if (!isExcludeStarredEnabled()) return;

    const key = getAutoStarQuestionKey(question);
    if (key) state.autoStar.excludedQuestionKeys.add(key);
}

function unmarkAutoStarredQuestionExcludedInSession(question) {
    const key = getAutoStarQuestionKey(question);
    if (key) state.autoStar.excludedQuestionKeys.delete(key);
}

function removeAutoStarredQuestionFromFutureQueue(question) {
    if (!isExcludeStarredEnabled()) return;

    const key = getAutoStarQuestionKey(question);
    if (!key) return;

    state.questionQueue = state.questionQueue.filter((item, index) => {
        if (index === state.currentIndex) return true;
        return getAutoStarQuestionKey(item) !== key;
    });
}

function advancePastAutoStarredExcludedCurrentQuestion() {
    if (!state.questionAnswered || !isExcludeStarredEnabled()) return false;

    const currentQuestion = state.questionQueue[state.currentIndex];
    const key = getAutoStarQuestionKey(currentQuestion);
    if (!key || !state.autoStar.excludedQuestionKeys.has(key)) return false;

    const previousIndex = state.currentIndex;
    state.questionQueue = state.questionQueue.filter(question => getAutoStarQuestionKey(question) !== key);
    state.questions = state.questions.filter(question => getAutoStarQuestionKey(question) !== key);
    state.autoStar.excludedQuestionKeys.delete(key);

    if (!state.questionQueue.length) {
        state.currentIndex = 0;
        if (isRetentionMode()) {
            state.retentionFinished = true;
        } else if (isMasteryCheckMode()) {
            state.masteryCheckFinished = true;
        } else {
            state.normalFinished = true;
        }
    } else {
        state.currentIndex = Math.min(previousIndex, state.questionQueue.length - 1);
    }

    showQuestion();
    showPendingLearningResourceIfAny();
    return true;
}

async function persistAutoStarForQuestion(question, elapsedMs) {
    const key = getAutoStarQuestionKey(question);
    if (!key || state.autoStar.pendingQuestionKeys.has(key)) return;
    if (!canPersistQuestionStarState(question) || question.isStarred) return;

    state.autoStar.pendingQuestionKeys.add(key);
    markAutoStarredQuestionExcludedInSession(question);
    syncQuestionStarButton();

    try {
        await persistQuestionStarState(question, true);
        applyQuestionStarStateAcrossDeck(question.sourceQuestionId, true);
        removeAutoStarredQuestionFromFutureQueue(question);

        const currentQuestion = state.questionQueue[state.currentIndex];
        if (getAutoStarQuestionKey(currentQuestion) === key && state.questionAnswered) {
            setFeedback('Auto-starred ★', true);
        }
    } catch (error) {
        unmarkAutoStarredQuestionExcludedInSession(question);
        console.error('Could not Auto-Star question:', error);
    } finally {
        state.autoStar.pendingQuestionKeys.delete(key);
        syncQuestionStarButton();
        updateProgress();
    }
}

function maybeAutoStarQuestionFromOutcome(question, isCorrect) {
    const key = getAutoStarQuestionKey(question);
    if (!key) return;

    if (!isCorrect) {
        return;
    }

    const thresholdSeconds = getAutoStarThresholdSeconds();
    if (!state.autoStar.enabled || !thresholdSeconds) return;
    if (!canPersistQuestionStarState(question) || question.isStarred) return;
    if (state.autoStar.currentQuestionKey !== key || !state.autoStar.questionStartedAt) return;

    const elapsedMs = Math.max(0, Date.now() - state.autoStar.questionStartedAt);
    if (elapsedMs <= thresholdSeconds * 1000) {
        persistAutoStarForQuestion(question, elapsedMs);
    }
}


function serializeUnstarOnWrongSettings() {
    return {
        enabled: !!state.unstarOnWrong.enabled
    };
}

function saveUnstarOnWrongSettings() {
    try {
        localStorage.setItem(CONFIG.unstarOnWrongStorageKey, JSON.stringify(serializeUnstarOnWrongSettings()));
    } catch (err) {
        console.warn('Could not save Unstar on Wrong settings:', err);
    }
}

function loadUnstarOnWrongSettings() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(CONFIG.unstarOnWrongStorageKey) || 'null');
    } catch (err) {
        saved = null;
    }

    if (saved && typeof saved === 'object') {
        state.unstarOnWrong.enabled = !!saved.enabled;
    }

    syncUnstarOnWrongSettingsUI();
}

function syncUnstarOnWrongSettingsUI() {
    if (elements.unstarOnWrongMode) elements.unstarOnWrongMode.checked = !!state.unstarOnWrong.enabled;
}

function readUnstarOnWrongSettingsFromUI() {
    state.unstarOnWrong.enabled = !!elements.unstarOnWrongMode?.checked;
    syncUnstarOnWrongSettingsUI();
    saveUnstarOnWrongSettings();
}

async function persistUnstarOnWrongForQuestion(question) {
    const key = getAutoStarQuestionKey(question);
    if (!key || state.unstarOnWrong.pendingQuestionKeys.has(key)) return;
    if (!state.unstarOnWrong.enabled || isExcludeStarredEnabled()) return;
    if (!canPersistQuestionStarState(question) || !question.isStarred) return;

    state.unstarOnWrong.pendingQuestionKeys.add(key);

    try {
        await persistQuestionStarState(question, false);
        applyQuestionStarStateAcrossDeck(question.sourceQuestionId, false);

        const currentQuestion = state.questionQueue[state.currentIndex];
        if (getAutoStarQuestionKey(currentQuestion) === key && state.questionAnswered) {
            setFeedback('Incorrect — unstarred ★', false);
        }
    } catch (error) {
        console.error('Could not unstar question after wrong answer:', error);
    } finally {
        state.unstarOnWrong.pendingQuestionKeys.delete(key);
        syncQuestionStarButton();
        updateProgress();
    }
}

function maybeUnstarQuestionFromOutcome(question, isCorrect) {
    if (isCorrect) return;
    persistUnstarOnWrongForQuestion(question);
}

function serializeHideAnswerFeedbackSettings() {
    return {
        hidden: !!state.answerFeedback.hidden
    };
}

function saveHideAnswerFeedbackSettings() {
    try {
        localStorage.setItem(CONFIG.hideAnswerFeedbackStorageKey, JSON.stringify(serializeHideAnswerFeedbackSettings()));
    } catch (err) {
        console.warn('Could not save Hide Feedback settings:', err);
    }
}

function loadHideAnswerFeedbackSettings() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(CONFIG.hideAnswerFeedbackStorageKey) || 'null');
    } catch (err) {
        saved = null;
    }

    if (saved && typeof saved === 'object') {
        state.answerFeedback.hidden = !!saved.hidden;
    }

    syncHideAnswerFeedbackSettingsUI();
}

function syncHideAnswerFeedbackSettingsUI() {
    if (elements.hideAnswerFeedbackMode) elements.hideAnswerFeedbackMode.checked = !!state.answerFeedback.hidden;
}

function suppressVisibleAnswerFeedback() {
    clearFeedback();
    clearExplanations();
    clearOptionFeedback();
    clearOptionButtonStateClasses();

    document.querySelectorAll('.hierarchy-feedback').forEach(fb => {
        fb.innerText = '';
        fb.classList.remove('correct-mark', 'incorrect-mark');
    });

    document.querySelectorAll('.hierarchy-item, .classify-item').forEach(item => {
        item.classList.remove('option-correct', 'option-incorrect');
    });

    clearPendingLearningResource();
    if (state.learningResourcesOverlayOpen) {
        closeLearningResourcesOverlay();
    }
}

function readHideAnswerFeedbackSettingsFromUI() {
    state.answerFeedback.hidden = !!elements.hideAnswerFeedbackMode?.checked;
    syncHideAnswerFeedbackSettingsUI();
    saveHideAnswerFeedbackSettings();
    if (isAnswerFeedbackHidden()) {
        suppressVisibleAnswerFeedback();
    }
}

function serializeGlobalShuffleAnswersSettings() {
    return {
        enabled: !!state.globalShuffleAnswers.enabled
    };
}

function saveGlobalShuffleAnswersSettings() {
    try {
        localStorage.setItem(CONFIG.globalShuffleAnswersStorageKey, JSON.stringify(serializeGlobalShuffleAnswersSettings()));
    } catch (err) {
        console.warn('Could not save Shuffle Answers Global settings:', err);
    }
}

function loadGlobalShuffleAnswersSettings() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(CONFIG.globalShuffleAnswersStorageKey) || 'null');
    } catch (err) {
        saved = null;
    }

    if (saved && typeof saved === 'object') {
        state.globalShuffleAnswers.enabled = !!saved.enabled;
    }

    syncGlobalShuffleAnswersSettingsUI();
}

function syncGlobalShuffleAnswersSettingsUI() {
    if (elements.globalShuffleAnswers) elements.globalShuffleAnswers.checked = !!state.globalShuffleAnswers.enabled;
}

function readGlobalShuffleAnswersSettingsFromUI() {
    state.globalShuffleAnswers.enabled = !!elements.globalShuffleAnswers?.checked;
    syncGlobalShuffleAnswersSettingsUI();
    saveGlobalShuffleAnswersSettings();
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

function getProgressQuestionKey(question, fallbackIndex = state.currentIndex) {
    return normalizeSheetText(question?.id || question?.sourceQuestionId || ('progress-question-' + fallbackIndex));
}

function recordProgressModeOutcome(question, isCorrect) {
    if (!isProgressMode() || !question) return;
    const key = getProgressQuestionKey(question);
    if (!key) return;

    if (isCorrect) {
        state.progressWrongQuestionMap.delete(key);
    } else {
        state.progressWrongQuestionMap.set(key, question);
    }
}

function getProgressMissedQuestions() {
    return Array.from(state.progressWrongQuestionMap.values()).filter(Boolean);
}

function getProgressScorePercent() {
    const total = state.questions.length;
    if (!total) return 0;
    const missedCount = getProgressMissedQuestions().length;
    const correctCount = Math.max(0, total - missedCount);
    return Math.round((correctCount / total) * 100);
}

function startProgressModeRetry() {
    const missedQuestions = getProgressMissedQuestions();
    if (!missedQuestions.length) return;

    state.progressRetryActive = true;
    state.questionQueue = [...missedQuestions];
    state.currentIndex = 0;
    state.normalFinished = false;
    state.questionAnswered = false;
    state.flashcardFlipped = false;
    clearProgressModeFinishUI();
    clearFeedback();
    clearExplanations();
    clearPendingLearningResource();
    showQuestion();
}

function canUseLearningResources() {
    if (isAnswerFeedbackHidden()) return false;
    if (!isLearningResourcesMode()) return false;
    if (isMasteryCheckMode()) return true;
    return !isSpeedMode() && (isRetentionMode() || isRetryMode() || isProgressMode());
}

function hasFlashcardsInDeck() {
    return state.questions.some(q => q.type === 'flashcard');
}

function updateLearningResourcesAvailability() {
    const learningResourcesCheckbox = document.getElementById('learningResourcesMode');
    const learningResourcesSetting = document.getElementById('learningResourcesModeSetting');
    const learningResourcesHelp = document.getElementById('learningResourcesModeHelp');
    const feedbackHidden = isAnswerFeedbackHidden();
    const learningResourcesAllowed = isRetentionMode() || isRetryMode() || isMasteryCheckMode() || isProgressMode();
    const learningResourcesDisabledForCompatibility = feedbackHidden || !learningResourcesAllowed || (isSpeedMode() && !isMasteryCheckMode());

    if (learningResourcesCheckbox) {
        learningResourcesCheckbox.disabled = learningResourcesDisabledForCompatibility;
    }

    if (learningResourcesSetting) {
        learningResourcesSetting.classList.toggle('disabled-setting', learningResourcesDisabledForCompatibility);
    }

    if (learningResourcesHelp) {
        learningResourcesHelp.innerText = feedbackHidden
            ? 'Paused while Hide Feedback is on because wrong-answer resources would reveal missed questions.'
            : 'Shows study support after a wrong answer when available.';
    }

    if (feedbackHidden || !learningResourcesAllowed) {
        if (learningResourcesCheckbox) learningResourcesCheckbox.checked = false;
        clearPendingLearningResource();
    }

    if (isSpeedMode() && !isMasteryCheckMode() && learningResourcesCheckbox?.checked) {
        learningResourcesCheckbox.checked = false;
        clearPendingLearningResource();
    }
}

function updateStarredQuestionAvailability() {
    const excludeSettingCard = document.getElementById('excludeStarredQuestionsSetting');
    const excludeSettingHelp = document.getElementById('excludeStarredQuestionsHelp');
    const onlySettingCard = document.getElementById('onlyStarredQuestionsSetting');
    const onlySettingHelp = document.getElementById('onlyStarredQuestionsHelp');
    const canUseStarred = !!(state.auth.client && state.auth.user?.id);

    if (elements.excludeStarredQuestions) {
        elements.excludeStarredQuestions.disabled = !canUseStarred;
        if (!canUseStarred) {
            elements.excludeStarredQuestions.checked = false;
        }
    }

    if (elements.onlyStarredQuestions) {
        elements.onlyStarredQuestions.disabled = !canUseStarred;
        if (!canUseStarred) {
            elements.onlyStarredQuestions.checked = false;
        }
    }

    if (excludeSettingCard) {
        excludeSettingCard.classList.toggle('disabled-setting', !canUseStarred);
    }

    if (onlySettingCard) {
        onlySettingCard.classList.toggle('disabled-setting', !canUseStarred);
    }

    if (excludeSettingHelp && !canUseStarred) {
        excludeSettingHelp.innerText = 'Sign in to use starred-question memory.';
    } else if (excludeSettingHelp) {
        excludeSettingHelp.innerText = 'Hides starred questions from the active study deck without removing the saved stars.';
    }

    if (onlySettingHelp && !canUseStarred) {
        onlySettingHelp.innerText = 'Sign in to use starred-question memory.';
    } else if (onlySettingHelp) {
        onlySettingHelp.innerText = 'Shows only starred questions in the active study deck without removing saved stars.';
    }
}

function updateAutoStarAvailability() {
    const card = document.getElementById('autoStarModeSetting');
    const help = document.getElementById('autoStarModeHelp');
    const canUseAutoStar = !!(state.auth.client && state.auth.user?.id);

    if (elements.autoStarMode) {
        elements.autoStarMode.disabled = !canUseAutoStar;
        if (!canUseAutoStar && elements.autoStarMode.checked) {
            elements.autoStarMode.checked = false;
            state.autoStar.enabled = false;
            saveAutoStarSettings();
        }
    }

    if (card) {
        card.classList.toggle('disabled-setting', !canUseAutoStar);
    }

    if (help && !canUseAutoStar) {
        help.innerText = 'Sign in to use Auto-Star. It saves stars to your Supabase question memory.';
    } else if (help) {
        help.innerText = 'Automatically stars signed-in Supabase questions answered correctly within the selected time. Runs in the background and can be used with Timer Mode.';
    }

    syncAutoStarSettingsUI();
}


function updateUnstarOnWrongAvailability() {
    const card = document.getElementById('unstarOnWrongSetting');
    const help = document.getElementById('unstarOnWrongHelp');
    const canUseUnstar = !!(state.auth.client && state.auth.user?.id);
    const pausedByExclude = isExcludeStarredEnabled();

    if (elements.unstarOnWrongMode) {
        elements.unstarOnWrongMode.disabled = !canUseUnstar || pausedByExclude;
        if (!canUseUnstar && elements.unstarOnWrongMode.checked) {
            elements.unstarOnWrongMode.checked = false;
            state.unstarOnWrong.enabled = false;
            saveUnstarOnWrongSettings();
        }
    }

    if (card) {
        card.classList.toggle('disabled-setting', !canUseUnstar || pausedByExclude);
    }

    if (help && !canUseUnstar) {
        help.innerText = 'Sign in to use Unstar on Wrong. It saves changes to your Supabase question memory.';
    } else if (help && pausedByExclude) {
        help.innerText = 'Turn off Exclude Starred to review starred questions and let wrong answers unstar them.';
    } else if (help) {
        help.innerText = 'When enabled, a starred question is unstarred if you answer it wrong. This can be used with or without Auto-Star.';
    }

    syncUnstarOnWrongSettingsUI();
}

function updateShuffleQuestionsAvailability() {
    const shuffleQuestionsCheckbox = document.getElementById('shuffleQuestions');
    const shuffleQuestionsSetting = document.getElementById('shuffleQuestionsSetting');
    const challengeLocked = isActiveQuizChallenge();

    if (challengeLocked && shuffleQuestionsCheckbox) {
        shuffleQuestionsCheckbox.checked = true;
    }

    if (shuffleQuestionsCheckbox) {
        shuffleQuestionsCheckbox.disabled = challengeLocked;
    }

    if (shuffleQuestionsSetting) {
        shuffleQuestionsSetting.classList.toggle('disabled-setting', challengeLocked);
        shuffleQuestionsSetting.classList.toggle('challenge-locked-setting', challengeLocked);
    }
}

function updateShuffleAnswersAvailability() {
    const shuffleAnswersCheckbox = document.getElementById('shuffleAnswers');
    const shuffleAnswersSetting = document.getElementById('shuffleAnswersSetting');
    const supportsAnswerShuffle = state.questions.some(q =>
        q.type === 'multiple choice' || q.type === 'diagrams' || q.type === 'hierarchy' || q.type === 'classify'
    );
    const challengeLocked = isActiveQuizChallenge();

    if (challengeLocked) {
        shuffleAnswersCheckbox.checked = true;
    }

    shuffleAnswersCheckbox.disabled = challengeLocked || !supportsAnswerShuffle;

    if (shuffleAnswersSetting) {
        shuffleAnswersSetting.classList.toggle('disabled-setting', challengeLocked || !supportsAnswerShuffle);
        shuffleAnswersSetting.classList.toggle('challenge-locked-setting', challengeLocked);
    }

    if (!supportsAnswerShuffle && !challengeLocked) {
        shuffleAnswersCheckbox.checked = false;
    }
}

function updateGlobalShuffleAnswersAvailability() {
    const globalShuffleAnswersCheckbox = elements.globalShuffleAnswers;
    const globalShuffleAnswersSetting = document.getElementById('globalShuffleAnswersSetting');
    const supportsGlobalAnswerShuffle = state.questions.some(isGlobalShuffleAnswersSupportedQuestion);

    if (globalShuffleAnswersCheckbox) {
        globalShuffleAnswersCheckbox.disabled = !supportsGlobalAnswerShuffle;
    }

    if (globalShuffleAnswersSetting) {
        globalShuffleAnswersSetting.classList.toggle('disabled-setting', !supportsGlobalAnswerShuffle);
    }

    if (!supportsGlobalAnswerShuffle && globalShuffleAnswersCheckbox) {
        globalShuffleAnswersCheckbox.checked = false;
    }
}

function updateAllowBuildUpAvailability() {
    const allowBuildUpCheckbox = elements.allowBuildUp;
    const allowBuildUpSetting = document.getElementById('allowBuildUpSetting');
    const allowBuildUpHelp = document.getElementById('allowBuildUpHelp');
    const hasBuildUpStrings = state.questions.some(isBuildUpSupportedQuestion);

    if (allowBuildUpCheckbox) {
        allowBuildUpCheckbox.disabled = !hasBuildUpStrings;
        if (!hasBuildUpStrings) {
            allowBuildUpCheckbox.checked = false;
        }
    }

    if (allowBuildUpSetting) {
        allowBuildUpSetting.classList.toggle('disabled-setting', !hasBuildUpStrings);
    }

    if (allowBuildUpHelp) {
        allowBuildUpHelp.innerText = hasBuildUpStrings
            ? 'Keeps multiple-choice questions with the same Build Up string together in study order, even when Shuffle Questions is on.'
            : 'Available when multiple-choice questions include Build Up string values from import or editor tools.';
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
    const progressActive = isProgressMode();
    const challengeLocked = isActiveQuizChallenge();

    setSettingDisabled('retentionModeSetting', 'retentionMode', challengeLocked || masteryActive || masteryCheckActive || progressActive);
    setSettingDisabled('masteryModeSetting', 'masteryMode', challengeLocked || retentionActive || masteryCheckActive || progressActive);
    setSettingDisabled('masteryCheckModeSetting', 'masteryCheckMode', challengeLocked || retentionActive || masteryActive || progressActive);
    setSettingDisabled('progressModeSetting', 'progressMode', challengeLocked || retentionActive || masteryActive || masteryCheckActive);

    ['retentionModeSetting', 'masteryModeSetting', 'masteryCheckModeSetting', 'progressModeSetting'].forEach(settingId => {
        const card = document.getElementById(settingId);
        if (card) card.classList.toggle('challenge-locked-setting', challengeLocked);
    });
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

    if (isProgressMode()) {
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
    updateAutoStarAvailability();
    updateUnstarOnWrongAvailability();
    syncHideAnswerFeedbackSettingsUI();
    syncGlobalShuffleAnswersSettingsUI();
    updateShuffleQuestionsAvailability();
    updateShuffleAnswersAvailability();
    updateGlobalShuffleAnswersAvailability();
    updateAllowBuildUpAvailability();
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

function isMultipleChoiceSplitLayoutViewport() {
    return window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 700px), (orientation: landscape)').matches;
}

function getMultipleChoiceSplitQuestionColumn() {
    let wrapper = document.getElementById('mcSplitQuestionColumn');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'mcSplitQuestionColumn';
        wrapper.className = 'mc-split-question-column';
    }
    return wrapper;
}

function syncMultipleChoiceSplitLayoutMount() {
    const shouldUseSplitMount = (state.currentQuestionType === 'multiple choice' || state.currentQuestionType === 'diagrams') && isMultipleChoiceSplitLayoutViewport();
    const quizArea = elements.quizArea;
    const questionContainer = elements.questionContainer;
    const questionText = elements.questionTextEl;
    const imageContainer = elements.imageContainer;
    const optionsContainer = elements.optionsContainer;

    if (!quizArea || !questionContainer || !questionText || !imageContainer || !optionsContainer) return;

    if (shouldUseSplitMount) {
        const wrapper = getMultipleChoiceSplitQuestionColumn();
        if (wrapper.parentElement !== questionContainer) {
            questionContainer.insertBefore(wrapper, optionsContainer);
        }
        if (questionText.parentElement !== wrapper) {
            wrapper.appendChild(questionText);
        }
        if (imageContainer.parentElement !== wrapper) {
            wrapper.appendChild(imageContainer);
        }
        return;
    }

    const wrapper = document.getElementById('mcSplitQuestionColumn');
    if (questionText.parentElement !== questionContainer) {
        questionContainer.insertBefore(questionText, optionsContainer);
    }
    if (imageContainer.parentElement !== quizArea) {
        quizArea.insertBefore(imageContainer, questionContainer.nextSibling);
    }
    if (wrapper && wrapper.parentElement && !wrapper.contains(questionText) && !wrapper.contains(imageContainer)) {
        wrapper.remove();
    }
}

function updateViewportClasses() {
    document.body.classList.toggle('narrow-iphone-layout', isNarrowIPhoneViewport());
    document.body.classList.toggle('active-question-multiple-choice', state.currentQuestionType === 'multiple choice' || state.currentQuestionType === 'diagrams');
    document.body.classList.toggle('active-question-flashcard', state.currentQuestionType === 'flashcard');
    document.body.classList.toggle('active-question-classify', state.currentQuestionType === 'classify');
    syncMultipleChoiceSplitLayoutMount();
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

function isEditableKeyboardShortcutTarget(target) {
    if (!target) return false;
    const editable = target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
    return !!editable;
}

function isStudyKeyboardShortcutBlocked(event) {
    if (event.defaultPrevented) return true;
    if (event.ctrlKey || event.metaKey || event.altKey) return true;
    if (isEditableKeyboardShortcutTarget(event.target)) return true;
    if (state.auth.quizStudioOpen || !elements.quizStudioPage?.classList.contains('hidden')) return true;
    if (elements.authPopup && !elements.authPopup.classList.contains('hidden')) return true;
    if (elements.settingsPopup && !elements.settingsPopup.classList.contains('hidden')) return true;
    if (state.learningResourcesOverlayOpen || state.flashcardImageZoomOpen) return true;
    if (!state.questions.length || isQuizFinished()) return true;
    return false;
}

function activateVisibleAnswerShortcut(optionNumber) {
    if (!Number.isInteger(optionNumber) || optionNumber < 1 || optionNumber > 9) return false;
    if (state.questionAnswered) return false;

    const currentQuestion = state.questionQueue[state.currentIndex] || null;
    if (currentQuestion?.type === 'flashcard') {
        if (optionNumber === 1) {
            gradeFlashcard(false);
            return true;
        }
        if (optionNumber === 2) {
            gradeFlashcard(true);
            return true;
        }
        return false;
    }

    const visibleButtons = Array.from(elements.optionsContainer.querySelectorAll('.optionBtn'))
        .filter(button => !button.disabled && button.offsetParent !== null && button.closest('.option-block')?.style.display !== 'none');
    const targetButton = visibleButtons[optionNumber - 1];
    if (!targetButton) return false;

    targetButton.click();
    return true;
}

function submitCurrentStructuredQuestionShortcut() {
    if (state.questionAnswered) return false;

    const hierarchySubmit = document.getElementById('hierarchySubmit');
    if (hierarchySubmit && !hierarchySubmit.disabled) {
        hierarchySubmit.click();
        return true;
    }

    const classifySubmit = document.getElementById('classifySubmit');
    if (classifySubmit && !classifySubmit.disabled) {
        classifySubmit.click();
        return true;
    }

    return false;
}

function handleStudyKeyboardShortcut(event) {
    const key = event.key;

    if (key === 'f' || key === 'F') {
        if (isStudyKeyboardShortcutBlocked(event)) return false;
        event.preventDefault();
        toggleFullscreenMode();
        return true;
    }

    if (key === 's' || key === 'S') {
        if (isStudyKeyboardShortcutBlocked(event)) return false;
        if (!elements.questionStarBtn || elements.questionStarBtn.disabled || elements.questionStarBtn.classList.contains('hidden')) return false;
        event.preventDefault();
        elements.questionStarBtn.click();
        return true;
    }

    if (/^[1-9]$/.test(key)) {
        if (isStudyKeyboardShortcutBlocked(event)) return false;
        if (event.repeat) return false;
        const handled = activateVisibleAnswerShortcut(Number(key));
        if (handled) event.preventDefault();
        return handled;
    }

    if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        if (isStudyKeyboardShortcutBlocked(event)) return false;
        if (event.repeat) return false;

        let handled = false;
        if (state.questionAnswered) {
            if (!elements.nextBtn?.disabled) {
                nextQuestion();
                handled = true;
            }
        } else {
            handled = submitCurrentStructuredQuestionShortcut();
        }

        if (handled) event.preventDefault();
        return handled;
    }

    if (key === 'ArrowLeft') {
        if (isStudyKeyboardShortcutBlocked(event)) return false;
        if (elements.prevBtn?.disabled) return false;
        event.preventDefault();
        prevQuestion();
        return true;
    }

    if (key === 'ArrowRight') {
        if (isStudyKeyboardShortcutBlocked(event)) return false;
        if (elements.nextBtn?.disabled) return false;
        event.preventDefault();
        nextQuestion();
        return true;
    }

    return false;
}

// ================= LEARNING RESOURCES UI =================
function clearPendingLearningResource() {
    state.pendingLearningResource = null;
}

function queueLearningResourceIfEligible(question) {
    const text = normalizeSheetText(question?.learningResources);
    const html = sanitizeLearningResourcesHtml(question?.learningResourcesHtml);
    const imageUrl = normalizeSheetText(question?.learningResourcesImage);
    const hasText = !!(htmlToDisplayText(html) || text);

    if (!canUseLearningResources() || (!hasText && !imageUrl)) {
        state.pendingLearningResource = null;
        return;
    }

    state.pendingLearningResource = {
        text,
        html,
        imageUrl
    };
}

function openLearningResourcesOverlay(hintData) {
    if (!hintData) return;

    const text = normalizeSheetText(hintData.text);
    const html = sanitizeLearningResourcesHtml(hintData.html);
    const imageUrl = normalizeSheetText(hintData.imageUrl);
    const renderedHtml = html || buildStoredHtmlFromPlain(text);
    const hasText = !!(htmlToDisplayText(renderedHtml) || text);
    const hasImage = !!imageUrl;

    if (!hasText && !hasImage) return;

    elements.learningResourcesContent.innerHTML = renderedHtml;
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
    elements.learningResourcesContent.innerHTML = '';
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

function createOptionImageZoomButton(src, alt = 'Option image') {
    const zoomBtn = document.createElement('button');
    zoomBtn.type = 'button';
    zoomBtn.className = 'option-image-zoom-btn';
    zoomBtn.setAttribute('aria-label', 'Zoom option image');
    zoomBtn.setAttribute('title', 'Zoom image');
    zoomBtn.innerText = '⤢';

    const stopZoomTrigger = e => {
        e.preventDefault();
        e.stopPropagation();
    };

    zoomBtn.addEventListener('pointerdown', stopZoomTrigger);
    zoomBtn.addEventListener('pointerup', stopZoomTrigger);
    zoomBtn.addEventListener('click', e => {
        stopZoomTrigger(e);
        openFlashcardImageOverlay(src, alt);
    });

    return zoomBtn;
}

// ================= QUESTION LOADING HELPERS =================
function isQuizDescriptor(value) {
    return !!value && typeof value === "object" && typeof value.source === "string" && typeof value.id === "string";
}

function encodeQuizSelectorValue(quizDescriptor) {
    return isQuizDescriptor(quizDescriptor) ? quizDescriptor.id : "";
}

function getQuizBySelectorValue(selectorValue) {
    const rawValue = normalizeSheetText(selectorValue);
    if (!rawValue) return null;

    const directMatch = state.quizListCache.find(q => q.id === rawValue);
    if (directMatch) return directMatch;

    const sourceQuizId = rawValue.startsWith('sb:') ? rawValue.slice(3) : rawValue;
    return state.quizListCache.find(q =>
        q.source === DATA_SOURCES.SUPABASE
        && normalizeSheetText(q.sourceQuizId) === sourceQuizId
    ) || null;
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

        const results = await Promise.all(memberQuizzes.map(async item => {
            const questions = await loadQuestions(item);
            return questions.map(question => ({
                ...question,
                sourceQuizId: normalizeSheetText(question.sourceQuizId || item.sourceQuizId),
                sourceQuizName: normalizeSheetText(item.name)
            }));
        }));
        return results.flat();
    }

    return loadQuestions(quizDescriptor);
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
    if (isOnlyStarredEnabled()) {
        return sourceQuestions.filter(question => !!question.isStarred);
    }
    if (isExcludeStarredEnabled()) {
        return sourceQuestions.filter(question => !question.isStarred);
    }
    return [...sourceQuestions];
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

function isBuildUpSupportedQuestion(question = {}) {
    return question?.type === 'multiple choice' && !!normalizeBuildUpValue(question?.buildUp);
}

function isAllowBuildUpEnabled() {
    return !!elements.allowBuildUp?.checked;
}

function getBuildUpGroupKey(question = {}) {
    const buildUp = normalizeBuildUpValue(question?.buildUp);
    if (!buildUp || question?.type !== 'multiple choice') return '';
    const scope = normalizeSheetText(question?.sourceQuizId || state.activeQuizDescriptor?.sourceQuizId || state.activeQuizDescriptor?.id || 'active-quiz');
    return `${scope}::${buildUp.toLocaleLowerCase()}`;
}

function buildQuestionBlocksPreservingBuildUp(questions = []) {
    const source = Array.isArray(questions) ? questions : [];
    if (!isAllowBuildUpEnabled()) {
        return source.map(question => [question]);
    }

    const grouped = new Map();
    source.forEach(question => {
        const key = getBuildUpGroupKey(question);
        if (!key) return;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(question);
    });

    const emittedGroups = new Set();
    const blocks = [];
    source.forEach(question => {
        const key = getBuildUpGroupKey(question);
        if (!key) {
            blocks.push([question]);
            return;
        }
        if (emittedGroups.has(key)) return;
        emittedGroups.add(key);
        blocks.push(grouped.get(key) || [question]);
    });
    return blocks;
}

function buildStudyQuestionQueue(questions = [], { shuffle = false } = {}) {
    const blocks = buildQuestionBlocksPreservingBuildUp(questions);
    if (shuffle) {
        shuffleArray(blocks);
    }
    return blocks.flat();
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
    state.questionQueue = buildStudyQuestionQueue(visibleQuestions, {
        shuffle: !!document.getElementById('shuffleQuestions')?.checked && resetSession
    });

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
        state.emptyQuizMessage = isOnlyStarredEnabled() && state.sourceQuestions.length
            ? 'No starred questions are available in this deck.'
            : (isExcludeStarredEnabled() && state.sourceQuestions.length
                ? 'All questions in this deck are currently starred and excluded.'
                : 'This quiz has no questions.');
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
    if (plain) return displayMathChemTextForEditor(plain);
    return displayMathChemTextForEditor(htmlToDisplayText(htmlValue));
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
    state.activeQuizDescriptor = null;
    state.activeQuizChallenge = null;
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

async function loadGoogleSheetsImportCatalog() {
    if (!state.auth.user?.id) {
        state.googleSheetsImportQuizzes = [];
        renderGoogleSheetsImportControls();
        return [];
    }

    try {
        state.googleSheetsImportQuizzes = await loadQuizListFromGoogleSheets();
    } catch (error) {
        console.error('Failed to load Google Sheets import catalog:', error);
        state.googleSheetsImportQuizzes = [];
    }

    renderGoogleSheetsImportControls();
    return state.googleSheetsImportQuizzes;
}

async function loadQuizListFromSupabase() {
    if (!state.auth.client || !state.auth.user?.id) {
        return [];
    }

    try {
        const [{ data: folders, error: foldersError }, { data: quizzes, error: quizzesError }, questionRows] = await Promise.all([
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
            fetchAllSupabaseRows(
                () => state.auth.client
                    .from('questions')
                    .select('quiz_id, question_type')
                    .order('quiz_id', { ascending: true }),
                { label: 'quiz catalog question rows' }
            )
        ]);

        if (foldersError) throw foldersError;
        if (quizzesError) throw quizzesError;

        const folderMap = new Map((folders || []).map(folder => [folder.id, folder]));
        const quizTypeMap = new Map();

        (questionRows || []).forEach(row => {
            if (!quizTypeMap.has(row.quiz_id)) {
                quizTypeMap.set(row.quiz_id, []);
            }
            quizTypeMap.get(row.quiz_id).push(row.question_type);
        });

        return (quizzes || [])
            .filter(quiz => (quizTypeMap.get(quiz.id) || []).length > 0)
            .map(quiz => {
                const types = (quizTypeMap.get(quiz.id) || [])
                    .map(type => normalizeSheetText(type || 'multiple_choice') || 'multiple_choice');
                const uniqueTypes = Array.from(new Set(types));
                const quizType = uniqueTypes.length === 1 ? uniqueTypes[0] : 'mixed';
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

    const quizName = normalizeSheetText(quizDescriptor?.name || 'this quiz');

    try {
        const [{ data: questionRows, error: questionsError }, { data: quizRow, error: quizError }] = await Promise.all([
            state.auth.client
                .from('questions')
                .select('id, prompt_html, prompt_plain, image_url, learning_resources_html, learning_resources_image_url, sort_order, question_type')
                .eq('quiz_id', quizDescriptor.sourceQuizId)
                .order('sort_order', { ascending: true }),
            state.auth.client
                .from('quizzes')
                .select('description')
                .eq('id', quizDescriptor.sourceQuizId)
                .maybeSingle()
        ]);
        if (questionsError) {
            throw createStudyLoadDiagnosticError(`Could not read question rows for "${quizName}": ${questionsError.message || questionsError.details || questionsError}`);
        }
        if (quizError) {
            throw createStudyLoadDiagnosticError(`Could not read quiz metadata for "${quizName}": ${quizError.message || quizError.details || quizError}`);
        }

        const diagramSharing = getDiagramSharingFromDescription(quizRow?.description || '');
        const rows = questionRows || [];
        const questionIds = rows.map(row => row.id).filter(Boolean);
        if (!questionIds.length) {
            throw createStudyLoadDiagnosticError(`"${quizName}" has no saved question rows.`);
        }

        const rowTypes = Array.from(new Set(rows.map(row => normalizeSheetText(row?.question_type || 'multiple_choice') || 'multiple_choice')));
        if (rowTypes.length > 1) {
            throw createStudyLoadDiagnosticError(`"${quizName}" has mixed question types (${rowTypes.join(', ')}). Study mode expects one quiz type per quiz.`);
        }

        const quizType = normalizeSheetText(quizDescriptor.quizType || rowTypes[0] || 'multiple_choice');
        const supportedTypes = new Set(['multiple_choice', 'flashcard', 'hierarchy', 'classify', 'diagrams']);
        if (!supportedTypes.has(quizType)) {
            throw createStudyLoadDiagnosticError(`"${quizName}" uses unsupported question type "${quizType}".`);
        }

        const sharedDiagramSourceQuestionId = getDiagramSharingSourceQuestionId(diagramSharing);
        const sharedDiagramSourceRow = sharedDiagramSourceQuestionId
            ? rows.find(row => normalizeSheetText(row?.id) === sharedDiagramSourceQuestionId)
            : null;
        const sharedDiagramSourceImageUrl = normalizeSheetText(sharedDiagramSourceRow?.image_url);

        if (quizType === 'flashcard') {
            const detailRows = await loadFlashcardDetailsByQuestionIds(questionIds);
            assertExpectedDetailRowsForStudyLoad(questionIds, detailRows, 'flashcard', quizName);
            const detailMap = new Map((detailRows || []).map(row => [row.question_id, row]));
            const questions = rows.map(row => {
                const detail = detailMap.get(row.id);
                if (!detail) return null;
                return {
                    id: `q_${state.questionIdCounter++}`,
                    sourceQuestionId: row.id,
                    type: 'flashcard',
                    termText: getStoredTextForDisplay(detail.term_plain, detail.term_html),
                    termHtml: normalizeSheetText(detail.term_html),
                    definitionText: getStoredTextForDisplay(detail.definition_plain, detail.definition_html),
                    definitionHtml: normalizeSheetText(detail.definition_html),
                    termImage: normalizeSheetText(detail.term_image_url),
                    definitionImage: normalizeSheetText(detail.definition_image_url),
                    learningResources: getStoredTextForDisplay('', row.learning_resources_html),
                    learningResourcesHtml: normalizeSheetText(row.learning_resources_html),
                    learningResourcesImage: normalizeSheetText(row.learning_resources_image_url)
                };
            }).filter(Boolean);
            if (!questions.length) throw createStudyLoadDiagnosticError(`No usable flashcards were built for "${quizName}".`);
            return resolveSupabaseMediaReferencesForStudyLoad(questions, `Flashcard quiz "${quizName}"`);
        }

        if (quizType === 'hierarchy') {
            const detailRows = await loadHierarchyDetailsByQuestionIds(questionIds);
            assertExpectedDetailRowsForStudyLoad(questionIds, detailRows, 'hierarchy', quizName);
            const detailMap = new Map((detailRows || []).map(row => [row.question_id, row]));
            const questions = rows.map(row => {
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
                    learningResourcesHtml: normalizeSheetText(row.learning_resources_html),
                    learningResourcesImage: normalizeSheetText(row.learning_resources_image_url)
                };
            }).filter(Boolean);
            if (!questions.length) throw createStudyLoadDiagnosticError(`No usable hierarchy questions were built for "${quizName}".`);
            return resolveSupabaseMediaReferencesForStudyLoad(questions, `Hierarchy quiz "${quizName}"`);
        }

        if (quizType === 'classify') {
            const detailRows = await loadClassifyDetailsByQuestionIds(questionIds);
            assertExpectedDetailRowsForStudyLoad(questionIds, detailRows, 'classify', quizName);
            const detailMap = new Map((detailRows || []).map(row => [row.question_id, row]));
            const questions = rows.map(row => {
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
                    learningResourcesHtml: normalizeSheetText(row.learning_resources_html),
                    learningResourcesImage: normalizeSheetText(row.learning_resources_image_url)
                };
            }).filter(Boolean);
            if (!questions.length) throw createStudyLoadDiagnosticError(`No usable classify questions were built for "${quizName}".`);
            return resolveSupabaseMediaReferencesForStudyLoad(questions, `Classify quiz "${quizName}"`);
        }

        const detailRows = await loadMultipleChoiceDetailsByQuestionIds(questionIds);
        assertExpectedDetailRowsForStudyLoad(questionIds, detailRows, quizType === 'diagrams' ? 'diagram/multiple-choice' : 'multiple-choice', quizName);
        const detailMap = new Map((detailRows || []).map(row => [row.question_id, row]));
        const questions = rows.map(row => {
            const detail = detailMap.get(row.id);
            if (!detail) return null;
            const optionDrafts = getMultipleChoiceDraftsFromDetailRow(detail);
            const questionDiagramLabels = quizType === 'diagrams' ? getDiagramLabelsFromDetailRow(detail) : [];
            const diagramQuestionOverride = quizType === 'diagrams' ? getDiagramQuestionOverrideFromDetailRow(detail) : false;
            const useSharedDiagramImage = quizType === 'diagrams' && diagramSharing.useSharedImage && !diagramQuestionOverride;
            const diagramLabels = useSharedDiagramImage && diagramSharing.useSharedLabels
                ? normalizeDiagramLabels(diagramSharing.sharedLabels)
                : questionDiagramLabels;
            const diagramImage = useSharedDiagramImage
                ? normalizeSheetText(diagramSharing.sharedImageUrl || sharedDiagramSourceImageUrl || row.image_url)
                : normalizeSheetText(row.image_url);
            const options = optionDrafts.map(draft => draft.text);
            const optionImages = optionDrafts.map(draft => normalizeSheetText(draft.imageUrl));
            const optionAnswerValues = optionDrafts.map(getOptionAnswerValue);
            const explanations = optionDrafts.map(draft => draft.explanation);
            const correctAnswer = normalizeSheetText(detail.correct_answer);
            const buildUp = quizType === 'multiple_choice' ? getBuildUpValueFromOptionsJson(detail.options_json) : '';
            const correctIndex = optionAnswerValues.findIndex(optionValue => optionValue === correctAnswer);
            if (correctIndex >= 0 && !explanations[correctIndex]) {
                explanations[correctIndex] = getStoredTextForDisplay('', detail.correct_explanation_html);
            }
            return {
                id: `q_${state.questionIdCounter++}`,
                sourceQuestionId: row.id,
                sourceQuizId: normalizeSheetText(quizDescriptor.sourceQuizId),
                question: getStoredTextForDisplay(row.prompt_plain, row.prompt_html),
                type: quizType === 'diagrams' ? 'diagrams' : 'multiple choice',
                options,
                optionImages,
                correct: correctAnswer,
                explanations,
                buildUp,
                image: quizType === 'diagrams' ? diagramImage : normalizeSheetText(row.image_url),
                diagramLabels,
                learningResources: getStoredTextForDisplay('', row.learning_resources_html),
                learningResourcesHtml: normalizeSheetText(row.learning_resources_html),
                learningResourcesImage: normalizeSheetText(row.learning_resources_image_url)
            };
        }).filter(Boolean);
        if (!questions.length) throw createStudyLoadDiagnosticError(`No usable ${quizType === 'diagrams' ? 'diagram' : 'multiple-choice'} questions were built for "${quizName}".`);
        return resolveSupabaseMediaReferencesForStudyLoad(questions, `${quizType === 'diagrams' ? 'Diagram' : 'Multiple-choice'} quiz "${quizName}"`);
    } catch (error) {
        console.error('Failed to load Supabase quiz questions:', error);
        if (error?.studyLoadDiagnostic) throw error;
        throw createStudyLoadDiagnosticError(`Unexpected Supabase load failure for "${quizName}": ${error?.message || error}`);
    }
}

async function loadQuizList() {
    if (!state.auth.user?.id) {
        return [];
    }

    const supabaseQuizzes = await loadQuizListFromSupabase();
    const folderDeckDescriptors = buildFolderDeckDescriptors(supabaseQuizzes);

    return [...supabaseQuizzes, ...folderDeckDescriptors];
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

    if (!state.auth.user?.id) {
        elements.folderSelector.innerHTML = '<option value="">Sign in required</option>';
        elements.folderSelector.value = '';
        elements.folderSelector.disabled = true;
        resetQuizSelector();
        renderGoogleSheetsImportControls();
        return state.quizListCache;
    }

    elements.folderSelector.disabled = false;
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

async function loadSelectedQuiz(selectorValue, options = {}) {
    if (!state.auth.user?.id) {
        throw new Error('Sign in required');
    }

    const selectedQuiz = getQuizBySelectorValue(selectorValue);

    if (!selectedQuiz) {
        throw new Error('Quiz not found');
    }

    if (!options.preserveChallenge) {
        state.activeQuizChallenge = null;
    }
    state.activeQuizDescriptor = selectedQuiz;

    if (selectedQuiz.source !== DATA_SOURCES.SUPABASE && selectedQuiz.source !== DATA_SOURCES.FOLDER_DECK) {
        throw new Error('Only signed-in Supabase quizzes can be studied from the app. Import Google Sheets quizzes into Supabase first.');
    }

    const loadedQuestions = await loadQuestionsForQuizDescriptor(selectedQuiz);

    if (!loadedQuestions.length) {
        throw createStudyLoadDiagnosticError(`No usable questions were loaded for "${selectedQuiz.name || 'this quiz'}". This usually means the saved question rows do not match the quiz detail table, or every row was filtered out during study-load parsing.`);
    }

    await applyLoadedQuestions(loadedQuestions);
}

// ================= LOAD QUESTIONS =================

function normalizeSheetHeaderKey(value) {
    return normalizeSheetText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getSheetHeaderValues(rows) {
    return (rows[0]?.c || []).map(getCellValue);
}

function findSheetColumnByHeader(headers, candidateKeys) {
    const keys = new Set(candidateKeys.map(normalizeSheetHeaderKey));
    return headers.findIndex(header => keys.has(normalizeSheetHeaderKey(header)));
}

function parseMultipleChoiceOptionHeader(header) {
    const key = normalizeSheetHeaderKey(header);
    const match = key.match(/^option(\d+)$/) || key.match(/^answeroption(\d+)$/);
    return match ? Number(match[1]) : null;
}

function parseMultipleChoiceExplanationHeader(header) {
    const key = normalizeSheetHeaderKey(header);
    const match = key.match(/^option(\d+)explanation(?:html)?$/) || key.match(/^answeroption(\d+)explanation(?:html)?$/);
    return match ? Number(match[1]) : null;
}

function getMultipleChoiceSheetLayout(rows) {
    const headers = getSheetHeaderValues(rows);
    const optionColumns = headers
        .map((header, columnIndex) => ({ optionNumber: parseMultipleChoiceOptionHeader(header), columnIndex }))
        .filter(item => Number.isInteger(item.optionNumber) && item.optionNumber > 0)
        .sort((a, b) => a.optionNumber - b.optionNumber);

    const explanationColumns = new Map(headers
        .map((header, columnIndex) => ({ optionNumber: parseMultipleChoiceExplanationHeader(header), columnIndex }))
        .filter(item => Number.isInteger(item.optionNumber) && item.optionNumber > 0)
        .map(item => [item.optionNumber, item.columnIndex]));

    const correctColumn = findSheetColumnByHeader(headers, [
        'correct_option',
        'correct option',
        'correct option number',
        'correct option index',
        'correct_answer',
        'correct answer',
        'correct'
    ]);
    const correctHeaderKey = correctColumn >= 0 ? normalizeSheetHeaderKey(headers[correctColumn]) : '';
    const correctUsesOptionNumber = /correctoption|correctoptionnumber|correctoptionindex/.test(correctHeaderKey);

    const sectionColumn = findSheetColumnByHeader(headers, ['Section', 'Section number', 'Textbook section', 'Subsection']);
    const buildUpColumn = findSheetColumnByHeader(headers, ['build_up', 'Build Up', 'Build Up Group', 'String', 'Question String', 'Case String']);
    const imageColumn = findSheetColumnByHeader(headers, ['Question image URL', 'Question image', 'Image URL', 'Image']);
    const learningResourcesColumn = findSheetColumnByHeader(headers, ['Learning resources', 'Learning resource', 'Resources']);
    const learningResourcesImageColumn = findSheetColumnByHeader(headers, ['Learning resources image URL', 'Learning resource image URL', 'Resources image URL']);

    if (optionColumns.length) {
        return {
            usesHeaders: true,
            optionColumns,
            explanationColumns,
            correctColumn,
            correctUsesOptionNumber,
            sectionColumn,
            buildUpColumn,
            imageColumn,
            learningResourcesColumn,
            learningResourcesImageColumn
        };
    }

    return {
        usesHeaders: false,
        optionColumns: [2, 3, 4, 5].map((columnIndex, index) => ({ optionNumber: index + 1, columnIndex })),
        explanationColumns: new Map([[1, 7], [2, 8], [3, 9], [4, 10]]),
        correctColumn: 6,
        correctUsesOptionNumber: false,
        sectionColumn: -1,
        buildUpColumn: -1,
        imageColumn: 11,
        learningResourcesColumn: 12,
        learningResourcesImageColumn: 13
    };
}

function resolveMultipleChoiceCorrectAnswer(rawCorrect, optionDrafts, correctUsesOptionNumber = false) {
    const normalizedCorrect = normalizeSheetText(rawCorrect);
    if (!normalizedCorrect) return '';

    if (correctUsesOptionNumber) {
        const optionNumberMatch = normalizedCorrect.match(/^(?:option\s*)?(\d+)$/i);
        const optionNumber = optionNumberMatch ? Number(optionNumberMatch[1]) : NaN;
        if (Number.isInteger(optionNumber)) {
            return optionDrafts.find(option => option.optionNumber === optionNumber)?.text || '';
        }
        return '';
    }

    return normalizedCorrect;
}

function parseMultipleChoiceQuestionsFromGoogleSheetRows(rows) {
    const layout = getMultipleChoiceSheetLayout(rows);
    const dataRows = layout.usesHeaders ? rows.slice(1) : rows;

    return dataRows.map(r => {
        const c = r.c || [];
        const optionDrafts = layout.optionColumns.map(({ optionNumber, columnIndex }) => {
            const text = getCellValue(c[columnIndex]);
            const explanationColumn = layout.explanationColumns.get(optionNumber);
            return {
                optionNumber,
                text,
                explanation: Number.isInteger(explanationColumn) ? getCellValue(c[explanationColumn]) : ''
            };
        }).filter(option => normalizeSheetText(option.text));

        return {
            id: `q_${state.questionIdCounter++}`,
            question: getCellValue(c[0]),
            type: 'multiple choice',
            options: optionDrafts.map(option => option.text),
            optionImages: optionDrafts.map(() => ''),
            correct: resolveMultipleChoiceCorrectAnswer(
                layout.correctColumn >= 0 ? getCellValue(c[layout.correctColumn]) : '',
                optionDrafts,
                layout.correctUsesOptionNumber
            ),
            explanations: optionDrafts.map(option => option.explanation),
            section: layout.sectionColumn >= 0 ? getSectionCellValue(c[layout.sectionColumn]) : '',
            buildUp: layout.buildUpColumn >= 0 ? normalizeBuildUpValue(getCellValue(c[layout.buildUpColumn])) : '',
            image: layout.imageColumn >= 0 ? getCellValue(c[layout.imageColumn]) : '',
            learningResources: layout.learningResourcesColumn >= 0 ? getCellValue(c[layout.learningResourcesColumn]) : '',
            learningResourcesImage: layout.learningResourcesImageColumn >= 0 ? getCellValue(c[layout.learningResourcesImageColumn]) : ''
        };
    }).filter(q => q.question && q.question.toLowerCase() !== 'question');
}

function parseQuestionsFromGoogleSheetRows(rows) {
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

    return parseMultipleChoiceQuestionsFromGoogleSheetRows(rows);
}

async function loadQuestionsFromGoogleSheetDocument(sheetId, sheetName) {
    const rows = await fetchGoogleSheetRows(sheetId, sheetName);
    return parseQuestionsFromGoogleSheetRows(rows);
}

async function loadQuestionsFromGoogleSheets(sheetName) {
    return loadQuestionsFromGoogleSheetDocument(CONFIG.sheetId, sheetName);
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

function clearProgressModeFinishUI() {
    if (!elements.optionsContainer) return;
    elements.optionsContainer.querySelectorAll('.progress-mode-summary, .quiz-challenge-complete-summary').forEach(node => node.remove());
}

function clearQuestionUI() {
    clearProgressModeFinishUI();
    clearFeedback();
    clearExplanations();
    clearOptionFeedback();
    clearOptionButtonStateClasses();
    clearFlashcardSwipeFeedback();
    removeHierarchyUI();
    removeClassifyUI();
    removeFlashcardUI();
    clearDiagramStudyLabels();
    elements.questionImage.classList.remove('zoomed');
    if (elements.questionStarBtn) {
        elements.questionStarBtn.classList.add('hidden');
    }
}

function getMasteryCheckRemainingCount() {
    if (!isMasteryCheckMode()) return 0;
    if (state.masteryCheckFinished) return 0;

    if (state.masteryCheckInCheckpoint) {
        return Math.max(0, state.questionQueue.length - state.currentIndex);
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

    if (isAnswerFeedbackHidden()) {
        clearFeedback();
        return;
    }

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
    if (Array.isArray(state.auth.studioQuizQuestions)) {
        let changedStudioRow = false;
        state.auth.studioQuizQuestions.forEach(question => {
            if (normalizeSheetText(question?.id) === targetId) {
                question.isStarred = !!isStarred;
                changedStudioRow = true;
            }
        });
        if (changedStudioRow && state.auth.quizStudioOpen) {
            renderStudioQuestionList();
        }
    }
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
    recordProgressModeOutcome(q, isCorrect);
    maybeAutoStarQuestionFromOutcome(q, isCorrect);
    maybeUnstarQuestionFromOutcome(q, isCorrect);
    if (state.studyTimer.scope === 'question') {
        stopStudyTimer({ clearDisplay: false });
    }

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

    if (maybeAutoFinishActiveQuizChallengeAfterAnswer()) {
        return;
    }

    if (isRetryMode() || isProgressMode()) {
        updateProgress();
    }

    updateNavigationButtons();
}

// ================= PROGRESS =================
function getMasteryCheckCompletedForProgressBar(total) {
    if (!isMasteryCheckMode()) return 0;
    if (state.masteryCheckFinished) return total;

    const activeQuestionIds = new Set((state.questions || []).map(question => question.id));
    const masteredCount = [...state.masteryCheckMasteredIds]
        .filter(questionId => activeQuestionIds.has(questionId))
        .length;

    return masteredCount + state.currentIndex;
}

function updateProgress() {
    const total = state.questions.length;
    const progressFillEl = document.getElementById('progressFill');
    let remaining = 0;
    let completed = 0;
    let percent = 0;
    let useReviewProgressAppearance = false;
    let overrideProgressText = '';

    if (isProgressMode()) {
        if (state.normalFinished) {
            const missedCount = getProgressMissedQuestions().length;
            if (isAnswerFeedbackHidden()) {
                remaining = 0;
                completed = total;
                percent = total > 0 ? 100 : 0;
                overrideProgressText = missedCount > 0 ? 'Review ready' : 'Complete';
            } else {
                remaining = missedCount;
                completed = total - missedCount;
                percent = total > 0 ? (completed / total) * 100 : 0;
            }
        } else {
            remaining = state.questionQueue.length - state.currentIndex;
            completed = total - remaining;
            percent = total > 0 ? (completed / total) * 100 : 0;
        }
    } else if (isRetentionMode()) {
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

    const timerText = getStudyTimerDisplayText();
    const remainingText = overrideProgressText || (isNarrowIPhoneViewport() ? `${remaining}` : `${remaining} remaining`);
    elements.progressTextEl.innerText = timerText ? `${remainingText}  ${timerText}` : remainingText;

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

function renderProgressModeFinishState() {
    const missedQuestions = getProgressMissedQuestions();
    const missedCount = missedQuestions.length;
    const percent = getProgressScorePercent();
    const hideFeedback = isAnswerFeedbackHidden();

    elements.questionTextEl.style.display = 'block';
    elements.questionTextEl.innerText = hideFeedback
        ? 'Progress Round Complete'
        : (percent >= 100 ? 'Progress Complete!' : (percent + '% complete'));
    elements.optionsContainer.style.display = 'flex';
    elements.optionsContainer.innerHTML = '';

    const summary = document.createElement('div');
    summary.className = 'progress-mode-summary';

    const message = document.createElement('div');
    message.className = 'progress-mode-message';
    if (missedCount > 0) {
        if (hideFeedback) {
            message.innerText = state.progressRetryActive
                ? 'Review round complete. Continue with the remaining review set.'
                : 'Round complete. Continue with the review set.';
        } else {
            const questionLabel = missedCount === 1 ? 'question' : 'questions';
            const retryPrefix = state.progressRetryActive ? 'You still missed ' : 'You missed ';
            message.innerText = retryPrefix + missedCount + ' ' + questionLabel + '. Try again with only the missed questions.';
        }
    } else {
        message.innerText = hideFeedback
            ? 'Progress session complete.'
            : '100% complete. You finished this Progress Mode session.';
    }
    summary.appendChild(message);

    if (missedCount > 0) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'auth-action-btn progress-mode-retry-btn';
        retryBtn.innerText = hideFeedback ? 'Continue Review' : 'Try Again';
        retryBtn.addEventListener('click', startProgressModeRetry);
        summary.appendChild(retryBtn);
    }

    elements.optionsContainer.appendChild(summary);
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
        stopStudyTimer({ clearDisplay: false });
        if (isProgressMode()) {
            renderProgressModeFinishState();
        } else {
            elements.questionTextEl.style.display = 'block';
            elements.questionTextEl.innerText = 'Quiz Finished!';
            elements.optionsContainer.style.display = 'none';
        }
        elements.imageContainer.style.display = '';
        elements.questionImage.style.display = 'none';
        elements.questionImage.src = '';
        state.currentQuestionType = '';
        updateViewportClasses();
        updateProgress();
        updateNavigationButtons();
        syncQuestionStarButton();
        maybeCompleteActiveQuizChallenge();
        return;
    }

    if (state.currentIndex < 0) state.currentIndex = 0;
    if (state.currentIndex >= state.questionQueue.length) state.currentIndex = state.questionQueue.length - 1;

    const q = state.questionQueue[state.currentIndex];
    state.currentQuestionType = q.type || '';
    startAutoStarQuestionWindow(q);
    syncStudyTimerForCurrentQuestion();
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
    setMathChemFormattedText(elements.questionTextEl, q.question);
    elements.imageContainer.style.display = '';
    elements.questionImage.style.display = q.image ? 'block' : 'none';
    elements.questionImage.src = q.image || '';
    if (q.type === 'diagrams' && q.image) {
        renderDiagramStudyLabels(q.diagramLabels || []);
    } else {
        clearDiagramStudyLabels();
    }

    if (q.type === 'multiple choice' || q.type === 'diagrams') {
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
function isGlobalShuffleAnswersSupportedQuestion(question = {}) {
    return question?.type === 'multiple choice' || question?.type === 'diagrams';
}

function isGlobalShuffleAnswersEnabled() {
    return !!state.globalShuffleAnswers.enabled;
}

function getMultipleChoiceOptionEntries(question = {}) {
    return (question.options || []).map((optionText, index) => ({
        text: normalizeSheetText(optionText),
        image: normalizeSheetText((question.optionImages || [])[index]),
        explanation: normalizeSheetText((question.explanations || [])[index])
    })).filter(entry => entry.text || entry.image);
}

function getMultipleChoiceOptionValue(entry = {}) {
    return normalizeSheetText(entry.text) || normalizeSheetText(entry.image);
}

function getMultipleChoiceOptionKey(entry = {}) {
    return getMultipleChoiceOptionValue(entry).toLocaleLowerCase();
}

function getQuestionGlobalShuffleKey(question = {}) {
    return normalizeSheetText(question?.id || question?.sourceQuestionId);
}

function findCorrectMultipleChoiceEntry(question = {}, optionEntries = []) {
    const correctValue = normalizeSheetText(question.correct);
    if (!correctValue) return null;

    const match = optionEntries.find(entry => getMultipleChoiceOptionValue(entry) === correctValue);
    if (match) return { ...match };

    return {
        text: correctValue,
        image: '',
        explanation: ''
    };
}

function buildGlobalShuffleAnswerEntries(question = {}, localOptionEntries = []) {
    if (!isGlobalShuffleAnswersEnabled() || !isGlobalShuffleAnswersSupportedQuestion(question)) {
        return [...localOptionEntries];
    }

    const correctEntry = findCorrectMultipleChoiceEntry(question, localOptionEntries);
    const correctValue = normalizeSheetText(question.correct);
    const targetCount = Math.max(localOptionEntries.length, 1);

    if (!correctEntry || !correctValue || targetCount <= 1) {
        return [...localOptionEntries];
    }

    const currentQuestionKey = getQuestionGlobalShuffleKey(question);
    const selected = [{ ...correctEntry }];
    const usedKeys = new Set([getMultipleChoiceOptionKey(correctEntry)]);

    const sourceQuestions = (state.questions.length ? state.questions : state.questionQueue)
        .filter(candidate => {
            if (!isGlobalShuffleAnswersSupportedQuestion(candidate)) return false;
            if (candidate.type !== question.type) return false;
            const candidateKey = getQuestionGlobalShuffleKey(candidate);
            return !currentQuestionKey || candidateKey !== currentQuestionKey;
        });

    const globalDecoys = [];
    sourceQuestions.forEach(candidate => {
        getMultipleChoiceOptionEntries(candidate).forEach(entry => {
            const value = getMultipleChoiceOptionValue(entry);
            const key = getMultipleChoiceOptionKey(entry);
            if (!value || value === correctValue || usedKeys.has(key)) return;
            usedKeys.add(key);
            globalDecoys.push({ ...entry });
        });
    });

    shuffleArray(globalDecoys);

    while (selected.length < targetCount && globalDecoys.length) {
        selected.push(globalDecoys.shift());
    }

    if (selected.length < targetCount) {
        localOptionEntries.forEach(entry => {
            if (selected.length >= targetCount) return;
            const value = getMultipleChoiceOptionValue(entry);
            const key = getMultipleChoiceOptionKey(entry);
            if (!value || value === correctValue || usedKeys.has(key)) return;
            usedKeys.add(key);
            selected.push({ ...entry });
        });
    }

    shuffleArray(selected);
    return selected;
}

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

    let optionEntries = buildGlobalShuffleAnswerEntries(q, getMultipleChoiceOptionEntries(q));

    if (document.getElementById('shuffleAnswers').checked) {
        shuffleArray(optionEntries);
    }

    const blocks = ensureMultipleChoiceOptionBlocks(Math.max(optionEntries.length, 1));

    blocks.forEach((block, index) => {
        const btn = block.querySelector('.optionBtn');
        const exp = block.querySelector('.explanation');
        const fb = block.querySelector('.option-feedback');
        const entry = optionEntries[index] || null;

        if (entry && btn && exp && fb) {
            const optionValue = entry.text || entry.image;
            block.style.display = '';
            btn.style.display = entry.image ? 'flex' : 'block';
            btn.innerHTML = '';
            if (entry.image) {
                const imageWrap = document.createElement('span');
                imageWrap.className = 'option-image-wrap';

                const image = document.createElement('img');
                image.className = 'option-image';
                image.alt = entry.text ? `Image for ${entry.text}` : `Option ${index + 1} image`;
                image.src = entry.image;

                imageWrap.appendChild(image);
                imageWrap.appendChild(createOptionImageZoomButton(entry.image, image.alt));
                btn.appendChild(imageWrap);
            }
            if (entry.text) {
                const textEl = document.createElement('span');
                textEl.className = 'option-text';
                setMathChemFormattedText(textEl, entry.text);
                btn.appendChild(textEl);
            }
            btn.dataset.optionValue = optionValue;
            btn.disabled = false;
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
            btn.classList.toggle('option-has-image', !!entry.image);
            btn.classList.remove('option-correct', 'option-incorrect');
            btn.onclick = () => checkAnswer(optionValue, optionEntries.map(item => item.explanation));
            exp.innerText = '';
            fb.innerText = '';
            fb.classList.remove('correct-mark', 'incorrect-mark');
        } else {
            block.style.display = 'none';
            if (btn) {
                btn.style.display = 'none';
                btn.innerText = '';
                btn.dataset.optionValue = '';
                btn.classList.remove('option-correct', 'option-incorrect', 'option-has-image');
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
    const hideFeedback = isAnswerFeedbackHidden();

    elements.optionsContainer.querySelectorAll('.option-block').forEach((block, i) => {
        if (block.style.display === 'none') return;
        const btn = block.querySelector('.optionBtn');
        const explanationEl = block.querySelector('.explanation');
        const feedbackEl = block.querySelector('.option-feedback');
        if (!btn || !explanationEl || !feedbackEl) return;

        btn.classList.remove('option-correct', 'option-incorrect');
        setMathChemFormattedText(explanationEl, hideFeedback ? '' : (explanations[i] || ''));
        const optionValue = btn.dataset.optionValue || btn.innerText;

        if (!hideFeedback) {
            if (optionValue === q.correct) {
                btn.classList.add('option-correct');
            } else if (optionValue === selected && !isCorrect) {
                btn.classList.add('option-incorrect');
            }
        }

        feedbackEl.classList.remove('correct-mark', 'incorrect-mark');

        if (!hideFeedback && optionValue === q.correct) {
            feedbackEl.innerText = '✔';
            feedbackEl.classList.add('correct-mark');
        } else if (!hideFeedback && optionValue === selected && !isCorrect) {
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
            html: normalizeSheetText(q.definitionHtml),
            imageUrl: normalizeSheetText(q.definitionImage)
        };
    }

    return {
        sideName: 'Term',
        text: normalizeSheetText(q.termText),
        html: normalizeSheetText(q.termHtml),
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

    const safeHtml = sanitizeLearningResourcesHtml(sideData.html || '');
    const hasRichText = !!htmlToDisplayText(safeHtml);
    const hasText = hasRichText || !!sideData.text;
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
        if (hasRichText) {
            text.innerHTML = safeHtml;
        } else {
            text.innerText = sideData.text;
        }
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
        const hideFeedback = isAnswerFeedbackHidden();

        rows.forEach((r, i) => {
            const itemEl = r.querySelector('.hierarchy-item');
            const text = itemEl.innerText;
            const fb = r.querySelector('.hierarchy-feedback');

            itemEl.classList.remove('option-correct', 'option-incorrect');
            fb.classList.remove('correct-mark', 'incorrect-mark');

            if (q.options.indexOf(text) === q.correctOrder[i] - 1) {
                if (!hideFeedback) {
                    itemEl.classList.add('option-correct');
                    fb.innerText = '✔';
                    fb.classList.add('correct-mark');
                } else {
                    fb.innerText = '';
                }
            } else {
                if (!hideFeedback) {
                    itemEl.classList.add('option-incorrect');
                    fb.innerText = '✖';
                    fb.classList.add('incorrect-mark');
                } else {
                    fb.innerText = '';
                }
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
    const progressLockedCorrectKeys = new Set();
    const progressWrongKeys = new Set();
    const shouldUseProgressClassifyRetry = () => isProgressMode() && !isAnswerFeedbackHidden();
    let selectedItemKey = null;
    let suppressClickRuntimeKey = null;
    let progressClassifyNeedsRevision = false;
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

    function refreshClassifySubmitLabel() {
        if (!shouldUseProgressClassifyRetry()) {
            submit.innerText = 'Submit';
            return;
        }

        submit.innerText = progressClassifyNeedsRevision ? 'Try Again' : 'Submit';
    }

    function markClassifyItemRevised(runtimeKey) {
        if (!shouldUseProgressClassifyRetry()) return;
        if (progressLockedCorrectKeys.has(runtimeKey)) return;

        progressWrongKeys.delete(runtimeKey);
        progressClassifyNeedsRevision = false;
        refreshClassifySubmitLabel();
    }

    function moveSelectedItemTo(classificationId) {
        if (state.questionAnswered) return;
        if (!selectedItemKey) return;
        if (shouldUseProgressClassifyRetry() && progressLockedCorrectKeys.has(selectedItemKey)) return;

        const runtimeKey = selectedItemKey;
        placements.set(runtimeKey, normalizeClassificationId(classificationId));
        markClassifyItemRevised(runtimeKey);
        selectedItemKey = null;
        preserveWindowScroll(() => renderClassifyStatePreservingScroll());
    }

    function handleDroppedItem(runtimeKey, classificationId) {
        if (shouldUseProgressClassifyRetry() && progressLockedCorrectKeys.has(runtimeKey)) return;

        placements.set(runtimeKey, normalizeClassificationId(classificationId));
        markClassifyItemRevised(runtimeKey);
        selectedItemKey = null;
        preserveWindowScroll(() => renderClassifyStatePreservingScroll());
    }

    function createItemButton(item) {
        const btn = document.createElement('div');
        btn.className = 'classify-item';
        btn.dataset.runtimeKey = item.runtimeKey;
        btn.setAttribute('role', 'button');
        const isProgressLockedCorrect = shouldUseProgressClassifyRetry() && progressLockedCorrectKeys.has(item.runtimeKey);
        const isProgressWrong = shouldUseProgressClassifyRetry() && progressWrongKeys.has(item.runtimeKey);

        btn.setAttribute('tabindex', state.questionAnswered || isProgressLockedCorrect ? '-1' : '0');
        btn.setAttribute('aria-label', item.ariaLabel || 'Classify item');
        btn.classList.toggle('classify-item-locked', isProgressLockedCorrect);

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

        if (!isAnswerFeedbackHidden()) {
            if (isProgressLockedCorrect) {
                btn.classList.add('option-correct');
            } else if (isProgressWrong) {
                btn.classList.add('option-incorrect');
            } else if (state.questionAnswered) {
                const placedId = normalizeClassificationId(placements.get(item.runtimeKey));
                const correctId = normalizeClassificationId(item.correctClassificationId);

                if (placedId && placedId === correctId) {
                    btn.classList.add('option-correct');
                } else {
                    btn.classList.add('option-incorrect');
                }
            }
        }

        btn.addEventListener('pointerdown', e => {
            if (state.questionAnswered || isProgressLockedCorrect) return;
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

            if (state.questionAnswered || isProgressLockedCorrect) return;
            if (suppressClickRuntimeKey === item.runtimeKey) {
                suppressClickRuntimeKey = null;
                return;
            }

            selectedItemKey = selectedItemKey === item.runtimeKey ? null : item.runtimeKey;
            preserveWindowScroll(() => renderClassifyStatePreservingScroll());
        });

        btn.addEventListener('keydown', e => {
            if (state.questionAnswered || isProgressLockedCorrect) return;
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

        if (shouldUseProgressClassifyRetry() && progressClassifyNeedsRevision) {
            progressClassifyNeedsRevision = false;
            refreshClassifySubmitLabel();
            setFeedback('Move the red items, then submit again.', false);
            return;
        }

        selectedItemKey = null;
        cleanupDragState();

        if (shouldUseProgressClassifyRetry()) {
            let placedAnyThisAttempt = false;

            items.forEach(item => {
                if (progressLockedCorrectKeys.has(item.runtimeKey)) return;

                const placedId = normalizeClassificationId(placements.get(item.runtimeKey));
                const correctId = normalizeClassificationId(item.correctClassificationId);

                if (!placedId) {
                    return;
                }

                placedAnyThisAttempt = true;

                if (placedId === correctId) {
                    progressLockedCorrectKeys.add(item.runtimeKey);
                    progressWrongKeys.delete(item.runtimeKey);
                } else {
                    progressWrongKeys.add(item.runtimeKey);
                }
            });

            const allCorrect = items.every(item => progressLockedCorrectKeys.has(item.runtimeKey));

            if (!allCorrect) {
                const hasWrongItems = progressWrongKeys.size > 0;
                const keepGoingMessage = placedAnyThisAttempt || progressLockedCorrectKeys.size > 0
                    ? 'Correct items locked. Keep going.'
                    : 'Move any item, then submit.';
                progressClassifyNeedsRevision = hasWrongItems;
                refreshClassifySubmitLabel();
                preserveWindowScroll(() => renderClassifyStatePreservingScroll());
                setFeedback(hasWrongItems ? 'Try again.' : keepGoingMessage, !hasWrongItems);
                updateNavigationButtons();
                return;
            }

            state.questionAnswered = true;
            progressClassifyNeedsRevision = false;
            refreshClassifySubmitLabel();
            preserveWindowScroll(() => renderClassifyStatePreservingScroll());
            setClassifyInteractionEnabled(false);
            applyQuestionOutcome(q, true);
            return;
        }

        state.questionAnswered = true;

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

    refreshClassifySubmitLabel();
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

    if (advancePastAutoStarredExcludedCurrentQuestion()) {
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
    state.studyTimer.sessionToken += 1;
    stopStudyTimer({ clearDisplay: false });
    state.autoStar.currentAttemptKey = '';
    state.autoStar.currentQuestionKey = '';
    state.autoStar.questionStartedAt = 0;
    state.autoStar.disqualifiedQuestionKeys = new Set();
    state.autoStar.pendingQuestionKeys = new Set();
    state.autoStar.excludedQuestionKeys = new Set();

    state.pendingRetentionJump = false;
    state.pendingRetentionCorrect = false;
    state.retentionAnswerLocked = false;
    state.retentionFinished = false;
    state.retentionSolvedIds = new Set();

    state.pendingMasteryAdvance = false;
    resetMasteryCheckState();

    state.progressRetryActive = false;
    state.progressWrongQuestionMap = new Map();

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
    state.questionQueue = buildStudyQuestionQueue(state.questions, {
        shuffle: !!document.getElementById('shuffleQuestions')?.checked
    });

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
        const progressMode = document.getElementById('progressMode');
        if (progressMode) progressMode.checked = false;
    }
    updateSettingsAvailability();
    restartQuiz();
};

document.getElementById('masteryMode').onchange = e => {
    if (e.target.checked) {
        document.getElementById('retentionMode').checked = false;
        document.getElementById('masteryCheckMode').checked = false;
        const progressMode = document.getElementById('progressMode');
        if (progressMode) progressMode.checked = false;
    }
    updateSettingsAvailability();
    restartQuiz();
};

document.getElementById('masteryCheckMode').onchange = e => {
    if (e.target.checked) {
        document.getElementById('retentionMode').checked = false;
        document.getElementById('masteryMode').checked = false;
        const progressMode = document.getElementById('progressMode');
        if (progressMode) progressMode.checked = false;
    }
    updateSettingsAvailability();
    restartQuiz();
};

document.getElementById('progressMode').onchange = e => {
    if (e.target.checked) {
        document.getElementById('retentionMode').checked = false;
        document.getElementById('masteryMode').checked = false;
        document.getElementById('masteryCheckMode').checked = false;
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

function handleStarredStudyFilterChange(changedFilter = '') {
    if (changedFilter === 'exclude' && elements.excludeStarredQuestions?.checked && elements.onlyStarredQuestions) {
        elements.onlyStarredQuestions.checked = false;
    }
    if (changedFilter === 'only' && elements.onlyStarredQuestions?.checked && elements.excludeStarredQuestions) {
        elements.excludeStarredQuestions.checked = false;
    }
    updateSettingsAvailability();
    if (!state.sourceQuestions.length) {
        return;
    }
    applyFilteredQuestionsToSession({ resetSession: true });
}

if (elements.excludeStarredQuestions) {
    elements.excludeStarredQuestions.addEventListener('change', () => {
        handleStarredStudyFilterChange('exclude');
    });
}

if (elements.onlyStarredQuestions) {
    elements.onlyStarredQuestions.addEventListener('change', () => {
        handleStarredStudyFilterChange('only');
    });
}

[elements.timerMode, elements.timerScopeSelect, elements.timerPresetSelect, elements.timerCustomSeconds].forEach(control => {
    if (!control) return;
    control.addEventListener('change', () => {
        readStudyTimerSettingsFromUI();
        restartStudyTimerAfterSettingsChange();
    });
    if (control === elements.timerCustomSeconds) {
        control.addEventListener('input', () => {
            readStudyTimerSettingsFromUI();
            restartStudyTimerAfterSettingsChange();
        });
    }
});

[elements.autoStarMode, elements.autoStarPresetSelect, elements.autoStarCustomSeconds].forEach(control => {
    if (!control) return;
    control.addEventListener('change', () => {
        readAutoStarSettingsFromUI();
        updateSettingsAvailability();
    });
    if (control === elements.autoStarCustomSeconds) {
        control.addEventListener('input', () => {
            readAutoStarSettingsFromUI();
            updateSettingsAvailability();
        });
    }
});

if (elements.unstarOnWrongMode) {
    elements.unstarOnWrongMode.addEventListener('change', () => {
        readUnstarOnWrongSettingsFromUI();
        updateSettingsAvailability();
    });
}

if (elements.hideAnswerFeedbackMode) {
    elements.hideAnswerFeedbackMode.addEventListener('change', () => {
        readHideAnswerFeedbackSettingsFromUI();
        updateSettingsAvailability();
        updateProgress();
        if (isQuizFinished()) {
            showQuestion();
        }
    });
}

if (elements.globalShuffleAnswers) {
    elements.globalShuffleAnswers.addEventListener('change', () => {
        readGlobalShuffleAnswersSettingsFromUI();
        updateSettingsAvailability();
        if (!state.questionAnswered && isGlobalShuffleAnswersSupportedQuestion(state.questionQueue[state.currentIndex])) {
            showQuestion();
        }
    });
}

if (elements.allowBuildUp) {
    elements.allowBuildUp.addEventListener('change', () => {
        updateSettingsAvailability();
        if (state.sourceQuestions.length) {
            applyFilteredQuestionsToSession({ resetSession: true });
        } else {
            restartQuiz();
        }
    });
}

if (elements.questionStarBtn) {
    elements.questionStarBtn.addEventListener('click', () => {
        toggleCurrentQuestionStarState().catch(err => {
            console.error(err);
        });
    });
}

if (elements.studioHomeBtn) {
    elements.studioHomeBtn.addEventListener('click', event => {
        event.stopPropagation();
        if (elements.settingsPopup && !elements.settingsPopup.classList.contains('hidden')) {
            closeSettingsPopup();
        }

        if (!state.auth.user?.id) {
            openAuthPopup();
            setAuthStatus('Sign in to open Quiz Studio Home.');
            return;
        }

        openQuizStudioPage('home');
    });
}


elements.folderSelector.addEventListener('change', e => {
    if (!state.auth.user?.id) {
        clearActiveQuizSelection('Sign in to load your quizzes.');
        return;
    }

    const selectedFolder = e.target.value;
    populateQuizDropdown(selectedFolder);

    if (!selectedFolder) {
        clearActiveQuizSelection();
        return;
    }

    clearActiveQuizSelection('Choose a quiz or study the whole folder.');
});

elements.quizSelector.addEventListener('change', async e => {
    if (!state.auth.user?.id) {
        clearActiveQuizSelection('Sign in to load your quizzes.');
        return;
    }

    const selectedQuiz = e.target.value;

    if (!selectedQuiz) {
        clearActiveQuizSelection(elements.folderSelector.value ? 'Choose a quiz or study the whole folder.' : 'Choose a folder and a quiz.');
        return;
    }


    try {
        await loadSelectedQuiz(selectedQuiz);
    } catch (err) {
        console.error(err);
        clearActiveQuizSelection(getStudyLoadErrorMessage(err));
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

if (elements.createQuizFolderNewBtn) {
    elements.createQuizFolderNewBtn.addEventListener('click', () => {
        setEditorInlineFolderCreatorOpen(true);
    });
}

if (elements.createQuizNewFolderCancelBtn) {
    elements.createQuizNewFolderCancelBtn.addEventListener('click', () => {
        setEditorInlineFolderCreatorOpen(false);
    });
}

if (elements.createQuizNewFolderCreateBtn) {
    elements.createQuizNewFolderCreateBtn.addEventListener('click', () => {
        handleCreateFolderFromEditor().catch(err => {
            console.error(err);
            setCreatorStatus('Could not create the folder.', 'error');
        });
    });
}

if (elements.createQuizNewFolderName) {
    elements.createQuizNewFolderName.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleCreateFolderFromEditor().catch(err => {
                console.error(err);
                setCreatorStatus('Could not create the folder.', 'error');
            });
        } else if (event.key === 'Escape') {
            event.preventDefault();
            setEditorInlineFolderCreatorOpen(false);
        }
    });
}

if (elements.openQuizStudioBtn) {
    elements.openQuizStudioBtn.addEventListener('click', () => {
        openQuizStudioPage('home');
    });
}

elements.quizStudioSectionButtons.forEach(button => {
    button.addEventListener('click', () => {
        setQuizStudioSection(button.dataset.studioSectionTarget || 'home').catch(err => {
            console.error(err);
            setCreatorStatus('Could not switch Quiz Studio sections.', 'error');
        });
    });
});

if (elements.closeQuizStudioBtn) {
    elements.closeQuizStudioBtn.addEventListener('click', () => {
        closeQuizStudioPage().catch(err => {
            console.error(err);
            setCreatorStatus('Could not close Quiz Studio.', 'error');
        });
    });
}

// Keep Quiz Studio open when the user clicks outside the editor panel.
// The editor should only close through the explicit X/close action so
// accidental backdrop clicks do not send the user back to study mode.

if (elements.addOptionFieldBtn) {
    elements.addOptionFieldBtn.addEventListener('click', () => {
        addStudioOptionField();
    });
}

if (elements.addOptionInlineBtn) {
    elements.addOptionInlineBtn.addEventListener('click', () => {
        addStudioOptionField();
    });
}

if (elements.removeOptionFieldBtn) {
    elements.removeOptionFieldBtn.addEventListener('click', () => {
        removeStudioOptionField();
    });
}

if (elements.createOptionFieldsContainer) {
    elements.createOptionFieldsContainer.addEventListener('click', event => {
        const toggle = event.target.closest('[data-option-image-toggle]');
        if (toggle) {
            event.preventDefault();
            setStudioOptionImagePanelOpen(toggle.closest('[data-option-index]'));
            return;
        }

        const clearBtn = event.target.closest('[data-option-image-clear]');
        if (clearBtn) {
            event.preventDefault();
            const row = clearBtn.closest('[data-option-index]');
            setStudioOptionImageState(row, '', 'No option image selected.');
            setStudioDirtyState(true);
            return;
        }

        const deleteBtn = event.target.closest('[data-option-delete]');
        if (deleteBtn) {
            event.preventDefault();
            const row = deleteBtn.closest('[data-option-index]');
            removeStudioOptionFieldAt(Number(row?.dataset.optionIndex || 0));
        }
    });

    elements.createOptionFieldsContainer.addEventListener('change', event => {
        const fileInput = event.target.closest('[data-option-image-file]');
        if (!fileInput) return;
        handleStudioOptionImageFileInput(fileInput).catch(err => {
            console.error(err);
            setCreatorStatus('Could not load the option image.', 'error');
        });
    });
}

if (elements.toggleMathChemToolsBtn) {
    elements.toggleMathChemToolsBtn.addEventListener('click', () => {
        setMathChemToolsExpanded(!state.auth.mathChemToolsExpanded);
    });
}

if (elements.studioMathChemTools) {
    elements.studioMathChemTools.addEventListener('mousedown', event => {
        if (event.target.closest('button')) {
            event.preventDefault();
        }
    });

    elements.studioMathChemTools.addEventListener('click', event => {
        const tabButton = event.target.closest('[data-math-chem-tab]');
        if (tabButton) {
            setActiveMathChemPanel(tabButton.dataset.mathChemTab);
            return;
        }

        const insertButton = event.target.closest('[data-math-chem-insert]');
        if (insertButton) {
            insertMathChemTextAtTarget(insertButton.dataset.mathChemInsert || '');
        }
    });
}

if (elements.insertMathChemFractionBtn) {
    elements.insertMathChemFractionBtn.addEventListener('click', insertMathChemFractionFromControls);
}

if (elements.insertMathChemSuperscriptBtn) {
    elements.insertMathChemSuperscriptBtn.addEventListener('click', () => {
        insertMathChemScriptFromControl(elements.mathChemSuperscriptInput, convertToMathChemSuperscript, 'superscript');
    });
}

if (elements.insertMathChemSubscriptBtn) {
    elements.insertMathChemSubscriptBtn.addEventListener('click', () => {
        insertMathChemScriptFromControl(elements.mathChemSubscriptInput, convertToMathChemSubscript, 'subscript');
    });
}

[elements.mathChemFractionNumerator, elements.mathChemFractionDenominator].forEach(input => {
    if (!input) return;
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            insertMathChemFractionFromControls();
        }
    });
});

if (elements.mathChemSuperscriptInput) {
    elements.mathChemSuperscriptInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            insertMathChemScriptFromControl(elements.mathChemSuperscriptInput, convertToMathChemSuperscript, 'superscript');
        }
    });
}

if (elements.mathChemSubscriptInput) {
    elements.mathChemSubscriptInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            insertMathChemScriptFromControl(elements.mathChemSubscriptInput, convertToMathChemSubscript, 'subscript');
        }
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
            setStudioDirtyState(true);
        }).catch(err => {
            console.error(err);
            setCreatorStatus('Could not load the category image.', 'error');
        });
    });

    elements.createClassifyCategoriesContainer.addEventListener('click', event => {
        const toggle = event.target.closest('[data-classify-category-image-toggle]');
        if (toggle) {
            event.preventDefault();
            setStudioClassifyRowImagePanelOpen(toggle.closest('[data-classify-category-index]'), 'category');
            return;
        }

        const clearBtn = event.target.closest('[data-classify-category-image-clear]');
        if (!clearBtn) return;
        const row = clearBtn.closest('[data-classify-category-index]');
        setStudioClassifyRowImageState(row, 'category');
        refreshStudioClassifyItemCategoryOptions();
        setStudioDirtyState(true);
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
            setStudioDirtyState(true);
        }).catch(err => {
            console.error(err);
            setCreatorStatus('Could not load the item image.', 'error');
        });
    });

    elements.createClassifyItemsContainer.addEventListener('click', event => {
        const toggle = event.target.closest('[data-classify-item-image-toggle]');
        if (toggle) {
            event.preventDefault();
            setStudioClassifyRowImagePanelOpen(toggle.closest('[data-classify-item-index]'), 'item');
            return;
        }

        const clearBtn = event.target.closest('[data-classify-item-image-clear]');
        if (!clearBtn) return;
        const row = clearBtn.closest('[data-classify-item-index]');
        setStudioClassifyRowImageState(row, 'item');
        setStudioDirtyState(true);
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
        handleSaveStudioEditorChanges().catch(err => {
            console.error(err);
            setCreatorStatus('Could not save the quiz.', 'error');
        });
    });
}

if (elements.studioEditorActionSaveBtn) {
    elements.studioEditorActionSaveBtn.addEventListener('click', () => {
        handleSaveStudioEditorChanges().catch(err => {
            console.error(err);
            setCreatorStatus('Could not save the quiz.', 'error');
        });
    });
}

if (elements.studioStudyQuizBtn) {
    elements.studioStudyQuizBtn.addEventListener('click', () => {
        if (!state.auth.editingQuizId) {
            setCreatorStatus('Save or open a quiz before studying it.', 'error');
            return;
        }

        studySupabaseQuizFromStudio(state.auth.editingQuizId).catch(err => {
            console.error(err);
            setCreatorStatus(getStudyLoadErrorMessage(err), 'error');
        });
    });
}

if (elements.createQuizCancelEditBtn) {
    elements.createQuizCancelEditBtn.addEventListener('click', () => {
        clearCreatorInputs();
        setQuizStudioSection('editor', { force: true }).catch(err => {
            console.error(err);
            setCreatorStatus('Could not open the editor.', 'error');
        });
        setCreatorStatus('Ready to create a new quiz.');
    });
}

const handleStudioNavigateQuestionClick = direction => {
    handleStudioNavigateQuestion(direction).catch(err => {
        console.error(err);
        setCreatorStatus(direction === 'previous' ? 'Could not load the previous question.' : 'Could not load the next question.', 'error');
    });
};

if (elements.studioPrevQuestionBtn) {
    elements.studioPrevQuestionBtn.addEventListener('click', () => handleStudioNavigateQuestionClick('previous'));
}

if (elements.studioPrevQuestionBottomBtn) {
    elements.studioPrevQuestionBottomBtn.addEventListener('click', () => handleStudioNavigateQuestionClick('previous'));
}

if (elements.studioNextQuestionBtn) {
    elements.studioNextQuestionBtn.addEventListener('click', () => handleStudioNavigateQuestionClick('next'));
}

if (elements.studioNextQuestionBottomBtn) {
    elements.studioNextQuestionBottomBtn.addEventListener('click', () => handleStudioNavigateQuestionClick('next'));
}

const handleStudioAddQuestionClick = () => {
    const addAction = isStudioFlashcardMode()
        ? handleStudioFlashcardAddCard()
        : beginStudioNewQuestion();

    addAction.catch(err => {
        console.error(err);
        setCreatorStatus(isStudioFlashcardMode() ? 'Could not add a new card.' : 'Could not add a new question.', 'error');
    });
};

if (elements.studioAddQuestionBtn) {
    elements.studioAddQuestionBtn.addEventListener('click', handleStudioAddQuestionClick);
}

if (elements.studioAddQuestionBottomBtn) {
    elements.studioAddQuestionBottomBtn.addEventListener('click', handleStudioAddQuestionClick);
}

const handleStudioDuplicateQuestionClick = () => {
    handleDuplicateStudioQuestion().catch(err => {
        console.error(err);
        setCreatorStatus('Could not duplicate the question.', 'error');
    });
};

if (elements.studioDuplicateQuestionBtn) {
    elements.studioDuplicateQuestionBtn.addEventListener('click', handleStudioDuplicateQuestionClick);
}

if (elements.studioDuplicateQuestionBottomBtn) {
    elements.studioDuplicateQuestionBottomBtn.addEventListener('click', handleStudioDuplicateQuestionClick);
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
    const clearStudioQuestionDropTargets = () => {
        elements.studioQuestionList.querySelectorAll('.studio-question-list-item.drag-over').forEach(node => {
            node.classList.remove('drag-over');
        });
    };

    elements.studioQuestionList.addEventListener('click', e => {
        const showAllButton = e.target.closest('[data-studio-show-all-questions]');
        if (showAllButton) {
            clearStudioQuestionListFocusModes();
            return;
        }

        const buildUpClearButton = e.target.closest('[data-studio-build-up-clear]');
        if (buildUpClearButton) {
            clearStudioBuildUpEditMode();
            return;
        }

        const buildUpStringButton = e.target.closest('[data-studio-build-up-string-question-id]');
        if (buildUpStringButton) {
            handleStudioBuildUpStringButton(buildUpStringButton.dataset.studioBuildUpStringQuestionId).catch(err => {
                console.error(err);
                setCreatorStatus(err.message || 'Could not open that Build Up string.', 'error');
            });
            return;
        }

        const buildUpAddButton = e.target.closest('[data-studio-build-up-add-question-id]');
        if (buildUpAddButton && !buildUpAddButton.disabled) {
            handleStudioBuildUpAddQuestion(buildUpAddButton.dataset.studioBuildUpAddQuestionId).catch(err => {
                console.error(err);
                setCreatorStatus(err.message || 'Could not add that question to the string.', 'error');
            });
            return;
        }

        const buildUpRemoveButton = e.target.closest('[data-studio-build-up-remove-question-id]');
        if (buildUpRemoveButton && !buildUpRemoveButton.disabled) {
            handleStudioBuildUpRemoveQuestion(buildUpRemoveButton.dataset.studioBuildUpRemoveQuestionId).catch(err => {
                console.error(err);
                setCreatorStatus(err.message || 'Could not remove that question from the string.', 'error');
            });
            return;
        }

        const focusBuildUpButton = e.target.closest('[data-studio-focus-build-up-string]');
        if (focusBuildUpButton) {
            const buildUpValue = normalizeBuildUpValue(focusBuildUpButton.dataset.studioFocusBuildUpString || '');
            if (buildUpValue) {
                setStudioBuildUpFocusMode(buildUpValue);
            }
            return;
        }

        const focusButton = e.target.closest('[data-studio-focus-question-id]');
        if (focusButton) {
            const questionId = normalizeSheetText(focusButton.dataset.studioFocusQuestionId || '');
            if (questionId) {
                loadStudioQuestionIntoEditor(questionId, { suppressStatus: true }).then(() => {
                    setStudioQuestionFocusMode(questionId);
                }).catch(err => {
                    console.error(err);
                    setCreatorStatus('Could not focus that question.', 'error');
                });
            }
            return;
        }

        const discardPendingButton = e.target.closest('[data-studio-discard-pending-card]');
        if (discardPendingButton) {
            state.auth.studioPendingNewQuestionRow = null;
            clearStudioQuestionInputs();
            setCreatorStatus('Unsaved new card discarded.', 'success');
            return;
        }

        const discardLocalButton = e.target.closest('[data-studio-discard-local-card]');
        if (discardLocalButton) {
            const localId = discardLocalButton.dataset.studioDiscardLocalCard;
            state.auth.studioQuizQuestions = state.auth.studioQuizQuestions.filter(row => row.id !== localId);
            if (state.auth.editingQuestionId === localId) {
                clearStudioQuestionInputs();
                setStudioDirtyState(hasStudioQuestionDrafts());
            } else {
                renderStudioQuestionList();
                setStudioDirtyState(hasStudioQuestionDrafts());
            }
            setCreatorStatus('Unsaved new card discarded.', 'success');
            return;
        }

        const deleteButton = e.target.closest('[data-studio-delete-question-id]');
        if (deleteButton) {
            handleDeleteStudioQuestion(deleteButton.dataset.studioDeleteQuestionId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not delete the question.', 'error');
            });
            return;
        }

        const insertButton = e.target.closest('[data-studio-insert-after-question-id]');
        if (insertButton) {
            beginStudioNewQuestion(insertButton.dataset.studioInsertAfterQuestionId, { focusNewQuestion: true }).catch(err => {
                console.error(err);
                setCreatorStatus('Could not insert a new question.', 'error');
            });
            return;
        }

        const saveTailButton = e.target.closest('[data-studio-save-tail-card]');
        if (saveTailButton) {
            handleSaveStudioQuiz().catch(err => {
                console.error(err);
                setCreatorStatus('Could not save the flashcard changes.', 'error');
            });
            return;
        }

        const addTailButton = e.target.closest('[data-studio-add-tail-card]');
        if (addTailButton) {
            handleStudioFlashcardAddCard().catch(err => {
                console.error(err);
                setCreatorStatus('Could not add the next flashcard.', 'error');
            });
            return;
        }

        const button = e.target.closest('[data-studio-question-id]');
        if (!button) return;

        loadStudioQuestionIntoEditor(button.dataset.studioQuestionId).catch(err => {
            console.error(err);
            setCreatorStatus('Could not load that question.', 'error');
        });
    });

    elements.studioQuestionList.addEventListener('focusin', e => {
        const termField = e.target.closest('[data-studio-flashcard-term-id], [data-studio-pending-flashcard-term]');
        const definitionField = e.target.closest('[data-studio-flashcard-definition-id], [data-studio-pending-flashcard-definition]');
        const targetField = termField || definitionField;
        if (!targetField) return;

        if (targetField.hasAttribute('data-studio-pending-flashcard-term') || targetField.hasAttribute('data-studio-pending-flashcard-definition')) {
            return;
        }

        const questionId = targetField.dataset.studioFlashcardTermId || targetField.dataset.studioFlashcardDefinitionId;
        if (!questionId || questionId === state.auth.editingQuestionId) return;

        const selector = termField ? `[data-studio-flashcard-term-id="${questionId}"]` : `[data-studio-flashcard-definition-id="${questionId}"]`;
        const loadAction = isStudioLocalFlashcardId(questionId)
            ? Promise.resolve(loadStudioLocalFlashcardIntoEditor(questionId, { suppressStatus: true }))
            : loadStudioQuestionIntoEditor(questionId, { suppressStatus: true });
        loadAction.then(() => {
            const replacementField = elements.studioQuestionList?.querySelector(selector);
            if (replacementField) {
                replacementField.focus();
                const valueLength = replacementField.value.length;
                replacementField.setSelectionRange(valueLength, valueLength);
            }
        }).catch(err => {
            console.error(err);
            setCreatorStatus('Could not load that flashcard.', 'error');
        });
    });

    elements.studioQuestionList.addEventListener('input', e => {
        const termField = e.target.closest('[data-studio-flashcard-term-id]');
        if (termField) {
            autosizeStudioFlashcardInlineTextarea(termField);
            updateStudioFlashcardDraft(termField.dataset.studioFlashcardTermId, 'term', termField.value);
            return;
        }

        const pendingTermField = e.target.closest('[data-studio-pending-flashcard-term]');
        if (pendingTermField) {
            autosizeStudioFlashcardInlineTextarea(pendingTermField);
            const row = getStudioPendingFlashcardRow();
            if (row) {
                row.term_plain = pendingTermField.value;
                row.prompt_plain = pendingTermField.value;
                if (elements.createFlashcardTerm && elements.createFlashcardTerm !== document.activeElement) {
                    elements.createFlashcardTerm.value = pendingTermField.value;
                }
                setStudioDirtyState(true);
            }
            return;
        }

        const definitionField = e.target.closest('[data-studio-flashcard-definition-id]');
        if (definitionField) {
            autosizeStudioFlashcardInlineTextarea(definitionField);
            updateStudioFlashcardDraft(definitionField.dataset.studioFlashcardDefinitionId, 'definition', definitionField.value);
            return;
        }

        const pendingDefinitionField = e.target.closest('[data-studio-pending-flashcard-definition]');
        if (pendingDefinitionField) {
            autosizeStudioFlashcardInlineTextarea(pendingDefinitionField);
            const row = getStudioPendingFlashcardRow();
            if (row) {
                row.definition_plain = pendingDefinitionField.value;
                if (elements.createFlashcardDefinition && elements.createFlashcardDefinition !== document.activeElement) {
                    elements.createFlashcardDefinition.value = pendingDefinitionField.value;
                }
                setStudioDirtyState(true);
            }
        }
    });

    let studioQuestionPointerDrag = null;

    function getStudioQuestionRowIdFromWrapper(rowWrapper) {
        return normalizeSheetText(rowWrapper?.querySelector('[data-studio-row-question-id]')?.dataset.studioRowQuestionId || '');
    }

    function getStudioQuestionDropNeighborIds(placeholder, draggedQuestionId) {
        const children = Array.from(elements.studioQuestionList?.children || []);
        const placeholderIndex = children.indexOf(placeholder);
        if (placeholderIndex === -1) return { previousId: '', nextId: '' };

        let previousId = '';
        for (let index = placeholderIndex - 1; index >= 0; index -= 1) {
            const id = getStudioQuestionRowIdFromWrapper(children[index]);
            if (id && id !== draggedQuestionId) {
                previousId = id;
                break;
            }
        }

        let nextId = '';
        for (let index = placeholderIndex + 1; index < children.length; index += 1) {
            const id = getStudioQuestionRowIdFromWrapper(children[index]);
            if (id && id !== draggedQuestionId) {
                nextId = id;
                break;
            }
        }

        return { previousId, nextId };
    }

    async function reorderStudioQuestionFromDragDrop(draggedQuestionId, previousId, nextId) {
        if (!state.auth.client || !draggedQuestionId) return;
        if (state.auth.studioHasUnsavedChanges) {
            cacheCurrentStudioQuestionDraft();
        }

        const orderedQuestionIds = state.auth.studioQuizQuestions.map(question => question.id);
        const draggedIndex = orderedQuestionIds.indexOf(draggedQuestionId);
        if (draggedIndex === -1) return;

        orderedQuestionIds.splice(draggedIndex, 1);
        if (nextId) {
            const nextIndex = orderedQuestionIds.indexOf(nextId);
            if (nextIndex !== -1) {
                orderedQuestionIds.splice(nextIndex, 0, draggedQuestionId);
            }
        } else if (previousId) {
            const previousIndex = orderedQuestionIds.indexOf(previousId);
            if (previousIndex !== -1) {
                orderedQuestionIds.splice(previousIndex + 1, 0, draggedQuestionId);
            }
        } else {
            orderedQuestionIds.push(draggedQuestionId);
        }

        await reorderStudioQuizQuestionIds(orderedQuestionIds);
        await loadStudioQuestionListForQuiz(state.auth.editingQuizId);
        renderStudioQuestionList();
        setCreatorStatus('Question order updated.', 'success');
    }

    function moveStudioQuestionDragPlaceholder(clientY) {
        if (!studioQuestionPointerDrag?.placeholder || !elements.studioQuestionList) return;
        const placeholder = studioQuestionPointerDrag.placeholder;
        const rows = Array.from(elements.studioQuestionList.querySelectorAll('.studio-question-list-row'))
            .filter(row => row !== studioQuestionPointerDrag.row && row !== placeholder && !row.classList.contains('studio-question-drag-source'));

        let inserted = false;
        for (const row of rows) {
            const rect = row.getBoundingClientRect();
            const rowMidpoint = rect.top + (rect.height / 2);
            if (clientY < rowMidpoint) {
                if (placeholder.nextSibling !== row) {
                    elements.studioQuestionList.insertBefore(placeholder, row);
                }
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            const tailAction = elements.studioQuestionList.querySelector('.studio-question-tail-action');
            if (tailAction) {
                elements.studioQuestionList.insertBefore(placeholder, tailAction);
            } else {
                elements.studioQuestionList.appendChild(placeholder);
            }
        }
    }

    function updateStudioQuestionDragGhost(clientX, clientY) {
        if (!studioQuestionPointerDrag?.ghost) return;
        studioQuestionPointerDrag.ghost.style.left = `${clientX - studioQuestionPointerDrag.offsetX}px`;
        studioQuestionPointerDrag.ghost.style.top = `${clientY - studioQuestionPointerDrag.offsetY}px`;
    }

    function stopStudioQuestionAutoScroll() {
        if (!studioQuestionPointerDrag) return;
        studioQuestionPointerDrag.autoScrollDelta = 0;
        if (studioQuestionPointerDrag.autoScrollFrame) {
            cancelAnimationFrame(studioQuestionPointerDrag.autoScrollFrame);
            studioQuestionPointerDrag.autoScrollFrame = 0;
        }
    }

    function getStudioQuestionAutoScrollTarget() {
        const studioPage = elements.quizStudioPage;
        if (studioPage && !studioPage.classList.contains('hidden') && studioPage.scrollHeight > studioPage.clientHeight + 1) {
            return studioPage;
        }
        const scrollingElement = document.scrollingElement || document.documentElement;
        if (scrollingElement && scrollingElement.scrollHeight > scrollingElement.clientHeight + 1) {
            return scrollingElement;
        }
        return null;
    }

    function getStudioQuestionAutoScrollBounds(target) {
        if (!target || target === document.scrollingElement || target === document.documentElement || target === document.body) {
            return { top: 0, bottom: window.innerHeight };
        }
        const rect = target.getBoundingClientRect();
        return {
            top: Math.max(0, rect.top),
            bottom: Math.min(window.innerHeight, rect.bottom)
        };
    }

    function scrollStudioQuestionAutoScrollTarget(target, delta) {
        if (!target) return false;
        const before = target === document.scrollingElement || target === document.documentElement || target === document.body
            ? window.scrollY
            : target.scrollTop;

        if (target === document.scrollingElement || target === document.documentElement || target === document.body) {
            window.scrollBy(0, delta);
            return window.scrollY !== before;
        }

        target.scrollTop += delta;
        return target.scrollTop !== before;
    }

    function runStudioQuestionAutoScroll() {
        if (!studioQuestionPointerDrag || !studioQuestionPointerDrag.dragging || !studioQuestionPointerDrag.autoScrollDelta) {
            stopStudioQuestionAutoScroll();
            return;
        }

        const target = studioQuestionPointerDrag.autoScrollTarget || getStudioQuestionAutoScrollTarget();
        studioQuestionPointerDrag.autoScrollTarget = target;
        const didScroll = scrollStudioQuestionAutoScrollTarget(target, studioQuestionPointerDrag.autoScrollDelta);
        if (!didScroll) {
            stopStudioQuestionAutoScroll();
            return;
        }

        updateStudioQuestionDragGhost(studioQuestionPointerDrag.lastClientX, studioQuestionPointerDrag.lastClientY);
        moveStudioQuestionDragPlaceholder(studioQuestionPointerDrag.lastClientY);
        studioQuestionPointerDrag.autoScrollFrame = requestAnimationFrame(runStudioQuestionAutoScroll);
    }

    function updateStudioQuestionAutoScroll(clientY) {
        if (!studioQuestionPointerDrag?.dragging) return;
        const target = getStudioQuestionAutoScrollTarget();
        if (!target) {
            stopStudioQuestionAutoScroll();
            return;
        }

        const bounds = getStudioQuestionAutoScrollBounds(target);
        const edgeSize = Math.min(120, Math.max(64, (bounds.bottom - bounds.top) * 0.22));
        const maxScroll = 32;
        let delta = 0;
        if (clientY < bounds.top + edgeSize) {
            delta = -Math.ceil(maxScroll * (1 - ((clientY - bounds.top) / edgeSize)));
        } else if (clientY > bounds.bottom - edgeSize) {
            delta = Math.ceil(maxScroll * (1 - ((bounds.bottom - clientY) / edgeSize)));
        }

        studioQuestionPointerDrag.autoScrollTarget = target;
        studioQuestionPointerDrag.autoScrollDelta = delta;
        if (delta && !studioQuestionPointerDrag.autoScrollFrame) {
            studioQuestionPointerDrag.autoScrollFrame = requestAnimationFrame(runStudioQuestionAutoScroll);
        } else if (!delta) {
            stopStudioQuestionAutoScroll();
        }
    }

    function beginStudioQuestionPointerDrag() {
        if (!studioQuestionPointerDrag || studioQuestionPointerDrag.dragging) return;
        const { row, item, startRect, startX, startY } = studioQuestionPointerDrag;
        if (!row || !item || !elements.studioQuestionList) return;

        studioQuestionPointerDrag.dragging = true;
        state.auth.studioDraggingQuestionId = studioQuestionPointerDrag.questionId;
        document.body.classList.add('studio-question-dragging');

        const placeholder = document.createElement('div');
        placeholder.className = 'studio-question-list-drag-placeholder';
        placeholder.style.height = `${row.offsetHeight}px`;
        placeholder.innerHTML = '<span>Drop question here</span>';
        row.parentNode.insertBefore(placeholder, row);
        row.classList.add('studio-question-drag-source');

        const ghost = item.cloneNode(true);
        ghost.classList.remove('active', 'drag-over', 'dragging');
        ghost.classList.add('studio-question-list-drag-ghost');
        ghost.style.width = `${startRect.width}px`;
        document.body.appendChild(ghost);

        studioQuestionPointerDrag.placeholder = placeholder;
        studioQuestionPointerDrag.ghost = ghost;
        updateStudioQuestionDragGhost(startX, startY);
    }

    function cleanupStudioQuestionPointerDrag({ rerender = false } = {}) {
        if (!studioQuestionPointerDrag) return;
        stopStudioQuestionAutoScroll();
        window.removeEventListener('pointermove', handleStudioQuestionPointerMove);
        window.removeEventListener('pointerup', handleStudioQuestionPointerUp);
        window.removeEventListener('pointercancel', handleStudioQuestionPointerUp);
        document.body.classList.remove('studio-question-dragging');
        state.auth.studioDraggingQuestionId = null;
        clearStudioQuestionDropTargets();

        if (studioQuestionPointerDrag.ghost?.parentNode) {
            studioQuestionPointerDrag.ghost.parentNode.removeChild(studioQuestionPointerDrag.ghost);
        }
        if (studioQuestionPointerDrag.placeholder?.parentNode) {
            studioQuestionPointerDrag.placeholder.parentNode.removeChild(studioQuestionPointerDrag.placeholder);
        }
        studioQuestionPointerDrag.row?.classList.remove('studio-question-drag-source');
        try {
            studioQuestionPointerDrag.handle?.releasePointerCapture?.(studioQuestionPointerDrag.pointerId);
        } catch (err) {
            // Pointer capture may already be released by the browser.
        }
        studioQuestionPointerDrag = null;
        if (rerender) renderStudioQuestionList();
    }

    function handleStudioQuestionPointerMove(e) {
        if (!studioQuestionPointerDrag || e.pointerId !== studioQuestionPointerDrag.pointerId) return;
        studioQuestionPointerDrag.lastClientX = e.clientX;
        studioQuestionPointerDrag.lastClientY = e.clientY;
        const distanceX = Math.abs(e.clientX - studioQuestionPointerDrag.startX);
        const distanceY = Math.abs(e.clientY - studioQuestionPointerDrag.startY);
        const movedEnough = distanceX > 4 || distanceY > 4;
        if (!studioQuestionPointerDrag.dragging && !movedEnough) return;

        e.preventDefault();
        if (!studioQuestionPointerDrag.dragging) {
            beginStudioQuestionPointerDrag();
        }
        updateStudioQuestionDragGhost(e.clientX, e.clientY);
        moveStudioQuestionDragPlaceholder(e.clientY);
        updateStudioQuestionAutoScroll(e.clientY);
    }

    function handleStudioQuestionPointerUp(e) {
        if (!studioQuestionPointerDrag || e.pointerId !== studioQuestionPointerDrag.pointerId) return;
        e.preventDefault();
        const finishedDrag = studioQuestionPointerDrag.dragging;
        const draggedQuestionId = studioQuestionPointerDrag.questionId;
        const placeholder = studioQuestionPointerDrag.placeholder;
        const { previousId, nextId } = finishedDrag
            ? getStudioQuestionDropNeighborIds(placeholder, draggedQuestionId)
            : { previousId: '', nextId: '' };
        const draggedRow = studioQuestionPointerDrag.row;
        if (finishedDrag && placeholder?.parentNode && draggedRow) {
            placeholder.parentNode.insertBefore(draggedRow, placeholder);
        }

        cleanupStudioQuestionPointerDrag({ rerender: !finishedDrag });
        if (!finishedDrag) return;

        reorderStudioQuestionFromDragDrop(draggedQuestionId, previousId, nextId).catch(err => {
            console.error(err);
            setCreatorStatus('Could not reorder the question.', 'error');
            renderStudioQuestionList();
        });
    }

    elements.studioQuestionList.addEventListener('pointerdown', e => {
        const handle = e.target.closest('[data-studio-drag-question-id]');
        if (!handle || handle.disabled || e.button !== 0) return;
        const questionId = normalizeSheetText(handle.dataset.studioDragQuestionId || '');
        const row = handle.closest('.studio-question-list-row');
        const item = handle.closest('.studio-question-list-item');
        if (!questionId || !row || !item) return;

        e.preventDefault();
        const startRect = item.getBoundingClientRect();
        studioQuestionPointerDrag = {
            pointerId: e.pointerId,
            questionId,
            row,
            item,
            handle,
            startX: e.clientX,
            startY: e.clientY,
            lastClientX: e.clientX,
            lastClientY: e.clientY,
            offsetX: e.clientX - startRect.left,
            offsetY: e.clientY - startRect.top,
            startRect,
            dragging: false,
            placeholder: null,
            ghost: null,
            autoScrollDelta: 0,
            autoScrollFrame: 0
        };
        handle.setPointerCapture?.(e.pointerId);
        window.addEventListener('pointermove', handleStudioQuestionPointerMove, { passive: false });
        window.addEventListener('pointerup', handleStudioQuestionPointerUp);
        window.addEventListener('pointercancel', handleStudioQuestionPointerUp);
    });
}


if (elements.addDiagramLabelBtn) {
    elements.addDiagramLabelBtn.addEventListener('click', addStudioDiagramLabel);
}

if (elements.removeDiagramLabelBtn) {
    elements.removeDiagramLabelBtn.addEventListener('click', removeLastStudioDiagramLabel);
}

if (elements.diagramLabelList) {
    elements.diagramLabelList.addEventListener('input', e => {
        const row = e.target.closest('[data-diagram-label-row]');
        if (!row) return;
        if (e.target.matches('[data-diagram-label-x], [data-diagram-label-y]')) {
            const index = Number(row.dataset.diagramLabelIndex || 0);
            const xInput = row.querySelector('[data-diagram-label-x]');
            const yInput = row.querySelector('[data-diagram-label-y]');
            const safePosition = clampDiagramLabelPosition(Number(xInput?.value || 0), Number(yInput?.value || 0), index);
            if (xInput) xInput.value = safePosition.x.toFixed(1);
            if (yInput) yInput.value = safePosition.y.toFixed(1);
        }
        syncStudioDiagramMarkersFromRows();
        setStudioDirtyState(true);
    });

    elements.diagramLabelList.addEventListener('click', e => {
        const deleteButton = e.target.closest('[data-diagram-label-delete]');
        if (!deleteButton) return;
        const row = deleteButton.closest('[data-diagram-label-row]');
        row?.remove();
        const labels = getStudioDiagramLabelsFromDOM();
        renderStudioDiagramLabels(labels);
        setStudioDirtyState(true);
    });
}

if (elements.studioDiagramLabelLayer) {
    elements.studioDiagramLabelLayer.addEventListener('pointerdown', e => {
        const marker = e.target.closest('[data-diagram-label-index]');
        if (!marker || !elements.studioDiagramPreview) return;
        e.preventDefault();
        state.auth.studioDiagramDraggingIndex = Number(marker.dataset.diagramLabelIndex || 0);
        marker.setPointerCapture?.(e.pointerId);
        marker.classList.add('is-dragging');
    });

    elements.studioDiagramLabelLayer.addEventListener('pointermove', e => {
        if (state.auth.studioDiagramDraggingIndex === null) return;
        const rect = (elements.studioDiagramPreviewWrap || elements.studioDiagramPreview)?.getBoundingClientRect();
        if (!rect?.width || !rect?.height) return;
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        updateStudioDiagramLabelPosition(state.auth.studioDiagramDraggingIndex, x, y);
    });

    const stopDiagramDrag = e => {
        if (state.auth.studioDiagramDraggingIndex === null) return;
        const marker = e.target.closest?.('[data-diagram-label-index]');
        marker?.classList.remove('is-dragging');
        state.auth.studioDiagramDraggingIndex = null;
    };
    elements.studioDiagramLabelLayer.addEventListener('pointerup', stopDiagramDrag);
    elements.studioDiagramLabelLayer.addEventListener('pointercancel', stopDiagramDrag);
}

function handleDiagramSharingControlChange(event) {
    const nextSharing = getStudioDiagramSharingDraft();
    if (!nextSharing.useSharedImage) {
        nextSharing.useSharedLabels = false;
        nextSharing.questionOverride = false;
    }
    if (event?.target === elements.reuseSharedDiagramLabels && nextSharing.useSharedLabels && !nextSharing.questionOverride) {
        const existingLabels = normalizeDiagramLabels(state.auth.studioDiagramSharing?.sharedLabels || []);
        if (existingLabels.length && !getStudioDiagramLabelsFromDOM().length) {
            renderStudioDiagramLabels(existingLabels);
        }
    }
    if (nextSharing.useSharedImage && !nextSharing.questionOverride) {
        const sharedImageUrl = normalizeSheetText(state.auth.studioDiagramSharing?.sharedImageUrl);
        if (sharedImageUrl && !normalizeSheetText(state.auth.studioQuestionImageDataUrl)) {
            setStudioQuestionImageState(sharedImageUrl, getSharedDiagramImageStatusLabel(state.auth.studioDiagramSharing));
        }
        if (nextSharing.useSharedLabels) {
            const sharedLabels = normalizeDiagramLabels(state.auth.studioDiagramSharing?.sharedLabels || []);
            if (sharedLabels.length) renderStudioDiagramLabels(sharedLabels);
        }
    }
    setStudioDiagramSharingState(nextSharing);
    setStudioDirtyState(true);
}

[elements.useSharedDiagramImage, elements.reuseSharedDiagramLabels, elements.overrideSharedDiagramQuestion].forEach(control => {
    if (!control) return;
    control.addEventListener('change', handleDiagramSharingControlChange);
});

if (elements.goToSharedDiagramSourceBtn) {
    elements.goToSharedDiagramSourceBtn.addEventListener('click', () => {
        const sourceQuestionId = getDiagramSharingSourceQuestionId(state.auth.studioDiagramSharing);
        if (!sourceQuestionId) return;
        loadStudioQuestionIntoEditor(sourceQuestionId).catch(err => {
            console.error(err);
            setCreatorStatus('Could not load the shared diagram source question.', 'error');
        });
    });
}

if (elements.createQuestionImageToggleBtn) {
    elements.createQuestionImageToggleBtn.addEventListener('click', () => {
        setStudioQuestionImagePanelOpen();
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


function insertPlainTextIntoRichEditor(editorEl, stateBag, text) {
    if (!isRichEditorEditable(editorEl)) return;
    editorEl.focus();
    restoreRichEditorSelection(editorEl, stateBag);
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!(editorEl.contains(range.commonAncestorContainer) || editorEl === range.commonAncestorContainer)) return;
    range.deleteContents();
    const node = document.createTextNode(text || '');
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    saveRichEditorSelection(editorEl, stateBag);
    dispatchRichEditorInput(editorEl);
}

function bindPlainPasteForRichEditor(editorEl, stateBag) {
    if (!editorEl) return;
    editorEl.addEventListener('paste', event => {
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') || '';
        insertPlainTextIntoRichEditor(editorEl, stateBag, text);
    });
}

if (elements.createLearningResources) {
    ['keyup', 'mouseup', 'focus', 'input'].forEach(eventName => {
        elements.createLearningResources.addEventListener(eventName, () => saveLearningResourcesSelection());
    });
    bindPlainPasteForRichEditor(elements.createLearningResources, learningResourcesRichState);
}

[elements.createFlashcardTerm, elements.createFlashcardDefinition].forEach(editorEl => {
    if (!editorEl) return;
    ['keyup', 'mouseup', 'focus', 'input'].forEach(eventName => {
        editorEl.addEventListener(eventName, () => saveFlashcardRichSelection(editorEl));
    });
    bindPlainPasteForRichEditor(editorEl, flashcardRichState);
});

function closeLearningResourcesRichMenus(exceptMenu = '') {
    elements.createLearningResourcesRichMenus.forEach(menu => {
        const menuName = normalizeSheetText(menu.dataset.richMenu);
        if (menuName !== exceptMenu) menu.classList.add('hidden');
    });
}

function closeFlashcardRichMenus(exceptMenu = '') {
    elements.flashcardRichMenus.forEach(menu => {
        const menuName = normalizeSheetText(menu.dataset.flashcardRichMenu);
        if (menuName !== exceptMenu) menu.classList.add('hidden');
    });
}

function toggleRichMenu(menuName, menus, closeFn, datasetName) {
    const normalizedName = normalizeSheetText(menuName);
    const menu = menus.find(item => normalizeSheetText(item.dataset[datasetName]) === normalizedName);
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    closeFn(normalizedName);
    menu.classList.toggle('hidden', !willOpen);
}

function toggleLearningResourcesRichMenu(menuName) {
    toggleRichMenu(menuName, elements.createLearningResourcesRichMenus, closeLearningResourcesRichMenus, 'richMenu');
}

function toggleFlashcardRichMenu(menuName) {
    toggleRichMenu(menuName, elements.flashcardRichMenus, closeFlashcardRichMenus, 'flashcardRichMenu');
}

function updateRichToolbarChoice(styleName, value, fontFamilyBtn, fontSizeBtn) {
    const normalizedStyle = normalizeSheetText(styleName);
    const normalizedValue = normalizeSheetText(value);
    if (normalizedStyle === 'fontFamily' && fontFamilyBtn) {
        fontFamilyBtn.title = normalizedValue ? `Font family: ${normalizedValue}` : 'Font family';
    }
    if (normalizedStyle === 'fontSize' && fontSizeBtn) {
        const numericValue = (normalizeLearningResourcesFontSize(normalizedValue) || RICH_TEXT_DEFAULT_FONT_SIZE).replace(/px$/i, '');
        fontSizeBtn.textContent = numericValue || String(parseInt(RICH_TEXT_DEFAULT_FONT_SIZE, 10) || 18);
        fontSizeBtn.title = `Font size: ${numericValue || String(parseInt(RICH_TEXT_DEFAULT_FONT_SIZE, 10) || 18)}`;
    }
}

function updateLearningResourcesToolbarChoice(styleName, value) {
    updateRichToolbarChoice(styleName, value, elements.createLearningResourcesFontFamilyBtn, elements.createLearningResourcesFontSizeBtn);
}

function updateFlashcardToolbarChoice(styleName, value) {
    updateRichToolbarChoice(styleName, value, elements.createFlashcardFontFamilyBtn, elements.createFlashcardFontSizeBtn);
}

function applyLearningResourcesStyleChoice(styleName, value) {
    const normalizedStyle = normalizeSheetText(styleName);
    const normalizedValue = normalizeSheetText(value);
    if (normalizedStyle === 'fontFamily') {
        applyLearningResourcesInlineStyle({ fontFamily: normalizedValue });
        updateLearningResourcesToolbarChoice(normalizedStyle, normalizedValue);
    } else if (normalizedStyle === 'fontSize') {
        applyLearningResourcesInlineStyle({ fontSize: normalizedValue });
        updateLearningResourcesToolbarChoice(normalizedStyle, normalizedValue);
    }
}

function applyFlashcardStyleChoice(styleName, value) {
    const normalizedStyle = normalizeSheetText(styleName);
    const normalizedValue = normalizeSheetText(value);
    if (normalizedStyle === 'fontFamily') {
        applyFlashcardRichInlineStyle({ fontFamily: normalizedValue });
        updateFlashcardToolbarChoice(normalizedStyle, normalizedValue);
    } else if (normalizedStyle === 'fontSize') {
        applyFlashcardRichInlineStyle({ fontSize: normalizedValue });
        updateFlashcardToolbarChoice(normalizedStyle, normalizedValue);
    }
}

function prepareRichColorPicker(inputEl, saveSelectionFn, closeMenusFn) {
    if (!inputEl) return;
    ['pointerdown', 'mousedown', 'focus'].forEach(eventName => {
        inputEl.addEventListener(eventName, event => {
            event.stopPropagation();
            saveSelectionFn();
            closeMenusFn();
        });
    });
}

function handleRichColorInput(inputEl, applyColorFn, fallbackColor) {
    if (!inputEl) return;
    inputEl.addEventListener('change', () => {
        const selectedColor = inputEl.value || fallbackColor;
        applyColorFn(selectedColor);
    });
}

if (elements.createLearningResourcesRichControls.length) {
    elements.createLearningResourcesRichControls.forEach(control => {
        if (!control.classList.contains('studio-rich-hidden-color')) {
            control.addEventListener('mousedown', event => {
                event.preventDefault();
                saveLearningResourcesSelection();
            });
        }
        if (control.matches('[data-rich-command]')) {
            control.addEventListener('click', () => {
                closeLearningResourcesRichMenus();
                applyLearningResourcesFormat(control.dataset.richCommand);
            });
        }
    });
}

if (elements.flashcardRichControls.length) {
    elements.flashcardRichControls.forEach(control => {
        if (!control.classList.contains('studio-rich-hidden-color')) {
            control.addEventListener('mousedown', event => {
                event.preventDefault();
                saveFlashcardRichSelection();
            });
        }
        if (control.matches('[data-flashcard-rich-command]')) {
            control.addEventListener('click', () => {
                closeFlashcardRichMenus();
                applyFlashcardRichFormat(control.dataset.flashcardRichCommand);
            });
        }
    });
}

elements.createLearningResourcesRichMenuTriggers.forEach(trigger => {
    trigger.addEventListener('click', event => {
        event.stopPropagation();
        saveLearningResourcesSelection();
        toggleLearningResourcesRichMenu(trigger.dataset.richMenuTrigger);
    });
});

elements.flashcardRichMenuTriggers.forEach(trigger => {
    trigger.addEventListener('click', event => {
        event.stopPropagation();
        saveFlashcardRichSelection();
        toggleFlashcardRichMenu(trigger.dataset.flashcardRichMenuTrigger);
    });
});

elements.createLearningResourcesRichStyleButtons.forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', event => {
        event.stopPropagation();
        applyLearningResourcesStyleChoice(button.dataset.richStyle, button.dataset.richValue);
        closeLearningResourcesRichMenus();
    });
});

elements.flashcardRichStyleButtons.forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', event => {
        event.stopPropagation();
        applyFlashcardStyleChoice(button.dataset.flashcardRichStyle, button.dataset.flashcardRichValue);
        closeFlashcardRichMenus();
    });
});

const richAlignmentIconMap = {
    justifyLeft: '☰',
    justifyCenter: '☷',
    justifyRight: '☱'
};

elements.createLearningResourcesRichCommandChoices.forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', event => {
        event.stopPropagation();
        const command = normalizeSheetText(button.dataset.richCommandChoice) || 'justifyLeft';
        applyLearningResourcesFormat(command);
        if (elements.createLearningResourcesJustifyBtn) {
            elements.createLearningResourcesJustifyBtn.textContent = richAlignmentIconMap[command] || '☰';
            elements.createLearningResourcesJustifyBtn.title = `Text alignment: ${button.textContent.trim()}`;
        }
        closeLearningResourcesRichMenus();
    });
});

elements.flashcardRichCommandChoices.forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', event => {
        event.stopPropagation();
        const command = normalizeSheetText(button.dataset.flashcardRichCommandChoice) || 'justifyLeft';
        applyFlashcardRichFormat(command);
        if (elements.createFlashcardJustifyBtn) {
            elements.createFlashcardJustifyBtn.textContent = richAlignmentIconMap[command] || '☰';
            elements.createFlashcardJustifyBtn.title = `Text alignment: ${button.textContent.trim()}`;
        }
        closeFlashcardRichMenus();
    });
});

prepareRichColorPicker(elements.createLearningResourcesColor, saveLearningResourcesSelection, closeLearningResourcesRichMenus);
handleRichColorInput(elements.createLearningResourcesColor, color => applyLearningResourcesInlineStyle({ color }), '#e0e0ff');
prepareRichColorPicker(elements.createFlashcardColor, saveFlashcardRichSelection, closeFlashcardRichMenus);
handleRichColorInput(elements.createFlashcardColor, color => applyFlashcardRichInlineStyle({ color }), '#e0e0ff');

document.addEventListener('click', event => {
    if (!event.target.closest('#learningResourcesRichToolbar')) closeLearningResourcesRichMenus();
    if (!event.target.closest('#flashcardRichToolbar')) closeFlashcardRichMenus();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        closeLearningResourcesRichMenus();
        closeFlashcardRichMenus();
    }
});

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

function handleStudioEmptyStateAction(e) {
    const actionButton = e.target.closest('[data-studio-empty-action]');
    if (!actionButton) return;

    const action = actionButton.dataset.studioEmptyAction;
    if (action === 'open-auth') {
        closeQuizStudioPage(true).catch(err => console.error(err));
        openAuthPopup();
        return;
    }

    if (action === 'open-folders') {
        setQuizStudioSection('folders').catch(err => {
            console.error(err);
            setCreatorStatus('Could not open folders.', 'error');
        });
        return;
    }

    if (action === 'focus-create-folder') {
        setQuizStudioSection('folders').then(() => {
            elements.createFolderName?.focus();
        }).catch(err => {
            console.error(err);
            setCreatorStatus('Could not open folders.', 'error');
        });
        return;
    }

    if (action === 'open-editor') {
        setQuizStudioSection('editor').then(() => {
            elements.createQuizName?.focus();
        }).catch(err => {
            console.error(err);
            setCreatorStatus('Could not open the editor.', 'error');
        });
        return;
    }

    if (action === 'open-import') {
        setQuizStudioSection('import').catch(err => {
            console.error(err);
            setCreatorStatus('Could not open import tools.', 'error');
        });
        return;
    }

    if (action === 'clear-folder-search') {
        state.auth.studioFolderSearchQuery = '';
        if (elements.studioFolderSearchInput) elements.studioFolderSearchInput.value = '';
        renderFolderManagementList();
        return;
    }

    if (action === 'clear-quiz-filters') {
        state.auth.studioQuizSearchQuery = '';
        state.auth.studioQuizFolderFilterId = '';
        if (elements.studioQuizSearchInput) elements.studioQuizSearchInput.value = '';
        if (elements.studioQuizFolderFilterSelect) elements.studioQuizFolderFilterSelect.value = '';
        renderQuizManagementList();
        return;
    }

    if (action === 'open-backup') {
        setQuizStudioSection('backup').catch(err => {
            console.error(err);
            setCreatorStatus('Could not open backup tools.', 'error');
        });
    }
}

if (elements.quizStudioPage) {
    elements.quizStudioPage.addEventListener('click', handleStudioEmptyStateAction);
}

function handleStudioHomeQuizAction(e) {
    const item = e.target.closest('[data-home-quiz-id]');
    if (!item) return;

    const quizId = item.dataset.homeQuizId;
    if (e.target.matches('[data-home-action="edit-quiz"]')) {
        recordStudioQuizActivity(quizId, 'edited').catch(err => console.warn(err));
        loadQuizIntoEditor(quizId).catch(err => {
            console.error(err);
            setCreatorStatus('Could not load the quiz editor.', 'error');
        });
    }

    if (e.target.matches('[data-home-action="study-quiz"]')) {
        recordStudioQuizActivity(quizId, 'studied').catch(err => console.warn(err));
        studySupabaseQuizFromStudio(quizId).catch(err => {
            console.error(err);
            setCreatorStatus(getStudyLoadErrorMessage(err), 'error');
        });
    }
}

function handleStudioHomeFolderAction(e) {
    const item = e.target.closest('[data-home-folder-id]');
    if (!item) return;

    if (e.target.matches('[data-home-action="open-folder"]')) {
        const folderId = item.dataset.homeFolderId || '';
        openManageQuizzesForFolder(folderId).catch(err => {
            console.error(err);
            setCreatorStatus('Could not open that folder.', 'error');
        });
    }
}

if (elements.studioRecentQuizList) {
    elements.studioRecentQuizList.addEventListener('click', handleStudioHomeQuizAction);
}

if (elements.studioRecentFolderList) {
    elements.studioRecentFolderList.addEventListener('click', handleStudioHomeFolderAction);
}

if (elements.studioFolderList) {
    elements.studioFolderList.addEventListener('click', e => {
        const item = e.target.closest('[data-folder-id]');
        if (!item) return;

        const folderId = item.dataset.folderId;
        if (e.target.matches('[data-action="view-folder-quizzes"]')) {
            openManageQuizzesForFolder(folderId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not open that folder.', 'error');
            });
            return;
        }

        if (!e.target.closest('.studio-list-controls')) {
            openManageQuizzesForFolder(folderId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not open that folder.', 'error');
            });
            return;
        }

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

        const actionButton = e.target.closest('[data-action]');
        if (!actionButton || !item.contains(actionButton)) return;

        const quizId = item.dataset.quizId;
        const action = actionButton.dataset.action || '';
        if (action === 'toggle-challenges') {
            if (state.auth.expandedQuizChallengeIds.has(quizId)) {
                state.auth.expandedQuizChallengeIds.delete(quizId);
            } else {
                state.auth.expandedQuizChallengeIds.add(quizId);
            }
            state.auth.openQuizActionMenuId = '';
            renderQuizManagementList();
            return;
        }

        if (action === 'toggle-quiz-actions') {
            state.auth.openQuizActionMenuId = state.auth.openQuizActionMenuId === quizId ? '' : quizId;
            renderQuizManagementList();
            return;
        }

        if (action === 'reset-starred') {
            state.auth.openQuizActionMenuId = '';
            renderQuizManagementList();
            resetStarredQuestionsForQuiz(quizId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not reset starred questions.', 'error');
            });
            return;
        }

        if (action === 'delete-starred') {
            state.auth.openQuizActionMenuId = '';
            renderQuizManagementList();
            deleteStarredQuestionsForQuiz(quizId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not delete starred questions.', 'error');
            });
            return;
        }

        if (action === 'save-quiz') {
            const nameInput = item.querySelector('[data-quiz-rename-input]');
            const folderSelect = item.querySelector('[data-quiz-folder-select]');
            state.auth.openQuizActionMenuId = '';
            handleSaveQuizMeta(quizId, nameInput?.value || '', folderSelect?.value || '').catch(err => {
                console.error(err);
                setCreatorStatus('Could not update the quiz.', 'error');
            });
        }

        if (action === 'edit-quiz') {
            state.auth.openQuizActionMenuId = '';
            recordStudioQuizActivity(quizId, 'edited').catch(err => console.warn(err));
            loadQuizIntoEditor(quizId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not load the quiz editor.', 'error');
            });
        }

        if (action === 'duplicate-quiz') {
            state.auth.openQuizActionMenuId = '';
            renderQuizManagementList();
            handleDuplicateQuiz(quizId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not duplicate the quiz.', 'error');
            });
        }

        if (action === 'delete-quiz') {
            state.auth.openQuizActionMenuId = '';
            renderQuizManagementList();
            handleDeleteQuiz(quizId).catch(err => {
                console.error(err);
                setCreatorStatus('Could not delete the quiz.', 'error');
            });
        }

        if (action === 'load-quiz') {
            state.auth.openQuizActionMenuId = '';
            recordStudioQuizActivity(quizId, 'studied').catch(err => console.warn(err));
            studySupabaseQuizFromStudio(quizId).catch(err => {
                console.error(err);
                setCreatorStatus(getStudyLoadErrorMessage(err), 'error');
            });
        }

        if (action === 'begin-challenge') {
            const challengeKey = actionButton.dataset.challengeKey || '';
            state.auth.openQuizActionMenuId = '';
            recordStudioQuizActivity(quizId, 'challenge_started').catch(err => console.warn(err));
            beginQuizChallenge(quizId, challengeKey).catch(err => {
                console.error(err);
                setCreatorStatus(err?.studyLoadDiagnostic ? getStudyLoadErrorMessage(err) : 'Could not start that challenge.', 'error');
            });
        }
    });
}


if (elements.studioFolderSearchInput) {
    elements.studioFolderSearchInput.addEventListener('input', () => {
        state.auth.studioFolderSearchQuery = normalizeSheetText(elements.studioFolderSearchInput.value);
        renderFolderManagementList();
    });
}

if (elements.studioQuizSearchInput) {
    elements.studioQuizSearchInput.addEventListener('input', () => {
        state.auth.studioQuizSearchQuery = normalizeSheetText(elements.studioQuizSearchInput.value);
        renderQuizManagementList();
    });
}

if (elements.studioQuizFolderFilterSelect) {
    elements.studioQuizFolderFilterSelect.addEventListener('change', () => {
        state.auth.studioQuizFolderFilterId = normalizeSheetText(elements.studioQuizFolderFilterSelect.value);
        renderQuizManagementList();
    });
}

if (elements.studioQuizClearFiltersBtn) {
    elements.studioQuizClearFiltersBtn.addEventListener('click', () => {
        state.auth.studioQuizSearchQuery = '';
        state.auth.studioQuizFolderFilterId = '';
        if (elements.studioQuizSearchInput) elements.studioQuizSearchInput.value = '';
        if (elements.studioQuizFolderFilterSelect) elements.studioQuizFolderFilterSelect.value = '';
        renderQuizManagementList();
    });
}

if (elements.exportQuizSelect) {
    elements.exportQuizSelect.addEventListener('change', populateExportBackupControls);
}

if (elements.exportFolderSelect) {
    elements.exportFolderSelect.addEventListener('change', populateExportBackupControls);
}

if (elements.exportQuizBtn) {
    elements.exportQuizBtn.addEventListener('click', () => {
        exportQuizBackup().catch(err => {
            console.error(err);
            setCreatorStatus(err.message || 'Could not export that quiz.', 'error');
        });
    });
}

if (elements.exportFolderBtn) {
    elements.exportFolderBtn.addEventListener('click', () => {
        exportFolderBackup().catch(err => {
            console.error(err);
            setCreatorStatus(err.message || 'Could not export that folder.', 'error');
        });
    });
}

if (elements.exportAllBtn) {
    elements.exportAllBtn.addEventListener('click', () => {
        exportAllBackup().catch(err => {
            console.error(err);
            setCreatorStatus(err.message || 'Could not export the full library backup.', 'error');
        });
    });
}

if (elements.importBackupFile) {
    elements.importBackupFile.addEventListener('change', () => {
        resetBackupImportState(elements.importBackupFile.files?.length ? 'Backup file selected. Click Preview Backup before importing.' : 'Choose a backup file to preview before importing.');
    });
}

if (elements.previewBackupImportBtn) {
    elements.previewBackupImportBtn.addEventListener('click', () => {
        readAndPreviewBackupImportFile().catch(err => {
            console.error(err);
            state.auth.backupImportPayload = null;
            if (elements.importBackupPreview) {
                elements.importBackupPreview.textContent = err.message || 'Could not preview that backup file.';
                elements.importBackupPreview.classList.add('is-error');
                elements.importBackupPreview.classList.remove('is-success');
            }
            populateExportBackupControls();
            setCreatorStatus(err.message || 'Could not preview that backup file.', 'error');
        });
    });
}

if (elements.importBackupBtn) {
    elements.importBackupBtn.addEventListener('click', () => {
        importBackupAsNewCopy().catch(err => {
            console.error(err);
            setCreatorStatus(err.message || 'Could not import that backup.', 'error');
        });
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

if (elements.importTemplateSheetBtn) {
    elements.importTemplateSheetBtn.addEventListener('click', () => {
        handleImportGoogleSheetTemplate().catch(err => {
            console.error(err);
            setCreatorStatus('Could not import that Google Sheet template.', 'error');
        });
    });
}

[
    elements.importSourceDestinationModeSelect,
    elements.importSourceAppendQuizSelect,
    elements.importTemplateSheetInput,
    elements.importTemplateTabInput,
    elements.importTemplateDestinationModeSelect,
    elements.importTemplateAppendQuizSelect,
    elements.importTemplateTargetFolderSelect
].forEach(el => {
    if (!el) return;
    const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
        renderGoogleSheetsImportControls();
    });
});

if (elements.studioTemplateDownloadButtons.length) {
    elements.studioTemplateDownloadButtons.forEach(button => {
        button.addEventListener('click', () => {
            downloadStudyBunnyTemplate(button.dataset.templateDownload, button.dataset.templateVariant);
        });
    });
}


const studioDirtyInputSelector = [
    '#createQuizName',
    '#createQuizFolderSelect',
    '#createQuestionPrompt',
    '#createCorrectOptionSelect',
    '#createCorrectExplanation',
    '#createLearningResources',
    '#createFlashcardTerm',
    '#createFlashcardDefinition',
    '#studioQuestionSearchInput',
    '#studioQuestionJumpInput'
].join(', ');

function handleStudioDirtyInput(event) {
    if (!state.auth.quizStudioOpen) return;
    const target = event.target;
    if (target && target.matches('#studioQuestionSearchInput, #studioQuestionJumpInput')) {
        return;
    }
    setStudioDirtyState(true);
    updateCreateQuizModeUI();
}

document.addEventListener('focusin', event => {
    if (isMathChemInsertTarget(event.target)) {
        lastMathChemInsertTarget = event.target;
    }
});

// Math/Chem toolbar mini-fields are helper controls, not quiz content fields.
document.addEventListener('input', event => {
    if (event.target.closest('#studioMathChemTools')) return;
    if (event.target.matches(studioDirtyInputSelector) || event.target.closest('.studio-option-pair') || event.target.closest('.studio-classify-row') || event.target.closest('.studio-diagram-label-row')) {
        handleStudioDirtyInput(event);
    }
});

document.addEventListener('change', event => {
    if (event.target.matches('#createQuizFolderSelect, #createQuizTypeSelect, #createQuestionImageFile, #createLearningResourcesImageFile, #createFlashcardTermImageFile, #createFlashcardDefinitionImageFile') || event.target.closest('.studio-option-pair') || event.target.closest('.studio-classify-row') || event.target.closest('.studio-diagram-label-row') || event.target.closest('.studio-diagram-label-row')) {
        handleStudioDirtyInput(event);
    }
});

if (elements.createFlashcardTerm) {
    elements.createFlashcardTerm.addEventListener('input', () => {
        if (state.auth.editingQuizType !== 'flashcard') return;
        const pendingRow = getStudioPendingFlashcardRow();
        if (!state.auth.editingQuestionId && pendingRow) {
            pendingRow.term_plain = elements.createFlashcardTerm.value;
            pendingRow.prompt_plain = elements.createFlashcardTerm.value;
            pendingRow.term_html = getFlashcardTermEditorHtml();
            const pendingField = elements.studioQuestionList?.querySelector('[data-studio-pending-flashcard-term]');
            if (pendingField && pendingField !== document.activeElement) {
                pendingField.value = elements.createFlashcardTerm.value;
                autosizeStudioFlashcardInlineTextarea(pendingField);
            }
            return;
        }
        if (!state.auth.editingQuestionId) return;
        const row = state.auth.studioQuizQuestions.find(question => question.id === state.auth.editingQuestionId);
        if (!row) return;
        row.term_plain = elements.createFlashcardTerm.value;
        row.prompt_plain = elements.createFlashcardTerm.value;
        row.term_html = getFlashcardTermEditorHtml();
        const listField = elements.studioQuestionList?.querySelector(`[data-studio-flashcard-term-id="${state.auth.editingQuestionId}"]`);
        if (listField && listField !== document.activeElement) {
            listField.value = elements.createFlashcardTerm.value;
            autosizeStudioFlashcardInlineTextarea(listField);
        }
    });
}

if (elements.createFlashcardDefinition) {
    elements.createFlashcardDefinition.addEventListener('input', () => {
        if (state.auth.editingQuizType !== 'flashcard') return;
        const pendingRow = getStudioPendingFlashcardRow();
        if (!state.auth.editingQuestionId && pendingRow) {
            pendingRow.definition_plain = elements.createFlashcardDefinition.value;
            pendingRow.definition_html = getFlashcardDefinitionEditorHtml();
            const pendingField = elements.studioQuestionList?.querySelector('[data-studio-pending-flashcard-definition]');
            if (pendingField && pendingField !== document.activeElement) {
                pendingField.value = elements.createFlashcardDefinition.value;
                autosizeStudioFlashcardInlineTextarea(pendingField);
            }
            return;
        }
        if (!state.auth.editingQuestionId) return;
        const row = state.auth.studioQuizQuestions.find(question => question.id === state.auth.editingQuestionId);
        if (!row) return;
        row.definition_plain = elements.createFlashcardDefinition.value;
        row.definition_html = getFlashcardDefinitionEditorHtml();
        const listField = elements.studioQuestionList?.querySelector(`[data-studio-flashcard-definition-id="${state.auth.editingQuestionId}"]`);
        if (listField && listField !== document.activeElement) {
            listField.value = elements.createFlashcardDefinition.value;
            autosizeStudioFlashcardInlineTextarea(listField);
        }
    });
}

if (elements.studioQuestionSearchInput) {
    elements.studioQuestionSearchInput.addEventListener('input', () => {
        const nextQuery = normalizeSheetText(elements.studioQuestionSearchInput.value || '');
        if (nextQuery && isStudioQuestionFocusMode()) {
            state.auth.studioFocusedQuestionId = '';
        }
        if (nextQuery && state.auth.studioActiveBuildUpString) {
            state.auth.studioActiveBuildUpString = '';
        }
        if (nextQuery && state.auth.studioFocusedBuildUpString) {
            state.auth.studioFocusedBuildUpString = '';
        }
        state.auth.studioQuestionSearchQuery = nextQuery;
        renderStudioQuestionList();
    });
}

if (elements.studioQuestionStarredOnly) {
    elements.studioQuestionStarredOnly.addEventListener('click', () => {
        if (state.auth.studioFocusedQuestionId) {
            state.auth.studioFocusedQuestionId = '';
        }
        if (state.auth.studioActiveBuildUpString) {
            state.auth.studioActiveBuildUpString = '';
        }
        if (state.auth.studioFocusedBuildUpString) {
            state.auth.studioFocusedBuildUpString = '';
        }
        state.auth.studioQuestionStarredOnly = !state.auth.studioQuestionStarredOnly;
        renderStudioQuestionList();
        setCreatorStatus(
            state.auth.studioQuestionStarredOnly ? 'Showing starred questions only.' : 'Showing all questions in this quiz.',
            'success'
        );
    });
}

if (elements.studioQuestionJumpBtn) {
    elements.studioQuestionJumpBtn.addEventListener('click', () => {
        const rawJumpValue = normalizeSheetText(elements.studioQuestionJumpInput?.value || '');
        const targetIndex = Number(rawJumpValue);
        if (!rawJumpValue || !Number.isInteger(targetIndex) || targetIndex < 1) {
            setCreatorStatus('Enter a valid question number to jump to.', 'error');
            return;
        }
        const targetQuestion = state.auth.studioQuizQuestions[targetIndex - 1];
        if (!targetQuestion) {
            setCreatorStatus('That question number does not exist in this quiz.', 'error');
            return;
        }

        const wasFocusMode = isStudioQuestionFocusMode();
        state.auth.studioFocusedBuildUpString = '';
        state.auth.studioQuestionSearchQuery = '';
        if (elements.studioQuestionSearchInput) {
            elements.studioQuestionSearchInput.value = '';
        }
        if (wasFocusMode) {
            state.auth.studioFocusedQuestionId = targetQuestion.id;
        }

        loadStudioQuestionIntoEditor(targetQuestion.id, { suppressStatus: true }).then(() => {
            revealStudioQuestionInList(targetQuestion.id);
            const label = getStudioQuestionNavigationName(targetQuestion.question_type || getStudioCurrentQuizType(), targetIndex - 1);
            setCreatorStatus(`${wasFocusMode ? 'Focus mode jumped to' : 'Jumped to'} ${label}.`, 'success');
        }).catch(err => {
            console.error(err);
            setCreatorStatus('Could not jump to that question.', 'error');
        });
    });
}

if (elements.studioQuestionJumpInput) {
    elements.studioQuestionJumpInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            elements.studioQuestionJumpBtn?.click();
        }
    });
}

window.addEventListener('beforeunload', event => {
    if (!state.auth.studioHasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = '';
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
        return;
    }

    handleStudyKeyboardShortcut(e);
});

window.addEventListener('resize', handleViewportChange);
window.addEventListener('orientationchange', handleViewportChange);

// ================= INIT =================
(async function () {
    try {
        mountFloatingPagesToBody();
        renderStudioOptionFields(Array.from({ length: 4 }, () => ({ text: '', explanation: '', imageUrl: '', imageLabel: '' })));
        applyResponsiveControlText();
        updateViewportClasses();
        loadStudyTimerSettings();
        loadAutoStarSettings();
        loadUnstarOnWrongSettings();
        loadHideAnswerFeedbackSettings();
        loadGlobalShuffleAnswersSettings();
        updateAuthUI();
        await bootstrapSupabase();

        const list = await populateFolderDropdown();

        if (!state.auth.user?.id) {
            clearActiveQuizSelection('Sign in to load your quizzes.');
            return;
        }

        if (!list.length) {
            elements.questionTextEl.innerText = 'No Supabase quizzes found for this account yet.';
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
