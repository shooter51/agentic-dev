/**
 * Per-gate quality gate override stored in project.config JSON.
 * When severity is 'advisory', failing this gate logs a warning but does not
 * block the pipeline transition. Defaults to mandatory if not specified.
 */
export interface QualityGateOverride {
  severity: 'mandatory' | 'advisory';
}

/**
 * Typed representation of the JSON stored in project.config.
 * All fields are optional; defaults are applied by the pipeline at runtime.
 */
export interface ProjectConfig {
  /** Map of gate name to override settings */
  qualityGates?: Record<string, QualityGateOverride>;
  /** Custom sensitive file patterns (regex strings) to override the default list */
  sensitivePatterns?: string[];
}

export interface Project {
  id: string;
  name: string;
  /** Absolute path to the target repository on disk */
  path: string;
  /** JSON-serialised ProjectConfig */
  config: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input shape when registering a new project */
export interface NewProject {
  name: string;
  path: string;
  config?: string | null;
}
