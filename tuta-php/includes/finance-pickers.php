<?php
/**
 * The two dropdowns every spend form shares: the category tree (headings
 * with their lines) and the cost centres ("for which"). One place, so the
 * Expenses page, the Petty Cash book and the importer can never drift apart.
 *
 *   $tree = financeCategoryTree($sb, $sid);           // ['all','byId','headings','children','label']
 *   echo financeCategoryOptions($tree, $selectedId, $displayName);
 *   $centres = financeCentres($sb, $sid);             // active centres, ['id','name','type']
 *   echo financeCentreOptions($centres, $selectedId, 'For which… (optional)');
 */

/** Categories as a two-level tree. A line whose parent is missing counts as a heading. */
function financeCategoryTree(Supabase $sb, string $sid, string $cols = 'id,name,description,parent_category_id'): array
{
    $all = $sb->from('expense_categories')->select($cols)->eq('school_id', $sid)->order('name')->execute()['data'] ?? [];
    $byId = []; foreach ($all as $c) $byId[$c['id']] = $c;
    $headings = array_values(array_filter($all, fn($c) => empty($c['parent_category_id']) || !isset($byId[$c['parent_category_id']])));
    $children = [];
    foreach ($all as $c) if (!empty($c['parent_category_id']) && isset($byId[$c['parent_category_id']])) $children[$c['parent_category_id']][] = $c;
    $label = function (string $id) use ($byId): string {
        $c = $byId[$id] ?? null; if (!$c) return '—';
        $p = !empty($c['parent_category_id']) ? ($byId[$c['parent_category_id']] ?? null) : null;
        return ($p ? $p['name'] . ' › ' : '') . $c['name'];
    };
    return ['all' => $all, 'byId' => $byId, 'headings' => $headings, 'children' => $children, 'label' => $label];
}

/**
 * <option>s grouped by heading; the heading itself is selectable as "(general)".
 * $display maps a category row to the text shown (Title Case on one page, raw on another).
 * $first is an optional leading option, e.g. '— skip these lines —'.
 */
function financeCategoryOptions(array $tree, string $selected = '', ?callable $display = null, string $first = ''): string
{
    $name = $display ?? fn(array $c) => $c['name'];
    $opt = fn(array $c, string $suffix = '') => '<option value="' . e($c['id']) . '"' . ($selected === $c['id'] ? ' selected' : '') . '>' . e($name($c)) . $suffix . '</option>';
    $o = $first !== '' ? '<option value="">' . e($first) . '</option>' : '';
    foreach ($tree['headings'] as $h) {
        $kids = $tree['children'][$h['id']] ?? [];
        if (!$kids) { $o .= $opt($h); continue; }
        $o .= '<optgroup label="' . e($name($h)) . '">' . $opt($h, ' (general)');
        foreach ($kids as $k) $o .= $opt($k);
        $o .= '</optgroup>';
    }
    return $o;
}

/** Active cost centres, ordered by type then name. Empty (not an error) before migration 140. */
function financeCentres(Supabase $sb, string $sid): array
{
    $r = $sb->from('cost_centres')->select('id,name,type')->eq('school_id', $sid)->eq('is_active', 'true')->order('type')->order('name')->execute();
    return $r['data'] ?? [];
}

/** <option>s for the "for which" box; each carries data-type so fuel fields can show for a bus. */
function financeCentreOptions(array $centres, string $selected = '', string $first = '— none —'): string
{
    $o = '<option value="">' . e($first) . '</option>';
    foreach ($centres as $c) $o .= '<option value="' . e($c['id']) . '" data-type="' . e($c['type']) . '"' . ($selected === $c['id'] ? ' selected' : '') . '>' . e($c['name']) . '</option>';
    return $o;
}
