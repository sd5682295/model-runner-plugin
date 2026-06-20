const http = require('http');

const MODELS = [
  'gpt-5.5',
  'claude-opus-4-7',
  'gemini-3.1-pro',
  'claude-opus-4-6',
  'claude-opus-4-6-thinking'
];

const MAX_RETRIES = 3;
const PROMPT = '请用中文回答：AI模型网关的3个常见坑是什么？简洁回答，200字以内。';

function chat(model, message, retries = 0) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是一个专业的AI助手。' },
        { role: 'user', content: message }
      ],
      temperature: 0.5,
      max_tokens: 500
    });

    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const r = JSON.parse(body);
            resolve({ ok: true, model, status: 200, content: r.choices[0].message.content, usage: r.usage });
          } catch(e) {
            reject({ ok: false, model, status: res.statusCode, error: 'parse_error', body });
          }
        } else {
          reject({ ok: false, model, status: res.statusCode, error: 'http_error', body });
        }
      });
    });

    req.on('error', e => reject({ ok: false, model, status: 0, error: e.message }));
    req.setTimeout(90000, () => { req.destroy(); reject({ ok: false, model, status: 0, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

async function run() {
  const fs = require('fs');
  let results = [];
  let finalContent = null;

  for (const model of MODELS) {
    let success = false;
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      const start = Date.now();
      try {
        process.stdout.write(`\n[${model}] Attempt ${retry + 1}/${MAX_RETRIES}... `);
        const result = await chat(model, PROMPT);
        const elapsed = Date.now() - start;
        console.log(`OK (${result.status}, ${elapsed}ms, tokens:${result.usage.total_tokens})`);
        results.push({ model, status: 'success', retries: retry + 1, elapsed, tokens: result.usage.total_tokens });
        finalContent = result.content;
        success = true;
        break;
      } catch(e) {
        const elapsed = Date.now() - start;
        console.log(`FAIL (${e.status}, retry:${retry + 1}, ${e.error})`);
        results.push({ model, status: 'failed', retries: retry + 1, error: e.error, statusCode: e.status });
        if (retry < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    if (success) break;
    console.log(`[${model}] All retries failed, moving to next model...`);
  }

  const summary = {
    timestamp: new Date().toISOString(),
    models_tried: results.length,
    final_model: results.find(r => r.status === 'success')?.model || 'NONE',
    results,
    final_content: finalContent
  };

  fs.writeFileSync('D:/work/model-runner/cascade_test_result.json', JSON.stringify(summary, null, 2), 'utf8');
  console.log('\nDone. Summary written to cascade_test_result.json');
  console.log('Final answer from:', summary.final_model);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
