const { startWebServer, cleanup } = require('./server');
const { closeReadline } = require('./utils');

console.log('================================================================================');
console.log('Excel Data Transformer - 通用智能转换工具');
console.log('================================================================================');

async function main() {
    console.log('\n启动Web界面...\n');
    
    try {
        const result = await startWebServer();
        
        if (result && result.cancelled) {
            console.log('\n用户已取消转换。');
        } else if (result && result.success) {
            console.log('\n================================================================================');
            console.log('转换完成！');
            console.log('================================================================================');
            console.log(`  输出文件: ${result.outputFile}`);
            console.log(`  文件大小: ${result.fileSize}`);
            console.log(`  数据行数: ${result.dataRowCount}`);
        }
    } catch (error) {
        console.log('\n发生错误:', error.message);
    }
    
    cleanup();
    closeReadline();
}

main().catch(err => {
    console.error('发生错误:', err);
    closeReadline();
});
