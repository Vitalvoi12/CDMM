import type { TodoTask } from '../../types';

export function TodoCheckbox({
  task,
  onToggle,
}: {
  task: TodoTask;
  onToggle: (id: string, completed: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={task.completed}
      aria-label={task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(task.id, !task.completed);
      }}
      className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        task.completed
          ? 'bg-primary border-primary text-on-primary'
          : 'border-outline hover:border-primary bg-transparent'
      }`}
    >
      {task.completed && <span className="material-symbols-outlined text-[11px] leading-none">check</span>}
    </button>
  );
}
