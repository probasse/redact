document.addEventListener('DOMContentLoaded', () => {
    // --- THEME LOGIC ---
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    // 1. Load Preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

    // Determine initial state (Dark is default in CSS)
    if (savedTheme === 'light' || (!savedTheme && systemPrefersLight)) {
        body.classList.add('light-mode');
        updateThemeIcon(true);
    } else {
        updateThemeIcon(false);
    }

    // 2. Toggle Handler
    themeToggle.addEventListener('click', () => {
        body.classList.toggle('light-mode');
        const isLight = body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        updateThemeIcon(isLight);
    });

    function updateThemeIcon(isLight) {
        const icon = themeToggle.querySelector('i');
        if (isLight) {
            icon.className = 'fa-solid fa-moon'; // Show moon to switch to dark
        } else {
            icon.className = 'fa-solid fa-sun-bright'; // Show sun to switch to light
        }
    }

    // Firebase Configuration
    const firebaseConfig = {
        apiKey: "AIzaSyBQA0Wd0QabI_-KgwYQRc-pPuQDdbUYgrE",
        authDomain: "redact-63681.firebaseapp.com",
        projectId: "redact-63681",
        storageBucket: "redact-63681.firebasestorage.app",
        messagingSenderId: "548777850356",
        appId: "1:548777850356:web:10260069e7a9729de8f5a1"
    };

    // Initialize Firebase
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (e) { console.log("Firebase already initialized"); }
    const auth = firebase.auth();
    const db = firebase.firestore();

    // UI Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const statusContainer = document.getElementById('status-container');
    const resultContainer = document.getElementById('result-container');
    const fileProgressList = document.getElementById('file-progress-list');
    const downloadLink = document.getElementById('download-link');
    const resetBtn = document.getElementById('reset-btn');
    const patternsGrid = document.getElementById('patterns-grid');
    const settingsContainer = document.getElementById('settings-container');
    const settingsHeader = document.getElementById('settings-header');

    // Auth UI
    const loginBtn = document.getElementById('login-btn');
    const mainLoginBtn = document.getElementById('main-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    const userNameSpan = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const loginScreen = document.getElementById('login-screen');
    const appContent = document.getElementById('app-content');

    // Landing Page Elements
    const landingContent = document.getElementById('landing-content');
    const heroGetStarted = document.getElementById('hero-get-started');
    const pricingGetStarted = document.getElementById('pricing-get-started');
    const finalGetStarted = document.getElementById('final-get-started');

    let currentUser = null;
    let customPatterns = {};
    let previousLimit = -1;
    let isVerifyingPayment = false;
    let currentPlanName = 'Free';

    // --- Toast Notification Helper ---
    function showToast(message, type = 'info') {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.style.position = 'fixed';
            toastContainer.style.bottom = '20px';
            toastContainer.style.right = '20px';
            toastContainer.style.zIndex = '1000';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.style.backgroundColor = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#3b82f6');
        toast.style.color = 'white';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.marginBottom = '10px';
        toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        toast.style.transition = 'opacity 0.3s ease';
        toast.innerText = message;

        toastContainer.appendChild(toast);

        // Fade out
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    // --- Payment Success Handling ---
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (sessionId) {
        // Clear URL to prevent reprocessing
        window.history.replaceState({}, document.title, "/");
        showToast("Verifying subscription status...", "info");
        isVerifyingPayment = true;
    }

    // --- CLIENT-SIDE PATTERNS (Local "Database" for Defaults) ---
    // These are the standard patterns that used to be on the server.
    const PATTERN_REGEXES = {
        'SSN': /\b(?!000|666|9\d{2})([0-8]\d{2}|7([0-6]\d|7[012]))([ -]?)(?!00)\d{2}\3(?!0000)\d{4}\b/g,
        'EMAIL': /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        'PHONE': /\b(?:\+?1[-. ]?)?\(?([2-9][0-8][0-9])\)?[-. ]?([2-9][0-9]{2})[-. ]?([0-9]{4})\b/g,
        'CREDIT_CARD': /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
        'DATE': /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g,
        'LINK': /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
        'IPV4_ADDRESS': /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
        'IBAN': /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}\b/g
    };

    // --- Helper: Sign In ---
    const signIn = () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => {
            console.error("Auth Error:", error);
            alert("Login Failed: " + error.message);
        });
    };

    // --- Authentication Logic ---
    if (loginBtn) loginBtn.addEventListener('click', signIn);
    if (mainLoginBtn) mainLoginBtn.addEventListener('click', signIn);

    // Landing Page CTA Buttons
    if (heroGetStarted) heroGetStarted.addEventListener('click', signIn);
    if (pricingGetStarted) pricingGetStarted.addEventListener('click', signIn);
    if (finalGetStarted) finalGetStarted.addEventListener('click', signIn);

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut();
        });
    }

    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            // Logged In - Show App Content, Hide Landing
            if (landingContent) landingContent.style.display = 'none';
            if (loginScreen) loginScreen.style.display = 'none';
            if (appContent) appContent.style.display = 'block';

            if (loginBtn) loginBtn.style.display = 'none';
            if (userInfo) userInfo.style.display = 'flex';
            if (userNameSpan) userNameSpan.textContent = user.displayName;
            if (userAvatar) userAvatar.src = user.photoURL;
            loadCustomPatternsFromFirestore();
        } else {
            // Logged Out - Show Landing Page
            if (landingContent) landingContent.style.display = 'block';
            if (loginScreen) loginScreen.style.display = 'none'; // Old login screen hidden
            if (appContent) appContent.style.display = 'none';

            if (loginBtn) loginBtn.style.display = 'block';
            if (userInfo) userInfo.style.display = 'none';

            // Fix: Hide Dashboard & Reset State
            const dashboard = document.getElementById('usage-dashboard');
            if (dashboard) dashboard.style.display = 'none';

            customPatterns = {};
            isVerifyingPayment = false;
            previousLimit = -1;
        }
    });

    // --- Firestore Logic ---
    function loadCustomPatternsFromFirestore() {
        if (!currentUser) return;

        // 1. Load Patterns
        db.collection('users').doc(currentUser.uid).collection('patterns').get()
            .then((querySnapshot) => {
                customPatterns = {}; // Reset local cache
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    customPatterns[data.name] = data.regex;
                });
                // Re-render with new data (Defaults + Custom)
                fetchAndRenderPatterns();
            })
            .catch((error) => {
                console.error("Error loading patterns:", error);
                // Even if firestore fails, render defaults
                fetchAndRenderPatterns();
            });

        // 2. Load Usage Stats (Realtime Listener for live updates)
        db.collection('users').doc(currentUser.uid).onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                currentPlanName = data.planId || 'Free';
                updateDashboard(
                    data.usageCount || 0,
                    data.usageLimit || 0,
                    currentPlanName,
                    data.cancelAtPeriodEnd || false,
                    data.subscriptionCurrentPeriodEnd || null
                );
            } else {
                // New user - default to Free
                updateDashboard(0, 5, 'Free', false, null);
            }
        });
    }

    function updateDashboard(count, limit, planName = 'Free', canceling = false, periodEnd = null) {
        const dashboard = document.getElementById('usage-dashboard');
        const countSpan = document.getElementById('usage-count');
        const limitSpan = document.getElementById('usage-limit');
        const planBadge = document.getElementById('user-plan-badge');
        const upgradeLink = document.getElementById('upgrade-link');
        const cancelBtn = document.getElementById('cancel-sub-btn');
        const validitySpan = document.getElementById('usage-validity');

        if (dashboard && countSpan && limitSpan) {
            dashboard.style.display = 'flex';
            countSpan.textContent = count;
            limitSpan.textContent = limit;

            // Validity Date
            if (validitySpan) {
                if (periodEnd && planName.toLowerCase() !== 'free') {
                    const date = new Date(periodEnd * 1000); // Stripe is seconds
                    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    validitySpan.textContent = canceling ? `Expires: ${dateStr}` : `Renews: ${dateStr}`;
                    validitySpan.className = 'validity-text'; // Apply class
                    validitySpan.style.display = 'inline-block';
                } else {
                    validitySpan.style.display = 'none';
                }
            }

            // Plan Badge Logic
            if (planBadge) {
                planBadge.style.display = 'inline-block';

                // Reset classes
                planBadge.classList.remove('badge-paid', 'badge-canceling');

                if (canceling) {
                    planBadge.textContent = planName + ' (Canceling)';
                    planBadge.classList.add('badge-canceling');
                } else {
                    planBadge.textContent = planName;
                    if (planName.toLowerCase() !== 'free') {
                        planBadge.classList.add('badge-paid');
                    }
                    // Free plan relies on default .plan-badge styles
                }
            }

            // Upgrade / Cancel Buttons
            const isPaid = planName && planName.toLowerCase() !== 'free';
            if (isPaid && !canceling) {
                if (upgradeLink) upgradeLink.textContent = "Change Plan"; // Optional polish
                if (cancelBtn) {
                    cancelBtn.style.display = 'inline-block';
                    cancelBtn.onclick = confirmCancelSubscription;
                }
            } else {
                if (cancelBtn) cancelBtn.style.display = 'none';
                if (upgradeLink) upgradeLink.textContent = "Upgrade";
            }

            // Check for upgrade or active subscription after payment
            if (isVerifyingPayment) {
                // If we detect a paid plan limit (Starter is 50), confirm success
                if (limit >= 50) {
                    showToast(`Subscription Ready! Limit is ${limit} docs.`, "success");
                    isVerifyingPayment = false;
                }
                // Otherwise maintain isVerifyingPayment=true and wait for the next snapshot update
            }
            previousLimit = limit;

            // Visual warning if near limit
            if (count >= limit) {
                countSpan.style.color = '#ef4444'; // Red
            } else {
                countSpan.style.color = 'inherit';
            }
        }
    }

    async function confirmCancelSubscription() {
        if (confirm("Are you sure you want to cancel? Your subscription will remain active until the end of the billing period.")) {
            try {
                const token = await currentUser.getIdToken();
                const res = await fetch('/cancel-subscription', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok) {
                    showToast("Subscription scheduled to cancel.", "info");
                    // Firestore listener will update the UI to "Canceling" state
                } else {
                    showToast("Error: " + data.error, "error");
                }
            } catch (e) {
                console.error(e);
                showToast("Network error during cancellation", "error");
            }
        }
    }

    function savePatternToFirestore(name, regex) {
        if (!currentUser) return;
        db.collection('users').doc(currentUser.uid).collection('patterns').doc(name).set({
            name: name,
            regex: regex,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
            .then(() => console.log("Pattern saved"))
            .catch((error) => console.error("Error saving pattern:", error));
    }

    function deletePatternFromFirestore(name) {
        if (!currentUser) return;
        db.collection('users').doc(currentUser.uid).collection('patterns').doc(name).delete()
            .then(() => {
                console.log("Pattern deleted");
                delete customPatterns[name];
                const el = document.getElementById(`pattern-item-${name}`);
                if (el) el.remove();
            })
            .catch((error) => console.error("Error deleting pattern:", error));
    }

    // --- Standard UI Logic ---

    // --- Custom Pattern Modal Logic ---
    const patternModal = document.getElementById('pattern-modal');
    const openPatternModalBtn = document.getElementById('open-pattern-modal-btn');
    const closeModalElements = document.querySelectorAll('.close-modal');
    const addCustomPatternBtn = document.getElementById('add-custom-pattern-btn');
    const customNameInput = document.getElementById('custom-name');

    // Toggle Inputs
    const typeExactBtn = document.getElementById('type-exact');
    const typeRegexBtn = document.getElementById('type-regex');
    const exactInputGroup = document.getElementById('exact-input-group');
    const regexInputGroup = document.getElementById('regex-input-group');
    const exactPhraseInput = document.getElementById('exact-phrase');
    const customRegexInput = document.getElementById('custom-regex');
    const customSampleInput = document.getElementById('custom-sample');
    const generateRegexBtn = document.getElementById('generate-regex-btn');

    let currentMode = 'exact'; // 'exact' or 'regex'

    openPatternModalBtn.onclick = () => {
        patternModal.style.display = 'flex'; // Centering requires flex
        customNameInput.value = '';
        exactPhraseInput.value = '';
        customRegexInput.value = '';
        customSampleInput.value = '';
        // Reset to Exact Mode default
        setMode('exact');
    };

    function setMode(mode) {
        currentMode = mode;
        if (mode === 'exact') {
            typeExactBtn.classList.add('active');
            typeRegexBtn.classList.remove('active');
            exactInputGroup.style.display = 'block';
            regexInputGroup.style.display = 'none';
        } else {
            typeExactBtn.classList.remove('active');
            typeRegexBtn.classList.add('active');
            exactInputGroup.style.display = 'none';
            regexInputGroup.style.display = 'block';
        }
    }

    typeExactBtn.onclick = () => setMode('exact');
    typeRegexBtn.onclick = () => setMode('regex');

    closeModalElements.forEach(el => {
        el.onclick = () => {
            patternModal.style.display = 'none';
            document.getElementById('preview-modal').style.display = 'none';
        };
    });

    window.onclick = (event) => {
        if (event.target == patternModal) patternModal.style.display = 'none';
    };

    // Helper to escape regex characters
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }

    generateRegexBtn.onclick = async () => {
        const sample = customSampleInput.value.trim();
        if (!sample) return alert('Please enter sample text.');

        generateRegexBtn.textContent = 'Generating...';
        try {
            const response = await fetch('/generate_regex', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sample_text: sample })
            });
            const data = await response.json();
            if (data.regex) {
                customRegexInput.value = data.regex;
            } else {
                alert('Could not generate regex.');
            }
        } catch (e) {
            console.error(e);
            alert('Error connecting to server.');
        } finally {
            generateRegexBtn.textContent = 'Generate';
        }
    };

    addCustomPatternBtn.onclick = async () => {
        const name = customNameInput.value.trim();
        if (!name) return alert('Please enter a pattern name.');

        let regexPattern = '';

        if (currentMode === 'exact') {
            const phrase = exactPhraseInput.value.trim();
            if (!phrase) return alert('Please enter the phrase to redact.');
            // Convert phrase to literal regex (Global, Case Insensitive usually preferred for names? Or strictly Case Sensitive?
            // Let's assume Case Sensitive for exact match unless user specifies otherwise, but for "Name" typically users might miss capitalization.
            // However, "Exact Block" implies strictness. 
            // Let's stick to strict case for "Exact" to be safe, or maybe case insensitive is more useful?
            // I'll make it Case Insensitive simply because "Name" often varies in casing. 
            // Wait, regex flags are not stored in the string usually in this app logic...

            // Current app logic: new RegExp(customPatterns[name], 'g')
            // It doesn't use 'i' flag. So it is Case Sensitive by default.

            // Advanced "Exact Phrase" Compilation
            // 1. Case Insensitive: Convert "a" -> "[aA]" to support case-insensitive matching without flags
            // 2. Smart Boundaries: Only add \b if the edge character is a word character

            const escaped = phrase.split('').map(char => {
                if (/[a-zA-Z]/.test(char)) {
                    return `[${char.toLowerCase()}${char.toUpperCase()}]`;
                }
                return escapeRegExp(char);
            }).join('');

            const startsWithWord = /^[a-zA-Z0-9_]/.test(phrase);
            const endsWithWord = /[a-zA-Z0-9_]$/.test(phrase);

            regexPattern = (startsWithWord ? '\\b' : '') + escaped + (endsWithWord ? '\\b' : '');
        } else {
            regexPattern = customRegexInput.value.trim();
            if (!regexPattern) return alert('Please enter or generate a regex pattern.');
        }

        try {
            // Save to Firestore logic...
            if (currentUser) {
                await savePatternToFirestore(name, regexPattern);
                // fetchAndRenderPatterns calls renderPatternItem
            } else {
                // Local only fallback (though we enforce login)
                customPatterns[name] = regexPattern;
                fetchAndRenderPatterns();
            }

            patternModal.style.display = 'none';
        } catch (e) {
            console.error("Error saving pattern:", e);
            alert("Error saving pattern: " + e.message);
        }
    };

    settingsHeader.addEventListener('click', () => {
        const isHidden = patternsGrid.style.display === 'none';
        patternsGrid.style.display = isHidden ? 'grid' : 'none';
        settingsHeader.classList.toggle('active', isHidden);
    });

    function fetchAndRenderPatterns() {
        patternsGrid.innerHTML = '';

        // 1. Render Default Patterns (Client-Side)
        Object.keys(PATTERN_REGEXES).forEach(pattern => {
            renderPatternItem(pattern, pattern, false);
        });

        // 2. Render Custom Patterns (From Firestore)
        Object.keys(customPatterns).forEach(name => {
            renderPatternItem(name, name, true);
        });
    }

    function renderPatternItem(id, label, isCustom) {
        const div = document.createElement('div');
        div.className = 'pattern-item';
        div.id = isCustom ? `pattern-item-${id}` : `pattern-item-default-${id}`;

        // Safe DOM creation
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `pat-${id}`;
        checkbox.name = 'patterns';
        checkbox.value = id;
        checkbox.checked = true;

        const labelEl = document.createElement('label');
        labelEl.htmlFor = `pat-${id}`;
        labelEl.textContent = label + (isCustom ? ' (Custom)' : '');

        div.appendChild(checkbox);
        div.appendChild(labelEl);

        if (isCustom) {
            const delBtn = document.createElement('button');
            delBtn.className = 'pattern-delete-btn';
            delBtn.title = 'Delete Pattern';
            delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>'; // Icon is safe
            div.appendChild(delBtn);
        }

        patternsGrid.appendChild(div);

        if (isCustom) {
            div.querySelector('.pattern-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete custom pattern "${id}"?`)) deletePatternFromFirestore(id);
            });
        }
    }

    // Initial render (will be updated by auth listener)
    fetchAndRenderPatterns();

    // Drag and Drop
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
    });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) processFiles(e.target.files); });
    resetBtn.addEventListener('click', resetUI);

    // --- CLIENT SIDE REDACTION LOGIC ---
    async function processFiles(files) {
        // Collect active regexes
        const checkboxes = document.querySelectorAll('input[name="patterns"]:checked');
        const selectedNames = Array.from(checkboxes).map(cb => cb.value);

        let activeRegexes = [];
        selectedNames.forEach(name => {
            if (PATTERN_REGEXES[name]) {
                activeRegexes.push(PATTERN_REGEXES[name]);
            } else if (customPatterns[name]) {
                try {
                    activeRegexes.push(new RegExp(customPatterns[name], 'g'));
                } catch (e) { console.error("Invalid custom regex:", name, e); }
            }
        });

        if (activeRegexes.length === 0) {
            if (!confirm('No patterns selected. The file will not be modified. Continue?')) return;
        }

        // --- GATEKEEPER CHECK ---
        if (!currentUser) {
            alert("Please sign in to process files secure and privately.");
            signIn(); // Trigger login
            return;
        }

        try {
            const token = await currentUser.getIdToken();
            const usageRes = await fetch('/api/check-usage', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ count: files.length })
            });

            if (usageRes.status === 403) {
                const data = await usageRes.json();
                if (data.reason === 'limit_reached') {
                    if (confirm(`Monthly Limit Reached (${data.current}/${data.limit}). Upgrade to process more files?`)) {
                        window.location.href = '/pricing';
                    }
                    return;
                }
            } else if (!usageRes.ok) {
                throw new Error("Usage check failed");
            }

            // Usage Approved - Update UI with new count (Optimistic)
            const usageData = await usageRes.json();
            updateDashboard(usageData.newCount, usageData.limit, currentPlanName);

        } catch (e) {
            console.error("Gatekeeper error:", e);
            alert("Error verifying subscription status. Please try again.");
            return;
        }

        // Setup UI
        dropZone.style.display = 'none';
        settingsContainer.style.display = 'none';
        statusContainer.style.display = 'block';
        fileProgressList.innerHTML = '';

        const batchId = crypto.randomUUID();
        const fileUIs = [];

        // Create UI Cards
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const item = document.createElement('div');
            item.className = 'file-progress-item';
            item.innerHTML = `
                <div class="file-info"><span class="file-name">${file.name}</span><span class="file-status">Waiting...</span></div>
                <div class="progress-bar"><div class="fill" style="width: 0%"></div></div>
            `;
            fileProgressList.appendChild(item);
            fileUIs.push({ file, el: item, bar: item.querySelector('.fill'), status: item.querySelector('.file-status') });
        }

        const processedFiles = [];
        let totalRedactions = 0;

        for (let i = 0; i < files.length; i++) {
            const ui = fileUIs[i];
            ui.status.textContent = "Analyzing...";
            ui.bar.style.width = "5%";

            try {
                // Clone buffer for analysis
                const originalBuffer = await ui.file.arrayBuffer();

                // 1. PDF.js - Find Matches (Analysis Phase)
                const loadingTask = pdfjsLib.getDocument(originalBuffer.slice(0));
                const pdf = await loadingTask.promise;

                const matches = []; // { pageIndex, x, y, width, height }

                for (let p = 1; p <= pdf.numPages; p++) {
                    const page = await pdf.getPage(p);
                    const textContent = await page.getTextContent();

                    textContent.items.forEach(item => {
                        const str = item.str;
                        if (!str || str.trim().length === 0) return;

                        activeRegexes.forEach(rx => {
                            rx.lastIndex = 0;
                            while (true) {
                                const match = rx.exec(str);
                                if (!match) break;

                                const tx = item.transform;
                                const x = tx[4];
                                const y = tx[5];
                                const w = item.width || (str.length * 5);
                                const h = item.height || (Math.abs(tx[3])) || 10;

                                matches.push({ pageIndex: p - 1, x, y, width: w, height: h });
                                totalRedactions++;
                            }
                        });
                    });
                    ui.bar.style.width = `${5 + (p / pdf.numPages) * 20}%`; // Up to 25%
                }

                ui.status.textContent = "Applying Masks...";

                // 2. PDF-lib - VISUAL Redaction (Draw Black Boxes)
                const pdfDoc = await PDFLib.PDFDocument.load(originalBuffer.slice(0));
                const pages = pdfDoc.getPages();
                const { rgb } = PDFLib;

                // Configurable Padding for "Full Coverage"
                const PAD_X = 2;
                const PAD_Y = 2;

                matches.forEach(m => {
                    if (m.pageIndex < pages.length) {
                        const page = pages[m.pageIndex];
                        if (isNaN(m.x) || isNaN(m.y) || isNaN(m.width) || isNaN(m.height)) return;
                        page.drawRectangle({
                            x: m.x - PAD_X,
                            y: m.y - PAD_Y,
                            width: m.width + (PAD_X * 2),
                            height: m.height + (PAD_Y * 2),
                            color: rgb(0, 0, 0)
                        });
                    }
                });

                // Save INTERMEDIATE PDF (Visually redacted, but still text)
                const intermediateBytes = await pdfDoc.save();

                // 3. FLATTENING (Rasterization)
                // Truly removes text by converting pages to images
                ui.status.textContent = "Flattening (Secure)...";

                const flattenedDoc = await PDFLib.PDFDocument.create();
                const intermediatePdf = await pdfjsLib.getDocument(intermediateBytes).promise;

                // Switch to Times Roman (often closer to standard serif docs) or keep Helvetica based on pref.
                // Times Roman usually has tighter metrics which might fit better? 
                // Let's stick to Helvetica but try to capture width better if possible?
                // Actually, Times Roman is a safer bet for generic "Document" text usually.
                const font = await flattenedDoc.embedFont(PDFLib.StandardFonts.TimesRoman);

                for (let p = 1; p <= intermediatePdf.numPages; p++) {
                    const page = await intermediatePdf.getPage(p);
                    const viewport = page.getViewport({ scale: 2.0 }); // 2x Scale for quality

                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');

                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                    // Convert to JPG 
                    const imgDataUrl = canvas.toDataURL('image/jpeg', 0.80);
                    const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());

                    const embeddedImage = await flattenedDoc.embedJpg(imgBytes);
                    // Add page matching the original dimensions
                    // Note: viewport.width is scaled x2, so we divide by 2 for the PDF page size
                    const newPage = flattenedDoc.addPage([viewport.width / 2.0, viewport.height / 2.0]);

                    newPage.drawImage(embeddedImage, {
                        x: 0,
                        y: 0,
                        width: newPage.getWidth(),
                        height: newPage.getHeight(),
                    });

                    // 4. RE-INJECT SAFE TEXT (Invisible Layer)
                    // Restoration of Searchability for non-redacted items
                    const originalPage = await pdf.getPage(p);
                    const textContent = await originalPage.getTextContent();

                    // Filter matches for this page (to check for overlap)
                    const pageRedactions = matches.filter(m => m.pageIndex === (p - 1));

                    textContent.items.forEach(item => {
                        const str = item.str;
                        if (!str || str.trim().length === 0) return;

                        const tx = item.transform;
                        // Transform: [scaleX, skewY, skewX, scaleY, x, y]
                        const tx_x = tx[4];
                        const tx_y = tx[5];
                        const tx_w = item.width;
                        const tx_h = item.height || Math.abs(tx[3]);

                        // Check collision with ANY redaction on this page (WITH PADDING CONSIDERED)
                        // We check against the aggressive padded box to ensure we don't leak edge text
                        let isRedacted = false;
                        for (const r of pageRedactions) {
                            // Padded Redaction Box logic
                            const rBox = {
                                x: r.x - PAD_X,
                                y: r.y - PAD_Y,
                                w: r.width + (PAD_X * 2),
                                h: r.height + (PAD_Y * 2)
                            };

                            // Overlap check
                            if (tx_x < (rBox.x + rBox.w) &&
                                (tx_x + tx_w) > rBox.x &&
                                tx_y < (rBox.y + rBox.h) &&
                                (tx_y + tx_h) > rBox.y) {
                                isRedacted = true;
                                break;
                            }
                        }

                        if (!isRedacted) {
                            try {
                                // Draw INVISIBLE text
                                const fontSize = Math.abs(tx[0]);

                                newPage.drawText(str, {
                                    x: tx_x,
                                    y: tx_y,
                                    size: fontSize || 12,
                                    font: font,
                                    color: PDFLib.rgb(0, 0, 0),
                                    opacity: 0
                                });
                            } catch (err) {
                                // If standard font cannot encode char (e.g. emoji or rare symbol), skip it
                                // This prevents the whole file from failing
                                console.warn(`Skipped text "${str}" due to font encoding:`, err);
                            }
                        }
                    });

                    // Progress: 25% -> 90%
                    ui.bar.style.width = `${25 + (p / intermediatePdf.numPages) * 65}%`;
                }

                ui.status.textContent = "Finalizing...";
                const finalBytes = await flattenedDoc.save();
                const blob = new Blob([finalBytes], { type: 'application/pdf' });

                processedFiles.push({ name: `secure_redacted_${ui.file.name}`, blob });

                ui.bar.style.width = "100%";
                ui.status.textContent = "Done";
                ui.status.style.color = "#4ade80";

            } catch (e) {
                console.error(e);
                ui.status.textContent = "Error: " + (e.message || "Unknown");
                ui.status.style.color = "red";
                ui.status.title = e.message;
            }
        }

        // Finish Batch
        statusContainer.style.display = 'none';
        resultContainer.style.display = 'block';
        document.getElementById('redaction-count').textContent = `Processed ${processedFiles.length} files. Items Redacted & Flattened: ${totalRedactions}`;

        // Clear previous buttons (reset logical state if needed, but we re-use elements)

        // Ensure Wrapper Exists
        let actionWrapper = document.getElementById('result-actions-wrapper');
        if (!actionWrapper) {
            actionWrapper = document.createElement('div');
            actionWrapper.id = 'result-actions-wrapper';
            actionWrapper.className = 'result-actions';

            // Move downloadLink into wrapper
            // Find where downloadLink currently is
            if (downloadLink.parentNode) {
                downloadLink.parentNode.insertBefore(actionWrapper, downloadLink);
                actionWrapper.appendChild(downloadLink);
            }
        }

        // Reset download link styles
        downloadLink.className = 'btn primary-btn';
        downloadLink.style.display = 'inline-flex';
        downloadLink.style.margin = '0'; // remove any margins

        // Preview Button
        let previewBtn = document.getElementById('preview-btn');
        if (!previewBtn) {
            previewBtn = document.createElement('a');
            previewBtn.id = 'preview-btn';
            previewBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Preview';
            previewBtn.style.cursor = 'pointer';
        }
        // Ensure styling and location
        previewBtn.className = 'btn secondary-btn';
        actionWrapper.appendChild(previewBtn);

        // Logic
        let finalBlobUrl = null;
        if (processedFiles.length === 1) {
            const blob = processedFiles[0].blob;
            finalBlobUrl = URL.createObjectURL(blob);

            downloadLink.href = finalBlobUrl;
            downloadLink.download = processedFiles[0].name;
            downloadLink.innerHTML = '<i class="fa-solid fa-download"></i> Download Secure PDF';

            // Activate Preview
            previewBtn.style.display = 'inline-flex';
            previewBtn.onclick = () => openPreview(finalBlobUrl);

        } else if (processedFiles.length > 1) {
            const zip = new JSZip();
            processedFiles.forEach(f => zip.file(f.name, f.blob));
            const content = await zip.generateAsync({ type: "blob" });
            finalBlobUrl = URL.createObjectURL(content);

            downloadLink.href = finalBlobUrl;
            downloadLink.download = "secure_redacted_files.zip";
            downloadLink.innerHTML = '<i class="fa-solid fa-file-zipper"></i> Download All (ZIP)';

            // Hide Preview for ZIPs
            previewBtn.style.display = 'none';
        }

        // Redact Another File Button
        let resetBtn = document.getElementById('reset-btn');
        if (!resetBtn) {
            resetBtn = document.createElement('button');
            resetBtn.id = 'reset-btn';
            resetBtn.onclick = () => {
                location.reload();
            };
        }
        // Ensure styling and location
        resetBtn.className = 'text-btn';
        resetBtn.innerHTML = 'Redact Another File';
        actionWrapper.appendChild(resetBtn); // Moves it if already elsewhere
    }

    // --- Preview Modal Logic ---
    const previewModal = document.getElementById('preview-modal');
    const closePreviewBtn = document.getElementById('close-preview');
    const previewFrame = document.getElementById('pdf-preview-frame');

    function openPreview(url) {
        previewFrame.src = url;
        previewModal.style.display = 'flex'; // Centering requires flex
    }

    if (closePreviewBtn) {
        closePreviewBtn.onclick = () => {
            previewModal.style.display = 'none';
            previewFrame.src = ''; // Clear memory
        };
    }

    // Close on click outside
    window.addEventListener('click', (e) => {
        if (e.target == previewModal) {
            previewModal.style.display = 'none';
            previewFrame.src = '';
        }
    });

    function resetUI() {
        resultContainer.style.display = 'none';
        statusContainer.style.display = 'none';
        dropZone.style.display = 'block';
        settingsContainer.style.display = 'block';
        fileInput.value = '';
        fileProgressList.innerHTML = '';
        if (document.getElementById('preview-btn')) document.getElementById('preview-btn').style.display = 'none';
    }
});
