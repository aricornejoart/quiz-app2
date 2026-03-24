const sheetId = '16bOgCaHG0Y450hwfl6tiHgAgTTxdxTVuMDhWLZbdD4E';

let questions = [];
let currentIndex = 0;
let completedCount = 0;

const quizSelector = document.getElementById('quizSelector');

// ------------------- Load Quiz List -------------------
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

// Populate dropdown
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

// ------------------- Load Questions -------------------
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

async function loadQuestions(sheetName) {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${sheetName}`);
    const text = await response.text();
    const json = JSON.parse(text.match(/(?<=\().*(?=\);)/s)[0]);
    const rows = json.table.rows;

    const firstTypeCell = rows[0].c[1]?.v?.toString().trim().toLowerCase() || '';
    if(firstTypeCell === 'hierarchy') return loadHierarchyQuestions(sheetName);
    return loadMultipleChoiceQuestions(sheetName);
}

// ------------------- Utility -------------------
function shuffleArray(array) {
    for (let i = array.length -1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// ------------------- Show Questions -------------------
function showQuestion() {
    if(currentIndex >= questions.length){
        document.getElementById('feedback').innerText="Quiz Finished!";
        return;
    }

    const q = questions[currentIndex];
    document.getElementById('questionText').innerText=q.question;

    const img=document.getElementById('questionImage');
    img.style.display=q.image?'block':'none';
    img.src=q.image||'';

    const mcContainer=document.querySelector('.options');
    const oldHierarchy=document.getElementById('hierarchyContainer');

    mcContainer.style.display='none';
    if(oldHierarchy) oldHierarchy.remove();

    if(q.type==='multiple choice'){
        mcContainer.style.display='flex';

        let options=[...q.options];
        let explanations=[...q.explanations];

        if(document.getElementById('shuffleAnswers').checked && options.length>1){
            const combined=options.map((opt,idx)=>({opt,exp:explanations[idx]}));
            shuffleArray(combined);
            options=combined.map(c=>c.opt);
            explanations=combined.map(c=>c.exp);
        }

        for(let i=0;i<4;i++){
            const btn=document.getElementById(`option${i+1}`);
            const expDiv=document.getElementById(`explanation${i+1}`);

            if(options[i]){
                btn.style.display='block';
                btn.innerText=options[i];
                btn.style.background="";
                expDiv.innerText='';
                btn.onclick=()=>checkAnswer(options[i]);
            } else {
                btn.style.display='none';
                expDiv.innerText='';
            }
        }

    } else {
        showHierarchyQuestion(q);
    }

    updateProgress();
}

// ------------------- Multiple Choice -------------------
function checkAnswer(selectedText){
    const q=questions[currentIndex];
    const isCorrect=selectedText===q.correct;

    const feedback=document.getElementById('feedback');
    feedback.classList.remove('correct','incorrect');

    if(isCorrect){
        completedCount++;
        feedback.innerText="Correct!";
        feedback.classList.add('correct');
    } else {
        feedback.innerText="Incorrect!";
        feedback.classList.add('incorrect');
    }

    if(document.getElementById('speedMode').checked){
        setTimeout(nextQuestion, 600);
    }
}

// ------------------- Hierarchy -------------------
function showHierarchyQuestion(q){
    const container=document.createElement('div');
    container.id='hierarchyContainer';

    let options=[...q.options];
    if(document.getElementById('shuffleAnswers').checked) shuffleArray(options);

    options.forEach(opt=>{
        const row=document.createElement('div');
        row.style.display='flex';
        row.style.alignItems='center';
        row.style.gap='10px';

        // Arrow buttons
        const arrows=document.createElement('div');
        arrows.style.display='flex';
        arrows.style.flexDirection='column';
        arrows.style.gap='2px';
        arrows.style.minWidth='20px';

        const upBtn=document.createElement('button');
        upBtn.innerText='^';
        upBtn.className='hierarchy-arrow';
        upBtn.onclick=()=> {
            const prev=row.previousElementSibling;
            if(prev) container.insertBefore(row,prev);
        };

        const downBtn=document.createElement('button');
        downBtn.innerText='^';
        downBtn.className='hierarchy-arrow down-arrow';
        downBtn.style.transform = "rotate(180deg)";
        downBtn.onclick=()=> {
            const next=row.nextElementSibling;
            if(next) container.insertBefore(next,row);
        };

        arrows.appendChild(upBtn);
        arrows.appendChild(downBtn);

        // Draggable item
        const item=document.createElement('div');
        item.className='hierarchy-item';
        item.draggable=true;
        item.style.touchAction='none';
        item.innerText=opt;
        item.style.flex='1';

        // Feedback to right
        const feedback=document.createElement('div');
        feedback.className='hierarchy-feedback';
        feedback.style.width='30px';
        feedback.style.textAlign='center';
        feedback.style.fontWeight='bold';

        row.appendChild(arrows);
        row.appendChild(item);
        row.appendChild(feedback);
        container.appendChild(row);
    });

    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.innerText = 'Submit';
    submitBtn.onclick = () => {
        const rows = [...container.children].filter(r => r.querySelector('.hierarchy-item'));
        let allCorrect = true;

        rows.forEach((row, idx) => {
            const item = row.querySelector('.hierarchy-item');
            const feedback = row.querySelector('.hierarchy-feedback');
            const correctIdx = q.correctOrder[idx]-1;

            if(q.options.indexOf(item.innerText) === correctIdx){
                feedback.innerText='✔';
                feedback.style.color='#4caf50';
            } else {
                feedback.innerText='✖';
                feedback.style.color='#ff6b6b';
                allCorrect = false;
            }
        });

        const fb = document.getElementById('feedback');
        fb.classList.remove('correct','incorrect');
        if(allCorrect){
            completedCount++;
            fb.innerText='Correct!';
            fb.classList.add('correct');
        } else {
            fb.innerText='Incorrect!';
            fb.classList.add('incorrect');
        }

        submitBtn.disabled = true;

        if(document.getElementById('speedMode').checked){
            setTimeout(nextQuestion,600);
        }
    };

    container.appendChild(submitBtn);
    document.querySelector('.question-container').appendChild(container);

    // Drag logic
    let dragSrc = null;
    container.querySelectorAll('.hierarchy-item').forEach(item => {
        item.addEventListener('dragstart', e => { dragSrc = item; });
        item.addEventListener('dragover', e => e.preventDefault());
        item.addEventListener('drop', e => {
            e.preventDefault();
            if (!dragSrc) return;

            const rows = [...container.children].filter(r => r.querySelector('.hierarchy-item'));
            const srcRow = dragSrc.parentElement;
            const tgtRow = item.parentElement;

            if(srcRow!==tgtRow){
                const srcIdx = rows.indexOf(srcRow);
                const tgtIdx = rows.indexOf(tgtRow);
                if(srcIdx<tgtIdx) container.insertBefore(srcRow, tgtRow.nextSibling);
                else container.insertBefore(srcRow, tgtRow);
            }

            dragSrc = null;
        });
    });
}

// ------------------- Navigation -------------------
function nextQuestion(){
    document.getElementById('feedback').innerText='';
    currentIndex++;
    showQuestion();
}

function prevQuestion(){
    if(currentIndex>0) currentIndex--;
    showQuestion();
}

function restartQuiz(){
    currentIndex = 0;
    completedCount = 0;

    if (document.getElementById('shuffleQuestions').checked) shuffleArray(questions);

    // Clear feedback
    const fb = document.getElementById('feedback');
    fb.innerText = '';
    fb.classList.remove('correct','incorrect');

    const hierarchyContainer = document.getElementById('hierarchyContainer');
    if (hierarchyContainer) {
        hierarchyContainer.querySelectorAll('.hierarchy-feedback').forEach(f => f.innerText = '');
        const submitBtn = hierarchyContainer.querySelector('button');
        if (submitBtn) submitBtn.disabled = false;
    }

    showQuestion();
}

// ------------------- Progress -------------------
function updateProgress(){
    const progressText=document.getElementById('progressText');
    const progressFill=document.getElementById('progressFill');

    if(!questions.length) return;
    const percent = (currentIndex/questions.length)*100;
    progressText.innerText=`${questions.length - currentIndex} left`;
    progressFill.style.width=`${percent}%`;
}

// ------------------- Events -------------------
document.getElementById('nextBtn').onclick=nextQuestion;
document.getElementById('prevBtn').onclick=prevQuestion;
document.getElementById('restartBtn').onclick=restartQuiz;

quizSelector.addEventListener('change', async e=>{
    questions=await loadQuestions(e.target.value);
    if(document.getElementById('shuffleQuestions').checked) shuffleArray(questions);
    currentIndex=0;
    showQuestion();
});

// ------------------- Init -------------------
(async function(){
    const quizSheets=await populateQuizDropdown();
    quizSelector.value=quizSheets[0].sheet;
    questions=await loadQuestions(quizSelector.value);
    if(document.getElementById('shuffleQuestions').checked) shuffleArray(questions);
    showQuestion();
})();

// ------------------- Click-to-Zoom for Images -------------------
const questionImage = document.getElementById('questionImage');
questionImage.addEventListener('click', () => {
    questionImage.classList.toggle('zoomed');
});