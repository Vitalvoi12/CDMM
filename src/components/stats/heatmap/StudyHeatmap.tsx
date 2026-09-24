import type { StudyHeatmapDay, HeatmapRange } from '../../../utils/stats';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useTheme } from '../../../hooks/useTheme';
import { DesktopStudyHeatmap } from './DesktopStudyHeatmap';
import { MobileStudyHeatmap } from './MobileStudyHeatmap';

interface StudyHeatmapProps {
  days: StudyHeatmapDay[];
  range: HeatmapRange;
}

/**
 * Presentation dispatcher: desktop and mobile share the same aggregated
 * heatmap data (see useStudyStatistics) but render completely different
 * layouts. Mobile is a 4xN monthly grid — never a shrunken yearly graph.
 * The range picker lives in the page header (HeatmapRangeSelect).
 */
export function StudyHeatmap({ days, range }: StudyHeatmapProps) {
  const isMobile = useIsMobile();
  const { theme } = useTheme();

  if (isMobile) {
    return <MobileStudyHeatmap days={days} range={range} />;
  }
  return <DesktopStudyHeatmap days={days} range={range} theme={theme} />;
}
