const http = require('http');
const fs = require('fs');

const payload = {
  model: 'deepseek-v4-flash',
  messages: [
    {role: 'system', content: '你是AI基础设施专家。用中文回答，简洁清晰。'},
    {role: 'user', content: `场景：自建AI模型中间件(model-runner)，本地proxy，支持OpenAI兼容API，已接入31个模型(Claude/GPT/DeepSeek/Kimi/Qwen等)。

已有功能：API配置、流式/非流式聊天、会话管理、Prompt模板库、多API源配置后端、请求日志后端、成本统计后端。

缺失：前端管理界面、多Key轮换前端、成本统计面板、模型对比、图片上传、多租户管理。

请回答：

【问题1 - 生产环境3大坑】
从以下选3个最致命的，详细分析：
- Token计算不准（原因+后果+应对）
- 流式输出格式兼容（原因+后果+应对）
- 多厂商API格式差异（原因+后果+应对）
- API Key泄露（原因+后果+应对）
- 成本统计错误（原因+后果+应对）
- 限流策略失效（原因+后果+应对）

【问题2 - 功能优先级TOP3】
从以下功能选最值得优先加的3个，给出理由：
- 多API源+Key自动轮换（含前端）
- 请求日志与成本统计面板（前端可视化）
- 模型对比（并排显示）
- 图片上传/多模态支持
- Web管理界面（用户/API Key管理）
- Prompt模板库（已有后端，缺前端）
- callback回调通知
- 多租户/配额控制

【问题3 - model-runner下一步建议】
基于已有功能，给出3条具体行动计划。
`}
  ],
  temperature: 0.7,
  max_tokens: 3000
};

const data = JSON.stringify(payload);
const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (d) => { body += d; });
  res.on('end', () => {
    try {
      const r = JSON.parse(body);
      const content = r.choices[0].message.content;
      fs.writeFileSync('D:/work/model-runner/analysis_final.txt', content, 'utf8');
      console.log('DONE: written to analysis_final.txt, length=' + content.length);
    } catch(e) {
      fs.writeFileSync('D:/work/model-runner/analysis_final.txt', 'PARSE_ERROR: ' + body);
      console.log('ERROR: ' + e.message);
    }
  });
});

req.on('error', (e) => {
  fs.writeFileSync('D:/work/model-runner/analysis_final.txt', 'REQ_ERROR: ' + e.message);
  console.log('REQ_ERROR: ' + e.message);
});

req.write(data);
req.end();
