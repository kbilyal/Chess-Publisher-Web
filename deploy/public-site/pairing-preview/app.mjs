const form = document.querySelector('#pairing-form');
const submit = document.querySelector('#submit');
const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
const rows = document.querySelector('#pairs');
const round = document.querySelector('#round');
const rounds = document.querySelector('#rounds');
const colour = document.querySelector('#colour');
const trfInput = document.querySelector('#trf');

function syncInitialColourControl() {
  colour.disabled = round.valueAsNumber > 1;
}
round.addEventListener('input', syncInitialColourControl);
syncInitialColourControl();

async function readTrf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const utf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (utf8Bom) {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return text;
}

function showDraft(data) {
  const draft = document.createDocumentFragment();
  let board = 0;
  for (const { white, black } of data.pairs) {
    const row = document.createElement('tr');
    for (const value of [black ? ++board : '—', white, black || 'Служебна точка']) {
      row.insertCell().textContent = value;
    }
    draft.append(row);
  }
  rows.replaceChildren(draft);
  document.querySelector('#details').textContent =
    `Кръг ${data.round} · Gacrux ${data.version} · Повторното изчисление съвпада · BBP предстои`;
  preview.hidden = false;
}

const demo = document.querySelector('#demo');
let worker;

function compute(payload) {
  worker ||= new Worker(new URL('./pairing-worker.mjs', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    const activeWorker = worker;
    const timer = setTimeout(() => {
      activeWorker.terminate();
      worker = undefined;
      finish(new Error('Изчислението надхвърли 90 секунди. Опитайте на по-бързо устройство.'));
    }, 90_000);
    function finish(error, result) {
      clearTimeout(timer);
      activeWorker.removeEventListener('message', onMessage);
      activeWorker.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve(result);
    }
    function onError() {
      activeWorker.terminate();
      worker = undefined;
      finish(new Error('Двигателят за жребий не можа да се зареди.'));
    }
    function onMessage({ data }) {
      if (data.phase === 'loading') {
        status.textContent = 'Зареждане на Gacrux при първото използване…';
      } else if (data.phase === 'pairing') {
        status.textContent = 'Изчисляване и проверка на двойките…';
      } else if (data.error) {
        finish(new Error(data.error));
      } else {
        finish(null, data.result);
      }
    }
    activeWorker.addEventListener('message', onMessage);
    activeWorker.addEventListener('error', onError);
    activeWorker.postMessage(payload);
  });
}

async function run(loadPayload) {
  preview.hidden = true;
  rows.replaceChildren();
  submit.disabled = demo.disabled = true;
  status.textContent = 'Подготовка на жребия…';
  try {
    showDraft(await compute(await loadPayload()));
    status.textContent = 'Готово. Двойките са показани за преглед.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = demo.disabled = false;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const file = trfInput.files[0];
  if (!file || file.size > 512 * 1024 || round.valueAsNumber > rounds.valueAsNumber) {
    preview.hidden = true;
    status.textContent = 'Проверете файла (до 512 KiB) и броя на кръговете.';
    return;
  }
  void run(async () => ({
    round: round.valueAsNumber, rounds: rounds.valueAsNumber,
    topColor: colour.value, trf: await readTrf(file)
  }));
});

demo.addEventListener('click', () => {
  void run(async () => {
    const response = await fetch('./demo.trf');
    if (!response.ok) throw new Error('Примерният TRF е недостъпен.');
    return { trf: await response.text(), round: 1, rounds: 7, topColor: 'W' };
  });
});
