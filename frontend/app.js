/**
 * VCPBookIndexGen Frontend Application
 */

// ═══════════════════════════════════════════════════════════════
//  Configuration
// ═══════════════════════════════════════════════════════════════

const API_BASE = 'http://127.0.0.1:3892';

// ═══════════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════════

const state = {
    uploadedFile: null,
    filePath: null,
    bookName: '',
    isProcessing: false,
    statusInterval: null,
    // [lslsl3q 添加] 编辑器状态
    currentBookName: '',
    currentFileName: '',
    hasUnsavedChanges: false
    // [lslsl3q 添加结束]
};

// ═══════════════════════════════════════════════════════════════
//  DOM Elements
// ═══════════════════════════════════════════════════════════════

const elements = {
    // Navigation
    navItems: document.querySelectorAll('.nav-item'),
    tabContents: document.querySelectorAll('.tab-content'),

    // Upload
    fileInput: document.getElementById('fileInput'),

    // Process
    bookNameInput: document.getElementById('bookName'),
    customPattern: document.getElementById('customPattern'),
    startProcess: document.getElementById('startProcess'),
    progressSection: document.getElementById('progressSection'),
    progressFill: document.getElementById('progressFill'),
    progressPercent: document.getElementById('progressPercent'),
    progressMessage: document.getElementById('progressMessage'),
    
    // Output
    outputEmpty: document.getElementById('outputEmpty'),
    outputContainer: document.getElementById('outputContainer'),
    booksListPanel: document.getElementById('booksListPanel'),
    outputBookCount: document.getElementById('outputBookCount'),
    outputBookName: document.getElementById('outputBookName'),
    outputFileCount: document.getElementById('outputFileCount'),
    filesList: document.getElementById('filesList'),
    // 编辑器元素
    editorPanel: document.getElementById('editorPanel'),
    editorContent: document.getElementById('editorContent'),
    editorFilename: document.getElementById('editorFilename'),
    editorTextarea: document.getElementById('editorTextarea'),
    editorStatus: document.getElementById('editorStatus'),
    // [lslsl3q 添加结束]
    
    // Status
    statusIndicator: document.getElementById('statusIndicator'),
    statusText: document.querySelector('.status-text'),
    
    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// ═══════════════════════════════════════════════════════════════
//  Utility Functions
// ═══════════════════════════════════════════════════════════════

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatNumber(num) {
    return num.toLocaleString('zh-CN');
}

// ═══════════════════════════════════════════════════════════════
//  Navigation
// ═══════════════════════════════════════════════════════════════

function initNavigation() {
    elements.navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.dataset.tab;

            // Update nav items
            elements.navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update tab contents
            elements.tabContents.forEach(tab => tab.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');

            // 处理输出页面的宽度限制
            const mainContent = document.querySelector('.main-content');
            if (tabId === 'output') {
                mainContent.classList.add('full-width');
                // 加载书籍列表
                loadBooksListForOutput();
            } else {
                mainContent.classList.remove('full-width');
            }
        });
    });
}

// ═══════════════════════════════════════════════════════════════
//  File Upload
// ═══════════════════════════════════════════════════════════════

// [lslsl3q 修改] 简化上传初始化
function initUpload() {
    // File input change
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

async function handleFileUpload(file) {
    if (!file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
        showToast('只支持 .txt 和 .md 文件', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        showToast('正在上传文件...', 'info');
        
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('上传失败');
        }
        
        const data = await response.json();
        
        state.uploadedFile = data;
        state.filePath = data.file_path;
        state.bookName = data.filename.replace(/\.(txt|md)$/, '');
        
        // Pre-fill book name
        elements.bookNameInput.value = state.bookName;
        
        // [lslsl3q 修改] 更新处理页面的文件信息卡片 - 高级设计
        const fileInfoCard = document.getElementById('processFileInfo');
        const fileCardPremium = document.getElementById('fileCardPremium');
        if (fileInfoCard) {
            // 获取文件扩展名
            const fileExt = data.filename.split('.').pop().toUpperCase();
            const fileSizeKB = (file.size / 1024).toFixed(1);
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            
            fileInfoCard.innerHTML = `
                <div class="file-loaded-premium">
                    <div class="file-icon-premium">
                        <div class="file-icon-main">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                            </svg>
                        </div>
                        <span class="file-type-badge">${fileExt}</span>
                    </div>
                    <div class="file-details-premium">
                        <div class="file-name-premium">${data.filename}</div>
                        <div class="file-stats">
                            <div class="file-stat-item">
                                <span class="file-stat-label">字符</span>
                                <span class="file-stat-value">${formatNumber(data.total_chars)}</span>
                            </div>
                            <div class="file-stat-item">
                                <span class="file-stat-label">Token</span>
                                <span class="file-stat-value">${formatNumber(data.total_tokens)}</span>
                            </div>
                            <div class="file-stat-item">
                                <span class="file-stat-label">大小</span>
                                <span class="file-stat-value">${fileSizeMB}MB</span>
                            </div>
                            <div class="file-stat-item">
                                <span class="file-stat-label">章节</span>
                                <span class="file-stat-value">${data.chapter_count}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // 添加加载动画效果
            if (fileCardPremium) {
                fileCardPremium.classList.add('file-loaded-animate');
                setTimeout(() => {
                    fileCardPremium.classList.remove('file-loaded-animate');
                }, 500);
            }
        }
        // [lslsl3q 修改结束]
        
        // [lslsl3q 添加] 显示清除按钮
        const clearBtn = document.getElementById('btnClearFile');
        if (clearBtn) {
            clearBtn.style.display = 'flex';
        }
        
        showToast('文件上传成功', 'success');
        
    } catch (error) {
        showToast('上传失败: ' + error.message, 'error');
    }
}

function clearFile() {
    state.uploadedFile = null;
    state.filePath = null;
    state.bookName = '';
    
    elements.fileInput.value = '';
    elements.bookNameInput.value = '';
    
    // 隐藏清除按钮
    const clearBtn = document.getElementById('btnClearFile');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
    
    // 重置处理页面的文件信息卡片为空状态
    const fileInfoCard = document.getElementById('processFileInfo');
    if (fileInfoCard) {
        fileInfoCard.innerHTML = `
            <div class="file-empty-clickable" onclick="document.getElementById('fileInput').click()">
                <div class="empty-icon-simple">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"/>
                    </svg>
                </div>
                <p class="empty-text">点击上传文件</p>
                <p class="empty-hint-simple">支持 .txt 和 .md 格式</p>
            </div>
        `;
    }
}

// [lslsl3q 添加] 清除文件并重置所有状态
async function clearFileAndReset() {
    // 如果正在处理，先停止
    if (state.isProcessing) {
        await stopMainProcess();
    }
    
    // 清除文件
    clearFile();
    
    // 重置进度和日志
    elements.progressFill.style.width = '0%';
    elements.progressPercent.textContent = '0%';
    elements.progressMessage.textContent = '等待开始...';
    document.getElementById('logContent').textContent = '等待处理...';
    document.getElementById('terminalInputArea').style.display = 'none';
    
    // 隐藏停止按钮
    document.getElementById('btnStopLog').style.display = 'none';
    
    // 重置状态
    state.isProcessing = false;
    elements.startProcess.disabled = false;
    updateStatus('idle', '就绪');
    
    showToast('已清除', 'info');
}

// ═══════════════════════════════════════════════════════════════
//  Process
// ═══════════════════════════════════════════════════════════════

function initProcess() {
    elements.startProcess.addEventListener('click', startProcessing);
}

async function startProcessing() {
    if (!state.filePath) {
        showToast('请先上传文件', 'error');
        return;
    }
    
    if (state.isProcessing) {
        showToast('已有任务在处理中', 'error');
        return;
    }
    
    const bookName = elements.bookNameInput.value || state.bookName;
    // [lslsl3q 修改] 从隐藏input获取模式值
    const mode = document.getElementById('processMode').value || 'speed';
    const pattern = elements.customPattern.value || '';
    
    try {
        state.isProcessing = true;
        updateStatus('processing', '处理中');
        
        // 重置进度和日志
        elements.progressFill.style.width = '0%';
        elements.progressPercent.textContent = '0%';
        elements.progressMessage.textContent = '正在启动...';
        document.getElementById('logContent').textContent = '正在启动 main.py...\n';
        
        // 显示停止按钮
        document.getElementById('btnStopLog').style.display = 'flex';
        
        // Disable button
        elements.startProcess.disabled = true;
        
        // [lslsl3q 修改] 调用 /run-main 端点运行 main.py
        const params = new URLSearchParams({
            file_path: state.filePath,
            book_name: bookName,
            mode: mode
        });
        
        if (pattern) {
            params.append('pattern', pattern);
        }
        
        const response = await fetch(`${API_BASE}/run-main?${params}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '启动失败');
        }
        
        showToast('处理已开始', 'success');
        
        // Start polling logs
        startLogPolling();
        
    } catch (error) {
        state.isProcessing = false;
        updateStatus('error', '错误');
        elements.startProcess.disabled = false;
        showToast('启动失败: ' + error.message, 'error');
    }
}

function startStatusPolling() {
    if (state.statusInterval) {
        clearInterval(state.statusInterval);
    }
    
    state.statusInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/status`);
            const data = await response.json();
            
            // Update progress
            elements.progressFill.style.width = `${data.progress}%`;
            elements.progressPercent.textContent = `${data.progress}%`;
            elements.progressMessage.textContent = data.message;
            
            if (data.status === 'completed') {
                clearInterval(state.statusInterval);
                state.isProcessing = false;
                elements.startProcess.disabled = false;
                updateStatus('idle', '完成');
                showToast('处理完成！', 'success');
                
                // Switch to output tab
                document.querySelector('[data-tab="output"]').click();
                
            } else if (data.status === 'error') {
                clearInterval(state.statusInterval);
                state.isProcessing = false;
                elements.startProcess.disabled = false;
                updateStatus('error', '错误');
                showToast('处理失败: ' + (data.error || '未知错误'), 'error');
            }
            
        } catch (error) {
            console.error('Status polling error:', error);
        }
    }, 1000);
}


function updateStatus(status, text) {
    elements.statusIndicator.className = `status-indicator ${status}`;
    elements.statusText.textContent = text;
}

// ═══════════════════════════════════════════════════════════════
//  Output Files
// ═══════════════════════════════════════════════════════════════

async function loadOutputFiles(bookName) {
    try {
        const response = await fetch(`${API_BASE}/output/${encodeURIComponent(bookName)}`);
        
        if (!response.ok) {
            throw new Error('获取文件列表失败');
        }
        
        const data = await response.json();
        
        elements.outputEmpty.style.display = 'none';
        elements.outputContainer.style.display = 'flex';
        elements.outputBookName.textContent = bookName;
        elements.outputFileCount.textContent = data.files.length;
        
        // 保存当前书籍名称并重置编辑器
        state.currentBookName = bookName;
        closeEditor();
        
        renderFilesList(bookName, data.files);
        
    } catch (error) {
        console.error('Load output files error:', error);
    }
}

function renderFilesList(bookName, files) {
    // [lslsl3q 修改] 使用 data 属性存储文件名，避免特殊字符转义问题
    const bookNameEscaped = bookName.replace(/'/g, "\\'").replace(/"/g, '\\"');
    
    elements.filesList.innerHTML = files.map((file, index) => `
        <div class="file-item" data-index="${index}" data-book="${escapeHtml(bookName)}" data-filename="${escapeHtml(file.name)}">
            <div class="file-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                </svg>
            </div>
            <div class="file-item-info">
                <div class="file-item-name">${escapeHtml(file.name)}</div>
                <div class="file-item-meta">${formatBytes(file.size)}</div>
            </div>
            <button class="file-item-action file-download-btn">
                下载
            </button>
        </div>
    `).join('');
    
    // 添加事件监听
    elements.filesList.querySelectorAll('.file-item').forEach(item => {
        item.addEventListener('click', () => {
            const book = item.dataset.book;
            const filename = item.dataset.filename;
            openFileForEdit(book, filename);
        });
    });
    
    elements.filesList.querySelectorAll('.file-download-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = btn.closest('.file-item');
            const book = item.dataset.book;
            const filename = item.dataset.filename;
            downloadFile(book, filename);
        });
    });
    // [lslsl3q 修改结束]
}

// [lslsl3q 添加] HTML 转义函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// [lslsl3q 添加] CSS 选择器转义函数（兼容旧浏览器）
function cssEscape(text) {
    if (typeof CSS !== 'undefined' && CSS.escape) {
        return CSS.escape(text);
    }
    // 简单回退：转义特殊字符
    return text.replace(/([^\w-])/g, '\\$1');
}
// [lslsl3q 添加结束]

function downloadFile(bookName, filename) {
    const url = `${API_BASE}/download/${encodeURIComponent(bookName)}/${encodeURIComponent(filename)}`;
    window.open(url, '_blank');
}

// ═══════════════════════════════════════════════════════════════
//  Initialize
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initUpload();
    initProcess();
    checkInitialStatus();
});

// ═══════════════════════════════════════════════════════════════
//  输出页面 - 书籍列表功能
// ═══════════════════════════════════════════════════════════════

async function loadBooksListForOutput() {
    try {
        const response = await fetch(`${API_BASE}/books`);
        const data = await response.json();

        if (data.books.length === 0) {
            elements.outputEmpty.style.display = 'flex';
            elements.outputContainer.style.display = 'none';
            return;
        }

        elements.outputEmpty.style.display = 'none';
        elements.outputContainer.style.display = 'flex';
        elements.outputBookCount.textContent = data.books.length + ' 本';

        renderBooksListPanel(data.books);
    } catch (error) {
        console.error('Load books list error:', error);
    }
}

function renderBooksListPanel(books) {
    elements.booksListPanel.innerHTML = books.map(book => {
        const progress = book.progress || {};
        const isComplete = progress.percent >= 100;
        const statusClass = isComplete ? 'completed' : 'processing';
        const statusText = isComplete ? '已完成' : `${progress.percent}%`;

        return `
            <div class="book-item" data-book="${escapeHtml(book.name)}" onclick="selectBook('${escapeHtml(book.name)}')">
                <div class="book-item-name">${book.name}</div>
                <div class="book-item-meta">${book.file_count} 个文件</div>
                <span class="book-item-status ${statusClass}">${statusText}</span>
            </div>
        `;
    }).join('');
}

async function selectBook(bookName) {
    // 更新选中状态
    document.querySelectorAll('.book-item').forEach(item => {
        item.classList.remove('selected');
    });
    const selectedItem = document.querySelector(`.book-item[data-book="${cssEscape(bookName)}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }

    // 加载该书的文件列表
    await loadOutputFiles(bookName);
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function resumeBook(bookName) {
    if (state.isProcessing) {
        showToast('已有任务在处理中', 'error');
        return;
    }

    const mode = document.getElementById('processMode').value || 'speed';

    try {
        state.isProcessing = true;
        updateStatus('processing', '续传中');

        // 显示进度
        elements.progressSection.style.display = 'block';
        elements.progressFill.style.width = '0%';
        elements.progressPercent.textContent = '0%';
        elements.progressMessage.textContent = '正在恢复处理...';
        elements.startProcess.disabled = true;

        // 切换到处理页面
        document.querySelector('[data-tab="process"]').click();

        const response = await fetch(`${API_BASE}/resume/${encodeURIComponent(bookName)}?mode=${mode}`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '续传失败');
        }

        showToast('断点续传已开始', 'success');
        startStatusPolling();

    } catch (error) {
        state.isProcessing = false;
        updateStatus('error', '错误');
        elements.startProcess.disabled = false;
        showToast('续传失败: ' + error.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
//  [lslsl3q 添加] 初始状态检测
// ═══════════════════════════════════════════════════════════════

async function checkInitialStatus() {
    try {
        // [lslsl3q 修改] 先检查 main.py 日志状态
        const logsResponse = await fetch(`${API_BASE}/main-logs`);
        const logsData = await logsResponse.json();
        
        if (logsData.status === 'processing') {
            // main.py 正在运行，恢复前端状态
            state.isProcessing = true;
            state.bookName = logsData.book_name;
            
            // 更新状态指示器
            updateStatus('processing', '处理中');
            
            // 更新进度和日志
            elements.progressFill.style.width = `${logsData.progress}%`;
            elements.progressPercent.textContent = `${logsData.progress}%`;
            elements.progressMessage.textContent = logsData.message;
            
            // 更新日志内容
            const logContent = document.getElementById('logContent');
            logContent.textContent = (logsData.logs || []).join('');
            logContent.scrollTop = logContent.scrollHeight;
            
            // 显示停止按钮
            document.getElementById('btnStopLog').style.display = 'flex';
            
            // 切换到处理设置页面
            document.querySelector('[data-tab="process"]').click();
            
            // 开始轮询日志
            startLogPolling();
            
            showToast('检测到正在处理的任务，已恢复状态', 'info');
            return;
        }
        
        // 再检查原有状态
        const response = await fetch(`${API_BASE}/status`);
        const data = await response.json();
        
        if (data.status === 'processing') {
            // 后端正有任务在处理，恢复前端状态
            state.isProcessing = true;
            state.bookName = data.book_name;
            
            // 更新状态指示器
            updateStatus('processing', '处理中');
            
            // 更新进度
            elements.progressFill.style.width = `${data.progress}%`;
            elements.progressPercent.textContent = `${data.progress}%`;
            elements.progressMessage.textContent = data.message;
            
            // 显示停止按钮
            document.getElementById('btnStopLog').style.display = 'flex';
            
            // 切换到处理设置页面
            document.querySelector('[data-tab="process"]').click();
            
            // 开始轮询状态
            startStatusPolling();
            
            showToast('检测到正在处理的任务，已恢复状态', 'info');
        }
    } catch (error) {
        console.error('Check initial status error:', error);
    }
}

// [lslsl3q 添加结束]

// ═══════════════════════════════════════════════════════════════
//  [lslsl3q 添加] 文件编辑器功能
// ═══════════════════════════════════════════════════════════════

async function openFileForEdit(bookName, filename) {
    // 检查是否有未保存的更改
    if (state.hasUnsavedChanges) {
        if (!confirm('当前文件有未保存的更改，是否放弃？')) {
            return;
        }
    }
    
    try {
        // 清除之前的选中状态
        document.querySelectorAll('.file-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        
        // [lslsl3q 修改] 使用 data 属性查找并添加选中状态
        const selectedItem = document.querySelector(`.file-item[data-filename="${cssEscape(filename)}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        // 显示加载状态
        elements.editorContent.style.display = 'flex';
        elements.editorPanel.querySelector('.editor-placeholder').style.display = 'none';
        elements.editorFilename.textContent = filename;
        elements.editorStatus.textContent = '正在加载...';
        elements.editorStatus.className = 'editor-status';
        elements.editorTextarea.value = '';
        elements.editorTextarea.disabled = true;
        
        // 获取文件内容
        const response = await fetch(`${API_BASE}/file/${encodeURIComponent(bookName)}/${encodeURIComponent(filename)}`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || '获取文件内容失败');
        }
        
        const data = await response.json();
        
        state.currentBookName = bookName;
        state.currentFileName = filename;
        state.hasUnsavedChanges = false;
        
        elements.editorTextarea.value = data.content;
        elements.editorTextarea.disabled = false;
        elements.editorStatus.textContent = `${formatBytes(data.size)} · ${formatDate(data.modified)}`;
        elements.editorStatus.className = 'editor-status';
        
    } catch (error) {
        elements.editorStatus.textContent = '加载失败: ' + error.message;
        elements.editorStatus.className = 'editor-status error';
        elements.editorTextarea.disabled = false;
        console.error('openFileForEdit error:', error);
    }
}

async function saveFileContent() {
    if (!state.currentBookName || !state.currentFileName) {
        showToast('没有打开的文件', 'error');
        return;
    }
    
    const content = elements.editorTextarea.value;
    
    try {
        elements.editorStatus.textContent = '正在保存...';
        elements.editorStatus.className = 'editor-status saving';
        
        const response = await fetch(
            `${API_BASE}/file/${encodeURIComponent(state.currentBookName)}/${encodeURIComponent(state.currentFileName)}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: content })
            }
        );
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '保存失败');
        }
        
        const data = await response.json();
        
        state.hasUnsavedChanges = false;
        elements.editorStatus.textContent = `已保存 · ${formatBytes(data.size)} · ${formatDate(data.modified)}`;
        elements.editorStatus.className = 'editor-status saved';
        
        showToast('文件已保存', 'success');
        
    } catch (error) {
        elements.editorStatus.textContent = '保存失败: ' + error.message;
        elements.editorStatus.className = 'editor-status error';
        showToast('保存失败: ' + error.message, 'error');
    }
}

function closeEditor() {
    if (state.hasUnsavedChanges) {
        if (!confirm('当前文件有未保存的更改，是否放弃？')) {
            return;
        }
    }
    
    state.currentFileName = '';
    state.hasUnsavedChanges = false;
    
    // 清除选中状态
    document.querySelectorAll('.file-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    
    elements.editorContent.style.display = 'none';
    elements.editorPanel.querySelector('.editor-placeholder').style.display = 'flex';
}

// 监听编辑器内容变化
document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('editorTextarea');
    if (textarea) {
        textarea.addEventListener('input', () => {
            state.hasUnsavedChanges = true;
            elements.editorStatus.textContent = '已修改 (未保存)';
            elements.editorStatus.className = 'editor-status';
        });
        
        // Ctrl+S 保存快捷键
        textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveFileContent();
            }
        });
    }
});

// ═══════════════════════════════════════════════════════════════
// [lslsl3q 添加] 主题切换功能
// ═══════════════════════════════════════════════════════════════

function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('theme') || 'light';
    
    // 应用保存的主题
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            // 添加过渡动画
            document.documentElement.style.transition = 'background-color 0.3s ease, color 0.3s ease';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            // 移除过渡（避免影响其他交互）
            setTimeout(() => {
                document.documentElement.style.transition = '';
            }, 300);
        });
    }
}

// 在页面加载时初始化主题
document.addEventListener('DOMContentLoaded', initTheme);

// [lslsl3q 添加结束]

// ═══════════════════════════════════════════════════════════════
// [lslsl3q 添加] 配置管理功能
// ═══════════════════════════════════════════════════════════════
// [lslsl3q 修改] 分离 LLM 配置和任务配置

// LLM 配置字段（设置页面）- 保存到 .env 文件
const LLM_CONFIG_FIELDS = [
    'api_key', 'base_url', 'model', 'max_context_tokens', 'summary_max_tokens', 'temperature'
];

// 任务配置字段（处理页面）- 每次处理时使用
const PROCESS_CONFIG_FIELDS = [
    'chunk_size', 'chunk_overlap', 'max_concurrency', 'rolling_context_max', 'file_encoding', 'output_dir'
];

// 加载 LLM 配置（设置页面）
async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/config`);
        const config = await response.json();
        
        // 填充 LLM 配置表单
        for (const key of LLM_CONFIG_FIELDS) {
            const input = document.getElementById(`config_${key}`);
            if (input && config[key]) {
                input.value = config[key].value;
            }
        }
    } catch (error) {
        console.error('Load config error:', error);
        showToast('加载配置失败', 'error');
    }
}

// 加载任务配置（处理页面）
async function loadProcessConfig() {
    try {
        const response = await fetch(`${API_BASE}/config`);
        const config = await response.json();
        
        // 填充任务配置表单
        for (const key of PROCESS_CONFIG_FIELDS) {
            const input = document.getElementById(`process_${key}`);
            if (input && config[key]) {
                input.value = config[key].value;
            }
        }
    } catch (error) {
        console.error('Load process config error:', error);
    }
}

// 保存 LLM 配置（设置页面）
async function saveConfig() {
    const config = {};
    
    // 收集 LLM 配置表单数据
    for (const key of LLM_CONFIG_FIELDS) {
        const input = document.getElementById(`config_${key}`);
        if (input) {
            let value = input.value;
            // 类型转换
            if (input.type === 'number') {
                value = parseFloat(value) || 0;
            }
            config[key] = value;
        }
    }
    
    try {
        const response = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ config: config })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('配置已保存', 'success');
        } else {
            showToast('保存失败: ' + (result.detail || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('Save config error:', error);
        showToast('保存配置失败', 'error');
    }
}

// 获取当前任务配置（处理页面）
function getProcessConfig() {
    const config = {};
    
    for (const key of PROCESS_CONFIG_FIELDS) {
        const input = document.getElementById(`process_${key}`);
        if (input) {
            let value = input.value;
            if (input.type === 'number') {
                value = parseFloat(value) || 0;
            }
            config[key] = value;
        }
    }
    
    return config;
}

// 在页面加载时加载配置
document.addEventListener('DOMContentLoaded', () => {
    // 延迟加载配置，确保DOM已准备好
    setTimeout(() => {
        loadConfig();
        loadProcessConfig();
    }, 100);
});

// [lslsl3q 添加] 模式切换
function selectMode(mode) {
    // 更新隐藏input的值
    document.getElementById('processMode').value = mode;
    
    // 更新按钮状态
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        }
    });
}

// [lslsl3q 添加] 折叠/展开配置区域
function toggleConfigSection(header) {
    const section = header.closest('.config-section');
    const content = section.querySelector('.config-group');
    
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        section.classList.add('expanded');
    } else {
        content.style.display = 'none';
        section.classList.remove('expanded');
    }
}

// [lslsl3q 添加] 切换密码显示/隐藏
function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.classList.add('showing');
    } else {
        input.type = 'password';
        button.classList.remove('showing');
    }
}

// ═══════════════════════════════════════════════════════════════
// [lslsl3q 添加] main.py 日志轮询
// ═══════════════════════════════════════════════════════════════

let logPollingInterval = null;

function startLogPolling() {
    if (logPollingInterval) {
        clearInterval(logPollingInterval);
    }
    
    logPollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/main-logs`);
            const data = await response.json();
            
            // 更新日志内容
            const logContent = document.getElementById('logContent');
            const logs = data.logs || [];
            logContent.textContent = logs.join('');
            
            // 自动滚动到底部
            logContent.scrollTop = logContent.scrollHeight;
            
            // 更新进度
            elements.progressFill.style.width = `${data.progress}%`;
            elements.progressPercent.textContent = `${data.progress}%`;
            elements.progressMessage.textContent = data.message;
            
            // [lslsl3q 添加] 处理输入等待状态
            const inputArea = document.getElementById('terminalInputArea');
            const inputPrompt = document.getElementById('inputPrompt');
            const terminalInput = document.getElementById('terminalInput');
            
            if (data.waiting_for_input) {
                inputArea.style.display = 'block';
                inputPrompt.textContent = data.input_prompt || '请输入：';
                terminalInput.focus();
                // 添加等待输入的视觉提示
                logContent.parentElement.classList.add('waiting');
            } else {
                inputArea.style.display = 'none';
                logContent.parentElement.classList.remove('waiting');
            }
            
            // 更新状态
            if (data.status === 'completed') {
                clearInterval(logPollingInterval);
                state.isProcessing = false;
                elements.startProcess.disabled = false;
                updateStatus('idle', '完成');
                showToast('处理完成！', 'success');
                inputArea.style.display = 'none';
                // 隐藏停止按钮
                document.getElementById('btnStopLog').style.display = 'none';
                
                // 切换到输出页面
                setTimeout(() => {
                    document.querySelector('[data-tab="output"]').click();
                }, 1000);
                
            } else if (data.status === 'error') {
                clearInterval(logPollingInterval);
                state.isProcessing = false;
                elements.startProcess.disabled = false;
                updateStatus('error', '错误');
                showToast('处理失败: ' + (data.error || '未知错误'), 'error');
                inputArea.style.display = 'none';
                // 隐藏停止按钮
                document.getElementById('btnStopLog').style.display = 'none';
            }
            
        } catch (error) {
            console.error('Log polling error:', error);
        }
    }, 300);  // 每 300ms 轮询一次，更快响应
}

async function sendTerminalInput() {
    const input = document.getElementById('terminalInput');
    const value = input.value.trim();
    
    if (!value) return;
    
    try {
        const response = await fetch(`${API_BASE}/main-input`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ input_text: value })
        });
        
        if (!response.ok) {
            const error = await response.json();
            showToast('发送失败: ' + (error.detail || '未知错误'), 'error');
            return;
        }
        
        // 清空输入框
        input.value = '';
        
    } catch (error) {
        showToast('发送失败: ' + error.message, 'error');
    }
}

// 监听终端输入框的回车键
document.addEventListener('DOMContentLoaded', () => {
    const terminalInput = document.getElementById('terminalInput');
    if (terminalInput) {
        terminalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendTerminalInput();
            }
        });
    }
});

async function stopMainProcess() {
    if (!state.isProcessing) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/stop-main`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (logPollingInterval) {
            clearInterval(logPollingInterval);
        }
        
        state.isProcessing = false;
        elements.startProcess.disabled = false;
        updateStatus('idle', '已停止');
        
        // 隐藏输入区域和停止按钮
        document.getElementById('terminalInputArea').style.display = 'none';
        document.getElementById('btnStopLog').style.display = 'none';
        
        showToast('已停止处理', 'info');
        
    } catch (error) {
        showToast('停止失败: ' + error.message, 'error');
    }
}

// [lslsl3q 添加结束]
