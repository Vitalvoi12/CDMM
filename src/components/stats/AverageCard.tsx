import { formatDuration } from '../../utils/time';

interface AverageCardProps {
  averageMinutes: number;
}

export function AverageCard({ averageMinutes }: AverageCardProps) {
  return (
    <div className="bg-primary rounded-xl p-6 shadow-xl text-on-primary flex flex-col justify-between h-full relative overflow-hidden">
      <div className="absolute -right-8 -bottom-8 opacity-10">
        <span className="material-symbols-outlined text-[120px]">timer</span>
      </div>
      <div>
        <h3 className="font-label-md text-label-md uppercase tracking-widest text-on-primary/70 mb-2">
          Daily Average
        </h3>
        <p className="font-headline-lg text-headline-lg">{formatDuration(averageMinutes)}</p>
      </div>
      <div className="mt-8">
        <svg className="w-full h-12 text-on-primary" preserveAspectRatio="none" viewBox="0 0 100 30">
          <path
            d="M0,30 L0,15 C10,15 20,5 30,10 C40,15 50,25 60,20 C70,15 80,5 90,10 C95,12.5 100,20 100,20 L100,30 Z"
            fill="currentColor"
            opacity="0.3"
          />
          <path
            d="M0,15 C10,15 20,5 30,10 C40,15 50,25 60,20 C70,15 80,5 90,10 C95,12.5 100,20 100,20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
}
