module.exports = {
    server: {
        port: 3456,
        cors: {
            allowOrigin: process.env.ALLOWED_ORIGINS || 'http://localhost:3456',
            allowMethods: 'GET, POST, OPTIONS',
            allowHeaders: 'Content-Type, Authorization'
        }
    },
    
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        logDir: 'logs',
        enableFileLog: true,
        enableConsole: true
    },
    
    file: {
        upload: {
            maxSize: 100 * 1024 * 1024,
            allowedExtensions: ['.xlsx', '.xls'],
            tempPrefix: 'temp_',
            outputSuffix: '_转换结果'
        }
    },
    
    excel: {
        headerKeywords: ['姓名', '证件', '手机', '电话', '金额', '编号', '序号', '日期', '类型', '名称', '备注', '企业', '个人', '缴费'],
        nameColumnKeywords: ['姓名', '名字', 'name'],
        columnKeywords: ['序号', '姓名', '证件', '金额', '类型', '企业', '个人', '缴费', '编号', '税', 'xh', 'grxm'],
        titleKeywords: ['清单', '表', '单', '编号', 'BOC'],
        endKeywords: ['结束', '说明'],
        totalKeywords: ['合计', '总计', '小计'],
        requiredFieldMarker: '*'
    },
    
    mapping: {
        autoGenKeywords: ['序号', 'xh'],
        calcKeywords: ['合计', '总额', 'total', 'sum', '='],
        minMatchScore: 30,
        highConfidenceScore: 80,
        mediumConfidenceScore: 50,
        semanticMappings: [
            { target: ['序号', '编号', 'xh'], source: ['序号', '编号', 'no', 'id'] },
            { target: ['个人姓名', '姓名', '名字', 'grxm'], source: ['姓名', '名字', 'name', '员工姓名', '人员姓名'] },
            { target: ['证件类型', 'zjlx'], source: ['证件类型', '证件', '证件名称', 'id_type', '身份证件类型'] },
            { target: ['证件编号', '证件号码', 'zjbh'], source: ['证件号码', '证件号', '身份证号', '身份证号码', '证件编号', 'id_no'] },
            { target: ['企业缴费金额', 'qyjfje'], source: ['企业缴费金额', '企业缴费', '企业基本缴费'] },
            { target: ['企业缴费未超出免税部分', 'qywsje'], source: ['企业基本缴费未完税', '企业缴费未完税', '企业缴费未超出免税'] },
            { target: ['企业缴费超出免税部分', 'qyysje'], source: ['企业基本缴费已完税', '企业缴费已完税', '企业缴费超出免税', '商保企业缴费已完税', '商保企业缴费未完税'] },
            { target: ['个人缴费金额', 'grjfje'], source: ['个人缴费金额', '个人缴费', '个人基本缴费'] },
            { target: ['个人缴费未超出免税部分', 'grwsje'], source: ['个人未完税缴费', '个人缴费未完税', '个人缴费未超出免税'] },
            { target: ['个人缴费超出免税部分', 'grysje'], source: ['个人已完税缴费', '个人缴费已完税', '个人缴费超出免税', '商保个人缴费已完税', '商保个人缴费未完税'] },
            { target: ['缴费金额合计', 'jfjejh'], source: ['缴费金额合计', '缴费合计', '合计金额'] },
            { target: ['企业计划编号', 'qyjhbh'], source: ['企业计划编号', '计划编号'] },
            { target: ['纳税总额', 'nszje'], source: ['纳税总额', '纳税金额', '税费合计'] },
            { target: ['企业缴费纳税金额', 'qyse'], source: ['企业缴费纳税', '企业纳税金额'] },
            { target: ['个人缴费纳税金额', 'grse'], source: ['个人缴费纳税', '个人纳税金额'] },
            { target: ['联系电话', '手机', '电话'], source: ['手机', '手机号', '手机号码', '联系电话', '电话', 'mobile', 'phone'] },
            { target: ['性别'], source: ['性别', 'gender', 'sex'] },
            { target: ['出生日期', '生日'], source: ['出生日期', '生日', 'birthday', 'birth_date'] },
            { target: ['备注'], source: ['备注', '说明', 'remark', 'note', '备注信息'] },
            { target: ['企业名称', '公司'], source: ['企业名称', '公司', '公司名称', 'company', '单位名称'] },
            { target: ['部门'], source: ['部门', '部门名称', 'department', 'dept'] }
        ]
    },
    
    transform: {
        sampleDataRows: 5,
        stringOperations: ['substring', 'replace', 'trim', 'uppercase', 'lowercase'],
        numberOperations: ['round', 'floor', 'ceil', 'fixed'],
        dateFormats: ['YYYY-MM-DD', 'YYYY/MM/DD', 'YYYYMMDD', 'HH:mm:ss']
    }
};
