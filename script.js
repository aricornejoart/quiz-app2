const sheetId = '16bOgCaHG0Y450hwfl6tiHgAgTTxdxTVuMDhWLZbdD4E';

const quizSheets = [
    'Sheet1',
    'Sheet2',
    'Sheet3'
];

let questions = [];
let currentIndex = 0;
let completedCount = 0;
let wrongQuestions = [];

const quizSelector = document.getElementById('quizSelector');
quizSheets.forEach(sheet => {
    const option = document.createElement('option');
    option.value = sheet;
    option.innerText = sheet;
    quizSelector.appendChild(option);
});

async function loadQuestions(sheetName) {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${sheetName}`);
    const text = await response.text();
    const json = JSON.parse(text.match(/(?<=\().*(?=\);)/s)[0]);
    const rows = json.table.rows;

    return rows.slice(1).map(r => ({
        question: r.c[0]?.v || '',
        options: [r.c[1]?.v || '', r.c[2]?.v || '', r.c[3]?.v || '', r.c[4]?.v || ''].filter(opt => opt !== ''),
        correct: r.c[5]?.v || '',
        image: r.c[6]?.v || ''
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

    // Shuffle only existing options
    if(document.getElementById('shuffleAnswers').checked && options.length > 1) {
        shuffleArray(options);
    }

    document.getElementById('questionText').innerText = q.question;

    // Show/hide options dynamically
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`option${i+1}`);
        if(options[i]) {
            btn.style.display = 'block';
            btn.innerText = options[i];
            btn.onclick = () => checkAnswer(options[i]);
            btn.style.background = ""; // reset to CSS
        } else {
            btn.style.display = 'none';
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

function checkAnswer(selectedText) {
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

        // Retry wrong answers go to end
        if(document.getElementById('retryWrong').checked) {
            wrongQuestions.push(q);
        }

        // Mark penalty flag if Penalty Mode is active
        if(document.getElementById('penaltyMode').checked) {
            q.penalty = true;
        }
    }

    // Speed mode: auto-advance
    if(document.getElementById('speedMode').checked) {
        setTimeout(nextQuestion, 300);
    }
}

function nextQuestion() {
    // Clear feedback immediately
    const feedback = document.getElementById('feedback');
    feedback.innerText = "";
    feedback.classList.remove('correct', 'incorrect');

    const currentQ = questions[currentIndex];

    // Apply penalty first
    if(currentQ && currentQ.penalty) {
        currentIndex = Math.max(currentIndex - 3, 0);
        delete currentQ.penalty;
    } else {
        currentIndex++;
    }

    // Append retry wrong questions if at the end
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
    const totalRemaining = questions.length - currentIndex + wrongQuestions.length;
    document.getElementById('progressText').innerText = `${completedCount} / ${totalRemaining}`;
    document.getElementById('progressFill').style.width = `${(completedCount / totalRemaining) * 100}%`;
}

// Event listeners
document.getElementById('nextBtn').addEventListener('click', nextQuestion);
document.getElementById('prevBtn').addEventListener('click', prevQuestion);
document.getElementById('restartBtn').addEventListener('click', restartQuiz);

document.getElementById('quizSelector').addEventListener('change', async (e) => {
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