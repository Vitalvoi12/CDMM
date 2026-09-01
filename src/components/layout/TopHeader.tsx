export function TopHeader() {
  return (
    <header className="fixed top-0 left-72 right-0 h-20 bg-background/80 backdrop-blur-xl z-40 flex items-center justify-end px-16 gap-6 max-lg:hidden">
      <button className="p-2 text-on-surface-variant hover:text-primary transition-colors">
        <span className="material-symbols-outlined">search</span>
      </button>
      <button className="p-2 text-on-surface-variant hover:text-primary transition-colors">
        <span className="material-symbols-outlined">notifications</span>
      </button>
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center ml-2">
        <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
      </div>
    </header>
  );
}
