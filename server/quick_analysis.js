const http = require('http');
const fs = require('fs');

const prompt = `你是AI基础设施专家。用中文简短回答以下4个问题，每个问题3-5句话：

1. model-runner还缺什么功能？从不列表选出最值得加的3个：Web管理界面、成本可视化面板、模型对比、图片上传、多租户配额、API Key管理、Prompt版本管理、异常告警、对话导出。

2. OpenClaw调用model-runner时，10个常见错误是什么？（如服务没启动/端口错/超时/Key没配/格式错/stream解析错/日志不看等）

3. OpenClaw调用时会忘的5件事是什么？（如忘记看日志/忘记检查服务状态/忘记API格式/忘记timeout/忘记看stats等）

4. model-runner的生产环境最佳实践：Node.js无依赖项目应该加哪些日志/监控/健康检查？

直接回答，不要列提纲。`;

function chat(model, msgs, maxTokens = 3000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model, messages: msgs, max_tokens: maxTokens, temperature: 0.5 });
    const options = {
      hostname: 'localhost', port: 4000, path: '/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = http.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const r = JSON.parse(body);
            resolve({ ok: true, content: r.choices[0].message.content, usage: r.usage });
          } catch(e) { reject({ ok: false, error: e.message }); }
        } else { reject({ ok: false, status: res.statusCode, error: body.slice(0, 200) }); }
      });
    });
    req.on('error', e => reject({ ok: false, error: e.message }));
    req.setTimeout(90000, () => { req.destroy(); reject({ ok: false, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

async function main() {
  const models = ['gpt-5.4-mini', 'deepseek-v4-flash', 'claude-opus-4-6', 'gemini-3.1-pro'];
  const msgs = [
    { role: 'system', content: '你是一个专业的AI基础设施专家。简洁直接，用中文回答。' },
    { role: 'user', content: prompt }
  ];

  for (const model of models) {
    process.stdout.write(`[${model}] 请求中... `);
    try {
      const start = Date.now();
      const r = await chat(model, msgs);
      console.log(`✅ (${r.usage.total_tokens}tokens, ${Date.now()-start}ms)`);
      fs.writeFileSync('D:/work/model-runner/final_analysis.txt', r.content, 'utf8');
      console.log('\n已保存到 final_analysis.txt');
      console.log('\n========== 分析结果 ==========\n');
      console.log(r.content);
      return;
    } catch(e) {
      console.log(`❌ ${e.error || e.status}`);
      if (e.status && ![500,502,503,504,429].includes(e.status)) break;
    }
  }
  console.log('全部失败');
}

main();
