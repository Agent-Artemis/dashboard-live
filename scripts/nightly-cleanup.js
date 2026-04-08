#!/usr/bin/env node

/**
 * Nightly Dashboard Cleanup Script
 * - Archives completed tasks
 * - Updates dashboard with fresh active tasks
 * - Commits changes to git
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DASHBOARD_DIR = path.join(__dirname, '..');
const DASHBOARD_FILE = path.join(DASHBOARD_DIR, 'index.html');
const ARCHIVE_DIR = path.join(DASHBOARD_DIR, 'archive');

function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

function ensureArchiveDir() {
    if (!fs.existsSync(ARCHIVE_DIR)) {
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
        log('Created archive directory');
    }
}

function readDashboard() {
    if (!fs.existsSync(DASHBOARD_FILE)) {
        log('Dashboard file not found, skipping cleanup');
        return null;
    }
    return fs.readFileSync(DASHBOARD_FILE, 'utf8');
}

function extractTasks(htmlContent) {
    const tasks = {
        completed: [],
        active: []
    };
    
    // Extract task divs from the dashboard structure
    const taskPattern = /<div class="flex items-center gap-3 p-3[^>]*">[\s\S]*?<\/div>/g;
    const matches = htmlContent.matchAll(taskPattern);
    
    for (const match of matches) {
        const taskHtml = match[0];
        
        // Check if task is completed based on various indicators
        const isCompleted = taskHtml.includes('completed') || 
                          taskHtml.includes('Done') || 
                          taskHtml.includes('✓') || 
                          taskHtml.includes('line-through') || 
                          taskHtml.includes('opacity-60');
        
        if (isCompleted) {
            tasks.completed.push(taskHtml);
        } else {
            tasks.active.push(taskHtml);
        }
    }
    
    return tasks;
}

function archiveCompletedTasks(completedTasks) {
    if (completedTasks.length === 0) {
        log('No completed tasks to archive');
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const archiveFile = path.join(ARCHIVE_DIR, `completed-${today}.html`);
    
    const archiveContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Archived Tasks - ${today}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .task { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
        .archived { opacity: 0.7; }
    </style>
</head>
<body>
    <h1>Completed Tasks - ${today}</h1>
    <div class="tasks">
        ${completedTasks.map(task => `<div class="task archived">${task}</div>`).join('\n')}
    </div>
</body>
</html>
    `.trim();
    
    fs.writeFileSync(archiveFile, archiveContent);
    log(`Archived ${completedTasks.length} completed tasks to ${archiveFile}`);
}

function updateDashboard(originalContent, activeTasks) {
    // Rebuild the task section with only active tasks
    const taskSectionStart = '                    <div class="space-y-3">';
    const taskSectionEnd = '                    </div>';
    
    const activeTasksHtml = activeTasks.map(task => 
        '                        ' + task
    ).join('\n\n');
    
    const newTasksSection = `<!-- TASKS_START -->\n${taskSectionStart}\n${activeTasksHtml}\n${taskSectionEnd}\n                    <!-- TASKS_END -->`;
    
    const updatedContent = originalContent.replace(
        /<!-- TASKS_START -->.*?<!-- TASKS_END -->/s,
        newTasksSection
    );
    
    // Add timestamp of last cleanup
    const timestamp = new Date().toISOString();
    const finalContent = updatedContent.replace(
        /<!-- LAST_CLEANUP -->.*?<!-- \/LAST_CLEANUP -->/s,
        `<!-- LAST_CLEANUP -->Last cleanup: ${timestamp}<!-- /LAST_CLEANUP -->`
    );
    
    // Update task count
    const taskCountText = `${activeTasks.length} active task${activeTasks.length !== 1 ? 's' : ''}`;
    const finalContentWithCount = finalContent.replace(
        /\d+ active tasks?/,
        taskCountText
    );
    
    fs.writeFileSync(DASHBOARD_FILE, finalContentWithCount);
    log('Updated dashboard with active tasks only');
}

function commitChanges() {
    try {
        // Check if we're in a git repository
        execSync('git status', { cwd: DASHBOARD_DIR, stdio: 'pipe' });
        
        // Add all changes
        execSync('git add .', { cwd: DASHBOARD_DIR });
        
        // Check if there are changes to commit
        const status = execSync('git status --porcelain', { cwd: DASHBOARD_DIR, encoding: 'utf8' });
        
        if (status.trim()) {
            const timestamp = new Date().toISOString();
            execSync(`git commit -m "Nightly cleanup: archived completed tasks - ${timestamp}"`, { cwd: DASHBOARD_DIR });
            log('Committed changes to git');
        } else {
            log('No changes to commit');
        }
    } catch (error) {
        log(`Git operations failed: ${error.message}`);
    }
}

function main() {
    log('Starting nightly dashboard cleanup');
    
    try {
        ensureArchiveDir();
        
        const dashboardContent = readDashboard();
        if (!dashboardContent) {
            return;
        }
        
        const tasks = extractTasks(dashboardContent);
        
        if (tasks.completed.length > 0) {
            archiveCompletedTasks(tasks.completed);
            updateDashboard(dashboardContent, tasks.active);
            commitChanges();
        } else {
            log('No completed tasks found, dashboard is already clean');
        }
        
        log('Nightly cleanup completed successfully');
    } catch (error) {
        log(`Error during cleanup: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };