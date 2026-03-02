/**
 * zCloak.ai 脚本公共工具
 *
 * 提供环境检测、参数解析、PoW 计算、文件哈希等通用功能。
 * 所有其他脚本依赖此模块。
 *
 * 注意: 此版本已移除所有 dfx CLI 和 shell 依赖，
 * 使用 @dfinity JS SDK 直接与 ICP canister 交互，
 * 使用 Node.js crypto 模块计算文件哈希。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

// ========== 环境管理 ==========

/**
 * 从命令行参数或环境变量中解析当前环境（prod 或 dev）
 * 优先级：--env=xxx > ZCLOAK_ENV > 默认 prod
 * @returns {'prod' | 'dev'}
 */
function getEnv() {
  // 从 argv 中查找 --env=xxx
  const envArg = process.argv.find(a => a.startsWith('--env='));
  if (envArg) {
    const val = envArg.split('=')[1];
    if (val === 'dev' || val === 'prod') return val;
    console.error(`警告: 未知环境 "${val}"，使用默认 prod`);
  }
  // 从环境变量中读取
  const envVar = process.env.ZCLOAK_ENV;
  if (envVar === 'dev' || envVar === 'prod') return envVar;
  return 'prod';
}

/**
 * 获取当前环境的 canister ID 配置
 * @returns {{ registry: string, signatures: string }}
 */
function getCanisterIds() {
  const env = getEnv();
  return config[env];
}

/**
 * 获取当前环境名称（用于日志输出）
 * @returns {string}
 */
function getEnvLabel() {
  return getEnv().toUpperCase();
}

// ========== PoW 计算 ==========

/**
 * 计算 PoW nonce
 * 找到一个 nonce 使得 sha256(base + nonce) 以指定数量的零开头
 * @param {string} base - base 字符串（通常是 latest sign event id）
 * @param {number} [zeros] - 前导零数量，默认使用 config.pow_zeros
 * @returns {{ nonce: number, hash: string, timeMs: number }}
 */
function computePow(base, zeros) {
  zeros = zeros || config.pow_zeros;
  const prefix = '0'.repeat(zeros);
  const start = Date.now();
  let nonce = 0;

  for (;;) {
    const candidate = base + nonce.toString();
    const hash = crypto.createHash('sha256').update(candidate).digest('hex');
    if (hash.startsWith(prefix)) {
      const timeMs = Date.now() - start;
      return { nonce, hash, timeMs };
    }
    nonce++;
  }
}

/**
 * 自动获取 PoW base 并计算 nonce
 * 完整的 PoW 流程封装：获取 base → 计算 nonce
 * 使用 @dfinity SDK Actor 直接调用 canister
 * @returns {Promise<{ nonce: number, hash: string, base: string }>}
 */
async function autoPoW() {
  // 延迟加载避免循环依赖（icAgent → utils → icAgent）
  const { getSignActor } = require('./icAgent');
  const { getPrincipalObj } = require('./identity');

  const principal = getPrincipalObj();
  const actor = await getSignActor();

  // 获取 PoW base（用户最新签名事件 ID）
  console.error('正在获取 PoW base...');
  const base = await actor.get_user_latest_sign_event_id(principal);

  if (!base || typeof base !== 'string') {
    console.error(`无法获取 PoW base: ${JSON.stringify(base)}`);
    process.exit(1);
  }

  // 计算 PoW nonce
  console.error(`正在计算 PoW (zeros=${config.pow_zeros})...`);
  const result = computePow(base, config.pow_zeros);
  console.error(`PoW 完成: nonce=${result.nonce}, 耗时 ${result.timeMs}ms`);

  return { nonce: result.nonce, hash: result.hash, base };
}

// ========== 命令行参数 ==========

/**
 * 解析命令行参数为结构化对象
 * 支持 --key=value 和 --flag 两种格式
 * 位置参数（非 -- 开头的）按顺序放入 _args 数组
 * @returns {{ _args: string[], [key: string]: string | boolean }}
 */
function parseArgs() {
  const result = { _args: [] };
  // 跳过 node 和脚本路径
  const argv = process.argv.slice(2);

  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx > 0) {
        result[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        result[arg.slice(2)] = true;
      }
    } else {
      result._args.push(arg);
    }
  }
  return result;
}

/**
 * 解析 --tags 参数为标签数组
 * 格式: "t:crypto,sub:web3,m:alice_id"
 * @param {string} tagsStr
 * @returns {string[][]}
 */
function parseTags(tagsStr) {
  if (!tagsStr) return [];
  return tagsStr.split(',').map(pair => {
    const parts = pair.split(':');
    if (parts.length < 2) {
      console.error(`标签格式错误: "${pair}"，应为 key:value`);
      process.exit(1);
    }
    return [parts[0], parts.slice(1).join(':')];
  });
}

// ========== 文件哈希与 MIME ==========

/**
 * 计算文件的 SHA256 哈希（纯 Node.js 实现，无 shell 依赖）
 * @param {string} filePath - 文件路径
 * @returns {string} 64 字符 hex 哈希值
 */
function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (err) {
    console.error(`计算文件哈希失败: ${filePath}`);
    console.error(err.message);
    process.exit(1);
  }
}

/**
 * 获取文件大小（字节）
 * @param {string} filePath
 * @returns {number}
 */
function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (err) {
    console.error(`获取文件大小失败: ${filePath}`);
    process.exit(1);
  }
}

/**
 * 常用 MIME 类型映射表
 * 根据文件扩展名返回对应 MIME 类型
 */
const MIME_MAP = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.py': 'text/x-python',
  '.rs': 'text/x-rust',
  '.wasm': 'application/wasm',
};

/**
 * 根据文件路径返回 MIME 类型
 * @param {string} filePath
 * @returns {string}
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

// ========== MANIFEST 生成 ==========

/**
 * 递归获取目录下所有文件（排除 MANIFEST.sha256、.git、node_modules）
 * @param {string} dir - 目录路径
 * @param {string} [prefix=''] - 路径前缀（用于递归）
 * @returns {string[]} 相对路径列表（已排序）
 */
function listFiles(dir, prefix) {
  prefix = prefix || '';
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    // 排除 MANIFEST.sha256、.git 和 node_modules
    if (entry.name === 'MANIFEST.sha256') continue;
    if (entry.name === '.git') continue;
    if (entry.name === 'node_modules') continue;

    if (entry.isDirectory()) {
      results.push(...listFiles(path.join(dir, entry.name), relativePath));
    } else if (entry.isFile()) {
      results.push(relativePath);
    }
  }

  return results.sort();
}

/**
 * 生成 MANIFEST.sha256 文件（含元数据头）
 * 格式兼容 GNU sha256sum，元数据用 # 注释行表示
 *
 * 此版本使用纯 Node.js 实现，不依赖 shell 命令。
 * author 字段通过 identity.js 获取，如果无法加载身份则留空。
 *
 * @param {string} folderPath - 目标文件夹路径
 * @param {object} [options]
 * @param {string} [options.version='1.0.0'] - 版本号
 * @returns {{ manifestPath: string, manifestHash: string, manifestSize: number, fileCount: number }}
 */
function generateManifest(folderPath, options) {
  options = options || {};
  const version = options.version || '1.0.0';
  const manifestPath = path.join(folderPath, 'MANIFEST.sha256');

  // 获取 author（当前 principal）
  let author = '';
  try {
    const { getPrincipal } = require('./identity');
    author = getPrincipal();
  } catch {
    console.error('警告: 无法获取 principal，author 字段留空');
  }

  // 构建元数据头
  const folderName = path.basename(path.resolve(folderPath));
  const dateStr = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const header = [
    `# skill: ${folderName}`,
    `# date: ${dateStr}`,
    `# version: ${version}`,
    `# author: ${author}`,
  ].join('\n');

  // 递归获取所有文件并计算哈希
  const files = listFiles(folderPath);
  const hashLines = files.map(relativePath => {
    const fullPath = path.join(folderPath, relativePath);
    const hash = hashFile(fullPath);
    // 兼容 sha256sum 输出格式: <hash>  ./<relative_path>
    return `${hash}  ./${relativePath}`;
  });

  // 写入 MANIFEST.sha256
  const content = header + '\n' + hashLines.join('\n') + '\n';
  fs.writeFileSync(manifestPath, content, 'utf-8');

  // 计算 MANIFEST 自身的哈希和大小
  const manifestHash = hashFile(manifestPath);
  const manifestSize = getFileSize(manifestPath);

  return { manifestPath, manifestHash, manifestSize, fileCount: files.length };
}

// ========== 输出格式化 ==========

/**
 * 格式化 SignEvent 对象为可读文本
 * Candid opt 类型在 JS 中表示为 [] | [value]
 * @param {object} event - SignEvent JS 对象
 * @returns {string}
 */
function formatSignEvent(event) {
  const lines = [];
  lines.push(`  id = "${event.id}"`);
  lines.push(`  kind = ${event.kind}`);
  lines.push(`  ai_id = "${event.ai_id}"`);
  lines.push(`  created_at = ${event.created_at}`);
  lines.push(`  content_hash = "${event.content_hash}"`);

  // 处理 opt counter — [] 表示 null，[n] 表示有值
  if (event.counter && event.counter.length > 0) {
    lines.push(`  counter = ${event.counter[0]}`);
  }

  // 处理 opt content
  if (event.content && event.content.length > 0) {
    lines.push(`  content = "${event.content[0]}"`);
  }

  // 处理 opt tags
  if (event.tags && event.tags.length > 0) {
    const tagsStr = event.tags[0]
      .map(t => `[${t.map(s => `"${s}"`).join(', ')}]`)
      .join(', ');
    lines.push(`  tags = [${tagsStr}]`);
  }

  return `record {\n${lines.join('\n')}\n}`;
}

/**
 * 格式化 SignEvent 数组
 * @param {object[]} events
 * @returns {string}
 */
function formatSignEvents(events) {
  if (!events || events.length === 0) {
    return '(vec {})';
  }
  return `(vec {\n${events.map(e => formatSignEvent(e)).join(';\n')}\n})`;
}

/**
 * 格式化 agent_sign 的返回值（Ok/Err variant）
 * @param {object} result - { Ok: SignEvent } | { Err: string }
 * @returns {string}
 */
function formatSignResult(result) {
  if ('Ok' in result) {
    return `(variant { Ok = ${formatSignEvent(result.Ok)} })`;
  }
  if ('Err' in result) {
    return `(variant { Err = "${result.Err}" })`;
  }
  return JSON.stringify(result, null, 2);
}

/**
 * 格式化 opt text 类型
 * @param {[] | [string]} optText
 * @returns {string}
 */
function formatOptText(optText) {
  if (optText && optText.length > 0) {
    return `(opt "${optText[0]}")`;
  }
  return '(null)';
}

module.exports = {
  getEnv,
  getCanisterIds,
  getEnvLabel,
  computePow,
  autoPoW,
  parseArgs,
  parseTags,
  hashFile,
  getFileSize,
  getMimeType,
  listFiles,
  generateManifest,
  formatSignEvent,
  formatSignEvents,
  formatSignResult,
  formatOptText,
};
