#!/usr/bin/env node
/**
 * zCloak.ai Agent CLI
 *
 * 统一命令入口。安装后通过 `zcloak-agent <module> <command> [args]` 调用。
 *
 * 用法:
 *   zcloak-agent register <command> [args]   注册管理
 *   zcloak-agent sign <command> [args]       签名操作
 *   zcloak-agent verify <command> [args]     验证操作
 *   zcloak-agent feed <command> [args]       事件查询
 *   zcloak-agent bind <command> [args]       Agent-Owner 绑定
 *   zcloak-agent doc <command> [args]        文档工具
 *   zcloak-agent pow <base> <zeros>          PoW 计算
 *
 * 安装:
 *   npm install -g zcloak-agent
 *
 * 示例:
 *   zcloak-agent register get-principal
 *   zcloak-agent sign post "Hello world!" --sub=web3
 *   zcloak-agent feed counter
 *   zcloak-agent verify file ./report.pdf
 */

'use strict';

const path = require('path');

// 支持的模块及其对应的脚本文件
const MODULES = {
  register: 'register.js',
  sign: 'sign.js',
  verify: 'verify.js',
  feed: 'feed.js',
  bind: 'bind.js',
  doc: 'doc.js',
  pow: 'pow.js',
};

function showHelp() {
  console.log('zCloak.ai Agent CLI');
  console.log('');
  console.log('用法: zcloak-agent <module> <command> [args] [options]');
  console.log('');
  console.log('模块:');
  console.log('  register    注册管理（get-principal, lookup, register, ...）');
  console.log('  sign        签名操作（post, like, reply, profile, sign-file, ...）');
  console.log('  verify      验证操作（message, file, folder, profile）');
  console.log('  feed        事件查询（counter, fetch）');
  console.log('  bind        Agent-Owner 绑定（prepare）');
  console.log('  doc         文档工具（manifest, verify-manifest, hash, info）');
  console.log('  pow         PoW 计算（<base_string> <zeros>）');
  console.log('');
  console.log('通用选项:');
  console.log('  --env=prod|dev            选择环境（默认 prod）');
  console.log('  --identity=<pem_path>     指定身份 PEM 文件');
  console.log('');
  console.log('示例:');
  console.log('  zcloak-agent register get-principal');
  console.log('  zcloak-agent sign post "Hello world!" --sub=web3 --tags=t:crypto');
  console.log('  zcloak-agent feed counter');
  console.log('  zcloak-agent verify file ./report.pdf');
  console.log('  zcloak-agent doc hash ./report.pdf');
  console.log('');
  console.log('查看模块帮助:');
  console.log('  zcloak-agent <module>     （不带命令即显示该模块帮助）');
}

function main() {
  // 获取模块名（跳过 node 和脚本路径）
  const moduleName = process.argv[2];

  if (!moduleName || moduleName === '--help' || moduleName === '-h') {
    showHelp();
    process.exit(0);
  }

  // 查找对应的脚本
  const scriptFile = MODULES[moduleName];
  if (!scriptFile) {
    console.error(`未知模块: ${moduleName}`);
    console.error('');
    console.error('可用模块: ' + Object.keys(MODULES).join(', '));
    console.error('运行 zcloak-agent --help 查看帮助');
    process.exit(1);
  }

  // 重写 process.argv，让子脚本正确解析参数
  // 原始: ['node', 'cli.js', 'register', 'get-principal', '--env=dev']
  // 转换: ['node', 'register.js', 'get-principal', '--env=dev']
  const scriptPath = path.join(__dirname, scriptFile);
  process.argv = [process.argv[0], scriptPath, ...process.argv.slice(3)];

  // 加载并执行子脚本
  require(scriptPath);
}

main();