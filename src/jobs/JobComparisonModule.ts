/**
 * JobComparisonModule
 * Compares scheduled jobs vs available jobs
 * 
 * Provides:
 * - New opportunities (available jobs not in schedule)
 * - Conflicts (overlapping dates/buildings)
 * - Match recommendations
 * - Gap analysis
 */

export interface ComparisonResult {
  newOpportunities: any[];
  conflicts: Array<{
    available: any;
    scheduled: any;
    reason: string;
  }>;
  recommendations: string[];
  summary: {
    totalScheduled: number;
    totalAvailable: number;
    newOpportunities: number;
    conflicts: number;
  };
}

class JobComparisonModule {
  /**
   * Parse date string to Date object
   */
  private parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    try {
      return new Date(dateStr);
    } catch {
      return null;
    }
  }

  /**
   * Check if two date ranges overlap
   */
  private datesOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date
  ): boolean {
    return start1 <= end2 && start2 <= end1;
  }

  /**
   * Get building ID from job
   */
  private getBuildingId(job: any): number | null {
    return job.schedules?.[0]?.building?.id || null;
  }

  /**
   * Get date range from job
   */
  private getDateRange(job: any): { start: Date; end: Date } | null {
    const startStr = job.startDate || job.date;
    const endStr = job.endDate || job.date;

    const start = this.parseDate(startStr);
    const end = this.parseDate(endStr);

    if (!start || !end) return null;
    return { start, end };
  }

  /**
   * Compare scheduled jobs with available jobs
   */
  public compare(
    scheduledJobs: any[],
    availableJobs: any[]
  ): ComparisonResult {
    const newOpportunities: any[] = [];
    const conflicts: Array<{
      available: any;
      scheduled: any;
      reason: string;
    }> = [];
    const recommendations: string[] = [];

    // Check each available job
    for (const available of availableJobs) {
      const availableBuilding = this.getBuildingId(available);
      const availableDateRange = this.getDateRange(available);

      if (!availableDateRange) continue;

      let hasConflict = false;

      // Check against each scheduled job
      for (const scheduled of scheduledJobs) {
        const scheduledBuilding = this.getBuildingId(scheduled);
        const scheduledDateRange = this.getDateRange(scheduled);

        if (!scheduledDateRange) continue;

        // Check for same-date conflicts (even at different buildings)
        if (
          this.datesOverlap(
            availableDateRange.start,
            availableDateRange.end,
            scheduledDateRange.start,
            scheduledDateRange.end
          )
        ) {
          const buildingName = scheduled.schedules?.[0]?.building?.name || "Unknown";
          const reason =
            availableBuilding === scheduledBuilding
              ? `Same building (${buildingName}) on overlapping dates: ${scheduledDateRange.start.toLocaleDateString()} to ${scheduledDateRange.end.toLocaleDateString()}`
              : `Already scheduled on same date (${scheduledDateRange.start.toLocaleDateString()}) at ${buildingName} - potential double-booking`;

          conflicts.push({
            available,
            scheduled,
            reason
          });
          hasConflict = true;
          break; // Don't check other scheduled jobs if already found a conflict
        }
      }

      // If no conflict, it's a new opportunity
      if (!hasConflict) {
        newOpportunities.push(available);
      }
    }

    // Generate recommendations
    this.generateRecommendations(
      scheduledJobs,
      newOpportunities,
      recommendations
    );

    return {
      newOpportunities,
      conflicts,
      recommendations,
      summary: {
        totalScheduled: scheduledJobs.length,
        totalAvailable: availableJobs.length,
        newOpportunities: newOpportunities.length,
        conflicts: conflicts.length
      }
    };
  }

  /**
   * Generate smart recommendations
   */
  private generateRecommendations(
    scheduledJobs: any[],
    newOpportunities: any[],
    recommendations: string[]
  ): void {
    if (newOpportunities.length === 0) {
      recommendations.push("No new opportunities available");
      return;
    }

    // Identify high-priority opportunities
    const highPriorityCount = newOpportunities.filter((job) => {
      const positionType = job.positionType?.title || "";
      const position = job.position || "";
      return (
        positionType.toLowerCase().includes("teacher") ||
        position.toLowerCase().includes("math") ||
        position.toLowerCase().includes("science")
      );
    }).length;

    if (highPriorityCount > 0) {
      recommendations.push(
        `🌟 ${highPriorityCount} high-priority Teacher/Math/Science position(s) available`
      );
    }

    // Identify long-term vs short-term
    const longTermCount = newOpportunities.filter((job) => {
      const start = this.parseDate(job.startDate || job.date);
      const end = this.parseDate(job.endDate || job.date);
      if (!start || !end) return false;
      const duration = Math.ceil(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );
      return duration > 7;
    }).length;

    if (longTermCount > 0) {
      recommendations.push(`📅 ${longTermCount} long-term contract(s)`);
    }

    // Identify buildings with multiple opportunities
    const buildingCounts: { [key: number]: number } = {};
    for (const job of newOpportunities) {
      const buildingId = this.getBuildingId(job);
      if (buildingId) {
        buildingCounts[buildingId] = (buildingCounts[buildingId] || 0) + 1;
      }
    }

    const buildingsWithMultiple = Object.entries(buildingCounts).filter(
      ([_, count]) => count > 1
    ).length;

    if (buildingsWithMultiple > 0) {
      recommendations.push(
        `🏢 Multiple opportunities at ${buildingsWithMultiple} building(s)`
      );
    }

    // Suggest scheduling
    if (newOpportunities.length > 0 && scheduledJobs.length < 5) {
      recommendations.push(
        `💡 Consider accepting some of these opportunities to increase your schedule`
      );
    }

    if (newOpportunities.length > 5) {
      recommendations.push(
        `📊 You have plenty of opportunities to choose from - be selective!`
      );
    }
  }

  /**
   * Get summary statistics
   */
  public getSummaryStats(result: ComparisonResult): string {
    const { summary } = result;
    const parts = [
      `📊 Job Comparison Summary:`,
      `   Scheduled Jobs: ${summary.totalScheduled}`,
      `   Available Jobs: ${summary.totalAvailable}`,
      `   New Opportunities: ${summary.newOpportunities} ✅`,
      `   Potential Conflicts: ${summary.conflicts} ⚠️`
    ];

    return parts.join("\n");
  }
}

export default JobComparisonModule;
