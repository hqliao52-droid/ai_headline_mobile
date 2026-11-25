#!/usr/bin/env node
/**
 * 后端连通性自检：一条命令判断“登录/接口失败”是前端问题，还是服务器/网络问题。
 *
 * 依次检查：
 *   1. TCP 能否连上 config/server.config.js 里的 host:port（对应浏览器的 net::ERR_CONNECTION_REFUSED）
 *   2. GET /health 是否正常
 *   3. 用 H5 页面同源（默认 http://localhost:8081）做一次 CORS 预检
 *   4. POST /user/login（假账号），确认接口逻辑可达
 *
 * 用法：
 *   node scripts/check-backend.js
 *   node scripts/check-backend.js --origin=http://localhost:8081 --timeout=8000
 *
 * 退出码：0 = 后端当前可用；1 = 存在硬性失败（连不上 / 健康检查失败）。
 */
const http = require('http');
const https = require('https');
const net = require('net');
const serverConfig = require('../config/server.config.js');

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_ORIGIN = 'http://localhost:8081'; // manifest.json 的 h5.devServer.port

function parseArgs(argv) {
    const options = { origin: DEFAULT_ORIGIN, timeout: DEFAULT_TIMEOUT };
    for (const arg of argv) {
        if (arg.startsWith('--origin=')) {
            options.origin = arg.slice('--origin='.length) || DEFAULT_ORIGIN;
        } else if (arg.startsWith('--timeout=')) {
            const value = Number(arg.slice('--timeout='.length));
            if (Number.isFinite(value) && value > 0) options.timeout = value;
        }
    }
    return options;
}

function tcpProbe(host, port, timeout) {
    return new Promise(resolve => {
        const startedAt = Date.now();
        const socket = net.connect({ host, port });
        socket.setTimeout(timeout);

        const done = result => {
            socket.destroy();
            resolve({ ...result, elapsed: Date.now() - startedAt });
        };

        socket.once('connect', () => done({ ok: true }));
        socket.once('timeout', () => done({
            ok: false,
            reason: `${timeout}ms 内没有建立 TCP 连接（多为防火墙丢包或服务器宕机）`,
        }));
        socket.once('error', error => done({
            ok: false,
            reason: `${error.code || 'ERROR'} ${error.message}`.trim(),
        }));
    });
}

function httpRequest({ method, path, headers = {}, body = null, timeout }) {
    return new Promise((resolve, reject) => {
        const lib = serverConfig.protocol === 'https' ? https : http;
        const request = lib.request(
            {
                host: serverConfig.host,
                port: serverConfig.port,
                method,
                path,
                headers,
                timeout,
            },
            response => {
                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => resolve({
                    status: response.statusCode,
                    headers: response.headers,
                    body: Buffer.concat(chunks).toString('utf8'),
                }));
            }
        );

        request.on('timeout', () => request.destroy(new Error(`${timeout}ms 请求超时`)));
        request.on('error', reject);
        if (body) request.write(body);
        request.end();
    });
}

function short(body, max = 160) {
    const text = String(body || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function printHintsForConnectionRefused(options) {
    console.log('     浏览器里的现象就是：net::ERR_CONNECTION_REFUSED（TCP 层直接被拒绝，不是跨域、不是前端地址写错）。');
    console.log('     按顺序排查：');
    console.log('       1) 服务器上 API 进程/容器是否在运行：');
    console.log('          docker ps | grep sea_api');
    console.log('          docker compose logs --tail=100 api');
    console.log('       2) 是否监听 0.0.0.0:8000（只监听 127.0.0.1 时，外部访问一律被拒绝）：');
    console.log('          ss -lntp | grep 8000');
    console.log('       3) 云厂商安全组 + 系统防火墙是否放行 8000/tcp');
    console.log('       4) 是否刚重启/重建过后端容器（up --build、重启 uvicorn、--reload 都会出现几秒的拒绝窗口）');
    console.log('       5) 本机是否走了代理/VPN（Chrome 用系统代理，curl 不一定用）');
    console.log(`          （本次模拟的浏览器来源是 ${options.origin}，如实际端口不同请加 --origin=...）`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    console.log(`[backend-check] 后端地址：${serverConfig.apiBaseURL}`);
    console.log(`[backend-check] 模拟浏览器来源：${options.origin}`);
    console.log('[backend-check] -------------------------------------------');

    let hardFailure = false;

    // 1) TCP
    const tcp = await tcpProbe(serverConfig.host, serverConfig.port, options.timeout);
    if (tcp.ok) {
        console.log(`[backend-check] ✅ TCP 连接成功（${tcp.elapsed}ms）`);
    } else {
        hardFailure = true;
        console.log(`[backend-check] ❌ TCP 连接失败：${tcp.reason}`);
        printHintsForConnectionRefused(options);
        console.log('[backend-check] -------------------------------------------');
        console.log('[backend-check] 结论：后端端口当前不可达，前端改代码无法解决。');
        process.exitCode = 1;
        return;
    }

    // 2) /health
    try {
        const health = await httpRequest({ method: 'GET', path: '/health', timeout: options.timeout });
        const healthy = health.status === 200;
        if (!healthy) hardFailure = true;
        console.log(`[backend-check] ${healthy ? '✅' : '❌'} GET /health → HTTP ${health.status} ${short(health.body)}`);
        if (!healthy) {
            console.log('     后端进程活着但健康检查未通过，通常是数据库/依赖没起来，去看容器日志。');
        }
    } catch (error) {
        console.log(`[backend-check] ❌ GET /health 请求失败：${error.message}`);
    }

    // 3) CORS 预检（H5 页面跨域访问时浏览器会先发 OPTIONS）
    try {
        const preflight = await httpRequest({
            method: 'OPTIONS',
            path: '/user/login',
            headers: {
                Origin: options.origin,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type,authorization',
            },
            timeout: options.timeout,
        });
        const allowOrigin = preflight.headers['access-control-allow-origin'] || '';
        const corsOk = preflight.status >= 200 && preflight.status < 300
            && (allowOrigin === '*' || allowOrigin === options.origin);
        console.log(`[backend-check] ${corsOk ? '✅' : '❌'} CORS 预检 → HTTP ${preflight.status}，allow-origin: ${allowOrigin || '(缺失)'}`);
        if (!corsOk) {
            console.log(`     浏览器会报跨域错误。需要后端把 ${options.origin} 加进 allow_origins。`);
        }
    } catch (error) {
        console.log(`[backend-check] ❌ CORS 预检请求失败：${error.message}`);
    }

    // 4) 登录接口（假账号，只验证接口可达，不验证密码）
    try {
        const login = await httpRequest({
            method: 'POST',
            path: '/user/login',
            headers: {
                'Content-Type': 'application/json',
                Origin: options.origin,
            },
            body: JSON.stringify({ username: '__health_check__', password: '__health_check__' }),
            timeout: options.timeout,
        });
        console.log(`[backend-check] ✅ POST /user/login → HTTP ${login.status} ${short(login.body)}`);
        console.log('     （返回“用户不存在/密码错误”属于正常业务响应，说明接口链路是通的）');
    } catch (error) {
        console.log(`[backend-check] ❌ POST /user/login 请求失败：${error.message}`);
    }

    console.log('[backend-check] -------------------------------------------');
    if (hardFailure) {
        console.log('[backend-check] 结论：后端当前不可用，先修服务器，再试登录。');
        process.exitCode = 1;
    } else {
        console.log('[backend-check] 结论：前端地址与 CORS 均正常，后端当前可用。');
        console.log('[backend-check] 如果页面仍报 ERR_CONNECTION_REFUSED，说明是截图那一刻后端在重启或网络不通，重新登录即可。');
    }
}

main();
