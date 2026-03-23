const sheetId = '16bOgCaHG0Y450hwfl6tiHgAgTTxdxTVuMDhWLZbdD4E';

let questions = [];
let currentIndex = 0;
let completedCount = 0;
let wrongQuestions = [];

const quizSelector = document.getElementById('quizSelector');

// Load quiz list from Config sheet
async function loadQuizList() {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=Config`);
    const text = await response.text();
    const json = JSON.parse(text.match(/(?<=\().*(?=\);)/s)[0]);
    const rows = json.table.rows;

    return rows.slice(1).map(r => ({
        sheet: r.c[0]?.v || '',
        name: r.c[1]?.v || ''
    })).filter(q => q.sheet && q.name);
}

// Populate dropdown dynamically
async function populateQuizDropdown() {
    const quizSheets = await loadQuizList();
    quizSelector.innerHTML = '';

    quizSheets.forEach(sheetObj => {
        const option = document.createElement('option');
        option.value = sheetObj.sheet;
        option.innerText = sheetObj.name;
        quizSelector.appendChild(option);
    });

    return quizSheets;
}

// Load multiple choice questions
async function loadMultipleChoiceQuestions(sheetName) {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${sheetName}`);
    const text = await response.text();
    const json = JSON.parse(text.match(/(?<=\().*(?=\);)/s)[0]);
    const rows = json.table.rows;

    return rows.map(r => {
        const c = r.c || [];
        return {
            question: c[0]?.v || '',
            type: 'multiple choice',
            options: [c[2]?.v, c[3]?.v, c[4]?.v, c[5]?.v].filter(opt => opt),
            correct: c[6]?.v || '',
            explanations: [c[7]?.v, c[8]?.v, c[9]?.v, c[10]?.v],
            image: c[11]?.v || ''
        };
    }).filter(q => q.question && q.question.toLowerCase() !== 'question');
}

// Load hierarchy questions
async function loadHierarchyQuestions(sheetName) {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${sheetName}`);
    const text = await response.text();
    const json = JSON.parse(text.match(/(?<=\().*(?=\);)/s)[0]);
    const rows = json.table.rows;

    return rows.map(r => {
        const c = r.c || [];
        return {
            question: c[0]?.v || '',
            type: 'hierarchy',
            options: [
                c[2]?.v, c[3]?.v, c[4]?.v, c[5]?.v, c[6]?.v,
                c[7]?.v, c[8]?.v, c[9]?.v, c[10]?.v, c[11]?.v
            ].filter(opt => opt),
            correctOrder: [
                c[12]?.v, c[13]?.v, c[14]?.v, c[15]?.v, c[16]?.v,
                c[17]?.v, c[18]?.v, c[19]?.v, c[20]?.v, c[21]?.v
            ].map(n => n ? Number(n) : null).filter(n => n !== null),
            image: c[22]?.v || ''
        };
    }).filter(q => q.question && q.question.toLowerCase() !== 'question');
}

// Unified loader based on type column
async function loadQuestions(sheetName) {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${sheetName}`);
    const text = await response.text();
    const json = JSON.parse(text.match(/(?<=\().*(?=\);)/s)[0]);
    const rows = json.table.rows;

    const firstTypeCell = rows[0].c[1]?.v?.toString().trim().toLowerCase() || '';

    if(firstTypeCell === 'hierarchy') return loadHierarchyQuestions(sheetName);
    return loadMultipleChoiceQuestions(sheetName);
}

// Shuffle helper
function shuffleArray(array) {
    for (let i = array.length -1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Show question
function showQuestion() {
    if(currentIndex >= questions.length) {
        document.getElementById('feedback').innerText = "Quiz Finished!";
        return;
    }

    const q = questions[currentIndex];
    document.getElementById('questionText').innerText = q.question;
    const img = document.getElementById('questionImage');
    img.style.display = q.image ? 'block' : 'none';
    img.src = q.image || '';

    const mcContainer = document.querySelector('.options');
    const existingHierarchy = document.getElementById('hierarchyContainer');

    mcContainer.style.display = 'none';
    if(existingHierarchy) existingHierarchy.remove();

    if(q.type === 'multiple choice') {
        mcContainer.style.display = 'flex';
        let options = [...q.options];
        let explanations = [...q.explanations];

        if(document.getElementById('shuffleAnswers').checked && options.length > 1) {
            const combined = options.map((opt, idx) => ({opt, exp: explanations[idx]}));
            shuffleArray(combined);
            options = combined.map(c => c.opt);
            explanations = combined.map(c => c.exp);
        }

        for (let i = 0; i < 4; i++) {
            const btn = document.getElementById(`option${i+1}`);
            const expDiv = document.getElementById(`explanation${i+1}`);

            if(options[i]) {
                btn.style.display = 'block';
                btn.innerText = options[i];
                btn.style.background = "";
                expDiv.innerText = '';
                btn.onclick = () => checkAnswer(options[i], explanations);
            } else {
                btn.style.display = 'none';
                expDiv.innerText = '';
            }
        }
    } else if(q.type === 'hierarchy') {
        const container = document.createElement('div');
        container.id = 'hierarchyContainer';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';
        container.style.marginTop = '15px';

        // SHUFFLE options if checkbox is checked
        let hierarchyOptions = [...q.options];
        if(document.getElementById('shuffleAnswers').checked) shuffleArray(hierarchyOptions);

        hierarchyOptions.forEach((opt, idx) => {
            const div = document.createElement('div');
            div.className = 'hierarchy-item';
            div.draggable = true;
            div.innerText = opt;
            div.style.padding = '10px';
            div.style.background = '#332b5c';
            div.style.color = 'white';
            div.style.border = '1px solid #5a4bcf';
            div.style.borderRadius = '5px';
            div.style.cursor = 'grab';
            div.dataset.index = idx;

            const feedbackSpan = document.createElement('span');
            feedbackSpan.className = 'hierarchy-feedback';
            feedbackSpan.style.float = 'right';
            feedbackSpan.style.fontWeight = 'bold';
            feedbackSpan.style.marginLeft = '10px';
            div.appendChild(feedbackSpan);

            container.appendChild(div);
        });

        document.querySelector('.question-container').appendChild(container);

        let dragSrc = null;
        container.querySelectorAll('.hierarchy-item').forEach(item => {
            item.addEventListener('dragstart', e => {
                dragSrc = item;
                e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragover', e => e.preventDefault());
            item.addEventListener('drop', e => {
                e.preventDefault();
                if(dragSrc !== item) {
                    const children = Array.from(container.children).filter(c => c.className === 'hierarchy-item');
                    const srcIndex = children.indexOf(dragSrc);
                    const tgtIndex = children.indexOf(item);
                    if(srcIndex < tgtIndex) {
                        container.insertBefore(dragSrc, item.nextSibling);
                    } else {
                        container.insertBefore(dragSrc, item);
                    }
                }
            });
        });

        const submitBtn = document.createElement('button');
        submitBtn.innerText = 'Submit';
        submitBtn.style.marginTop = '10px';
        submitBtn.style.padding = '8px 15px';
        submitBtn.style.background = '#3a3360';
        submitBtn.style.color = 'white';
        submitBtn.style.border = 'none';
        submitBtn.style.borderRadius = '5px';
        submitBtn.style.cursor = 'pointer';
        submitBtn.addEventListener('click', () => checkHierarchyAnswer(q, container));
        container.appendChild(submitBtn);
    }

    updateProgress();
}

// Check multiple choice answer
function checkAnswer(selectedText, explanations) {
    const q = questions[currentIndex];
    const isCorrect = selectedText === q.correct;

    const feedback = document.getElementById('feedback');
    feedback.classList.remove('correct', 'incorrect');

    if (isCorrect) {
        completedCount++;
        feedback.innerText = "Correct!";
        feedback.classList.add('correct');
    } else {
        feedback.innerText = "Incorrect!";
        feedback.classList.add('incorrect');
        if(document.getElementById('retryWrong').checked) wrongQuestions.push(q);
        if(document.getElementById('penaltyMode').checked) q.penalty = true;
    }

    if(!document.getElementById('speedMode').checked) {
        for (let i = 0; i < 4; i++) {
            const expDiv = document.getElementById(`explanation${i+1}`);
            expDiv.innerText = explanations[i] || '';
        }
    }

    if(document.getElementById('speedMode').checked) setTimeout(nextQuestion, 300);
}

// Check hierarchy answer with fixed mapping
function checkHierarchyAnswer(q, container) {
    const items = Array.from(container.children).filter(c => c.className === 'hierarchy-item');

    // Map user selection to correct sheet number
    const userOrder = items.map(c => {
        const idx = q.options.indexOf(c.innerText);
        return q.correctOrder[idx];
    });

    let isCorrect = true;
    items.forEach((item, idx) => {
        const feedbackSpan = item.querySelector('.hierarchy-feedback');
        if(userOrder[idx] === idx + 1) {
            feedbackSpan.innerText = '✔';
            feedbackSpan.style.color = '#4caf50';
        } else {
            feedbackSpan.innerText = '➤';
            feedbackSpan.style.color = '#ff6b6b';
            isCorrect = false;
        }
    });

    const feedback = document.getElementById('feedback');
    feedback.classList.remove('correct', 'incorrect');

    if(isCorrect) {
        completedCount++;
        feedback.innerText = "Correct!";
        feedback.classList.add('correct');
    } else {
        feedback.innerText = "Incorrect!";
        feedback.classList.add('incorrect');
        if(document.getElementById('retryWrong').checked) wrongQuestions.push(q);
        if(document.getElementById('penaltyMode').checked) q.penalty = true;
    }

    setTimeout(nextQuestion, 1200);
}

// Navigation & progress
function nextQuestion() {
    const feedback = document.getElementById('feedback');
    feedback.innerText = "";
    feedback.classList.remove('correct', 'incorrect');

    const currentQ = questions[currentIndex];
    if(currentQ && currentQ.penalty) {
        currentIndex = Math.max(currentIndex - 3, 0);
        delete currentQ.penalty;
    } else {
        currentIndex++;
    }

    if(currentIndex >= questions.length && wrongQuestions.length > 0) {
        questions = questions.concat(wrongQuestions);
        wrongQuestions = [];
        currentIndex = 0;
    }

    showQuestion();
}

function prevQuestion() {
    if(currentIndex > 0) currentIndex--;
    showQuestion();
}

function restartQuiz() {
    currentIndex = 0;
    completedCount = 0;
    wrongQuestions = [];
    document.getElementById('feedback').innerText = "";
    document.getElementById('feedback').classList.remove('correct', 'incorrect');

    if(document.getElementById('shuffleQuestions').checked) shuffleArray(questions);

    showQuestion();
}

function updateProgress() {
    const remaining = questions.length - currentIndex + wrongQuestions.length;
    document.getElementById('progressText').innerText = `${remaining} left`;
    document.getElementById('progressFill').style.width =
        `${(completedCount / (completedCount + remaining)) * 100}%`;
}

// Event listeners
document.getElementById('nextBtn').addEventListener('click', nextQuestion);
document.getElementById('prevBtn').addEventListener('click', prevQuestion);
document.getElementById('restartBtn').addEventListener('click', restartQuiz);

quizSelector.addEventListener('change', async (e) => {
    const sheetName = e.target.value;
    if(!sheetName) return;

    questions = await loadQuestions(sheetName);
    if(document.getElementById('shuffleQuestions').checked) shuffleArray(questions);

    currentIndex = 0;
    completedCount = 0;
    wrongQuestions = [];

    showQuestion();
});

// Initial load
(async function(){
    const quizSheets = await populateQuizDropdown();
    if(quizSheets.length === 0) return;

    quizSelector.value = quizSheets[0].sheet;

    questions = await loadQuestions(quizSelector.value);
    if(document.getElementById('shuffleQuestions').checked) shuffleArray(questions);

    currentIndex = 0;
    completedCount = 0;
    wrongQuestions = [];

    showQuestion();
})();