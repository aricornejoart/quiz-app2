const sheetId = '16bOgCaHG0Y450hwfl6tiHgAgTTxdxTVuMDhWLZbdD4E';

// Map Google Sheet tabs to friendly display names
const quizSheets = [
    { sheet: 'Sheet1', name: 'Math Studies' },
    { sheet: 'Sheet2', name: 'Science' },
    { sheet: 'Sheet3', name: 'History' }
];

let questions = [];
let currentIndex = 0;
let completedCount = 0;
let wrongQuestions = [];

const quizSelector = document.getElementById('quizSelector');
quizSheets.forEach(sheetObj => {
    const option = document.createElement('option');
    option.value = sheetObj.sheet;
    option.innerText = sheetObj.name;
    quizSelector.appendChild(option);
});

// Load questions from Google Sheet
async function loadQuestions(sheetName) {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${sheetName}`);
    const text = await response.text();
    const json = JSON.parse(text.match(/(?<=\().*(?=\);)/s)[0]);
    const rows = json.table.rows;

    return rows.slice(1).map(r => ({
        question: r.c[0]?.v || '',
        type: r.c[1]?.v || 'multiple choice',
        options: [
            r.c[2]?.v || '',
            r.c[3]?.v || '',
            r.c[4]?.v || '',
            r.c[5]?.v || ''
        ].filter(opt => opt !== ''),
        correct: r.c[6]?.v || '',
        explanations: [
            r.c[7]?.v || '',
            r.c[8]?.v || '',
            r.c[9]?.v || '',
            r.c[10]?.v || ''
        ],
        image: r.c[11]?.v || ''
    }));
}

// Shuffle helper
function shuffleArray(array) {
    for (let i = array.length -1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function showQuestion() {
    if(currentIndex >= questions.length) {
        document.getElementById('feedback').innerText = "Quiz Finished!";
        return;
    }

    const q = questions[currentIndex];
    let options = [...q.options];
    let explanations = [...q.explanations];

    // Shuffle options + explanations together
    if(document.getElementById('shuffleAnswers').checked && options.length > 1) {
        const combined = options.map((opt, idx) => ({opt, exp: explanations[idx]}));
        shuffleArray(combined);
        options = combined.map(c => c.opt);
        explanations = combined.map(c => c.exp);
    }

    document.getElementById('questionText').innerText = q.question;

    // Display options but hide explanations initially
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`option${i+1}`);
        const expDiv = document.getElementById(`explanation${i+1}`);

        if(options[i]) {
            btn.style.display = 'block';
            btn.innerText = options[i];
            btn.style.background = ""; // reset CSS
            expDiv.innerText = '';    // hide explanation initially

            btn.onclick = () => checkAnswer(options[i], explanations);
        } else {
            btn.style.display = 'none';
            expDiv.innerText = '';
        }
    }

    const img = document.getElementById('questionImage');
    if(q.image) {
        img.src = q.image;
        img.style.display = 'block';
    } else {
        img.style.display = 'none';
    }

    updateProgress();
}

// Check answer and reveal explanations after submission
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

        if(document.getElementById('retryWrong').checked) {
            wrongQuestions.push(q);
        }

        if(document.getElementById('penaltyMode').checked) {
            q.penalty = true;
        }
    }

    // Show explanations **after answering** (skip in speed mode)
    if(!document.getElementById('speedMode').checked) {
        for (let i = 0; i < 4; i++) {
            const expDiv = document.getElementById(`explanation${i+1}`);
            expDiv.innerText = explanations[i] || '';
        }
    }

    // Auto-advance in speed mode
    if(document.getElementById('speedMode').checked) {
        setTimeout(nextQuestion, 300);
    }
}

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
    const feedback = document.getElementById('feedback');
    feedback.innerText = "";
    feedback.classList.remove('correct', 'incorrect');

    if(document.getElementById('shuffleQuestions').checked) shuffleArray(questions);

    showQuestion();
}

function updateProgress() {
    const remaining = questions.length - currentIndex + wrongQuestions.length;
    document.getElementById('progressText').innerText = `${remaining} left`;
    document.getElementById('progressFill').style.width = `${(completedCount / (completedCount + remaining)) * 100}%`;
}

// Event listeners
document.getElementById('nextBtn').addEventListener('click', nextQuestion);
document.getElementById('prevBtn').addEventListener('click', prevQuestion);
document.getElementById('restartBtn').addEventListener('click', restartQuiz);

quizSelector.addEventListener('change', async (e) => {
    questions = await loadQuestions(e.target.value);

    if(document.getElementById('shuffleQuestions').checked) shuffleArray(questions);

    currentIndex = 0;
    completedCount = 0;
    wrongQuestions = [];

    showQuestion();
});

// Initial load
(async function(){
    const sheetName = document.getElementById('quizSelector').value;
    questions = await loadQuestions(sheetName);

    if(document.getElementById('shuffleQuestions').checked) shuffleArray(questions);

    showQuestion();
})();