export interface AcceptanceCriterion {
  id: string;
  text: string;
  checked: boolean;
  sourceLine?: number | undefined;
}

export interface ParsedSpecForPlanning {
  featureId: string;
  title: string;
  status?: string | undefined;
  originalRequest: string;
  goal: string;
  nonGoals: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  constraints: string[];
  assumptions: string[];
  verificationExpectations: string[];
  riskNotes: string[];
  clarifyingQuestions: string[];
  notes: string[];
  raw: string;
}

const PLACEHOLDER_CRITERIA: AcceptanceCriterion[] = [
  { id: "AC1", text: "Define the primary observable outcome.", checked: false },
  { id: "AC2", text: "Define important constraints or edge cases.", checked: false },
  { id: "AC3", text: "Define verification expectations.", checked: false },
];

export function parseSpecForPlanning(
  markdown: string,
  fallback: { featureId: string; title: string },
): ParsedSpecForPlanning {
  const raw = markdown;

  const { featureId, title } = parseHeading(markdown, fallback);

  const statusMatch = /\*\*Status:\*\*\s*(\S+)/i.exec(markdown);
  const status = statusMatch ? statusMatch[1] : undefined;

  const originalRequest = extractMarkdownSection(markdown, "Original Request").trim();
  const goal = extractMarkdownSection(markdown, "Goal").trim() || title;
  const nonGoals = extractListItems(extractMarkdownSection(markdown, "Non-Goals"));
  const acSection = extractMarkdownSection(markdown, "Acceptance Criteria");
  const acceptanceCriteria = extractAcceptanceCriteria(acSection);
  const constraints = extractListItems(extractMarkdownSection(markdown, "Constraints"));
  const assumptions = extractListItems(extractMarkdownSection(markdown, "Assumptions"));
  const verificationExpectations = extractListItems(
    extractMarkdownSection(markdown, "Verification Expectations"),
  );
  const riskNotes = extractListItems(extractMarkdownSection(markdown, "Risk Notes"));
  const clarifyingQuestions = extractListItems(
    extractMarkdownSection(markdown, "Clarifying Questions"),
  );
  const notes = extractListItems(extractMarkdownSection(markdown, "Notes"));

  return {
    featureId,
    title,
    status,
    originalRequest,
    goal,
    nonGoals,
    acceptanceCriteria,
    constraints,
    assumptions,
    verificationExpectations,
    riskNotes,
    clarifyingQuestions,
    notes,
    raw,
  };
}

export function extractMarkdownSection(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const lowerHeading = heading.toLowerCase();
  let capturing = false;
  const sectionLines: string[] = [];
  let sectionLevel = 0;

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!.trim().toLowerCase();

      if (capturing) {
        if (level <= sectionLevel) break;
      }

      if (!capturing && text === lowerHeading) {
        capturing = true;
        sectionLevel = level;
        continue;
      }
    }

    if (capturing) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join("\n");
}

export function extractListItems(section: string): string[] {
  const items: string[] = [];
  const lines = section.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("_") && trimmed.endsWith("_")) continue;
    if (trimmed.startsWith("<!--")) continue;

    const bulletMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bulletMatch) {
      const text = bulletMatch[1]!.trim();
      if (text && !isPlaceholderText(text)) {
        items.push(text);
      }
    }
  }

  return items;
}

export function extractAcceptanceCriteria(section: string): AcceptanceCriterion[] {
  const criteria: AcceptanceCriterion[] = [];
  const lines = section.split("\n");
  let nextAcNum = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("_") && trimmed.endsWith("_")) continue;
    if (trimmed.startsWith("<!--")) continue;

    const checkboxMatch = /^-\s+\[([ xX])\]\s+(.+)$/.exec(trimmed);
    if (checkboxMatch) {
      const checked = checkboxMatch[1] !== " ";
      const text = checkboxMatch[2]!.trim();
      const { id, remainder } = extractAcId(text, nextAcNum);
      if (!isPlaceholderText(remainder)) {
        criteria.push({ id, text: remainder, checked, sourceLine: i + 1 });
        nextAcNum = bumpAcNum(id, nextAcNum);
      }
      continue;
    }

    const acLabelMatch = /^(?:-\s+)?(AC\d+):\s*(.+)$/.exec(trimmed);
    if (acLabelMatch) {
      const id = acLabelMatch[1]!;
      const text = acLabelMatch[2]!.trim();
      if (!isPlaceholderText(text)) {
        criteria.push({ id, text, checked: false, sourceLine: i + 1 });
        nextAcNum = bumpAcNum(id, nextAcNum);
      }
      continue;
    }

    const bulletMatch = /^-\s+(.+)$/.exec(trimmed);
    if (bulletMatch) {
      const text = bulletMatch[1]!.trim();
      if (!isPlaceholderText(text)) {
        const id = `AC${nextAcNum}`;
        criteria.push({ id, text, checked: false, sourceLine: i + 1 });
        nextAcNum++;
      }
    }
  }

  return criteria;
}

export function ensureAcceptanceCriteria(
  spec: ParsedSpecForPlanning,
): AcceptanceCriterion[] {
  if (spec.acceptanceCriteria.length > 0) return spec.acceptanceCriteria;
  return [...PLACEHOLDER_CRITERIA];
}

function parseHeading(
  markdown: string,
  fallback: { featureId: string; title: string },
): { featureId: string; title: string } {
  const lines = markdown.split("\n");
  for (const line of lines) {
    const m = /^#\s+(F\d{3,})\s+(.+)$/.exec(line.trim());
    if (m) return { featureId: m[1]!, title: m[2]!.trim() };

    const specMatch = /^#\s+Spec:\s+(F\d{3,})\s*[—–-]\s*(.+)$/.exec(line.trim());
    if (specMatch) return { featureId: specMatch[1]!, title: specMatch[2]!.trim() };

    const titleOnly = /^#\s+(.+)$/.exec(line.trim());
    if (titleOnly) {
      const text = titleOnly[1]!.trim();
      const idInText = /^(F\d{3,})\b/.exec(text);
      if (idInText) {
        const rest = text.slice(idInText[0].length).replace(/^[\s—–-]+/, "").trim();
        return { featureId: idInText[1]!, title: rest || fallback.title };
      }
    }
  }
  return fallback;
}

function extractAcId(text: string, fallbackNum: number): { id: string; remainder: string } {
  const m = /^(AC\d+):\s*(.*)$/.exec(text);
  if (m) return { id: m[1]!, remainder: m[2]!.trim() || text };
  return { id: `AC${fallbackNum}`, remainder: text };
}

function bumpAcNum(id: string, current: number): number {
  const m = /^AC(\d+)$/.exec(id);
  if (!m) return current + 1;
  const num = parseInt(m[1]!, 10);
  return Math.max(current, num) + 1;
}

function isPlaceholderText(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.startsWith("define the first observable")) return true;
  if (lower.startsWith("define important constraints")) return true;
  if (lower.startsWith("define verification expectations")) return true;
  if (lower.startsWith("define what this feature")) return true;
  if (lower.startsWith("who interacts")) return true;
  if (lower.startsWith("technical, business")) return true;
  if (lower.startsWith("what this feature assumes")) return true;
  if (lower.startsWith("how should verification")) return true;
  if (lower.startsWith("none identified")) return true;
  if (lower.startsWith("open questions")) return true;
  if (lower.startsWith("additional context")) return true;
  return false;
}
