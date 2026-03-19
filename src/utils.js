const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            resolve(answer.trim());
        });
    });
}

function cleanup(tempFiles) {
    tempFiles.forEach(filePath => {
        if (filePath && fs.existsSync(filePath) && filePath.includes('temp_')) {
            try {
                fs.unlinkSync(filePath);
            } catch (e) {}
        }
    });
}

function closeReadline() {
    rl.close();
}

module.exports = {
    question,
    cleanup,
    closeReadline
};
