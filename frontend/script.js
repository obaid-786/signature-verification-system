const API_BASE = '/api';

let selectedFile = null;
let selectedPersonId = null;
let isAuthenticated = false;
let currentUser = null;

// DOM elements
const personSelect = document.getElementById('personSelect');
const fileInput = document.getElementById('fileInput');
const fileDropzone = document.getElementById('fileDropzone');
const previewContainer = document.getElementById('previewContainer');
const verifyBtn = document.getElementById('verifyBtn');
const resultContainer = document.getElementById('resultContainer');
const resultContent = document.getElementById('resultContent');
const browsePersonSelect = document.getElementById('browsePersonSelect');
const signatureGrid = document.getElementById('signatureGrid');
const modal = document.getElementById('loginModal');
const closeBtn = document.querySelector('.close');
const loginSubmit = document.getElementById('loginSubmitBtn');

// ---------- AUTH ----------
async function checkAuth() {
    try {
        const res = await fetch(`${API_BASE}/check-auth`);
        const data = await res.json();
        isAuthenticated = data.authenticated;
        currentUser = data.username;
        updateUIBasedOnAuth();
    } catch (err) {
        console.error('Auth check failed', err);
    }
}

function updateUIBasedOnAuth() {
    const browseTabBtn = document.querySelector('.tab-btn[data-tab="browse"]');
    if (browseTabBtn) {
        if (isAuthenticated) {
            browseTabBtn.disabled = false;
            browseTabBtn.title = '';
            showLogoutButton();
        } else {
            browseTabBtn.disabled = false;
            browseTabBtn.title = 'Login required to browse dataset';
            hideLogoutButton();
        }
    }
}

// Tab switching (ensure it doesn't get blocked by disabled attribute)
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const tab = btn.dataset.tab;
        if (tab === 'browse' && !isAuthenticated) {
            e.preventDefault();
            showLoginModal();   // This should display the modal
            return;
        }
        // Normal tab switching
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('verifyTab').style.display = tab === 'verify' ? 'block' : 'none';
        document.getElementById('browseTab').style.display = tab === 'browse' ? 'block' : 'none';
        if (tab === 'browse' && isAuthenticated) {
            loadDatasetPersons();
        }
    });
});

function showLogoutButton() {
    let logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) {
        logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutBtn';
        logoutBtn.textContent = 'Logout';
        logoutBtn.className = 'btn btn-secondary';
        logoutBtn.style.position = 'absolute';
        logoutBtn.style.top = '20px';
        logoutBtn.style.right = '20px';
        logoutBtn.style.background = '#ef4444';
        logoutBtn.style.color = 'white';
        logoutBtn.style.padding = '8px 16px';
        logoutBtn.style.borderRadius = '40px';
        logoutBtn.style.border = 'none';
        logoutBtn.style.cursor = 'pointer';
        document.body.appendChild(logoutBtn);
        logoutBtn.addEventListener('click', async () => {
            await fetch(`${API_BASE}/logout`, { method: 'POST' });
            isAuthenticated = false;
            currentUser = null;
            updateUIBasedOnAuth();
            document.querySelector('.tab-btn[data-tab="verify"]').click();
            signatureGrid.innerHTML = '';
        });
    }
}

function hideLogoutButton() {
    const btn = document.getElementById('logoutBtn');
    if (btn) btn.remove();
}

function showLoginModal() { modal.style.display = 'block'; }
function closeLoginModal() {
    modal.style.display = 'none';
    document.getElementById('loginError').innerText = '';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
}
closeBtn.onclick = closeLoginModal;
window.onclick = (event) => { if (event.target === modal) closeLoginModal(); };

loginSubmit.addEventListener('click', async () => {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            isAuthenticated = true;
            currentUser = username;
            closeLoginModal();
            updateUIBasedOnAuth();
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            if (activeTab === 'browse') loadDatasetPersons();
        } else {
            errorDiv.innerText = data.message || 'Login failed';
        }
    } catch (err) {
        errorDiv.innerText = 'Network error';
    }
});

// Override fetch to catch 401 on dataset endpoints
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401 && args[0].includes('/api/dataset/')) {
        showLoginModal();
        throw new Error('Unauthorized');
    }
    return response;
};

// ---------- VERIFICATION TAB ----------
async function loadPersons() {
    try {
        const res = await fetch(`${API_BASE}/persons`);
        const data = await res.json();
        if (data.persons && data.persons.length) {
            personSelect.innerHTML = '<option value="">-- Select a person ID --</option>' +
                data.persons.map(id => `<option value="${id}">Person ${id}</option>`).join('');
        } else {
            personSelect.innerHTML = '<option value="">No trained models found</option>';
        }
    } catch (error) {
        console.error(error);
        personSelect.innerHTML = '<option value="">Error connecting to server</option>';
    }
}

personSelect.addEventListener('change', (e) => {
    selectedPersonId = e.target.value;
    updateVerifyButtonState();
});

fileDropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please upload an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('File too large (max 5MB)'); return; }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (event) => {
        previewContainer.innerHTML = `<img src="${event.target.result}" class="preview-image" alt="Signature preview">`;
    };
    reader.readAsDataURL(file);
    updateVerifyButtonState();
}

fileDropzone.addEventListener('dragover', (e) => { e.preventDefault(); fileDropzone.style.borderColor = '#667eea'; fileDropzone.style.background = '#f1f5f9'; });
fileDropzone.addEventListener('dragleave', (e) => { e.preventDefault(); fileDropzone.style.borderColor = '#cbd5e1'; fileDropzone.style.background = '#f8fafc'; });
fileDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropzone.style.borderColor = '#cbd5e1';
    fileDropzone.style.background = '#f8fafc';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        selectedFile = file;
        fileInput.files = e.dataTransfer.files;
        handleFileSelect({ target: { files: [file] } });
    } else { alert('Please drop an image file'); }
});

function updateVerifyButtonState() { verifyBtn.disabled = !(selectedPersonId && selectedFile); }

verifyBtn.addEventListener('click', async () => {
    if (!selectedPersonId || !selectedFile) return;
    verifyBtn.disabled = true;
    const spinner = verifyBtn.querySelector('.spinner');
    const btnText = verifyBtn.querySelector('.btn-text');
    spinner.classList.remove('hidden');
    btnText.textContent = 'Verifying...';
    const formData = new FormData();
    formData.append('person_id', selectedPersonId);
    formData.append('image', selectedFile);
    try {
        const response = await fetch(`${API_BASE}/verify`, { method: 'POST', body: formData });
        if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Verification failed'); }
        const data = await response.json();
        displayResult(data);
    } catch (error) { alert('Error: ' + error.message); }
    finally {
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
        <div class="confidence-meter"><div class="confidence-fill ${confidenceFillClass}" style="width: ${confidencePercent}%">${confidencePercent}%</div></div>
        <div class="detail-row"><span class="detail-label">Confidence Score</span><span class="detail-value">${data.confidence.toFixed(4)} (${confidencePercent}%)</span></div>
        <div class="detail-row"><span class="detail-label">Model Type</span><span class="detail-value">${data.model_type}</span></div>
        <div class="detail-row"><span class="detail-label">Model Accuracy</span><span class="detail-value">${(data.model_accuracy * 100).toFixed(2)}%</span></div>
        <div class="detail-row"><span class="detail-label">Person ID</span><span class="detail-value">${data.person_id}</span></div>
    `;
}

// ---------- DATASET BROWSER TAB ----------
async function loadDatasetPersons() {
    browsePersonSelect.innerHTML = '<option value="">Loading...</option>';
    try {
        const res = await fetch(`${API_BASE}/dataset/persons`);
        const data = await res.json();
        if (data.persons && data.persons.length) {
            browsePersonSelect.innerHTML = '<option value="">-- Select a person --</option>' +
                data.persons.map(id => `<option value="${id}">Person ${id}</option>`).join('');
        } else {
            browsePersonSelect.innerHTML = '<option value="">No dataset found</option>';
        }
    } catch (err) {
        console.error(err);
        browsePersonSelect.innerHTML = '<option value="">Error loading persons</option>';
    }
}

browsePersonSelect.addEventListener('change', async (e) => {
    const personId = e.target.value;
    if (!personId) { signatureGrid.innerHTML = ''; return; }
    signatureGrid.innerHTML = '<div class="loading">Loading signatures...</div>';
    try {
        const res = await fetch(`${API_BASE}/dataset/person/${personId}/signatures`);
        const data = await res.json();
        renderSignatureGrid(personId, data.genuine, data.forged);
    } catch (err) {
        signatureGrid.innerHTML = '<div class="error">Failed to load signatures</div>';
    }
});

function renderSignatureGrid(personId, genuineFiles, forgedFiles) {
    signatureGrid.innerHTML = '';
    if (genuineFiles.length) {
        const genuineSection = document.createElement('div');
        genuineSection.innerHTML = '<h4 style="margin:10px 0 5px; color:#10b981;">✓ Genuine Signatures</h4>';
        signatureGrid.appendChild(genuineSection);
        genuineFiles.forEach(file => { signatureGrid.appendChild(createSignatureCard(personId, file, 'genuine')); });
    }
    if (forgedFiles.length) {
        const forgedSection = document.createElement('div');
        forgedSection.innerHTML = '<h4 style="margin:20px 0 5px; color:#ef4444;">✗ Forged Signatures</h4>';
        signatureGrid.appendChild(forgedSection);
        forgedFiles.forEach(file => { signatureGrid.appendChild(createSignatureCard(personId, file, 'forged')); });
    }
}

function createSignatureCard(personId, filename, type) {
    const card = document.createElement('div');
    card.className = 'signature-card';
    const imgUrl = `${API_BASE}/dataset/image/${personId}/${encodeURIComponent(filename)}`;
    card.innerHTML = `
        <img class="signature-img" src="${imgUrl}" alt="${filename}" loading="lazy">
        <div class="signature-info">
            <div class="signature-type ${type === 'genuine' ? 'type-genuine' : 'type-forged'}">${type.toUpperCase()}</div>
            <div>${filename}</div>
        </div>
    `;
    card.addEventListener('click', () => {
        // Switch to verify tab
        document.querySelector('.tab-btn[data-tab="verify"]').click();

        // Set person ID
        personSelect.value = personId;
        selectedPersonId = personId;

        // Fetch the image blob
        fetch(imgUrl)
            .then(res => res.blob())
            .then(blob => {
                const file = new File([blob], filename, { type: 'image/png' });
                
                // Update file input
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;
                
                // Set global file variable
                selectedFile = file;
                
                // Show preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    previewContainer.innerHTML = `<img src="${e.target.result}" class="preview-image" alt="Signature preview">`;
                };
                reader.readAsDataURL(file);
                
                // Enable the verify button
                updateVerifyButtonState();
            })
            .catch(err => console.error('Failed to load image:', err));
    });
    return card;
}

// ---------- TAB SWITCHING ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const tab = btn.dataset.tab;
        if (tab === 'browse' && !isAuthenticated) {
            e.preventDefault();
            showLoginModal();
            return;
        }
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('verifyTab').style.display = tab === 'verify' ? 'block' : 'none';
        document.getElementById('browseTab').style.display = tab === 'browse' ? 'block' : 'none';
        if (tab === 'browse' && isAuthenticated) loadDatasetPersons();
    });
});

// ---------- INIT ----------
loadPersons();
checkAuth();