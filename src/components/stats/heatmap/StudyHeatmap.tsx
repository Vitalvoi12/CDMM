import type { StudyHeatmapDay } from '../../../utils/stats';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useTheme } from '../../../hooks/useTheme';
import { DesktopStudyHeatmap } from './DesktopStudyHeatmap';
import { MobileStudyHeatmap } from './MobileStudyHeatmap';

interface StudyHeatmapProps {
  days: StudyHeatmapDay[];
  year: number;
  onPrevYear: () => void;
  onNextYear: () => void;
}

/**
 * Presentation dispatcher: desktop and mobile share the same aggregated
 * heatmap data (see useStudyStatistics) but render completely different
 * layouts. Mobile is a 3x4 monthly grid — never a shrunken yearly graph.
 */
export function StudyHeatmap({ days, year, onPrevYear, onNextYear }: StudyHeatmapProps) {
  const isMobile = useIsMobile();
  const { theme } = useTheme();

  if (isMobile) {
    return <MobileStudyHeatmap days={days} year={year} onPrevYear={onPrevYear} onNextYear={onNextYear} />;
  }
  return <DesktopStudyHeatmap days={days} year={year} theme={theme} />;
}
