export type WidgetType = 'clock' | 'weather.weekly' | 'calendar.agenda' | 'tasks.list';
export type WidgetVariant = 'focus' | 'standard' | 'compact' | 'horizontal' | 'vertical';
export type Orientation = 'any' | 'wide' | 'tall' | 'square';

export type WidgetRequest = {
  id: string;
  type: WidgetType;
  title?: string;
  preferred_variant?: WidgetVariant;
  priority?: number;
};

export type VariantDefinition = {
  name: WidgetVariant;
  minWidth: number;
  minHeight: number;
  orientation: Orientation;
  score: number;
};

export type WidgetDefinition = {
  type: WidgetType;
  focus: boolean;
  variants: VariantDefinition[];
};

export type Cell = { x: number; y: number; width: number; height: number };
export type PlacedWidget = { request: WidgetRequest; variant: WidgetVariant; cell: Cell };
export type DisplayPage = { id: string; widgets: PlacedWidget[] };

const variant = (name: WidgetVariant, minWidth: number, minHeight: number, orientation: Orientation, score: number): VariantDefinition => ({ name, minWidth, minHeight, orientation, score });

// This registry is the widget x variant matrix. Adding a widget means adding its
// capabilities here and its render functions in main.ts; packing remains generic.
export const widgetRegistry: Record<WidgetType, WidgetDefinition> = {
  clock: {
    type: 'clock', focus: true,
    variants: [variant('focus', 1000, 700, 'any', 100), variant('horizontal', 780, 300, 'wide', 75), variant('vertical', 430, 680, 'tall', 70), variant('standard', 650, 480, 'any', 65), variant('compact', 420, 300, 'any', 40)]
  },
  'weather.weekly': {
    type: 'weather.weekly', focus: true,
    variants: [variant('focus', 1300, 760, 'wide', 100), variant('horizontal', 900, 400, 'wide', 80), variant('vertical', 560, 720, 'tall', 72), variant('standard', 720, 520, 'any', 65), variant('compact', 430, 330, 'any', 40)]
  },
  'calendar.agenda': {
    type: 'calendar.agenda', focus: true,
    variants: [variant('focus', 1100, 720, 'any', 100), variant('vertical', 560, 720, 'tall', 80), variant('horizontal', 850, 400, 'wide', 72), variant('standard', 680, 520, 'any', 65), variant('compact', 430, 330, 'any', 40)]
  },
  'tasks.list': {
    type: 'tasks.list', focus: true,
    variants: [variant('focus', 1000, 700, 'any', 100), variant('vertical', 520, 700, 'tall', 80), variant('horizontal', 800, 380, 'wide', 72), variant('standard', 640, 500, 'any', 65), variant('compact', 420, 320, 'any', 40)]
  }
};

const templates: Cell[][] = [
  [{ x: 0, y: 0, width: 1, height: 1 }],
  [{ x: 0, y: 0, width: .5, height: 1 }, { x: .5, y: 0, width: .5, height: 1 }],
  [{ x: 0, y: 0, width: 1, height: .5 }, { x: 0, y: .5, width: 1, height: .5 }],
  [{ x: 0, y: 0, width: .58, height: 1 }, { x: .58, y: 0, width: .42, height: .5 }, { x: .58, y: .5, width: .42, height: .5 }],
  [{ x: 0, y: 0, width: 1 / 3, height: 1 }, { x: 1 / 3, y: 0, width: 1 / 3, height: 1 }, { x: 2 / 3, y: 0, width: 1 / 3, height: 1 }],
  [{ x: 0, y: 0, width: .5, height: .5 }, { x: .5, y: 0, width: .5, height: .5 }, { x: 0, y: .5, width: .5, height: .5 }, { x: .5, y: .5, width: .5, height: .5 }]
];

function orientationScore(orientation: Orientation, width: number, height: number) {
  if (orientation === 'any') return 8;
  const ratio = width / height;
  if (orientation === 'wide') return ratio >= 1.45 ? 20 : -15;
  if (orientation === 'tall') return ratio <= .95 ? 20 : -15;
  return ratio >= .8 && ratio <= 1.25 ? 20 : -10;
}

export function selectVariant(request: WidgetRequest, width: number, height: number, focus = false) {
  const definition = widgetRegistry[request.type];
  const choices = definition.variants.filter(item => item.minWidth <= width && item.minHeight <= height && (!focus || item.name === 'focus'));
  if (!choices.length) return null;
  return [...choices].sort((a, b) => {
    const preferredA = request.preferred_variant === a.name ? 35 : 0;
    const preferredB = request.preferred_variant === b.name ? 35 : 0;
    return (b.score + preferredB + orientationScore(b.orientation, width, height)) - (a.score + preferredA + orientationScore(a.orientation, width, height));
  })[0];
}

function placeWithTemplate(requests: WidgetRequest[], template: Cell[], width: number, height: number) {
  const sorted = [...requests].sort((a, b) => (b.priority || 50) - (a.priority || 50));
  const placed: PlacedWidget[] = [];
  let score = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const normalized = template[index];
    const cell = { x: normalized.x * width, y: normalized.y * height, width: normalized.width * width, height: normalized.height * height };
    const selected = selectVariant(sorted[index], cell.width, cell.height);
    if (!selected) return null;
    score += selected.score + orientationScore(selected.orientation, cell.width, cell.height) + (sorted[index].priority || 50) * normalized.width * normalized.height / 10;
    placed.push({ request: sorted[index], variant: selected.name, cell });
  }
  return { placed, score };
}

function bestLayout(requests: WidgetRequest[], width: number, height: number): { placed: PlacedWidget[]; score: number } | null {
  const candidates = templates.filter(template => template.length === requests.length)
    .map(template => placeWithTemplate(requests, template, width, height))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}

export function buildPages(requests: WidgetRequest[], width = 1920, height = 1080): DisplayPage[] {
  const remaining = [...requests];
  const pages: DisplayPage[] = [];
  while (remaining.length) {
    let chosen: ReturnType<typeof bestLayout> = null;
    let count = Math.min(4, remaining.length);
    while (count > 0 && !chosen) {
      chosen = bestLayout(remaining.slice(0, count), width, height);
      if (!chosen) count -= 1;
    }
    if (!chosen) throw new Error(`No readable layout for widget ${remaining[0].type}`);
    const pageWidgets = remaining.splice(0, count);
    const ids = pageWidgets.map(item => item.id).sort().join('--');
    pages.push({ id: `page-${ids}`, widgets: chosen.placed });
  }
  return pages;
}
