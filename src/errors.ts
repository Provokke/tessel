export type PathSegment = string | number;
export type Path = readonly PathSegment[];

export type IssueCode =
  | 'invalid_type'
  | 'too_small'
  | 'too_big'
  | 'invalid_format'
  | 'invalid_literal'
  | 'invalid_enum'
  | 'invalid_union'
  | 'unrecognised_keys'
  | 'custom';

export interface Issue {
  readonly path: Path;
  readonly code: IssueCode;
  readonly message: string;
  readonly unionIssues?: readonly (readonly Issue[])[];
}

export function formatPath(path: Path): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out === '' ? segment : `.${segment}`;
  }
  return out;
}

export class TesselError extends Error {
  readonly issues: readonly Issue[];

  constructor(issues: readonly Issue[]) {
    super(TesselError.describe(issues));
    this.name = 'TesselError';
    this.issues = issues;
  }

  private static describe(issues: readonly Issue[]): string {
    return issues.map((issue) => (issue.path.length > 0 ? `${formatPath(issue.path)}: ${issue.message}` : issue.message)).join('; ');
  }

  flatten(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const issue of this.issues) {
      const key = formatPath(issue.path);
      (out[key] ??= []).push(issue.message);
    }
    return out;
  }
}

export type Result<T> = { readonly success: true; readonly data: T } | { readonly success: false; readonly error: TesselError };
