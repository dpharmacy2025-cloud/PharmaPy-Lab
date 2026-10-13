/* Browser-side isolated worker. Pyodide loads from its official CDN. */
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js';
let python = null;
let boot = null;
async function setup() {
  if (python) return python;
  if (!boot) boot = (async () => {
    importScripts(PYODIDE_URL);
    const p = await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});
    python = p;
    return python;
  })();
  return boot;
}
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try { await setup(); self.postMessage({type:'ready'}); }
    catch(e) { self.postMessage({type:'error',message:String(e)}); }
    return;
  }
  if (data.type !== 'run') return;
  let output = '';
  try {
    const p = await setup();
    const inputs = String(data.stdin||'').split(/\r?\n/);
    let ip = 0;
    p.setStdout({batched:(s)=>{output+=s+'\n';}});
    p.setStderr({batched:(s)=>{output+=s+'\n';}});
    p.setStdin({stdin:()=>ip<inputs.length?inputs[ip++]:undefined});
    // Fresh Python globals every run; capture input prompts and typed values.
    const script = `import builtins, traceback\n_src=${JSON.stringify(data.code)}\n_tests=${JSON.stringify(data.test||'')}\n_original_input=builtins.input\ndef _practice_input(prompt=''):\n    print(prompt, end='')\n    line=_original_input()\n    print(line)\n    return line\nbuiltins.input=_practice_input\n_ns={'__name__':'__main__'}\ntry:\n    exec(compile(_src, '<student code>', 'exec'), _ns, _ns)\n    print('\\n__PHARMAPY_RESULT__:OK')\n    if _tests:\n        exec(compile(_tests, '<practice check>', 'exec'), _ns, _ns)\n        print('__PHARMAPY_CHECK__:PASS')\nexcept BaseException:\n    traceback.print_exc()\n    print('__PHARMAPY_RESULT__:ERROR')\n    if _tests: print('__PHARMAPY_CHECK__:FAIL')\nfinally:\n    builtins.input=_original_input`;
    await p.runPythonAsync(script);
    self.postMessage({type:'result',id:data.id,output});
  } catch(e) { self.postMessage({type:'result',id:data.id,output:output+'\n'+String(e),fatal:true}); }
};
