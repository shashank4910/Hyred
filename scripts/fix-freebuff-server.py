"""Comment out killOtherFreebuffProcesses() so the browser chat UI
doesn't kill the currently running freebuff.exe (this terminal session).
"""
import os

SERVER_PATH = r'C:\Users\Admin\Projects\freebuff-web-ui\server.js'

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    js = f.read()

# Comment out the function definition
old_func = """function killOtherFreebuffProcesses() {
  if (process.platform !== 'win32') return
  try { execSync('taskkill /F /IM freebuff.exe', { stdio: 'ignore' }) } catch {}
}"""

new_func = """// function killOtherFreebuffProcesses() {
//   if (process.platform !== 'win32') return
//   try { execSync('taskkill /F /IM freebuff.exe', { stdio: 'ignore' }) } catch {}
// }
// NOTE: commented out so opening browser on :3333 doesn't kill the terminal session"""

js = js.replace(old_func, new_func)

# Comment out the call in createSession
old_call = """  killOtherFreebuffProcesses()"""
new_call = """  // killOtherFreebuffProcesses()  -- disabled to preserve terminal session"""

js = js.replace(old_call, new_call)

with open(SERVER_PATH, 'w', encoding='utf-8') as f:
    f.write(js)

print('[OK] server.js -- killOtherFreebuffProcesses commented out')
print('Now you can open http://127.0.0.1:3333 in the browser without killing this terminal.')
print('The fixes (new app.js + index.html) will load in the browser tab too.')
