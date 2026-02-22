/**
 * JobPreferencesManager
 * Manages user preferences for job filtering
 * 
 * Allows specifying:
 * - Preferred job titles/positions
 * - Preferred buildings/locations
 * - Preferred schedule types
 * - Exclude titles/buildings
 * - Minimum/maximum hour requirements
 */

export interface JobPreferences {
  // Include filters (job must match at least one if specified)
  preferredPositionTypes?: string[]; // e.g., ["Teacher", "Math"] - filters by positionType.title
  preferredBuildings?: string[]; // e.g., ["High School", "Elementary"]
  preferredBuildingIds?: (string | number)[]; // e.g., [1, 2, 3] - building IDs
  preferredScheduleTypes?: string[]; // e.g., ["FULL_DAY", "HALF_DAY"]
  
  // Exclude filters (job will be rejected if matches any)
  excludePositionTypes?: string[]; // e.g., ["Aide", "Para"] - exclude by positionType.title
  excludeBuildings?: string[]; // e.g., ["Charter School"]
  excludeBuildingIds?: (string | number)[]; // e.g., [10, 11] - exclude by building ID
  
  // Job type filters
  includeLongTerm?: boolean; // Include long-term jobs (default: true)
  includeShortTerm?: boolean; // Include short-term jobs (default: true)
  
  // Other preferences
  onlyMultipleDays?: boolean; // Only show jobs that span multiple days
  minDays?: number; // Minimum number of days for contract
  maxDays?: number; // Maximum number of days for contract
}

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

class JobPreferencesManager {
  private preferences: JobPreferences = {};

  constructor(preferences?: JobPreferences) {
    if (preferences) {
      this.preferences = preferences;
    }
  }

  /**
   * Set preferences
   */
  public setPreferences(preferences: JobPreferences): void {
    this.preferences = preferences;
  }

  /**
   * Get current preferences
   */
  public getPreferences(): JobPreferences {
    return this.preferences;
  }

  /**
   * Check if a job passes all filters
   */
  public filterJob(job: any): FilterResult {
    // Check exclude filters first (reject immediately)
    if (this.preferences.excludePositionTypes && this.preferences.excludePositionTypes.length > 0) {
      const positionType = job.positionType?.title || job.position?.title || '';
      for (const excludeType of this.preferences.excludePositionTypes) {
        if (positionType.toLowerCase().includes(excludeType.toLowerCase())) {
          return {
            passed: false,
            reason: `Excluded position type: "${excludeType}" found in "${positionType}"`
          };
        }
      }
    }

    if (this.preferences.excludeBuildings && this.preferences.excludeBuildings.length > 0) {
      const buildingName = job.schedules?.[0]?.building?.name || '';
      for (const excludeBuilding of this.preferences.excludeBuildings) {
        if (buildingName.toLowerCase().includes(excludeBuilding.toLowerCase())) {
          return {
            passed: false,
            reason: `Excluded building: "${excludeBuilding}" found in "${buildingName}"`
          };
        }
      }
    }

    if (this.preferences.excludeBuildingIds && this.preferences.excludeBuildingIds.length > 0) {
      const buildingId = job.schedules?.[0]?.building?.id;
      if (buildingId && this.preferences.excludeBuildingIds.includes(buildingId)) {
        return {
          passed: false,
          reason: `Excluded building ID: ${buildingId}`
        };
      }
    }

    // Check job type filters (long-term vs short-term)
    if (this.preferences.includeLongTerm !== undefined || this.preferences.includeShortTerm !== undefined) {
      const isLongTerm = job.longTerm === true;
      const includeLongTerm = this.preferences.includeLongTerm !== false; // default true
      const includeShortTerm = this.preferences.includeShortTerm !== false; // default true

      if (isLongTerm && !includeLongTerm) {
        return {
          passed: false,
          reason: `Long-term jobs are excluded from your preferences`
        };
      }

      if (!isLongTerm && !includeShortTerm) {
        return {
          passed: false,
          reason: `Short-term jobs are excluded from your preferences`
        };
      }
    }

    // Check include filters (must match at least one if specified)
    if (this.preferences.preferredPositionTypes && this.preferences.preferredPositionTypes.length > 0) {
      let positionMatches = false;
      const positionType = job.positionType?.title || job.position?.title || '';
      for (const preferredType of this.preferences.preferredPositionTypes) {
        if (positionType.toLowerCase().includes(preferredType.toLowerCase())) {
          positionMatches = true;
          break;
        }
      }
      if (!positionMatches) {
        return {
          passed: false,
          reason: `Position type "${positionType}" doesn't match preferences: ${this.preferences.preferredPositionTypes.join(', ')}`
        };
      }
    }

    if (this.preferences.preferredBuildings && this.preferences.preferredBuildings.length > 0) {
      let buildingMatches = false;
      const buildingName = job.schedules?.[0]?.building?.name || '';
      for (const preferredBuilding of this.preferences.preferredBuildings) {
        if (buildingName.toLowerCase().includes(preferredBuilding.toLowerCase())) {
          buildingMatches = true;
          break;
        }
      }
      if (!buildingMatches) {
        return {
          passed: false,
          reason: `Building "${buildingName}" doesn't match preferences: ${this.preferences.preferredBuildings.join(', ')}`
        };
      }
    }

    if (this.preferences.preferredBuildingIds && this.preferences.preferredBuildingIds.length > 0) {
      const buildingId = job.schedules?.[0]?.building?.id;
      if (!buildingId || !this.preferences.preferredBuildingIds.includes(buildingId)) {
        return {
          passed: false,
          reason: `Building ID ${buildingId} doesn't match preferred IDs: ${this.preferences.preferredBuildingIds.join(', ')}`
        };
      }
    }

    if (this.preferences.preferredScheduleTypes && this.preferences.preferredScheduleTypes.length > 0) {
      const scheduleType = job.schedules?.[0]?.scheduleType || '';
      if (!this.preferences.preferredScheduleTypes.includes(scheduleType)) {
        return {
          passed: false,
          reason: `Schedule type "${scheduleType}" not in preferred: ${this.preferences.preferredScheduleTypes.join(', ')}`
        };
      }
    }

    // Check duration constraints
    if (this.preferences.onlyMultipleDays) {
      const startDate = new Date(job.date);
      const endDate = new Date(job.endDate || job.date);
      const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      if (durationDays < 2) {
        return {
          passed: false,
          reason: `Single-day job (only multiple-day jobs preferred)`
        };
      }
    }

    if (this.preferences.minDays && this.preferences.minDays > 0) {
      const startDate = new Date(job.date);
      const endDate = new Date(job.endDate || job.date);
      const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      if (durationDays < this.preferences.minDays) {
        return {
          passed: false,
          reason: `Duration ${durationDays} days is less than minimum ${this.preferences.minDays}`
        };
      }
    }

    if (this.preferences.maxDays && this.preferences.maxDays > 0) {
      const startDate = new Date(job.date);
      const endDate = new Date(job.endDate || job.date);
      const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      if (durationDays > this.preferences.maxDays) {
        return {
          passed: false,
          reason: `Duration ${durationDays} days exceeds maximum ${this.preferences.maxDays}`
        };
      }
    }

    return { passed: true };
  }

  /**
   * Filter an array of jobs
   */
  public filterJobs(jobs: any[]): { passed: any[]; filtered: Array<{ job: any; reason: string }> } {
    const passed: any[] = [];
    const filtered: Array<{ job: any; reason: string }> = [];

    for (const job of jobs) {
      const result = this.filterJob(job);
      if (result.passed) {
        passed.push(job);
      } else {
        filtered.push({ job, reason: result.reason || 'Unknown reason' });
      }
    }

    return { passed, filtered };
  }

  /**
   * Get summary of current filters
   */
  public getSummary(): string {
    const parts: string[] = [];

    if (this.preferences.preferredPositionTypes?.length) {
      parts.push(`✓ Preferred position types: ${this.preferences.preferredPositionTypes.join(', ')}`);
    }
    if (this.preferences.preferredBuildings?.length) {
      parts.push(`✓ Preferred buildings: ${this.preferences.preferredBuildings.join(', ')}`);
    }
    if (this.preferences.preferredBuildingIds?.length) {
      parts.push(`✓ Preferred building IDs: ${this.preferences.preferredBuildingIds.join(', ')}`);
    }
    if (this.preferences.preferredScheduleTypes?.length) {
      parts.push(`✓ Preferred schedule types: ${this.preferences.preferredScheduleTypes.join(', ')}`);
    }
    if (this.preferences.excludePositionTypes?.length) {
      parts.push(`✗ Exclude position types: ${this.preferences.excludePositionTypes.join(', ')}`);
    }
    if (this.preferences.excludeBuildings?.length) {
      parts.push(`✗ Exclude buildings: ${this.preferences.excludeBuildings.join(', ')}`);
    }
    if (this.preferences.excludeBuildingIds?.length) {
      parts.push(`✗ Exclude building IDs: ${this.preferences.excludeBuildingIds.join(', ')}`);
    }
    
    // Job type filters
    if (this.preferences.includeLongTerm !== undefined || this.preferences.includeShortTerm !== undefined) {
      const includeLongTerm = this.preferences.includeLongTerm !== false;
      const includeShortTerm = this.preferences.includeShortTerm !== false;
      
      if (includeLongTerm && includeShortTerm) {
        parts.push(`✓ Job types: Both long-term and short-term`);
      } else if (includeLongTerm) {
        parts.push(`✓ Job types: Long-term only`);
      } else if (includeShortTerm) {
        parts.push(`✓ Job types: Short-term only`);
      }
    }
    
    if (this.preferences.onlyMultipleDays) {
      parts.push(`✓ Only multiple-day contracts`);
    }
    if (this.preferences.minDays) {
      parts.push(`✓ Minimum ${this.preferences.minDays} days`);
    }
    if (this.preferences.maxDays) {
      parts.push(`✓ Maximum ${this.preferences.maxDays} days`);
    }

    return parts.length > 0 ? parts.join('\n') : 'No filters configured';
  }
}

export default JobPreferencesManager;
