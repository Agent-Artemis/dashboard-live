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
    
    // Simple regex to find task items - this would need to be adjusted based on actual HTML structure
    const taskPattern = /<li[^>]*class="[^"]*task[^"]*"[^>]*>(.*?)<\/li>/gs;
    const matches = htmlContent.matchAll(taskPattern);
    
    for (const match of matches) {
        const taskHtml = match[1];
        const isCompleted = taskHtml.includes('completed') || taskHtml.includes('done') || taskHtml.includes('✓');
        
        if (isCompleted) {
            tasks.completed.push(match[0]);
        } else {
            tasks.active.push(match[0]);
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
    // This is a simplified update - would need to be customized based on actual dashboard structure
    const updatedContent = originalContent.replace(
        /<!-- TASKS_START -->.*?<!-- TASKS_END -->/s,
        `<!-- TASKS_START -->\n${activeTasks.join('\n')}\n<!-- TASKS_END -->`
    );
    
    // Add timestamp of last cleanup
    const timestamp = new Date().toISOString();
    const finalContent = updatedContent.replace(
        /<!-- LAST_CLEANUP -->.*?<!-- \/LAST_CLEANUP -->/s,
        `<!-- LAST_CLEANUP -->Last cleanup: ${timestamp}<!-- /LAST_CLEANUP -->`
    );
    
    fs.writeFileSync(DASHBOARD_FILE, finalContent);
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