/**
 * cascade_chat.js — 模型级联重试调用脚本
 * 
 * 用法：
 *   node cascade_chat.js "问题内容"
 *   node cascade_chat.js --model gpt-5.5 "指定模型"
 *   node cascade_chat.js --system "你是..." "问题"
 *   node cascade_chat.js --retry 2 "自定义重试次数"
 *   node cascade_chat.js --file input.txt
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ============ 配置区 ============
const CASCADE_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'gpt-5.5'
];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const TIMEOUT_MS = 120000;
const BASE_URL = { hostname: 'localhost', port: 4000 };
// ================================

// 解析命令行参数
function parseArgs(argv) {
  const args = { prompt: null, system: null, model: null, retry: MAX_RETRIES, file: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model' && argv[i + 1]) args.model = argv[++i];
    else if (a === '--system' && argv[i + 1]) args.system = argv[++i];
    else if (a === '--retry' && argv[i + 1]) args.retry = parseInt(argv[++i]);
    else if (a === '--file' && argv[i + 1]) args.file = argv[++i];
    else if (!a.startsWith('--')) args.prompt = a;
  }
  return args;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function chat(model, messages, maxTokens = 4096) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 });
    const options = {
      ...BASE_URL,
      path: '/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const r = JSON.parse(body);
            resolve({ ok: true, status: 200, content: r.choices[0].message.content, usage: r.usage, model });
          } catch(e) {
            reject({ ok: false, model, status: res.statusCode, error: 'parse_error', body: body.slice(0, 200) });
          }
        } else {
          reject({ ok: false, model, status: res.statusCode, error: 'http_error', body: body.slice(0, 200) });
        }
      });
    });

    req.on('error', e => reject({ ok: false, model, status: 0, error: e.message }));
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); reject({ ok: false, model, status: 0, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

function isRetryable(err) {
  // 500/502/503/504/网络错误/超时 → 可重试
  return [500, 502, 503, 504].includes(err.status) || ['timeout', 'ECONNREFUSED', 'ECONNRESET'].includes(err.error);
}

async function cascadeCall(prompt, systemPrompt = null, singleModel = null, maxRetries = MAX_RETRIES) {
  const models = singleModel ? [singleModel] : CASCADE_MODELS;
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt }
  ];

  const log = [];
  let finalResult = null;

  for (const model of models) {
    for (let retry = 0; retry < maxRetries; retry++) {
      const ts = Date.now();
      process.stdout.write(`  [${model}] ${retry === 0 ? '' : `重试${retry}/`}请求中... `);
      try {
        const result = await chat(model, messages);
        const elapsed = Date.now() - ts;
        console.log(`✅ (${result.status}, ${elapsed}ms, ${result.usage.total_tokens}tokens)`);
        log.push({ model, retry: retry + 1, elapsed, status: 'success', tokens: result.usage.total_tokens });
        finalResult = result;
        return { success: true, model, content: result.content, usage: result.usage, elapsed, log };
      } catch(e) {
        const elapsed = Date.now() - ts;
        if (isRetryable(e) && retry < maxRetries - 1) {
          console.log(`❌ (${e.status}, ${e.error}) ${RETRY_DELAY_MS/1000}s后重试...`);
          log.push({ model, retry: retry + 1, elapsed, status: 'retry', error: e.error, statusCode: e.status });
          await sleep(RETRY_DELAY_MS);
        } else {
          console.log(`❌ 终止 (${e.status}, ${e.error})`);
          log.push({ model, retry: retry + 1, elapsed, status: 'failed', error: e.error, statusCode: e.status });
          break; // 退出重试循环，尝试下一个模型
        }
      }
    }
  }

  return { success: false, content: null, log };
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.prompt && !args.file) {
    console.log('用法: node cascade_chat.js [选项] "问题"\n');
    console.log('选项:');
    console.log('  --model MODEL    指定单一模型（跳过级联）');
    console.log('  --system "TEXT"  设置 system prompt');
    console.log('  --retry N        重试次数（默认3）');
    console.log('  --file PATH      从文件读取问题');
    console.log('\n模型链: claude-opus-4-7 → claude-sonnet-4-6 → gpt-5.5');
    console.log('平台链由 server.js 的 modelRoutes 控制：preferredPlatforms 优先，disabledPlatforms 禁用');
    process.exit(1);
  }

  const prompt = args.file
    ? fs.readFileSync(args.file, 'utf8').trim()
    : args.prompt;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 模型级联调用');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📝 问题: ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`);
  if (args.system) console.log(`⚙️  System: ${args.system.slice(0, 60)}...`);
  console.log(`🔗  模型链: ${args.model || CASCADE_MODELS.join(' → ')}`);
  console.log('🏷️  平台链: 由 modelRoutes.preferredPlatforms / disabledPlatforms 控制');
  console.log(`🔄  重试: ${args.retry}次/模型`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const start = Date.now();
  const result = await cascadeCall(prompt, args.system, args.model, args.retry);
  const totalMs = Date.now() - start;

  if (result.success) {
    console.log(`\n✅ 成功！模型: ${result.model} | 耗时: ${totalMs}ms | Tokens: ${result.usage.total_tokens}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📄 回复内容:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(result.content);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 可选：保存结果
    // fs.writeFileSync('cascade_output.txt', result.content, 'utf8');
  } else {
    console.log(`\n❌ 所有模型均失败 (${totalMs}ms)`);
    console.log('📋 尝试记录:');
    result.log.forEach(l => {
      const icon = l.status === 'success' ? '✅' : l.status === 'retry' ? '🔁' : '❌';
      console.log(`  ${icon} ${l.model} (${l.status})`);
    });
    process.exit(1);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
