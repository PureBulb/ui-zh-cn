const sidecar = window.sidecar;
const $ = (id) => document.getElementById(id);

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await sidecar.fetch(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
}

function renderCustomList(dict) {
  const list = $('custom-list');
  const entries = Object.entries(dict || {});
  if (entries.length === 0) {
    list.innerHTML = '<div class="empty">暂无自定义词条</div>';
    return;
  }
  list.innerHTML = '';
  for (const [en, zh] of entries) {
    const row = document.createElement('div');
    row.className = 'dict-item';

    const pair = document.createElement('div');
    pair.className = 'dict-pair';
    const sEn = document.createElement('span');
    sEn.textContent = en;
    const arrow = document.createElement('span');
    arrow.className = 'dict-arrow';
    arrow.textContent = '→';
    const sZh = document.createElement('strong');
    sZh.textContent = zh;
    pair.append(sEn, arrow, sZh);

    const btn = document.createElement('button');
    btn.className = 'btn-del';
    btn.textContent = '删除';
    btn.addEventListener('click', async () => {
      try {
        await api('/api/custom-dict/delete', { method: 'POST', body: { en } });
        toast('已删除词条');
        refresh();
      } catch (err) {
        toast(`删除失败: ${err.message}`);
      }
    });

    row.append(pair, btn);
    list.append(row);
  }
}

async function refresh() {
  try {
    const data = await api('/api/state');
    $('toggle-enabled').checked = data.settings.enabled;
    $('builtin-count').textContent = `${data.builtInCount} 条`;
    $('custom-count').textContent = `${data.customCount} 条`;
    renderCustomList(data.settings.customDict);

    const pill = $('hook-status');
    if (data.runtime && data.runtime.hookActive) {
      pill.textContent = '● 引擎已挂载';
      pill.className = 'pill ok';
      $('restart-banner').hidden = true;
    } else {
      pill.textContent = '待重启生效';
      pill.className = 'pill warn';
      $('restart-banner').hidden = false;
    }
  } catch (err) {
    $('hook-status').textContent = '连接异常';
    $('hook-status').className = 'pill warn';
  }
}

$('toggle-enabled').addEventListener('change', async (e) => {
  try {
    await api('/api/toggle', { method: 'POST', body: { enabled: e.target.checked } });
    toast(e.target.checked ? '已开启实时汉化' : '已关闭汉化，还原英文界面');
  } catch (err) {
    toast(`切换失败: ${err.message}`);
  }
});

$('btn-add').addEventListener('click', async () => {
  const en = $('input-en').value.trim();
  const zh = $('input-zh').value.trim();
  if (!en || !zh) {
    toast('请同时填写英文原文和中文译文');
    return;
  }
  try {
    await api('/api/custom-dict/set', { method: 'POST', body: { en, zh } });
    $('input-en').value = '';
    $('input-zh').value = '';
    toast('词条已保存并实时生效');
    refresh();
  } catch (err) {
    toast(`保存失败: ${err.message}`);
  }
});

refresh();
