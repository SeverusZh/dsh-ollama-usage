/**
 * 真实 cordis 运行时冒烟:用 dsh 自带的 cordis + cordis-plugin-timer 加载
 * dsh-ollama-usage 宿主插件,验证 apply 在真实 ctx 下不抛错、路由注册成功。
 *
 * 运行(在 dsh 安装目录下,使 cordis 可解析):
 *   cd /usr/local/lib/node_modules/@deepseek-ai/dsh
 *   node /path/to/test/cordis-apply.mjs
 */
import { Context } from '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js'
import Timer from '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-timer/lib/index.js'
import plugin from '/home/sev/dsh-projects/RegularWork/OllamaProTokenDisp/dsh-ollama-usage/lib/index.js'

const registered = []
const fakeWebServer = {
  register(route) {
    registered.push(route)
    return () => {}
  },
}

const ctx = new Context()
ctx.plugin(Timer)
ctx.provide('webServer', fakeWebServer)
const fiber = ctx.plugin(plugin)

try {
  await fiber.await()
  console.log('fiber.await() 完成,无异常')
} catch (e) {
  console.error('fiber.await() 失败:', e && e.message)
  process.exit(1)
}

console.log('注册的路由:', JSON.stringify(registered.map((r) => ({ kind: r.kind, path: r.path }))))
if (registered.length === 0 || registered[0].path !== '/ollama-usage') {
  console.error('FAIL: 路由未注册')
  process.exit(1)
}
console.log('OK: 真实 cordis 运行时下 apply 正常,路由已注册')
