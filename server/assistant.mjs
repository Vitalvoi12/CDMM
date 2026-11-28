import { randomUUID } from "node:crypto";
import { applyChanges, getState } from "./db.mjs";
import { focusCommand } from "./focus.mjs";
import { normalizeSignals, setTodoDone, SIGNAL_KINDS, SIGNAL_MODES, SIGNAL_PATTERNS } from "./glance.mjs";
import geminiVoices from './gemini-voices.json' with { type: 'json' };

const todoActions = ['update_todo', 'complete_todo', 'delete_todo', 'plan_todo', 'reopen_todo'];
const todoSelectors = ['title', 'targetIndex', 'targetEstimate', 'targetDate', 'targetDeadline', 'targetDescription', 'targetSubject'];

const actions = {
  list_subjects: [],
  update_subject: ['name', 'color', 'weeklyGoalMinutes'],
  read_day_note: ['date'],
  write_day_note: ['date', 'content', 'mode'],
  update_event: ['title', 'date', 'time', 'newTitle', 'start', 'end', 'durationMinutes', 'description', 'notifyBefore', 'scope'],
  duplicate_event: ['title', 'date', 'time', 'start'],
  focus_start: ['subject'],
  focus_finish: [],
  focus_rate: ['rating'],
  focus_status: [],
  focus_summary: ['from', 'to', 'subject'],
  set_theme: ['theme'],
  set_voice: ['voice'],
  set_signal: ['device', 'signal', 'value'],
  answer: ['message'],
  open_screen: ['screen'],
  sync_now: [],
  create_subject: ['name'],
  rename_subject: ['name', 'newName'],
  delete_subject: ['name'],
  create_todo: ['title', 'scheduledDate', 'dueDate', 'subject', 'estMinutes'],
  update_todo: [...todoSelectors, 'stage', 'newTitle', 'description', 'subject', 'scheduledDate', 'dueDate', 'estMinutes', 'importance', 'urgency', 'progress', 'reminderAt'],
  complete_todo: todoSelectors,
  reopen_todo: todoSelectors,
  delete_todo: todoSelectors,
  list_todos: ['quadrant', 'scheduledDate', 'status', ...todoSelectors, 'at', 'deadlineAt'],
  plan_todo: [...todoSelectors, 'start', 'estMinutes'],
  list_schedule: ['date', 'time', 'timeMatch', 'title', 'subject'],
  find_free_time: ['date', 'from', 'to', 'durationMinutes'],
  delete_event: ['title', 'date', 'time', 'scope'],
  create_event: ['title', 'start', 'end', 'subject', 'repeat', 'until', 'kind'],
  move_event: ['title', 'date', 'time', 'start'],
  swap_events: ['date', 'first', 'second'],
  clarify: ['detail'],
};

const todoQuadrants = {
  all: 'в TODO',
  neither: 'в Neither',
  important: 'в Important',
  urgent: 'в Urgent',
  both: 'в Urgent & Important',
};

const clarificationQuestions = {
  title: 'Как называется событие или задача?',
  date: 'На какую дату?',
  time: 'На какое время?',
  subject: 'Какой предмет?',
  action: 'Не удалось разобрать команду. Укажи действие и название задачи, события или предмета.',
};

const optionalFields = ['status', 'subject', 'scheduledDate', 'dueDate', 'time', 'estMinutes', 'repeat', 'until', 'kind', 'scope'];
const isOptional = (action, field) => optionalFields.includes(field) ||
  (action === 'delete_event' && field === 'date') || ['update_todo', 'complete_todo', 'delete_todo', 'reopen_todo'].includes(action) || (action === 'plan_todo' && field !== 'start') ||
  action === 'list_todos' ||
  (action === 'find_free_time' && field !== 'date') ||
  (action === 'list_schedule' && ['title', 'timeMatch'].includes(field)) ||
  (action === 'update_subject' && ['color', 'weeklyGoalMinutes'].includes(field)) ||
  (action === 'update_event' && field !== 'title') ||
  (action === 'write_day_note' && field === 'content');

function failure(status, message) {
  return Object.assign(new Error(message), { status });
}

export async function interpretAssistantCommand(body, {
  key = process.env.OPENROUTER_API_KEY,
  request = fetch,
  now = new Date(),
  history = [],
} = {}) {
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const timeZone = body?.timeZone;
  if (!text || text.length > 1000 || typeof timeZone !== 'string' || !timeZone || timeZone.length > 100) {
    throw failure(400, 'Expected text and an IANA time zone');
  }
  let localTime;
  try {
    localTime = new Intl.DateTimeFormat('sv-SE', {
      timeZone, dateStyle: 'short', timeStyle: 'short',
    }).format(now);
  } catch {
    throw failure(400, 'Invalid time zone');
  }
  const previous = history.at(-1);
  if (previous?.choosingTodo && todoActions.includes(previous.action)) {
    const choice = /^(?:номер\s+|№\s*)?([1-9]\d*|первую|вторую|третью|четвёртую|четвертую|пятую)[.!?]?$/iu.exec(text);
    if (choice) {
      const ordinals = ['первую', 'вторую', 'третью', 'четвертую', 'пятую'];
      const word = choice[1].toLowerCase().replace('ё', 'е');
      return { action: previous.action, args: {
        ...Object.fromEntries(Object.entries(previous.args).filter(([field]) => !todoSelectors.includes(field))),
        targetIndex: /^\d/.test(word) ? word : String(ordinals.indexOf(word) + 1),
      }, usage: null };
    }
  }
  if (!key) throw failure(503, 'OpenRouter is not configured');

  const explicitTodoEdit = /^(?:поменяй|измени|обнови|переименуй|отредактируй|перенеси)(?=\s)/iu.test(text) &&
    /(?:туду|todo|таск|задач)/iu.test(text);
  const schedulingTask = /(?:поставь|запланируй|перетащи|перенеси|размести)/iu.test(text) &&
    /(?:таск|задач|туду|todo)/iu.test(text) &&
    /(?:\d{1,2}[:.]\d{2}|(?:на|в)\s+\d{1,2}(?!\d)|таймлайн|в календарь)/iu.test(text) &&
    !/(?:дедлайн|крайний срок|напоминани)/iu.test(text);
  const eventDurationEdit = /^(?:поменяй|измени|установи|сделай|увеличь|уменьши)\s+длительность\s+(?:события|эвента|ивента)(?=\s|$)/iu.test(text);
  const scopedActions =
    eventDurationEdit ? ['update_event'] :
    schedulingTask ? ['plan_todo'] :
    /недельн\p{L}*\s+цел|цвет\s+предмет/iu.test(text) ? ['update_subject'] :
    /заметк\p{L}*\s+дня/iu.test(text) ? ['read_day_note', 'write_day_note'] :
    /фокус/iu.test(text) && /(?:сесси|оцени|сколько|статистик)/iu.test(text)
      ? ['focus_start', 'focus_finish', 'focus_rate', 'focus_status', 'focus_summary'] : null;
  const offeredActions = Object.fromEntries(Object.entries(actions).filter(([name]) =>
    (!scopedActions || name === 'clarify' || scopedActions.includes(name)) && (!explicitTodoEdit || name !== 'create_todo')));
  const numberedList = history.at(-1)?.shownTodos;
  const availableFields = (fields) => fields.filter((field) => field !== 'targetIndex' || numberedList?.length);
  let result;
  try {
    const response = await request('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-flash',
        reasoning: { enabled: false },
        max_tokens: 512,
        provider: { require_parameters: true, max_price: { prompt: 0.12, completion: 0.50 } },
        messages: [
          { role: 'system', content: [
            'You are the Russian-speaking CDMM assistant. Understand questions, requests and follow-ups. Return exactly one tool call.',
            'For small talk, general tips or how to use CDMM, use answer with a short natural Russian message. Never guess personal data, claim a change, or claim external actions in answer. Use the corresponding tool for personal data and changes.',
            '«Какой эвент в 11:00?» uses list_schedule with time 11:00, date today by default and timeMatch start. «Что идёт сейчас?» uses list_schedule with the current local date and time and timeMatch active. Use active for events in progress, start for appointments starting at a stated time. For a named event include title. Never drop the time or title to read the entire day.',
            'Use find_free_time for free slots or checking availability within a day. from and to are local HH:mm (default 09:00 to 21:00), durationMinutes is minimum minutes (default 30). For «свободен ли я с 11 до 12 завтра?» use from 11:00, to 12:00 and durationMinutes 60.',
            'For a specific task use list_todos with the same selectors as task edits. A task on the calendar at a specific time uses at (local date-time), a task due at that time uses deadlineAt, and a deadline on a day uses targetDeadline. A planned day without a time uses scheduledDate. For «задача на 11» without a day use today. For «задача с оценкой час» use targetEstimate 60. Use reopen_todo to undo completion.',
            'Use focus_status to answer whether a focus timer is running and how long. Use set_voice with an exact Gemini voice name or default. Use set_signal for phone or watch, signal reminder, start, end, todo or pattern, and value off, vibrate, sound, both or a vibration pattern short, long, double, triple.',
            'After showing TODOs, requests like «удали первое», «убери вторую из списка», or «удали ту, где оценка час» are delete_todo. Never list again unless asked to list.',
            'For update_todo, complete_todo and delete_todo, targetIndex is the 1-based number in the latest shownTodos. Use title, targetEstimate (existing minutes), targetDate (existing scheduled day), targetDeadline (existing due day or local date-time), targetDescription (existing note text) and targetSubject to disambiguate. Combine selectors when supplied.',
            'When the latest command has choosingTodo and the user chooses one of its shownTodos, continue that action with the previous requested changes. Use only the new selection as the target, clearing all previous target selectors.',
            'If the user requests a task change but the title is incomplete or missing, call the corresponding task action with the selectors you have. The server can offer task choices.',
            'Only use targetIndex when the user actually says a number or ordinal, and only for the latest numbered list.',
            'For «переименуй задачу Заметки, ту, что на час, в Учёба» use update_todo with exactly title Заметки, targetEstimate 60 and newTitle Учёба. Do not copy a task note into description or invent any other edit.',
            'Never use a title as targetSubject. Only set targetSubject when the current request explicitly names a subject or references a known subject.',
            'For «убери задачу с заметкой для проекта», call delete_todo with ONLY targetDescription «для проекта». Do not borrow selectors from unrelated recent commands.',
            'When a user answers a question about which task to use, continue the previous requested action with the new selector and keep the earlier requested changes.',
            'Use update_todo for changing an existing task, even if the user only mentions the changed field. Never use create_todo to edit, reschedule or rename an existing task.',
            'For update_todo, title is the old exact title. If referring to the last task (e.g. «поменяй её»), omit title or copy it from history. Set only requested fields; newTitle is the replacement title.',
            'Kanban: «беру доклад в работу» means update_todo title доклад stage active. Moving back to «к выполнению» uses stage backlog. Use complete_todo for done. «Что я начал, но ещё не закончил?» means list_todos status active, quadrant all.',
            'For update_todo use «clear» to remove subject, scheduledDate, dueDate, or estMinutes. Use true or false as strings for importance and urgency, and a whole percentage as a string for progress.',
            'Create or add a TODO even if it includes a subject, planned day, deadline and estimated duration. These are fields of one task.',
            'For create_todo, estMinutes is a string containing whole minutes; «длительность 2 часа» means estMinutes 120.',
            'Example «поставь туду сделать ДЗ по информатике на сегодня, длительность 2 часа» is create_todo with title сделать ДЗ, subject информатика, scheduledDate equal to the YYYY-MM-DD part of localTime, estMinutes 120.',
            '«Удали предмет» always uses delete_subject, not create_subject or delete_event. «Переименуй предмет» and capitalization changes use rename_subject. Preserve the rest of the requested casing after the initial capital.',
            'Use clarify only when information is missing, a request is unsupported, or it combines independent actions.',
            'For clarify, detail must be one of title, date, time, subject, action. Never ask for confirmation.',
            'A complete request to delete an event must call delete_event even if the user has not confirmed. CDMM finds the event and handles confirmation.',
            'When following up on a delete request, reuse its title or date from recent commands if the user only supplies the missing detail.',
            'Resolve relative dates against the supplied local time. Dates are YYYY-MM-DD,',
            'date-times are YYYY-MM-DDTHH:mm in that same zone. Never invent missing titles or times.',
            'Use recent commands only to resolve references in the current instruction.',
            'A recent schedule result includes the events actually shown to the user. If the user refers to that single event, copy its exact title, date and original start time into delete_event, update_event, move_event or duplicate_event. Keep the requested new date-time separate in start.',
            'For delete_event use the exact event title, date if specified, and time (HH:mm) if specified. For update_event or delete_event of a repeated event, use scope single, following (this and future) or series (whole series) only as requested. A single occurrence is the default. An explicitly requested entire series uses scope series.',
            'For moving an event, date is the date before moving and start is the new local date-time.',
            'Commands like «сдвинь», «перенеси», «на полчаса позже» explicitly change an event and require move_event.',
            'Example: recent create_event titled Повторение starts 2026-11-28T16:00; current «сдвинь его на полчаса позже» means move_event with title Повторение, date 2026-11-28, start 2026-11-28T16:30.',
            'For «какие у меня есть предметы», «покажи предметы» or other requests to read the subject list, call list_subjects. Ignore earlier TODO context when the current request explicitly asks for subjects.',
            'Use update_subject to change color (hex RGB) or weeklyGoalMinutes (whole minutes or clear). «Поставь недельную цель по математике 3 часа» is update_subject with name Математика and weeklyGoalMinutes 180. Use update_event to change named fields. Include date only when the user specifies the occurrence date. To change duration use durationMinutes (whole minutes as a string), leaving start and end unset unless the user explicitly changes the start. For «поменяй длительность эвента Тренировка на 1 час» use update_event with title Тренировка and durationMinutes 60. The server looks up the event and calculates the end. Use duplicate_event for copying to a new start.',
            'Use read_day_note, write_day_note (mode append for add, replace only when explicitly requested, or clear), focus_start, focus_finish, focus_rate (1, 2 or 3), focus_summary (inclusive date range) and set_theme (light or dark) when requested.',
            'Day checklists are TODOs scheduled that day. Use list_todos with scheduledDate for reading, create_todo with scheduledDate for adding, and targetDate to select a checklist task for editing, finishing or deleting. Use plan_todo for putting an existing task onto the timeline. «Поставь эту таску на сегодня на 18:00» means plan_todo with start at 18:00 today. When «эту таску» refers to the last task, omit task selectors. The requested date is the new start, not targetDate. Omit estMinutes unless the user explicitly gives a new duration.',
            'For update_todo reminderAt is a local date-time to add a notification, or clear to remove notifications. For create_event repeat can be daily, weekly, monthly or yearly and requires an inclusive until date. Event kind can be plan or real.',
            'Use open_screen when asked to open a page. Screen is calendar, study, todo, subjects, statistics or settings. Use sync_now when explicitly asked to sync.',
            'Use list_schedule only for calendar events. Use list_todos for reading TODO tasks, without requiring a date. For открытые, невыполненные or оставшиеся use status open; for выполненные use status completed; otherwise omit status.',
            'For list_todos, quadrant neither means «не важные и не срочные», important means important only, urgent means urgent only, both means important and urgent, all means no priority filter.',
            'After creating a subject, a follow-up like «добавь по нему задачу» uses its name as subject.',
            'Inflect Russian words in dialogue, but copy referenced subject and event names exactly.',
            'Distinguish a scheduled day from a deadline. For swap use titles or 1-based positions.',
          ].join(' ') },
          { role: 'user', content: JSON.stringify({ text, localTime, timeZone, recentCommands: history }) },
        ],
        tool_choice: 'required',
        tools: Object.entries(offeredActions).map(([name, fields]) => ({
          type: 'function',
          function: {
            name,
            parameters: {
              type: 'object',
              properties: Object.fromEntries(availableFields(fields).map((field) => [field, field === 'detail'
                ? { type: 'string', enum: Object.keys(clarificationQuestions) }
                : field === 'quadrant' ? { type: 'string', enum: Object.keys(todoQuadrants) }
                : { type: 'string' }])),
              required: fields.filter((field) => !isOptional(name, field)),
              additionalProperties: false,
            },
          },
        })),
      }),
    });
    if (!response.ok) throw new Error('Upstream error');
    result = await response.json();
    const calls = result.choices?.[0]?.message?.tool_calls;
    if (calls?.length !== 1) throw new Error('Expected one tool call');
    const { name, arguments: raw } = calls[0].function;
    const args = JSON.parse(raw);
    if (!Object.hasOwn(offeredActions, name) || !args || Array.isArray(args) || typeof args !== 'object' ||
        Object.entries(args).some(([field, value]) =>
          !availableFields(actions[name]).includes(field) || typeof value !== 'string' || !value.trim() || value.length > 1000) ||
        actions[name].some((field) =>
          !isOptional(name, field) && !Object.hasOwn(args, field))) {
      throw new Error('Invalid tool call');
    }
    if (['list_schedule', 'list_todos'].includes(name)) {
      const clock = /(?:^|\s)(?:в|на|к)\s+([01]?\d|2[0-3]):([0-5]\d)\b/iu.exec(text);
      if (clock) {
        const time = clock[1].padStart(2, '0') + ':' + clock[2];
        if (name === 'list_schedule') args.time = time;
        if (name === 'list_todos' && !args.at && !args.deadlineAt) {
          const field = /дедлайн|крайний срок|сдать|срок сдачи|(?:^|\s)к\s+\d/iu.test(text) ? 'deadlineAt' : 'at';
          args[field] = (args.targetDeadline?.slice(0, 10) ?? args.scheduledDate ?? args.targetDate ?? localTime.slice(0, 10)) + 'T' + time;
          if (field === 'at') {
            delete args.scheduledDate;
            delete args.targetDate;
          }
        }
      }
    }
    if (name === 'write_day_note' && args.mode === 'replace' && /^(?:добавь|допиши|добавить|дописать)\s/iu.test(text)) {
      args.mode = 'append';
    }
    if (name === 'create_todo' && !args.scheduledDate && /(?:^|\s)на (?:сегодняшний день|сегодня)(?=$|[\s.,!?])/iu.test(text)) {
      args.scheduledDate = localTime.slice(0, 10);
    }
    return { action: name, args, usage: result.usage ?? null };
  } catch {
    throw failure(502, 'Could not interpret the command via OpenRouter');
  }
}

function calendarTime(value, zone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw failure(422, 'Некорректная дата или время');
  const target = Date.parse(value + 'Z');
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 16) !== value) {
    throw failure(422, 'Некорректная дата или время');
  }
  const format = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone, dateStyle: 'short', timeStyle: 'short',
  });
  const matches = new Set();
  for (const hours of [-24, 0, 24]) {
    const probe = target + hours * 3600000;
    const local = Date.parse(format.format(probe).replace(' ', 'T') + 'Z');
    const instant = target + probe - local;
    if (format.format(instant).replace(' ', 'T') === value) matches.add(instant);
  }
  if (matches.size !== 1) throw failure(422, 'Уточни время с учётом перевода часов');
  return [...matches][0];
}

export function getAssistantHistory(db, userId, zone, now = Date.now()) {
  return db.prepare(
    'SELECT text, result FROM assistant_requests WHERE user_id = ? AND zone = ? ORDER BY rowid DESC LIMIT 4',
  ).all(userId, zone).reverse().flatMap(({ text, result }) => {
    const { context, at } = JSON.parse(result);
    return context && at >= now - 15 * 60_000 ? [{ text, ...context }] : [];
  });
}

export function assistantConfirmation(text) {
  if (typeof text !== 'string') return null;
  const answer = text.trim().toLocaleLowerCase('ru').replace(/[.!?]+$/, '');
  if (/^(да|удаляй|да,? удаляй|да,? удали|да,? подтверждаю|да,? именно так|подтверждаю)$/.test(answer)) return { action: 'confirm_delete', args: {} };
  if (/^(?:удали|удалить|убери) (?:последний|последний предмет|последний из них)$/.test(answer)) {
    return { action: 'delete_last_listed', args: {} };
  }
  const ordinal = /^(?:удали|удалить|убери) (?:задачу )?(?:номер |№\s*)?(перв(?:ое|ую)|втор(?:ое|ую)|треть(?:е|ю)|[1-9]\d*)(?: задачу| из списка)?$/.exec(answer);
  if (ordinal) {
    const word = ordinal[1];
    const index = word.startsWith('перв') ? '1' : word.startsWith('втор') ? '2' : word.startsWith('треть') ? '3' : word;
    return { action: 'delete_todo', args: { targetIndex: index } };
  }
  if (/^(?:удали|удалить|убери) (?:их всех|их все|всех их|их|все эти задачи|все перечисленные задачи)(?:,? пожалуйста)?$/.test(answer)) {
    return { action: 'delete_listed_todos', args: {} };
  }
  if (/^(?:удали|удалить|убери) (?:пожалуйста,? )?(?:это событие|его|этот эвент)(?:,? пожалуйста)?$/.test(answer)) {
    return { action: 'delete_referenced_event', args: {} };
  }
  if (/^(нет|отмена|отмени|не удаляй)$/.test(answer)) return { action: 'cancel_delete', args: {} };
  return null;
}

function latestAssistantResult(db, userId, zone) {
  const row = db.prepare(
    'SELECT result FROM assistant_requests WHERE user_id = ? AND zone = ? ORDER BY rowid DESC LIMIT 1',
  ).get(userId, zone);
  const result = row && JSON.parse(row.result);
  return result?.at >= Date.now() - 15 * 60_000 ? result : null;
}

export function executeAssistantCommand(db, userId, command, zone, id, text) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const previous = db.prepare('SELECT text, zone, result FROM assistant_requests WHERE user_id = ? AND id = ?').get(userId, id);
    if (previous && (previous.text !== text || previous.zone !== zone)) throw failure(409, 'Идентификатор уже использован');
    const result = previous ? JSON.parse(previous.result) : applyCommand(db, userId, command, zone, id);
    if (!previous) db.prepare('INSERT INTO assistant_requests VALUES (?, ?, ?, ?, ?)').run(userId, id, text, zone, JSON.stringify(result));
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function capitalize(value) {
  return value.replace(/^[^\p{L}]*\p{L}/u, prefix => prefix.toLocaleUpperCase('ru'));
}

function applyCommand(db, userId, { action, args, usage }, zone, requestId) {
  const reply = (message, context = { action, args }) => ({
    action, message, usage: usage ?? null, context, at: Date.now(),
  });
  if (action === 'clarify') {
    const detail = Object.hasOwn(clarificationQuestions, args.detail) ? args.detail : 'action';
    return reply(clarificationQuestions[detail], { action, args: { detail } });
  }
  if (action === 'answer') return reply(args.message, { action });
  const state = getState(db, userId);
  const iso = (ms) => new Date(ms).toISOString();
  const localTime = (value) => calendarTime(value, zone);
  const normalize = (value) => value.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const find = (records, key, label) => {
    const matches = records.filter((record) => normalize(label(record)) === normalize(key));
    if (matches.length !== 1) throw failure(422, 'Уточни название: «' + key + '»');
    return matches[0];
  };
  const subjectId = args.subject && !(action === 'update_todo' && args.subject === 'clear') ? find(state.subjects, args.subject, (s) => s.name).id : '';
  const now = Date.now();
  const base = { id: randomUUID(), title: args.title === undefined ? undefined : capitalize(args.title.trim()), subjectId, createdAt: iso(now) };
  const save = (entity, records) => applyChanges(db, userId, {
    [entity]: records.map((record) => ({ ...record, updatedAt: Math.max(now, (record.updatedAt || 0) + 1) })),
  });
  const subjectColors = new Map(state.subjects.map(({ id, color }) => [id, color]));
  const item = (record, text) => ({ text, color: subjectColors.get(record.subjectId) ?? null });
  if (action === 'list_subjects') {
    const subjects = [...state.subjects].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const shown = subjects.slice(0, 20);
    const shownSubjects = shown.map(({ name }) => name);
    const remaining = subjects.length - shown.length;
    const message = subjects.length
      ? 'Предметы: ' + shownSubjects.join(', ') + (remaining ? '. Ещё предметов: ' + remaining : '')
      : 'В CDMM пока нет предметов.';
    return { ...reply(message, { action, args, shownSubjects }),
      list: { title: 'Предметы', items: shown.map(s => ({ text: s.name, color: s.color })), remaining },
      subjectReferences: shown.map(({ id, updatedAt }) => ({ id, updatedAt })) };
  }
  const requestSubjectDeletion = (subject) => ({
    ...reply('Удалить предмет «' + subject.name + '»? Скажи «да» или «отмена».'),
    pendingDeletion: { entity: 'subjects', id: subject.id, updatedAt: subject.updatedAt },
  });
  if (action === 'delete_last_listed') {
    const previous = latestAssistantResult(db, userId, zone);
    const subjectReference = previous?.subjectReferences?.at(-1);
    if (subjectReference) {
      const subject = state.subjects.find(({ id, updatedAt }) => id === subjectReference.id && updatedAt === subjectReference.updatedAt);
      return subject ? requestSubjectDeletion(subject) : reply('Предмет изменился. Запроси список заново.');
    }
    const reference = previous?.todoReferences?.at(-1);
    if (reference && state.todos.some(({ id, updatedAt }) => id === reference.id && updatedAt === reference.updatedAt)) {
      const task = state.todos.find(({ id }) => id === reference.id);
      return { ...reply('Удалить задачу «' + task.title + '»? Скажи «да» или «отмена».'),
        pendingDeletion: { entity: 'todos', references: [reference] } };
    }
    return reply('Сначала запроси актуальный список или назови, что удалить.');
  }
  if (action === 'update_subject') {
    const subject = find(state.subjects, args.name, (record) => record.name);
    const patch = {};
    if (args.color !== undefined) {
      if (!/^#[0-9a-f]{6}$/i.test(args.color)) throw failure(422, 'Уточни цвет предмета');
      patch.color = args.color;
    }
    if (args.weeklyGoalMinutes !== undefined) {
      if (args.weeklyGoalMinutes !== 'clear' && !/^[1-9]\d{0,4}$/.test(args.weeklyGoalMinutes)) throw failure(422, 'Уточни недельную цель в минутах');
      patch.weeklyGoalMinutes = args.weeklyGoalMinutes === 'clear' ? null : Number(args.weeklyGoalMinutes);
    }
    if (!Object.keys(patch).length) return reply('Что изменить у предмета «' + subject.name + '»?');
    save('subjects', [{ id: subject.id, updatedAt: subject.updatedAt, ...patch }]);
    return reply('Предмет обновлён: ' + subject.name);
  }
  if (action === 'create_subject') {
    const name = capitalize(args.name.trim());
    if (state.subjects.some((subject) => normalize(subject.name) === normalize(name))) {
      return reply('Предмет уже есть: ' + name);
    }
    save('subjects', [{ id: base.id, name, color: '#6366f1' }]);
    return reply('Создан предмет: ' + name);
  }
  if (action === 'rename_subject' || action === 'delete_subject') {
    const subject = find(state.subjects, args.name, (record) => record.name);
    if (action === 'delete_subject') return requestSubjectDeletion(subject);
    const name = capitalize(args.newName.trim());
    if (state.subjects.some((record) => record.id !== subject.id && normalize(record.name) === normalize(name))) {
      return reply('Предмет с таким названием уже есть: ' + name);
    }
    save('subjects', [{ id: subject.id, updatedAt: subject.updatedAt, name }]);
    return reply('Предмет переименован: ' + name, { action, args: { name } });
  }
  if (action === 'read_day_note' || action === 'write_day_note') {
    localTime(args.date + 'T12:00');
    const note = state.dayNotes.find(({ id }) => id === args.date);
    if (action === 'read_day_note') return reply(note?.content || 'На этот день заметки нет.');
    if (!['append', 'replace', 'clear'].includes(args.mode)) throw failure(422, 'Уточни, как изменить заметку');
    if (args.mode !== 'clear' && !args.content) throw failure(422, 'Укажи текст заметки');
    const addition = args.mode === 'clear' ? '' : capitalize(args.content);
    const content = args.mode === 'append' && note?.content ? note.content + '\n' + addition : addition;
    save('dayNotes', [{ id: args.date, updatedAt: note?.updatedAt, content }]);
    return reply('Заметка обновлена за ' + args.date);
  }
  const settings = state.settings?.data ?? {};
  if (action === 'open_screen' || action === 'sync_now') {
    const routes = { calendar: '/', study: '/study', todo: '/todo', subjects: '/subjects', statistics: '/statistics', settings: '/settings' };
    if (action === 'sync_now') return { ...reply('Открываю CDMM для синхронизации'), clientRoute: '/' };
    if (!Object.hasOwn(routes, args.screen)) throw failure(422, 'Какой экран открыть?');
    return { ...reply('Открываю экран CDMM'), clientRoute: routes[args.screen] };
  }
  if (action === 'set_theme') {
    if (!['light', 'dark'].includes(args.theme)) throw failure(422, 'Выбери светлую или тёмную тему');
    applyChanges(db, userId, { settings: { data: { theme: args.theme },
      updatedAt: Math.max(now, (state.settings?.updatedAt || 0) + 1) } });
    return reply(args.theme === 'dark' ? 'Включена тёмная тема CDMM' : 'Включена светлая тема CDMM');
  }
  if (action === 'set_voice' || action === 'set_signal') {
    const data = {};
    if (action === 'set_voice') {
      const voice = geminiVoices.find((name) => normalize(name) === normalize(args.voice));
      if (!voice && args.voice !== 'default') throw failure(422, 'Укажи название голоса Gemini');
      data.assistantVoice = voice ?? '';
      data.assistantVoiceAt = Math.max(now, (Number(settings.assistantVoiceAt) || 0) + 1);
    } else {
      const { device, signal, value } = args;
      if (!['phone', 'watch'].includes(device) ||
          (signal === 'pattern' ? !SIGNAL_PATTERNS.includes(value) :
            !SIGNAL_KINDS.includes(signal) || !SIGNAL_MODES.includes(value))) {
        throw failure(422, 'Уточни устройство и тип сигнала');
      }
      data.signals = normalizeSignals(settings.signals);
      data.signals[device][signal] = value;
      data.signalsAt = Math.max(now, (Number(settings.signalsAt) || 0) + 1);
    }
    applyChanges(db, userId, { settings: { data, updatedAt: Math.max(now, (state.settings?.updatedAt || 0) + 1) } });
    return reply(action === 'set_voice' ? 'Голос помощника: ' + (data.assistantVoice || 'по умолчанию') : 'Настройки сигналов обновлены.');
  }
  if (action === 'focus_status') {
    const session = settings.activeSession;
    if (!session) return reply('Сейчас фокус-сессия не идёт.');
    const name = session.title || state.subjects.find(({ id }) => id === session.subjectId)?.name;
    const minutes = Math.max(0, Math.floor((now - Date.parse(session.start)) / 60_000));
    return reply('Фокус-сессия' + (name ? ' «' + name + '»' : '') + ' идёт уже ' + minutes + ' мин.');
  }
  if (['focus_start', 'focus_finish', 'focus_rate'].includes(action)) {
    const operation = action.slice(6);
    const previous = latestAssistantResult(db, userId, zone);
    const sessionId = operation === 'start' ? base.id : operation === 'finish'
      ? settings.activeSession?.id : previous?.focusSessionId;
    if (!sessionId) return reply(operation === 'finish' ? 'Нет активной фокус-сессии.' : 'Сначала заверши фокус-сессию.');
    focusCommand(db, userId, { action: operation, commandId: requestId, sessionId,
      subjectId, expectedSessionAt: Number(settings.activeSessionAt) || 0,
      at: iso(now), focus: Number(args.rating), timeZone: zone }, now, { nested: true });
    const message = { start: 'Фокус-сессия начата', finish: 'Фокус-сессия завершена', rate: 'Оценка фокуса сохранена' };
    return { ...reply(message[operation]), focusSessionId: sessionId };
  }
  if (action === 'focus_summary') {
    const from = localTime(args.from + 'T00:00');
    localTime(args.to + 'T12:00');
    if (args.to < args.from) throw failure(422, 'Уточни период статистики');
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, dateStyle: 'short' });
    const sessions = state.events.filter((event) => event.kind !== 'plan' && event.countInStats !== false &&
      Date.parse(event.start) >= from && day.format(new Date(event.start)) <= args.to &&
      (!subjectId || event.subjectId === subjectId));
    const minutes = Math.round(sessions.reduce((sum, event) => sum + Date.parse(event.end) - Date.parse(event.start), 0) / 60000);
    return reply('Фокус за ' + args.from + ' — ' + args.to + ': ' + minutes + ' мин. Сессий: ' + sessions.length);
  }
  if (action === 'create_todo') {
    const dueHasTime = args.dueDate?.includes('T') ?? false;
    const dueDate = args.dueDate ? iso(localTime(dueHasTime ? args.dueDate : args.dueDate + 'T18:00')) : undefined;
    if (args.scheduledDate) localTime(args.scheduledDate + 'T12:00');
    const estMinutes = args.estMinutes === undefined ? undefined : Number(args.estMinutes);
    if (estMinutes !== undefined && (!Number.isSafeInteger(estMinutes) || estMinutes <= 0)) {
      throw failure(422, 'Уточни длительность задачи в минутах');
    }
    save('todos', [{ ...base, scheduledDate: args.scheduledDate, dueDate, dueHasTime, estMinutes }]);
    return { ...reply('Добавлено в TODO: ' + base.title), todoReference: base.id };
  }
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, dateStyle: 'short' });
  const localDateTime = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' });
  const todoDetails = (todo) => ({
    title: todo.title, completed: todo.completed, estMinutes: todo.estMinutes, scheduledDate: todo.scheduledDate,
    dueDate: Number.isFinite(Date.parse(todo.dueDate)) ? localDateTime.format(new Date(todo.dueDate)).replace(' ', 'T') : undefined,
    description: todo.description?.slice(0, 160),
    subject: state.subjects.find((subject) => subject.id === todo.subjectId)?.name,
  });
  const describeTodo = (todo, listDate, includeStatus = false) => {
    const details = todoDetails(todo);
    return [details.title, details.subject, details.estMinutes && details.estMinutes + ' мин',
      details.scheduledDate && details.scheduledDate !== listDate && 'запланировано на ' + details.scheduledDate,
      details.dueDate && 'дедлайн ' + (todo.dueHasTime ? details.dueDate.replace('T', ' ') : details.dueDate.slice(0, 10)), details.description,
      details.completed ? 'выполнено' : includeStatus && (todo.inProgress ? 'в работе' : 'не выполнено')].filter(Boolean).join(', ');
  };
  let todo;
  if (todoActions.includes(action)) {
    const previous = latestAssistantResult(db, userId, zone);
    const listed = previous?.todoReferences ?? [];
    const priorId = previous?.todoReference ?? (!previous?.context?.choosingTodo && listed.length === 1 && !previous.moreTodos ? listed[0].id : null);
    const indexed = args.targetIndex === undefined ? null : listed[Number(args.targetIndex) - 1];
    const validIndex = args.targetIndex === undefined || (/^[1-9]\d*$/.test(args.targetIndex) && indexed);
    const hasSelector = todoSelectors.some((key) => args[key] !== undefined);
    const selectors = (record) => {
      const details = todoDetails(record);
      return [
        args.title && normalize(record.title) === normalize(args.title),
        args.targetEstimate && record.estMinutes === Number(args.targetEstimate),
        args.targetDate && record.scheduledDate === args.targetDate,
        args.targetDeadline && (args.targetDeadline.includes('T') ? details.dueDate === args.targetDeadline
          : details.dueDate?.slice(0, 10) === args.targetDeadline),
        args.targetDescription && normalize(record.description ?? '').includes(normalize(args.targetDescription)),
        args.targetSubject && normalize(details.subject ?? '') === normalize(args.targetSubject),
      ];
    };
    const candidates = validIndex ? state.todos.filter((record) => {
      if (indexed && (record.id !== indexed.id || record.updatedAt !== indexed.updatedAt)) return false;
      if (!hasSelector && record.id !== priorId) return false;
      return !selectors(record).includes(false);
    }) : [];
    if (candidates.length !== 1) {
      const words = (value) => normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [];
      const queryWords = words(args.title ?? '');
      const options = candidates.length ? candidates : state.todos.map((record) => {
        const titleWords = words(record.title);
        const overlap = queryWords.filter((word) => titleWords.some((other) =>
          word === other || (word.length >= 4 && other.length >= 4 && word.slice(0, 4) === other.slice(0, 4)))).length;
        return { record, score: 2 * selectors(record).filter(Boolean).length + overlap / (queryWords.length || 1) };
      }).sort((a, b) => b.score - a.score || Number(a.record.completed) - Number(b.record.completed)
        || b.record.updatedAt - a.record.updatedAt).map(({ record }) => record);
      if (!options.length) return reply('В TODO пока нет задач.');
      const shown = options.slice(0, 5);
      const question = 'Какую задачу выбрать? Назови её номер.';
      return {
        ...reply(question + ' ' + shown.map((record, index) => (index + 1) + '. ' + describeTodo(record)).join('. '),
          { action, args, shownTodos: shown.map(todoDetails), choosingTodo: true }),
        list: { title: question, items: shown.map(t => item(t, describeTodo(t))), remaining: options.length - shown.length },
        todoReferences: shown.map(({ id, updatedAt }) => ({ id, updatedAt })),
        moreTodos: options.length > shown.length,
      };
    }
    [todo] = candidates;
  }
  if (action === 'delete_todo') {
    return {
      ...reply('Удалить задачу «' + describeTodo(todo) + '»? Скажи «да» или «отмена».'),
      pendingDeletion: { entity: 'todos', references: [{ id: todo.id, updatedAt: todo.updatedAt }] },
    };
  }
  if (action === 'update_todo') {
    const patch = {};
    if (args.stage !== undefined) {
      if (!['backlog', 'active'].includes(args.stage)) throw failure(422, 'Уточни колонку');
      patch.inProgress = args.stage === 'active';
      if (todo.completed) Object.assign(patch, { completed: false, completedAt: null, progress: 0 });
    }
    if (args.newTitle !== undefined) patch.title = capitalize(args.newTitle.trim());
    if (args.description !== undefined) patch.description = capitalize(args.description);
    if (args.subject !== undefined) patch.subjectId = subjectId;
    if (args.scheduledDate !== undefined) {
      if (args.scheduledDate !== 'clear') localTime(args.scheduledDate + 'T12:00');
      patch.scheduledDate = args.scheduledDate === 'clear' ? null : args.scheduledDate;
    }
    if (args.dueDate !== undefined) {
      patch.dueHasTime = args.dueDate.includes('T');
      patch.dueDate = args.dueDate === 'clear' ? null
        : iso(localTime(patch.dueHasTime ? args.dueDate : args.dueDate + 'T18:00'));
      if (patch.dueDate !== todo.dueDate) patch.autoUrgencyDismissed = false;
    }
    if (args.estMinutes !== undefined) {
      if (args.estMinutes !== 'clear' && !/^[1-9]\d*$/.test(args.estMinutes)) throw failure(422, 'Уточни длительность в минутах');
      patch.estMinutes = args.estMinutes === 'clear' ? null : Number(args.estMinutes);
      if (patch.estMinutes !== null && !Number.isSafeInteger(patch.estMinutes)) throw failure(422, 'Уточни длительность в минутах');
    }
    for (const [field, key] of [['importance', 'important'], ['urgency', 'urgent']]) {
      if (args[field] === undefined) continue;
      if (!['true', 'false'].includes(args[field])) throw failure(422, 'Уточни приоритет задачи');
      patch[key] = args[field] === 'true';
    }
    if (patch.urgent === true) patch.autoUrgencyDismissed = false;
    else if (patch.urgent === false) {
      const deadline = Date.parse(patch.dueDate === undefined ? todo.dueDate : patch.dueDate);
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, dateStyle: 'short' });
      patch.autoUrgencyDismissed = Number.isFinite(deadline) && date.format(deadline) <= date.format(now);
    }
    if (args.progress !== undefined) {
      if (!/^(?:100|[1-9]?\d)$/.test(args.progress)) throw failure(422, 'Укажи прогресс от 0 до 100 процентов');
      patch.progress = Number(args.progress);
      patch.completed = patch.progress === 100;
      if (patch.completed !== todo.completed) patch.completedAt = patch.completed ? iso(now) : null;
    }
    if (args.reminderAt !== undefined) {
      patch.reminders = args.reminderAt === 'clear' ? [] : [...(todo.reminders ?? []),
        { at: iso(localTime(args.reminderAt)) }];
    }
    if (!Object.keys(patch).length) return reply('Что изменить в задаче «' + todo.title + '»?');
    save('todos', [{ id: todo.id, updatedAt: todo.updatedAt, ...patch }]);
    if (patch.subjectId !== undefined && patch.subjectId !== todo.subjectId) {
      const title = patch.title ?? todo.title;
      const subject = state.subjects.find((record) => record.id === patch.subjectId);
      save('events', state.events.filter((event) => event.kind === 'plan' && event.taskId === todo.id)
        .map((event) => ({ id: event.id, updatedAt: event.updatedAt, subjectId: patch.subjectId,
          title: subject?.name ?? title, ...(subject && !event.description ? { description: title } : {}) })));
    }
    const title = patch.title ?? todo.title;
    return { ...reply('Обновлена задача: ' + title, { action, args: { ...args, title } }), todoReference: todo.id };
  }
  if (action === 'plan_todo') {
    const start = localTime(args.start);
    const duration = args.estMinutes === undefined ? todo.estMinutes || 60 : Number(args.estMinutes);
    if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 1440) throw failure(422, 'Уточни длительность блока');
    const subject = state.subjects.find(({ id }) => id === todo.subjectId);
    save('events', [{ id: base.id, uid: base.id + '@cdmm', createdAt: iso(now), kind: 'plan',
      subjectId: subject?.id ?? '', title: subject?.name ?? todo.title, description: subject ? todo.title : undefined,
      taskId: todo.id, start: iso(start), end: iso(start + duration * 60000) }]);
    const date = args.start.slice(0, 10);
    if (todo.scheduledDate && todo.scheduledDate !== date) {
      save('todos', [{ id: todo.id, updatedAt: todo.updatedAt, scheduledDate: date }]);
    }
    return { ...reply('Задача добавлена в календарь: ' + todo.title + ', ' + args.start.replace('T', ' ')),
      todoReference: todo.id };
  }
  if (action === 'complete_todo' || action === 'reopen_todo') {
    const completed = action === 'complete_todo';
    setTodoDone(db, userId, todo.id, completed, now);
    return { ...reply((completed ? 'Выполнено: ' : 'Снова открыта задача: ') + todo.title), todoReference: todo.id };
  }
  const showTime = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, timeStyle: 'short' });
  const label = (event) => event.title || state.subjects.find((subject) => subject.id === event.subjectId)?.name || 'Событие';
  const describe = (event) => label(event) + ' ' + showTime.format(new Date(event.start)) + '–' + showTime.format(new Date(event.end));
  if (action === 'list_todos') {
    const quadrant = args.quadrant ?? 'all';
    const prior = args.targetIndex ? latestAssistantResult(db, userId, zone)?.todoReferences?.[Number(args.targetIndex) - 1] : null;
    const at = args.at ? localTime(args.at) : null;
    const deadlineAt = args.deadlineAt ? localTime(args.deadlineAt) : null;
    const planned = new Map();
    if (at !== null) {
      for (const event of state.events) {
        if (event.kind === 'plan' && event.taskId && Math.floor(Date.parse(event.start) / 60_000) === at / 60_000) planned.set(event.taskId, event);
      }
    }
    const targeted = todoSelectors.some((key) => args[key] !== undefined) || at !== null || deadlineAt !== null;
    if (!Object.hasOwn(todoQuadrants, quadrant)) throw failure(422, 'Уточни квадрант TODO');
    if (args.scheduledDate) localTime(args.scheduledDate + 'T12:00');
    const today = day.format(now);
    const dueAt = (todo) => Date.parse(todo.dueDate) || Infinity;
    if (args.status && !['open', 'active', 'completed'].includes(args.status)) throw failure(422, 'Уточни статус задач');
    const tasks = state.todos.filter((todo) => {
      const details = todoDetails(todo);
      if (args.targetIndex && (prior?.id !== todo.id || prior.updatedAt !== todo.updatedAt)) return false;
      if (args.title && !normalize(todo.title).includes(normalize(args.title))) return false;
      if (args.targetEstimate && todo.estMinutes !== Number(args.targetEstimate)) return false;
      if (args.targetDate && todo.scheduledDate !== args.targetDate) return false;
      if (args.targetDeadline && (args.targetDeadline.includes('T') ? details.dueDate !== args.targetDeadline
        : details.dueDate?.slice(0, 10) !== args.targetDeadline)) return false;
      if (args.targetDescription && !normalize(todo.description ?? '').includes(normalize(args.targetDescription))) return false;
      if (args.targetSubject && normalize(details.subject ?? '') !== normalize(args.targetSubject)) return false;
      if (at !== null && !planned.has(todo.id)) return false;
      if (deadlineAt !== null && (!todo.dueHasTime || Math.floor(dueAt(todo) / 60_000) !== deadlineAt / 60_000)) return false;
      if (args.status === 'active' && !todo.inProgress) return false;
      if (args.status && Boolean(todo.completed) !== (args.status === 'completed')) return false;
      const urgent = todo.urgent || (!todo.completed && !todo.autoUrgencyDismissed &&
        dueAt(todo) !== Infinity && day.format(dueAt(todo)) <= today);
      const group = todo.important ? (urgent ? 'both' : 'important') : (urgent ? 'urgent' : 'neither');
      return (!args.scheduledDate || todo.scheduledDate === args.scheduledDate) && (quadrant === 'all' || quadrant === group);
    }).sort((first, second) => Number(first.completed) - Number(second.completed) || dueAt(first) - dueAt(second));
    if (!tasks.length && targeted) return reply('По этому запросу задач не нашлось.');
    const describeMatch = (todo) => {
      const event = planned.get(todo.id);
      const details = describeTodo(todo, args.scheduledDate, targeted && at === null && deadlineAt === null);
      return event ? details + ', в календаре ' + showTime.format(new Date(event.start)) + '–' + showTime.format(new Date(event.end)) : details;
    };
    if (tasks.length === 1 && targeted) {
      const [match] = tasks;
      return { ...reply(describeMatch(match), { action, args, shownTodos: [todoDetails(match)] }),
        todoReference: match.id, todoReferences: [{ id: match.id, updatedAt: match.updatedAt }] };
    }
    if (!tasks.length && args.status === 'active') return reply('В работе пока нет задач.');
    if (!tasks.length) return reply('Задач ' + todoQuadrants[quadrant] + ' нет.');
    const listed = tasks.slice(0, 12);
    const shown = listed.map(todoDetails);
    const summary = listed.map((todo, index) => (index + 1) + '. ' + describeMatch(todo));
    const remaining = tasks.length - shown.length;
    return {
      ...reply('Задачи ' + todoQuadrants[quadrant] + ': ' + summary.join('. ') +
        (remaining ? '. Ещё задач: ' + remaining : ''), { action, args, shownTodos: shown }),
      list: { title: (args.status === 'active' ? 'В работе' : args.status === 'open' ? 'Открытые задачи' : args.status === 'completed' ? 'Выполненные задачи' : 'Задачи') + (quadrant === 'all' ? '' : ' ' + todoQuadrants[quadrant]) + (args.scheduledDate ? ' · ' + args.scheduledDate : ''), items: listed.map(t => item(t, describeMatch(t))), remaining },
      moreTodos: remaining > 0,
      todoReferences: listed.map(({ id, updatedAt }) => ({ id, updatedAt })),
    };
  }
  if (action === 'delete_listed_todos') {
    const previous = latestAssistantResult(db, userId, zone);
    const references = previous?.todoReferences;
    if (!references?.length || previous.context?.choosingTodo) return reply('Сначала попроси показать список TODO, который хочешь удалить.');
    return {
      ...reply('Удалить перечисленные задачи TODO (' + references.length + ')? Скажи «да» или «отмена».'),
      pendingDeletion: { entity: 'todos', references },
    };
  }
  if (action === 'cancel_delete') return reply('Удаление отменено');
  if (action === 'confirm_delete') {
    const pending = latestAssistantResult(db, userId, zone)?.pendingDeletion;
    if (!pending) return reply('Сейчас нет удаления, ожидающего подтверждения. Повтори команду удаления с названием.');
    if (pending.entity === 'todos') {
      const current = new Map(state.todos.map((todo) => [todo.id, todo.updatedAt]));
      if (pending.references.some(({ id, updatedAt }) => current.get(id) !== updatedAt)) {
        return reply('Список изменился. Запроси его снова перед удалением.');
      }
      applyChanges(db, userId, { tombstones: pending.references.map(({ id, updatedAt }) => ({
        entity: 'todos', key: id, updatedAt: Math.max(now, updatedAt + 1),
      })) });
      return reply('Удалено задач TODO: ' + pending.references.length);
    }
    if (pending.entity === 'subjects') {
      const subject = state.subjects.find(({ id }) => id === pending.id);
      if (!subject || subject.updatedAt !== pending.updatedAt) {
        return reply('Предмет уже изменён или удалён. Если нужно, запроси удаление заново.');
      }
      applyChanges(db, userId, { tombstones: [{
        entity: 'subjects', key: subject.id, updatedAt: Math.max(now, subject.updatedAt + 1),
      }] });
      return reply('Удалён предмет: ' + subject.name);
    }
    const references = pending.entity === 'events' ? pending.references : [pending];
    const eventsById = new Map(state.events.map((event) => [event.id, event]));
    const selection = references.map(({ id }) => eventsById.get(id));
    if (selection.some((event, index) => !event || event.updatedAt !== references[index].updatedAt)) {
      return reply('Выбранные события уже изменились. Если нужно, запроси удаление заново.');
    }
    const eventEdits = selection.filter((event) => event.kind === 'plan' && event.countInStats !== false &&
      !(Date.parse(event.createdAt) + 10 * 60_000 > now)).map((event) => ({
      id: randomUUID(), eventId: event.id, at: now, title: event.title, subjectId: event.subjectId,
      fromStart: event.start, fromEnd: event.end, toStart: event.start, toEnd: event.end,
      kind: 'plan', countInStats: true, deleted: true,
    }));
    applyChanges(db, userId, {
      eventEdits,
      tombstones: selection.map((event) => ({
        entity: 'events', key: event.id, updatedAt: Math.max(now, event.updatedAt + 1),
      })),
    });
    return reply(selection.length === 1 ? 'Удалено: ' + describe(selection[0]) : 'Удалено событий: ' + selection.length);
  }
  const selectOccurrences = (event, scope = 'single') => {
    if (!['single', 'following', 'series'].includes(scope)) throw failure(422, 'Уточни, какие повторения изменить');
    if (scope === 'single') return [event];
    if (!event.recurrenceId) throw failure(422, 'У этого события нет серии повторений');
    return state.events.filter((record) => record.recurrenceId === event.recurrenceId &&
      (scope === 'series' || Date.parse(record.start) >= Date.parse(event.start)));
  };
  const requestEventDeletion = (event) => {
    const selected = selectOccurrences(event, args.scope);
    const scope = selected.length > 1 ? 'события (' + selected.length + '), включая ' :
      event.recurrenceId ? 'только это повторение — ' : 'событие — ';
    return {
      ...reply('Удалить ' + scope + day.format(new Date(event.start)) + ', ' + describe(event) + '? Скажи «да» или «отмена».'),
      pendingDeletion: { entity: 'events', references: selected.map(({ id, updatedAt }) => ({ id, updatedAt })) },
    };
  };
  if (action === 'delete_referenced_event') {
    const previous = latestAssistantResult(db, userId, zone);
    const reference = previous?.eventReference;
    if (!reference) return reply('Укажи название или время события, которое нужно удалить.');
    const event = state.events.find(({ id }) => id === reference.id);
    if (!event || event.updatedAt !== reference.updatedAt) {
      return reply('Событие уже изменено или удалено. Обнови расписание и повтори запрос.');
    }
    return requestEventDeletion(event);
  }
  if (action === 'delete_event') {
    if (args.date) localTime(args.date + 'T12:00');
    if (args.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(args.time)) throw failure(422, 'Уточни время начала');
    const matches = state.events.filter((event) => normalize(label(event)) === normalize(args.title) &&
      (!args.date || day.format(new Date(event.start)) === args.date) &&
      (!args.time || showTime.format(new Date(event.start)) === args.time));
    if (!matches.length) return reply('Событие «' + args.title + '» не найдено. Уточни название, дату или время.');
    if (matches.length > 1 && args.scope === 'series' && matches[0].recurrenceId &&
      matches.every((event) => event.recurrenceId === matches[0].recurrenceId)) return requestEventDeletion(matches[0]);
    if (matches.length > 1) {
      const options = matches.slice(0, 4).map((event) => day.format(new Date(event.start)) + ' ' + describe(event));
      return { ...reply('Нашёл несколько событий. Уточни дату и время: ' + options.join(', ')),
        list: { title: 'Уточни дату и время', items: options.map((text, i) => item(matches[i], text)), remaining: matches.length - options.length } };
    }
    return requestEventDeletion(matches[0]);
  }
  if (action === 'create_event') {
    const start = localTime(args.start);
    const end = localTime(args.end);
    if (end <= start) throw failure(422, 'Конец события должен быть после начала');
    const kind = args.kind ?? 'plan';
    if (!['plan', 'real'].includes(kind) || (kind === 'real' && !subjectId)) throw failure(422, 'Для фактического события укажи предмет');
    const event = { ...base, uid: base.id + '@cdmm', kind, start: iso(start), end: iso(end) };
    if (!args.repeat) save('events', [event]);
    else {
      if (!['daily', 'weekly', 'monthly', 'yearly'].includes(args.repeat) || !args.until) throw failure(422, 'Укажи частоту повторения и дату окончания');
      localTime(args.until + 'T12:00');
      if (args.until < args.start.slice(0, 10)) throw failure(422, 'Дата окончания серии раньше первого события');
      const advance = (date) => {
        if (args.repeat === 'daily' || args.repeat === 'weekly') date.setUTCDate(date.getUTCDate() + (args.repeat === 'daily' ? 1 : 7));
        else {
          const wanted = date.getUTCDate();
          date.setUTCDate(1);
          date.setUTCMonth(date.getUTCMonth() + (args.repeat === 'monthly' ? 1 : 12));
          const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
          date.setUTCDate(Math.min(wanted, last));
        }
      };
      const occurrences = [event];
      const civilStart = new Date(args.start + 'Z');
      const civilEnd = new Date(args.end + 'Z');
      const recurrenceId = randomUUID();
      for (let index = 1; index <= 100; index++) {
        advance(civilStart);
        advance(civilEnd);
        const next = civilStart.toISOString().slice(0, 16);
        if (next.slice(0, 10) > args.until) break;
        if (index === 100) throw failure(422, 'Серия превышает 100 событий. Укажи более раннюю дату.');
        const id = randomUUID();
        const nextStart = localTime(next);
        const nextEnd = localTime(civilEnd.toISOString().slice(0, 16));
        if (nextEnd <= nextStart) throw failure(422, 'Уточни длительность повторяющихся событий');
        occurrences.push({ ...event, id, uid: id + '@cdmm', recurrenceId, start: iso(nextStart), end: iso(nextEnd) });
      }
      if (occurrences.length > 1) event.recurrenceId = recurrenceId;
      save('events', occurrences);
      return reply('Добавлено событий: ' + occurrences.length + '. Первое: ' + describe(event));
    }
    return reply('Добавлено на ' + args.start.slice(0, 10) + ': ' + describe(event));
  }
  if (action === 'update_event' || action === 'duplicate_event') {
    if (args.date) localTime(args.date + 'T12:00');
    const matches = state.events.filter((event) => normalize(label(event)) === normalize(args.title) &&
      (!args.date || day.format(new Date(event.start)) === args.date) &&
      (!args.time || showTime.format(new Date(event.start)) === args.time));
    if (!matches.length) return reply('Событие «' + args.title + '» не найдено.');
    if (matches.length > 1) return reply('Нашёл несколько событий «' + args.title + '». Повтори команду и укажи дату.');
    const [event] = matches;
    const duplicate = action === 'duplicate_event';
    const patch = {};
    if (args.newTitle !== undefined) patch.title = capitalize(args.newTitle.trim());
    if (args.description !== undefined) patch.description = capitalize(args.description);
    if (args.start !== undefined) {
      patch.start = iso(localTime(args.start));
      if (args.end === undefined) patch.end = iso(Date.parse(patch.start) + Date.parse(event.end) - Date.parse(event.start));
    }
    if (args.end !== undefined) patch.end = iso(localTime(args.end));
    const duration = Number(args.durationMinutes);
    if (args.durationMinutes !== undefined) {
      if (!/^[1-9]\d{0,7}$/.test(args.durationMinutes) || args.end !== undefined) {
        throw failure(422, 'Уточни длительность события в минутах');
      }
      patch.end = iso(Date.parse(patch.start ?? event.start) + duration * 60_000);
    }
    if (Date.parse(patch.end ?? event.end) <= Date.parse(patch.start ?? event.start)) throw failure(422, 'Конец события должен быть после начала');
    if (args.notifyBefore !== undefined) {
      if (args.notifyBefore !== 'clear' && !/^\d{1,5}$/.test(args.notifyBefore)) throw failure(422, 'Уточни напоминание в минутах');
      patch.notifyBefore = args.notifyBefore === 'clear' ? null : Number(args.notifyBefore);
      patch.notifyExtra = null;
    }
    if (!Object.keys(patch).length) return reply('Что изменить в событии «' + label(event) + '»?');
    const updated = { ...event, ...patch };
    if (duplicate) Object.assign(updated, { title: capitalize(label(updated)), id: base.id, uid: base.id + '@cdmm', recurrenceId: null, taskId: null, createdAt: iso(now) });
    const selection = duplicate ? [event] : selectOccurrences(event, args.scope);
    const startShift = patch.start ? Date.parse(patch.start) - Date.parse(event.start) : 0;
    const endShift = patch.end ? Date.parse(patch.end) - Date.parse(event.end) : 0;
    const changes = selection.map((record) => record.id === event.id ? updated : {
      ...record, ...patch, start: iso(Date.parse(record.start) + startShift), end: iso(args.durationMinutes === undefined
        ? Date.parse(record.end) + endShift
        : Date.parse(record.start) + startShift + duration * 60_000),
    });
    if (changes.some((record) => Date.parse(record.end) <= Date.parse(record.start))) throw failure(422, 'У одного из повторений конец окажется раньше начала');
    save('events', changes);
    return reply(changes.length > 1 ? 'Обновлено событий: ' + changes.length
      : (duplicate ? 'Скопировано: ' : 'Обновлено: ') + describe(updated));
  }
  localTime(args.date + 'T12:00');
  if (action === 'find_free_time') {
    const from = localTime(args.date + 'T' + (args.from ?? '09:00'));
    const to = localTime(args.date + 'T' + (args.to ?? '21:00'));
    const duration = Number(args.durationMinutes ?? 30);
    if (to <= from || !Number.isInteger(duration) || duration < 1 || duration > 1440) {
      throw failure(422, 'Уточни период и длительность свободного окна');
    }
    const busy = state.events.map((event) => [Date.parse(event.start), Date.parse(event.end)])
      .filter(([start, end]) => start < to && end > from && end > start)
      .sort(([a], [b]) => a - b);
    const slots = [];
    let cursor = from;
    for (const [start, end] of [...busy, [to, to]]) {
      if (start - cursor >= duration * 60_000) slots.push(showTime.format(cursor) + '–' + showTime.format(start));
      cursor = Math.max(cursor, end);
    }
    if (!slots.length) return reply('В это время свободного окна на ' + duration + ' мин. нет.');
    const shown = slots.slice(0, 5);
    return reply('Свободное время: ' + shown.join(', ') +
      (slots.length > shown.length ? '. Ещё окон: ' + (slots.length - shown.length) : ''));
  }
  if (action === 'list_schedule') {
    const { time, timeMatch = 'start', title } = args;
    if (!['start', 'active'].includes(timeMatch)) throw failure(422, 'Уточни время события');
    const at = time ? localTime(args.date + 'T' + time) : null;
    const events = state.events.filter((event) => {
      if (title && !normalize(label(event)).includes(normalize(title))) return false;
      if (subjectId && event.subjectId !== subjectId) return false;
      const start = Date.parse(event.start);
      if (at === null) return day.format(start) === args.date;
      if (timeMatch === 'active') return start <= at && at < Date.parse(event.end);
      return day.format(start) === args.date && showTime.format(start) === time;
    }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const shown = events.slice(0, 8);
    const shownEvents = shown.map((event) => ({
      title: label(event), date: day.format(new Date(event.start)), time: showTime.format(new Date(event.start)),
    }));
    const remaining = events.length - shown.length;
    const empty = time ? 'В ' + time + ' подходящих событий нет.' : 'На этот день подходящих событий нет.';
    const result = reply(shown.map(describe).join('. ') + (remaining ? '. Ещё событий: ' + remaining : '') || empty,
      { action, args, shownEvents });
    if (events.length === 1) {
      result.eventReference = { id: events[0].id, updatedAt: events[0].updatedAt };
    }
    if ((!time && !title && !subjectId) || events.length > 1) {
      result.list = { title: 'Расписание · ' + args.date + (time ? ' · ' + time : ''), items: shown.map(e => item(e, describe(e))), remaining };
    }
    return result;
  }
  const events = state.events.filter((event) => day.format(new Date(event.start)) === args.date)
    .sort((first, second) => Date.parse(first.start) - Date.parse(second.start));
  const moved = (event, start) => {
    if (event.recurrenceId || event.kind !== 'plan') throw failure(422, 'Этот прототип переносит отдельные плановые события');
    const duration = Date.parse(event.end) - Date.parse(event.start);
    return { ...event, start: iso(start), end: iso(start + duration) };
  };
  if (action === 'move_event') {
    const candidates = args.time ? events.filter((event) => showTime.format(new Date(event.start)) === args.time) : events;
    const event = moved(find(candidates, args.title, label), localTime(args.start));
    save('events', [event]);
    return reply('Перенесено на ' + args.start.slice(0, 10) + ': ' + describe(event),
      { action, args: { title: label(event), date: args.start.slice(0, 10), start: args.start } });
  }
  const select = (key) => /^\d+$/.test(key) ? events[Number(key) - 1] : find(events, key, label);
  const pair = [select(args.first), select(args.second)];
  if (!pair[0] || !pair[1] || pair[0].id === pair[1].id) throw failure(422, 'Укажи два разных события');
  pair.sort((first, second) => Date.parse(first.start) - Date.parse(second.start));
  const [first, second] = pair;
  const newSecond = moved(second, Date.parse(first.start));
  const newFirst = moved(first, Date.parse(first.start) + Date.parse(second.end) - Date.parse(first.end));
  const changed = [newSecond, newFirst];
  if (changed.some((event, index) => [...changed.slice(index + 1), ...state.events.filter((other) => !pair.includes(other))]
    .some((other) => Date.parse(event.start) < Date.parse(other.end) && Date.parse(other.start) < Date.parse(event.end)))) {
    throw failure(422, 'Перестановка приведёт к пересечению событий');
  }
  save('events', changed);
  return reply('Порядок изменён: ' + changed.map(describe).join(', '));
}
