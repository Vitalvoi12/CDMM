import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Subject, TodoTask } from '../../types';
import { formatDueLabel } from './TodoRows';
import { TodoCheckbox } from './TodoCheckbox';
import { TaskProgress } from '../common/TaskProgress';

const columns = [
  { key: 'backlog', title: 'To do', icon: 'radio_button_unchecked' },
  { key: 'active', title: 'In progress', icon: 'timelapse' },
  { key: 'done', title: 'Done', icon: 'check_circle' },
] as const;
export type Stage = typeof columns[number]['key'];
export const stageOf = (task: TodoTask): Stage => task.completed ? 'done' : task.inProgress ? 'active' : 'backlog';

interface Props {
  tasks: TodoTask[];
  subjects: Subject[];
  onOpen: (task: TodoTask) => void;
  onMove: (id: string, stage: Stage) => void;
  onToggle: (id: string, completed: boolean) => void;
  onAdd: () => void;
}
const dragType = 'application/x-cdmm-todo';
const iconButton = 'grid size-9 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary';

export function KanbanBoard({ tasks, subjects, onOpen, onMove, onToggle, onAdd }: Props) {
  const [hover, setHover] = useState<Stage | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const point = useRef<{ x: number; y: number } | null>(null);
  const touch = useRef<{ id: string; pointerId: number; startX: number; startY: number; active: boolean } | null>(null);
  const [preview, setPreview] = useState<{ title: string; x: number; y: number } | null>(null);

  function stopScroll() {
    point.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }

  useEffect(() => stopScroll, []);

  function columnAt(x: number, y: number) {
    const column = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-kanban-stage]');
    return column && board.current?.contains(column) ? column : null;
  }

  function updateDrag(x: number, y: number) {
    point.current = { x, y };
    if (frame.current !== null) return;

    function tick() {
      const root = board.current;
      const position = point.current;
      if (!root || !position) {
        frame.current = null;
        return;
      }
      const column = columnAt(position.x, position.y);
      setHover((column?.dataset.kanbanStage as Stage | undefined) ?? null);
      const scroller = getComputedStyle(root).overflowY === 'auto'
        ? root
        : column?.querySelector<HTMLElement>('[data-kanban-cards]');
      if (scroller && scroller.scrollHeight > scroller.clientHeight) {
        const { top, bottom } = scroller.getBoundingClientRect();
        const edge = Math.min(72, (bottom - top) / 3);
        const down = Math.max(0, Math.min(1, (position.y - bottom + edge) / edge));
        const up = Math.max(0, Math.min(1, (top + edge - position.y) / edge));
        scroller.scrollTop += Math.round((down - up) * 16);
      }
      frame.current = requestAnimationFrame(tick);
    }

    frame.current = requestAnimationFrame(tick);
  }

  function startTouch(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.pointerType === 'mouse' || !event.isPrimary || touch.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    touch.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false };
  }

  function moveTouch(event: PointerEvent<HTMLButtonElement>, title: string) {
    const drag = touch.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { clientX: x, clientY: y } = event;
    if (!drag.active && Math.hypot(x - drag.startX, y - drag.startY) < 8) return;
    drag.active = true;
    setPreview({ title, x, y });
    updateDrag(x, y);
  }

  function finishTouch(event: PointerEvent<HTMLButtonElement>, drop: boolean) {
    const drag = touch.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    touch.current = null;
    stopScroll();
    setHover(null);
    setPreview(null);
    if (!drop || !drag.active) return;
    const stage = columnAt(event.clientX, event.clientY)?.dataset.kanbanStage as Stage | undefined;
    if (stage) onMove(drag.id, stage);
  }

  return <div ref={board}
    onDragOver={e => { if (e.dataTransfer.types.includes(dragType)) { e.preventDefault(); updateDrag(e.clientX, e.clientY); } }}
    onDragLeave={e => {
      if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
        stopScroll();
        setHover(null);
      }
    }}
    className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-hidden lg:px-0">
    {preview && <div aria-hidden="true" className="pointer-events-none fixed z-[110] max-w-52 -translate-x-1/2 -translate-y-full truncate rounded-lg border border-primary bg-surface-container px-3 py-2 shadow-elev-1"
      style={{ left: preview.x, top: preview.y - 12 }}>{preview.title}</div>}
    {columns.map(({ key, title, icon }, index) => {
      const cards = tasks.filter(t => stageOf(t) === key);
      return <section key={key} aria-label={title} data-kanban-stage={key}
        onDrop={e => {
          const id = e.dataTransfer.getData(dragType);
          if (!id) return;
          e.preventDefault();
          stopScroll();
          setHover(null);
          onMove(id, key);
        }}
        className={'flex min-h-0 min-w-0 shrink-0 flex-col rounded-2xl border bg-surface-container-lowest p-4 shadow-elev-1 ' + (hover === key ? 'border-primary' : 'border-outline-variant')}>
        <header className="mb-3 flex min-h-9 items-center gap-2">
          <span aria-hidden="true" className={'material-symbols-outlined text-[18px] ' + (key === 'active' ? 'text-primary' : 'text-on-surface-variant')}>{icon}</span>
          <h2 className="text-section">{title}</h2>
          <span className="text-caption tabular-nums text-on-surface-variant">{cards.length}</span>
          {key === 'backlog' && <button className={iconButton + ' ml-auto'} aria-label="Add task" onClick={onAdd}><span className="material-symbols-outlined">add</span></button>}
        </header>
        <div data-kanban-cards className="flex min-h-0 flex-col gap-2 pb-2 lg:overflow-y-auto">
          {cards.map(task => {
            const subject = subjects.find(s => s.id === task.subjectId);
            return <article key={task.id} draggable onDragStart={e => {
              if (touch.current) { e.preventDefault(); return; }
              e.dataTransfer.setData(dragType, task.id);
              e.dataTransfer.effectAllowed = 'move';
            }} onDragEnd={() => { stopScroll(); setHover(null); }}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 hover:border-outline">
              <div className="flex min-h-9 items-center gap-3">
                <TodoCheckbox task={task} onToggle={onToggle}/>
                <button className={'min-w-0 flex-1 break-words text-left font-body-md ' + (task.completed ? 'text-on-surface-variant line-through' : 'text-on-surface')} onClick={() => onOpen(task)}>
                  {task.title}
                  {!task.completed && !!task.progress && <TaskProgress value={task.progress}/>}
                </button>
              </div>
              <div className="flex items-center gap-1 text-caption text-on-surface-variant">
                {subject && <><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: subject.color }}/><span className="truncate">{subject.name}</span></>}
                {task.dueDate && <span className="ml-1 truncate">{formatDueLabel(task.dueDate, task.completed, task.dueHasTime)}</span>}
                <div className="ml-auto flex">
                  <button type="button" className={iconButton + ' touch-none select-none [@media(pointer:fine)]:hidden'}
                    aria-label={'Drag ' + task.title}
                    onPointerDown={e => startTouch(e, task.id)}
                    onPointerMove={e => moveTouch(e, task.title)}
                    onPointerUp={e => finishTouch(e, true)}
                    onPointerCancel={e => finishTouch(e, false)}
                    onLostPointerCapture={e => finishTouch(e, false)}
                    onContextMenu={e => e.preventDefault()}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">drag_indicator</span>
                  </button>
                  {columns.map((target, i) => Math.abs(i - index) === 1 && <button key={target.key} className={iconButton} title={'Move to ' + target.title} aria-label={'Move ' + task.title + ' to ' + target.title} onClick={() => onMove(task.id, target.key)}>
                    <span className="material-symbols-outlined rotate-90 text-[16px] lg:rotate-0">{i < index ? 'arrow_back' : 'arrow_forward'}</span>
                  </button>)}
                </div>
              </div>
            </article>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
