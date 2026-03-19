#!/bin/bash

echo "========================================"
echo "  Excel 数据转换工具 v1.2"
echo "========================================"
echo

if [ -z "$1" ]; then
    echo "使用方式: ./start.sh \"源数据文件.xlsx\" \"目标模板文件.xlsx\""
    echo
    echo "或者直接运行，然后在浏览器中上传文件:"
    echo "  node transform_excel.js"
    echo
    exit 1
fi

if [ -z "$2" ]; then
    echo "错误: 请同时提供源数据文件和目标模板文件"
    echo "使用方式: ./start.sh \"源数据文件.xlsx\" \"目标模板文件.xlsx\""
    exit 1
fi

echo "源数据文件: $1"
echo "目标模板: $2"
echo
echo "正在启动服务..."
echo

node transform_excel.js "$1" "$2"
