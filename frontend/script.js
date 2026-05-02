const API_BASE = 'http://localhost:5000/api';

let selectedFile = null;
let selectedPersonId = null;

// DOM elements
const personSelect = document.getElementById('personSelect');
const fileInput = document.getElementById('fileInput');
const fileDropzone = document.getElementById('fileDropzone');
const previewContainer = document.getElementById('previewContainer');
const verifyBtn = document.getElementById('verifyBtn');
const resultContainer = document.getElementById('resultContainer');
const resultContent = document.getElementById('resultContent');

// Load persons on page load
async function loadPersons() {
    try {
        const response = await fetch(`${API_BASE}/persons`);
        const data = await response.json();
        if (data.persons && data.persons.length > 0) {
            personSelect.innerHTML = '<option value="">-- Select a person ID --</option>' +
                data.persons.map(id => `<option value="${id}">Person ${id}</option>`).join('');
        } else {
            personSelect.innerHTML = '<option value="">No trained models found</option>';
        }
    } catch (error) {
        console.error('Failed to load persons:', error);
        personSelect.innerHTML = '<option value="">Error connecting to server</option>';
    }
}

// Update selected person
personSelect.addEventListener('change', (e) => {
    selectedPersonId = e.target.value;
    updateVerifyButtonState();
});

// Handle file selection via click/drop
fileDropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file (PNG, JPG)');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert('File too large (max 5MB)');
        return;
    }
    
    selectedFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (event) => {
        previewContainer.innerHTML = `<img src="${event.target.result}" class="preview-image" alt="Signature preview">`;
    };
    reader.readAsDataURL(file);
    
    updateVerifyButtonState();
}

// Drag & drop
fileDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDropzone.style.borderColor = '#667eea';
    fileDropzone.style.background = '#f1f5f9';
});
fileDropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    fileDropzone.style.borderColor = '#cbd5e1';
    fileDropzone.style.background = '#f8fafc';
});
fileDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropzone.style.borderColor = '#cbd5e1';
    fileDropzone.style.background = '#f8fafc';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        selectedFile = file;
        fileInput.files = e.dataTransfer.files;
        handleFileSelect({ target: { files: [file] } });
    } else {
        alert('Please drop an image file');
    }
});

function updateVerifyButtonState() {
    verifyBtn.disabled = !(selectedPersonId && selectedFile);
}

// Verification request
verifyBtn.addEventListener('click', async () => {
    if (!selectedPersonId || !selectedFile) return;
    
    // Show loading state
    verifyBtn.disabled = true;
    const spinner = verifyBtn.querySelector('.spinner');
    const btnText = verifyBtn.querySelector('.btn-text');
    spinner.classList.remove('hidden');
    btnText.textContent = 'Verifying...';
    
    const formData = new FormData();
    formData.append('person_id', selectedPersonId);
    formData.append('image', selectedFile);
    
    try {
        const response = await fetch(`${API_BASE}/verify`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Verification failed');
        }
        
        const data = await response.json();
        displayResult(data);
        
    } catch (error) {
        alert('Error: ' + error.message);
        console.error(error);
    } finally {
        spinner.classList.add('hidden');
        btnText.textContent = 'Verify Signature';
        updateVerifyButtonState();
    }
});

function displayResult(data) {
    resultContainer.classList.remove('hidden');
    
    const confidencePercent = (data.confidence * 100).toFixed(1);
    const isGenuine = data.verdict === 'genuine';
    const verdictClass = isGenuine ? 'verdict-genuine' : 'verdict-forged';
    const verdictText = isGenuine ? '✓ GENUINE SIGNATURE' : '✗ FORGED SIGNATURE';
    const confidenceFillClass = isGenuine ? '' : 'forged';
    
    resultContent.innerHTML = `
        <div class="verdict-badge ${verdictClass}">${verdictText}</div>
        
        <div class="confidence-meter">
            <div class="confidence-fill ${confidenceFillClass}" style="width: ${confidencePercent}%">
                ${confidencePercent}%
            </div>
        </div>
        
        <div class="detail-row">
            <span class="detail-label">Confidence Score</span>
            <span class="detail-value">${data.confidence.toFixed(4)} (${confidencePercent}%)</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Model Type</span>
            <span class="detail-value">${data.model_type}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Model Accuracy</span>
            <span class="detail-value">${(data.model_accuracy * 100).toFixed(2)}%</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Person ID</span>
            <span class="detail-value">${data.person_id}</span>
        </div>
    `;
}

// Initialize
loadPersons();