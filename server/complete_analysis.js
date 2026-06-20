const http = require('http');
const fs = require('fs');

// 分析任务：完备分析 model-runner 还缺少什么，以及 OpenClaw 使用时会忘记什么
const ANALYSIS_PROMPT = `你是一个AI基础设施专家。请深度分析以下问题：

【背景】
我有一个自建的本地AI模型中间件(model-runner)：
- 技术栈：Node.js 原生（无npm依赖），纯 http 模块
- 已有功能：API配置、流式/非流式聊天、会话管理、多会话存储、Prompt模板库、多API源配置后端、多Key轮换后端、请求日志后端(/logs)、成本统计后端(/stats)
- 缺失：前端管理界面、成本可视化面板、模型对比、图片上传、多租户/配额管理、Key前端管理
- 当前模型：31个(Claude/GPT/DeepSeek/Kimi/Qwen/Gemini等)

【请回答以下全部问题】

1. 【功能缺口分析】
   从以下功能列表中，挑选出真正有价值的扩展功能（排除伪需求），给出优先级TOP5：
   - Web管理界面（用户/API Key管理）
   - 成本统计可视化面板
   - 模型对比（并排显示）
   - 图片上传/多模态
   - 多租户+配额控制
   - API Key分组+权限管理
   - Prompt模板版本管理
   - 异常告警（成本/错误率/延迟）
   - Webhook/callback通知
   - 使用量导出（CSV/Excel）
   - 对话导出（Markdown/PDF）
   - OpenAI兼容SDK自动发现
   - 模型健康检查+自动剔除
   - 请说明为什么这些有价值，为什么其他没选

2. 【OpenClaw集成的坑】
   当OpenClaw（AI助手框架）通过HTTP API调用这个model-runner时，常见的10个错误/遗忘点是什么？
   例如：忘记服务没启动、端口冲突、API格式不对、超时不处理、Key没配、不会看日志、stream解析错误等。
   请具体描述每个问题的表现+原因+解决方案。

3. 【模型选择健忘问题】
   OpenClaw在调用model-runner时，有哪些"模型相关"的坑？
   例如：模型名写错、模型不支持某个参数、模型被下线了不知道、Token计算不准等。

4. 【工程最佳实践建议】
   针对这个纯Node.js无依赖的项目，在生产环境中：
   - 应该加哪些日志/监控？
   - 应该加哪些健康检查端点？
   - 应该加哪些配置项？
   - 有哪些Node.js特有的坑要注意？

请用中文详细回答，尽量分点，每个问题都要回答完整。用2000字以上回答全部4个问题。`;

function chat(model, messages, maxTokens = 4000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.5 });
    const options = {
      hostname: 'localhost', port: 4000, path: '/chat', method: 'POST',
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
          } catch(e) { reject({ ok: false, model, status: res.statusCode, error: 'parse_error' }); }
        } else { reject({ ok: false, model, status: res.statusCode, error: 'http_error' }); }
      });
    });
    req.on('error', e => reject({ ok: false, model, status: 0, error: e.message }));
    req.setTimeout(180000, () => { req.destroy(); reject({ ok: false, model, status: 0, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

function isRetryable(err) {
  return [500, 502, 503, 504, 429].includes(err.status) || ['timeout', 'ECONNREFUSED', 'ECONNRESET'].includes(err.error);
}

async function cascade(messages, models, maxRetries = 3, maxTokens = 4000) {
  for (const model of models) {
    for (let retry = 0; retry < maxRetries; retry++) {
      process.stdout.write(`  [${model}] ${retry === 0 ? '' : `重试${retry}/`}... `);
      try {
        const result = await chat(model, messages, maxTokens);
        console.log(`✅ (${result.status}, ${result.usage.total_tokens}tokens)`);
        return result;
      } catch(e) {
        console.log(`❌ (${e.status}, ${e.error})`);
        if (isRetryable(e) && retry < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 3000));
        } else { break; }
      }
    }
  }
  throw new Error('All models failed');
}

const MODELS = ['gpt-5.5', 'claude-opus-4-7', 'gemini-3.1-pro', 'claude-opus-4-6', 'claude-opus-4-6-thinking'];

async function main() {
  console.log('🎯 完备分析 model-runner 功能缺口 + OpenClaw 集成坑\n');
  console.log(`📋 使用模型链: ${MODELS.join(' → ')}\n`);

  const messages = [
    { role: 'system', content: '你是一个AI基础设施专家。用中文详细回答所有问题。' },
    { role: 'user', content: ANALYSIS_PROMPT }
  ];

  const start = Date.now();
  try {
    const result = await cascade(messages, MODELS);
    const elapsed = Date.now() - start;
    console.log(`\n✅ 成功！模型: ${result.model} | ${elapsed}ms | ${result.usage.total_tokens}tokens`);
    fs.writeFileSync('D:/work/model-runner/complete_analysis.txt', result.content, 'utf8');
    console.log('\n📄 内容已保存到 complete_analysis.txt');
  } catch(e) {
    console.error('\n❌ 全部模型失败:', e.message);
    process.exit(1);
  }
}

main();
